# Parameterize TWAG for Any Tech Week City (add Boston)

## Context

This repo is hardcoded to NY Tech Week 2026: the dataset path, ClickHouse table prefix (`nytw_*`), system prompt, agent tool name (`query_nytw_clickhouse`), Telegram copy ("NYC, not a vibes committee"), and dates (June 1–7) all assume NYC. We want a Boston Tech Week build (https://www.tech-week.com/calendar/boston) without losing NYC. Cities will live side-by-side: separate dataset directories, separate ClickHouse tables with per-city prefixes, one running bot/agent process per city.

Decisions already made:
- **Table strategy**: per-city prefix. NYC keeps `nytw_*`; Boston gets `bostw_*`. No schema migration of existing tables.
- **NYC fate**: keep both. Boston is added in parallel.
- **Env vars / console scripts**: keep `NYTW_TOOL_*` names and `twag-nytw-tool-server` / `deploy-nytw-agent` as-is (legacy identifiers; renaming would break the running Nimble deployment).
- **Branch**: work on `natea/boston`.

## Approach

Introduce a single source of truth — a `CityConfig` dataclass — that bundles everything currently hardcoded for one city: dataset path, table prefix, calendar URL, agent name, tool name, brand copy, date window, and neighborhood/voice flavor. Load it from an env var (`TWAG_CITY`, default `nyc`) with a registry of known cities. Every NYC-specific reference in code becomes a lookup against the active `CityConfig`.

The table prefix in particular is threaded through SQL builders, the system prompt template, and the deploy tool name. Two registered cities ship: `nyc` (NYTW) and `boston` (BOSTW).

## Branch

Create and check out `natea/boston` off `main` before any edits.

## Critical files & changes

### 1. New: `src/twag_clickhouse/city.py`

`CityConfig` dataclass + `CITIES` registry + `load_city()` resolver.

Fields:
- `slug` (`"nyc"`, `"boston"`), `display_name` (`"NY Tech Week 2026"`, `"Boston Tech Week 2026"`)
- `calendar_url` (the tech-week.com URL)
- `table_prefix` (`"nytw"`, `"bostw"`)
- `dataset_path` (`"data/nytw-2026-for-agents"`, `"data/bostontw-2026-for-agents"`)
- `agent_name` (`"NYTechWeek ClickHouse Agent"`, `"BostonTechWeek ClickHouse Agent"`)
- `tool_name` (`"query_nytw_clickhouse"`, `"query_bostw_clickhouse"`)
- `event_date_range` (start/end ISO dates — for prompt hints and test fixtures)
- `vibe_line` (the punchy refusal one-liner; NYC keeps "C'mon, this is NYC, not a vibes committee." — Boston gets a Boston-flavored equivalent, TBD by user)
- `example_neighborhood` (`"SoHo"`, `"Back Bay"`) for the example query in subjective-prompt replies

Resolver reads `TWAG_CITY` env var, defaults to `nyc`. Raises a clear error on unknown city. Exports `active_city()` for module-level access.

### 2. `src/twag_clickhouse/nytw.py` → rename module to `dataset.py`, generalize

- Rename `NytwDataset` → `TechWeekDataset` (keep `NytwDataset = TechWeekDataset` alias at bottom for tests/back-compat).
- Replace hardcoded `nytw_events` / `nytw_hosts` / `nytw_event_hosts` / `nytw_manifest` strings in `create_nytw_tables`, `truncate_nytw_tables`, `drop_nytw_tables`, `load_nytw_dataset`, and the `insert_all` call sites with f-strings using `city.table_prefix` (e.g. `f"{prefix}_events"`).
- Functions accept a `CityConfig` parameter (or default to `active_city()`). Rename to city-neutral names (`create_tables`, `load_dataset`, etc.); keep `*_nytw_*` wrappers as thin shims so `cli.py` and tests don't have to all change at once.

### 3. `src/twag_clickhouse/subconscious_agent.py`

Convert `NYTW_AGENT_SYSTEM_PROMPT` from a module-level string constant into a function `build_system_prompt(city: CityConfig) -> str` that returns the prompt with `{display_name}`, `{table_prefix}`, `{tool_name}`, and `{event_date_range}` substituted in. Every occurrence of `nytw_events` / `nytw_hosts` / etc. in the prompt becomes `{prefix}_events` / `{prefix}_hosts`.

`NytwSubconsciousAgent.from_env()` resolves the active city and threads it through. Keep class name as alias.

### 4. `src/twag_clickhouse/subconscious_deploy.py`

- Tool name (`query_nytw_clickhouse`) → `city.tool_name`.
- Tool description references "NYTechWeek" → `city.display_name`.
- `instructions` uses `build_system_prompt(city)` instead of the constant.
- The string `"nytw_* or synced senso_*"` in the SQL param description becomes `f"{city.table_prefix}_* or synced senso_*"`.

### 5. `src/twag_clickhouse/telegram_agent.py`

Replace inline NYC strings:
- Line 56 vibe line → `city.vibe_line`
- Line 66 greeting `"**TWAG NY Tech Week Bot**"` → `f"**TWAG {city.display_name} Bot**"`
- Example query `"List AI events in SoHo on June 3"` → built from `city.example_neighborhood` + `city.event_date_range`
- Log/debug strings mentioning "NYTW event rows" / "NYTW search pipeline" → use `city.table_prefix.upper()` (and update the test assertion in `tests/test_telegram_agent.py:182` accordingly)

### 6. `src/twag_clickhouse/cli.py`

- `--source` default on `inspect-nytw` and `load-nytw` (lines 228, 239) → `city.dataset_path` (resolved at parse time via `active_city()`).
- Keep subcommand names (`inspect-nytw`, `load-nytw`, `ask-nytw-agent`, `deploy-nytw-agent`) — they're public surface; behavior changes based on `TWAG_CITY`.
- Optionally add `--city` flag on each subcommand that overrides `TWAG_CITY` for that invocation. Useful for running NYC and Boston pipelines from the same shell.

### 7. `data/bostontw-2026-for-agents/scripts/crawl_manifest.py` (new dataset dir)

Copy `data/nytw-2026-for-agents/scripts/crawl_manifest.py` into a new Boston dataset dir, change `CALENDAR_URL` to `https://www.tech-week.com/calendar/boston`. Run it to produce `manifest.json` + per-event markdown for Boston. (Crawler is structurally city-agnostic — same React-table virtualization on tech-week.com.)

Alternative: parameterize the existing crawl script to take `--city` and write to a per-city output dir. Defer this — the crawl scripts are dataset-internal tooling, not part of the runtime code path, and a two-copy duplication is cheaper than refactoring the Playwright script right now.

### 8. `.env.example`

Add `TWAG_CITY=nyc` (with a comment listing valid values). Leave `NYTW_TOOL_*` vars unchanged.

### 9. `deploy/ubuntu/run-nimble.sh`

No change required (still calls `twag-nytw-tool-server`). For a Boston deployment, the operator sets `TWAG_CITY=boston` in the environment for that process. Document this in README.

### 10. `tests/test_nytw.py`, `tests/test_telegram_agent.py`

- `test_nytw.py`: parameterize the dataset path and event-fixture filenames over the active city, OR keep the test pinned to NYC (`TWAG_CITY=nyc` in the test fixture). Recommend the latter — these are dataset-shape regression tests, NYC is the reference. Add one new smoke test that confirms `CityConfig` resolution works for `boston`.
- `test_telegram_agent.py:182`: update the "NYTW search pipeline" assertion to be city-derived, or split into two tests.

### 11. `README.md`

- Top-of-file rename: "TWAG NY Tech Week Bot" → "TWAG Tech Week Bot (NY + Boston)".
- New "Cities" section explaining `TWAG_CITY` env var, the per-city table prefixes, and which dataset dir corresponds to which city.
- Update example SQL snippets to show both `nytw_*` and `bostw_*`.
- Note that deploying a Boston bot is "same install, set `TWAG_CITY=boston`, point at the Boston dataset dir, run `load-nytw`."

## Reused existing code (don't reinvent)

- `NytwDataset.from_path` already takes an arbitrary source dir — only its default and class name need updating; the loader is already path-parameterized.
- `insert_all`, `create_table_sql` helpers in `nytw.py` already accept table-name strings as arguments — they just need to be called with prefix-built names instead of literals.
- `ClickHouseService` (in `client.py`) is already city-agnostic.
- The Senso integration (`senso.py`) is already city-agnostic — no changes needed.

## Open question for the user (not blocking the plan, confirm before implementing)

- The Boston `vibe_line` and `example_neighborhood`. NYC's is "C'mon, this is NYC, not a vibes committee." with "SoHo on June 3." Boston equivalent suggestion: "This is Boston — give me wicked specifics." with "Back Bay on [Boston Tech Week date]." Confirm copy + Boston Tech Week dates before implementing.

## Verification

1. **Unit / fast checks**
   - `pytest tests/` with `TWAG_CITY=nyc` — existing NYC tests pass unchanged.
   - New test: `TWAG_CITY=boston` resolves to `bostw` prefix and `data/bostontw-2026-for-agents` dataset path.

2. **Crawl Boston**
   - Run the copied crawler against `tech-week.com/calendar/boston`; confirm it produces a non-empty `manifest.json` and per-event markdown files. Spot-check counts against the live page's "matching events" counter.

3. **Load Boston into ClickHouse**
   - `TWAG_CITY=boston twag inspect-nytw` (or with `--city boston`) — dataset shape printout.
   - `TWAG_CITY=boston twag load-nytw` — creates `bostw_events` etc., loads rows. Verify `SELECT count() FROM bostw_events` matches manifest count.
   - Confirm `nytw_*` tables in ClickHouse are untouched.

4. **Agent smoke test**
   - `TWAG_CITY=boston twag ask-nytw-agent "List AI events in Back Bay"` — agent issues SQL against `bostw_events` (not `nytw_events`). Inspect the tool-call payload to confirm.
   - Repeat with `TWAG_CITY=nyc` and a SoHo query to confirm NYC path still works.

5. **Telegram bot**
   - Run `twag-telegram-agent` locally with `TWAG_CITY=boston`; `/start` should greet as Boston Tech Week, vibe line should be the Boston one, example query should mention Back Bay. Send a real query and verify rows come from `bostw_*`.

6. **Deployment dry run**
   - Confirm `deploy-nytw-agent` registers the Boston-prefixed tool name on the subconscious platform when `TWAG_CITY=boston`. Don't push to production until smoke tests pass.
