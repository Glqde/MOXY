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
import asyncio
import json

import redis.asyncio as aioredis
import socketio
import structlog

from app.core.config import settings
from app.core.redis import get_redis, redis_ssl_options

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


# ── Removing a user from a group room ─────────────────────────────────────────
# A process can only move sockets it holds itself, so removals are published
# on a Redis channel and every API process applies them to its own sockets.
# Without this, someone kicked from a group would keep receiving its events
# until they reconnected.

ROOM_LEAVE_CHANNEL = "moxy:room-leave"


async def drop_user_from_group_room(user_id, group_id) -> None:
    try:
        await get_redis().publish(
            ROOM_LEAVE_CHANNEL, json.dumps({"user_id": str(user_id), "group_id": str(group_id)})
        )
    except Exception:
        logger.exception("ws.room_leave.publish_failed", user_id=str(user_id), group_id=str(group_id))


async def _leave_locally(user_id: str, group_id: str) -> None:
    for participant in list(sio.manager.get_participants("/", f"user:{user_id}")):
        sid = participant[0] if isinstance(participant, tuple) else participant
        await sio.leave_room(sid, f"group:{group_id}")


async def room_leave_listener() -> None:
    """Runs for the lifetime of each API process (started in main.lifespan)."""
    while True:
        try:
            client = aioredis.from_url(
                settings.REDIS_URL, decode_responses=True, **redis_ssl_options(settings.REDIS_URL)
            )
            pubsub = client.pubsub()
            await pubsub.subscribe(ROOM_LEAVE_CHANNEL)
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                data = json.loads(message["data"])
                await _leave_locally(data["user_id"], data["group_id"])
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("ws.room_leave.listener_failed")
            await asyncio.sleep(5)  # Redis blip — resubscribe
