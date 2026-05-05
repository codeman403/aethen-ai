"""Tests for eval API endpoints.

POST /api/eval/run     — run eval pipeline, return EvalReport
GET  /api/eval/results — latest stored EvalReport

All tests mock run_eval and postgres to avoid LLM calls and DB connections.
"""

import json
from dataclasses import asdict
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

import app.api.eval as eval_module
from app.eval.metrics import (
    ClassificationMetrics,
    PerClassMetrics,
    RetrievalMetrics,
    SynthesisMetrics,
)
from app.eval.runner import EvalReport
from app.main import app


# ── Fixtures ───────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def reset_running_flag():
    """Reset the in-process concurrency guard between every test."""
    eval_module._running = False
    yield
    eval_module._running = False


@pytest.fixture
def mock_report() -> EvalReport:
    """Minimal valid EvalReport for mocking run_eval."""
    classification = ClassificationMetrics(
        accuracy=1.0,
        per_class={
            "memory": PerClassMetrics(precision=1.0, recall=1.0, f1=1.0, support=25),
            "tool_misfire": PerClassMetrics(precision=1.0, recall=1.0, f1=1.0, support=25),
            "hallucination": PerClassMetrics(precision=1.0, recall=1.0, f1=1.0, support=25),
            "blind_spot": PerClassMetrics(precision=1.0, recall=1.0, f1=1.0, support=25),
        },
        confusion_matrix=[[25, 0, 0, 0], [0, 25, 0, 0], [0, 0, 25, 0], [0, 0, 0, 25]],
        confusion_labels=["memory", "tool_misfire", "hallucination", "blind_spot"],
        confidence_calibration_r=0.5,
        sample_count=100,
    )
    retrieval = RetrievalMetrics(
        context_recall=0.75,
        context_precision=1.0,
        hit_rate=0.85,
        sample_count=43,
    )
    synthesis = SynthesisMetrics(
        mode="fast",
        keyword_match_rate=0.83,
        avg_confidence=0.90,
        judge_score=None,
        sample_count=0,
    )
    return EvalReport(
        run_id="eval-run-test-001",
        timestamp="2026-05-05T00:00:00+00:00",
        dataset_size=100,
        mode="fast",
        classification=classification,
        retrieval=retrieval,
        synthesis=synthesis,
        regression_passed=True,
        gates={
            "classification_accuracy": {"threshold": 0.90, "actual": 1.0, "passed": True},
        },
    )


# ── POST /api/eval/run ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_eval_run_returns_report(mock_report):
    with (
        patch("app.eval.runner.run_eval", new=AsyncMock(return_value=mock_report)),
        patch("app.api.eval.postgres_service.set_setting", new=AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/eval/run", json={"mode": "fast", "push_to_langfuse": False})

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert body["data"]["run_id"] == "eval-run-test-001"
    assert body["data"]["mode"] == "fast"
    assert body["data"]["dataset_size"] == 100
    assert body["data"]["regression_passed"] is True


@pytest.mark.asyncio
async def test_eval_run_response_envelope(mock_report):
    with (
        patch("app.eval.runner.run_eval", new=AsyncMock(return_value=mock_report)),
        patch("app.api.eval.postgres_service.set_setting", new=AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/eval/run", json={})

    body = response.json()
    assert "data" in body
    assert "error" in body
    assert "metadata" in body
    assert body["error"] is None


@pytest.mark.asyncio
async def test_eval_run_classification_fields_present(mock_report):
    with (
        patch("app.eval.runner.run_eval", new=AsyncMock(return_value=mock_report)),
        patch("app.api.eval.postgres_service.set_setting", new=AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/eval/run", json={})

    data = response.json()["data"]
    clf = data["classification"]
    assert "accuracy" in clf
    assert "per_class" in clf
    assert "confusion_matrix" in clf
    assert "memory" in clf["per_class"]


@pytest.mark.asyncio
async def test_eval_run_persists_to_postgres(mock_report):
    mock_set = AsyncMock()
    with (
        patch("app.eval.runner.run_eval", new=AsyncMock(return_value=mock_report)),
        patch("app.api.eval.postgres_service.set_setting", new=mock_set),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post("/api/eval/run", json={})

    mock_set.assert_called_once()
    call_args = mock_set.call_args
    assert call_args[0][0] == "eval_last_report"
    stored = json.loads(call_args[0][1])
    assert stored["run_id"] == "eval-run-test-001"


@pytest.mark.asyncio
async def test_eval_run_409_when_already_running(mock_report):
    eval_module._running = True
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/eval/run", json={})

    assert response.status_code == 409
    assert "in progress" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_eval_run_404_when_dataset_missing():
    with patch("app.eval.runner.run_eval", new=AsyncMock(side_effect=FileNotFoundError("eval_dataset.json not found"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/eval/run", json={})

    assert response.status_code == 404
    assert "eval_dataset.json" in response.json()["detail"]


@pytest.mark.asyncio
async def test_eval_run_500_on_unexpected_error():
    with patch("app.eval.runner.run_eval", new=AsyncMock(side_effect=RuntimeError("pipeline exploded"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/eval/run", json={})

    assert response.status_code == 500


@pytest.mark.asyncio
async def test_eval_run_resets_running_flag_on_error():
    """_running must be False after a failed run — otherwise all subsequent calls get 409."""
    with patch("app.eval.runner.run_eval", new=AsyncMock(side_effect=RuntimeError("boom"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post("/api/eval/run", json={})

    assert eval_module._running is False


@pytest.mark.asyncio
async def test_eval_run_invalid_mode_rejected():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/eval/run", json={"mode": "turbo"})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_eval_run_limit_out_of_range_rejected():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/eval/run", json={"limit": 0})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_eval_run_postgres_failure_does_not_fail_request(mock_report):
    """Postgres persist failure is logged but should not surface as a 500."""
    with (
        patch("app.eval.runner.run_eval", new=AsyncMock(return_value=mock_report)),
        patch("app.api.eval.postgres_service.set_setting", new=AsyncMock(side_effect=Exception("db down"))),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/eval/run", json={})

    assert response.status_code == 200
    assert response.json()["data"]["run_id"] == "eval-run-test-001"


# ── GET /api/eval/results ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_eval_results_returns_stored_report(mock_report):
    stored_json = json.dumps(asdict(mock_report))
    with patch("app.api.eval.postgres_service.get_setting", new=AsyncMock(return_value=stored_json)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/eval/results")

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert body["data"]["run_id"] == "eval-run-test-001"
    assert body["data"]["regression_passed"] is True


@pytest.mark.asyncio
async def test_eval_results_returns_null_when_no_report():
    with patch("app.api.eval.postgres_service.get_setting", new=AsyncMock(return_value=None)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/eval/results")

    assert response.status_code == 200
    assert response.json()["data"] is None


@pytest.mark.asyncio
async def test_eval_results_graceful_on_postgres_error():
    with patch("app.api.eval.postgres_service.get_setting", new=AsyncMock(side_effect=Exception("db down"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/eval/results")

    assert response.status_code == 200
    assert response.json()["data"] is None


@pytest.mark.asyncio
async def test_eval_results_response_envelope():
    with patch("app.api.eval.postgres_service.get_setting", new=AsyncMock(return_value=None)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/eval/results")

    body = response.json()
    assert "data" in body
    assert "error" in body
    assert "metadata" in body
