"""Pydantic models for VMS360 Stats & LPR"""
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid


# ============== TENANT MODELS ==============

class Tenant(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    slug: str
    plan: str = "basic"  # basic, pro, enterprise
    max_stores: int = 10
    max_cameras: int = 50
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TenantCreate(BaseModel):
    name: str
    slug: str
    plan: str = "basic"
    max_stores: int = 10
    max_cameras: int = 50


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    plan: Optional[str] = None
    max_stores: Optional[int] = None
    max_cameras: Optional[int] = None
    is_active: Optional[bool] = None


class TenantResponse(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    max_stores: int
    max_cameras: int
    is_active: bool
    created_at: datetime
    store_count: int = 0
    camera_count: int = 0
    user_count: int = 0


# ============== USER MODELS ==============

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password_hash: str
    full_name: str
    role: str = "operator"  # super_admin, admin, operator
    tenant_id: Optional[str] = None  # None only for super_admin
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Permission fields - empty list means all access for admin
    allowed_region_ids: List[str] = Field(default_factory=list)
    allowed_city_ids: List[str] = Field(default_factory=list)
    allowed_store_ids: List[str] = Field(default_factory=list)


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str = "operator"
    tenant_id: Optional[str] = None
    allowed_region_ids: List[str] = Field(default_factory=list)
    allowed_city_ids: List[str] = Field(default_factory=list)
    allowed_store_ids: List[str] = Field(default_factory=list)


class UserLogin(BaseModel):
    username: str
    password: str
    tenant_slug: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    username: str
    full_name: str
    role: str
    tenant_id: Optional[str] = None
    is_active: bool
    allowed_region_ids: List[str] = Field(default_factory=list)
    allowed_city_ids: List[str] = Field(default_factory=list)
    allowed_store_ids: List[str] = Field(default_factory=list)


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    tenant_id: Optional[str] = None
    allowed_region_ids: Optional[List[str]] = None
    allowed_city_ids: Optional[List[str]] = None
    allowed_store_ids: Optional[List[str]] = None


# ============== VMS MODELS ==============

class VMSServer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: Optional[str] = None
    group_name: Optional[str] = None
    name: str
    url: str
    username: str
    password: Optional[str] = ""
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VMSServerCreate(BaseModel):
    name: str
    url: str
    username: str
    password: Optional[str] = ""
    tenant_id: Optional[str] = None
    group_name: Optional[str] = None


class VMSServerUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    group_name: Optional[str] = None


class ImportCamerasRequest(BaseModel):
    camera_ids: List[str]


# ============== LOCATION MODELS ==============

class Region(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: Optional[str] = None
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class City(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: Optional[str] = None
    region_id: str
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class District(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: Optional[str] = None
    city_id: str
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LocationCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None


# ============== STORE MODELS ==============

class Store(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: Optional[str] = None
    group_name: Optional[str] = None
    name: str
    district_id: str
    vms_id: str
    capacity: int = 100
    queue_threshold: int = 5
    # Support multiple cameras per type
    counter_camera_ids: List[str] = []
    queue_camera_ids: List[str] = []
    analytics_camera_ids: List[str] = []
    # Keep old fields for backward compatibility
    counter_camera_id: Optional[str] = None
    queue_camera_id: Optional[str] = None
    analytics_camera_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StoreCreate(BaseModel):
    name: str
    district_id: str
    vms_id: str
    capacity: int = 100
    queue_threshold: int = 5
    counter_camera_ids: List[str] = []
    queue_camera_ids: List[str] = []
    analytics_camera_ids: List[str] = []
    tenant_id: Optional[str] = None
    group_name: Optional[str] = None


class StoreUpdate(BaseModel):
    name: Optional[str] = None
    district_id: Optional[str] = None
    vms_id: Optional[str] = None
    capacity: Optional[int] = None
    queue_threshold: Optional[int] = None
    counter_camera_ids: Optional[List[str]] = None
    queue_camera_ids: Optional[List[str]] = None
    analytics_camera_ids: Optional[List[str]] = None
    group_name: Optional[str] = None


# ============== CAMERA MODELS ==============

class Camera(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: Optional[str] = None
    store_id: str
    camera_vms_id: str
    name: str
    type: str = "counter"
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CameraCreate(BaseModel):
    store_id: str
    camera_vms_id: str
    name: str
    type: str = "counter"
    is_active: bool = True
    tenant_id: Optional[str] = None


# ============== SETTINGS MODELS ==============

class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "global_settings"
    tenant_id: Optional[str] = None
    refresh_interval: int = 30
    capacity_warning_percent: int = 80
    capacity_critical_percent: int = 95
    email_notifications: bool = False
    notification_email: Optional[str] = None
    person_count_interval: int = 5    # dakika, 1-60
    analytics_interval: int = 15      # dakika, 5-60
    data_retention_days: int = 90     # gün: 30/90/180/365/730
    disabled_event_types: List[str] = []  # boş = tümünü topla


# ============== SMTP & SCHEDULED REPORTS MODELS ==============

class SMTPSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    host: str
    port: int = 587
    username: str
    password: str
    from_email: str
    from_name: str = "VMS360 Rapor Sistemi"
    use_tls: bool = True
    is_active: bool = True
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SMTPSettingsCreate(BaseModel):
    host: str
    port: int = 587
    username: str
    password: str
    from_email: str
    from_name: str = "VMS360 Rapor Sistemi"
    use_tls: bool = True


class SMTPTestRequest(BaseModel):
    test_email: str


class ScheduledReport(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    report_type: str
    format: str = "excel"
    frequency: str = "daily"
    send_time: str = "08:00"
    send_day: Optional[int] = None
    recipients: List[str] = []
    is_active: bool = True
    last_sent: Optional[datetime] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ScheduledReportCreate(BaseModel):
    name: str
    report_type: str
    format: str = "excel"
    frequency: str = "daily"
    send_time: str = "08:00"
    send_day: Optional[int] = None
    recipients: List[str]


class ScheduledReportUpdate(BaseModel):
    name: Optional[str] = None
    report_type: Optional[str] = None
    format: Optional[str] = None
    frequency: Optional[str] = None
    send_time: Optional[str] = None
    send_day: Optional[int] = None
    recipients: Optional[List[str]] = None
    is_active: Optional[bool] = None


# ============== HISTORICAL DATA MODELS ==============

class HistoricalCounter(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    store_id: str
    store_name: str
    date: str
    hour: int
    total_in: int = 0
    total_out: int = 0
    current_visitors: int = 0
    occupancy_percent: float = 0
    status: str = "normal"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class HistoricalQueue(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    store_id: str
    store_name: str
    date: str
    hour: int
    total_queue_length: int = 0
    avg_wait_minutes: float = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class HistoricalAnalytics(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    hour: int
    total_detections: int = 0
    male_count: int = 0
    female_count: int = 0
    age_0_17: int = 0
    age_18_24: int = 0
    age_25_34: int = 0
    age_35_44: int = 0
    age_45_54: int = 0
    age_55_plus: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ============== REPORT MODELS ==============

class ReportRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    region_id: Optional[str] = None
    city_id: Optional[str] = None
    district_id: Optional[str] = None
    store_id: Optional[str] = None
    format: str = "json"
