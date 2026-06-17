from fastapi import APIRouter, Request, Response, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
import time
from backend.app.db import get_db
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

    # 3. Check active state (circuit breaker status)
    if not endpoint_data["active_state"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Webhook proxy endpoint is paused (circuit breaker tripped or admin disabled)"
        )

    # 4. Extract headers
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
