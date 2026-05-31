"""
app/services/user_service.py
User domain logic — thin service layer over the ORM.
All database queries go through here, not directly in routes.
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import Friendship, FriendRequest, FriendRequestStatus, User, UserSettings


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: uuid.UUID) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def upsert(
        self,
        user_id: uuid.UUID,
        email: str,
        full_name: str,
        avatar_url: Optional[str] = None,
    ) -> User:
        """
        Called on every first login. Creates user + default settings.
        On subsequent calls for existing users, updates mutable fields.
        """
        user = await self.get_by_id(user_id)

        if not user:
            user = User(
                id=user_id,
                email=email,
                full_name=full_name,
                avatar_url=avatar_url,
            )
            self.db.add(user)
            await self.db.flush()

            # Create default settings
            settings_row = UserSettings(user_id=user_id)
            self.db.add(settings_row)
            await self.db.flush()
        else:
            # Update mutable profile data from OAuth provider
            user.avatar_url = avatar_url or user.avatar_url
            user.full_name = full_name or user.full_name

        return user

    async def touch_last_seen(self, user_id: uuid.UUID) -> None:
        user = await self.get_by_id(user_id)
        if user:
            user.last_seen_at = datetime.now(timezone.utc)

    async def search(self, query: str, limit: int = 20) -> List[User]:
        """
        Search users by name or email.
        ILIKE for case-insensitive partial match on PostgreSQL.
        """
        pattern = f"%{query}%"
        result = await self.db.execute(
            select(User)
            .where(
                and_(
                    User.is_active == True,
                    or_(
                        User.full_name.ilike(pattern),
                        User.email.ilike(pattern),
                        User.username.ilike(pattern),
                    ),
                )
            )
            .limit(limit)
        )
        return list(result.scalars().all())

    async def update(self, user_id: uuid.UUID, **kwargs) -> Optional[User]:
        user = await self.get_by_id(user_id)
        if not user:
            return None
        for key, value in kwargs.items():
            if value is not None and hasattr(user, key):
                setattr(user, key, value)
        return user

    async def get_friends(self, user_id: uuid.UUID) -> List[User]:
        """
        Return confirmed friends of a user.
        Friendship rows always have user_id_1 < user_id_2 lexicographically.
        """
        result = await self.db.execute(
            select(User).where(
                User.id.in_(
                    select(
                        func.case(
                            (Friendship.user_id_1 == user_id, Friendship.user_id_2),
                            else_=Friendship.user_id_1,
                        )
                    ).where(
                        or_(
                            Friendship.user_id_1 == user_id,
                            Friendship.user_id_2 == user_id,
                        )
                    )
                )
            )
        )
        return list(result.scalars().all())

    async def send_friend_request(
        self, sender_id: uuid.UUID, receiver_id: uuid.UUID, message: Optional[str]
    ) -> FriendRequest:
        # Check for existing request or friendship
        existing = await self.db.execute(
            select(FriendRequest).where(
                or_(
                    and_(
                        FriendRequest.sender_id == sender_id,
                        FriendRequest.receiver_id == receiver_id,
                    ),
                    and_(
                        FriendRequest.sender_id == receiver_id,
                        FriendRequest.receiver_id == sender_id,
                    ),
                )
            )
        )
        if existing.scalar_one_or_none():
            from fastapi import HTTPException
            raise HTTPException(400, "Friend request already exists or users are already friends")

        req = FriendRequest(
            sender_id=sender_id,
            receiver_id=receiver_id,
            message=message,
        )
        self.db.add(req)
        await self.db.flush()
        return req

    async def respond_to_friend_request(
        self, request_id: uuid.UUID, receiver_id: uuid.UUID, action: str
    ) -> FriendRequest:
        from fastapi import HTTPException

        result = await self.db.execute(
            select(FriendRequest).where(
                and_(
                    FriendRequest.id == request_id,
                    FriendRequest.receiver_id == receiver_id,
                    FriendRequest.status == FriendRequestStatus.pending,
                )
            )
        )
        req = result.scalar_one_or_none()
        if not req:
            raise HTTPException(404, "Pending friend request not found")

        if action == "accept":
            req.status = FriendRequestStatus.accepted
            # Create canonical friendship (smaller UUID first)
            uid1, uid2 = sorted([req.sender_id, req.receiver_id], key=str)
            friendship = Friendship(user_id_1=uid1, user_id_2=uid2)
            self.db.add(friendship)
        elif action == "reject":
            req.status = FriendRequestStatus.rejected
        elif action == "block":
            req.status = FriendRequestStatus.blocked

        await self.db.flush()
        return req
