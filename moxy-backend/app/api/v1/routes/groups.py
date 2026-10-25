"""
app/api/v1/routes/groups.py
"""
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_group_admin
from app.core.realtime import drop_user_from_group_room, emit_group_event, emit_user_event
from app.core.redis import get_online_members, get_redis
from app.db.session import get_db
from app.models.models import Group, GroupMember, Notification, NotificationType, User
from app.schemas.schemas import (
    GroupCreate, GroupMemberRead, GroupRead, GroupUpdate,
    InviteMemberRequest, UpdateMemberRoleRequest,
)
from app.services.group_service import GroupService

router = APIRouter(prefix="/groups", tags=["groups"])


async def _require_member(svc: GroupService, group_id: uuid.UUID, user: User) -> GroupMember:
    membership = await svc.get_membership(group_id, user.id)
    if not membership:
        raise HTTPException(403, "Not a member")
    return membership


async def _require_admin(svc: GroupService, group_id: uuid.UUID, user: User) -> GroupMember:
    membership = await _require_member(svc, group_id, user)
    require_group_admin(user, membership)
    return membership


def _group_read(group: Group, role: str) -> GroupRead:
    """Only admins get the invite code — anyone holding it can join the group."""
    data = GroupRead.model_validate(group)
    if role != "admin":
        data = data.model_copy(update={"invite_code": None})
    return data


async def _member_read(svc: GroupService, member: GroupMember) -> GroupMember:
    """Loads .user so the member serializes as GroupMemberRead."""
    await svc.db.refresh(member, attribute_names=["user"])
    return member


@router.get("", response_model=List[GroupRead])
async def list_my_groups(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    groups = await GroupService(db).get_user_groups(current_user.id)
    return [_group_read(group, role) for group, role in groups]


@router.post("", response_model=GroupRead, status_code=status.HTTP_201_CREATED)
async def create_group(
    payload: GroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await GroupService(db).create(created_by=current_user.id, data=payload)


@router.get("/{group_id}", response_model=GroupRead)
async def get_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    membership = await _require_member(svc, group_id, current_user)
    group = await svc.get_by_id(group_id)
    if not group:
        raise HTTPException(404, "Group not found")
    return _group_read(group, membership.role)


@router.patch("/{group_id}", response_model=GroupRead)
async def update_group(
    group_id: uuid.UUID,
    payload: GroupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    await _require_admin(svc, group_id, current_user)
    group = await svc.update(group_id, payload)
    if not group:
        raise HTTPException(404, "Group not found")
    return group


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    await _require_admin(svc, group_id, current_user)
    if not await svc.delete(group_id):
        raise HTTPException(404, "Group not found")


@router.get("/{group_id}/members", response_model=List[GroupMemberRead])
async def list_members(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    await _require_member(svc, group_id, current_user)
    members = await svc.get_members(group_id)
    # Presence events only cover changes after a client connects, so the
    # initial online state has to come with the member list
    try:
        online = await get_online_members(get_redis(), [str(m.user_id) for m in members])
    except Exception:
        online = {}
    for m in members:
        m.online = online.get(str(m.user_id), False)
    return members


@router.post("/{group_id}/members", response_model=GroupMemberRead, status_code=status.HTTP_201_CREATED)
async def invite_member(
    group_id: uuid.UUID,
    payload: InviteMemberRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    await _require_admin(svc, group_id, current_user)
    member = await svc.invite(group_id, payload.user_id, invited_by=current_user)
    member = await _member_read(svc, member)
    await db.commit()
    # Lets the added person's open app show the group and a popup right away
    group = await svc.db.get(Group, group_id)
    await emit_user_event(payload.user_id, {
        "event": "group_invite",
        "group_id": str(group_id),
        "group_name": group.name,
        "group_icon": group.icon,
        "invited_by_name": current_user.full_name,
    })
    return member


@router.delete("/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    membership = await _require_member(svc, group_id, current_user)
    kicked = user_id != current_user.id
    # Admins can remove anyone; members can only remove themselves
    if membership.role != "admin" and kicked:
        raise HTTPException(403, "Only admins can remove other members")
    group = await svc.get_by_id(group_id)
    if not group or not await svc.remove_member(group_id, user_id):
        raise HTTPException(404, "Member not found")
    if kicked:
        db.add(Notification(
            user_id=user_id,
            type=NotificationType.system,
            title=f"{group.icon} You were removed from {group.name}",
            body=f"{current_user.full_name} removed you from this group",
            actor_id=current_user.id,
            group_id=group_id,
        ))
    await db.commit()

    # Cut their live access first, then tell them and the rest of the group
    await drop_user_from_group_room(user_id, group_id)
    await emit_user_event(user_id, {
        "event": "removed_from_group",
        "group_id": str(group_id),
        "group_name": group.name,
        "group_icon": group.icon,
        "removed_by_name": current_user.full_name if kicked else None,
    })
    await emit_group_event(group_id, {
        "event": "member_removed",
        "group_id": str(group_id),
        "user_id": str(user_id),
    })


@router.patch("/{group_id}/members/{user_id}/role", response_model=GroupMemberRead)
async def update_role(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: UpdateMemberRoleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    await _require_admin(svc, group_id, current_user)
    updated = await svc.update_member_role(group_id, user_id, payload.role)
    if not updated:
        raise HTTPException(404, "Member not found")
    return await _member_read(svc, updated)


@router.post("/join/{invite_code}", response_model=GroupRead)
async def join_by_invite(
    invite_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    group = await svc.join_by_invite(invite_code, current_user.id)
    membership = await svc.get_membership(group.id, current_user.id)
    return _group_read(group, membership.role)


@router.post("/{group_id}/invite-code/regenerate")
async def regenerate_invite(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = GroupService(db)
    await _require_admin(svc, group_id, current_user)
    new_code = await svc.regenerate_invite_code(group_id)
    if not new_code:
        raise HTTPException(404, "Group not found")
    return {"invite_code": new_code}
