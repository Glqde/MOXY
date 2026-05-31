"""
app/api/v1/routes/websocket.py
Socket.IO server + Redis Pub/Sub bridge.

Architecture:
  - Clients connect via Socket.IO (handles reconnection, rooms, namespaces)
  - Server maintains a background Redis subscriber per process
  - When a Redis Pub/Sub message arrives, it's forwarded to the correct
    Socket.IO room (group:<group_id> or user:<user_id>)

Room naming:
  - group:<group_id>  — all members of a group
  - user:<user_id>    — personal channel (notifications, presence)

Events emitted to clients:
  - task_completed    — someone completed a shared task
  - task_reset        — task recurrence period reset (ready again)
  - member_joined     — new member joined the group
  - member_online     — member presence update
  - notification      — personal notification
"""
import asyncio
import json
import uuid
from typing import Dict, Set

import socketio
import structlog
from fastapi import FastAPI

from app.core.config import settings
from app.core.redis import get_redis, set_user_online, set_user_offline

logger = structlog.get_logger(__name__)

# ── Socket.IO server ──────────────────────────────────────────────────────────
# async_mode="asgi" integrates with FastAPI/Starlette
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=settings.cors_origins,
    logger=False,
    engineio_logger=False,
    ping_timeout=60,
    ping_interval=25,
)

# Track which user_id maps to which socket sid(s)
# One user can have multiple connections (tabs/devices)
_user_sids: Dict[str, Set[str]] = {}   # user_id -> {sid, ...}
_sid_user: Dict[str, str] = {}          # sid -> user_id


# ── Connection lifecycle ──────────────────────────────────────────────────────

@sio.event
async def connect(sid: str, environ: dict, auth: dict):
    """
    Called when a client connects. Expects auth.token (Supabase JWT).
    Validates the token and associates the socket with the authenticated user.
    """
    from app.core.auth import _decode_supabase_jwt
    from app.db.session import AsyncSessionLocal
    from app.services.user_service import UserService

    token = (auth or {}).get("token")
    if not token:
        logger.warning("ws.connect.rejected", sid=sid, reason="missing token")
        return False  # reject connection

    try:
        payload = _decode_supabase_jwt(token)
        user_id = payload.get("sub")
        if not user_id:
            return False
    except Exception:
        return False

    # Register session
    _sid_user[sid] = user_id
    if user_id not in _user_sids:
        _user_sids[user_id] = set()
    _user_sids[user_id].add(sid)

    # Join personal room
    await sio.enter_room(sid, f"user:{user_id}")

    # Mark online in Redis
    redis = get_redis()
    await set_user_online(redis, user_id)

    logger.info("ws.connected", sid=sid, user_id=user_id)


@sio.event
async def disconnect(sid: str):
    user_id = _sid_user.pop(sid, None)
    if user_id:
        _user_sids.get(user_id, set()).discard(sid)
        # Only mark offline if no other connections remain
        if not _user_sids.get(user_id):
            redis = get_redis()
            await set_user_offline(redis, user_id)
            # Broadcast offline status to groups
            await sio.emit(
                "member_presence",
                {"user_id": user_id, "online": False},
                room=f"user_groups:{user_id}",  # simplified — extend as needed
            )
    logger.info("ws.disconnected", sid=sid, user_id=user_id)


# ── Client → Server events ────────────────────────────────────────────────────

@sio.event
async def join_group(sid: str, data: dict):
    """Client joins a group room to receive task updates."""
    group_id = data.get("group_id")
    user_id = _sid_user.get(sid)

    if not group_id or not user_id:
        return

    # Verify membership before allowing room join
    from app.db.session import AsyncSessionLocal
    from app.services.group_service import GroupService
    async with AsyncSessionLocal() as db:
        svc = GroupService(db)
        membership = await svc.get_membership(uuid.UUID(group_id), uuid.UUID(user_id))
        if not membership:
            await sio.emit("error", {"message": "Not a member of this group"}, to=sid)
            return

    await sio.enter_room(sid, f"group:{group_id}")
    logger.info("ws.join_group", sid=sid, group_id=group_id)

    # Notify others in the group that this member is online
    await sio.emit(
        "member_presence",
        {"user_id": user_id, "online": True},
        room=f"group:{group_id}",
        skip_sid=sid,
    )


@sio.event
async def leave_group(sid: str, data: dict):
    group_id = data.get("group_id")
    if group_id:
        await sio.leave_room(sid, f"group:{group_id}")


@sio.event
async def heartbeat(sid: str, data: dict):
    """Client sends heartbeat every 30s to maintain online presence."""
    user_id = _sid_user.get(sid)
    if user_id:
        redis = get_redis()
        await set_user_online(redis, user_id)


# ── Redis → WebSocket bridge ──────────────────────────────────────────────────

async def redis_pubsub_listener():
    """
    Background task that subscribes to all group and user channels in Redis.
    Forwards messages to the correct Socket.IO rooms.

    This runs as a single background coroutine per process — it's the bridge
    between the FastAPI/Celery world (Redis) and the WebSocket world (Socket.IO).

    Pattern subscription "group:*" and "user:*" means we pick up all group
    and user channels without needing to manage subscriptions individually.
    """
    import redis.asyncio as aioredis

    redis = aioredis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
    )
    pubsub = redis.pubsub()

    # Subscribe to all group and user channels via pattern matching
    await pubsub.psubscribe("group:*", "user:*")
    logger.info("redis.pubsub.listening", patterns=["group:*", "user:*"])

    async for message in pubsub.listen():
        if message["type"] not in ("pmessage", "message"):
            continue

        channel: str = message.get("channel", "")
        try:
            event_data = json.loads(message["data"])
        except (json.JSONDecodeError, TypeError):
            continue

        event_type = event_data.get("event")
        if not event_type:
            continue

        # Forward to the appropriate Socket.IO room
        # channel format: "group:<uuid>" or "user:<uuid>"
        await sio.emit(event_type, event_data, room=channel)

        logger.debug(
            "ws.event.forwarded",
            channel=channel,
            event=event_type,
        )


def mount_socketio(app: FastAPI) -> None:
    """
    Mount the Socket.IO ASGI app onto FastAPI at /ws.
    Also registers the Redis Pub/Sub listener as a startup task.
    """
    socket_app = socketio.ASGIApp(sio, socketio_path="/ws/socket.io")
    app.mount("/ws", socket_app)

    @app.on_event("startup")
    async def start_pubsub():
        asyncio.create_task(redis_pubsub_listener())
        logger.info("redis.pubsub.task.started")
