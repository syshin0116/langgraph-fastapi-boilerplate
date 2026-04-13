"""Lease reaper — recovers runs from crashed workers.

Runs as a background task in the web process (ArqRunManager mode only).
Every 15 seconds, finds runs with expired leases and either retries them
(up to 3 times) or marks them as permanently failed.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging

from arq.connections import ArqRedis

from db import DB

logger = logging.getLogger(__name__)

_REAPER_INTERVAL = 15  # seconds between reaper sweeps
_MAX_RETRIES = 3


class LeaseReaper:
    """Background task that detects crashed workers and re-enqueues their runs."""

    def __init__(self, db: DB, arq_pool: ArqRedis):
        self.db = db
        self.arq_pool = arq_pool
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start the reaper loop."""
        self._task = asyncio.create_task(self._run())
        logger.info("Lease reaper started (interval=%ds, max_retries=%d)", _REAPER_INTERVAL, _MAX_RETRIES)

    async def stop(self) -> None:
        """Stop the reaper loop."""
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            logger.info("Lease reaper stopped")

    async def _run(self) -> None:
        """Main reaper loop."""
        while True:
            await asyncio.sleep(_REAPER_INTERVAL)
            try:
                await self._reap()
            except Exception:
                logger.exception("Lease reaper error")

    async def _reap(self) -> None:
        """Find expired leases and handle them."""
        expired = await self.db.find_expired_leases()
        if not expired:
            return

        logger.info("Reaper found %d expired lease(s)", len(expired))

        for run in expired:
            run_id = str(run["run_id"])
            thread_id = str(run["thread_id"])
            new_status = await self.db.reset_run_for_retry(run_id, _MAX_RETRIES)

            if new_status == "pending":
                # Re-enqueue using stored run parameters
                kwargs = run.get("kwargs") or {}
                retry_count = ((run.get("execution_params") or {}).get("retry_count", 0)) + 1
                await self.arq_pool.enqueue_job(
                    "execute_run",
                    run_id,
                    thread_id,
                    graph_id=kwargs.get("graph_id", "agent"),
                    run_input=run.get("input"),
                    command=run.get("command"),
                    config=run.get("config"),
                    stream_mode=kwargs.get("stream_mode"),
                    checkpoint_id=kwargs.get("checkpoint_id"),
                    _job_id=f"{run_id}_retry_{retry_count}",
                )
                logger.info("Re-enqueued run %s (retry #%d)", run_id, retry_count)
            else:
                await self.db.set_thread_status(thread_id, "error")
                logger.warning("Run %s exceeded max retries (%d), marked as error", run_id, _MAX_RETRIES)
