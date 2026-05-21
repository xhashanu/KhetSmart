from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ColdStorage(Base):
    __tablename__ = "cold_storages"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    district: Mapped[str] = mapped_column(String(80), index=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    capacity_quintals: Mapped[int] = mapped_column(Integer)
    available_quintals: Mapped[int] = mapped_column(Integer)
    utilization_pct: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MandiPrice(Base):
    __tablename__ = "mandi_prices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    market_id: Mapped[str] = mapped_column(String(16), index=True)
    market_name: Mapped[str] = mapped_column(String(120))
    district: Mapped[str] = mapped_column(String(80))
    crop: Mapped[str] = mapped_column(String(60), default="Potato")
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    price_per_quintal: Mapped[int] = mapped_column(Integer)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class YieldSnapshot(Base):
    __tablename__ = "yield_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    region: Mapped[str] = mapped_column(String(120), index=True)
    ndvi_index: Mapped[float] = mapped_column(Float)
    glut_risk_pct: Mapped[int] = mapped_column(Integer)
    predicted_yield_million_quintals: Mapped[float] = mapped_column(Float)
    weeks_to_harvest: Mapped[int] = mapped_column(Integer, default=3)
    lulc_potato_acres: Mapped[int] = mapped_column(Integer)
    satellite_source: Mapped[str] = mapped_column(String(200))
    alert_level: Mapped[str] = mapped_column(String(16))
    insight: Mapped[str] = mapped_column(Text)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
