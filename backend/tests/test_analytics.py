from backend.app.analytics import anomalies, forecast, what_if


def records(values):
    return [{"period": f"2026-{month:02d}", "activity_date": f"2026-{month:02d}-01", "category": "electricity", "description": "Grid electricity", "emissions_kg": value, "factor_name": "Verified test factor", "factor_source": "Test source", "factor_source_url": "https://example.com"} for month, value in enumerate(values, 1)]


def test_forecast_less_than_six_points():
    result = forecast(records([10, 12, 11]), "2026-03", 3)["forecast"]
    assert result["estimated"] is True
    assert result["method"] == "simple moving trend"
    assert len(result["points"]) == 3


def test_anomaly_detection():
    result = anomalies(records([10, 10, 10, 10, 100]), "2026-05")
    assert len(result["anomalies"]) >= 1
    assert result["anomalies"][0]["severity"] in {"medium", "high"}


def test_what_if_reduction_and_bounds():
    result = what_if(records([100]), "2026-01", None, None, -20)["what_if"]
    assert result["before_kg"] == 100
    assert result["after_kg"] == 80
    assert result["saved_kg"] == 20
