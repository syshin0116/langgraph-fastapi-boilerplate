"""Threads API routes — matching LangGraph Platform."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from core.agent.utils import get_message_text
from core.db import DB
from core.schemas import (
    ThreadCreate,
    ThreadResponse,
    ThreadSearch,
    ThreadStateUpdate,
    ThreadUpdate,
)

from backend.deps import get_checkpointer, get_db, resolve_graph

router = APIRouter(prefix="/threads", tags=["threads"])


def _to_response(row: dict) -> ThreadResponse:
    return ThreadResponse(
        thread_id=str(row["thread_id"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        metadata=row["metadata"],
        status=row["status"],
        values=row.get("values"),
        interrupts=row.get("interrupts"),
    )


@router.post("", response_model=ThreadResponse)
async def create_thread(
    body: ThreadCreate,
    db: Annotated[DB, Depends(get_db)],
):
    row = await db.create_thread(
        thread_id=body.thread_id,
        metadata=body.metadata,
        if_exists=body.if_exists,
    )
    return _to_response(row)


@router.get("/{thread_id}", response_model=ThreadResponse)
async def get_thread(
    thread_id: str,
    db: Annotated[DB, Depends(get_db)],
):
    row = await db.get_thread(thread_id)
    if not row:
        raise HTTPException(status_code=404, detail="Thread not found")
    return _to_response(row)


@router.patch("/{thread_id}", response_model=ThreadResponse)
async def update_thread(
    thread_id: str,
    body: ThreadUpdate,
    db: Annotated[DB, Depends(get_db)],
):
    row = await db.update_thread(thread_id, metadata=body.metadata)
    if not row:
        raise HTTPException(status_code=404, detail="Thread not found")
    return _to_response(row)


@router.delete("/{thread_id}")
async def delete_thread(
    thread_id: str,
    db: Annotated[DB, Depends(get_db)],
):
    await db.delete_thread(thread_id)
    return {"ok": True}


@router.post("/search", response_model=list[ThreadResponse])
async def search_threads(
    body: ThreadSearch,
    db: Annotated[DB, Depends(get_db)],
):
    rows = await db.search_threads(
        metadata=body.metadata,
        status=body.status,
        limit=body.limit,
        offset=body.offset,
    )
    return [_to_response(r) for r in rows]


@router.get("/{thread_id}/state")
async def get_thread_state(
    thread_id: str,
    checkpointer: Annotated[AsyncPostgresSaver, Depends(get_checkpointer)],
    db: Annotated[DB, Depends(get_db)],
):
    row = await db.get_thread(thread_id)
    if not row:
        raise HTTPException(status_code=404, detail="Thread not found")

    config = {"configurable": {"thread_id": thread_id}}
    checkpoint_tuple = await checkpointer.aget_tuple(config)

    if not checkpoint_tuple:
        return {"thread_id": thread_id, "values": {}, "next": [], "checkpoint": None}

    checkpoint = checkpoint_tuple.checkpoint
    values = checkpoint.get("channel_values", {})

    return {
        "thread_id": thread_id,
        "values": _serialize_state_values(values),
        "next": list({w[0] for w in checkpoint_tuple.pending_writes})
        if checkpoint_tuple.pending_writes
        else [],
        "checkpoint": {
            "thread_id": thread_id,
            "checkpoint_ns": checkpoint_tuple.config["configurable"].get(
                "checkpoint_ns", ""
            ),
            "checkpoint_id": checkpoint_tuple.config["configurable"].get(
                "checkpoint_id"
            ),
        },
        "created_at": checkpoint.get("ts"),
        "metadata": checkpoint.get("metadata", {}),
    }


@router.post("/{thread_id}/state")
async def update_thread_state(
    thread_id: str,
    body: ThreadStateUpdate,
    checkpointer: Annotated[AsyncPostgresSaver, Depends(get_checkpointer)],
    db: Annotated[DB, Depends(get_db)],
    graph=Depends(resolve_graph),
):
    row = await db.get_thread(thread_id)
    if not row:
        raise HTTPException(status_code=404, detail="Thread not found")

    config: dict[str, Any] = {"configurable": {"thread_id": thread_id}}
    if body.checkpoint_id:
        config["configurable"]["checkpoint_id"] = body.checkpoint_id

    result = await graph.aupdate_state(config, body.values, as_node=body.as_node)
    return {"checkpoint": result}


@router.post("/{thread_id}/history")
async def get_thread_history(
    thread_id: str,
    checkpointer: Annotated[AsyncPostgresSaver, Depends(get_checkpointer)],
    db: Annotated[DB, Depends(get_db)],
    limit: int = 10,
):
    row = await db.get_thread(thread_id)
    if not row:
        raise HTTPException(status_code=404, detail="Thread not found")

    config = {"configurable": {"thread_id": thread_id}}
    history = []
    count = 0

    async for ct in checkpointer.alist(config):
        if count >= limit:
            break
        checkpoint = ct.checkpoint
        history.append(
            {
                "values": _serialize_state_values(
                    checkpoint.get("channel_values", {})
                ),
                "next": [],
                "checkpoint": {
                    "thread_id": thread_id,
                    "checkpoint_ns": ct.config["configurable"].get(
                        "checkpoint_ns", ""
                    ),
                    "checkpoint_id": ct.config["configurable"].get("checkpoint_id"),
                },
                "created_at": checkpoint.get("ts"),
                "metadata": checkpoint.get("metadata", {}),
            }
        )
        count += 1

    return history


def _serialize_state_values(values: dict) -> dict:
    result = {}
    for k, v in values.items():
        if isinstance(v, list):
            result[k] = [_serialize_message(m) if hasattr(m, "type") else m for m in v]
        elif hasattr(v, "model_dump"):
            result[k] = v.model_dump()
        else:
            result[k] = v
    return result


def _serialize_message(msg: Any) -> dict:
    if hasattr(msg, "model_dump"):
        return msg.model_dump()
    if hasattr(msg, "dict"):
        return msg.dict()
    return {
        "type": getattr(msg, "type", "unknown"),
        "content": get_message_text(msg) if hasattr(msg, "content") else str(msg),
    }
