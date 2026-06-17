import uuid
import secrets
from fastapi import APIRouter, Depends, HTTPException, status, Header, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, desc, case
from typing import List, Optional

from backend.app.db import get_db
from backend.app.models import User, Endpoint, WebhookLog
from backend.app.schemas import (
    EndpointCreate, EndpointUpdate, EndpointResponse,
    WebhookLogResponse, DashboardMetrics
)
from backend.app.cache import slug_cache

router = APIRouter()

# --- Auth Dependency ---
async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
) -> User:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization Header"
        )
    
    # Handle Bearer format
    token = authorization
    if authorization.startswith("Bearer "):
        token = authorization[7:]

    result = await db.execute(select(User).where(User.api_key == token))
    user = result.scalars().first()
    
    if not user:
        # For ease of testing, if the token is "default-dev-key", auto-create a user if none exists
        if token == "default-dev-key":
            result = await db.execute(select(User).where(User.email == "dev@hookshield.io"))
            dev_user = result.scalars().first()
            if not dev_user:
                dev_user = User(
                    id=str(uuid.uuid4()),
                    email="dev@hookshield.io",
                    api_key="default-dev-key",
                    tier="enterprise"
                )
                db.add(dev_user)
                await db.commit()
                await db.refresh(dev_user)
            return dev_user
            
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key"
        )
    return user

# --- Auth Routes ---
@router.post("/auth/register", status_code=status.HTTP_201_CREATED)
async def register_user(email: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == email))
    existing = result.scalars().first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already registered"
        )
    
    new_user = User(
        id=str(uuid.uuid4()),
        email=email,
        api_key=f"hs_{secrets.token_hex(16)}",
        tier="free"
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return {
        "id": new_user.id,
        "email": new_user.email,
        "api_key": new_user.api_key,
        "tier": new_user.tier
    }

@router.post("/auth/login")
async def login_user(api_key: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.api_key == api_key))
    user = result.scalars().first()
    if not user:
        # Local ease of access: if they type email, look up or create. Otherwise, require API key.
        if "@" in api_key:
            # Auto login/signup by email for demo simplicity
            result = await db.execute(select(User).where(User.email == api_key))
            user = result.scalars().first()
            if not user:
                user = User(
                    id=str(uuid.uuid4()),
                    email=api_key,
                    api_key=f"hs_{secrets.token_hex(16)}",
                    tier="free"
                )
                db.add(user)
                await db.commit()
                await db.refresh(user)
            return {
                "id": user.id,
                "email": user.email,
                "api_key": user.api_key,
                "tier": user.tier
            }
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key"
        )
    return {
        "id": user.id,
        "email": user.email,
        "api_key": user.api_key,
        "tier": user.tier
    }

# --- Endpoint CRUD ---
@router.post("/endpoints", response_model=EndpointResponse, status_code=status.HTTP_201_CREATED)
async def create_endpoint(
    payload: EndpointCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Auto-generate slug and secret if not provided
    slug = payload.slug or secrets.token_urlsafe(8).lower()
    secret_token = payload.secret_token or f"whsec_{secrets.token_hex(12)}"
    
    # Check slug uniqueness
    result = await db.execute(select(Endpoint).where(Endpoint.slug == slug))
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Endpoint slug already in use"
        )
        
    endpoint = Endpoint(
        user_id=current_user.id,
        slug=slug,
        source_name=payload.source_name,
        secret_token=secret_token,
        target_url=payload.target_url,
        active_state=True,
        alert_webhook_url=payload.alert_webhook_url,
        auth_headers=payload.auth_headers,
        max_retries=payload.max_retries,
        backoff_base=payload.backoff_base
    )
    db.add(endpoint)
    await db.commit()
    await db.refresh(endpoint)
    
    # Invalidate cache just in case
    slug_cache.invalidate(slug)
    
    return endpoint

@router.get("/endpoints", response_model=List[EndpointResponse])
async def list_endpoints(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Endpoint).where(Endpoint.user_id == current_user.id).order_by(desc(Endpoint.created_at))
    result = await db.execute(query)
    return result.scalars().all()

@router.patch("/endpoints/{endpoint_id}", response_model=EndpointResponse)
async def update_endpoint(
    endpoint_id: str,
    payload: EndpointUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Endpoint)
        .where(Endpoint.id == endpoint_id, Endpoint.user_id == current_user.id)
    )
    endpoint = result.scalars().first()
    if not endpoint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found"
        )
        
    # Update fields
    if payload.source_name is not None:
        endpoint.source_name = payload.source_name
    if payload.target_url is not None:
        endpoint.target_url = payload.target_url
    if payload.secret_token is not None:
        endpoint.secret_token = payload.secret_token
    if payload.active_state is not None:
        endpoint.active_state = payload.active_state
        # If toggled active, clear failure count
        if payload.active_state:
            endpoint.failure_count = 0
    if payload.alert_webhook_url is not None:
        endpoint.alert_webhook_url = payload.alert_webhook_url
    if payload.auth_headers is not None:
        endpoint.auth_headers = payload.auth_headers
    if payload.max_retries is not None:
        endpoint.max_retries = payload.max_retries
    if payload.backoff_base is not None:
        endpoint.backoff_base = payload.backoff_base

            
    await db.commit()
    await db.refresh(endpoint)
    
    # Invalidate cache
    slug_cache.invalidate(endpoint.slug)
    
    return endpoint

@router.delete("/endpoints/{endpoint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_endpoint(
    endpoint_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Endpoint)
        .where(Endpoint.id == endpoint_id, Endpoint.user_id == current_user.id)
    )
    endpoint = result.scalars().first()
    if not endpoint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found"
        )
        
    slug_cache.invalidate(endpoint.slug)
    await db.delete(endpoint)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

# --- Logs Query ---
@router.get("/endpoints/{endpoint_id}/logs", response_model=List[WebhookLogResponse])
async def list_endpoint_logs(
    endpoint_id: str,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify ownership
    result = await db.execute(
        select(Endpoint)
        .where(Endpoint.id == endpoint_id, Endpoint.user_id == current_user.id)
    )
    if not result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found"
        )
        
    logs_result = await db.execute(
        select(WebhookLog)
        .where(WebhookLog.endpoint_id == endpoint_id)
        .order_by(desc(WebhookLog.created_at))
        .limit(limit)
    )
    return logs_result.scalars().all()

@router.get("/logs", response_model=List[WebhookLogResponse])
async def list_all_logs(
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    logs_result = await db.execute(
        select(WebhookLog)
        .join(Endpoint, WebhookLog.endpoint_id == Endpoint.id)
        .where(Endpoint.user_id == current_user.id)
        .order_by(desc(WebhookLog.created_at))
        .limit(limit)
    )
    return logs_result.scalars().all()

# --- Dashboard Metrics ---
@router.get("/metrics", response_model=DashboardMetrics)
async def get_dashboard_metrics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Fetch active endpoints count
    endpoints_result = await db.execute(
        select(func.count(Endpoint.id))
        .where(Endpoint.user_id == current_user.id, Endpoint.active_state == True)
    )
    active_endpoints = endpoints_result.scalar() or 0

    # Fetch logs summary
    logs_result = await db.execute(
        select(
            func.count(WebhookLog.id),
            func.sum(case((WebhookLog.delivery_status == "success", 1), else_=0)),
            func.sum(case((WebhookLog.delivery_status == "pending", 1), else_=0)),
            func.sum(case((WebhookLog.delivery_status == "failed", 1), else_=0))
        )
        .join(Endpoint, WebhookLog.endpoint_id == Endpoint.id)
        .where(Endpoint.user_id == current_user.id)
    )
    stats = logs_result.first()
    
    total_processed = stats[0] if stats and stats[0] else 0
    success_count = stats[1] if stats and stats[1] else 0
    pending_count = stats[2] if stats and stats[2] else 0
    failed_count = stats[3] if stats and stats[3] else 0
    
    # Success Rate: success / (success + failed + dropped)
    # Exclude pending events in calculations to not skew new metrics
    total_completed = total_processed - pending_count
    if total_completed > 0:
        success_rate = (success_count / total_completed) * 100
    else:
        success_rate = 100.0

    return DashboardMetrics(
        success_rate=round(success_rate, 2),
        active_endpoints=active_endpoints,
        pending_retries=pending_count + failed_count, # Failed represents awaiting next retry loop
        total_processed=total_processed
    )
