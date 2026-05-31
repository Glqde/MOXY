"""
app/api/v1/routes/groups.py
"""
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_group_admin
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import (
    GroupCreate, GroupMemberRead, GroupRead, GroupUpdate,
    InviteMemberRequest, UpdateMemberRoleRequest,
)
from app.services.group_service import GroupService

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("/", response_model=List[GroupRead])
async def list_my_groups(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    groups = await svc.get_user_groups(current_user.id)
    # Attach member_count
    for g in groups:
        g.member_count = len(g.members)
    return groups


@router.post("/", response_model=GroupRead, status_code=status.HTTP_201_CREATED)
async def create_group(
    payload: GroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    group = await svc.create(created_by=current_user.id, data=payload)
    group.member_count = 1
    return group


@router.get("/{group_id}", response_model=GroupRead)
async def get_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    membership = await svc.get_membership(group_id, current_user.id)
    if not membership:
        raise HTTPException(403, "Not a member")
    group = await svc.get_by_id(group_id)
    if not group:
        raise HTTPException(404, "Group not found")
    group.member_count = len(group.members)
    return group


@router.patch("/{group_id}", response_model=GroupRead)
async def update_group(
    group_id: uuid.UUID,
    payload: GroupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    membership = await svc.get_membership(group_id, current_user.id)
    if not membership:
        raise HTTPException(403, "Not a member")
    require_group_admin(current_user, membership)
    group = await svc.update(group_id, payload)
    group.member_count = len(group.members)
    return group


@router.get("/{group_id}/members", response_model=List[GroupMemberRead])
async def list_members(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    if not await svc.get_membership(group_id, current_user.id):
        raise HTTPException(403, "Not a member")
    group = await svc.get_by_id(group_id)
    return group.members if group else []


@router.post("/{group_id}/members", status_code=status.HTTP_201_CREATED)
async def invite_member(
    group_id: uuid.UUID,
    payload: InviteMemberRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    membership = await svc.get_membership(group_id, current_user.id)
    if not membership:
        raise HTTPException(403, "Not a member")
    require_group_admin(current_user, membership)
    return await svc.add_member(group_id, payload.user_id)


@router.delete("/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    membership = await svc.get_membership(group_id, current_user.id)
    if not membership:
        raise HTTPException(403, "Not a member")
    # Admins can remove anyone; members can only remove themselves
    if membership.role != "admin" and user_id != current_user.id:
        raise HTTPException(403, "Only admins can remove other members")
    if not await svc.remove_member(group_id, user_id):
        raise HTTPException(404, "Member not found")


@router.patch("/{group_id}/members/{user_id}/role")
async def update_role(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: UpdateMemberRoleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    membership = await svc.get_membership(group_id, current_user.id)
    if not membership:
        raise HTTPException(403, "Not a member")
    require_group_admin(current_user, membership)
    updated = await svc.update_member_role(group_id, user_id, payload.role)
    if not updated:
        raise HTTPException(404, "Member not found")
    return updated


@router.post("/join/{invite_code}", response_model=GroupRead)
async def join_by_invite(
    invite_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    group = await svc.join_by_invite(invite_code, current_user.id)
    group.member_count = len(group.members)
    return group


@router.post("/{group_id}/invite-code/regenerate")
async def regenerate_invite(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    membership = await svc.get_membership(group_id, current_user.id)
    if not membership:
        raise HTTPException(403, "Not a member")
    require_group_admin(current_user, membership)
    new_code = await svc.regenerate_invite_code(group_id)
    return {"invite_code": new_code}
