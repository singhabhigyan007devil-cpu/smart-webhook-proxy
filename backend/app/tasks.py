import json
import asyncio
import time
from typing import Dict, Any, Optional
import httpx
from backend.app.config import settings

# Global local queue for mock execution
_local_queue = asyncio.Queue()

# Simple mock worker registry to keep track of running tasks locally
active_local_tasks = set()

async def execute_local_task_after_delay(delay: float, task_data: Dict[str, Any]) -> None:
    # Simulate Cloud Tasks dispatch delay
    if delay > 0:
        await asyncio.sleep(delay)
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            # We call the local worker route to process the webhook
            response = await client.post(
                settings.WORKER_URL,
                json=task_data,
                headers={"Content-Type": "application/json"}
            )
            print(f"[LOCAL WORKER RUNNER] Dispatched log. Response status: {response.status_code}")
        except Exception as e:
            print(f"[LOCAL WORKER RUNNER] Error calling worker endpoint: {e}")

async def enqueue_webhook_task(
    endpoint_id: str,
    payload_string: str,
    headers: Dict[str, str],
    retry_count: int = 0,
    delay_seconds: float = 0.0
) -> None:
    task_data = {
        "endpoint_id": endpoint_id,
        "payload_string": payload_string,
        "headers": headers,
        "retry_count": retry_count
    }

    if settings.USE_LOCAL_QUEUE:
        # Schedule the execution as a background task
        loop = asyncio.get_event_loop()
        future = asyncio.create_task(execute_local_task_after_delay(delay_seconds, task_data))
        active_local_tasks.add(future)
        future.add_done_callback(active_local_tasks.discard)
        print(f"[QUEUE] Enqueued webhook local task with delay={delay_seconds}s (Attempt: {retry_count})")
        return

    # Production Google Cloud Tasks Queue
    try:
        from google.cloud import tasks_v2
        from google.protobuf import timestamp_pb2
        
        client = tasks_v2.CloudTasksClient()
        parent = client.queue_path(
            settings.GCP_PROJECT_ID,
            settings.GCP_LOCATION,
            settings.GCP_QUEUE_ID
        )

        task = {
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                "url": settings.WORKER_URL,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps(task_data).encode("utf-8"),
                "oidc_token": {
                    "service_account_email": settings.GCP_SERVICE_ACCOUNT_EMAIL,
                    "audience": settings.WORKER_URL
                }
            }
        }

        if delay_seconds > 0:
            target_time = time.time() + delay_seconds
            timestamp = timestamp_pb2.Timestamp()
            timestamp.FromSeconds(int(target_time))
            task["schedule_time"] = timestamp

        client.create_task(request={"parent": parent, "task": task})
        print(f"[QUEUE] Enqueued GCP Cloud Task (Attempt: {retry_count})")
        
    except Exception as e:
        print(f"[QUEUE ERROR] Failed to push to Google Cloud Tasks: {e}. Falling back to local queue.")
        # Fallback to local execution
        loop = asyncio.get_event_loop()
        future = asyncio.create_task(execute_local_task_after_delay(delay_seconds, task_data))
        active_local_tasks.add(future)
        future.add_done_callback(active_local_tasks.discard)
