from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from backend.app.db import get_db
from backend.app.models import User, Endpoint, Incident, IncidentComment
from backend.app.routers.endpoints import get_current_user
from backend.app.schemas import (
    IncidentResponse, IncidentUpdate,
    IncidentCommentResponse, IncidentCommentCreate
)

router = APIRouter()

@router.get("/incidents", response_model=List[IncidentResponse])
async def list_incidents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Retrieve all incidents for endpoints owned by the current user
    query = (
        select(Incident)
        .join(Endpoint, Incident.endpoint_id == Endpoint.id)
        .where(Endpoint.user_id == current_user.id)
        .order_by(Incident.created_at.desc())
    )
    result = await db.execute(query)
    return result.scalars().all()

@router.patch("/incidents/{incident_id}", response_model=IncidentResponse)
async def update_incident(
    incident_id: str,
    payload: IncidentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify owner of endpoint related to the incident
    query = (
        select(Incident)
        .join(Endpoint, Incident.endpoint_id == Endpoint.id)
        .where(Incident.id == incident_id, Endpoint.user_id == current_user.id)
    )
    result = await db.execute(query)
    incident = result.scalars().first()
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found"
        )
    
    if payload.status is not None:
        incident.status = payload.status
    if payload.priority is not None:
        incident.priority = payload.priority
    if payload.assignee is not None:
        incident.assignee = payload.assignee or None
        
    await db.commit()
    await db.refresh(incident)
    return incident

@router.get("/incidents/{incident_id}/comments", response_model=List[IncidentCommentResponse])
async def list_incident_comments(
    incident_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify incident owner
    query = (
        select(Incident)
        .join(Endpoint, Incident.endpoint_id == Endpoint.id)
        .where(Incident.id == incident_id, Endpoint.user_id == current_user.id)
    )
    result = await db.execute(query)
    if not result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found"
        )

    comments_query = (
        select(IncidentComment)
        .where(IncidentComment.incident_id == incident_id)
        .order_by(IncidentComment.created_at.asc())
    )
    comments_result = await db.execute(comments_query)
    return comments_result.scalars().all()

@router.post("/incidents/{incident_id}/comments", response_model=IncidentCommentResponse, status_code=status.HTTP_201_CREATED)
async def create_incident_comment(
    incident_id: str,
    payload: IncidentCommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify incident owner
    query = (
        select(Incident)
        .join(Endpoint, Incident.endpoint_id == Endpoint.id)
        .where(Incident.id == incident_id, Endpoint.user_id == current_user.id)
    )
    result = await db.execute(query)
    if not result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found"
        )

    new_comment = IncidentComment(
        incident_id=incident_id,
        commenter=payload.commenter,
        body=payload.body
    )
    db.add(new_comment)
    await db.commit()
    await db.refresh(new_comment)
    return new_comment
