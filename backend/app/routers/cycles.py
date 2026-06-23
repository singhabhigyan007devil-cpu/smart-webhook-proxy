from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from backend.app.db import get_db
from backend.app.models import Cycle, User
from backend.app.schemas import CycleCreate, CycleUpdate, CycleResponse
from backend.app.routers.endpoints import get_current_user

router = APIRouter(prefix="/api/cycles", tags=["cycles"])

@router.post("", response_model=CycleResponse, status_code=status.HTTP_201_CREATED)
async def create_cycle(
    payload: CycleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_cycle = Cycle(
        user_id=current_user.id,
        name=payload.name,
        description=payload.description,
        start_date=payload.start_date,
        end_date=payload.end_date,
        is_active=payload.is_active
    )
    db.add(new_cycle)
    await db.commit()
    await db.refresh(new_cycle)
    return new_cycle

@router.get("", response_model=List[CycleResponse])
async def list_cycles(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Cycle).where(Cycle.user_id == current_user.id).order_by(Cycle.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{cycle_id}", response_model=CycleResponse)
async def get_cycle(
    cycle_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Cycle).where(Cycle.id == cycle_id, Cycle.user_id == current_user.id)
    result = await db.execute(query)
    cycle = result.scalars().first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")
    return cycle

@router.patch("/{cycle_id}", response_model=CycleResponse)
async def update_cycle(
    cycle_id: str,
    payload: CycleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Cycle).where(Cycle.id == cycle_id, Cycle.user_id == current_user.id)
    result = await db.execute(query)
    cycle = result.scalars().first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(cycle, key, value)
        
    db.add(cycle)
    await db.commit()
    await db.refresh(cycle)
    return cycle

@router.delete("/{cycle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cycle(
    cycle_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Cycle).where(Cycle.id == cycle_id, Cycle.user_id == current_user.id)
    result = await db.execute(query)
    cycle = result.scalars().first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")
    
    await db.delete(cycle)
    await db.commit()
    return None
