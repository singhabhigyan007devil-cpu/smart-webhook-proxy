import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from backend.app.db import get_db
from backend.app.models import User, Project
from backend.app.routers.endpoints import get_current_user
from backend.app.schemas import ProjectResponse, ProjectCreate, ProjectUpdate

router = APIRouter()

@router.get("/projects", response_model=List[ProjectResponse])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Project).where(Project.user_id == current_user.id).order_by(Project.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_project = Project(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        name=payload.name,
        description=payload.description,
        status=payload.status or "started"
    )
    db.add(new_project)
    await db.commit()
    await db.refresh(new_project)
    
    # Broadcast project created event
    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "project_created",
            "data": ProjectResponse.model_validate(new_project).model_dump()
        })
    except Exception as ws_err:
        print(f"[WS POST PROJECT ERROR] Failed to broadcast: {ws_err}")

    return new_project

@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    result = await db.execute(query)
    project = result.scalars().first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    if payload.name is not None:
        project.name = payload.name
    if payload.description is not None:
        project.description = payload.description
    if payload.status is not None:
        project.status = payload.status
        
    await db.commit()
    await db.refresh(project)

    # Broadcast project updated event
    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "project_updated",
            "data": ProjectResponse.model_validate(project).model_dump()
        })
    except Exception as ws_err:
        print(f"[WS PATCH PROJECT ERROR] Failed to broadcast: {ws_err}")

    return project

@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    result = await db.execute(query)
    project = result.scalars().first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    await db.delete(project)
    await db.commit()

    # Broadcast project deleted event
    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "project_deleted",
            "data": {"id": project_id}
        })
    except Exception as ws_err:
        print(f"[WS DELETE PROJECT ERROR] Failed to broadcast: {ws_err}")

    return Response(status_code=status.HTTP_204_NO_CONTENT)
