# Event Recommendation Engine

## Goal
Build a content-aware event recommendation engine for the TWAG Boston Tech Week data. The engine takes user preferences (natural language or structured) and returns ranked event recommendations with explanations. Deployed in a separate git branch.

## Research Summary
No internet research needed — the approach is standard: embed event descriptions with OpenAI embeddings, store in FAISS for similarity search, add metadata filtering. The project has an `OPENAI_API_KEY` available. Data is 593 events with rich frontmatter (title, description, venue, neighborhood, host, time, capacity, popularity signals).

## Approach
- **Embedding model**: OpenAI `text-embedding-3-small` (1536-dim, fast, cheap) — we have an OpenAI key
- **Vector storage**: FAISS (local, no infra dependency, fast enough for 593 events)
- **Metadata**: Keep event metadata in a Pandas DataFrame for filtering (neighborhood, date, time, capacity, popularity)
- **Ranking**: Cosine similarity on embeddings + optional metadata filters + optional popularity boost
- **Interface**: CLI (`twag-recommend`) + FastAPI endpoint (`/recommend`) for reuse within the existing tool server pattern
- **Branch**: `feature/event-recommendations`

## Subtasks
1. **Create branch and scaffold** — `git checkout -b feature/event-recommendations`, create `src/twag_clickhouse/recommend.py`
2. **Data loading** — Parse all 593 event markdown files (frontmatter + description body), load venues data, build a clean DataFrame with all metadata fields
3. **Embedding generation** — For each event, generate embeddings from combined `title + description` text via OpenAI API; cache to avoid re-embedding on every run
4. **FAISS index building** — Build a FAISS index from embeddings, wrap in a search class with metadata filtering (neighborhood, date range, max_capacity, popularity threshold)
5. **Recommendation logic** — Given user query text (natural language preferences), embed it, search FAISS, rank by similarity + optional popularity boost, return top-k with explanations
6. **CLI interface** — `twag-recommend` CLI script: accepts a query, optional filters, outputs ranked recommendations
7. **FastAPI endpoint** — Add `/recommend` endpoint to the tool server (or a dedicated one) returning JSON recommendations
8. **Commit and push**

## Deliverables
| File Path | Description |
|-----------|-------------|
| `src/twag_clickhouse/recommend.py` | Core recommendation engine: data loading, embedding, FAISS index, search, ranking |
| `src/twag_clickhouse/recommend_server.py` | Optional: standalone FastAPI server for recommendations |
| `pyproject.toml` (updated) | Add faiss-cpu, openai, pandas dependencies |

## Evaluation Criteria
- Given a natural language query ("AI events in Kendall Square on Tuesday evening"), returns relevant, non-trivial results
- Filters (neighborhood, date, time) correctly narrow results
- Results include explanation of why each event matches
- CLI and API both functional