import os
import time
import urllib.error
from unittest.mock import patch

from twag_clickhouse.telegram_agent import (
    GREETING_REPLY,
    SUBJECTIVE_QUESTION_REPLY,
    TelegramAgentConfig,
    TelegramApi,
    TelegramTransientError,
    answer_message,
    answer_message_with_status,
    is_subjective_question,
    message_text,
    split_telegram_message,
)


def test_message_text_extracts_chat_id_and_text():
    update = {
        "message": {
            "message_id": 42,
            "chat": {"id": 123},
            "text": "  list AI events  ",
        }
    }

    assert message_text(update) == (123, 42, "list AI events")


def test_message_text_ignores_non_text_updates():
    assert message_text({"message": {"chat": {"id": 123}, "photo": []}}) is None


def test_split_telegram_message_keeps_short_text_intact():
    assert split_telegram_message("hello") == ["hello"]


def test_split_telegram_message_splits_long_text():
    parts = split_telegram_message("a" * 5000)

    assert len(parts) == 2
    assert "".join(parts) == "a" * 5000


def test_answer_message_returns_greeting_for_start():
    class Agent:
        def ask(self, question):
            raise AssertionError("agent should not be called for /start")

    assert answer_message(Agent(), {}, 123, "/start") == GREETING_REPLY
    assert "Production by https://data.flowers/" in GREETING_REPLY


def test_subjective_question_detection():
    assert is_subjective_question("what is the best event?")
    assert is_subjective_question("what should I do tonight?")
    assert not is_subjective_question("which neighborhoods have the most events?")


def test_answer_message_ridicules_subjective_questions_without_agent_call():
    class Agent:
        def ask(self, question):
            raise AssertionError("agent should not be called for subjective questions")

    assert answer_message(Agent(), {}, 123, "best event?") == SUBJECTIVE_QUESTION_REPLY


def test_answer_message_with_status_sends_progress_updates():
    class Agent:
        def __init__(self):
            self.questions = []

        def ask(self, question, **kwargs):
            self.questions.append((question, kwargs))
            return "Here are the events."

    class Telegram:
        def __init__(self):
            self.sent = []
            self.edits = []
            self.actions = []

        def send_message(self, chat_id, text):
            self.sent.append((chat_id, text))
            return [{"result": {"message_id": 99}}]

        def edit_message_text(self, chat_id, message_id, text):
            self.edits.append((chat_id, message_id, text))

        def send_chat_action(self, chat_id, action="typing"):
            self.actions.append((chat_id, action))

    telegram = Telegram()
    agent = Agent()
    states = {}

    answer = answer_message_with_status(
        telegram=telegram,  # type: ignore[arg-type]
        agent=agent,  # type: ignore[arg-type]
        states=states,
        chat_id=123,
        text="events in upper west side?",
    )

    assert answer == "Here are the events."
    assert agent.questions == [("events in upper west side?", {})]
    assert "Route: ClickHouse event search" in telegram.sent[0][1]
    assert any("Running the agent." in edit[2] for edit in telegram.edits)
    assert telegram.edits[-1][2].endswith("Done.")
    assert states[123].active_question is None
    assert states[123].status_message_id is None


def test_answer_message_with_status_skips_progress_for_subjective_questions():
    class Agent:
        def ask(self, question, **kwargs):
            raise AssertionError("agent should not be called")

    class Telegram:
        def send_message(self, chat_id, text):
            raise AssertionError("status should not be sent")

    answer = answer_message_with_status(
        telegram=Telegram(),  # type: ignore[arg-type]
        agent=Agent(),  # type: ignore[arg-type]
        states={},
        chat_id=123,
        text="best event?",
    )

    assert answer == SUBJECTIVE_QUESTION_REPLY


def test_answer_message_with_status_heartbeats_during_slow_work():
    class Agent:
        def ask(self, question, **kwargs):
            time.sleep(0.035)
            return "Done."

    class Telegram:
        def __init__(self):
            self.sent = []
            self.edits = []
            self.actions = []

        def send_message(self, chat_id, text):
            self.sent.append((chat_id, text))
            return [{"result": {"message_id": 100}}]

        def edit_message_text(self, chat_id, message_id, text):
            self.edits.append((chat_id, message_id, text))

        def send_chat_action(self, chat_id, action="typing"):
            self.actions.append((chat_id, action))

    telegram = Telegram()

    answer = answer_message_with_status(
        telegram=telegram,  # type: ignore[arg-type]
        agent=Agent(),  # type: ignore[arg-type]
        states={},
        chat_id=123,
        text="events in upper west side?",
        status_heartbeat_seconds=0.01,
    )

    assert answer == "Done."
    assert any("Still working;" in edit[2] for edit in telegram.edits)
    assert len(telegram.actions) >= 2


def test_telegram_config_reads_retry_settings():
    env = {
        "TELEGRAM_BOT_TOKEN": "token",
        "TELEGRAM_POLL_TIMEOUT": "20",
        "TELEGRAM_REQUEST_TIMEOUT": "35",
        "TELEGRAM_RETRY_INITIAL_SECONDS": "3",
        "TELEGRAM_RETRY_MAX_SECONDS": "30",
        "TELEGRAM_STATUS_HEARTBEAT_SECONDS": "4",
    }

    with patch.dict(os.environ, env, clear=True):
        config = TelegramAgentConfig.from_env()

    assert config.poll_timeout == 20
    assert config.request_timeout == 35
    assert config.retry_initial == 3
    assert config.retry_max == 30
    assert config.status_heartbeat_seconds == 4


def test_telegram_api_timeout_is_transient():
    api = TelegramApi("token", request_timeout=1)

    with patch(
        "urllib.request.urlopen",
        side_effect=urllib.error.URLError(TimeoutError("Operation timed out")),
    ):
        try:
            api.request("getMe")
        except TelegramTransientError as exc:
            assert "timed out" in str(exc)
        else:
            raise AssertionError("expected TelegramTransientError")
