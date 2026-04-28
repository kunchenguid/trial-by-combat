# EXPERIMENT_NEW_MAP

## Purpose

You are an agent running a single map-design experiment for Trial by Combat. One invocation of this protocol = one hypothesis-driven attempt: design a map, evaluate it against the strategic-depth benchmark, record the result with reasoning. The human runs you many times to accumulate a corpus they can browse and curate.

You are not optimizing toward a single best map. You are filling out a diverse corpus with well-reasoned attempts. A map that scores below baseline but proves a clean negative result ("more bushes does NOT increase planning premium") is valuable.

## Background

Trial by Combat is a 9x9 grid, two-player, **simultaneous-move** turn-based duel (both sides submit actions each turn; engine resolves them together via `resolveTurn`). Win = carry the relic to a base tile. Turn cap 100 → replay. Read `src/engine.js` for the full ruleset before designing. **Do not change rules; only map content.**

Side fairness is handled by the engine: sides swap every game in a series (`slotSidesForGame`), so any inherent side bias on an asymmetric map averages out across a series. The eval still penalizes maps with extreme single-game side bias.

### Resolution order (relevant to map design)

`resolveTurn` resolves submitted actions in this order each turn (see `src/engine.js:385`):

1. Stunned players auto-WAIT and respawn.
2. HEAL → SCAN → DASH inventory decrement.
3. **Movement** (1 step for MOVE, 2 steps for DASH). Both sides moving onto the same tile → both blocked. Swap → both blocked.
4. **ATTACK** — checks adjacency *after* movement, so moving out of range dodges. Range 1.
5. Damage applied (GUARD reduces by 2). Damage ≥3 forces relic drop.
6. Voluntary DROP_RELIC. Knockouts.
7. PLACE_WALL / PLACE_TRAP.
8. Auto-pickup of free relic (only if exactly one player stands on it).
9. Win check.

Implications for design: **ATTACK is a prediction commit** — the attacker has to guess where the defender will be after movement. Tight corridors collapse the prediction space (one direction to dodge); open tiles widen it. **Bush ambush bonus** uses start-of-turn position. **Stepping on a trap** converts the rest of your turn to WAIT (cancels follow-up dash steps and placements).

## Map Schema

Write your map as JSON to `runs/maps/<id>.json` with these fields:

```jsonc
{
  "id": "corridor-side-route-v1",          // slug, must be unique
  "bases": {
    "blue": ["A4", "A5", "A6"],            // ≥1 tile, no upper hard cap
    "red":  ["I4", "I5", "I6"]
  },
  "starts": {
    "blue": "A5",                          // must be in own base or adjacent
    "red":  "I5"
  },
  "relicStart": "E5",
  "walls":  ["D6", "D7", "F2", "F3"],
  "bushes": ["B2", "C5", "G5", "H2"],
  "fire":   ["D2", "F6"],
  "notes": "...",                          // optional: design reasoning, see Protocol step 2
  "conclusion": null                       // filled in step 6, after eval
}
```

## Hard Constraints (`map:validate` rejects on violation)

1. All coordinates are A1-I9.
2. No tile is in more than one of `{walls, bushes, fire, bases.blue, bases.red}`.
3. ≥1 base tile per side.
4. Both starts and `relicStart` are non-wall tiles.
5. `relicStart` has a path (BFS through non-walls) to at least one tile in each base.
6. Both starts have a path to each other and to `relicStart`.
7. `starts.{side}` is either inside `bases.{side}` or 4-adjacent to a tile in `bases.{side}`.

## Soft Constraints (reflected in score, not rejected)

- Mirrored MCTS-vs-MCTS win-rate must sit in [40, 60]. Outside that range, side-fairness penalty kicks in sharply.
- Turn-cap (replay) rate >20% is heavily penalized — stalemated geometry.
- Game length collapsing below 12 turns is penalized — snowbally / single forced line.
- Very large bases trivialize capture (defender always near a winning tile) and will tank action-horizon.

## What Makes a Good Map

The benchmark measures three things, plus guardrails:

1. **Ladder separation**: does *more search* keep paying off? A four-rung MCTS-iter-scaling ladder plays round-robin (~20 games per pair, mirrored sides):
   - `greedy` — handcrafted heuristic (chase relic, attack adjacent, heal on low HP, etc.)
   - `mcts-low` — decoupled-UCT MCTS, 100 iterations/move
   - `mcts-mid` — same MCTS, 250 iterations/move
   - `mcts-high` — same MCTS, 500 iterations/move

   Pairwise outcomes are fit to Bradley-Terry ratings (anchored so `greedy = 0` Elo) and converted to Elo. The headline number is the **weighted mean of adjacent Elo gaps** with weights `[1, 2, 3]` for `(greedy→low, low→mid, mid→high)` — i.e. the gap between the two strongest rungs is weighted most, because that's where "marginal compute → wins" is hardest to come by. Negative gaps (a stronger rung losing to a weaker one) clip to 0, so flat or inverted spots in the ladder earn no credit.

2. **Action horizon**: do actions cascade? Counterfactual divergence: at sampled turns T, force a *different* legal action, replay forward with the same policies, measure win-rate delta at T+3, T+8, T+15. Mean delta at T+15 is the headline number.

3. **Side fairness**: `mcts-high` vs `mcts-high` mirrored — closer to 50/50 is better.

## Score Formula

```
weighted_elo_gap    = (1*max(0, g→low) + 2*max(0, low→mid) + 3*max(0, mid→high)) / 6
ladder_separation   = 1 - exp(-weighted_elo_gap / 200)         // smooth, asymptotes to 1, never reaches it
horizon             = clamp(mean_t15_divergence / 0.30, 0, 1)  // 0.30 normalizes a "strong" divergence
side_fairness       = 1 - clamp((|mcts_mirror_winrate - 0.5| - 0.10) / 0.30, 0, 1)
turn_cap_penalty    = 1 - clamp((turn_cap_rate - 0.10) / 0.30, 0, 1)
length_penalty      = 1 if median_game_length ≥ 12 else median_game_length / 12

score = 100 * ladder_separation * horizon * side_fairness * turn_cap_penalty * length_penalty
```

Notes on the ladder:
- `weighted_elo_gap` of 200 ⇒ `ladder_separation ≈ 0.63`, 400 ⇒ `≈ 0.86`, 600 ⇒ `≈ 0.95`. The metric never hits 1 exactly, so the score has no hard ceiling — a "perfect" 100 is unreachable by construction.
- A flat ladder (every rung roughly equivalent) ⇒ small Elo gaps ⇒ low separation. Maps must reward *each step up the ladder*, especially the top step.
- Random ties (replay/turn-cap) count as 0.5; one virtual half-half draw is added to every actually-played pair so a 100%/0% sweep doesn't blow the Bradley-Terry fit up to infinite Elo.

Baseline Center Choke score lives at `runs/evals/_baseline_center_choke.json`. Compare your result to that, not to absolute numbers.

## Protocol — Execute In Order

### 1. Read history

```sh
cat runs/index.jsonl | tail -50
ls runs/maps/
```

Read 3-5 of the most recent entries' `hypothesis` and `conclusion` fields. Goal: don't repeat a near-identical attempt; learn from prior negative results. If `runs/index.jsonl` is empty, you are attempt #1.

### 2. Note your reasoning (optional)

You don't have to declare a hypothesis. But if you have a mental model for why this layout might play well — write it down in the `notes` field. Naming the *mechanism* (not just the vibe) helps later you (or another agent) read the corpus and learn from it. A note like *"three corridors instead of two so greedy can't commit"* is more useful than *"feels balanced"*. Skip it if you're just exploring.

### 3. Author the map

Write `runs/maps/<id>.json`. `<id>` is a descriptive slug. There is no tile budget — judge layouts by whether the resulting gameplay is good, not by how many of each tile you used. Sparse and dense maps are both allowed; the eval will tell you which one this turned out to be.

### 4. Validate

```sh
npm run map:validate -- <id>
```

If invalid, fix and re-run. Do not proceed to eval until validation passes.

### 5. Evaluate

```sh
npm run map:evaluate -- <id>
```

Runs in ≤10 minutes. Writes `runs/evals/<id>.json` containing the full matchup matrix, divergence samples, side-bias measurements, game-length distribution, and the computed score. Do not interrupt or run multiple evals in parallel — they share CPU.

### 6. Write the conclusion

Read `runs/evals/<id>.json`. Update `runs/maps/<id>.json`'s `conclusion` field with 3-5 sentences:

- What did this map actually do well or poorly? Reference specific sub-metrics, not just the headline score.
- What surprised you?
- What would you try next? (One concrete next experiment, not a wishlist.)

If you had a hunch in `notes` and it was wrong, say so plainly. Negative results are the point.

### 7. Append to the index

```sh
npm run map:record -- <id>
```

Appends a one-line summary `{id, score, planning_premium, horizon, side_fairness, ts}` to `runs/index.jsonl`.

### 8. Report and stop

Output to the human:
```
Map: <id>
Score: <X> (baseline: <Y>)
Takeaway: <one sentence>
```

**Do not iterate. One invocation = one experiment.**

## Anti-Patterns

- **Pure tweak-and-resubmit**: tweaking a prior map (move one bush, swap one wall) is allowed, but it's a low-information experiment when something more distinct would also fit. Prefer attempts that test something genuinely different from prior entries; reach for tweaks when you're zeroing in on a promising region.
- **Wall maze**: 30+ walls almost always tanks horizon (forces single path) or fails validation (seals regions).
- **Fire ring**: surrounding the relic with fire collapses to one forced opener.
- **Vacant maps**: zero walls/bushes/fire = no decisions = low planning premium.
- **Asymmetric for no reason**: asymmetric maps are fine. Default mirrored when you don't have a specific reason to break symmetry, since mirrored is automatically side-fair and easier to reason about. If you go asymmetric, the side-bias guardrail will catch the unfair ones.

## Files You'll Touch

| Path | Read / Write | Purpose |
|---|---|---|
| `src/engine.js` | read | ground truth for rules |
| `runs/index.jsonl` | read | prior attempts |
| `runs/maps/<id>.json` | write | your map + hypothesis + conclusion |
| `runs/evals/<id>.json` | read (after step 5) | benchmark results |
| `runs/evals/_baseline_center_choke.json` | read | comparison point |

You should not touch `src/`, `test/`, or `public/`.
