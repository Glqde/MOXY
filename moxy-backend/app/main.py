"""
app/main.py
"""
import secrets
import time
from contextlib import asynccontextmanager

import structlog
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import init_redis, close_redis, check_rate_limit, get_redis
from app.db.session import get_db
from app.api.v1.routes import tasks, groups, users, notifications
from app.api.v1.routes.websocket import mount_socketio

logger = structlog.get_logger(__name__)


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

    yield

    await close_redis()
    logger.info("moxy.shutdown")


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
    async def request_logging_middleware(request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "http.request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=round(duration_ms, 2),
        )
        return response

    @app.middleware("http")
    async def rate_limit_middleware(request: Request, call_next):
        if request.url.path in ("/health", "/docs", "/redoc", "/openapi.json","/internal/reset-due-tasks"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        key = f"ratelimit:{client_ip}"

        try:
            redis = get_redis()
            allowed = await check_rate_limit(
                redis, key,
                limit=settings.RATE_LIMIT_PER_MINUTE,
                window_seconds=60,
            )
            if not allowed:
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={"detail": "Rate limit exceeded. Please slow down."},
                    headers={"Retry-After": "60"},
                )
        except Exception:
            pass

        return await call_next(request)

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
            redis = get_redis()
            await redis.ping()
            return {"redis": "ok"}
        except Exception as e:
            return JSONResponse(status_code=503, content={"redis": "unavailable", "error": str(e)})

    @app.post("/internal/reset-due-tasks", tags=["internal"])
    async def trigger_reset_due_tasks(
        request: Request,
        db: AsyncSession = Depends(get_db),
        redis=Depends(get_redis),
    ):
        """
        Replaces Celery Beat in production, since Beat doesn't run on
        Render's free tier. Point an external cron (e.g. cron-job.org,
        same setup as the /health keep-warm ping) at this every minute
        with the X-Internal-Secret header set to INTERNAL_CRON_SECRET.
        """
        provided = request.headers.get("X-Internal-Secret", "")
        if not settings.INTERNAL_CRON_SECRET or not secrets.compare_digest(
            provided, settings.INTERNAL_CRON_SECRET
        ):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing secret")

        from app.services.task_service import run_due_task_resets
        result = await run_due_task_resets(db, redis)
        logger.info("internal.reset_due_tasks", **result)
        return result

    api_prefix = "/api/v1"
    app.include_router(users.router, prefix=api_prefix)
    app.include_router(groups.router, prefix=api_prefix)
    app.include_router(tasks.router, prefix=api_prefix)
    app.include_router(notifications.router, prefix=api_prefix)

    mount_socketio(app)

    return app


app = create_app()