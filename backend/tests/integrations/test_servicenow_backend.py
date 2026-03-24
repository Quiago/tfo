"""Tests for ServiceNowConnector — all HTTP calls mocked via unittest.mock."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.v1.connectors.backends.servicenow import ServiceNowConnector, _SEVERITY_MAP


def _make_connector(endpoint: str = "https://dev12345.service-now.com") -> MagicMock:
    c = MagicMock()
    c.id = "sn-1"
    c.endpoint = endpoint
    c.backend_config = {"username": "admin", "password": "secret"}
    return c


class TestServiceNowWrite:
    @pytest.mark.asyncio
    async def test_write_posts_to_incident_table(self):
        connector = _make_connector()
        backend = ServiceNowConnector(connector)
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"result": {"sys_id": "abc123", "number": "INC001"}}

        with patch("app.api.v1.connectors.backends.servicenow.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_resp)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = await backend.write("incident", {"title": "Disk Full", "severity": "critical"})

        mock_client.post.assert_called_once()
        url_called = mock_client.post.call_args[0][0]
        assert url_called.endswith("/api/now/table/incident")
        assert result["sys_id"] == "abc123"

    @pytest.mark.asyncio
    async def test_write_defaults_to_incident_table_when_path_empty(self):
        connector = _make_connector()
        backend = ServiceNowConnector(connector)
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"result": {}}

        with patch("app.api.v1.connectors.backends.servicenow.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_resp)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            await backend.write("", {"title": "Test"})

        url_called = mock_client.post.call_args[0][0]
        assert url_called.endswith("/api/now/table/incident")

    @pytest.mark.asyncio
    async def test_write_maps_emergency_severity(self):
        connector = _make_connector()
        backend = ServiceNowConnector(connector)
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"result": {}}

        with patch("app.api.v1.connectors.backends.servicenow.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_resp)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            await backend.write("incident", {"severity": "emergency"})

        body = mock_client.post.call_args[1]["json"]
        assert body["impact"] == "1"
        assert body["urgency"] == "1"

    @pytest.mark.asyncio
    async def test_write_raises_on_http_error(self):
        import httpx
        connector = _make_connector()
        backend = ServiceNowConnector(connector)
        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "401", request=MagicMock(), response=MagicMock()
        )
        mock_resp.json.return_value = {"result": {}}

        with patch("app.api.v1.connectors.backends.servicenow.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_resp)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            with pytest.raises(Exception):
                await backend.write("incident", {"title": "Test"})


class TestServiceNowRead:
    @pytest.mark.asyncio
    async def test_read_calls_correct_url(self):
        connector = _make_connector()
        backend = ServiceNowConnector(connector)
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"result": {"sys_id": "abc123", "short_description": "Test"}}

        with patch("app.api.v1.connectors.backends.servicenow.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_resp)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = await backend.read("incident/abc123")

        url_called = mock_client.get.call_args[0][0]
        assert "incident/abc123" in url_called
        assert result["sys_id"] == "abc123"

    @pytest.mark.asyncio
    async def test_read_raises_on_invalid_path(self):
        connector = _make_connector()
        backend = ServiceNowConnector(connector)
        with pytest.raises(ValueError, match="sys_id"):
            await backend.read("nodash")


class TestServiceNowHealth:
    @pytest.mark.asyncio
    async def test_health_returns_false_when_no_endpoint(self):
        connector = _make_connector(endpoint="")
        backend = ServiceNowConnector(connector)
        assert await backend.health() is False

    @pytest.mark.asyncio
    async def test_health_returns_true_on_200(self):
        connector = _make_connector()
        backend = ServiceNowConnector(connector)
        mock_resp = MagicMock()
        mock_resp.status_code = 200

        with patch("app.api.v1.connectors.backends.servicenow.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_resp)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = await backend.health()

        assert result is True

    @pytest.mark.asyncio
    async def test_health_returns_false_on_network_error(self):
        connector = _make_connector()
        backend = ServiceNowConnector(connector)
        with patch("app.api.v1.connectors.backends.servicenow.httpx.AsyncClient") as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(side_effect=Exception("timeout"))
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = await backend.health()
        assert result is False


class TestServiceNowDiscover:
    @pytest.mark.asyncio
    async def test_discover_returns_four_tables(self):
        connector = _make_connector()
        backend = ServiceNowConnector(connector)
        result = await backend.discover()
        assert result.node_count == 4
        node_ids = [n.node_id for n in result.nodes]
        assert "incident" in node_ids
        assert "change_request" in node_ids
