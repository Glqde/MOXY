"""
app/api/v1/routes/websocket.py
Socket.IO connection lifecycle + client events.

Architecture:
  - Clients connect via Socket.IO with their Supabase JWT in auth.token
  - On connect the server joins the socket to user:<id> and every group:<id>
    room the user belongs to (one query), so clients don't have to ask
  - Cross-process fan-out is handled by AsyncRedisManager (app/core/realtime.py)

Events emitted to clients:
  - task_completed / task_completion_undone / task_reset
  - member_presence   — member came online / went offline
  - notification      — personal notification
"""
import uuid

import socketio
import structlog
from fastapi import FastAPI
from sqlalchemy import select

from app.core.realtime import sio
from app.core.redis import add_connection, get_redis, remove_connection, set_user_online

logger = structlog.get_logger(__name__)


async def _user_group_ids(user_id: uuid.UUID, group_id: uuid.UUID | None = None) -> list[str]:
    from app.db.session import AsyncSessionLocal
    from app.models.models import GroupMember

    q = select(GroupMember.group_id).where(GroupMember.user_id == user_id)
    if group_id is not None:
        q = q.where(GroupMember.group_id == group_id)
    async with AsyncSessionLocal() as db:
        result = await db.execute(q)
        return [str(gid) for gid in result.scalars().all()]


async def _broadcast_presence(sid: str, user_id: str, online: bool) -> None:
    for room in sio.rooms(sid):
        if room.startswith("group:"):
            await sio.emit(
                "member_presence",
                {"event": "member_presence", "user_id": user_id, "online": online},
                room=room,
                skip_sid=sid,
            )


# ── Connection lifecycle ──────────────────────────────────────────────────────

@sio.event
async def connect(sid: str, environ: dict, auth: dict):
    from app.core.auth import decode_supabase_jwt

    token = (auth or {}).get("token")
    if not token:
        logger.warning("ws.connect.rejected", sid=sid, reason="missing token")
        return False

    try:
        payload = await decode_supabase_jwt(token)
        user_id = str(uuid.UUID(payload["sub"]))
    except Exception:
        logger.warning("ws.connect.rejected", sid=sid, reason="invalid token")
        return False

    await sio.save_session(sid, {"user_id": user_id})
    await sio.enter_room(sid, f"user:{user_id}")
    for gid in await _user_group_ids(uuid.UUID(user_id)):
        await sio.enter_room(sid, f"group:{gid}")

    try:
        await add_connection(get_redis(), user_id)
    except Exception:
        logger.exception("ws.presence.failed", user_id=user_id)

    await _broadcast_presence(sid, user_id, online=True)
    logger.info("ws.connected", sid=sid, user_id=user_id)


@sio.event
async def disconnect(sid: str, *args):
    session = await sio.get_session(sid)
    user_id = session.get("user_id") if session else None
    if not user_id:
        return
    try:
        went_offline = await remove_connection(get_redis(), user_id)
    except Exception:
        went_offline = False
    if went_offline:
        await _broadcast_presence(sid, user_id, online=False)
    logger.info("ws.disconnected", sid=sid, user_id=user_id)


# ── Client → Server events ────────────────────────────────────────────────────

@sio.event
async def join_group(sid: str, data: dict):
    """Joins a room for a group the user joined after connecting."""
    session = await sio.get_session(sid)
    user_id = session.get("user_id") if session else None
    group_id = (data or {}).get("group_id")
    if not user_id or not group_id:
        return

    room = f"group:{group_id}"
    if room in sio.rooms(sid):
        return  # already joined on connect — skip the DB round trip

    try:
        is_member = bool(await _user_group_ids(uuid.UUID(user_id), uuid.UUID(group_id)))
    except ValueError:
        is_member = False
    if not is_member:
        await sio.emit("error", {"message": "Not a member of this group"}, to=sid)
        return

    await sio.enter_room(sid, room)
    await sio.emit(
        "member_presence",
        {"event": "member_presence", "user_id": user_id, "online": True},
        room=room,
        skip_sid=sid,
    )


@sio.event
async def leave_group(sid: str, data: dict):
    group_id = (data or {}).get("group_id")
    if group_id:
        await sio.leave_room(sid, f"group:{group_id}")


@sio.event
async def heartbeat(sid: str, data: dict):
    """Client sends heartbeat every 30s to maintain online presence."""
    session = await sio.get_session(sid)
    if session and session.get("user_id"):
        await set_user_online(get_redis(), session["user_id"])


def wrap_with_socketio(app: FastAPI) -> socketio.ASGIApp:
    """
    Serves Socket.IO at /ws/socket.io and passes everything else (including
    lifespan events) through to FastAPI.
    """
    return socketio.ASGIApp(sio, other_asgi_app=app, socketio_path="/ws/socket.io")
