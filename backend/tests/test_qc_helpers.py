"""Tests for QC helper functions — tool call logs, user feedback, agent traces."""

import pytest
from app.api.qc import (
    _check_agent_traces,
    _check_tool_call_logs,
    _check_user_feedback,
    QualityCheck,
    SourceReport,
)


def _tool_call(tool_name="search", status="success", latency_ms=100.0, error=None):
    tc = {"tool_name": tool_name, "status": status, "latency_ms": latency_ms}
    if error:
        tc["error"] = error
    return tc


def _session(session_id="s1", tool_calls=None, llm_calls=None, retrieval_events=None,
             outcome="success", failure_summary=None):
    return {
        "session_id": session_id,
        "agent_id": "agent-1",
        "outcome": outcome,
        "failure_summary": failure_summary,
        "tool_calls": tool_calls or [],
        "llm_calls": llm_calls or [],
        "retrieval_events": retrieval_events or [],
    }


class TestCheckAgentTraces:

    def test_all_valid_sessions_pass(self):
        sessions = [_session(session_id="s1"), _session(session_id="s2")]
        report = _check_agent_traces(sessions).compute_status()
        schema_check = next(c for c in report.checks if c.name == "Schema Validation")
        assert schema_check.status == "pass"
        assert schema_check.flagged == 0
        assert schema_check.flagged_session_ids == []

    def test_missing_session_id_flagged(self):
        sessions = [{"agent_id": "a", "outcome": "success"}]
        report = _check_agent_traces(sessions).compute_status()
        schema_check = next(c for c in report.checks if c.name == "Schema Validation")
        assert schema_check.flagged == 1

    def test_empty_session_id_flagged(self):
        sessions = [{"session_id": "", "agent_id": "a", "outcome": "success"}]
        report = _check_agent_traces(sessions).compute_status()
        schema_check = next(c for c in report.checks if c.name == "Schema Validation")
        assert schema_check.flagged == 1

    def test_session_with_zero_events_flagged_in_completeness(self):
        sessions = [_session(session_id="empty")]
        report = _check_agent_traces(sessions).compute_status()
        completeness = next(c for c in report.checks if c.name == "Completeness")
        assert "empty" in completeness.flagged_session_ids

    def test_failure_session_without_summary_flagged(self):
        sessions = [_session(session_id="s1", outcome="failure", failure_summary=None,
                             llm_calls=[{"call_id": "c1"}])]
        report = _check_agent_traces(sessions).compute_status()
        completeness = next(c for c in report.checks if c.name == "Completeness")
        assert "s1" in completeness.flagged_session_ids

    def test_failure_session_with_summary_not_flagged(self):
        sessions = [_session(session_id="s1", outcome="failure",
                             failure_summary="Tool failed", llm_calls=[{"call_id": "c1"}])]
        report = _check_agent_traces(sessions).compute_status()
        completeness = next(c for c in report.checks if c.name == "Completeness")
        assert "s1" not in completeness.flagged_session_ids

    def test_source_name_is_agent_traces(self):
        report = _check_agent_traces([_session()])
        assert report.source == "Agent Traces"

    def test_total_equals_session_count(self):
        sessions = [_session("s1"), _session("s2"), _session("s3")]
        report = _check_agent_traces(sessions)
        assert report.total == 3


class TestCheckToolCallLogs:

    def test_no_tool_calls_returns_warn(self):
        report = _check_tool_call_logs([_session()]).compute_status()
        assert report.status == "warn"

    def test_all_tools_pass_when_low_error_rate(self):
        sessions = [_session(session_id="s1", tool_calls=[
            _tool_call("search", "success"),
            _tool_call("search", "success"),
            _tool_call("search", "success"),
            _tool_call("search", "failed"),
        ])]
        report = _check_tool_call_logs(sessions).compute_status()
        error_check = next(c for c in report.checks if c.name == "Error Rate Monitoring")
        # 25% error rate > 10% — should be flagged
        assert error_check.flagged == 1
        assert error_check.status == "warn"

    def test_tool_below_10pct_error_rate_passes(self):
        sessions = [_session(session_id="s1", tool_calls=[
            _tool_call("search", "success") for _ in range(9)
        ] + [_tool_call("search", "failed")])]
        report = _check_tool_call_logs(sessions).compute_status()
        error_check = next(c for c in report.checks if c.name == "Error Rate Monitoring")
        # 10% is not > 10% → pass
        assert error_check.flagged == 0

    def test_latency_outlier_detection_fires(self):
        # Normal calls ~100ms, one outlier at 10000ms
        tool_calls = [_tool_call(latency_ms=100) for _ in range(10)]
        tool_calls.append(_tool_call(latency_ms=10000))
        sessions = [_session(session_id="s1", tool_calls=tool_calls)]
        report = _check_tool_call_logs(sessions).compute_status()
        latency_check = next(c for c in report.checks if "Latency" in c.name)
        assert latency_check.flagged >= 1

    def test_high_error_rate_flags_session_ids(self):
        sessions = [
            _session(session_id="s1", tool_calls=[_tool_call("bad_tool", "failed")] * 5),
            _session(session_id="s2", tool_calls=[_tool_call("good_tool", "success")] * 10),
        ]
        report = _check_tool_call_logs(sessions).compute_status()
        error_check = next(c for c in report.checks if c.name == "Error Rate Monitoring")
        assert "s1" in error_check.flagged_session_ids
        assert "s2" not in error_check.flagged_session_ids

    def test_total_count_is_sum_of_all_tool_calls(self):
        sessions = [
            _session("s1", tool_calls=[_tool_call() for _ in range(3)]),
            _session("s2", tool_calls=[_tool_call() for _ in range(5)]),
        ]
        report = _check_tool_call_logs(sessions)
        assert report.total == 8


class TestCheckUserFeedback:

    def test_user_feedback_check_returns_source_report(self):
        report = _check_user_feedback().compute_status()
        assert report.source == "User Feedback"
        assert len(report.checks) == 2

    def test_coverage_check_is_warn_when_no_feedback(self):
        report = _check_user_feedback().compute_status()
        coverage = next(c for c in report.checks if c.name == "Coverage")
        assert coverage.status == "warn"

    def test_label_distribution_check_passes(self):
        report = _check_user_feedback().compute_status()
        label_check = next(c for c in report.checks if c.name == "Label Distribution")
        assert label_check.status == "pass"


class TestQualityCheckModel:

    def test_default_flagged_session_ids_is_empty_list(self):
        check = QualityCheck(name="Test", status="pass", detail="ok")
        assert check.flagged_session_ids == []

    def test_flagged_session_ids_populated(self):
        check = QualityCheck(name="Test", status="warn", detail="issues",
                             flagged=2, flagged_session_ids=["s1", "s2"])
        assert "s1" in check.flagged_session_ids

    def test_source_report_compute_status_fail_wins(self):
        report = SourceReport(source="Test")
        report.checks = [
            QualityCheck(name="A", status="pass", detail="ok"),
            QualityCheck(name="B", status="warn", detail="warn"),
            QualityCheck(name="C", status="fail", detail="fail"),
        ]
        report.compute_status()
        assert report.status == "fail"

    def test_source_report_compute_status_warn(self):
        report = SourceReport(source="Test")
        report.checks = [
            QualityCheck(name="A", status="pass", detail="ok"),
            QualityCheck(name="B", status="warn", detail="warn"),
        ]
        report.compute_status()
        assert report.status == "warn"

    def test_source_report_compute_status_all_pass(self):
        report = SourceReport(source="Test")
        report.checks = [
            QualityCheck(name="A", status="pass", detail="ok"),
            QualityCheck(name="B", status="pass", detail="ok"),
        ]
        report.compute_status()
        assert report.status == "pass"
