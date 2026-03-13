"""Run manager — asyncio-based background task execution.

Default implementation uses asyncio.Task (no Redis dependency).
To scale out with Redis + ARQ, swap this with ArqRunManager (see docstring below).

Architecture:
    Web request → RunManager.create_background_run() → asyncio.Task
    Web request → RunManager.stream_run()             → graph.astream() inline
    Web request → RunManager.wait_run()               → graph.ainvoke() inline

To migrate to ARQ:
    1. pip install arq redis
    2. Replace RunManager with ArqRunManager
    3. Run worker: arq worker.WorkerSettings
    4. Stream results flow through Redis pub/sub
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from typing import Any, AsyncIterator

from langchain_core.messages import AIMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph.state import CompiledStateGraph

from core.db import DB

logger = logging.getLogger(__name__)


class RunConflictError(Exception):
    """Raised when a run conflicts with multitask strategy."""

    pass


class RunManager:
    """Manages run lifecycle with asyncio tasks (no Redis required)."""

    def __init__(
        self,
        db: DB,
        checkpointer: AsyncPostgresSaver,
        graphs: dict[str, CompiledStateGraph],
    ):
        self.db = db
        self.checkpointer = checkpointer
        self.graphs = graphs
        self._active_tasks: dict[str, asyncio.Task] = {}  # run_id → Task
        self._thread_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    def _get_graph(self, graph_id: str = "agent") -> CompiledStateGraph:
        graph = self.graphs.get(graph_id)
        if not graph:
            raise ValueError(f"Unknown graph_id: {graph_id}")
        return graph

    def _build_config(
        self,
        thread_id: str,
        *,
        assistant_config: dict | None = None,
        run_config: dict | None = None,
        checkpoint_id: str | None = None,
    ) -> dict[str, Any]:
        """Build the LangGraph config dict."""
        configurable: dict[str, Any] = {"thread_id": thread_id}

        if assistant_config:
            configurable.update(assistant_config.get("configurable", {}))
        if run_config:
            configurable.update(run_config.get("configurable", {}))
        if checkpoint_id:
            configurable["checkpoint_id"] = checkpoint_id

        return {"configurable": configurable}

    async def _handle_multitask(self, thread_id: str, strategy: str) -> None:
        """Handle multitask strategy before starting a new run."""
        active_run = await self.db.get_active_run_for_thread(thread_id)
        if not active_run:
            return

        run_id = str(active_run["run_id"])

        if strategy == "reject":
            raise RunConflictError(
                f"Thread {thread_id} already has an active run {run_id}"
            )
        elif strategy in ("interrupt", "rollback"):
            await self.cancel_run(thread_id, run_id)
        # enqueue: handled naturally by asyncio.Lock per thread

    # ---- Background run ----

    async def create_background_run(
        self,
        thread_id: str,
        *,
        graph_id: str = "agent",
        run_input: dict | None = None,
        command: dict | None = None,
        config: dict | None = None,
        assistant_id: str | None = None,
        assistant_config: dict | None = None,
        metadata: dict | None = None,
        multitask_strategy: str = "reject",
        interrupt_before: list[str] | str | None = None,
        interrupt_after: list[str] | str | None = None,
        webhook: str | None = None,
    ) -> dict[str, Any]:
        """Create a background run — executes in asyncio.Task."""
        if multitask_strategy != "enqueue":
            await self._handle_multitask(thread_id, multitask_strategy)

        run_record = await self.db.create_run(
            thread_id=thread_id,
            assistant_id=assistant_id,
            input=run_input,
            command=command,
            config=config,
            metadata=metadata,
            kwargs={
                "interrupt_before": interrupt_before,
                "interrupt_after": interrupt_after,
                "webhook": webhook,
                "graph_id": graph_id,
            },
            multitask_strategy=multitask_strategy,
            status="pending",
        )

        run_id = str(run_record["run_id"])

        task = asyncio.create_task(
            self._execute_run(
                run_id,
                thread_id,
                graph_id=graph_id,
                run_input=run_input,
                command=command,
                config=config,
                assistant_config=assistant_config,
            )
        )
        self._active_tasks[run_id] = task
        task.add_done_callback(lambda t: self._active_tasks.pop(run_id, None))

        return run_record

    async def _execute_run(
        self,
        run_id: str,
        thread_id: str,
        *,
        graph_id: str = "agent",
        run_input: dict | None = None,
        command: dict | None = None,
        config: dict | None = None,
        assistant_config: dict | None = None,
    ) -> None:
        """Execute a run in the background."""
        graph = self._get_graph(graph_id)
        lg_config = self._build_config(
            thread_id, assistant_config=assistant_config, run_config=config
        )
        graph_input = _resolve_input(run_input, command)

        try:
            await self.db.update_run_status(run_id, "running")
            await self.db.set_thread_status(thread_id, "busy")

            await graph.ainvoke(graph_input, config=lg_config)

            await self.db.update_run_status(run_id, "success")
            await self.db.set_thread_status(thread_id, "idle")
        except asyncio.CancelledError:
            await self.db.update_run_status(run_id, "interrupted")
            await self.db.set_thread_status(thread_id, "interrupted")
        except Exception as e:
            logger.exception("Run %s failed: %s", run_id, e)
            await self.db.update_run_status(run_id, "error")
            await self.db.set_thread_status(thread_id, "error")

    # ---- Stream run ----

    async def stream_run(
        self,
        thread_id: str,
        *,
        graph_id: str = "agent",
        run_input: dict | None = None,
        command: dict | None = None,
        config: dict | None = None,
        assistant_id: str | None = None,
        assistant_config: dict | None = None,
        metadata: dict | None = None,
        stream_mode: list[str] | str = "values",
        multitask_strategy: str = "reject",
        interrupt_before: list[str] | str | None = None,
        interrupt_after: list[str] | str | None = None,
        on_disconnect: str = "cancel",
    ) -> AsyncIterator[dict[str, Any]]:
        """Execute a run and stream results inline (SSE events)."""
        if multitask_strategy != "enqueue":
            await self._handle_multitask(thread_id, multitask_strategy)

        run_record = await self.db.create_run(
            thread_id=thread_id,
            assistant_id=assistant_id,
            input=run_input,
            command=command,
            config=config,
            metadata=metadata,
            multitask_strategy=multitask_strategy,
            status="running",
        )
        run_id = str(run_record["run_id"])
        await self.db.set_thread_status(thread_id, "busy")

        graph = self._get_graph(graph_id)
        lg_config = self._build_config(
            thread_id, assistant_config=assistant_config, run_config=config
        )
        graph_input = _resolve_input(run_input, command)

        # Normalize stream_mode
        modes = [stream_mode] if isinstance(stream_mode, str) else stream_mode

        # Metadata event
        yield {"event": "metadata", "data": json.dumps({"run_id": run_id})}

        try:
            if len(modes) == 1:
                async for chunk in graph.astream(
                    graph_input, config=lg_config, stream_mode=modes[0]
                ):
                    yield _format_stream_event(modes[0], chunk)
            else:
                async for mode, chunk in graph.astream(
                    graph_input, config=lg_config, stream_mode=modes
                ):
                    yield _format_stream_event(mode, chunk)

            await self.db.update_run_status(run_id, "success")
            await self.db.set_thread_status(thread_id, "idle")
        except asyncio.CancelledError:
            await self.db.update_run_status(run_id, "interrupted")
            await self.db.set_thread_status(thread_id, "interrupted")
            raise
        except Exception as e:
            logger.exception("Stream run %s failed: %s", run_id, e)
            await self.db.update_run_status(run_id, "error")
            await self.db.set_thread_status(thread_id, "error")
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

        yield {"event": "end", "data": ""}

    # ---- Wait run ----

    async def wait_run(
        self,
        thread_id: str,
        *,
        graph_id: str = "agent",
        run_input: dict | None = None,
        command: dict | None = None,
        config: dict | None = None,
        assistant_id: str | None = None,
        assistant_config: dict | None = None,
        metadata: dict | None = None,
        multitask_strategy: str = "reject",
        interrupt_before: list[str] | str | None = None,
        interrupt_after: list[str] | str | None = None,
    ) -> dict[str, Any]:
        """Execute a run and wait for the result (synchronous from caller's perspective)."""
        if multitask_strategy != "enqueue":
            await self._handle_multitask(thread_id, multitask_strategy)

        run_record = await self.db.create_run(
            thread_id=thread_id,
            assistant_id=assistant_id,
            input=run_input,
            command=command,
            config=config,
            metadata=metadata,
            multitask_strategy=multitask_strategy,
            status="running",
        )
        run_id = str(run_record["run_id"])
        await self.db.set_thread_status(thread_id, "busy")

        graph = self._get_graph(graph_id)
        lg_config = self._build_config(
            thread_id, assistant_config=assistant_config, run_config=config
        )
        graph_input = _resolve_input(run_input, command)

        try:
            result = await graph.ainvoke(graph_input, config=lg_config)
            await self.db.update_run_status(run_id, "success")
            await self.db.set_thread_status(thread_id, "idle")
            return result
        except asyncio.CancelledError:
            await self.db.update_run_status(run_id, "interrupted")
            await self.db.set_thread_status(thread_id, "interrupted")
            return {"__error__": "Run was cancelled"}
        except Exception as e:
            logger.exception("Wait run %s failed: %s", run_id, e)
            await self.db.update_run_status(run_id, "error")
            await self.db.set_thread_status(thread_id, "error")
            return {"__error__": str(e)}

    # ---- Cancel / Join ----

    async def cancel_run(self, thread_id: str, run_id: str) -> None:
        """Cancel an active run."""
        task = self._active_tasks.get(run_id)
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        await self.db.update_run_status(run_id, "interrupted")
        await self.db.set_thread_status(thread_id, "interrupted")

    async def join_run(self, thread_id: str, run_id: str) -> dict[str, Any] | None:
        """Wait for a background run to complete, return thread state."""
        task = self._active_tasks.get(run_id)
        if task and not task.done():
            await task

        config = {"configurable": {"thread_id": thread_id}}
        snapshot = await self.checkpointer.aget_tuple(config)
        if snapshot:
            return snapshot.checkpoint.get("channel_values", {})
        return None


# ---- Helpers ----


def _resolve_input(run_input: dict | None, command: dict | None) -> Any:
    """Resolve graph input from run_input or command."""
    if command:
        from langgraph.types import Command

        return Command(**command)
    return run_input


def _serialize_value(v: Any) -> Any:
    """Make a value JSON-serializable."""
    if isinstance(v, (str, int, float, bool, type(None))):
        return v
    if isinstance(v, dict):
        return {k: _serialize_value(val) for k, val in v.items()}
    if isinstance(v, (list, tuple)):
        return [_serialize_value(item) for item in v]
    if hasattr(v, "model_dump"):
        return v.model_dump()
    if hasattr(v, "dict"):
        return v.dict()
    return str(v)


def _format_stream_event(mode: str, chunk: Any) -> dict[str, str]:
    """Format a graph stream chunk as an SSE event dict."""
    if mode == "messages" and isinstance(chunk, tuple) and len(chunk) == 2:
        msg, meta = chunk
        data = {"message": _serialize_value(msg), "metadata": _serialize_value(meta)}
        event_name = "messages/partial"
        if isinstance(msg, AIMessage) and not msg.tool_calls:
            if hasattr(msg, "response_metadata") and msg.response_metadata:
                event_name = "messages/complete"
        return {"event": event_name, "data": json.dumps(data, default=str)}

    return {"event": mode, "data": json.dumps(_serialize_value(chunk), default=str)}
