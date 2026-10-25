"""
app/services/group_service.py
Group management — create, invite, roles, remove members.
"""
import secrets
import uuid
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import Group, GroupMember, GroupRole, Notification, NotificationType, User
from app.schemas.schemas import GroupCreate, GroupUpdate


def _member_count_subquery():
    return (
        select(func.count(GroupMember.id))
        .where(GroupMember.group_id == Group.id)
        .correlate(Group)
        .scalar_subquery()
    )


class GroupService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, group_id: uuid.UUID) -> Optional[Group]:
        """Returns the group with .member_count set (members are not loaded)."""
        result = await self.db.execute(
            select(Group, _member_count_subquery()).where(Group.id == group_id)
        )
        row = result.first()
        if not row:
            return None
        group, count = row
        group.member_count = count
        return group

    async def get_members(self, group_id: uuid.UUID) -> List[GroupMember]:
        result = await self.db.execute(
            select(GroupMember)
            .where(GroupMember.group_id == group_id)
            .options(selectinload(GroupMember.user))
            .order_by(GroupMember.joined_at)
        )
        return list(result.scalars().all())

    async def delete(self, group_id: uuid.UUID) -> bool:
        # Core DELETE so Postgres handles the ON DELETE CASCADEs, instead of
        # the ORM trying to SET NULL on task_completions.task_id
        result = await self.db.execute(delete(Group).where(Group.id == group_id))
        return result.rowcount > 0

    async def get_user_groups(self, user_id: uuid.UUID) -> List[tuple[Group, str]]:
        """Returns (group, the user's role in it), with .member_count set."""
        result = await self.db.execute(
            select(Group, _member_count_subquery(), GroupMember.role)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .where(GroupMember.user_id == user_id)
            .order_by(GroupMember.joined_at)
        )
        groups = []
        for group, count, role in result.all():
            group.member_count = count
            groups.append((group, role))
        return groups

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
        # Creator is automatically an admin
        group.members.append(GroupMember(user_id=created_by, role=GroupRole.admin))
        self.db.add(group)
        await self.db.flush()
        group.member_count = 1
        return group

    async def update(self, group_id: uuid.UUID, data: GroupUpdate) -> Optional[Group]:
        group = await self.get_by_id(group_id)
        if not group:
            return None
        for key, value in data.model_dump(exclude_unset=True).items():
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
        existing = await self.get_membership(group_id, user_id)
        if existing:
            raise HTTPException(400, "User is already a member of this group")

        member = GroupMember(group_id=group_id, user_id=user_id, role=role)
        self.db.add(member)
        await self.db.flush()
        return member

    async def invite(self, group_id: uuid.UUID, user_id: uuid.UUID, invited_by: User) -> GroupMember:
        """Admin adds someone directly; they get an in-app notification."""
        if not await self.db.get(User, user_id):
            raise HTTPException(404, "User not found")
        member = await self.add_member(group_id, user_id)
        group = await self.db.get(Group, group_id)
        self.db.add(Notification(
            user_id=user_id,
            type=NotificationType.group_invite,
            title=f"{group.icon} You were added to {group.name}",
            body=f"{invited_by.full_name} added you to this group",
            actor_id=invited_by.id,
            group_id=group_id,
            extra_data={"group_icon": group.icon, "inviter_name": invited_by.full_name},
        ))
        await self.db.flush()
        return member

    async def _ensure_not_last_admin(self, member: GroupMember) -> None:
        if member.role != GroupRole.admin:
            return
        admins = await self.db.scalar(
            select(func.count(GroupMember.id)).where(
                GroupMember.group_id == member.group_id,
                GroupMember.role == GroupRole.admin,
            )
        )
        if admins <= 1:
            raise HTTPException(400, "A group needs at least one admin — promote someone else first")

    async def remove_member(self, group_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        member = await self.get_membership(group_id, user_id)
        if not member:
            return False
        await self._ensure_not_last_admin(member)
        await self.db.delete(member)
        await self.db.flush()
        return True

    async def update_member_role(self, group_id: uuid.UUID, user_id: uuid.UUID, role: str) -> Optional[GroupMember]:
        member = await self.get_membership(group_id, user_id)
        if not member:
            return None
        if role != GroupRole.admin:
            await self._ensure_not_last_admin(member)
        member.role = role
        await self.db.flush()
        return member

    async def regenerate_invite_code(self, group_id: uuid.UUID) -> Optional[str]:
        group = await self.get_by_id(group_id)
        if not group:
            return None
        group.invite_code = secrets.token_urlsafe(8)
        await self.db.flush()
        return group.invite_code

    async def join_by_invite(self, invite_code: str, user_id: uuid.UUID) -> Group:
        result = await self.db.execute(select(Group).where(Group.invite_code == invite_code))
        group = result.scalar_one_or_none()
        if not group:
            raise HTTPException(404, "Invalid invite code")
        # Opening a link you've already used just takes you to the group
        if not await self.get_membership(group.id, user_id):
            await self.add_member(group.id, user_id)
        return await self.get_by_id(group.id)
