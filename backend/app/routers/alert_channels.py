import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from backend.app.db import get_db
from backend.app.models import User, AlertChannel
from backend.app.routers.endpoints import get_current_user
from backend.app.schemas import (
    AlertChannelResponse, AlertChannelCreate, AlertChannelUpdate
)

router = APIRouter()

@router.get("/alert-channels", response_model=List[AlertChannelResponse])
async def list_alert_channels(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(AlertChannel).where(AlertChannel.user_id == current_user.id).order_by(AlertChannel.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/alert-channels", response_model=AlertChannelResponse, status_code=status.HTTP_201_CREATED)
async def create_alert_channel(
    payload: AlertChannelCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_channel = AlertChannel(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        name=payload.name,
        channel_type=payload.channel_type,
        config=payload.config,
        is_active=payload.is_active if payload.is_active is not None else True
    )
    db.add(new_channel)
    await db.commit()
    await db.refresh(new_channel)
    
    # WebSocket sync
    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "alert_channel_created",
            "data": AlertChannelResponse.model_validate(new_channel).model_dump()
        })
    except Exception as ws_err:
        print(f"[WS ALERT CHANNEL ERROR] Failed to broadcast creation: {ws_err}")

    return new_channel

@router.patch("/alert-channels/{channel_id}", response_model=AlertChannelResponse)
async def update_alert_channel(
    channel_id: str,
    payload: AlertChannelUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(AlertChannel).where(AlertChannel.id == channel_id, AlertChannel.user_id == current_user.id)
    result = await db.execute(query)
    channel = result.scalars().first()
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert channel not found"
        )
    
    if payload.name is not None:
        channel.name = payload.name
    if payload.channel_type is not None:
        channel.channel_type = payload.channel_type
    if payload.config is not None:
        channel.config = payload.config
    if payload.is_active is not None:
        channel.is_active = payload.is_active
        
    await db.commit()
    await db.refresh(channel)
    
    # WebSocket sync
    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "alert_channel_updated",
            "data": AlertChannelResponse.model_validate(channel).model_dump()
        })
    except Exception as ws_err:
        print(f"[WS ALERT CHANNEL ERROR] Failed to broadcast update: {ws_err}")
        
    return channel

@router.delete("/alert-channels/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_channel(
    channel_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(AlertChannel).where(AlertChannel.id == channel_id, AlertChannel.user_id == current_user.id)
    result = await db.execute(query)
    channel = result.scalars().first()
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert channel not found"
        )
        
    await db.delete(channel)
    await db.commit()
    
    # WebSocket sync
    try:
        from backend.app.websockets import manager
        await manager.broadcast({
            "event": "alert_channel_deleted",
            "data": {"id": channel_id}
        })
    except Exception as ws_err:
        print(f"[WS ALERT CHANNEL ERROR] Failed to broadcast deletion: {ws_err}")
        
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.post("/alert-channels/{channel_id}/test")
async def test_alert_channel(
    channel_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(AlertChannel).where(AlertChannel.id == channel_id, AlertChannel.user_id == current_user.id)
    result = await db.execute(query)
    channel = result.scalars().first()
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert channel not found"
        )
        
    # Dispatch test notification based on type
    if channel.channel_type == "slack":
        webhook_url = channel.config.get("webhook_url")
        if not webhook_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Slack webhook_url is missing from channel config"
            )
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    webhook_url,
                    json={"text": "🚨 *HookShield Test Alert*\nConnection test successful! Your HookShield Control Deck is now linked to this Slack channel."},
                    timeout=5.0
                )
                if res.status_code >= 400:
                    raise Exception(f"HTTP status {res.status_code}")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to post to Slack webhook: {str(e)}"
            )
            
    elif channel.channel_type == "discord":
        webhook_url = channel.config.get("webhook_url")
        if not webhook_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Discord webhook_url is missing from channel config"
            )
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    webhook_url,
                    json={"content": "🚨 **HookShield Test Alert**\nConnection test successful! Your HookShield Control Deck is now linked to this Discord channel."},
                    timeout=5.0
                )
                if res.status_code >= 400:
                    raise Exception(f"HTTP status {res.status_code}")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to post to Discord webhook: {str(e)}"
            )
            
    elif channel.channel_type == "email":
        recipient_email = channel.config.get("recipient_email")
        if not recipient_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Recipient email is missing from channel config"
            )
        # Log email sending
        print(f"[TEST EMAIL ALERT] To: {recipient_email} - Subject: HookShield Test Alert - Body: Verification successful")
        
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported channel type: {channel.channel_type}"
        )
        
    return {"status": "success", "message": f"Test alert dispatched to {channel.name}"}
