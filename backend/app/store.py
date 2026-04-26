"""In-memory cache for analysis reports.

This module is intentionally narrow: it holds only the AnalysisReport objects
produced by /api/chat, giving the QC endpoint fast access to recent results.
It is volatile — data is lost on restart — which is acceptable for a cache.

Session storage (save / list / fetch) lives in postgres_service (Supabase).
Do NOT add session storage back here.
"""

from app.agents.state import AnalysisReport

# Analysis reports keyed by session_id — populated by /api/chat
_reports: dict[str, AnalysisReport] = {}


def save(report: AnalysisReport) -> None:
    _reports[report.session_id] = report


def get(session_id: str) -> AnalysisReport | None:
    return _reports.get(session_id)


def get_many(session_ids: list[str]) -> list[AnalysisReport]:
    return [_reports[sid] for sid in session_ids if sid in _reports]


def all_reports() -> list[AnalysisReport]:
    return list(_reports.values())
