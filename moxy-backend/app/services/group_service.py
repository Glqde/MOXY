"""
app/services/group_service.py
Group management — create, invite, roles, remove members.
"""
import secrets
import uuid
from typing import List, Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import Group, GroupMember, GroupRole
from app.schemas.schemas import GroupCreate, GroupUpdate


class GroupService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, group_id: uuid.UUID) -> Optional[Group]:
        result = await self.db.execute(
            select(Group)
            .where(Group.id == group_id)
            .options(selectinload(Group.members).selectinload(GroupMember.user))
        )
        return result.scalar_one_or_none()

    async def get_user_groups(self, user_id: uuid.UUID) -> List[Group]:
        result = await self.db.execute(
            select(Group)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .where(GroupMember.user_id == user_id)
            .options(selectinload(Group.members))
        )
        return list(result.scalars().all())

    async def create(self, created_by: uuid.UUID, data: GroupCreate) -> Group:
        group = Group(
            name=data.name,
            description=data.description,
            icon=data.icon,
            color=data.color,
            is_private=data.is_private,
            created_by=created_by,
            invite_code=secrets.token_urlsafe(8) if data.is_private else None,
        )
        self.db.add(group)
        await self.db.flush()

        # Creator is automatically an admin
        member = GroupMember(
            group_id=group.id,
            user_id=created_by,
            role=GroupRole.admin,
        )
        self.db.add(member)
        await self.db.flush()
        return group

    async def update(self, group_id: uuid.UUID, data: GroupUpdate) -> Optional[Group]:
        group = await self.get_by_id(group_id)
        if not group:
            return None
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(group, key, value)
        await self.db.flush()
        return group

    async def get_membership(self, group_id: uuid.UUID, user_id: uuid.UUID) -> Optional[GroupMember]:
        result = await self.db.execute(
            select(GroupMember).where(
                and_(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
            )
        )
        return result.scalar_one_or_none()

    async def add_member(self, group_id: uuid.UUID, user_id: uuid.UUID, role: GroupRole = GroupRole.member) -> GroupMember:
        from fastapi import HTTPException
        existing = await self.get_membership(group_id, user_id)
        if existing:
            raise HTTPException(400, "User is already a member of this group")

        member = GroupMember(group_id=group_id, user_id=user_id, role=role)
        self.db.add(member)
        await self.db.flush()
        return member

    async def remove_member(self, group_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        member = await self.get_membership(group_id, user_id)
        if not member:
            return False
        await self.db.delete(member)
        await self.db.flush()
        return True

    async def update_member_role(self, group_id: uuid.UUID, user_id: uuid.UUID, role: str) -> Optional[GroupMember]:
        member = await self.get_membership(group_id, user_id)
        if not member:
            return None
        member.role = role
        await self.db.flush()
        return member

    async def regenerate_invite_code(self, group_id: uuid.UUID) -> str:
        group = await self.get_by_id(group_id)
        new_code = secrets.token_urlsafe(8)
        group.invite_code = new_code
        await self.db.flush()
        return new_code

    async def join_by_invite(self, invite_code: str, user_id: uuid.UUID) -> Group:
        from fastapi import HTTPException
        result = await self.db.execute(select(Group).where(Group.invite_code == invite_code))
        group = result.scalar_one_or_none()
        if not group:
            raise HTTPException(404, "Invalid invite code")
        await self.add_member(group.id, user_id)
        return group
