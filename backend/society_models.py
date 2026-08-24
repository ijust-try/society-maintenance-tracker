from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, field_validator, HttpUrl

class ComplaintStatus(str, Enum):
    OPEN = "Open"
    IN_PROGRESS = "In Progress"
    RESOLVED = "Resolved"

class ComplaintPriority(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"

class ComplaintCreate(BaseModel):
    category: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=5000)
    photo_url: Optional[HttpUrl] = None
    photo_public_id: Optional[str] = Field(default=None, max_length=300)

    @field_validator("category", "description")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be empty")
        return value

class ComplaintPriorityUpdate(BaseModel):
    priority: ComplaintPriority

class ComplaintStatusUpdate(BaseModel):
    status: ComplaintStatus
    note: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("note")
    @classmethod
    def clean_note(cls, value):
        return value.strip() if value else None

class ComplaintOut(BaseModel):
    id: int
    resident_id: str
    category: str
    description: str
    photo_url: Optional[str]
    status: ComplaintStatus
    priority: ComplaintPriority
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime]
    overdue: bool

class ComplaintHistoryOut(BaseModel):
    id: int
    complaint_id: int
    previous_status: Optional[ComplaintStatus]
    new_status: ComplaintStatus
    actor_id: str
    actor_email: Optional[str]
    note: Optional[str]
    created_at: datetime

class NoticeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=10000)
    important: bool = False

    @field_validator("title", "content")
    @classmethod
    def clean_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be empty")
        return value

class NoticeUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    content: Optional[str] = Field(default=None, min_length=1, max_length=10000)
    important: Optional[bool] = None

class NoticeOut(BaseModel):
    id: int
    title: str
    content: str
    important: bool
    author_id: str
    author_email: Optional[str]
    created_at: datetime
    updated_at: datetime

class UploadSignatureOut(BaseModel):
    cloud_name: str
    api_key: str
    timestamp: int
    folder: str
    signature: str
    resource_type: str = "image"

class NotificationOut(BaseModel):
    id: int
    event_key: str
    recipient_email: str
    event_type: str
    status: str
    created_at: datetime
    sent_at: Optional[datetime]
    last_error: Optional[str]
