"""Tests for freeform chat routing helpers.

The freeform endpoint now uses a single LLM call (_llm_route) to classify
intent — no keyword matching. These tests cover only the pure utility
functions that remain: _severity and the FailureType enum values used in
routing responses.

Integration-level routing behaviour (stats / list / diagnostic / general)
is validated manually via the Chat Debug UI since it requires a live LLM.
"""

import pytest

from app.api.chat import _severity
from app.models.trace import FailureType


class TestSeverity:
    def test_critical(self):
        assert _severity(100) == "critical"
        assert _severity(150) == "critical"

    def test_high(self):
        assert _severity(50) == "high"
        assert _severity(99) == "high"

    def test_medium(self):
        assert _severity(20) == "medium"
        assert _severity(49) == "medium"

    def test_low(self):
        assert _severity(0) == "low"
        assert _severity(19) == "low"


class TestFailureTypeValues:
    """Ensure the FailureType labels the LLM produces are valid enum values."""

    def test_all_labels_parseable(self):
        for label in ("memory", "tool_misfire", "hallucination", "blind_spot", "unknown"):
            ft = FailureType(label)
            assert ft.value == label

    def test_invalid_label_raises(self):
        with pytest.raises(ValueError):
            FailureType("not_a_real_type")
