import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import database
from .carbon import calculate_emissions_kg


class IotReadingRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    device_id: str = Field(min_length=2, max_length=64)
    voltage: float = Field(ge=0.0, le=600.0)
    current: float = Field(ge=0.0, le=200.0)
    power: float = Field(ge=0.0, le=100_000.0)
    energy_kwh: float = Field(ge=0.0, le=10_000_000.0)
    temperature: float | None = Field(default=None, ge=-40.0, le=90.0)
    humidity: float | None = Field(default=None, ge=0.0, le=100.0)
    timestamp: str | None = Field(default=None, max_length=40)
    is_simulated: bool = Field(default=False)

    @field_validator("timestamp")
    @classmethod
    def valid_iso_timestamp(cls, val: str | None) -> str | None:
        if val:
            try:
                datetime.fromisoformat(val.replace("Z", "+00:00"))
            except ValueError as e:
                raise ValueError("Timestamp must be valid ISO-8601 format.") from e
        return val


def get_device_health(last_seen_iso: str | None) -> dict[str, Any]:
    """
    Evaluates device health honestly from timestamp.
    Freshness thresholds:
    - online: <= 5 minutes (300s)
    - stale: 5 to 30 minutes (300s to 1800s)
    - offline: > 30 minutes or never seen
    """
    if not last_seen_iso:
        return {
            "status": "offline",
            "reading_age_seconds": None,
            "reading_age_human": "Never connected",
            "is_fresh": False,
        }

    try:
        last_dt = datetime.fromisoformat(last_seen_iso.replace("Z", "+00:00"))
        now_dt = datetime.now(timezone.utc)
        age_seconds = max(0.0, (now_dt - last_dt).total_seconds())

        if age_seconds <= 300:
            status = "online"
        elif age_seconds <= 1800:
            status = "stale"
        else:
            status = "offline"

        if age_seconds < 60:
            age_human = f"{int(age_seconds)}s ago"
        elif age_seconds < 3600:
            age_human = f"{int(age_seconds // 60)}m ago"
        elif age_seconds < 86400:
            age_human = f"{int(age_seconds // 3600)}h ago"
        else:
            age_human = f"{int(age_seconds // 86400)}d ago"

        return {
            "status": status,
            "reading_age_seconds": round(age_seconds, 1),
            "reading_age_human": age_human,
            "is_fresh": status == "online",
        }
    except Exception:
        return {
            "status": "offline",
            "reading_age_seconds": None,
            "reading_age_human": "Unknown",
            "is_fresh": False,
        }


def calculate_energy_consumption(readings: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Calculates interval energy consumption from consecutive meter readings.
    Does NOT sum cumulative meter values.
    Handles meter resets / rollovers safely.
    """
    if len(readings) < 2:
        return {
            "total_consumption_kwh": 0.0,
            "sample_count": len(readings),
            "first_reading_kwh": readings[0]["energy_kwh"] if readings else 0.0,
            "latest_reading_kwh": readings[-1]["energy_kwh"] if readings else 0.0,
            "resets_detected": 0,
            "anomalies_flagged": 0,
        }

    # Readings are assumed ordered chronologically ascending
    total_delta = 0.0
    resets_detected = 0
    anomalies = 0

    for i in range(1, len(readings)):
        prev = readings[i - 1]["energy_kwh"]
        curr = readings[i]["energy_kwh"]

        if curr >= prev:
            delta = curr - prev
            # Sanity check: delta shouldn't exceed 500 kWh between consecutive sensor intervals
            if delta <= 500.0:
                total_delta += delta
            else:
                anomalies += 1
        else:
            # Meter reset or replacement detected
            resets_detected += 1
            # For a reset, the new reading curr represents consumption since reset
            if curr <= 100.0:
                total_delta += curr

    return {
        "total_consumption_kwh": round(total_delta, 4),
        "sample_count": len(readings),
        "first_reading_kwh": readings[0]["energy_kwh"],
        "latest_reading_kwh": readings[-1]["energy_kwh"],
        "resets_detected": resets_detected,
        "anomalies_flagged": anomalies,
    }


def aggregate_daily_iot_energy(readings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Groups chronological readings by calendar date and calculates daily kWh consumed."""
    by_day: dict[str, list[dict[str, Any]]] = {}
    for r in readings:
        rec_date = r["recorded_at"][:10]
        by_day.setdefault(rec_date, []).append(r)

    results = []
    for day in sorted(by_day.keys()):
        day_readings = by_day[day]
        consumed = calculate_energy_consumption(day_readings)["total_consumption_kwh"]
        # If only 1 reading exists for the day, approximate from average power * hours or report 0 delta
        avg_power = sum(r["power"] for r in day_readings) / len(day_readings)
        results.append({
            "date": day,
            "consumption_kwh": consumed,
            "sample_count": len(day_readings),
            "average_power_w": round(avg_power, 2),
            "peak_power_w": max(r["power"] for r in day_readings),
        })
    return results

