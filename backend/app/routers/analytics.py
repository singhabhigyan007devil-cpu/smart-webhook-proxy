from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, text
from typing import List
from datetime import datetime, timedelta

from backend.app.db import get_db
from backend.app.models import User, WebhookLog, Endpoint, Issue
from backend.app.schemas import AnalyticsKPIs, AnalyticsTimeSeriesResponse, AnalyticsTimeSeriesPoint, AnalyticsVelocityResponse, AnalyticsVelocityPoint, AnalyticsBurndownResponse, AnalyticsBurndownPoint, QueueHealthResponse
from backend.app.tasks import get_redis_pool
from backend.app.routers.endpoints import get_current_user

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/kpis", response_model=AnalyticsKPIs)
async def get_analytics_kpis(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Base query to join WebhookLog with Endpoints belonging to the current user
    # We want total volume, success rate, and avg latency.
    
    # In SQLite, we can use simple aggregates.
    stmt = select(
        func.count(WebhookLog.id).label("total_volume"),
        func.sum(case((WebhookLog.delivery_status == "success", 1), else_=0)).label("success_count"),
        func.avg(WebhookLog.latency_ms).label("avg_latency")
    ).select_from(WebhookLog).join(Endpoint, WebhookLog.endpoint_id == Endpoint.id).where(Endpoint.user_id == current_user.id)
    
    result = await db.execute(stmt)
    row = result.first()
    
    if not row or row.total_volume == 0:
        return AnalyticsKPIs(total_volume=0, success_rate=0.0, avg_latency_ms=0.0)
    
    total_volume = row.total_volume
    success_count = row.success_count or 0
    avg_latency = row.avg_latency or 0.0
    
    success_rate = round((success_count / total_volume) * 100, 2)
    
    return AnalyticsKPIs(
        total_volume=total_volume,
        success_rate=success_rate,
        avg_latency_ms=round(avg_latency, 2)
    )

@router.get("/timeseries", response_model=AnalyticsTimeSeriesResponse)
async def get_analytics_timeseries(
    days: int = Query(30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Get stats for the last N days, grouped by day (YYYY-MM-DD format).
    # Since sqlite and postgres date formatting differs, we use strftime for sqlite or generic cast for pg.
    # To be compatible with sqlite, we'll use func.date(WebhookLog.created_at)
    
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    stmt = select(
        func.date(WebhookLog.created_at).label("log_date"),
        func.sum(case((WebhookLog.delivery_status == "success", 1), else_=0)).label("success_count"),
        func.sum(case((WebhookLog.delivery_status != "success", 1), else_=0)).label("failed_count")
    ).select_from(WebhookLog).join(Endpoint, WebhookLog.endpoint_id == Endpoint.id).where(
        Endpoint.user_id == current_user.id,
        WebhookLog.created_at >= cutoff_date
    ).group_by(
        func.date(WebhookLog.created_at)
    ).order_by(
        func.date(WebhookLog.created_at).asc()
    )
    
    result = await db.execute(stmt)
    rows = result.all()
    
    data = []
    for row in rows:
        data.append(AnalyticsTimeSeriesPoint(
            date=row.log_date,
            success_count=row.success_count or 0,
            failed_count=row.failed_count or 0
        ))
        
    return AnalyticsTimeSeriesResponse(data=data)

@router.get("/velocity", response_model=AnalyticsVelocityResponse)
async def get_velocity(
    weeks: int = Query(12, ge=1, le=52),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cutoff_date = datetime.utcnow() - timedelta(weeks=weeks)
    
    stmt = select(
        func.strftime('%Y-%W', Issue.completed_at).label("week"),
        func.sum(Issue.story_points).label("completed_points")
    ).select_from(Issue).where(
        Issue.user_id == current_user.id,
        Issue.completed_at >= cutoff_date,
        Issue.status == 'done'
    ).group_by(
        func.strftime('%Y-%W', Issue.completed_at)
    ).order_by(
        func.strftime('%Y-%W', Issue.completed_at).asc()
    )
    
    result = await db.execute(stmt)
    rows = result.all()
    
    data = []
    for row in rows:
        if row.week:
            data.append(AnalyticsVelocityPoint(
                week=row.week,
                completed_points=row.completed_points or 0
            ))
            
    return AnalyticsVelocityResponse(data=data)

@router.get("/burndown", response_model=AnalyticsBurndownResponse)
async def get_burndown(
    days: int = Query(30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    stmt = select(Issue).where(
        Issue.user_id == current_user.id
    )
    
    result = await db.execute(stmt)
    issues = result.scalars().all()
    
    data = []
    for i in range(days):
        dt = (datetime.utcnow() - timedelta(days=days-1-i)).date()
        open_count = 0
        completed_count = 0
        for issue in issues:
            created_date = issue.created_at.date() if getattr(issue.created_at, 'date', None) else issue.created_at
            if created_date <= dt:
                if issue.completed_at:
                    comp_date = issue.completed_at.date() if getattr(issue.completed_at, 'date', None) else issue.completed_at
                    if comp_date <= dt:
                        completed_count += 1
                    else:
                        open_count += 1
                else:
                    open_count += 1
        
        data.append(AnalyticsBurndownPoint(
            date=dt.isoformat(),
            open_issues=open_count,
            completed_issues=completed_count
        ))
        
    return AnalyticsBurndownResponse(data=data)

@router.get("/queue-health", response_model=QueueHealthResponse)
async def get_queue_health(
    current_user: User = Depends(get_current_user)
):
    try:
        pool = await get_redis_pool()
        # ARQ stores the main queue in a zset by default named "arq:queue"
        count = await pool.zcard("arq:queue")
        
        status_label = "healthy"
        if count >= 100:
            status_label = "degraded"
            
        return QueueHealthResponse(queued_jobs_count=count, status=status_label)
    except Exception as e:
        print(f"[QUEUE HEALTH ERROR] {e}")
        return QueueHealthResponse(queued_jobs_count=0, status="degraded")
