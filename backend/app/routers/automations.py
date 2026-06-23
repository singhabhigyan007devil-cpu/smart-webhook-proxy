from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
import httpx
from backend.app.models import Issue, AlertChannel, Endpoint
from backend.app.routers.alert_channels import notify_alert_channel


from backend.app.db import get_db
from backend.app.models import AutomationRule, User
from backend.app.schemas import AutomationRuleCreate, AutomationRuleUpdate, AutomationRuleResponse
from backend.app.routers.endpoints import get_current_user

router = APIRouter(prefix="/api/automations", tags=["automations"])

@router.post("", response_model=AutomationRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_automation(
    payload: AutomationRuleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_rule = AutomationRule(
        user_id=current_user.id,
        name=payload.name,
        trigger_type=payload.trigger_type,
        condition_field=payload.condition_field,
        condition_value=payload.condition_value,
        action_type=payload.action_type,
        action_target=payload.action_target,
        is_active=payload.is_active
    )
    db.add(new_rule)
    await db.commit()
    await db.refresh(new_rule)
    return new_rule

@router.get("", response_model=List[AutomationRuleResponse])
async def list_automations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(AutomationRule).where(AutomationRule.user_id == current_user.id).order_by(AutomationRule.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.patch("/{rule_id}", response_model=AutomationRuleResponse)
async def update_automation(
    rule_id: str,
    payload: AutomationRuleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(AutomationRule).where(AutomationRule.id == rule_id, AutomationRule.user_id == current_user.id)
    result = await db.execute(query)
    rule = result.scalars().first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(rule, key, value)
        
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule

@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_automation(
    rule_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(AutomationRule).where(AutomationRule.id == rule_id, AutomationRule.user_id == current_user.id)
    result = await db.execute(query)
    rule = result.scalars().first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    await db.delete(rule)
    await db.commit()
    return None


async def execute_automations(db: AsyncSession, user_id: str, trigger_type: str, context: dict):
    """
    Evaluates and executes active automations for a specific trigger.
    Context is a dictionary containing relevant data (e.g., {'endpoint_id': '123', 'status_code': 404, 'issue': Issue_Object})
    """
    query = select(AutomationRule).where(
        AutomationRule.user_id == user_id,
        AutomationRule.is_active == True,
        AutomationRule.trigger_type == trigger_type
    )
    res = await db.execute(query)
    rules = res.scalars().all()

    for rule in rules:
        # Check Condition
        if rule.condition_field and rule.condition_value:
            actual_value = str(context.get(rule.condition_field, ''))
            if actual_value != rule.condition_value:
                continue

        # Execute Action
        if rule.action_type == 'create_issue':
            project_id = rule.action_target
            title = context.get('issue_title', f"Automated Issue from {trigger_type}")
            description = context.get('issue_description', "Automatically generated issue.")
            
            new_issue = Issue(
                project_id=project_id,
                user_id=user_id,
                title=title,
                description=description,
                status="todo",
                priority="high"
            )
            db.add(new_issue)
            await db.commit()

        elif rule.action_type == 'alert':
            channel_id = rule.action_target
            channel_res = await db.execute(select(AlertChannel).where(AlertChannel.id == channel_id, AlertChannel.user_id == user_id))
            channel = channel_res.scalars().first()
            if channel:
                message = context.get('alert_message', f"Automation Triggered: {trigger_type}")
                await notify_alert_channel(channel, message, "Automation Rule")
