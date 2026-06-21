from datetime import datetime
import asyncio
import httpx
from sqlalchemy.future import select
from backend.app.db import AsyncSessionLocal
from backend.app.models import AutomationRule, Issue

async def evaluate_and_fire_automations(user_id: str, event_type: str, issue_dict: dict, old_issue_dict: dict = None):
    async with AsyncSessionLocal() as db:
        query = select(AutomationRule).where(
            AutomationRule.user_id == user_id, 
            AutomationRule.is_active == True,
            AutomationRule.trigger_type == event_type
        )
        result = await db.execute(query)
        rules = result.scalars().all()
        
        for rule in rules:
            should_fire = False
            
            if rule.condition_field and rule.condition_value:
                # E.g., condition_field = "status", condition_value = "done"
                new_val = issue_dict.get(rule.condition_field)
                old_val = old_issue_dict.get(rule.condition_field) if old_issue_dict else None
                
                # Check if the field changed to the target value
                if new_val == rule.condition_value and new_val != old_val:
                    should_fire = True
            else:
                # No specific field condition, fire on event
                should_fire = True
                
            if should_fire:
                await fire_action(rule, event_type, issue_dict)

async def fire_action(rule: AutomationRule, event_type: str, issue_dict: dict):
    if rule.action_type == 'webhook':
        try:
            payload = {
                "rule_name": rule.name,
                "event": event_type,
                "issue": __import__("json").loads(__import__("json").dumps(issue_dict, default=str))
            }
            async with httpx.AsyncClient() as client:
                await client.post(rule.action_target, json=payload, timeout=5.0)
        except Exception as e:
            print(f"Failed to fire automation webhook {rule.id}: {e}")
