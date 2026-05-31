"""
app/api/v1/routes/users.py
"""
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import (
    FriendRequestAction, FriendRequestCreate, FriendRequestRead,
    UserPublic, UserRead, UserUpdateRequest,
)
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserRead)
async def update_me(
    payload: UserUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = UserService(db)
    updated = await svc.update(current_user.id, **payload.model_dump(exclude_unset=True))
    return updated


@router.get("/search", response_model=List[UserPublic])
async def search_users(
    q: str = Query(min_length=2, max_length=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = UserService(db)
    users = await svc.search(q)
    # Exclude self from search results
    return [u for u in users if u.id != current_user.id]


@router.get("/friends", response_model=List[UserPublic])
async def list_friends(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = UserService(db)
    return await svc.get_friends(current_user.id)


@router.post("/friends/requests", response_model=FriendRequestRead, status_code=201)
async def send_friend_request(
    payload: FriendRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.receiver_id == current_user.id:
        raise HTTPException(400, "Cannot send a friend request to yourself")
    svc = UserService(db)
    return await svc.send_friend_request(current_user.id, payload.receiver_id, payload.message)


@router.patch("/friends/requests/{request_id}", response_model=FriendRequestRead)
async def respond_to_request(
    request_id: uuid.UUID,
    payload: FriendRequestAction,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = UserService(db)
    return await svc.respond_to_friend_request(request_id, current_user.id, payload.action)
