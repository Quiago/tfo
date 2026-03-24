"""Tests for TeamsConnector — all HTTP calls mocked via respx."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.v1.connectors.backends.teams import TeamsConnector, _build_adaptive_card


def _make_connector(endpoint: str = "https://outlook.office.com/webhook/fake") -> MagicMock:
    c = MagicMock()
    c.id = "teams-1"
    c.endpoint = endpoint
    c.backend_config = {}
    return c


class TestBuildAdaptiveCard:
    def test_contains_title(self):
        card = _build_adaptive_card({"title": "UPS Failure", "severity": "critical"})
        card_str = str(card)
        assert "UPS Failure" in card_str

    def test_severity_color_emergency(self):
        card = _build_adaptive_card({"severity": "emergency"})
        assert "#D13438" in str(card)

    def test_severity_color_info(self):
        card = _build_adaptive_card({"severity": "info"})
        assert "#0078D4" in str(card)

    def test_severity_color_unknown_defaults_to_blue(self):
        card = _build_adaptive_card({"severity": "whatever"})
        assert "#0078D4" in str(card)

    def test_fact_set_contains_asset_id(self):
        card = _build_adaptive_card({"asset_id": "UPS-RACK-42"})
        assert "UPS-RACK-42" in str(card)

    def test_body_text_included_when_present(self):
        card = _build_adaptive_card({"body": "Detailed description here"})
        assert "Detailed description here" in str(card)

    def test_body_omitted_when_empty(self):
        card = _build_adaptive_card({})
        # No extra TextBlock for body
        assert "Detailed" not in str(card)


class TestTeamsConnectorWrite:
    @pytest.mark.asyncio
    async def test_write_sends_post(self):
        connector = _make_connector()
        backend = TeamsConnector(connector)
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        with patch("app.api.v1.connectors.backends.teams.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_resp)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            await backend.write("alert", {"title": "Test", "severity": "warning"})
        mock_client.post.assert_called_once()
        call_kwargs = mock_client.post.call_args
        assert call_kwargs[0][0] == connector.endpoint

    @pytest.mark.asyncio
    async def test_write_raises_on_http_error(self):
        import httpx
        connector = _make_connector()
        backend = TeamsConnector(connector)
        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "403", request=MagicMock(), response=MagicMock()
        )
        with patch("app.api.v1.connectors.backends.teams.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_resp)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            with pytest.raises(Exception):
                await backend.write("alert", {"title": "Test"})


class TestTeamsConnectorHealth:
    @pytest.mark.asyncio
    async def test_health_returns_false_when_no_endpoint(self):
        connector = _make_connector(endpoint="")
        backend = TeamsConnector(connector)
        assert await backend.health() is False

    @pytest.mark.asyncio
    async def test_health_returns_true_on_success(self):
        connector = _make_connector()
        backend = TeamsConnector(connector)
        with patch.object(backend, "write", new=AsyncMock(return_value=None)):
            assert await backend.health() is True

    @pytest.mark.asyncio
    async def test_health_returns_false_on_error(self):
        connector = _make_connector()
        backend = TeamsConnector(connector)
        with patch.object(backend, "write", new=AsyncMock(side_effect=Exception("network error"))):
            assert await backend.health() is False
