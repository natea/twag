from __future__ import annotations

import pytest

from twag_clickhouse.subconscious_agent import (
    NytwSubconsciousAgent,
    SubconsciousConfig,
    UnsafeQueryError,
    add_default_limit,
    build_keyword_event_query,
    clean_model_answer,
    expanded_keyword_terms,
    format_event_rows,
    is_more_results_request,
    likely_event_list_question,
    likely_nytw_data_question,
    looks_like_planning_leak,
    requested_event_limit,
    validate_nytw_query,
)


def test_validate_nytw_query_accepts_read_only_nytw_select() -> None:
    sql = validate_nytw_query(
        "SELECT title FROM nytw_events WHERE fetch_status = 'ok' LIMIT 10"
    )

    assert sql.startswith("SELECT title")


def test_validate_nytw_query_rejects_mutation() -> None:
    with pytest.raises(UnsafeQueryError):
        validate_nytw_query("DROP TABLE nytw_events")


def test_validate_nytw_query_rejects_unrelated_table() -> None:
    with pytest.raises(UnsafeQueryError):
        validate_nytw_query("SELECT * FROM analytics_events")


def test_add_default_limit_only_adds_to_unlimited_selects() -> None:
    assert add_default_limit("SELECT * FROM nytw_events").endswith("LIMIT 100")
    assert add_default_limit("SELECT * FROM nytw_events LIMIT 5").endswith("LIMIT 5")
    assert add_default_limit("SHOW TABLES") == "SHOW TABLES"


def test_clean_model_answer_removes_thinking_tail_marker() -> None:
    answer = clean_model_answer("scratch notes\n</think>\nThere are 10 events.")

    assert answer == "There are 10 events."


def test_looks_like_planning_leak_detects_verbose_process_output() -> None:
    content = (
        "The user is asking for the top events. I need to query ClickHouse "
        "and I should rank them by relevance before I execute the SQL query."
    )

    assert looks_like_planning_leak(content)
    assert not looks_like_planning_leak("There are 1,360 live events.")


def test_requested_event_limit_reads_top_n() -> None:
    assert requested_event_limit("top 3 AI agent orchestration events") == 3
    assert requested_event_limit("best 50 events") == 10
    assert requested_event_limit("AI events") == 5


def test_build_keyword_event_query_is_limited_and_targets_nytw_events() -> None:
    sql = build_keyword_event_query("top 3 AI agent orchestration events")

    assert "FROM nytw_events" in sql
    assert "LIMIT 3" in sql
    assert "orchestration" in sql
    assert "neighborhood ILIKE" in sql
    assert "venue_name ILIKE" in sql


def test_build_keyword_event_query_supports_offset() -> None:
    sql = build_keyword_event_query("list events involving running", offset=5)

    assert "LIMIT 5" in sql
    assert "OFFSET 5" in sql


def test_expanded_keyword_terms_handles_running() -> None:
    terms = expanded_keyword_terms("list events involving running")

    assert "running" in terms
    assert "run" in terms
    assert "5k" in terms


def test_is_more_results_request() -> None:
    assert is_more_results_request("more")
    assert is_more_results_request("show more")
    assert not is_more_results_request("more running events")


def test_likely_nytw_data_question_detects_event_data_requests() -> None:
    assert likely_nytw_data_question("How many NY Tech Week events are in SoHo?")
    assert likely_nytw_data_question("How many events are in SoHo?")
    assert not likely_nytw_data_question("What is our refund policy?")
    assert not likely_nytw_data_question("What is our refund policy for events?")


def test_likely_event_list_question_requires_event_search_intent() -> None:
    assert likely_event_list_question("list events involving running")
    assert likely_event_list_question("top 3 AI events")
    assert likely_event_list_question("events in upper west side?")
    assert not likely_event_list_question("What is our refund policy for events?")


def test_format_event_rows_is_deterministic_and_preserves_url() -> None:
    output = format_event_rows(
        {
            "ok": True,
            "rows": [
                {
                    "title": "Founders Running Club",
                    "event_date": "2026-06-06",
                    "start_time": "9:00am ET",
                    "end_time": "",
                    "neighborhood": "West Village",
                    "venue_name": "",
                    "description_excerpt": "A 5K networking run along the Hudson River.",
                    "rsvp_url": "https://partiful.com/e/example",
                }
            ],
        }
    )

    assert "**Founders Running Club**" in output
    assert "https://partiful.com/e/example" in output


def test_format_event_rows_handles_empty_followup_page() -> None:
    assert format_event_rows({"ok": True, "rows": []}, offset=5) == "No more matching events found."


def test_format_event_rows_adds_more_hint_only_when_extra_row_exists() -> None:
    rows = [
        {
            "title": f"Event {index}",
            "event_date": "2026-06-06",
            "start_time": "9:00am ET",
            "neighborhood": "Upper West Side",
            "description_excerpt": "A focused event.",
            "rsvp_url": f"https://partiful.com/e/{index}",
        }
        for index in range(1, 4)
    ]

    output = format_event_rows(
        {"ok": True, "rows": rows},
        page_size=2,
        more_hint=True,
    )

    assert "Event 1" in output
    assert "Event 2" in output
    assert "Event 3" not in output
    assert "Send `more` for the next page" in output

    output_without_extra = format_event_rows(
        {"ok": True, "rows": rows[:2]},
        page_size=2,
        more_hint=True,
    )

    assert "Send `more` for the next page" not in output_without_extra


class FakeClickHouse:
    def query(self, sql: str) -> list[dict[str, str]]:
        raise AssertionError(f"ClickHouse should not be called for Senso-default questions: {sql}")


class RecordingClickHouse:
    def __init__(self) -> None:
        self.sql: str | None = None

    def query(self, sql: str) -> list[dict[str, str]]:
        self.sql = sql
        return [
            {
                "title": f"Upper West Side Founder Breakfast {index}",
                "event_date": "2026-06-03",
                "start_time": "9:00am ET",
                "end_time": "",
                "neighborhood": "Upper West Side",
                "venue_name": "Cafe",
                "description_excerpt": "Founders and operators meet over breakfast.",
                "rsvp_url": f"https://partiful.com/e/uws-{index}",
            }
            for index in range(1, 7)
        ]


class FakeSenso:
    def __init__(self) -> None:
        self.queries: list[str] = []

    def search(self, query: str) -> dict[str, object]:
        self.queries.append(query)
        return {
            "answer": "Customers can request a full refund within 30 days.",
            "results": [{"title": "Refund Policy", "score": 0.96}],
        }


def test_agent_uses_senso_by_default_for_non_nytw_questions() -> None:
    senso = FakeSenso()
    agent = NytwSubconsciousAgent(
        clickhouse=FakeClickHouse(),  # type: ignore[arg-type]
        subconscious=SubconsciousConfig(api_key="test"),
        senso=senso,  # type: ignore[arg-type]
    )

    answer = agent.ask("What is our refund policy for events?")

    assert senso.queries == ["What is our refund policy for events?"]
    assert "full refund within 30 days" in answer
    assert "Sources: Refund Policy (0.96)" in answer


def test_agent_routes_plain_location_event_question_to_clickhouse() -> None:
    clickhouse = RecordingClickHouse()
    agent = NytwSubconsciousAgent(
        clickhouse=clickhouse,  # type: ignore[arg-type]
        subconscious=SubconsciousConfig(api_key="test"),
    )

    answer = agent.ask("events in upper west side?")

    assert clickhouse.sql is not None
    assert "neighborhood ILIKE" in clickhouse.sql
    assert "LIMIT 6" in clickhouse.sql
    assert "Upper West Side Founder Breakfast 1" in answer
    assert "Upper West Side Founder Breakfast 6" not in answer
    assert "Send `more` for the next page" in answer


def test_agent_from_env_does_not_require_clickhouse_for_senso_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUBCONSCIOUS_API_KEY", "subconscious-test")
    monkeypatch.setenv("SENSO_API_KEY", "senso-test")
    monkeypatch.delenv("CLICKHOUSE_HOST", raising=False)
    monkeypatch.delenv("CLICKHOUSE_PASSWORD", raising=False)
    monkeypatch.delenv("CLICKHOUSE_API_KEY", raising=False)

    agent = NytwSubconsciousAgent.from_env()

    assert agent.clickhouse is None
    assert agent.senso is not None
