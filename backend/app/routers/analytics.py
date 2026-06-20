from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, text
from typing import List
from datetime import datetime, timedelta

from backend.app.db import get_db
from backend.app.models import User, WebhookLog, Endpoint
from backend.app.schemas import AnalyticsKPIs, AnalyticsTimeSeriesResponse, AnalyticsTimeSeriesPoint
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
