"""
connectors/backends/smtp_email.py — SMTP / M365 Mail connector.

Sends plain-text or HTML alert emails via SMTP (works with Office 365,
Gmail, and any standard SMTP relay).

connector.endpoint    = SMTP host:port  e.g. smtp.office365.com:587
connector.backend_config = {
    "username":   "alerts@company.com",
    "password":   "...",
    "from_addr":  "alerts@company.com",   # defaults to username
    "use_tls":    True,                    # STARTTLS (default True)
    "recipients": ["noc@company.com"],    # default recipient list
}

write() payload keys:
  to        list[str]  — recipient(s), overrides config default
  subject   str        — email subject
  body      str        — plain-text body
  html      str        — HTML body (optional, sent as alternative)
  severity  str        — prepended to subject as [SEVERITY] tag
"""
from __future__ import annotations

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from app.api.v1.connectors.backends.base import ConnectorBackend, DiscoveryResult

logger = logging.getLogger(__name__)


def _parse_endpoint(endpoint: str) -> tuple[str, int]:
    """Parse 'host:port' → (host, port). Defaults to port 587."""
    if ":" in endpoint:
        host, port_str = endpoint.rsplit(":", 1)
        return host.strip(), int(port_str.strip())
    return endpoint.strip(), 587


class SMTPEmailConnector(ConnectorBackend):
    """
    Sends alert emails via SMTP / Microsoft 365 Mail relay.
    """

    def _cfg(self) -> dict:
        return self.connector.backend_config or {}

    async def write(self, path: str, value: dict, **kwargs) -> None:
        """
        Send an email.

        path:  ignored (reserved for future routing, e.g. mailing lists)
        value: dict — see module docstring for keys.
        """
        cfg = self._cfg()
        host, port = _parse_endpoint(self.connector.endpoint)
        username   = cfg.get("username", "")
        password   = cfg.get("password", "")
        from_addr  = cfg.get("from_addr") or username
        use_tls    = cfg.get("use_tls", True)

        severity = str(value.get("severity", "info")).upper()
        subject  = f"[{severity}] {value.get('subject', value.get('title', 'OpsFlow Alert'))}"
        body     = value.get("body", "")
        html     = value.get("html", "")
        to_list: list[str] = value.get("to") or cfg.get("recipients") or []

        if not to_list:
            raise ValueError("SMTPEmailConnector: no recipients specified in payload or connector config")

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = from_addr
        msg["To"]      = ", ".join(to_list)

        if body:
            msg.attach(MIMEText(body, "plain"))
        if html:
            msg.attach(MIMEText(html, "html"))
        elif body:
            # Wrap plain text in minimal HTML for clients that prefer it
            msg.attach(MIMEText(f"<pre>{body}</pre>", "html"))

        await aiosmtplib.send(
            msg,
            hostname=host,
            port=port,
            username=username,
            password=password,
            start_tls=use_tls,
        )
        logger.info(
            "smtp_email_sent — connector=%s subject=%r to=%s",
            self.connector.id, subject, to_list,
        )

    async def read(self, path: str, **kwargs):
        raise NotImplementedError("SMTPEmailConnector is send-only; use IMAP for reading emails")

    async def health(self) -> bool:
        if not self.connector.endpoint:
            return False
        cfg = self._cfg()
        host, port = _parse_endpoint(self.connector.endpoint)
        try:
            smtp = aiosmtplib.SMTP(hostname=host, port=port)
            await smtp.connect()
            if cfg.get("use_tls", True):
                await smtp.starttls()
            await smtp.login(cfg.get("username", ""), cfg.get("password", ""))
            await smtp.quit()
            return True
        except Exception as exc:
            logger.warning("smtp_health_failed — connector=%s err=%s", self.connector.id, exc)
            return False

    async def discover(self) -> DiscoveryResult:
        return DiscoveryResult(connector_id=self.connector.id, node_count=0, nodes=[])
