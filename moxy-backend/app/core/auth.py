"""
app/core/auth.py
"""
import uuid
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.models import User
from app.services.user_service import UserService

bearer_scheme = HTTPBearer(auto_error=True)

# Cache the JWKS so we don't fetch on every request
_jwks_cache: dict | None = None

async def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is None:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json",
                headers={"apikey": settings.SUPABASE_ANON_KEY},
            )
            resp.raise_for_status()
            _jwks_cache = resp.json()
    return _jwks_cache


async def _decode_supabase_jwt(token: str) -> dict:
    jwks = await _get_jwks()
    try:
        # jose will pick the matching key by kid
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["ES256", "HS256"],  # support both during transition
            options={"verify_aud": False},
        )
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = await _decode_supabase_jwt(credentials.credentials)

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(status_code=401, detail="Token missing sub claim")

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid user ID in token")

    user_service = UserService(db)
    user = await user_service.get_by_id(user_id)

    if not user:
        email = payload.get("email", "")
        user_meta = payload.get("user_metadata", {})
        full_name = user_meta.get("full_name") or user_meta.get("name") or email.split("@")[0]
        avatar_url = user_meta.get("avatar_url") or user_meta.get("picture")

        user = await user_service.upsert(
            user_id=user_id,
            email=email,
            full_name=full_name,
            avatar_url=avatar_url,
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    await user_service.touch_last_seen(user_id)
    return user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        HTTPBearer(auto_error=False)
    ),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    if not credentials:
        return None
    return await get_current_user(credentials, db)


def require_group_admin(current_user: User, group_member) -> None:
    if group_member.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only group admins can perform this action",
        )