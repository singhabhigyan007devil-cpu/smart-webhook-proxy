from fastapi import APIRouter, Depends, HTTPException, status, Response
from pydantic import BaseModel
from typing import Dict, Any, Optional
import httpx
import time
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.app.db import get_db
from backend.app.models import Endpoint, WebhookLog, Issue
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


async def dispatch_channels_alerts(endpoint, error_message: str, tripped: bool, db: AsyncSession, matched_priority = None):
    from backend.app.models import AlertChannel
    from sqlalchemy.future import select
    import httpx

    try:
        if matched_priority and matched_priority.alert_channel_id:
            query = select(AlertChannel).where(
                AlertChannel.id == matched_priority.alert_channel_id,
                AlertChannel.user_id == endpoint.user_id,
                AlertChannel.is_active == True
            )
        else:
            query = select(AlertChannel).where(
                AlertChannel.user_id == endpoint.user_id,
                AlertChannel.is_active == True
            )
        result = await db.execute(query)
        channels = result.scalars().all()
        
        if not channels:
            return

        alert_title = "🚨 *HookShield Alert Notification*" if not tripped else "⚠️ *HookShield Circuit Breaker Tripped*"
        msg = f"{alert_title}\n*Endpoint:* `/p/{endpoint.slug}`\n*Target URL:* {endpoint.target_url}\n*Reason:* {error_message or 'Max retries exhausted'}"

        async with httpx.AsyncClient() as client:
            for channel in channels:
                try:
                    if channel.channel_type == "slack":
                        webhook_url = channel.config.get("webhook_url")
                        if webhook_url:
                            await client.post(webhook_url, json={"text": msg}, timeout=5.0)
                            print(f"[ALERT] Dispatched Slack alert to channel '{channel.name}'")
                    elif channel.channel_type == "discord":
                        webhook_url = channel.config.get("webhook_url")
                        if webhook_url:
                            discord_msg = msg.replace("*", "**")
                            await client.post(webhook_url, json={"content": discord_msg}, timeout=5.0)
                            print(f"[ALERT] Dispatched Discord alert to channel '{channel.name}'")
                    elif channel.channel_type == "email":
                        recipient_email = channel.config.get("recipient_email")
                        if recipient_email:
                            print(f"[ALERT EMAIL] Sending to {recipient_email} - Body: {msg}")
                except Exception as e:
                    print(f"[ALERT ERROR] Failed to dispatch to channel '{channel.name}': {e}")
    except Exception as outer_err:
        print(f"[ALERT CHANNEL OUTER ERROR] {outer_err}")



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
        retry_count=retry_count,
        latency_ms=None # Will be updated after request
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
        if status_code is not None:
            log.latency_ms = int(elapsed * 1000)
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
            if status_code is not None:
                log.latency_ms = int(elapsed * 1000)
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
            if status_code is not None:
                log.latency_ms = int(elapsed * 1000)
            if tripped:
                log.error_message = f"Dropped: Circuit breaker tripped. Last error: {error_msg}"
            else:
                log.error_message = f"Dropped: Max retries ({max_retries_limit}) exceeded. Last error: {error_msg}"
            await db.commit()

            # Auto-create Webhook Issue in the database
            try:
                issue_res = await db.execute(
                    select(Issue)
                    .where(Issue.endpoint_id == endpoint_id, Issue.status != "done")
                )
                existing_issue = issue_res.scalars().first()
                
                # Fetch user's custom severity priorities
                from backend.app.models import SeverityPriority
                pri_query = select(SeverityPriority).where(
                    SeverityPriority.user_id == endpoint.user_id
                ).order_by(SeverityPriority.threshold_failures.desc())
                pri_res = await db.execute(pri_query)
                custom_priorities = pri_res.scalars().all()
                
                matched_priority = None
                for cp in custom_priorities:
                    if endpoint.failure_count >= cp.threshold_failures:
                        matched_priority = cp
                        break
                        
                severity = matched_priority.name if matched_priority else ("urgent" if tripped else "high")
                
                if not existing_issue:
                    title = f"Delivery failed for slug /p/{endpoint.slug}"
                    description = (
                        f"Webhook delivery has permanently failed.\n\n"
                        f"**Endpoint Name:** {endpoint.source_name}\n"
                        f"**Destination URL:** {endpoint.target_url}\n"
                        f"**Reason:** {log.error_message}\n"
                        f"**Last HTTP Code:** {status_code or 'N/A'}"
                    )
                    
                    new_issue = Issue(
                        endpoint_id=endpoint_id,
                        title=title,
                        description=description,
                        status="todo",
                        priority=severity
                    )
                    db.add(new_issue)
                    await db.commit()
                    
                    # Broadcast creation event
                    try:
                        from backend.app.websockets import manager
                        from backend.app.schemas import IssueResponse
                        await manager.broadcast({
                            "event": "issue_created",
                            "data": IssueResponse.model_validate(new_issue).model_dump()
                        })
                    except Exception as ws_err:
                        print(f"[WORKER WS ERROR] Failed to broadcast issue creation: {ws_err}")

                    print(f"[WORKER] Created Issue for dropped webhook on slug /p/{endpoint.slug}")
                else:
                    # Escalation check
                    if existing_issue.priority != severity:
                        existing_issue.priority = severity
                        await db.commit()
                        await db.refresh(existing_issue)
                        
                        # Broadcast update event
                        try:
                            from backend.app.websockets import manager
                            from backend.app.schemas import IssueResponse
                            await manager.broadcast({
                                "event": "issue_updated",
                                "data": IssueResponse.model_validate(existing_issue).model_dump()
                            })
                        except Exception as ws_err:
                            print(f"[WORKER WS ERROR] Failed to broadcast issue update: {ws_err}")
                            
            except Exception as e:
                print(f"[WORKER ERROR] Failed to create/update database Issue: {e}")

            # Trigger Slack/Discord Alert Webhook if configured
            if endpoint.alert_webhook_url:
                await send_alert_webhook(endpoint, log.error_message, tripped=tripped)

            # Trigger centralized Alert Channels (routed to custom alert channel if matched)
            await dispatch_channels_alerts(endpoint, log.error_message, tripped=tripped, db=db, matched_priority=matched_priority)



    return Response(content="Task processed", status_code=status.HTTP_200_OK)
