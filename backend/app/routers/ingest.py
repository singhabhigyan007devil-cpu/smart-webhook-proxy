from fastapi import APIRouter, Request, Response, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
import time
import hmac
import hashlib
from backend.app.db import get_db, redis_client
from backend.app.cache import slug_cache
from backend.app.tasks import enqueue_webhook_task

router = APIRouter()

@router.post("/p/{proxy_slug}")
async def ingest_webhook(
    proxy_slug: str,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    start_time = time.time()
    
    # 1. Extract raw untouched body to preserve exact binary structure for signatures
    raw_body_bytes = await request.body()
    try:
        payload_str = raw_body_bytes.decode("utf-8")
    except UnicodeDecodeError:
        payload_str = raw_body_bytes.decode("utf-8", errors="replace")

    # 2. Look up proxy_slug in optimized cache
    endpoint_data = await slug_cache.get_endpoint_by_slug(proxy_slug, db)
    if not endpoint_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook proxy endpoint not found"
        )

    # 3. Security: Check HMAC Signature if a secret is configured
    secret = endpoint_data.get("secret_token")
    if secret:
        # Convert headers keys to lowercase for case-insensitive lookup
        lower_headers = {k.lower(): v for k, v in request.headers.items()}
        signature = lower_headers.get("x-hookshield-signature") or lower_headers.get("x-hub-signature-256")
        
        if not signature:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing webhook signature header (X-HookShield-Signature or X-Hub-Signature-256)"
            )
            
        # Handle GitHub-style prefixed signatures
        if signature.startswith("sha256="):
            signature = signature[7:]
            
        expected_sig = hmac.new(
            secret.encode("utf-8"),
            raw_body_bytes,
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(expected_sig, signature):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid webhook signature"
            )

    # 4. Check active state (circuit breaker status)
    if not endpoint_data["active_state"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Webhook proxy endpoint is paused (circuit breaker tripped or admin disabled)"
        )

    # 4.5 API Rate Limiting Check (Redis-based)
    rate_limit = endpoint_data.get("rate_limit_rpm", 600)
    if rate_limit > 0:
        current_minute = int(time.time() / 60)
        rate_key = f"rate_limit:{endpoint_data['id']}:{current_minute}"
        try:
            async with redis_client.pipeline(transaction=True) as pipe:
                pipe.incr(rate_key)
                pipe.expire(rate_key, 120)
                results = await pipe.execute()
            
            current_count = results[0]
            if current_count > rate_limit:
                raise HTTPException(
                    status_code=429,
                    detail="Too Many Requests: Endpoint rate limit exceeded"
                )
        except HTTPException:
            raise
        except Exception as e:
            # Fail open if Redis is unreachable
            print(f"[RATE_LIMIT_ERROR] Failed to check rate limit: {e}")

    # 5. Extract headers
    headers = dict(request.headers)

    # Remove system headers or host header to prevent target conflicts
    headers_to_forward = {}
    for k, v in headers.items():
        if k.lower() not in ("host", "content-length", "connection"):
            headers_to_forward[k] = v

    # 5. Hand task off to Cloud Tasks / local queue
    await enqueue_webhook_task(
        endpoint_id=endpoint_data["id"],
        payload_string=payload_str,
        headers=headers_to_forward,
        retry_count=0
    )

    elapsed_ms = (time.time() - start_time) * 1000
    print(f"[INGEST] Ingested webhook for slug={proxy_slug} in {elapsed_ms:.2f}ms")

    # Return HTTP 202 Accepted immediately
    return Response(
        content="Accepted",
        status_code=status.HTTP_202_ACCEPTED
    )
