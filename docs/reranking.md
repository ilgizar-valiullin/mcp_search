# Reranking

## Overview

After receiving results from providers, results are deduplicated by URL and then scored.
The primary signal is **NLI entailment** — the same DeBERTa-v3-xsmall model used for
intent classification and freshness detection.

## Scoring Formula

```
final_score = 0.9 * nli_entailment(query, snippet)
            + 0.04 * domain_quality
            + 0.03 * implicit_freshness
            + 0.03 * position_score
```

The weights are fixed — a single formula for all queries.

## Components

### 1. NLI Entailment (weight 0.9)

```
nli_entailment = softmax(NLI(snippet, query)) → entailment probability
```

- **Model**: `Xenova/nli-deberta-v3-xsmall` (177M params)
- **Text**: `snippet || title` (512 chars max)
- **Fallback**: 0.5 if model unavailable or empty text
- **Load**: ~10–15ms per result, ~300ms for 20 results

The same model instance is shared with intent classification and freshness
detection — lazy-loaded on first request.

### 2. Domain Quality (weight 0.04)

| Domain | Score |
|--------|-------|
| `github.com` | 0.95 |
| `developer.mozilla.org` | 0.95 |
| `docs.*` | 0.85 |
| `stackoverflow.com` | 0.80 |
| `medium.com` | 0.55 |

Unknown domains default to 0.50.

### 3. Implicit Freshness (weight 0.03)

Not a separate classification per result. Instead, the query itself is analyzed
once via NLI to determine if the user needs recent information.

#### Freshness Detection

A single NLI zero-shot inference on the query with the hypothesis:

> *"The user request implies a need for recent information, updates, latest versions, or news."*

If the entailment score exceeds 0.45, `requiresFreshness` is set to `true`.

#### Freshness Score per Result

The score is computed from `published_date` (if available in provider metadata)
and the `requiresFreshness` flag:

| Condition | `requiresFreshness=true` | `requiresFreshness=false` |
|---|---|---|
| No `published_date` | **1.0** | **1.0** |
| ≤ 1 month old | 1.0 | 1.0 |
| ≤ 1 year old | 0.4 | 1.0 |
| ≤ 3 years old | 0.0 | 1.0 |
| ≤ 5 years old | 0.0 | 0.6 |
| older | 0.0 | 0.1 |

When `requiresFreshness=false` (muted mode), recent content up to 3 years
receives no penalty — protecting fundamental knowledge (algorithms, API refs,
SQL). Only content older than 5 years is penalized.

When `requiresFreshness=true`, content older than ~1 month is aggressively
down-weighted — suitable for news, release announcements, and migration guides.

Missing `published_date` is treated as neutral (1.0) to avoid penalizing
results whose metadata simply lacks a timestamp.

### 4. Position (weight 0.03)

Linear: position 1 → ~0.91, last position → ~0.1.

## Deduplication

Before scoring, results are deduplicated by normalized URL (remove `www.`,
trailing slash, `utm_*` params, hash). The best (lowest) position is kept.

## Intent Classification

Query intent (`github` / `docs` / `news` / `web`) is classified separately
by the same NLI model, using 4 candidate labels with softmax and a 0.45
confidence threshold. Intent determines:
- Which search providers to use
- Cache TTL (news: 30min, docs: 3h, web: 6h, github: 4h)
- Language metadata for github intent (e.g., `rust` from query)

The intent classifier runs once per query; the reranker runs one NLI inference
per unique result.

## Pipeline Summary

```
query ──→ NLI(4 intent labels) ──→ intent (provider routing)
       │
       └──→ NLI(1 freshness hypothesis) ──→ requiresFreshness (boolean)

results ──→ dedup ──→ NLI(query, snippet*) ──→ rerank(requiresFreshness)
                                                       │
                                         0.9*nli + 0.04*domain
                                       + 0.03*freshness + 0.03*position
```
