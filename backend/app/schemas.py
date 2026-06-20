from pydantic import BaseModel, EmailStr, HttpUrl, field_serializer, ConfigDict
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone

def serialize_datetime(dt: datetime) -> str:
    if dt.tzinfo is None:
        # SQLite naive datetimes represent UTC values
        return dt.replace(tzinfo=timezone.utc).isoformat()
    return dt.isoformat()

# --- User Schemas ---
class UserBase(BaseModel):
    email: EmailStr
    tier: str = "free"

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: str
    api_key: str
    created_at: datetime

    @field_serializer('created_at')
    def serialize_created_at(self, dt: datetime, _info):
        return serialize_datetime(dt)

    model_config = ConfigDict(from_attributes=True)

# --- Endpoint Schemas ---
class EndpointBase(BaseModel):
    source_name: str
    target_url: str
    secret_token: Optional[str] = None
    alert_webhook_url: Optional[str] = None
    auth_headers: Optional[Dict[str, str]] = None
    max_retries: Optional[int] = None
    backoff_base: Optional[int] = None

class EndpointCreate(EndpointBase):
    slug: Optional[str] = None  # Will auto-generate slug if not provided

class EndpointUpdate(BaseModel):
    source_name: Optional[str] = None
    target_url: Optional[str] = None
    secret_token: Optional[str] = None
    active_state: Optional[bool] = None
    alert_webhook_url: Optional[str] = None
    auth_headers: Optional[Dict[str, str]] = None
    max_retries: Optional[int] = None
    backoff_base: Optional[int] = None

class EndpointResponse(EndpointBase):
    id: str
    user_id: str
    slug: str
    active_state: bool
    failure_count: int
    created_at: datetime

    @field_serializer('created_at')
    def serialize_created_at(self, dt: datetime, _info):
        return serialize_datetime(dt)

    model_config = ConfigDict(from_attributes=True)

# --- Webhook Log Schemas ---
class WebhookLogResponse(BaseModel):
    id: str
    endpoint_id: str
    payload_string: str
    headers_json: Dict[str, Any]
    response_code: Optional[int] = None
    delivery_status: str
    retry_count: int
    error_message: Optional[str] = None
    event_hash: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @field_serializer('created_at', 'updated_at')
    def serialize_timestamps(self, dt: datetime, _info):
        return serialize_datetime(dt)

    model_config = ConfigDict(from_attributes=True)

# --- Metrics Schemas ---
class DashboardMetrics(BaseModel):
    success_rate: float
    active_endpoints: int
    pending_retries: int
    total_processed: int


# --- Project Schemas ---
class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    status: Optional[str] = "started"  # backlog, started, completed, paused
    target_date: Optional[datetime] = None

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    target_date: Optional[datetime] = None

class ProjectResponse(ProjectBase):
    id: str
    user_id: str
    created_at: datetime

    @field_serializer('created_at', 'target_date')
    def serialize_timestamps(self, dt: Optional[datetime], _info):
        if dt is None:
            return None
        return serialize_datetime(dt)

    model_config = ConfigDict(from_attributes=True)


# --- Project Milestone Schemas ---
class ProjectMilestoneBase(BaseModel):
    name: str
    description: Optional[str] = None
    status: Optional[str] = "open"  # open, completed
    target_date: datetime

class ProjectMilestoneCreate(ProjectMilestoneBase):
    pass

class ProjectMilestoneUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    target_date: Optional[datetime] = None

class ProjectMilestoneResponse(ProjectMilestoneBase):
    id: str
    project_id: str
    created_at: datetime

    @field_serializer('created_at', 'target_date')
    def serialize_timestamps(self, dt: Optional[datetime], _info):
        if dt is None:
            return None
        return serialize_datetime(dt)

    model_config = ConfigDict(from_attributes=True)


# --- Incident Schemas ---
class IncidentCommentCreate(BaseModel):
    commenter: str
    body: str

class IncidentCommentResponse(BaseModel):
    id: str
    incident_id: str
    commenter: str
    body: str
    created_at: datetime

    @field_serializer('created_at')
    def serialize_created_at(self, dt: datetime, _info):
        return serialize_datetime(dt)

    model_config = ConfigDict(from_attributes=True)

class IncidentUpdate(BaseModel):
    status: Optional[str] = None  # todo, in_progress, done
    priority: Optional[str] = None  # urgent, high, medium, low
    assignee: Optional[str] = None
    project_id: Optional[str] = None

class IncidentResponse(BaseModel):
    id: str
    endpoint_id: str
    project_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    assignee: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @field_serializer('created_at', 'updated_at')
    def serialize_timestamps(self, dt: datetime, _info):
        return serialize_datetime(dt)

    model_config = ConfigDict(from_attributes=True)


# --- Alert Channel Schemas ---
class AlertChannelBase(BaseModel):
    name: str
    channel_type: str  # slack, email, discord
    config: Dict[str, Any]
    is_active: Optional[bool] = True

class AlertChannelCreate(AlertChannelBase):
    pass

class AlertChannelUpdate(BaseModel):
    name: Optional[str] = None
    channel_type: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class AlertChannelResponse(AlertChannelBase):
    id: str
    user_id: str
    created_at: datetime

    @field_serializer('created_at')
    def serialize_created_at(self, dt: datetime, _info):
        return serialize_datetime(dt)

    model_config = ConfigDict(from_attributes=True)


# --- Severity Priority Schemas ---
class SeverityPriorityBase(BaseModel):
    name: str
    color: str
    rank: int
    threshold_failures: int
    alert_channel_id: Optional[str] = None

class SeverityPriorityCreate(SeverityPriorityBase):
    pass

class SeverityPriorityUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    rank: Optional[int] = None
    threshold_failures: Optional[int] = None
    alert_channel_id: Optional[str] = None

class SeverityPriorityResponse(SeverityPriorityBase):
    id: str
    user_id: str
    created_at: datetime

    @field_serializer('created_at')
    def serialize_created_at(self, dt: datetime, _info):
        return serialize_datetime(dt)

    model_config = ConfigDict(from_attributes=True)



# --- Analytics Schemas ---
class AnalyticsKPIs(BaseModel):
    total_volume: int
    success_rate: float
    avg_latency_ms: float

class AnalyticsTimeSeriesPoint(BaseModel):
    date: str
    success_count: int
    failed_count: int

class AnalyticsTimeSeriesResponse(BaseModel):
    data: List[AnalyticsTimeSeriesPoint]
