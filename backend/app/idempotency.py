import hashlib
import json
from typing import Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import insert as sqla_insert
from backend.app.models import IdempotencyKey

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
    event_id = extract_event_id(headers, payload_bytes)
    composite_key = hashlib.sha256(f"{endpoint_id}:{event_id}".encode()).hexdigest()

    try:
        # Attempt to insert. Using plain insert inside transaction block.
        # If it violates the unique constraint, it throws an exception.
        stmt = sqla_insert(IdempotencyKey).values(key_hash=composite_key)
        await db.execute(stmt)
        await db.commit()
        return True
    except Exception:
        # A unique constraint violation (duplicate key) or other db exception occurred
        await db.rollback()
        return False
