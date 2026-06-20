from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from backend.app.config import settings
from backend.app.db import init_db, engine
from backend.app.routers import ingest, worker, endpoints, issues, workflows, projects, alert_channels, severity_priorities, analytics
from backend.app.routers import github

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    print("[SYSTEM] Starting HookShield Ingestion & Retry Engine...")
    
    # Initialize DB (Auto-creates SQLite file and tables locally)
    await init_db()
    print("[SYSTEM] Database connection initialized.")
    
    yield
    
    # Shutdown actions
    print("[SYSTEM] Shutting down HookShield Services...")
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
    allow_origins=["*"],  # For production, tighten this to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Router Endpoints
app.include_router(ingest.router)
app.include_router(worker.router)
app.include_router(endpoints.router, prefix="/api")
app.include_router(issues.router, prefix="/api")
app.include_router(workflows.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(alert_channels.router, prefix="/api")
app.include_router(severity_priorities.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")


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

app.include_router(github.router, prefix="/api/github", tags=["GitHub"])
