import hashlib
import json
from typing import Dict, Any, Tuple
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from backend.app.models import Endpoint, IdempotencyKey

def extract_event_id(headers: Dict[str, str], payload_bytes: bytes) -> str:
    # Standardize header keys to lowercase
    headers_lower = {k.lower(): v for k, v in headers.items()}
    
    # 1. Look for common webhook provider unique identifiers
    provider_headers = [
        "x-github-delivery",      # GitHub
        "x-shopify-webhook-id",   # Shopify
        "stripe-event-id",        # Stripe (sometimes present)
        "x-event-id",             # General
        "x-event-id-header",      # Custom
        "idempotency-key",        # General custom API headers
        "x-idempotency-key"       # Alternative custom headers
    ]
    
    for h in provider_headers:
        if h in headers_lower:
            return headers_lower[h]
            
    # 2. Stripe-specific signature extraction if event ID is absent
    if "stripe-signature" in headers_lower:
        # Stripe signature format is t=timestamp,v1=signature. Use signature part.
        sig_parts = headers_lower["stripe-signature"].split(",")
        for part in sig_parts:
            if part.startswith("v1="):
                return part[3:]

    # 3. Fallback: Cryptographic hash of raw payload bytes to prevent identical duplicates
    hasher = hashlib.sha256()
    hasher.update(payload_bytes)
    return hasher.hexdigest()

async def check_and_register_event(db: AsyncSession, endpoint_id: str, headers: Dict[str, str], payload_bytes: bytes) -> bool:
    # Fetch endpoint configurations
    res = await db.execute(select(Endpoint).where(Endpoint.id == endpoint_id))
    endpoint = res.scalars().first()
    if not endpoint:
        strategy = "auto"
        ttl = 86400
    else:
        strategy = endpoint.idempotency_strategy
        ttl = endpoint.idempotency_ttl

    # Extraction strategy selection
    if strategy == "payload_hash":
        hasher = hashlib.sha256()
        hasher.update(payload_bytes)
        event_id = hasher.hexdigest()
    else:
        event_id = extract_event_id(headers, payload_bytes)

    composite_key = hashlib.sha256(f"{endpoint_id}:{event_id}".encode()).hexdigest()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=ttl)

    # Check for duplicate
    res = await db.execute(select(IdempotencyKey).where(IdempotencyKey.key_hash == composite_key))
    existing = res.scalars().first()

    if existing:
        existing_expires = existing.expires_at
        if existing_expires is not None:
            if existing_expires.tzinfo is None:
                # SQLite naive datetime representing UTC
                existing_expires = existing_expires.replace(tzinfo=timezone.utc)
            
        if existing_expires is None or existing_expires < now:
            # Expired! Delete inline to register the new webhook
            await db.delete(existing)
            await db.commit()
        else:
            # Key is still valid, so this is a duplicate event
            return False

    try:
        new_key = IdempotencyKey(key_hash=composite_key, expires_at=expires_at)
        db.add(new_key)
        await db.commit()
        return True
    except Exception:
        await db.rollback()
        return False
