"""
TWAG event recommendation engine.

Provides semantic search over event datasets using OpenAI embeddings
and FAISS vector similarity.  Designed to work with local dataset files
(e.g. data/nytw-2026-for-agents/events/*.md) without requiring ClickHouse.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .city import active_city
from .nytw import NytwDataset, extract_description, parse_frontmatter

# ---------------------------------------------------------------------------
# Optional dependency guards
# ---------------------------------------------------------------------------

try:
    import faiss
except ImportError:  # pragma: no cover
    faiss = None  # type: ignore[assignment]

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSION = 1536  # text-embedding-3-small produces 1536-D

DEFAULT_TOP_K = 10

# Fields to include in the embedding text (combined into one string)
EMBEDDING_FIELDS = ("title", "description", "host", "neighborhood", "venue_name")


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class EventRecord:
    """A single event with enough context for recommendation."""

    event_id: str
    title: str
    description: str
    host: str
    neighborhood: str
    venue_name: str
    venue_address: str
    day: str
    start_time: str
    badges: list[str]
    image: str
    rsvp_url: str

    def to_text(self) -> str:
        """Combine key fields into a single string for embedding."""
        parts = [
            self.title or "",
            self.description or "",
            self.host or "",
            self.neighborhood or "",
            self.venue_name or "",
        ]
        return " | ".join(parts)

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "title": self.title,
            "host": self.host,
            "neighborhood": self.neighborhood,
            "venue_name": self.venue_name,
            "venue_address": self.venue_address,
            "day": self.day,
            "start_time": self.start_time,
            "badges": self.badges,
            "image": self.image,
            "rsvp_url": self.rsvp_url,
            "description": self.description,
        }


@dataclass
class Recommendation:
    """A single recommendation result."""

    event: EventRecord
    score: float

    def to_dict(self) -> dict[str, Any]:
        return {"event": self.event.to_dict(), "score": round(float(self.score), 4)}

    def explanation(self) -> str:
        """Human-readable explanation of why this event was recommended."""
        event = self.event
        parts = [
            f"Title: {event.title}",
            f"Score: {self.score:.4f}",
            f"Host: {event.host}",
            f"Location: {event.neighborhood} — {event.venue_name}",
            f"Time: {event.day} at {event.start_time}",
        ]
        if event.badges:
            parts.append(f"Badges: {', '.join(event.badges)}")
        if event.description:
            # Show a short preview
            desc_short = event.description[:200]
            if len(event.description) > 200:
                desc_short += "…"
            parts.append(f"Description: {desc_short}")
        return "\n".join(parts)


# ---------------------------------------------------------------------------
# EventDataLoader
# ---------------------------------------------------------------------------


class EventDataLoader:
    """Load event records from local NYTW/BostonTW dataset Markdown files."""

    def __init__(self, dataset_path: str | Path | None = None) -> None:
        if dataset_path is None:
            dataset_path = active_city().dataset_path
        self._dataset = NytwDataset.from_path(str(dataset_path))
        self._dataset.validate()

    @property
    def dataset(self) -> NytwDataset:
        return self._dataset

    @property
    def source_dir(self) -> Path:
        return self._dataset.source_dir

    @property
    def events_dir(self) -> Path:
        return self._dataset.events_dir

    @property
    def event_count(self) -> int:
        """Quick count of event files without parsing every one."""
        return len(list(self.events_dir.glob("*.md")))

    def load_events(self) -> list[EventRecord]:
        """Parse every event Markdown file and return EventRecord objects."""
        records: list[EventRecord] = []
        for path in sorted(self.events_dir.glob("*.md")):
            try:
                raw = path.read_text(encoding="utf-8")
            except Exception:
                continue

            # Extract frontmatter
            frontmatter: dict[str, Any] = {}
            body = ""
            if raw.startswith("---"):
                parts = raw.split("---", 2)
                if len(parts) >= 3:
                    frontmatter = parse_frontmatter(parts[1].strip())
                    body = parts[2].strip()

            event_id = str(frontmatter.get("event_id") or path.stem)

            # Build record
            record = EventRecord(
                event_id=event_id,
                title=str(frontmatter.get("title") or ""),
                description=extract_description(body) or str(frontmatter.get("description") or ""),
                host=str(frontmatter.get("host") or ""),
                neighborhood=str(frontmatter.get("neighborhood") or ""),
                venue_name=str(frontmatter.get("venue_name") or ""),
                venue_address=str(frontmatter.get("venue_address") or ""),
                day=str(frontmatter.get("day") or ""),
                start_time=str(frontmatter.get("start_time") or ""),
                badges=list(frontmatter.get("badges") or []),
                image=str(frontmatter.get("image") or ""),
                rsvp_url=str(frontmatter.get("rsvp_url") or ""),
            )
            records.append(record)

        return records

    def load_events_as_dataframe(self) -> pd.DataFrame:
        """Load events and return as a pandas DataFrame."""
        records = self.load_events()
        return pd.DataFrame([r.to_dict() for r in records])


# ---------------------------------------------------------------------------
# EmbeddingGenerator
# ---------------------------------------------------------------------------


class EmbeddingGenerator:
    """Generate vector embeddings for event text using OpenAI's API."""

    def __init__(self, api_key: str | None = None, model: str = EMBEDDING_MODEL) -> None:
        if OpenAI is None:
            raise ImportError(
                "The `openai` package is required. Install it with: pip install openai"
            )
        self._api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self._api_key:
            raise ValueError(
                "OPENAI_API_KEY is required. Set it as an environment variable "
                "or pass it to the constructor."
            )
        self._client = OpenAI(api_key=self._api_key)
        self._model = model

    @property
    def model(self) -> str:
        return self._model

    def embed_text(self, text: str) -> list[float]:
        """Embed a single text string."""
        response = self._client.embeddings.create(
            model=self._model,
            input=text,
        )
        return response.data[0].embedding

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of text strings in a single API call."""
        response = self._client.embeddings.create(
            model=self._model,
            input=texts,
        )
        # Response order matches input order
        by_index = {item.index: item.embedding for item in response.data}
        return [by_index[i] for i in range(len(texts))]

    def embed_events(self, events: list[EventRecord]) -> list[list[float]]:
        """Embed all event records, splitting into sub-batches to stay under
        OpenAI's per-request token limit (~300K tokens for text-embedding-3-small).

        Results are stitched back together in the original order.
        """
        texts = [event.to_text() for event in events]

        # Estimate tokens conservatively (~4 chars per token) and batch so
        # each sub-batch stays well under 300K tokens.
        MAX_CHARS_PER_BATCH = 800_000  # ≈ 200K tokens, safe margin below 300K limit
        all_embeddings: list[list[float]] = []
        batch_start = 0

        while batch_start < len(texts):
            # Greedily fill this sub-batch
            char_count = 0
            batch_end = batch_start
            while batch_end < len(texts):
                next_len = len(texts[batch_end]) + 1  # +1 for " | " separator
                if char_count + next_len > MAX_CHARS_PER_BATCH:
                    break
                char_count += next_len
                batch_end += 1

            sub_texts = texts[batch_start:batch_end]
            batch_embeddings = self.embed_batch(sub_texts)
            all_embeddings.extend(batch_embeddings)
            batch_start = batch_end

        return all_embeddings


# ---------------------------------------------------------------------------
# FAISSIndexBuilder
# ---------------------------------------------------------------------------


@dataclass
class SavedIndex:
    """Represents a saved index directory on disk."""

    path: Path

    def index_path(self) -> Path:
        return self.path / "events.faiss"

    def meta_path(self) -> Path:
        return self.path / "events_meta.json"

    def exists(self) -> bool:
        return self.index_path().is_file() and self.meta_path().is_file()


class FAISSIndexBuilder:
    """Build, save, load, and search a FAISS vector index over event embeddings.

    Uses inner-product (IP) search which, on unit-normalized vectors, is
    equivalent to cosine similarity.
    """

    def __init__(self, dimension: int = EMBEDDING_DIMENSION) -> None:
        if faiss is None:
            raise ImportError(
                "The `faiss` package is required. Install it with: pip install faiss-cpu"
            )
        self._dimension = dimension
        self._index: Any = None
        self._events: list[EventRecord] = []

    @property
    def index(self) -> Any:
        return self._index

    @property
    def events(self) -> list[EventRecord]:
        return self._events

    @property
    def is_built(self) -> bool:
        return self._index is not None

    def build(self, events: list[EventRecord], embeddings: list[list[float]]) -> None:
        """Build a FAISS index from event records and their embeddings.

        Vectors are L2-normalised so that inner-product search = cosine similarity.
        """
        self._events = list(events)
        vectors = np.array(embeddings, dtype=np.float32)
        # Normalise for cosine similarity
        faiss.normalize_L2(vectors)

        self._index = faiss.IndexFlatIP(self._dimension)
        self._index.add(vectors)

    def save(self, directory: str | Path) -> SavedIndex:
        """Persist the index and event metadata to a directory."""
        if not self.is_built:
            raise RuntimeError("Index has not been built. Call build() first.")

        path = Path(directory)
        path.mkdir(parents=True, exist_ok=True)

        index_path = path / "events.faiss"
        meta_path = path / "events_meta.json"

        faiss.write_index(self._index, str(index_path))
        meta_path.write_text(
            json.dumps(
                [event.to_dict() for event in self._events],
                indent=2,
                default=str,
            ),
            encoding="utf-8",
        )
        return SavedIndex(path)

    @classmethod
    def load(cls, directory: str | Path) -> "FAISSIndexBuilder":
        """Load a previously saved index and its event metadata."""
        if faiss is None:
            raise ImportError(
                "The `faiss` package is required. Install it with: pip install faiss-cpu"
            )

        path = Path(directory)
        index_path = path / "events.faiss"
        meta_path = path / "events_meta.json"

        if not index_path.is_file():
            raise FileNotFoundError(f"FAISS index not found: {index_path}")
        if not meta_path.is_file():
            raise FileNotFoundError(f"Event metadata not found: {meta_path}")

        idx = faiss.read_index(str(index_path))
        dim = idx.d  # FAISS index stores the dimension directly
        builder = cls(dimension=dim)
        builder._index = idx
        builder._events = [
            EventRecord(**data) for data in json.loads(meta_path.read_text(encoding="utf-8"))
        ]
        return builder

    def search(self, query_vector: list[float], top_k: int = DEFAULT_TOP_K) -> list[Recommendation]:
        """Search the index for the nearest neighbours to *query_vector*."""
        if not self.is_built:
            raise RuntimeError("Index has not been built. Call build() first.")

        query = np.array([query_vector], dtype=np.float32)
        faiss.normalize_L2(query)

        scores_arr, indices_arr = self._index.search(query, top_k)

        results: list[Recommendation] = []
        for score, idx in zip(scores_arr[0], indices_arr[0]):
            if idx < 0 or idx >= len(self._events):
                continue
            if score <= 0:
                continue
            results.append(
                Recommendation(event=self._events[int(idx)], score=float(score))
            )
        return results


# ---------------------------------------------------------------------------
# EventRecommender  (orchestrator)
# ---------------------------------------------------------------------------


@dataclass
class RecommenderConfig:
    """Configuration for the event recommender pipeline."""

    dataset_path: str | None = None
    embedding_model: str = EMBEDDING_MODEL
    api_key: str | None = None
    index_dir: str | None = None
    top_k: int = DEFAULT_TOP_K


class EventRecommender:
    """Orchestrates the end-to-end recommendation flow.

    Typical usage::

        recommender = EventRecommender()
        results = recommender.recommend("AI and machine learning events in Kendall Square")
        for r in results:
            print(r.explanation())
    """

    def __init__(self, config: RecommenderConfig | None = None) -> None:
        self._config = config or RecommenderConfig()
        self._loader: EventDataLoader | None = None
        self._embedder: EmbeddingGenerator | None = None
        self._index_builder: FAISSIndexBuilder | None = None

    @property
    def config(self) -> RecommenderConfig:
        return self._config

    def _get_loader(self) -> EventDataLoader:
        if self._loader is None:
            self._loader = EventDataLoader(dataset_path=self._config.dataset_path)
        return self._loader

    def _get_embedder(self) -> EmbeddingGenerator:
        if self._embedder is None:
            self._embedder = EmbeddingGenerator(
                api_key=self._config.api_key,
                model=self._config.embedding_model,
            )
        return self._embedder

    def _ensure_index(self) -> FAISSIndexBuilder:
        """Return a cached index builder, building one lazily if needed.

        If *index_dir* is configured and the index already exists on disk it
        will be loaded from there; otherwise events are parsed, embedded, and
        indexed from scratch.
        """
        if self._index_builder is not None:
            return self._index_builder

        index_dir = self._config.index_dir

        # Try to load a pre-built index
        if index_dir:
            saved = SavedIndex(Path(index_dir))
            if saved.exists():
                self._index_builder = FAISSIndexBuilder.load(index_dir)
                return self._index_builder

        # Build from scratch
        print(f"Loading events from {self._get_loader().source_dir} …", file=sys.stderr)
        events = self._get_loader().load_events()
        print(f"  Found {len(events)} events", file=sys.stderr)

        print(f"Generating embeddings ({self._config.embedding_model}) …", file=sys.stderr)
        embedder = self._get_embedder()
        embeddings = embedder.embed_events(events)

        print("Building FAISS index …", file=sys.stderr)
        builder = FAISSIndexBuilder()
        builder.build(events, embeddings)
        self._index_builder = builder

        # Persist for future use
        if index_dir:
            saved = builder.save(index_dir)
            print(f"Index saved to {saved.path}", file=sys.stderr)

        return self._index_builder

    def recommend(
        self,
        query: str,
        top_k: int | None = None,
    ) -> list[Recommendation]:
        """Return the top-k events most similar to *query*."""
        k = top_k or self._config.top_k
        builder = self._ensure_index()
        embedder = self._get_embedder()
        query_vector = embedder.embed_text(query)
        return builder.search(query_vector, top_k=k)


# ---------------------------------------------------------------------------
# DB-based loader (optional — queries ClickHouse if available)
# ---------------------------------------------------------------------------


class DbEventLoader:
    """Load event records directly from a ClickHouse *nytw_events*-like table.

    Falls back to the file-based *EventDataLoader* if no ClickHouse connection
    is configured.
    """

    def __init__(
        self,
        service: Any | None = None,
        table_prefix: str | None = None,
    ) -> None:
        self._service = service
        self._prefix = table_prefix
        if self._prefix is None:
            self._prefix = active_city().table_prefix

    def load_events(self) -> list[EventRecord]:
        if self._service is None:
            return EventDataLoader().load_events()

        rows = self._service.query(
            f"SELECT event_id, title, description, host, neighborhood, "
            f"venue_name, venue_address, day, start_time, badges, image, "
            f"rsvp_url FROM {self._prefix}_events WHERE canceled = 0"
        )
        records = []
        for row in rows:
            records.append(
                EventRecord(
                    event_id=str(row.get("event_id", "")),
                    title=str(row.get("title", "")),
                    description=str(row.get("description", "")),
                    host=str(row.get("host", "")),
                    neighborhood=str(row.get("neighborhood", "")),
                    venue_name=str(row.get("venue_name", "")),
                    venue_address=str(row.get("venue_address", "")),
                    day=str(row.get("day", "")),
                    start_time=str(row.get("start_time", "")),
                    badges=list(row.get("badges") or []),
                    image=str(row.get("image", "")),
                    rsvp_url=str(row.get("rsvp_url", "")),
                )
            )
        return records


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    """CLI entry point for ``twag-recommend``."""
    # Lazy imports to avoid slow startup when not running recommend
    try:
        from dotenv import load_dotenv
    except ImportError:
        load_dotenv = None  # type: ignore[assignment]

    if load_dotenv:
        load_dotenv(".env", override=False)

    import argparse

    parser = argparse.ArgumentParser(
        prog="twag-recommend",
        description="Semantic event recommendation using embeddings + FAISS.",
    )
    parser.add_argument(
        "query",
        nargs="?",
        default="",
        help="Natural-language query describing the kind of event you want.",
    )
    parser.add_argument(
        "--dataset",
        default=None,
        help="Path to the dataset directory (defaults to the active city's dataset).",
    )
    parser.add_argument(
        "--index-dir",
        default=None,
        help="Directory to store/load the FAISS index (default: system temp dir).",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=DEFAULT_TOP_K,
        help=f"Number of results to return (default: {DEFAULT_TOP_K}).",
    )
    parser.add_argument(
        "--city",
        default=None,
        help="Override TWAG_CITY (e.g. nyc, boston).",
    )
    parser.add_argument(
        "--api-key",
        default=None,
        help="OpenAI API key (defaults to OPENAI_API_KEY env var).",
    )
    parser.add_argument(
        "--interactive", "-i",
        action="store_true",
        help="Start an interactive recommendation session.",
    )

    args = parser.parse_args(argv)

    # Resolve city override
    if args.city:
        from .city import load_city

        load_city(args.city)
        os.environ["TWAG_CITY"] = args.city.strip().lower()

    # Resolve index directory
    index_dir = args.index_dir
    if index_dir is None:
        index_dir = os.path.join(
            tempfile.gettempdir(), "twag_event_index"
        )

    config = RecommenderConfig(
        dataset_path=args.dataset,
        api_key=args.api_key,
        index_dir=index_dir,
        top_k=args.top_k,
    )

    recommender = EventRecommender(config)

    if args.interactive:
        print("TWAG event recommender. Type your query or 'exit'.")
        while True:
            try:
                q = input("> ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                return 0
            if not q or q.lower() in {"exit", "quit", "q"}:
                return 0
            results = recommender.recommend(q)
            _print_recommendations(results)
        return 0

    if not args.query:
        parser.print_help()
        return 1

    results = recommender.recommend(args.query)
    _print_recommendations(results)
    return 0


def _print_recommendations(results: list[Recommendation]) -> None:
    """Print recommendations in a friendly format."""
    if not results:
        print("No matching events found. Try a different query.")
        return

    print(f"\nFound {len(results)} event(s):\n")
    for i, rec in enumerate(results, start=1):
        print(f"{'=' * 72}")
        print(f"  #{i}  (score: {rec.score:.4f})")
        print(f"{'=' * 72}")
        print(rec.explanation())
        print()


if __name__ == "__main__":
    raise SystemExit(main())