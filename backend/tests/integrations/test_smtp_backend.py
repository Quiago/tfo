"""Tests for SMTPEmailConnector — aiosmtplib calls mocked."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.v1.connectors.backends.smtp_email import SMTPEmailConnector, _parse_endpoint


def _make_connector(endpoint: str = "smtp.office365.com:587") -> MagicMock:
    c = MagicMock()
    c.id = "smtp-1"
    c.endpoint = endpoint
    c.backend_config = {
        "username": "alerts@company.com",
        "password": "secret",
        "from_addr": "alerts@company.com",
        "use_tls": True,
        "recipients": ["noc@company.com"],
    }
    return c


class TestParseEndpoint:
    def test_parses_host_and_port(self):
        assert _parse_endpoint("smtp.office365.com:587") == ("smtp.office365.com", 587)

    def test_defaults_to_587_without_port(self):
        assert _parse_endpoint("smtp.office365.com") == ("smtp.office365.com", 587)

    def test_strips_whitespace(self):
        host, port = _parse_endpoint(" smtp.host.com : 465 ")
        assert host == "smtp.host.com"
        assert port == 465


class TestSMTPEmailWrite:
    @pytest.mark.asyncio
    async def test_write_calls_aiosmtplib_send(self):
        connector = _make_connector()
        backend = SMTPEmailConnector(connector)

        with patch("app.api.v1.connectors.backends.smtp_email.aiosmtplib.send", new=AsyncMock()) as mock_send:
            await backend.write("", {
                "to": ["ops@company.com"],
                "subject": "Disk Alert",
                "body": "Disk full on server A",
                "severity": "warning",
            })
        mock_send.assert_called_once()

    @pytest.mark.asyncio
    async def test_write_uses_config_recipients_when_no_to_in_payload(self):
        connector = _make_connector()
        backend = SMTPEmailConnector(connector)

        with patch("app.api.v1.connectors.backends.smtp_email.aiosmtplib.send", new=AsyncMock()) as mock_send:
            await backend.write("", {"subject": "Alert", "body": "test"})

        call_kwargs = mock_send.call_args[1]
        # The message's To field should contain the config default
        msg = mock_send.call_args[0][0]
        assert "noc@company.com" in msg["To"]

    @pytest.mark.asyncio
    async def test_write_raises_when_no_recipients(self):
        c = MagicMock()
        c.id = "smtp-2"
        c.endpoint = "smtp.host.com:587"
        c.backend_config = {"username": "u", "password": "p"}  # no recipients
        backend = SMTPEmailConnector(c)

        with patch("app.api.v1.connectors.backends.smtp_email.aiosmtplib.send", new=AsyncMock()):
            with pytest.raises(ValueError, match="no recipients"):
                await backend.write("", {"body": "test"})

    @pytest.mark.asyncio
    async def test_write_prepends_severity_to_subject(self):
        connector = _make_connector()
        backend = SMTPEmailConnector(connector)
        captured_msg = None

        async def capture(*args, **kwargs):
            nonlocal captured_msg
            captured_msg = args[0]

        with patch("app.api.v1.connectors.backends.smtp_email.aiosmtplib.send", new=capture):
            await backend.write("", {
                "severity": "critical",
                "subject": "Test Alert",
                "to": ["ops@co.com"],
            })

        assert captured_msg is not None
        assert "[CRITICAL]" in captured_msg["Subject"]
        assert "Test Alert" in captured_msg["Subject"]

    @pytest.mark.asyncio
    async def test_write_attaches_html_when_provided(self):
        connector = _make_connector()
        backend = SMTPEmailConnector(connector)
        captured_msg = None

        async def capture(*args, **kwargs):
            nonlocal captured_msg
            captured_msg = args[0]

        with patch("app.api.v1.connectors.backends.smtp_email.aiosmtplib.send", new=capture):
            await backend.write("", {
                "to": ["ops@co.com"],
                "body": "plain text",
                "html": "<b>bold</b>",
            })

        payloads = [p.get_payload() for p in captured_msg.get_payload()]
        content_types = [p.get_content_type() for p in captured_msg.get_payload()]
        assert "text/html" in content_types


class TestSMTPEmailHealth:
    @pytest.mark.asyncio
    async def test_health_returns_false_when_no_endpoint(self):
        connector = _make_connector(endpoint="")
        backend = SMTPEmailConnector(connector)
        assert await backend.health() is False

    @pytest.mark.asyncio
    async def test_health_returns_true_on_successful_login(self):
        connector = _make_connector()
        backend = SMTPEmailConnector(connector)

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.starttls = AsyncMock()
        mock_smtp.login = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.api.v1.connectors.backends.smtp_email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await backend.health()

        assert result is True

    @pytest.mark.asyncio
    async def test_health_returns_false_on_auth_error(self):
        connector = _make_connector()
        backend = SMTPEmailConnector(connector)

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.starttls = AsyncMock()
        mock_smtp.login = AsyncMock(side_effect=Exception("535 Auth failed"))
        mock_smtp.quit = AsyncMock()

        with patch("app.api.v1.connectors.backends.smtp_email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await backend.health()

        assert result is False
