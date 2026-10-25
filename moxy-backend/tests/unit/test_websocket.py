"""
tests/unit/test_websocket.py
Socket.IO connection handling.
"""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.v1.routes import websocket


@pytest.mark.asyncio
async def test_connect_authenticates_and_joins_group_rooms():
    user_id = str(uuid.uuid4())
    group_id = str(uuid.uuid4())
    sio = MagicMock()
    sio.save_session = AsyncMock()
    sio.enter_room = AsyncMock()
    sio.emit = AsyncMock()
    sio.rooms = MagicMock(return_value=["sid1", f"user:{user_id}", f"group:{group_id}"])

    with patch.object(websocket, "sio", sio), \
         patch("app.core.auth.decode_supabase_jwt", AsyncMock(return_value={"sub": user_id})), \
         patch.object(websocket, "_user_group_ids", AsyncMock(return_value=[group_id])), \
         patch.object(websocket, "_display_name", AsyncMock(return_value="Asha")), \
         patch.object(websocket, "add_connection", AsyncMock()), \
         patch.object(websocket, "get_redis", MagicMock()):
        result = await websocket.connect("sid1", {}, {"token": "jwt"})

    assert result is None  # None = accept
    sio.save_session.assert_awaited_once_with("sid1", {"user_id": user_id, "name": "Asha"})
    rooms = [c.args[1] for c in sio.enter_room.await_args_list]
    assert rooms == [f"user:{user_id}", f"group:{group_id}"]
    # presence goes to the group room, not back to the connecting socket
    assert sio.emit.await_args.kwargs == {"room": f"group:{group_id}", "skip_sid": "sid1"}


@pytest.mark.asyncio
async def test_connect_rejects_missing_or_bad_token():
    from fastapi import HTTPException

    assert await websocket.connect("sid1", {}, {}) is False
    with patch("app.core.auth.decode_supabase_jwt", AsyncMock(side_effect=HTTPException(401))):
        assert await websocket.connect("sid1", {}, {"token": "bad"}) is False
