from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.app.db import get_db
from backend.app.models import User, Project
from backend.app.routers.endpoints import get_current_user

router = APIRouter()

class GitHubUserSettings(BaseModel):
    github_pat: str | None = None

class GitHubProjectSettings(BaseModel):
    project_id: str
    github_repo: str | None = None

@router.post("/user-settings")
async def update_github_user_settings(
    payload: GitHubUserSettings,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    current_user.github_pat = payload.github_pat
    await db.commit()
    return {"message": "GitHub PAT updated"}

@router.post("/project-settings")
async def update_github_project_settings(
    payload: GitHubProjectSettings,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Project).where(Project.id == payload.project_id, Project.user_id == current_user.id)
    result = await db.execute(query)
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        
    project.github_repo = payload.github_repo
    await db.commit()
    return {"message": "GitHub Repo configured"}
