"""
integrations/crypto.py — Fernet encryption helpers for integration configs.

The encryption key is read from the INTEGRATION_ENCRYPTION_KEY env var.
If not set, a per-process key is generated (dev/test mode — configs won't
survive restarts, which is fine for local development).

Never log or return decrypted payloads containing passwords or tokens.
"""
from __future__ import annotations

import json
import logging
import os
from functools import lru_cache

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    key = os.getenv("INTEGRATION_ENCRYPTION_KEY")
    if key:
        return Fernet(key.encode())
    # Dev/test fallback — generate a new key each process start
    logger.warning(
        "INTEGRATION_ENCRYPTION_KEY not set — using ephemeral key. "
        "Encrypted configs will be lost on restart."
    )
    return Fernet(Fernet.generate_key())


def encrypt_config(config: dict) -> dict:
    """Serialize config dict to JSON, encrypt it, return {'_enc': <ciphertext>}."""
    plaintext = json.dumps(config).encode()
    ciphertext = _get_fernet().encrypt(plaintext).decode()
    return {"_enc": ciphertext}


def decrypt_config(stored: dict) -> dict:
    """
    Reverse of encrypt_config.
    If the dict doesn't have '_enc' (legacy / plain config) return it as-is.
    """
    if "_enc" not in stored:
        return stored
    plaintext = _get_fernet().decrypt(stored["_enc"].encode())
    return json.loads(plaintext)
