"""
app/core/redis.py
Async Redis client — shared singleton across the application.
Used for:
  - Distributed task locks (SETNX)
  - Pub/Sub broadcasting to WebSocket connections
  - Online presence tracking
  - Rate limiting counters
"""
import json
from contextlib import asynccontextmanager
from typing import Any, Optional

import redis.asyncio as aioredis
from redis.asyncio import Redis

from app.core.config import settings

# Global client — initialized on startup, closed on shutdown
_redis_client: Optional[Redis] = None


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


# ─── Distributed Task Lock ────────────────────────────────────────────────────

class TaskLock:
    """
    Redis-based distributed lock for task completion.

    Usage:
        async with TaskLock(redis, task_id) as acquired:
            if not acquired:
                raise HTTPException(409, "Task already being completed")
            # ... complete the task
    """

    def __init__(self, redis: Redis, task_id: str, ttl: int = None):
        self.redis = redis
        self.key = f"task:lock:{task_id}"
        self.ttl = ttl or settings.TASK_LOCK_TTL_SECONDS

    async def __aenter__(self) -> bool:
        # SETNX — set if not exists. Atomic. Returns True if we acquired the lock.
        self.acquired = await self.redis.set(
            self.key,
            "1",
            nx=True,          # only set if key doesn't exist
            ex=self.ttl,      # auto-expire prevents deadlocks
        )
        return bool(self.acquired)

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        # Always release if we acquired, even on exception
        if self.acquired:
            await self.redis.delete(self.key)


# ─── Presence Tracking ────────────────────────────────────────────────────────

PRESENCE_TTL = 60  # seconds — refreshed on heartbeat


async def set_user_online(redis: Redis, user_id: str) -> None:
    await redis.setex(f"presence:{user_id}", PRESENCE_TTL, "1")


async def set_user_offline(redis: Redis, user_id: str) -> None:
    await redis.delete(f"presence:{user_id}")


async def is_user_online(redis: Redis, user_id: str) -> bool:
    return bool(await redis.exists(f"presence:{user_id}"))


async def get_online_members(redis: Redis, user_ids: list[str]) -> dict[str, bool]:
    """Batch presence check for all members of a group."""
    pipe = redis.pipeline()
    for uid in user_ids:
        pipe.exists(f"presence:{uid}")
    results = await pipe.execute()
    return {uid: bool(r) for uid, r in zip(user_ids, results)}


# ─── Pub/Sub ──────────────────────────────────────────────────────────────────

async def publish_group_event(redis: Redis, group_id: str, event: dict) -> None:
    """
    Publish a realtime event to all Socket.IO connections in a group.
    The WebSocket server subscribes to these channels and forwards to clients.
    """
    await redis.publish(f"group:{group_id}", json.dumps(event))


async def publish_user_event(redis: Redis, user_id: str, event: dict) -> None:
    """Publish a personal event (e.g. notification) to a specific user's channel."""
    await redis.publish(f"user:{user_id}", json.dumps(event))


# ─── Rate Limiting ────────────────────────────────────────────────────────────

async def check_rate_limit(redis: Redis, key: str, limit: int, window_seconds: int = 60) -> bool:
    """
    Sliding window rate limiter using Redis INCR + EXPIRE.
    Returns True if the request is allowed, False if rate limited.
    """
    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, window_seconds)
    return current <= limit
