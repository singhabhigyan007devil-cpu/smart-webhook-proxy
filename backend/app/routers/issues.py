import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import func
from typing import List

from backend.app.db import get_db
from backend.app.models import (
    User, Endpoint, Issue, IssueComment, Project,
    WorkflowStatus, CustomField, IssueCustomValue
)
from backend.app.routers.endpoints import get_current_user
from backend.app.schemas import (
    IssueResponse, IssueUpdate,
    IssueCommentResponse, IssueCommentCreate,
    WorkflowStatusResponse, WorkflowStatusCreate, WorkflowStatusUpdate,
    CustomFieldResponse, CustomFieldCreate,
    IssueCustomValueResponse, IssueCustomValueCreate
)

router = APIRouter()

# --- Issues Endpoints ---

@router.get("/issues", response_model=List[IssueResponse])
async def list_issues(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Issue)
        .where(Issue.user_id == current_user.id)
        .options(selectinload(Issue.comments), selectinload(Issue.custom_values))
        .order_by(Issue.created_at.desc())
    )
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/issues/{issue_id}", response_model=IssueResponse)
async def get_issue(
    issue_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Issue)
        .where(Issue.id == issue_id, Issue.user_id == current_user.id)
        .options(selectinload(Issue.comments), selectinload(Issue.custom_values))
    )
    result = await db.execute(query)
    issue = result.scalars().first()
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Issue not found"
        )
    return issue

@router.patch("/issues/{issue_id}", response_model=IssueResponse)
async def update_issue(
    issue_id: str,
    payload: IssueUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Issue)
        .where(Issue.id == issue_id, Issue.user_id == current_user.id)
        .options(selectinload(Issue.comments), selectinload(Issue.custom_values))
    )
    result = await db.execute(query)
    issue = result.scalars().first()
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Issue not found"
        )
    
    if payload.status is not None:
        issue.status = payload.status
        # Handle completed_at timestamp auto update
        if payload.status.lower() in ("done", "completed", "resolved"):
            issue.completed_at = func.now()
        else:
            issue.completed_at = None

    if payload.priority is not None:
        issue.priority = payload.priority
    if payload.assignee is not None:
        issue.assignee = payload.assignee or None
    if payload.issue_type is not None:
        issue.issue_type = payload.issue_type
    if "story_points" in payload.model_fields_set:
        issue.story_points = payload.story_points
    if "completed_at" in payload.model_fields_set:
        issue.completed_at = payload.completed_at
        
    if "project_id" in payload.model_fields_set:
        if payload.project_id is not None:
            # check project exists and belongs to current user
            proj_query = select(Project).where(Project.id == payload.project_id, Project.user_id == current_user.id)
            proj_res = await db.execute(proj_query)
            if not proj_res.scalars().first():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Project not found or access denied"
                )
        issue.project_id = payload.project_id
        
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
        print(f"[WS PATCH ERROR] Failed to broadcast: {ws_err}")

    return issue

# --- Issue Comments Endpoints ---

@router.get("/issues/{issue_id}/comments", response_model=List[IssueCommentResponse])
async def list_issue_comments(
    issue_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Issue).where(Issue.id == issue_id, Issue.user_id == current_user.id)
    result = await db.execute(query)
    if not result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Issue not found"
        )

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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Issue not found"
        )

    new_comment = IssueComment(
        id=str(uuid.uuid4()),
        issue_id=issue_id,
        commenter=payload.commenter,
        body=payload.body
    )
    db.add(new_comment)
    await db.commit()
    await db.refresh(new_comment)

    # Broadcast comment event
    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "comment_created",
            "data": IssueCommentResponse.model_validate(new_comment).model_dump()
        })
    except Exception as ws_err:
        print(f"[WS POST COMMENT ERROR] Failed to broadcast: {ws_err}")

    return new_comment

# --- Workflow Statuses Endpoints ---

@router.get("/workflow-statuses", response_model=List[WorkflowStatusResponse])
async def list_workflow_statuses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(WorkflowStatus)
        .where(WorkflowStatus.user_id == current_user.id)
        .order_by(WorkflowStatus.order_index.asc())
    )
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/workflow-statuses", response_model=WorkflowStatusResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow_status(
    payload: WorkflowStatusCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_status = WorkflowStatus(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        name=payload.name,
        color=payload.color,
        order_index=payload.order_index
    )
    db.add(new_status)
    await db.commit()
    await db.refresh(new_status)

    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "workflow_status_created",
            "data": WorkflowStatusResponse.model_validate(new_status).model_dump()
        })
    except Exception as ws_err:
        print(f"[WS POST STATUS ERROR] Failed to broadcast: {ws_err}")

    return new_status

@router.patch("/workflow-statuses/{status_id}", response_model=WorkflowStatusResponse)
async def update_workflow_status(
    status_id: str,
    payload: WorkflowStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(WorkflowStatus).where(WorkflowStatus.id == status_id, WorkflowStatus.user_id == current_user.id)
    result = await db.execute(query)
    status_obj = result.scalars().first()
    if not status_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow status not found"
        )

    if payload.name is not None:
        status_obj.name = payload.name
    if payload.color is not None:
        status_obj.color = payload.color
    if payload.order_index is not None:
        status_obj.order_index = payload.order_index

    await db.commit()
    await db.refresh(status_obj)

    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "workflow_status_updated",
            "data": WorkflowStatusResponse.model_validate(status_obj).model_dump()
        })
    except Exception as ws_err:
        print(f"[WS PATCH STATUS ERROR] Failed to broadcast: {ws_err}")

    return status_obj

@router.delete("/workflow-statuses/{status_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow_status(
    status_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(WorkflowStatus).where(WorkflowStatus.id == status_id, WorkflowStatus.user_id == current_user.id)
    result = await db.execute(query)
    status_obj = result.scalars().first()
    if not status_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow status not found"
        )

    await db.delete(status_obj)
    await db.commit()

    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "workflow_status_deleted",
            "data": {"id": status_id}
        })
    except Exception as ws_err:
        print(f"[WS DELETE STATUS ERROR] Failed to broadcast: {ws_err}")

    return Response(status_code=status.HTTP_204_NO_CONTENT)

# --- Custom Fields Endpoints ---

@router.get("/custom-fields", response_model=List[CustomFieldResponse])
async def list_custom_fields(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(CustomField).where(CustomField.user_id == current_user.id).order_by(CustomField.created_at.asc())
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/custom-fields", response_model=CustomFieldResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_field(
    payload: CustomFieldCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if payload.field_type not in ("text", "number", "date"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid field type. Must be text, number, or date."
        )

    new_field = CustomField(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        name=payload.name,
        field_type=payload.field_type
    )
    db.add(new_field)
    await db.commit()
    await db.refresh(new_field)

    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "custom_field_created",
            "data": CustomFieldResponse.model_validate(new_field).model_dump()
        })
    except Exception as ws_err:
        print(f"[WS POST FIELD ERROR] Failed to broadcast: {ws_err}")

    return new_field

@router.delete("/custom-fields/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_field(
    field_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(CustomField).where(CustomField.id == field_id, CustomField.user_id == current_user.id)
    result = await db.execute(query)
    field = result.scalars().first()
    if not field:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom field not found"
        )

    await db.delete(field)
    await db.commit()

    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "custom_field_deleted",
            "data": {"id": field_id}
        })
    except Exception as ws_err:
        print(f"[WS DELETE FIELD ERROR] Failed to broadcast: {ws_err}")

    return Response(status_code=status.HTTP_204_NO_CONTENT)

# --- Custom Field Values Endpoints ---

@router.post("/issues/{issue_id}/custom-values", response_model=IssueCustomValueResponse)
async def upsert_issue_custom_value(
    issue_id: str,
    payload: IssueCustomValueCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify issue belongs to current user
    issue_query = (
        select(Issue)
        .where(Issue.id == issue_id, Issue.user_id == current_user.id)
        .options(selectinload(Issue.comments), selectinload(Issue.custom_values))
    )
    issue_res = await db.execute(issue_query)
    issue = issue_res.scalars().first()
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Issue not found"
        )

    # Verify custom field belongs to current user
    field_query = select(CustomField).where(CustomField.id == payload.field_id, CustomField.user_id == current_user.id)
    field_res = await db.execute(field_query)
    if not field_res.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom field definition not found"
        )

    # Check if value already exists
    val_query = select(IssueCustomValue).where(
        IssueCustomValue.issue_id == issue_id,
        IssueCustomValue.field_id == payload.field_id
    )
    val_res = await db.execute(val_query)
    existing_val = val_res.scalars().first()

    if existing_val:
        existing_val.value_text = payload.value_text
        await db.commit()
        await db.refresh(existing_val)
        ret_val = existing_val
    else:
        new_val = IssueCustomValue(
            id=str(uuid.uuid4()),
            issue_id=issue_id,
            field_id=payload.field_id,
            value_text=payload.value_text
        )
        db.add(new_val)
        await db.commit()
        await db.refresh(new_val)
        ret_val = new_val

    # Refresh issue and broadcast updated issue
    await db.refresh(issue)
    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "issue_updated",
            "data": IssueResponse.model_validate(issue).model_dump()
        })
    except Exception as ws_err:
        print(f"[WS POST CUSTOM VALUE ERROR] Failed to broadcast issue update: {ws_err}")

    return ret_val
