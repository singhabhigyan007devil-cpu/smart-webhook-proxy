import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from backend.app.db import get_db
from backend.app.models import User, Project, ProjectMilestone
from backend.app.routers.endpoints import get_current_user
from backend.app.schemas import (
    ProjectResponse, ProjectCreate, ProjectUpdate,
    ProjectMilestoneResponse, ProjectMilestoneCreate, ProjectMilestoneUpdate
)

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
        status=payload.status or "started",
        target_date=payload.target_date
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
    if "target_date" in payload.model_fields_set:
        project.target_date = payload.target_date
        
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


# --- Milestone Endpoints ---

@router.get("/projects/{project_id}/milestones", response_model=List[ProjectMilestoneResponse])
async def list_project_milestones(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify project exists and is owned by current user
    proj_query = select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    proj_res = await db.execute(proj_query)
    if not proj_res.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    query = select(ProjectMilestone).where(ProjectMilestone.project_id == project_id).order_by(ProjectMilestone.target_date.asc())
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/projects/{project_id}/milestones", response_model=ProjectMilestoneResponse, status_code=status.HTTP_201_CREATED)
async def create_project_milestone(
    project_id: str,
    payload: ProjectMilestoneCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify project exists and is owned by current user
    proj_query = select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    proj_res = await db.execute(proj_query)
    if not proj_res.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    new_milestone = ProjectMilestone(
        id=str(uuid.uuid4()),
        project_id=project_id,
        name=payload.name,
        description=payload.description,
        status=payload.status or "open",
        target_date=payload.target_date
    )
    db.add(new_milestone)
    await db.commit()
    await db.refresh(new_milestone)

    # Broadcast milestone created event
    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "milestone_created",
            "data": ProjectMilestoneResponse.model_validate(new_milestone).model_dump()
        })
    except Exception as ws_err:
        print(f"[WS POST MILESTONE ERROR] Failed to broadcast: {ws_err}")

    return new_milestone

@router.patch("/milestones/{milestone_id}", response_model=ProjectMilestoneResponse)
async def update_project_milestone(
    milestone_id: str,
    payload: ProjectMilestoneUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify milestone exists and belongs to a project owned by the current user
    query = (
        select(ProjectMilestone)
        .join(Project, ProjectMilestone.project_id == Project.id)
        .where(ProjectMilestone.id == milestone_id, Project.user_id == current_user.id)
    )
    result = await db.execute(query)
    milestone = result.scalars().first()
    if not milestone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Milestone not found"
        )

    if payload.name is not None:
        milestone.name = payload.name
    if payload.description is not None:
        milestone.description = payload.description
    if payload.status is not None:
        milestone.status = payload.status
    if payload.target_date is not None:
        milestone.target_date = payload.target_date

    await db.commit()
    await db.refresh(milestone)

    # Broadcast milestone updated event
    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "milestone_updated",
            "data": ProjectMilestoneResponse.model_validate(milestone).model_dump()
        })
    except Exception as ws_err:
        print(f"[WS PATCH MILESTONE ERROR] Failed to broadcast: {ws_err}")

    return milestone

@router.delete("/milestones/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_milestone(
    milestone_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify milestone exists and belongs to a project owned by the current user
    query = (
        select(ProjectMilestone)
        .join(Project, ProjectMilestone.project_id == Project.id)
        .where(ProjectMilestone.id == milestone_id, Project.user_id == current_user.id)
    )
    result = await db.execute(query)
    milestone = result.scalars().first()
    if not milestone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Milestone not found"
        )

    await db.delete(milestone)
    await db.commit()

    # Broadcast milestone deleted event
    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "milestone_deleted",
            "data": {"id": milestone_id}
        })
    except Exception as ws_err:
        print(f"[WS DELETE MILESTONE ERROR] Failed to broadcast: {ws_err}")

    return Response(status_code=status.HTTP_204_NO_CONTENT)

