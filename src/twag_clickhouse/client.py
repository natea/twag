from __future__ import annotations

import logging
import random
import socket
import time
from contextlib import redirect_stderr, redirect_stdout
from collections.abc import Sequence
from http.client import RemoteDisconnected
from io import StringIO
from typing import Any
from urllib.error import URLError

from .config import ClickHouseConfig


CLICKHOUSE_HTTP_LOGGER = "clickhouse_connect.driver.httpclient"
CLICKHOUSE_NOISY_WARNING = "Unexpected Http Driver Exception"


class _ClickHouseNoiseFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return CLICKHOUSE_NOISY_WARNING not in record.getMessage()


def suppress_clickhouse_driver_noise() -> None:
    logger = logging.getLogger(CLICKHOUSE_HTTP_LOGGER)
    if not any(isinstance(existing, _ClickHouseNoiseFilter) for existing in logger.filters):
        logger.addFilter(_ClickHouseNoiseFilter())


suppress_clickhouse_driver_noise()


class ClickHouseTransientError(RuntimeError):
    pass


TRANSIENT_ERROR_FRAGMENTS = (
    "max retries exceeded",
    "nameresolutionerror",
    "failed to resolve",
    "temporary failure in name resolution",
    "nodename nor servname provided",
    "name or service not known",
    "read timed out",
    "connect timeout",
    "connection timeout",
    "connection aborted",
    "connection reset",
    "connection refused",
    "remote end closed connection",
    "service unavailable",
    "gateway timeout",
)


class ClickHouseService:
    def __init__(self, config: ClickHouseConfig):
        self.config = config
        self._client = None

    @property
    def client(self):
        if self._client is None:
            try:
                import clickhouse_connect
            except ImportError as exc:
                raise RuntimeError(
                    "clickhouse-connect is not installed. Run `pip install -e .`."
                ) from exc

            self._client = clickhouse_connect.get_client(
                host=self.config.host,
                port=self.config.port,
                username=self.config.username,
                password=self.config.password,
                database=self.config.database,
                secure=self.config.secure,
                connect_timeout=self.config.connect_timeout,
                send_receive_timeout=self.config.send_receive_timeout,
            )

        return self._client

    def ping(self) -> bool:
        return bool(self._with_retries(lambda: self.client.ping(), operation="ping"))

    def query(self, sql: str, parameters: dict[str, Any] | None = None) -> list[dict]:
        result = self._with_retries(
            lambda: self.client.query(sql, parameters=parameters or {}),
            operation="query",
        )
        return list(result.named_results())

    def command(self, sql: str, parameters: dict[str, Any] | None = None) -> Any:
        return self._with_retries(
            lambda: self.client.command(sql, parameters=parameters or {}),
            operation="command",
        )

    def insert_rows(
        self,
        table: str,
        rows: Sequence[Sequence[Any]],
        column_names: Sequence[str],
    ) -> None:
        self._with_retries(
            lambda: self.client.insert(table, rows, column_names=list(column_names)),
            operation="insert",
        )

    def _with_retries(self, func, *, operation: str):
        attempts = max(1, self.config.query_retries)
        delay = max(0.0, self.config.retry_initial)
        max_delay = max(delay, self.config.retry_max)
        last_exc: Exception | None = None

        for attempt in range(1, attempts + 1):
            try:
                return self._call_driver(func)
            except Exception as exc:
                if not self._is_transient(exc):
                    raise
                last_exc = exc
                if attempt >= attempts:
                    break
                if delay > 0:
                    time.sleep(delay + random.uniform(0, min(delay * 0.2, 1.0)))
                    delay = min(max_delay, delay * 2)

        detail = str(last_exc) if last_exc else "unknown transient failure"
        raise ClickHouseTransientError(
            f"ClickHouse {operation} failed after {attempts} attempts. "
            f"Endpoint: {self.config.host}:{self.config.port}. Cause: {detail}"
        ) from last_exc

    @staticmethod
    def _is_transient(exc: Exception) -> bool:
        if isinstance(
            exc,
            (
                TimeoutError,
                socket.timeout,
                ConnectionError,
                RemoteDisconnected,
                URLError,
            ),
        ):
            return True

        text = repr(exc).lower()
        return any(fragment in text for fragment in TRANSIENT_ERROR_FRAGMENTS)

    @staticmethod
    def _call_driver(func):
        # clickhouse-connect can print a generic "Unexpected Http Driver Exception"
        # before raising the detailed exception. Capture that noise and surface the
        # actionable exception from our caller instead.
        with redirect_stdout(StringIO()), redirect_stderr(StringIO()):
            return func()

    def create_demo_table(self) -> None:
        self.command(
            """
            CREATE TABLE IF NOT EXISTS analytics_events
            (
                event_time DateTime64(3) DEFAULT now64(3),
                event_name LowCardinality(String),
                properties String
            )
            ENGINE = MergeTree
            ORDER BY (event_time, event_name)
            """
        )

    def insert_event(self, event_name: str, properties_json: str = "{}") -> None:
        self.insert_rows(
            "analytics_events",
            rows=[(event_name, properties_json)],
            column_names=["event_name", "properties"],
        )
