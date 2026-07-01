from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from backend.app.config import settings
from backend.app.db import init_db, engine
from backend.app.routers import (
    ingest, worker, endpoints, issues, projects,
    alert_channels, severity_priorities, analytics,
    auth, oauth, automations, cycles, uploads, workflows, github
)

import asyncio
from datetime import datetime, timezone
from sqlalchemy import delete
from backend.app.db import AsyncSessionLocal
from backend.app.models import IdempotencyKey

async def periodic_idempotency_cleanup():
    print("[SYSTEM] Starting Idempotency Key Cleanup Task loop...")
    while True:
        try:
            await asyncio.sleep(60)
            now = datetime.now(timezone.utc)
            async with AsyncSessionLocal() as db:
                stmt = delete(IdempotencyKey).where(IdempotencyKey.expires_at < now)
                res = await db.execute(stmt)
                await db.commit()
                deleted_count = res.rowcount
                if deleted_count > 0:
                    print(f"[SYSTEM CLEANUP] Pruned {deleted_count} expired idempotency keys.")
        except asyncio.CancelledError:
            print("[SYSTEM CLEANUP] Cleanup task cancelled.")
            break
        except Exception as e:
            print(f"[SYSTEM CLEANUP ERROR] Exception during idempotency cleanup: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    print("[SYSTEM] Starting HookShield Ingestion & Retry Engine...")
    
    # Initialize DB (Auto-creates SQLite file and tables locally)
    await init_db()
    print("[SYSTEM] Database connection initialized.")
    
    cleanup_task = asyncio.create_task(periodic_idempotency_cleanup())
    
    yield
    
    # Shutdown actions
    print("[SYSTEM] Shutting down HookShield Services...")
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    await engine.dispose()
    print("[SYSTEM] Connection pools closed.")

app = FastAPI(
    title="HookShield",
    description="Enterprise-grade Webhook Proxy and Retrier Engine",
    version="1.0.0",
    lifespan=lifespan
)

# Apply CORS middleware to enable communication with the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# Mount Router Endpoints
app.include_router(ingest.router)
app.include_router(worker.router)
app.include_router(endpoints.router, prefix="/api")
app.include_router(issues.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(alert_channels.router, prefix="/api")
app.include_router(severity_priorities.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(automations.router)
app.include_router(auth.router)
app.include_router(oauth.router)
app.include_router(cycles.router)
app.include_router(uploads.router)
app.include_router(workflows.router, prefix="/api")
app.include_router(github.router, prefix="/api/github")


# Real-Time WebSocket Endpoint
from backend.app.websockets import manager

@app.websocket("/ws/dashboard")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"[WS ERROR] Connection exception: {e}")
        manager.disconnect(websocket)

@app.get("/")
async def root_redirect():
    return RedirectResponse(url="/docs")

@app.get("/healthz")
async def health_check():
    return {"status": "healthy", "service": "HookShield"}
