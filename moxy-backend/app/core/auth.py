"""
app/core/auth.py
"""
import time
import uuid
from datetime import datetime, timedelta, timezone
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

# Cache the JWKS so we don't fetch on every request. Refetched (at most once
# per JWKS_MIN_REFRESH_SECONDS) when a token arrives signed by an unknown key,
# which is what happens after Supabase rotates signing keys.
JWKS_MIN_REFRESH_SECONDS = 300
_jwks_cache: dict | None = None
_jwks_fetched_at: float = 0.0


async def _get_jwks(force: bool = False) -> dict:
    global _jwks_cache, _jwks_fetched_at
    stale = time.monotonic() - _jwks_fetched_at > JWKS_MIN_REFRESH_SECONDS
    if _jwks_cache is None or (force and stale):
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json",
                headers={"apikey": settings.SUPABASE_ANON_KEY},
            )
            resp.raise_for_status()
            _jwks_cache = resp.json()
            _jwks_fetched_at = time.monotonic()
    return _jwks_cache


def _invalid_token(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def decode_supabase_jwt(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
    except JWTError:
        raise _invalid_token("Malformed token")

    options = {"verify_aud": False}
    try:
        if header.get("alg") == "HS256":
            # Legacy Supabase projects sign with the shared JWT secret
            return jwt.decode(token, settings.SUPABASE_JWT_SECRET, algorithms=["HS256"], options=options)

        jwks = await _get_jwks()
        kid = header.get("kid")
        if kid and not any(k.get("kid") == kid for k in jwks.get("keys", [])):
            jwks = await _get_jwks(force=True)
        # jose picks the matching key by kid
        return jwt.decode(token, jwks, algorithms=["ES256", "RS256"], options=options)
    except JWTError as e:
        raise _invalid_token(f"Invalid or expired token: {e}")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = await decode_supabase_jwt(credentials.credentials)

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

    # Throttled so ordinary reads don't turn into a write on every request
    now = datetime.now(timezone.utc)
    if not user.last_seen_at or now - user.last_seen_at > timedelta(seconds=settings.LAST_SEEN_THROTTLE_SECONDS):
        user.last_seen_at = now  # flushed by get_db's commit
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
