"""Fernet symmetric encryption for third-party API credentials.

Credentials are encrypted before writing to Postgres and decrypted
in memory only when needed for an API call. The raw credential is
never returned in API responses and never logged.

The encryption key (CREDENTIAL_ENCRYPTION_KEY env var) must be a
base64-encoded 32-byte Fernet key. Generate once with:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Set in Render env vars + local .env. Never commit this value.
"""

import structlog
from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

logger = structlog.get_logger()

_cipher: Fernet | None = None


def _get_cipher() -> Fernet:
    """Return the Fernet cipher, initialised once per process."""
    global _cipher
    if _cipher is None:
        key = settings.credential_encryption_key
        if not key:
            raise RuntimeError(
                "CREDENTIAL_ENCRYPTION_KEY is not set. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        _cipher = Fernet(key.encode() if isinstance(key, str) else key)
    return _cipher


def encrypt(plaintext: str) -> str:
    """Encrypt a plaintext credential string. Returns base64 ciphertext."""
    return _get_cipher().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Decrypt a Fernet ciphertext string. Returns plaintext credential.

    Raises RuntimeError on invalid token (tampered or wrong key).
    """
    try:
        return _get_cipher().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        logger.error("credential_decryption_failed")
        raise RuntimeError("Failed to decrypt credential — key mismatch or corrupted data") from exc


def encryption_available() -> bool:
    """Return True if CREDENTIAL_ENCRYPTION_KEY is configured."""
    return bool(settings.credential_encryption_key)
