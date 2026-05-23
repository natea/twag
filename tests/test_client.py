from __future__ import annotations

import logging
import socket
from unittest.mock import patch

import pytest

from twag_clickhouse.client import (
    CLICKHOUSE_HTTP_LOGGER,
    CLICKHOUSE_NOISY_WARNING,
    ClickHouseService,
    ClickHouseTransientError,
    suppress_clickhouse_driver_noise,
)
from twag_clickhouse.config import ClickHouseConfig


class FakeQueryResult:
    def named_results(self) -> list[dict[str, int]]:
        return [{"ok": 1}]


class FakeClient:
    def __init__(self, query_func):
        self._query_func = query_func

    def query(self, sql: str, parameters: dict):
        return self._query_func(sql, parameters)


def test_clickhouse_query_retries_transient_failures() -> None:
    config = ClickHouseConfig(
        host="example.clickhouse.cloud",
        username="default",
        password="secret",
        query_retries=3,
        retry_initial=0,
    )
    service = ClickHouseService(config)
    attempts = {"count": 0}

    def flaky_query(sql: str, parameters: dict) -> FakeQueryResult:
        attempts["count"] += 1
        if attempts["count"] < 3:
            raise socket.timeout("timed out")
        return FakeQueryResult()

    service._client = FakeClient(flaky_query)

    assert service.query("SELECT 1") == [{"ok": 1}]
    assert attempts["count"] == 3


def test_clickhouse_query_reports_endpoint_after_retry_exhaustion() -> None:
    config = ClickHouseConfig(
        host="example.clickhouse.cloud",
        username="default",
        password="secret",
        port=8443,
        query_retries=2,
        retry_initial=0,
    )
    service = ClickHouseService(config)

    def broken_query(sql: str, parameters: dict) -> FakeQueryResult:
        raise RuntimeError("Failed to resolve example.clickhouse.cloud")

    service._client = FakeClient(broken_query)

    with pytest.raises(ClickHouseTransientError) as exc_info:
        service.query("SELECT 1")

    message = str(exc_info.value)
    assert "ClickHouse query failed after 2 attempts" in message
    assert "example.clickhouse.cloud:8443" in message


def test_clickhouse_query_does_not_retry_programming_errors() -> None:
    config = ClickHouseConfig(
        host="example.clickhouse.cloud",
        username="default",
        password="secret",
        query_retries=3,
        retry_initial=0,
    )
    service = ClickHouseService(config)
    attempts = {"count": 0}

    def bad_query(sql: str, parameters: dict) -> FakeQueryResult:
        attempts["count"] += 1
        raise RuntimeError("Syntax error: failed at position 1")

    service._client = FakeClient(bad_query)

    with pytest.raises(RuntimeError, match="Syntax error"):
        service.query("SELECT")

    assert attempts["count"] == 1


def test_clickhouse_config_reads_retry_settings() -> None:
    env = {
        "CLICKHOUSE_HOST": "example.clickhouse.cloud",
        "CLICKHOUSE_USERNAME": "default",
        "CLICKHOUSE_PASSWORD": "secret",
        "CLICKHOUSE_QUERY_RETRIES": "5",
        "CLICKHOUSE_RETRY_INITIAL_SECONDS": "0.5",
        "CLICKHOUSE_RETRY_MAX_SECONDS": "12",
    }

    with patch.dict("os.environ", env, clear=True):
        config = ClickHouseConfig.from_env(env_file=None)

    assert config.query_retries == 5
    assert config.retry_initial == 0.5
    assert config.retry_max == 12


def test_clickhouse_driver_noise_filter_drops_generic_warning(caplog: pytest.LogCaptureFixture) -> None:
    logger = logging.getLogger(CLICKHOUSE_HTTP_LOGGER)
    suppress_clickhouse_driver_noise()

    with caplog.at_level(logging.WARNING, logger=CLICKHOUSE_HTTP_LOGGER):
        logger.warning(CLICKHOUSE_NOISY_WARNING)
        logger.warning("useful ClickHouse warning")

    messages = [record.getMessage() for record in caplog.records]
    assert CLICKHOUSE_NOISY_WARNING not in messages
    assert "useful ClickHouse warning" in messages
