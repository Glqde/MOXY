"""
app/main.py
"""
import asyncio
import secrets
import time
from contextlib import asynccontextmanager, suppress

import structlog
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DataError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import configure_logging
from app.core.redis import init_redis, close_redis, check_rate_limit, get_redis
from app.db.session import get_db, get_db_context
from app.api.v1.routes import activity, chat, tasks, groups, users, notifications
from app.api.v1.routes.websocket import wrap_with_socketio
from app.core.realtime import room_leave_listener
from app.services.task_service import run_due_task_resets

configure_logging()
logger = structlog.get_logger(__name__)

RATE_LIMIT_EXEMPT = ("/health", "/docs", "/redoc", "/openapi.json", "/internal/reset-due-tasks")


async def _scheduler_loop() -> None:
    """Resets due tasks every SCHEDULER_INTERVAL_SECONDS (replaces Celery Beat)."""
    while True:
        try:
            async with get_db_context() as db:
                result = await run_due_task_resets(db)
            if result["reset"] or result["errors"]:
                logger.info("scheduler.reset_due_tasks", **result)
        except Exception:
            logger.exception("scheduler.reset_due_tasks.failed")
        await asyncio.sleep(settings.SCHEDULER_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("moxy.startup", env=settings.APP_ENV, version=settings.APP_VERSION)

    await init_redis()
    logger.info("redis.connected", url=settings.REDIS_URL.split("@")[-1])

    if not settings.is_production:
        from app.db.session import engine
        from app.models.base import Base
        from app.models import models  # noqa
        async with engine.begin() as conn:
            await conn.run_sync(lambda conn: Base.metadata.create_all(conn, checkfirst=True))
        logger.info("db.tables.created", env="development")

    scheduler = asyncio.create_task(_scheduler_loop()) if settings.ENABLE_SCHEDULER else None
    room_leaves = asyncio.create_task(room_leave_listener())

    yield

    for task in (scheduler, room_leaves):
        if task:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
    await close_redis()
    logger.info("moxy.shutdown")


def _client_ip(request: Request) -> str:
    # Behind Render/Vercel the socket peer is the proxy; the real client is
    # the first X-Forwarded-For entry
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def create_app() -> FastAPI:
    app = FastAPI(
        title="MOXY API",
        description="Shared task synchronization — production API",
        version=settings.APP_VERSION,
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def rate_limit_and_log_middleware(request: Request, call_next):
        start = time.perf_counter()

        if request.method != "OPTIONS" and request.url.path not in RATE_LIMIT_EXEMPT:
            try:
                allowed = await check_rate_limit(
                    get_redis(),
                    f"ratelimit:{_client_ip(request)}",
                    limit=settings.RATE_LIMIT_PER_MINUTE,
                    window_seconds=60,
                )
            except Exception:
                allowed = True  # fail open if Redis is down
            if not allowed:
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={"detail": "Rate limit exceeded. Please slow down."},
                    headers={"Retry-After": "60"},
                )

        try:
            response = await call_next(request)
        except DataError as exc:
            # Input the database can't store (bad characters, too long). The
            # schemas should catch these first; this keeps any gap a 400
            logger.warning("db.data_error", path=request.url.path, error=str(exc.orig))
            response = JSONResponse(status_code=400, content={"detail": "Some of that input couldn't be saved"})
        except Exception as exc:
            # Handled here, inside CORSMiddleware: Starlette's outermost error
            # handler answers without CORS headers, which browsers report as
            # an opaque "Network Error" instead of the server's message
            logger.error("unhandled.exception", path=request.url.path, error=str(exc), exc_info=True)
            response = JSONResponse(status_code=500, content={"detail": "An internal error occurred"})
        logger.info(
            "http.request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=round((time.perf_counter() - start) * 1000, 2),
        )
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        logger.error("unhandled.exception", path=request.url.path, error=str(exc), exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "An internal error occurred"},
        )

    @app.get("/health", tags=["health"])
    async def health_check():
        return {
            "status": "ok",
            "version": settings.APP_VERSION,
            "env": settings.APP_ENV,
        }

    @app.get("/health/redis", tags=["health"])
    async def redis_health():
        try:
            await get_redis().ping()
            return {"redis": "ok"}
        except Exception as e:
            return JSONResponse(status_code=503, content={"redis": "unavailable", "error": str(e)})

    @app.post("/internal/reset-due-tasks", tags=["internal"])
    async def trigger_reset_due_tasks(
        request: Request,
        db: AsyncSession = Depends(get_db),
    ):
        """
        Same reset the in-process scheduler runs every minute. Point an
        external cron (e.g. cron-job.org) here with the X-Internal-Secret
        header set to INTERNAL_CRON_SECRET — it also keeps Render's free
        tier awake so the scheduler keeps running.
        """
        provided = request.headers.get("X-Internal-Secret", "")
        if not settings.INTERNAL_CRON_SECRET or not secrets.compare_digest(
            provided, settings.INTERNAL_CRON_SECRET
        ):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing secret")

        result = await run_due_task_resets(db)
        logger.info("internal.reset_due_tasks", **result)
        return result

    api_prefix = "/api/v1"
    app.include_router(users.router, prefix=api_prefix)
    app.include_router(groups.router, prefix=api_prefix)
    app.include_router(tasks.router, prefix=api_prefix)
    app.include_router(notifications.router, prefix=api_prefix)
    app.include_router(activity.router, prefix=api_prefix)
    app.include_router(chat.router, prefix=api_prefix)

    return app


fastapi_app = create_app()
app = wrap_with_socketio(fastapi_app)
