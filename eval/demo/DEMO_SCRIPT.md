# Pin Police — live demo script (Best Use of Weave)

> Expanded, URL-by-URL stage script. (The 60-second elevator version lives in
> `eval/README.md`.) Total runtime ~4 min. Have the tabs below pre-opened in
> order so you're never typing URLs on stage.

**Project:** https://wandb.ai/natea/stagehopper-pin-police/weave
**Login note:** these are private project pages — make sure the browser is
logged into the `natea` W&B account first.

### Pre-open these tabs (left → right) — all verified live
1. **Traces** — https://wandb.ai/natea/stagehopper-pin-police/weave/traces
2. **Evals** — https://wandb.ai/natea/stagehopper-pin-police/weave/evaluations?view=evaluations_default
3. **Leaderboard (hard)** — https://wandb.ai/natea/stagehopper-pin-police/weave/leaderboards/pin-police-boston-hard
   (the `-hard` one separates the models; `pin-police-boston` is the clean-set tie)
4. A terminal in the repo (for the guardrail), and `eval/demo/bad-pin-copley.png` open in Preview.

### Which run is which (from the Evals/Traces list)
| Run name | Model column | What it is |
|----------|--------------|------------|
| `eval-…-eloquent-tree` (`41ac`) | `shipped_pin:v0` | **geocode-mode** — scores the live pins (the 80% in-bbox / 82.5% nbhd numbers; hallucination = N/A) |
| `eval-…-elegant-bear` (`aec4`) | `extract_then_…claude-haiku` | **clean** set, 10 rows |
| `eval-…-innocent-fish` (`69c2`) | `extract_then_…gpt-4o-mini` | **clean** set, 10 rows |
| `eager-tree` / `tender-rose` | `extract_then_…` | the 6-row warm-up runs |
| (two most-recent runs) | gpt-4o-mini / claude-haiku | **hard** set — the ones that diverge 100% vs 90% |

**Which comparison shows what:**
- `elegant-bear` vs `innocent-fish` (clean) → **tie on accuracy**; the radar
  chart reveals the **latency / token** difference (the efficiency story).
- The two **hard**-set runs → the **accuracy gap** (gpt-4o-mini 100% vs
  claude-haiku 90%). Use these for the "models actually differ" moment.

Reference screenshots of each screen are in `eval/demo/` (`weave-traces.png`,
`weave-evaluations.png`, `weave-leaderboard.png`).

---

## 0 · Hook (20s) — no URL, just say it

> "StageHopper's whole pitch is 'conference sites don't have maps — we make the
> maps.' But every pin is an LLM guessing an address, then a geocoder guessing
> coordinates. Nobody checks the result. So I built **Pin Police**: it grades
> every pin in Weave, and gates the bad ones before they ship."

---

## 1 · The bad pin — lead with the visual (30s)

**Show:** `eval/demo/bad-pin-copley.png` (Preview).

**Point at:**
- The **green pin** downtown = where "4 Copley Place, Back Bay" actually is.
- The **red ✕ pin** ~24 km south near Walpole = where it actually geocoded.

> "Three real Tech Week events list 4 Copley Place. All three landed 24 km south
> of Boston. On the live map, that's three events you'd never find. This is the
> failure Pin Police exists to catch — and it's invisible without evaluation."

---

## 2 · Traces — "every call is observed" (30s)

**Tab 1 → Traces.**

**Point at:**
- The default list shows the top-level runs. To show the *individual* pipeline
  calls, open the **"All Ops"** dropdown (top-left) and pick **`geocode_address`**
  or **`extract_address`** — "every extraction and geocode is a `weave.op`,
  traced automatically."
- Click into one call → show **inputs** (the messy listing / address) and
  **outputs** (lat/lon/confidence), plus latency. (Or click an eval run and
  expand its trace tree to see the child ops.)

> "I didn't rewrite the scraper. I wrapped the real production functions at the
> eval boundary — so the shipped app never even imports Weave, but in eval I get
> full observability for free."

---

## 3 · Evaluation — "quality is now a number" (45s)

**Tab 2 → Evals.** Open the **geocode-mode** run `eval-…-eloquent-tree`
(`shipped_pin:v0`) — the one over the live pins.

**Point at:**
- The scorecard columns: **`in_city_bbox` ≈ 80%**, **`neighborhood_consistency`
  ≈ 82.5%** across the live Boston pins. (These columns are to the right — use
  the **Columns** button or scroll if they're off-screen.)
- Click into the run → its example rows; the out-of-bbox pins (incl. Copley
  Place) are the failures. Click one → the trace shows the bad coordinates.
- **The compare view:** tick two model runs and hit **Compare** (top-left) for
  the side-by-side radar + per-scorer bars.
  - clean runs (`elegant-bear` claude vs `innocent-fish` gpt-4o-mini) → **tie**
    on accuracy; the radar's **Latency / Total Tokens** axes show the efficiency
    gap.
  - the two **hard**-set runs → the **accuracy gap** (100% vs 90%) — the
    stronger "models differ" moment.

> "Five domain scorers, not generic ones: haversine distance vs ground truth,
> in-city bounding box, neighborhood agreement, an LLM-judge for hallucinated
> addresses, and a confidence-calibration check. 'Is the map correct?' went from
> a shrug to 80%."

**Key line:** "And these scorers need no ground truth — `in_city_bbox` and
`neighborhood` catch bad pins intrinsically, so I'm not grading the geocoder
against its own output."

---

## 4 · Guardrail — "measure, then gatekeep" (40s)

**Tab → Terminal.** Run live:

```bash
twag --city boston build-geojson --guard
```

**Point at the counts in the output:** `"flagged": 7` out of `"mapped": 441`.

> "Same checks as the eval — one source of truth — but here they run at export
> time with zero dependencies: no Weave, no API keys, no network. So the map
> build in CI can drop or flag bad pins. Measurement that actually changes what
> ships."

(Optional: `--guard-action drop` to show them removed entirely.)

---

## 5 · Leaderboard — "drives a real decision" (45s)

**Tab 3 → Leaderboard `pin-police-boston-hard`.**

**Point at (this is the version that separates the models):**
- `extract_then_geocode-gpt-4o-mini` = **100%** (green) vs
  `…-claude-haiku-4-5-20251001` = **90%** (amber) on
  `score_geocode_distance → pin_ok.true_fraction`, over the *hard* address set
  (`techweek-pins-truth-boston-hard:v0`, the low-confidence rows).
- The story in one breath: **"On hard addresses gpt-4o-mini pinned 100% within
  300 m; claude-haiku missed one — it landed 330 m off. Claude was a touch
  faster (1.56 s vs 1.79 s). That's the accuracy-vs-latency tradeoff, and Weave
  ranked it for me."** (latency numbers are in each model's eval summary.)
- Mention: `llama3.1` was configured but **skipped-and-reported** (no local
  endpoint) — no silent truncation.
- (The plain `pin-police-boston` leaderboard is the *clean* set where both tie
  at 100% — good to show that easy addresses aren't the discriminator.)

> "Adding a model is one line — it's a `weave.Model`. I run the same dataset
> through each and Weave ranks them. On easy addresses they tie; on the hard
> set, gpt-4o-mini wins on accuracy. That's how you choose a model with data,
> not vibes."

**How it was generated** (if asked): `uv run python -m eval.run --city boston
--mode models --difficulty hard --limit 10`. The `--difficulty hard` flag pulls
the confidence 1–9 rows — the ambiguous addresses where extraction phrasing
actually changes the pin.

---

## 6 · Close — why this is the *best* use of Weave (20s)

> "This isn't a demo bolted onto Weave. It's a real product problem — wrong pins
> make the map useless — and Weave does the whole loop: **trace** the pipeline,
> **evaluate** it with domain scorers, **compare** models on a leaderboard, and
> feed that straight into a **guardrail** that gates production. Observe → score
> → decide → enforce. That's Pin Police."

---

## Backup facts for Q&A

- **Dataset:** silver labels seeded from OpenCage `confidence == 10` rows; ~12
  hand-gold anchors in `eval/gold/boston.json`. (Tab 4 → Dataset.)
- **No circular ground truth:** geocode-mode uses ground-truth-free scorers;
  models-mode grades a *fresh* model address against the cached high-confidence
  coordinate.
- **Cost control:** OpenCage cache reused; eval runs on a small sample; LLM judge
  is temperature 0, 2 tokens.
- **Why silver rows score ~100% in models-mode:** they're clean by construction;
  the discriminating signal is in geocode-mode (8 bad pins) and the guardrail.
- **Spec-driven:** the whole feature was authored with OpenSpec
  (`openspec/changes/add-pinpolice-weave-eval/`) before a line of code.
- **Direct trace links captured during the run:**
  - geocode-mode eval run: https://wandb.ai/natea/stagehopper-pin-police/r/call/019e800c-2b39-7f86-b38b-c058807041ac
  - models-mode runs: …/r/call/019e8019-f899-7509-bd6b-9662b829995f · …/r/call/019e801a-025c-7b94-bd1f-a0ee31b1f55b
