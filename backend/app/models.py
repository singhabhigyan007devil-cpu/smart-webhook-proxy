import uuid
from sqlalchemy import Column, String, Boolean, Integer, ForeignKey, Text, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.app.db import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    api_key = Column(String(255), unique=True, nullable=False, index=True)
    tier = Column(String(50), default="free", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    endpoints = relationship("Endpoint", back_populates="user", cascade="all, delete-orphan")
    alert_channels = relationship("AlertChannel", back_populates="user", cascade="all, delete-orphan")
    severity_priorities = relationship("SeverityPriority", back_populates="user", cascade="all, delete-orphan")

class Endpoint(Base):
    __tablename__ = "endpoints"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    source_name = Column(String(255), nullable=False)
    secret_token = Column(String(255), nullable=True)
    active_state = Column(Boolean, default=True, nullable=False)
    target_url = Column(Text, nullable=False)
    failure_count = Column(Integer, default=0, nullable=False)
    alert_webhook_url = Column(String(512), nullable=True)
    auth_headers = Column(JSON, nullable=True)
    max_retries = Column(Integer, nullable=True)
    backoff_base = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="endpoints")
    logs = relationship("WebhookLog", back_populates="endpoint", cascade="all, delete-orphan")

class WebhookLog(Base):
    __tablename__ = "webhook_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    endpoint_id = Column(String(36), ForeignKey("endpoints.id", ondelete="CASCADE"), nullable=False, index=True)
    payload_string = Column(Text, nullable=False)
    headers_json = Column(JSON, nullable=False)
    response_code = Column(Integer, nullable=True)
    delivery_status = Column(String(50), nullable=False)  # pending, success, failed, dropped
    retry_count = Column(Integer, default=0, nullable=False)
    error_message = Column(Text, nullable=True)
    event_hash = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    endpoint = relationship("Endpoint", back_populates="logs")

class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"

    key_hash = Column(String(255), primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="started", nullable=False, index=True)  # backlog, started, completed, paused
    target_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    incidents = relationship("Incident", back_populates="project")
    milestones = relationship("ProjectMilestone", back_populates="project", cascade="all, delete-orphan")

class ProjectMilestone(Base):
    __tablename__ = "project_milestones"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="open", nullable=False, index=True)  # open, completed
    target_date = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    project = relationship("Project", back_populates="milestones")

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    endpoint_id = Column(String(36), ForeignKey("endpoints.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="todo", nullable=False, index=True)  # todo, in_progress, done
    priority = Column(String(50), default="medium", nullable=False, index=True)  # urgent, high, medium, low
    assignee = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    endpoint = relationship("Endpoint")
    project = relationship("Project", back_populates="incidents")
    comments = relationship("IncidentComment", back_populates="incident", cascade="all, delete-orphan")

class IncidentComment(Base):
    __tablename__ = "incident_comments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id = Column(String(36), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    commenter = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    incident = relationship("Incident", back_populates="comments")

class AlertChannel(Base):
    __tablename__ = "alert_channels"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    channel_type = Column(String(50), nullable=False, index=True)  # slack, email, discord
    config = Column(JSON, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="alert_channels")


class SeverityPriority(Base):
    __tablename__ = "severity_priorities"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    color = Column(String(50), nullable=False)  # HSL or hex color code
    rank = Column(Integer, default=1, nullable=False)
    threshold_failures = Column(Integer, default=1, nullable=False)
    alert_channel_id = Column(String(36), ForeignKey("alert_channels.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="severity_priorities")
    alert_channel = relationship("AlertChannel")

