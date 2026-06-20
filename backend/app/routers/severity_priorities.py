import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from backend.app.db import get_db
from backend.app.models import User, SeverityPriority
from backend.app.routers.endpoints import get_current_user
from backend.app.schemas import (
    SeverityPriorityResponse, SeverityPriorityCreate, SeverityPriorityUpdate
)

router = APIRouter()

async def seed_default_priorities(db: AsyncSession, user_id: str) -> List[SeverityPriority]:
    defaults = [
        {"name": "Low", "color": "hsl(210, 40%, 65%)", "rank": 3, "threshold_failures": 1},
        {"name": "Medium", "color": "hsl(35, 90%, 55%)", "rank": 2, "threshold_failures": 3},
        {"name": "High", "color": "hsl(0, 85%, 60%)", "rank": 1, "threshold_failures": 5}
    ]
    created = []
    for d in defaults:
        sp = SeverityPriority(
            id=str(uuid.uuid4()),
            user_id=user_id,
            name=d["name"],
            color=d["color"],
            rank=d["rank"],
            threshold_failures=d["threshold_failures"],
            alert_channel_id=None
        )
        db.add(sp)
        created.append(sp)
    await db.commit()
    for sp in created:
        await db.refresh(sp)
    return created

@router.get("/severity-priorities", response_model=List[SeverityPriorityResponse])
async def list_severity_priorities(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(SeverityPriority).where(SeverityPriority.user_id == current_user.id).order_by(SeverityPriority.rank.asc())
    result = await db.execute(query)
    priorities = result.scalars().all()
    
    if not priorities:
        # Seeding defaults on first fetch if none configured
        priorities = await seed_default_priorities(db, current_user.id)
        
    return priorities

@router.post("/severity-priorities", response_model=SeverityPriorityResponse, status_code=status.HTTP_201_CREATED)
async def create_severity_priority(
    payload: SeverityPriorityCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_priority = SeverityPriority(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        name=payload.name,
        color=payload.color,
        rank=payload.rank,
        threshold_failures=payload.threshold_failures,
        alert_channel_id=payload.alert_channel_id
    )
    db.add(new_priority)
    await db.commit()
    await db.refresh(new_priority)
    
    # Broadcast creation event
    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "severity_priority_created",
            "data": SeverityPriorityResponse.model_validate(new_priority).model_dump()
        })
    except Exception as ws_err:
        print(f"[WS SEVERITY ERROR] Failed to broadcast creation: {ws_err}")
        
    return new_priority

@router.patch("/severity-priorities/{priority_id}", response_model=SeverityPriorityResponse)
async def update_severity_priority(
    priority_id: str,
    payload: SeverityPriorityUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(SeverityPriority).where(SeverityPriority.id == priority_id, SeverityPriority.user_id == current_user.id)
    result = await db.execute(query)
    priority = result.scalars().first()
    
    if not priority:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Severity priority not found"
        )
        
    if payload.name is not None:
        priority.name = payload.name
    if payload.color is not None:
        priority.color = payload.color
    if payload.rank is not None:
        priority.rank = payload.rank
    if payload.threshold_failures is not None:
        priority.threshold_failures = payload.threshold_failures
    if payload.alert_channel_id is not None:
        # Allow setting to None if string "none" or null
        priority.alert_channel_id = None if payload.alert_channel_id in ("none", "", None) else payload.alert_channel_id
        
    await db.commit()
    await db.refresh(priority)
    
    # Broadcast update event
    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "severity_priority_updated",
            "data": SeverityPriorityResponse.model_validate(priority).model_dump()
        })
    except Exception as ws_err:
        print(f"[WS SEVERITY ERROR] Failed to broadcast update: {ws_err}")
        
    return priority

@router.delete("/severity-priorities/{priority_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_severity_priority(
    priority_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(SeverityPriority).where(SeverityPriority.id == priority_id, SeverityPriority.user_id == current_user.id)
    result = await db.execute(query)
    priority = result.scalars().first()
    
    if not priority:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Severity priority not found"
        )
        
    await db.delete(priority)
    await db.commit()
    
    # Broadcast deletion event
    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "severity_priority_deleted",
            "data": {"id": priority_id}
        })
    except Exception as ws_err:
        print(f"[WS SEVERITY ERROR] Failed to broadcast deletion: {ws_err}")
        
    return Response(status_code=status.HTTP_204_NO_CONTENT)
