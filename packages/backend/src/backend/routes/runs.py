"""Runs API routes — matching LangGraph Platform."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from core.db import DB
from core.schemas import RunCreate, RunResponse

from backend.deps import get_db, get_run_manager
from backend.run_manager import RunConflictError, RunManager

router = APIRouter(tags=["runs"])


def _to_response(row: dict) -> RunResponse:
    return RunResponse(
        run_id=str(row["run_id"]),
        thread_id=str(row["thread_id"]),
        assistant_id=str(row["assistant_id"]) if row.get("assistant_id") else None,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        status=row["status"],
        metadata=row["metadata"],
        multitask_strategy=row.get("multitask_strategy"),
    )


async def _ensure_thread(db: DB, thread_id: str, if_not_exists: str | None = None):
    row = await db.get_thread(thread_id)
    if not row:
        if if_not_exists == "reject":
            raise HTTPException(status_code=404, detail="Thread not found")
        await db.create_thread(thread_id=thread_id)


async def _get_assistant_config(db: DB, assistant_id: str | None) -> dict | None:
    if not assistant_id:
        return None
    assistant = await db.get_assistant(assistant_id)
    if not assistant:
        raise HTTPException(
            status_code=404, detail=f"Assistant {assistant_id} not found"
        )
    return assistant.get("config")


# =============================================================================
# Stateful runs (with thread_id)
# =============================================================================


@router.post("/threads/{thread_id}/runs", response_model=RunResponse)
async def create_run(
    thread_id: str,
    body: RunCreate,
    db: Annotated[DB, Depends(get_db)],
    run_manager: Annotated[RunManager, Depends(get_run_manager)],
):
    await _ensure_thread(db, thread_id, body.if_not_exists)
    assistant_config = await _get_assistant_config(db, body.assistant_id)
    try:
        row = await run_manager.create_background_run(
            thread_id,
            run_input=body.input,
            command=body.command,
            config=body.config,
            assistant_id=body.assistant_id,
            assistant_config=assistant_config,
            metadata=body.metadata,
            multitask_strategy=body.multitask_strategy,
            interrupt_before=body.interrupt_before,
            interrupt_after=body.interrupt_after,
            webhook=body.webhook,
        )
    except RunConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _to_response(row)


@router.post("/threads/{thread_id}/runs/stream")
async def stream_run(
    thread_id: str,
    body: RunCreate,
    db: Annotated[DB, Depends(get_db)],
    run_manager: Annotated[RunManager, Depends(get_run_manager)],
):
    await _ensure_thread(db, thread_id, body.if_not_exists)
    assistant_config = await _get_assistant_config(db, body.assistant_id)
    try:
        event_gen = run_manager.stream_run(
            thread_id,
            run_input=body.input,
            command=body.command,
            config=body.config,
            assistant_id=body.assistant_id,
            assistant_config=assistant_config,
            metadata=body.metadata,
            stream_mode=body.stream_mode or "values",
            multitask_strategy=body.multitask_strategy,
            interrupt_before=body.interrupt_before,
            interrupt_after=body.interrupt_after,
            on_disconnect=body.on_disconnect,
        )
    except RunConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return EventSourceResponse(event_gen)


@router.post("/threads/{thread_id}/runs/wait")
async def wait_run(
    thread_id: str,
    body: RunCreate,
    db: Annotated[DB, Depends(get_db)],
    run_manager: Annotated[RunManager, Depends(get_run_manager)],
):
    await _ensure_thread(db, thread_id, body.if_not_exists)
    assistant_config = await _get_assistant_config(db, body.assistant_id)
    try:
        result = await run_manager.wait_run(
            thread_id,
            run_input=body.input,
            command=body.command,
            config=body.config,
            assistant_id=body.assistant_id,
            assistant_config=assistant_config,
            metadata=body.metadata,
            multitask_strategy=body.multitask_strategy,
            interrupt_before=body.interrupt_before,
            interrupt_after=body.interrupt_after,
        )
    except RunConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return result


@router.get("/threads/{thread_id}/runs", response_model=list[RunResponse])
async def list_runs(
    thread_id: str,
    db: Annotated[DB, Depends(get_db)],
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: str | None = None,
):
    rows = await db.list_runs(thread_id, limit=limit, offset=offset, status=status)
    return [_to_response(r) for r in rows]


@router.get("/threads/{thread_id}/runs/{run_id}", response_model=RunResponse)
async def get_run(
    thread_id: str,
    run_id: str,
    db: Annotated[DB, Depends(get_db)],
):
    row = await db.get_run(thread_id, run_id)
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    return _to_response(row)


@router.post("/threads/{thread_id}/runs/{run_id}/cancel")
async def cancel_run(
    thread_id: str,
    run_id: str,
    run_manager: Annotated[RunManager, Depends(get_run_manager)],
):
    await run_manager.cancel_run(thread_id, run_id)
    return {"ok": True}


@router.get("/threads/{thread_id}/runs/{run_id}/join")
async def join_run(
    thread_id: str,
    run_id: str,
    run_manager: Annotated[RunManager, Depends(get_run_manager)],
):
    result = await run_manager.join_run(thread_id, run_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Run not found or no state")
    return result


@router.delete("/threads/{thread_id}/runs/{run_id}")
async def delete_run(
    thread_id: str,
    run_id: str,
    db: Annotated[DB, Depends(get_db)],
):
    await db.delete_run(thread_id, run_id)
    return {"ok": True}


# =============================================================================
# Stateless runs (ephemeral thread)
# =============================================================================


@router.post("/runs/stream")
async def stateless_stream_run(
    body: RunCreate,
    db: Annotated[DB, Depends(get_db)],
    run_manager: Annotated[RunManager, Depends(get_run_manager)],
):
    thread_id = str(uuid.uuid4())
    await db.create_thread(thread_id=thread_id)
    assistant_config = await _get_assistant_config(db, body.assistant_id)
    event_gen = run_manager.stream_run(
        thread_id,
        run_input=body.input,
        command=body.command,
        config=body.config,
        assistant_id=body.assistant_id,
        assistant_config=assistant_config,
        metadata=body.metadata,
        stream_mode=body.stream_mode or "values",
        interrupt_before=body.interrupt_before,
        interrupt_after=body.interrupt_after,
    )
    return EventSourceResponse(event_gen)


@router.post("/runs", response_model=RunResponse)
async def stateless_create_run(
    body: RunCreate,
    db: Annotated[DB, Depends(get_db)],
    run_manager: Annotated[RunManager, Depends(get_run_manager)],
):
    thread_id = str(uuid.uuid4())
    await db.create_thread(thread_id=thread_id)
    assistant_config = await _get_assistant_config(db, body.assistant_id)
    row = await run_manager.create_background_run(
        thread_id,
        run_input=body.input,
        command=body.command,
        config=body.config,
        assistant_id=body.assistant_id,
        assistant_config=assistant_config,
        metadata=body.metadata,
        multitask_strategy=body.multitask_strategy,
        interrupt_before=body.interrupt_before,
        interrupt_after=body.interrupt_after,
    )
    return _to_response(row)


@router.post("/runs/wait")
async def stateless_wait_run(
    body: RunCreate,
    db: Annotated[DB, Depends(get_db)],
    run_manager: Annotated[RunManager, Depends(get_run_manager)],
):
    thread_id = str(uuid.uuid4())
    await db.create_thread(thread_id=thread_id)
    assistant_config = await _get_assistant_config(db, body.assistant_id)
    result = await run_manager.wait_run(
        thread_id,
        run_input=body.input,
        command=body.command,
        config=body.config,
        assistant_id=body.assistant_id,
        assistant_config=assistant_config,
        metadata=body.metadata,
        interrupt_before=body.interrupt_before,
        interrupt_after=body.interrupt_after,
    )
    return result
