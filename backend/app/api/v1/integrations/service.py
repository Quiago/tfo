"""
integrations/service.py — Business logic for IntegrationConfig CRUD
and action dispatch to external systems.

Public API:
  create(data, user_id, session)           → IntegrationConfig
  update(id, data, session)                → IntegrationConfig
  delete(id, session)                      → None
  get_all(session)                         → list[IntegrationConfig]
  get(id, session)                         → IntegrationConfig
  test_connection(id, session)             → dict  (success, message)
  dispatch_action(action, event, session)  → dict  (result)
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlmodel import Session, select

from app.api.v1.integrations.crypto import decrypt_config, encrypt_config
from app.api.v1.integrations.models import IntegrationConfig, IntegrationType
from app.api.v1.integrations.schemas import IntegrationCreate, IntegrationUpdate

if TYPE_CHECKING:
    from app.api.v1.dispatcher.models import AlarmEvent

logger = logging.getLogger(__name__)


# ── CRUD ──────────────────────────────────────────────────────────────────────

def create(data: IntegrationCreate, user_id: int, session: Session) -> IntegrationConfig:
    cfg = IntegrationConfig(
        id=str(uuid.uuid4()),
        name=data.name,
        type=IntegrationType(data.type),
        config_encrypted=encrypt_config(data.config),
        is_active=data.is_active,
        platform_mode="datacenter",
        created_by=user_id,
    )
    session.add(cfg)
    session.commit()
    session.refresh(cfg)
    logger.info("integration_created — id=%s type=%s name=%s", cfg.id, cfg.type, cfg.name)
    return cfg


def update(integration_id: str, data: IntegrationUpdate, session: Session) -> IntegrationConfig:
    cfg = session.get(IntegrationConfig, integration_id)
    if not cfg:
        raise ValueError(f"Integration {integration_id} not found")
    if data.name is not None:
        cfg.name = data.name
    if data.config is not None:
        cfg.config_encrypted = encrypt_config(data.config)
    if data.is_active is not None:
        cfg.is_active = data.is_active
    cfg.updated_at = datetime.now(UTC)
    session.add(cfg)
    session.commit()
    session.refresh(cfg)
    return cfg


def delete(integration_id: str, session: Session) -> None:
    cfg = session.get(IntegrationConfig, integration_id)
    if not cfg:
        raise ValueError(f"Integration {integration_id} not found")
    session.delete(cfg)
    session.commit()
    logger.info("integration_deleted — id=%s", integration_id)


def get_all(session: Session) -> list[IntegrationConfig]:
    return list(session.exec(
        select(IntegrationConfig)
        .where(IntegrationConfig.platform_mode == "datacenter")
        .order_by(IntegrationConfig.created_at)
    ).all())


def get(integration_id: str, session: Session) -> IntegrationConfig:
    cfg = session.get(IntegrationConfig, integration_id)
    if not cfg:
        raise ValueError(f"Integration {integration_id} not found")
    return cfg


# ── Connection test ───────────────────────────────────────────────────────────

async def test_connection(integration_id: str, session: Session) -> dict:
    cfg = session.get(IntegrationConfig, integration_id)
    if not cfg:
        raise ValueError(f"Integration {integration_id} not found")

    config = decrypt_config(cfg.config_encrypted)
    success = False
    message = ""

    try:
        if cfg.type == IntegrationType.teams:
            success, message = await _test_teams(config)
        elif cfg.type == IntegrationType.servicenow:
            success, message = await _test_servicenow(config)
        elif cfg.type == IntegrationType.email:
            success, message = await _test_email(config)
        else:
            message = f"Unknown integration type: {cfg.type}"
    except Exception as exc:
        success = False
        message = str(exc)
        logger.exception("integration_test_error — id=%s type=%s", cfg.id, cfg.type)

    cfg.last_tested_at = datetime.now(UTC)
    cfg.last_test_status = "ok" if success else "failed"
    session.add(cfg)
    session.commit()

    return {"success": success, "message": message}


async def _test_teams(config: dict) -> tuple[bool, str]:
    import httpx
    webhook_url = config.get("webhook_url", "")
    if not webhook_url:
        return False, "webhook_url is required in config"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook_url, json={
                "type": "message",
                "attachments": [{
                    "contentType": "application/vnd.microsoft.card.adaptive",
                    "content": {
                        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                        "type": "AdaptiveCard",
                        "version": "1.4",
                        "body": [{"type": "TextBlock", "text": "OpsFlow connectivity check ✓", "weight": "Bolder"}],
                    },
                }],
            })
        return resp.status_code == 200, f"HTTP {resp.status_code}"
    except Exception as exc:
        return False, str(exc)


async def _test_servicenow(config: dict) -> tuple[bool, str]:
    import httpx
    instance_url = config.get("instance_url", "").rstrip("/")
    if not instance_url:
        return False, "instance_url is required in config"
    url = f"{instance_url}/api/now/table/sys_user?sysparm_limit=1&sysparm_fields=sys_id"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                url,
                auth=(config.get("username", ""), config.get("password", "")),
            )
        return resp.status_code == 200, f"HTTP {resp.status_code}"
    except Exception as exc:
        return False, str(exc)


async def _test_email(config: dict) -> tuple[bool, str]:
    import aiosmtplib
    host_port = config.get("host", "")
    if not host_port:
        return False, "host is required in config (format: smtp.host.com:587)"
    host, port = host_port.rsplit(":", 1) if ":" in host_port else (host_port, "587")
    try:
        smtp = aiosmtplib.SMTP(hostname=host, port=int(port))
        await smtp.connect()
        if config.get("use_tls", True):
            await smtp.starttls()
        await smtp.login(config.get("username", ""), config.get("password", ""))
        await smtp.quit()
        return True, "SMTP login successful"
    except Exception as exc:
        return False, str(exc)


# ── Action dispatch ───────────────────────────────────────────────────────────

async def execute_integration_direct(
    integration_id: str,
    action_type: str,
    overrides: dict,
    session: Session,
) -> dict:
    """
    Execute an integration action directly from the agent (no AlarmEvent).
    Creates a minimal stub event so the existing _do_* helpers work unchanged.
    """
    from dataclasses import dataclass

    @dataclass
    class _StubEvent:
        id: str = "agent-direct"
        title: str = ""
        severity: str = "info"
        asset_id: str | None = None
        source_connector_id: str | None = "agent"

    cfg = session.get(IntegrationConfig, integration_id)
    if not cfg or not cfg.is_active:
        return {"type": action_type, "status": "error", "error": f"Integration {integration_id} not found or inactive"}

    config = decrypt_config(cfg.config_encrypted)
    stub = _StubEvent(
        title=overrides.get("title", ""),
        severity=overrides.get("severity", "info"),
        asset_id=overrides.get("asset_id"),
    )

    try:
        if action_type == "send_teams":
            return await _do_send_teams(config, overrides, stub)  # type: ignore[arg-type]
        if action_type == "create_servicenow_incident":
            return await _do_create_servicenow(config, overrides, stub)  # type: ignore[arg-type]
        if action_type == "send_email":
            return await _do_send_email(config, overrides, stub)  # type: ignore[arg-type]
        return {"type": action_type, "status": "error", "error": f"Unknown action type: {action_type}"}
    except Exception as exc:
        logger.exception("execute_integration_direct_error — type=%s integration=%s", action_type, integration_id)
        return {"type": action_type, "status": "error", "error": str(exc)}


async def dispatch_action(action: dict, event: "AlarmEvent", session: Session) -> dict:
    """
    Execute an integration action triggered by the Dispatcher.

    action dict keys:
      type              — "send_teams" | "create_servicenow_incident" | "send_email"
      integration_id    — the IntegrationConfig to use
      config            — action-specific overrides (optional)
    """
    action_type    = action.get("type", "")
    integration_id = action.get("integration_id", "")
    overrides      = action.get("config", {})

    if not integration_id:
        return {"type": action_type, "status": "error", "error": "integration_id is required"}

    cfg = session.get(IntegrationConfig, integration_id)
    if not cfg or not cfg.is_active:
        return {"type": action_type, "status": "error", "error": f"Integration {integration_id} not found or inactive"}

    config = decrypt_config(cfg.config_encrypted)

    try:
        if action_type == "send_teams":
            return await _do_send_teams(config, overrides, event)
        if action_type == "create_servicenow_incident":
            return await _do_create_servicenow(config, overrides, event)
        if action_type == "send_email":
            return await _do_send_email(config, overrides, event)
        return {"type": action_type, "status": "error", "error": f"Unknown action type: {action_type}"}
    except Exception as exc:
        logger.exception("dispatch_action_error — type=%s integration=%s", action_type, integration_id)
        return {"type": action_type, "status": "error", "error": str(exc)}


async def _do_send_teams(config: dict, overrides: dict, event: "AlarmEvent") -> dict:
    import httpx
    from app.api.v1.connectors.backends.teams import _build_adaptive_card
    webhook_url = config.get("webhook_url", "")
    payload = {
        "title":    overrides.get("title")    or event.title,
        "severity": overrides.get("severity") or event.severity,
        "body":     overrides.get("body", ""),
        "asset_id": overrides.get("asset_id") or event.asset_id or "—",
        "source":   event.source_connector_id or "manual",
        "event_id": event.id,
    }
    card = _build_adaptive_card(payload)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(webhook_url, json=card)
        resp.raise_for_status()
    return {"type": "send_teams", "status": "ok", "sent_at": datetime.now(UTC).isoformat()}


async def _do_create_servicenow(config: dict, overrides: dict, event: "AlarmEvent") -> dict:
    import httpx
    instance_url = config.get("instance_url", "").rstrip("/")
    auth = (config.get("username", ""), config.get("password", ""))
    table = overrides.get("table", "incident")
    from app.api.v1.connectors.backends.servicenow import _SEVERITY_MAP, _DEFAULT_SEVERITY
    severity = (overrides.get("severity") or event.severity or "warning").lower()
    sev = _SEVERITY_MAP.get(severity, _DEFAULT_SEVERITY)
    payload = {
        "short_description": overrides.get("title") or event.title,
        "description":       overrides.get("body", f"Event ID: {event.id}\nAsset: {event.asset_id}"),
        "impact":            sev["impact"],
        "urgency":           sev["urgency"],
        "assignment_group":  overrides.get("assignment_group") or config.get("default_assignment_group", ""),
        "caller_id":         overrides.get("caller_id")        or config.get("default_caller_id", "admin"),
    }
    url = f"{instance_url}/api/now/table/{table}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=payload, auth=auth)
        resp.raise_for_status()
    result = resp.json().get("result", {})
    return {
        "type": "create_servicenow_incident",
        "status": "ok",
        "sys_id": result.get("sys_id"),
        "number": result.get("number"),
        "created_at": datetime.now(UTC).isoformat(),
    }


async def _do_send_email(config: dict, overrides: dict, event: "AlarmEvent") -> dict:
    import aiosmtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    host_port = config.get("host", "localhost:587")
    host, port = host_port.rsplit(":", 1) if ":" in host_port else (host_port, "587")
    username  = config.get("username", "")
    password  = config.get("password", "")
    from_addr = config.get("from_addr") or username
    to_list   = overrides.get("to") or config.get("recipients", [])
    severity  = (overrides.get("severity") or event.severity or "info").upper()
    subject   = f"[{severity}] {overrides.get('subject') or event.title}"
    body      = overrides.get("body") or f"Event: {event.title}\nAsset: {event.asset_id}\nID: {event.id}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = from_addr
    msg["To"]      = ", ".join(to_list)
    msg.attach(MIMEText(body, "plain"))

    await aiosmtplib.send(
        msg, hostname=host, port=int(port),
        username=username, password=password,
        start_tls=config.get("use_tls", True),
    )
    return {"type": "send_email", "status": "ok", "sent_at": datetime.now(UTC).isoformat()}
