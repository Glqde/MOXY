"""
app/core/redis.py
Async Redis client — shared singleton across the application.
Used for:
  - Online presence tracking
  - Rate limiting counters
Realtime fan-out goes through Socket.IO's Redis manager (app/core/realtime.py).
"""
from typing import Optional

import redis.asyncio as aioredis
from redis.asyncio import Redis

from app.core.config import settings

# Global client — initialized on startup, closed on shutdown
_redis_client: Optional[Redis] = None


def redis_ssl_options(url: str) -> dict:
    """Managed Redis (Upstash etc.) uses rediss:// with certs we don't verify."""
    return {"ssl_cert_reqs": "none"} if url.startswith("rediss://") else {}


async def init_redis() -> Redis:
    global _redis_client
    _redis_client = aioredis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
        retry_on_timeout=True,
        health_check_interval=30,
        **redis_ssl_options(settings.REDIS_URL),
    )
    await _redis_client.ping()
    return _redis_client


async def close_redis() -> None:
    global _redis_client
    if _redis_client:
        await _redis_client.aclose()
        _redis_client = None


def get_redis() -> Redis:
    """FastAPI dependency — returns the shared client."""
    if not _redis_client:
        raise RuntimeError("Redis not initialized. Call init_redis() on startup.")
    return _redis_client


# ─── Presence Tracking ────────────────────────────────────────────────────────
# presence:<uid>       — exists while the user has a live heartbeat
# presence:conns:<uid> — open socket count across all API processes

PRESENCE_TTL = 60  # seconds — refreshed on heartbeat


async def add_connection(redis: Redis, user_id: str) -> None:
    pipe = redis.pipeline()
    pipe.incr(f"presence:conns:{user_id}")
    pipe.expire(f"presence:conns:{user_id}", PRESENCE_TTL * 60)
    pipe.setex(f"presence:{user_id}", PRESENCE_TTL, "1")
    await pipe.execute()


async def remove_connection(redis: Redis, user_id: str) -> bool:
    """Returns True when this was the user's last open connection."""
    remaining = await redis.decr(f"presence:conns:{user_id}")
    if remaining <= 0:
        await redis.delete(f"presence:conns:{user_id}", f"presence:{user_id}")
        return True
    return False


async def set_user_online(redis: Redis, user_id: str) -> None:
    await redis.setex(f"presence:{user_id}", PRESENCE_TTL, "1")


async def get_online_members(redis: Redis, user_ids: list[str]) -> dict[str, bool]:
    """Batch presence check for all members of a group."""
    pipe = redis.pipeline()
    for uid in user_ids:
        pipe.exists(f"presence:{uid}")
    results = await pipe.execute()
    return {uid: bool(r) for uid, r in zip(user_ids, results)}


# ─── Rate Limiting ────────────────────────────────────────────────────────────

async def check_rate_limit(redis: Redis, key: str, limit: int, window_seconds: int = 60) -> bool:
    """
    Fixed window rate limiter using Redis INCR + EXPIRE (one round trip).
    Returns True if the request is allowed, False if rate limited.
    """
    pipe = redis.pipeline()
    pipe.incr(key)
    pipe.ttl(key)
    current, ttl = await pipe.execute()
    if ttl == -1:
        await redis.expire(key, window_seconds)
    return current <= limit
