"""Tests for the source credential management API.

All CI-safe — mock postgres_service and Langfuse client.
"""

import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


# ── Helpers ────────────────────────────────────────────────────────────────────

def _mock_postgres(get_return=None, set_return=None):
    mock = AsyncMock()
    mock.get_setting = AsyncMock(return_value=get_return)
    mock.set_setting = AsyncMock(return_value=set_return)
    return mock


async def _post_source(client, name="my-agent", provider="langfuse",
                       public_key="pk-test", secret_key="sk-test"):
    return await client.post("/api/settings/sources", json={
        "name": name, "provider": provider,
        "public_key": public_key, "secret_key": secret_key,
    })


# ── Encryption roundtrip ───────────────────────────────────────────────────────


def test_encryption_roundtrip():
    import os
    from cryptography.fernet import Fernet
    key = Fernet.generate_key().decode()
    with patch.dict(os.environ, {"CREDENTIAL_ENCRYPTION_KEY": key}):
        # Re-instantiate settings so the new key is picked up
        with patch("app.utils.credential_crypto.settings") as mock_settings:
            mock_settings.credential_encryption_key = key
            # Reset cipher so it picks up the new key
            import app.utils.credential_crypto as cc
            cc._cipher = None
            from app.utils.credential_crypto import decrypt, encrypt
            plaintext = "sk-super-secret-value"
            ciphertext = encrypt(plaintext)
            assert ciphertext != plaintext
            assert decrypt(ciphertext) == plaintext
            cc._cipher = None  # reset for other tests


def test_encrypted_value_differs_from_plaintext():
    import os
    from cryptography.fernet import Fernet
    key = Fernet.generate_key().decode()
    with patch("app.utils.credential_crypto.settings") as mock_settings:
        mock_settings.credential_encryption_key = key
        import app.utils.credential_crypto as cc
        cc._cipher = None
        from app.utils.credential_crypto import encrypt
        result = encrypt("my-secret")
        assert result != "my-secret"
        assert len(result) > 20
        cc._cipher = None


# ── POST /api/settings/sources ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_post_source_stores_encrypted_credential():
    stored_calls = {}

    async def mock_set(key, value):
        stored_calls[key] = value

    with (
        patch("app.api.sources.postgres_service.get_setting", new=AsyncMock(return_value=None)),
        patch("app.api.sources.postgres_service.set_setting", new=AsyncMock(side_effect=mock_set)),
        patch("app.api.sources.encryption_available", return_value=True),
        patch("app.api.sources.encrypt", return_value="gAAAAABencrypted"),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await _post_source(client)

    assert response.status_code == 200
    # Key is org-prefixed in multi-tenant mode — find by suffix
    source_key = next((k for k in stored_calls if k.endswith("source:my-agent")), None)
    assert source_key is not None, f"source:my-agent key not found in {list(stored_calls)}"
    payload = json.loads(stored_calls[source_key])
    assert "secret_key_enc" in payload
    assert "secret_key" not in payload  # raw key must NOT be stored
    assert payload["secret_key_enc"] == "gAAAAABencrypted"


@pytest.mark.asyncio
async def test_post_source_503_when_no_encryption_key():
    with patch("app.api.sources.encryption_available", return_value=False):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await _post_source(client)
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_post_source_422_invalid_name():
    with patch("app.api.sources.encryption_available", return_value=True):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/settings/sources", json={
                "name": "INVALID NAME!", "provider": "langfuse",
                "public_key": "pk-x", "secret_key": "sk-x",
            })
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_post_source_422_invalid_provider():
    with patch("app.api.sources.encryption_available", return_value=True):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/settings/sources", json={
                "name": "my-agent", "provider": "datadog",
                "public_key": "pk-x", "secret_key": "sk-x",
            })
    assert response.status_code == 422


# ── GET /api/settings/sources ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_sources_never_returns_secret_key():
    index_json = json.dumps(["my-agent"])
    source_json = json.dumps({
        "provider": "langfuse",
        "public_key": "pk-xxx",
        "secret_key_enc": "gAAAAABencrypted",
        "base_url": "",
        "created_at": "2026-05-05T00:00:00Z",
    })

    async def mock_get(key):
        if key.endswith("sources_index"):
            return index_json
        if key.endswith("source:my-agent"):
            return source_json
        return None

    with patch("app.api.sources.postgres_service.get_setting", new=AsyncMock(side_effect=mock_get)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/settings/sources")

    assert response.status_code == 200
    body = response.json()
    sources = body["data"]
    assert len(sources) == 1
    source = sources[0]
    assert "secret_key" not in source
    assert "secret_key_enc" not in source
    assert source["has_credentials"] is True
    assert source["name"] == "my-agent"


@pytest.mark.asyncio
async def test_get_sources_empty_when_no_index():
    with patch("app.api.sources.postgres_service.get_setting", new=AsyncMock(return_value=None)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/settings/sources")
    assert response.status_code == 200
    assert response.json()["data"] == []


# ── DELETE /api/settings/sources/{name} ───────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_source_removes_entry():
    source_json = json.dumps({"provider": "langfuse", "public_key": "pk-x",
                               "secret_key_enc": "enc", "base_url": "", "created_at": "..."})
    set_calls = {}

    async def mock_set(key, value):
        set_calls[key] = value

    with (
        patch("app.api.sources.postgres_service.get_setting", new=AsyncMock(return_value=source_json)),
        patch("app.api.sources.postgres_service.set_setting", new=AsyncMock(side_effect=mock_set)),
        patch("app.api.sources._update_index", new=AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.delete("/api/settings/sources/my-agent")

    assert response.status_code == 200
    deleted_key = next((k for k in set_calls if k.endswith("source:my-agent")), None)
    assert deleted_key is not None and set_calls[deleted_key] == ""


@pytest.mark.asyncio
async def test_delete_source_404_when_not_found():
    with patch("app.api.sources.postgres_service.get_setting", new=AsyncMock(return_value=None)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.delete("/api/settings/sources/nonexistent")
    assert response.status_code == 404


# ── POST /api/settings/sources/{name}/test ────────────────────────────────────


@pytest.mark.asyncio
async def test_test_source_ok_on_valid_creds():
    source_json = json.dumps({"provider": "langfuse", "public_key": "pk-x",
                               "secret_key_enc": "enc", "base_url": "", "created_at": "..."})
    with (
        patch("app.api.sources.postgres_service.get_setting", new=AsyncMock(return_value=source_json)),
        patch("app.api.sources.decrypt", return_value="sk-decrypted"),
        patch("app.api.sources._test_langfuse",
              new=AsyncMock(return_value=type("T", (), {"ok": True, "message": "Connected."})())),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/settings/sources/my-agent/test")
    assert response.status_code == 200
    assert response.json()["data"]["ok"] is True


@pytest.mark.asyncio
async def test_test_source_error_on_bad_creds():
    source_json = json.dumps({"provider": "langfuse", "public_key": "pk-x",
                               "secret_key_enc": "enc", "base_url": "", "created_at": "..."})
    with (
        patch("app.api.sources.postgres_service.get_setting", new=AsyncMock(return_value=source_json)),
        patch("app.api.sources.decrypt", return_value="sk-bad"),
        patch("app.api.sources._test_langfuse",
              new=AsyncMock(return_value=type("T", (), {"ok": False, "message": "Invalid key"})())),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/settings/sources/my-agent/test")
    assert response.status_code == 200
    assert response.json()["data"]["ok"] is False


# ── Auth middleware ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_api_key_middleware_passes_through_with_key():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/health",
                                    headers={"Authorization": "Bearer test-key-12345"})
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_api_key_middleware_passes_through_without_key():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/health")
    assert response.status_code == 200
