"""
app/core/realtime.py
Shared Socket.IO server.

Uses Socket.IO's AsyncRedisManager, so an emit from any API process reaches
clients connected to every other process. Services call emit_group_event()
after their transaction commits, so clients never refetch stale data.

Room naming:
  - group:<group_id>  — all members of a group
  - user:<user_id>    — personal channel (notifications)
"""
import socketio
import structlog

from app.core.config import settings
from app.core.redis import redis_ssl_options

logger = structlog.get_logger(__name__)

sio = socketio.AsyncServer(
    async_mode="asgi",
    client_manager=socketio.AsyncRedisManager(
        settings.REDIS_URL,
        redis_options=redis_ssl_options(settings.REDIS_URL),
    ),
    cors_allowed_origins=settings.cors_origins,
    logger=False,
    engineio_logger=False,
    ping_timeout=60,
    ping_interval=25,
)


async def emit_group_event(group_id, event: dict) -> None:
    """Best-effort broadcast — a Redis hiccup must never fail the request."""
    try:
        await sio.emit(event["event"], event, room=f"group:{group_id}")
    except Exception:
        logger.exception("ws.emit.failed", group_id=str(group_id), event=event.get("event"))


async def emit_user_event(user_id, event: dict) -> None:
    try:
        await sio.emit(event["event"], event, room=f"user:{user_id}")
    except Exception:
        logger.exception("ws.emit.failed", user_id=str(user_id), event=event.get("event"))
