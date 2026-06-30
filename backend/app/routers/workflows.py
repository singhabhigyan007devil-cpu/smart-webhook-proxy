from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from backend.app.db import get_db
from backend.app.models import User, WorkflowStatus, CustomField
from backend.app.routers.endpoints import get_current_user
from backend.app.schemas import (
    WorkflowStatusCreate, WorkflowStatusResponse, WorkflowStatusUpdate,
    CustomFieldCreate, CustomFieldResponse
)

router = APIRouter()

@router.get("/workflows/statuses", response_model=List[WorkflowStatusResponse])
async def list_workflow_statuses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(WorkflowStatus).where(WorkflowStatus.user_id == current_user.id).order_by(WorkflowStatus.order_index.asc())
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/workflows/statuses", response_model=WorkflowStatusResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow_status(
    payload: WorkflowStatusCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_status = WorkflowStatus(
        user_id=current_user.id,
        name=payload.name,
        color=payload.color,
        order_index=payload.order_index
    )
    db.add(new_status)
    await db.commit()
    await db.refresh(new_status)
    return new_status

@router.patch("/workflows/statuses/{status_id}", response_model=WorkflowStatusResponse)
async def update_workflow_status(
    status_id: str,
    payload: WorkflowStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(WorkflowStatus).where(WorkflowStatus.id == status_id, WorkflowStatus.user_id == current_user.id)
    result = await db.execute(query)
    ws = result.scalars().first()
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Status not found")

    if payload.name is not None: ws.name = payload.name
    if payload.color is not None: ws.color = payload.color
    if payload.order_index is not None: ws.order_index = payload.order_index

    await db.commit()
    await db.refresh(ws)
    return ws

@router.delete("/workflows/statuses/{status_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow_status(
    status_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(WorkflowStatus).where(WorkflowStatus.id == status_id, WorkflowStatus.user_id == current_user.id)
    result = await db.execute(query)
    ws = result.scalars().first()
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Status not found")

    await db.delete(ws)
    await db.commit()


@router.get("/workflows/custom_fields", response_model=List[CustomFieldResponse])
async def list_custom_fields(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(CustomField).where(CustomField.user_id == current_user.id).order_by(CustomField.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/workflows/custom_fields", response_model=CustomFieldResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_field(
    payload: CustomFieldCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_cf = CustomField(
        user_id=current_user.id,
        name=payload.name,
        field_type=payload.field_type
    )
    db.add(new_cf)
    await db.commit()
    await db.refresh(new_cf)
    return new_cf

@router.delete("/workflows/custom_fields/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_field(
    field_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(CustomField).where(CustomField.id == field_id, CustomField.user_id == current_user.id)
    result = await db.execute(query)
    cf = result.scalars().first()
    if not cf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")

    await db.delete(cf)
    await db.commit()

