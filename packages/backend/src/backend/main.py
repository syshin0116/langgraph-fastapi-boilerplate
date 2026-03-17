"""FastAPI application entry point — LangGraph Platform-compatible API."""

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool

from core.agent.graph import builder as agent_builder
from core.db import DB

from backend.logging_config import setup_logging
from backend.middleware import RequestLoggingMiddleware
from backend.routes.assistants import router as assistants_router
from backend.routes.crons import router as crons_router
from backend.routes.runs import router as runs_router
from backend.routes.store import router as store_router
from backend.routes.threads import router as threads_router
from backend.run_manager import RunManager

load_dotenv()
setup_logging()

logger = logging.getLogger(__name__)

# Graph registry: graph_id → StateGraph builder
_graphs_registry = {
    "agent": agent_builder,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    database_url = os.environ.get(
        "DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/postgres"
    )

    async with AsyncConnectionPool(
        conninfo=database_url,
        max_size=20,
        kwargs={"autocommit": True, "prepare_threshold": 0},
    ) as pool:
        checkpointer = AsyncPostgresSaver(pool)
        await checkpointer.setup()

        db = DB(pool)
        await db.setup()

        compiled_graphs = {
            gid: builder.compile(name="ReAct Agent", checkpointer=checkpointer)
            for gid, builder in _graphs_registry.items()
        }

        run_manager = RunManager(db, checkpointer, compiled_graphs)

        app.state.checkpointer = checkpointer
        app.state.db = db
        app.state.graphs = compiled_graphs
        app.state.run_manager = run_manager

        logger.info("Application started — graphs: %s", list(compiled_graphs.keys()))
        yield
        logger.info("Application shutting down")


app = FastAPI(title="LangGraph Agent API", lifespan=lifespan)

app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/ok")
async def ok():
    """Health check — matches LangGraph Platform convention."""
    return {"ok": True}


@app.get("/info")
async def info():
    return {"version": "0.1.0", "graphs": list(_graphs_registry.keys())}


app.include_router(assistants_router)
app.include_router(threads_router)
app.include_router(runs_router)
app.include_router(store_router)
app.include_router(crons_router)
