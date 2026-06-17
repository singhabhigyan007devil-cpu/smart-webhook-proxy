from fastapi import APIRouter, Depends, HTTPException, status, Response
from pydantic import BaseModel
from typing import Dict, Any, Optional
import httpx
import time
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.app.db import get_db
from backend.app.models import Endpoint, WebhookLog, Incident
from backend.app.config import settings
from backend.app.idempotency import check_and_register_event
from backend.app.circuit_breaker import register_success, register_failure
from backend.app.tasks import enqueue_webhook_task

router = APIRouter()

async def send_alert_webhook(endpoint: Endpoint, error_msg: str, tripped: bool = False):
    title = "🚨 **HookShield Webhook Alert**"
    reason = "Circuit breaker tripped" if tripped else "Max retries exceeded"
    message = (
        f"{title}\n"
        f"**Endpoint Name:** {endpoint.source_name}\n"
        f"**Slug:** `/p/{endpoint.slug}`\n"
        f"**Status:** FAILED (Dropped)\n"
        f"**Reason:** {reason}\n"
        f"**Target URL:** {endpoint.target_url}\n"
        f"**Details:** {error_msg}"
    )
    payload = {
        "text": message,
        "content": message
    }
    try:
        async with httpx.AsyncClient() as client:
            await client.post(endpoint.alert_webhook_url, json=payload, timeout=5.0)
            print(f"[ALERT] Alert sent successfully to {endpoint.alert_webhook_url}")
    except Exception as e:
        print(f"[ALERT ERROR] Failed to dispatch webhook alert to {endpoint.alert_webhook_url}: {e}")


class WorkerPayload(BaseModel):
    endpoint_id: str
    payload_string: str
    headers: Dict[str, str]
    retry_count: int

@router.post("/worker/process")
async def process_webhook_task(
    payload: WorkerPayload,
    db: AsyncSession = Depends(get_db)
):
    endpoint_id = payload.endpoint_id
    payload_str = payload.payload_string
    headers = payload.headers
    retry_count = payload.retry_count

    # 1. Fetch Endpoint details from DB
    result = await db.execute(select(Endpoint).where(Endpoint.id == endpoint_id))
    endpoint = result.scalars().first()
    
    if not endpoint:
        # Endpoint was deleted mid-flight; discard task
        return Response(content="Endpoint not found. Task discarded.", status_code=status.HTTP_200_OK)

    # If the endpoint is disabled/paused, discard task
    if not endpoint.active_state:
        # We write a final log stating it was dropped due to paused endpoint
        log = WebhookLog(
            endpoint_id=endpoint_id,
            payload_string=payload_str,
            headers_json=headers,
            delivery_status="dropped",
            retry_count=retry_count,
            error_message="Delivery dropped because the endpoint is paused."
        )
        db.add(log)
        await db.commit()
        return Response(content="Endpoint is inactive. Task dropped.", status_code=status.HTTP_200_OK)

    # 2. Idempotency Check (only run on first attempt)
    if retry_count == 0:
        is_unique = await check_and_register_event(db, endpoint_id, headers, payload_str.encode())
        if not is_unique:
            # Duplicate event detected, log as dropped and return 200 OK (so task is cleared)
            log = WebhookLog(
                endpoint_id=endpoint_id,
                payload_string=payload_str,
                headers_json=headers,
                delivery_status="dropped",
                retry_count=0,
                error_message="Duplicate event dropped by Idempotency Layer."
            )
            db.add(log)
            await db.commit()
            return Response(content="Duplicate event dropped.", status_code=status.HTTP_200_OK)

    # 3. Deliver Webhook Outbound
    status_code = None
    error_msg = None
    delivery_status_label = "pending"
    
    # Create the log entry
    log = WebhookLog(
        endpoint_id=endpoint_id,
        payload_string=payload_str,
        headers_json=headers,
        delivery_status=delivery_status_label,
        retry_count=retry_count
    )
    db.add(log)
    await db.flush() # Populate log.id
    
    # Merge custom target authentication headers
    merged_headers = headers.copy()
    if endpoint.auth_headers:
        for k, v in endpoint.auth_headers.items():
            merged_headers[k] = v

    # Configure httpx client with connection pooling and timeout limits
    timeout = httpx.Timeout(10.0, connect=3.0)
    
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            start_time = time.time()
            response = await client.post(
                endpoint.target_url,
                content=payload_str,
                headers=merged_headers
            )
            elapsed = time.time() - start_time
            status_code = response.status_code
            
            if 200 <= response.status_code < 300:
                delivery_status_label = "success"
                print(f"[WORKER] Delivered successfully to {endpoint.target_url} (HTTP {status_code}) in {elapsed:.2f}s")
            else:
                delivery_status_label = "failed"
                error_msg = f"Target server returned non-2xx status: {status_code}"
                print(f"[WORKER] Target server failed: HTTP {status_code}")
                
        except httpx.TimeoutException:
            delivery_status_label = "failed"
            error_msg = "Timeout occurred connecting to target URL."
            print(f"[WORKER] Delivery timeout: {endpoint.target_url}")
        except Exception as e:
            delivery_status_label = "failed"
            error_msg = f"Network or execution error: {str(e)}"
            print(f"[WORKER] Delivery error: {str(e)}")

    # 4. Handle Success / Failure State Shifts and Retries
    if delivery_status_label == "success":
        log.delivery_status = "success"
        log.response_code = status_code
        log.error_message = None
        await db.commit()
        await register_success(db, endpoint_id)
        
    else:  # Delivery failed
        # Track failure in circuit breaker
        tripped = await register_failure(db, endpoint_id)
        
        # Decide on retrying
        max_retries_limit = endpoint.max_retries if endpoint.max_retries is not None else settings.MAX_RETRIES
        backoff_base_value = endpoint.backoff_base if endpoint.backoff_base is not None else settings.INITIAL_BACKOFF_BASE

        if retry_count < max_retries_limit and not tripped:
            # Calculate exponential backoff
            delay = backoff_base_value * (2 ** retry_count)
            log.delivery_status = "failed"
            log.response_code = status_code
            log.error_message = f"{error_msg} (Scheduling retry {retry_count + 1} in {delay}s)"
            await db.commit()
            
            # Enqueue next retry
            await enqueue_webhook_task(
                endpoint_id=endpoint_id,
                payload_string=payload_str,
                headers=headers,
                retry_count=retry_count + 1,
                delay_seconds=delay
            )
        else:
            # Drop the event (max retries reached or circuit breaker tripped)
            log.delivery_status = "dropped"
            log.response_code = status_code
            if tripped:
                log.error_message = f"Dropped: Circuit breaker tripped. Last error: {error_msg}"
            else:
                log.error_message = f"Dropped: Max retries ({max_retries_limit}) exceeded. Last error: {error_msg}"
            await db.commit()

            # Auto-create Webhook Incident in the database
            try:
                incident_res = await db.execute(
                    select(Incident)
                    .where(Incident.endpoint_id == endpoint_id, Incident.status != "done")
                )
                existing_incident = incident_res.scalars().first()
                
                if not existing_incident:
                    severity = "urgent" if tripped else "high"
                    title = f"Delivery failed for slug /p/{endpoint.slug}"
                    description = (
                        f"Webhook delivery has permanently failed.\n\n"
                        f"**Endpoint Name:** {endpoint.source_name}\n"
                        f"**Destination URL:** {endpoint.target_url}\n"
                        f"**Reason:** {log.error_message}\n"
                        f"**Last HTTP Code:** {status_code or 'N/A'}"
                    )
                    
                    new_incident = Incident(
                        endpoint_id=endpoint_id,
                        title=title,
                        description=description,
                        status="todo",
                        priority=severity
                    )
                    db.add(new_incident)
                    await db.commit()
                    print(f"[WORKER] Created Incident for dropped webhook on slug /p/{endpoint.slug}")
            except Exception as e:
                print(f"[WORKER ERROR] Failed to create database Incident: {e}")

            # Trigger Slack/Discord Alert Webhook if configured
            if endpoint.alert_webhook_url:
                await send_alert_webhook(endpoint, log.error_message, tripped=tripped)


    return Response(content="Task processed", status_code=status.HTTP_200_OK)
