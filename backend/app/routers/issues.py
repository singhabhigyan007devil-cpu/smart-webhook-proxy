import httpx
import asyncio
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified
from backend.app.automations_engine import evaluate_and_fire_automations
from fastapi import BackgroundTasks

from typing import List, Optional

from backend.app.db import get_db
from backend.app.models import User, Endpoint, Issue, IssueComment, Project, IssueCustomValue
from backend.app.routers.endpoints import get_current_user
from backend.app.schemas import (
    IssueResponse, IssueCreate, IssueUpdate,
    IssueCommentResponse, IssueCommentCreate
)

router = APIRouter()

@router.get("/issues", response_model=List[IssueResponse])
async def list_issues(
    search: Optional[str] = None,
    status: Optional[str] = None,
    issue_type: Optional[str] = None,
    priority: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Retrieve all issues owned by the current user
    query = (
        select(Issue)
        .options(selectinload(Issue.custom_values))
        .where(Issue.user_id == current_user.id)
    )
    
    if search:
        query = query.where(Issue.title.ilike(f"%{search}%") | Issue.description.ilike(f"%{search}%"))
    if status:
        query = query.where(Issue.status == status)
    if issue_type:
        query = query.where(Issue.issue_type == issue_type)
    if priority:
        query = query.where(Issue.priority == priority)
        
    query = query.order_by(Issue.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/issues", response_model=IssueResponse, status_code=status.HTTP_201_CREATED)
async def create_issue(
    payload: IssueCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if payload.endpoint_id:
        endp_q = select(Endpoint).where(Endpoint.id == payload.endpoint_id, Endpoint.user_id == current_user.id)
        endp_r = await db.execute(endp_q)
        if not endp_r.scalars().first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Endpoint not found")
            
    if payload.project_id:
        proj_q = select(Project).where(Project.id == payload.project_id, Project.user_id == current_user.id)
        proj_r = await db.execute(proj_q)
        if not proj_r.scalars().first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project not found")

    new_issue = Issue(
        user_id=current_user.id,
        endpoint_id=payload.endpoint_id,
        project_id=payload.project_id,
        parent_id=payload.parent_id,
        tags=payload.tags,
        issue_type=payload.issue_type,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        story_points=payload.story_points,
        assignee=payload.assignee
    )
    db.add(new_issue)
    await db.flush()
    
    if payload.custom_values:
        for cv in payload.custom_values:
            val = IssueCustomValue(
                issue_id=new_issue.id,
                field_id=cv.field_id,
                value_text=cv.value_text
            )
            db.add(val)
            
    await db.commit()
    await db.refresh(new_issue)
    
    # Needs to be re-fetched to load custom_values relationship correctly
    query = select(Issue).options(selectinload(Issue.custom_values)).where(Issue.id == new_issue.id)
    result = await db.execute(query)
    issue_full = result.scalars().first()

    
    # Sync to GitHub if configured
    if current_user.github_pat and payload.project_id:
        proj_q2 = select(Project).where(Project.id == payload.project_id)
        proj_r2 = await db.execute(proj_q2)
        project = proj_r2.scalars().first()
        if project and project.github_repo:
            try:
                # Fire and forget GitHub issue creation
                async def create_github_issue(pat, repo, title, body):
                    async with httpx.AsyncClient() as client:
                        resp = await client.post(
                            f"https://api.github.com/repos/{repo}/issues",
                            headers={
                                "Authorization": f"token {pat}",
                                "Accept": "application/vnd.github.v3+json",
                                "User-Agent": "HookShield-App"
                            },
                            json={"title": title, "body": body}
                        )
                        if resp.status_code == 201:
                            data = resp.json()
                            return data.get("number"), data.get("html_url")
                        return None, None
                        
                number, url = await create_github_issue(
                    current_user.github_pat, 
                    project.github_repo, 
                    issue_full.title, 
                    issue_full.description or "Created from HookShield"
                )
                
                if number and url:
                    issue_full.github_issue_number = number
                    issue_full.github_issue_url = url
                    await db.commit()
                    await db.refresh(issue_full)
            except Exception as e:
                print(f"Failed to sync to GitHub: {e}")

    # Broadcast create event
    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "issue_created",
            "data": IssueResponse.model_validate(issue_full).model_dump()
        })
    except Exception as ws_err:
        pass

    # Evaluate Automations
    issue_dict = {c.name: getattr(issue_full, c.name) for c in issue_full.__table__.columns}
    background_tasks.add_task(evaluate_and_fire_automations, current_user.id, "issue.created", issue_dict)
    
    return issue_full

@router.patch("/issues/{issue_id}", response_model=IssueResponse)
async def update_issue(
    issue_id: str,
    payload: IssueUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Issue)
        .options(selectinload(Issue.custom_values))
        .where(Issue.id == issue_id, Issue.user_id == current_user.id)
    )
    result = await db.execute(query)
    issue = result.scalars().first()
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Issue not found"
        )
    
    update_data = payload.model_dump(exclude_unset=True)
    old_issue_dict = {c.name: getattr(issue, c.name) for c in issue.__table__.columns}
    
    if "project_id" in update_data and update_data["project_id"] is not None:
        proj_query = select(Project).where(Project.id == update_data["project_id"], Project.user_id == current_user.id)
        proj_res = await db.execute(proj_query)
        if not proj_res.scalars().first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project not found")
            
    for key, value in update_data.items():
        setattr(issue, key, value)
        if key == 'tags':
            flag_modified(issue, 'tags')
        
    await db.commit()
    await db.refresh(issue)

    # Broadcast update event
    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "issue_updated",
            "data": IssueResponse.model_validate(issue).model_dump()
        })
    except Exception as ws_err:
        pass

    # Evaluate Automations
    issue_dict = {c.name: getattr(issue, c.name) for c in issue.__table__.columns}
    background_tasks.add_task(evaluate_and_fire_automations, current_user.id, "issue.updated", issue_dict, old_issue_dict)
    
    return issue

@router.get("/issues/{issue_id}/comments", response_model=List[IssueCommentResponse])
async def list_issue_comments(
    issue_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Issue).where(Issue.id == issue_id, Issue.user_id == current_user.id)
    result = await db.execute(query)
    if not result.scalars().first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")

    comments_query = (
        select(IssueComment)
        .where(IssueComment.issue_id == issue_id)
        .order_by(IssueComment.created_at.asc())
    )
    comments_result = await db.execute(comments_query)
    return comments_result.scalars().all()

@router.post("/issues/{issue_id}/comments", response_model=IssueCommentResponse, status_code=status.HTTP_201_CREATED)
async def create_issue_comment(
    issue_id: str,
    payload: IssueCommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Issue).where(Issue.id == issue_id, Issue.user_id == current_user.id)
    result = await db.execute(query)
    if not result.scalars().first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")

    new_comment = IssueComment(
        issue_id=issue_id,
        commenter=payload.commenter,
        body=payload.body
    )
    db.add(new_comment)
    await db.commit()
    await db.refresh(new_comment)

    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "comment_created",
            "data": IssueCommentResponse.model_validate(new_comment).model_dump()
        })
    except Exception as ws_err:
        pass

    return new_comment
