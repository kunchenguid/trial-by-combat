# Agent Duel — Production Atlas 2048 Usage Guide

This package contains a real 2048×2048 transparent PNG atlas with deterministic sprite/frame placement.

## Files

- `agent_duel_production_atlas_2048.png` — production sprite atlas, 2048×2048, transparent background.
- `agent_duel_production_atlas_2048.json` — authoritative sprite metadata and animations.
- `agent_duel_production_atlas_2048_sprite_rects.csv` — flat sprite rect table for quick import.
- `agent_duel_production_atlas_2048_usage.md` — this guide.

## Import settings

Use these texture settings in the game engine:

```text
Texture size: 2048×2048
Background: transparent
Sprite cell size: 64×64
Filter: Point / Nearest
Compression: None or lossless
Mipmaps: Off
Wrap: Clamp
Runtime scaling: nearest-neighbor only
```

Every sprite is in a 64×64 atlas cell.  
Coordinates are pixel rects in the atlas: `x, y, w, h`.

## Core rule

Do not place visually composite wall/bush art as a single giant map object.

The map is logical-first:

```text
One board cell = one logical terrain cell.
One logical terrain cell = one 64×64 sprite rect.
```

So a 3-cell wall is:

```text
D4 = wall
E4 = wall
F4 = wall
```

not:

```text
D4 = one giant 3-wide wall sprite
E4 = floor
F4 = floor
```

## Render order

Recommended:

1. `floor_*`
2. base/fire/trap overlays
3. wall/bush terrain
4. relic on ground, if not carried
5. selection/legal/target highlights
6. agent sprite
7. relic attached to carrier, if carried
8. temporary FX
9. UI/HUD icons

## Terrain bitmask convention

For wall and bush autotiles, compute a 4-neighbor mask:

```text
N = 1
E = 2
S = 4
W = 8
```

```ts
const mask =
  (sameTerrain(x, y - 1) ? 1 : 0) |
  (sameTerrain(x + 1, y) ? 2 : 0) |
  (sameTerrain(x, y + 1) ? 4 : 0) |
  (sameTerrain(x - 1, y) ? 8 : 0);
```

Then select:

```ts
wallSprite = sprites[`wall_${mask}`]
bushSprite = sprites[`bush_${mask}`]
```

## Wall autotile mapping

| Mask | Meaning | Sprite ID | Rect `x,y,w,h` |
|---:|---|---|---:|
| `0` | isolated/no neighbors | `wall_0` | `0,256,64,64` |
| `1` | connects N only | `wall_1` | `64,256,64,64` |
| `2` | connects E only | `wall_2` | `128,256,64,64` |
| `3` | connects N+E | `wall_3` | `192,256,64,64` |
| `4` | connects S only | `wall_4` | `256,256,64,64` |
| `5` | connects N+S | `wall_5` | `320,256,64,64` |
| `6` | connects E+S | `wall_6` | `384,256,64,64` |
| `7` | connects N+E+S | `wall_7` | `448,256,64,64` |
| `8` | connects W only | `wall_8` | `512,256,64,64` |
| `9` | connects W+N | `wall_9` | `576,256,64,64` |
| `10` | connects E+W | `wall_10` | `640,256,64,64` |
| `11` | connects W+N+E | `wall_11` | `704,256,64,64` |
| `12` | connects S+W | `wall_12` | `768,256,64,64` |
| `13` | connects S+W+N | `wall_13` | `832,256,64,64` |
| `14` | connects E+S+W | `wall_14` | `896,256,64,64` |
| `15` | connects N+E+S+W | `wall_15` | `960,256,64,64` |

## Bush autotile mapping

| Mask | Meaning | Sprite ID | Rect `x,y,w,h` |
|---:|---|---|---:|
| `0` | isolated/no neighbors | `bush_0` | `0,320,64,64` |
| `1` | connects N only | `bush_1` | `64,320,64,64` |
| `2` | connects E only | `bush_2` | `128,320,64,64` |
| `3` | connects N+E | `bush_3` | `192,320,64,64` |
| `4` | connects S only | `bush_4` | `256,320,64,64` |
| `5` | connects N+S | `bush_5` | `320,320,64,64` |
| `6` | connects E+S | `bush_6` | `384,320,64,64` |
| `7` | connects N+E+S | `bush_7` | `448,320,64,64` |
| `8` | connects W only | `bush_8` | `512,320,64,64` |
| `9` | connects W+N | `bush_9` | `576,320,64,64` |
| `10` | connects E+W | `bush_10` | `640,320,64,64` |
| `11` | connects W+N+E | `bush_11` | `704,320,64,64` |
| `12` | connects S+W | `bush_12` | `768,320,64,64` |
| `13` | connects S+W+N | `bush_13` | `832,320,64,64` |
| `14` | connects E+S+W | `bush_14` | `896,320,64,64` |
| `15` | connects N+E+S+W | `bush_15` | `960,320,64,64` |

## Examples

### 3-cell horizontal wall

Logical map:

```text
W W W
```

Masks:

```text
2 10 8
```

Sprites:

```text
wall_2   wall_10   wall_8
```

### 3-cell horizontal bush

Logical map:

```text
B B B
```

Masks:

```text
2 10 8
```

Sprites:

```text
bush_2   bush_10   bush_8
```

### 2×2 bush patch

Logical map:

```text
B B
B B
```

Masks:

```text
6 12
3 9
```

Sprites:

```text
bush_6   bush_12
bush_3   bush_9
```

## Animations

| Animation | FPS | Loop | Frames |
|---|---:|---|---|
| `agent_blue_idle` | 4 | yes | `agent_blue_idle_0`, `agent_blue_idle_1`, `agent_blue_idle_2`, `agent_blue_idle_3` |
| `agent_blue_walk` | 8 | yes | `agent_blue_walk_0`, `agent_blue_walk_1`, `agent_blue_walk_2`, `agent_blue_walk_3` |
| `agent_blue_carry_idle` | 3 | yes | `agent_blue_carry_idle_0`, `agent_blue_carry_idle_1` |
| `agent_blue_carry_walk` | 8 | yes | `agent_blue_carry_walk_0`, `agent_blue_carry_walk_1`, `agent_blue_carry_walk_2`, `agent_blue_carry_walk_3` |
| `agent_blue_attack` | 8 | no | `agent_blue_attack_0`, `agent_blue_attack_1` |
| `agent_red_idle` | 4 | yes | `agent_red_idle_0`, `agent_red_idle_1`, `agent_red_idle_2`, `agent_red_idle_3` |
| `agent_red_walk` | 8 | yes | `agent_red_walk_0`, `agent_red_walk_1`, `agent_red_walk_2`, `agent_red_walk_3` |
| `agent_red_carry_idle` | 3 | yes | `agent_red_carry_idle_0`, `agent_red_carry_idle_1` |
| `agent_red_carry_walk` | 8 | yes | `agent_red_carry_walk_0`, `agent_red_carry_walk_1`, `agent_red_carry_walk_2`, `agent_red_carry_walk_3` |
| `agent_red_attack` | 8 | no | `agent_red_attack_0`, `agent_red_attack_1` |
| `relic_shimmer` | 5 | yes | `relic_0`, `relic_1`, `relic_2`, `relic_3` |
| `base_blue_flag` | 4 | yes | `base_blue_0`, `base_blue_1`, `base_blue_2`, `base_blue_3` |
| `base_red_flag` | 4 | yes | `base_red_0`, `base_red_1`, `base_red_2`, `base_red_3` |
| `fire_loop` | 7 | yes | `fire_0`, `fire_1`, `fire_2`, `fire_3` |
| `trap_trigger` | 10 | no | `trap_trigger_0`, `trap_trigger_1`, `trap_trigger_2`, `trap_trigger_3` |
| `fx_hit` | 12 | no | `fx_hit_0`, `fx_hit_1`, `fx_hit_2`, `fx_hit_3` |
| `fx_scan` | 10 | no | `fx_scan_0`, `fx_scan_1`, `fx_scan_2`, `fx_scan_3` |
| `fx_dash_blue` | 12 | no | `fx_dash_blue_0`, `fx_dash_blue_1`, `fx_dash_blue_2`, `fx_dash_blue_3` |
| `fx_dash_red` | 12 | no | `fx_dash_red_0`, `fx_dash_red_1`, `fx_dash_red_2`, `fx_dash_red_3` |
| `fx_dust` | 8 | no | `fx_dust_0`, `fx_dust_1`, `fx_dust_2`, `fx_dust_3` |

## Blue agent frames

| Sprite/frame ID | Rect `x,y,w,h` | Grid position | Usage |
|---|---:|---|---|
| `agent_blue_idle_0` | `0,0,64,64` | row 0, col 0 | Blue agent idle animation frame |
| `agent_blue_idle_1` | `64,0,64,64` | row 0, col 1 | Blue agent idle animation frame |
| `agent_blue_idle_2` | `128,0,64,64` | row 0, col 2 | Blue agent idle animation frame |
| `agent_blue_idle_3` | `192,0,64,64` | row 0, col 3 | Blue agent idle animation frame |
| `agent_blue_walk_0` | `256,0,64,64` | row 0, col 4 | Blue agent walk animation frame |
| `agent_blue_walk_1` | `320,0,64,64` | row 0, col 5 | Blue agent walk animation frame |
| `agent_blue_walk_2` | `384,0,64,64` | row 0, col 6 | Blue agent walk animation frame |
| `agent_blue_walk_3` | `448,0,64,64` | row 0, col 7 | Blue agent walk animation frame |
| `agent_blue_carry_idle_0` | `512,0,64,64` | row 0, col 8 | Blue agent carrying relic idle frame |
| `agent_blue_carry_idle_1` | `576,0,64,64` | row 0, col 9 | Blue agent carrying relic idle frame |
| `agent_blue_carry_walk_0` | `640,0,64,64` | row 0, col 10 | Blue agent carrying relic walk frame |
| `agent_blue_carry_walk_1` | `704,0,64,64` | row 0, col 11 | Blue agent carrying relic walk frame |
| `agent_blue_carry_walk_2` | `768,0,64,64` | row 0, col 12 | Blue agent carrying relic walk frame |
| `agent_blue_carry_walk_3` | `832,0,64,64` | row 0, col 13 | Blue agent carrying relic walk frame |
| `agent_blue_attack_0` | `896,0,64,64` | row 0, col 14 | Blue agent attack pose frame |
| `agent_blue_attack_1` | `960,0,64,64` | row 0, col 15 | Blue agent attack pose frame |
| `agent_blue_stunned_0` | `1024,0,64,64` | row 0, col 16 | Blue agent stunned pose |

## Red agent frames

| Sprite/frame ID | Rect `x,y,w,h` | Grid position | Usage |
|---|---:|---|---|
| `agent_red_idle_0` | `0,64,64,64` | row 1, col 0 | Red agent idle animation frame |
| `agent_red_idle_1` | `64,64,64,64` | row 1, col 1 | Red agent idle animation frame |
| `agent_red_idle_2` | `128,64,64,64` | row 1, col 2 | Red agent idle animation frame |
| `agent_red_idle_3` | `192,64,64,64` | row 1, col 3 | Red agent idle animation frame |
| `agent_red_walk_0` | `256,64,64,64` | row 1, col 4 | Red agent walk animation frame |
| `agent_red_walk_1` | `320,64,64,64` | row 1, col 5 | Red agent walk animation frame |
| `agent_red_walk_2` | `384,64,64,64` | row 1, col 6 | Red agent walk animation frame |
| `agent_red_walk_3` | `448,64,64,64` | row 1, col 7 | Red agent walk animation frame |
| `agent_red_carry_idle_0` | `512,64,64,64` | row 1, col 8 | Red agent carrying relic idle frame |
| `agent_red_carry_idle_1` | `576,64,64,64` | row 1, col 9 | Red agent carrying relic idle frame |
| `agent_red_carry_walk_0` | `640,64,64,64` | row 1, col 10 | Red agent carrying relic walk frame |
| `agent_red_carry_walk_1` | `704,64,64,64` | row 1, col 11 | Red agent carrying relic walk frame |
| `agent_red_carry_walk_2` | `768,64,64,64` | row 1, col 12 | Red agent carrying relic walk frame |
| `agent_red_carry_walk_3` | `832,64,64,64` | row 1, col 13 | Red agent carrying relic walk frame |
| `agent_red_attack_0` | `896,64,64,64` | row 1, col 14 | Red agent attack pose frame |
| `agent_red_attack_1` | `960,64,64,64` | row 1, col 15 | Red agent attack pose frame |
| `agent_red_stunned_0` | `1024,64,64,64` | row 1, col 16 | Red agent stunned pose |

## Objective, bases, and highlights

| Sprite/frame ID | Rect `x,y,w,h` | Grid position | Usage |
|---|---:|---|---|
| `relic_0` | `0,128,64,64` | row 2, col 0 | Relic shimmer animation frame |
| `relic_1` | `64,128,64,64` | row 2, col 1 | Relic shimmer animation frame |
| `relic_2` | `128,128,64,64` | row 2, col 2 | Relic shimmer animation frame |
| `relic_3` | `192,128,64,64` | row 2, col 3 | Relic shimmer animation frame |
| `base_blue_0` | `256,128,64,64` | row 2, col 4 | Blue base/flag animation frame |
| `base_blue_1` | `320,128,64,64` | row 2, col 5 | Blue base/flag animation frame |
| `base_blue_2` | `384,128,64,64` | row 2, col 6 | Blue base/flag animation frame |
| `base_blue_3` | `448,128,64,64` | row 2, col 7 | Blue base/flag animation frame |
| `base_red_0` | `512,128,64,64` | row 2, col 8 | Red base/flag animation frame |
| `base_red_1` | `576,128,64,64` | row 2, col 9 | Red base/flag animation frame |
| `base_red_2` | `640,128,64,64` | row 2, col 10 | Red base/flag animation frame |
| `base_red_3` | `704,128,64,64` | row 2, col 11 | Red base/flag animation frame |
| `selection_ring_blue` | `768,128,64,64` | row 2, col 12 | Blue unit selection/highlight ring |
| `selection_ring_red` | `832,128,64,64` | row 2, col 13 | Red unit selection/highlight ring |
| `legal_move` | `896,128,64,64` | row 2, col 14 | legal move overlay |
| `target_marker` | `960,128,64,64` | row 2, col 15 | target marker overlay |
| `danger_marker` | `1024,128,64,64` | row 2, col 16 | danger marker overlay |
| `hover_tile` | `1088,128,64,64` | row 2, col 17 | hover tile overlay |

## Floor, fire, and trap terrain

| Sprite/frame ID | Rect `x,y,w,h` | Grid position | Usage |
|---|---:|---|---|
| `floor_0` | `0,192,64,64` | row 3, col 0 | Opaque board floor tile variation |
| `floor_1` | `64,192,64,64` | row 3, col 1 | Opaque board floor tile variation |
| `floor_2` | `128,192,64,64` | row 3, col 2 | Opaque board floor tile variation |
| `floor_3` | `192,192,64,64` | row 3, col 3 | Opaque board floor tile variation |
| `fire_0` | `256,192,64,64` | row 3, col 4 | Persistent fire hazard animation frame |
| `fire_1` | `320,192,64,64` | row 3, col 5 | Persistent fire hazard animation frame |
| `fire_2` | `384,192,64,64` | row 3, col 6 | Persistent fire hazard animation frame |
| `fire_3` | `448,192,64,64` | row 3, col 7 | Persistent fire hazard animation frame |
| `trap_hidden` | `512,192,64,64` | row 3, col 8 | Trap hidden/closed overlay |
| `trap_armed` | `576,192,64,64` | row 3, col 9 | Trap armed/open overlay |
| `trap_trigger_0` | `640,192,64,64` | row 3, col 10 | Trap triggered animation frame |
| `trap_trigger_1` | `704,192,64,64` | row 3, col 11 | Trap triggered animation frame |
| `trap_trigger_2` | `768,192,64,64` | row 3, col 12 | Trap triggered animation frame |
| `trap_trigger_3` | `832,192,64,64` | row 3, col 13 | Trap triggered animation frame |
| `trap_disabled` | `896,192,64,64` | row 3, col 14 | Trap disabled/used overlay |

## Wall autotiles

| Sprite/frame ID | Rect `x,y,w,h` | Grid position | Usage |
|---|---:|---|---|
| `wall_0` | `0,256,64,64` | row 4, col 0 | Wall autotile frame for 4-neighbor mask 0 |
| `wall_1` | `64,256,64,64` | row 4, col 1 | Wall autotile frame for 4-neighbor mask 1 |
| `wall_2` | `128,256,64,64` | row 4, col 2 | Wall autotile frame for 4-neighbor mask 2 |
| `wall_3` | `192,256,64,64` | row 4, col 3 | Wall autotile frame for 4-neighbor mask 3 |
| `wall_4` | `256,256,64,64` | row 4, col 4 | Wall autotile frame for 4-neighbor mask 4 |
| `wall_5` | `320,256,64,64` | row 4, col 5 | Wall autotile frame for 4-neighbor mask 5 |
| `wall_6` | `384,256,64,64` | row 4, col 6 | Wall autotile frame for 4-neighbor mask 6 |
| `wall_7` | `448,256,64,64` | row 4, col 7 | Wall autotile frame for 4-neighbor mask 7 |
| `wall_8` | `512,256,64,64` | row 4, col 8 | Wall autotile frame for 4-neighbor mask 8 |
| `wall_9` | `576,256,64,64` | row 4, col 9 | Wall autotile frame for 4-neighbor mask 9 |
| `wall_10` | `640,256,64,64` | row 4, col 10 | Wall autotile frame for 4-neighbor mask 10 |
| `wall_11` | `704,256,64,64` | row 4, col 11 | Wall autotile frame for 4-neighbor mask 11 |
| `wall_12` | `768,256,64,64` | row 4, col 12 | Wall autotile frame for 4-neighbor mask 12 |
| `wall_13` | `832,256,64,64` | row 4, col 13 | Wall autotile frame for 4-neighbor mask 13 |
| `wall_14` | `896,256,64,64` | row 4, col 14 | Wall autotile frame for 4-neighbor mask 14 |
| `wall_15` | `960,256,64,64` | row 4, col 15 | Wall autotile frame for 4-neighbor mask 15 |

## Bush autotiles

| Sprite/frame ID | Rect `x,y,w,h` | Grid position | Usage |
|---|---:|---|---|
| `bush_0` | `0,320,64,64` | row 5, col 0 | Bush autotile frame for 4-neighbor mask 0 |
| `bush_1` | `64,320,64,64` | row 5, col 1 | Bush autotile frame for 4-neighbor mask 1 |
| `bush_2` | `128,320,64,64` | row 5, col 2 | Bush autotile frame for 4-neighbor mask 2 |
| `bush_3` | `192,320,64,64` | row 5, col 3 | Bush autotile frame for 4-neighbor mask 3 |
| `bush_4` | `256,320,64,64` | row 5, col 4 | Bush autotile frame for 4-neighbor mask 4 |
| `bush_5` | `320,320,64,64` | row 5, col 5 | Bush autotile frame for 4-neighbor mask 5 |
| `bush_6` | `384,320,64,64` | row 5, col 6 | Bush autotile frame for 4-neighbor mask 6 |
| `bush_7` | `448,320,64,64` | row 5, col 7 | Bush autotile frame for 4-neighbor mask 7 |
| `bush_8` | `512,320,64,64` | row 5, col 8 | Bush autotile frame for 4-neighbor mask 8 |
| `bush_9` | `576,320,64,64` | row 5, col 9 | Bush autotile frame for 4-neighbor mask 9 |
| `bush_10` | `640,320,64,64` | row 5, col 10 | Bush autotile frame for 4-neighbor mask 10 |
| `bush_11` | `704,320,64,64` | row 5, col 11 | Bush autotile frame for 4-neighbor mask 11 |
| `bush_12` | `768,320,64,64` | row 5, col 12 | Bush autotile frame for 4-neighbor mask 12 |
| `bush_13` | `832,320,64,64` | row 5, col 13 | Bush autotile frame for 4-neighbor mask 13 |
| `bush_14` | `896,320,64,64` | row 5, col 14 | Bush autotile frame for 4-neighbor mask 14 |
| `bush_15` | `960,320,64,64` | row 5, col 15 | Bush autotile frame for 4-neighbor mask 15 |

## HP and tool icons

| Sprite/frame ID | Rect `x,y,w,h` | Grid position | Usage |
|---|---:|---|---|
| `hp_blue_full` | `0,384,64,64` | row 6, col 0 | blue filled HP heart |
| `hp_blue_empty` | `64,384,64,64` | row 6, col 1 | blue empty HP heart |
| `hp_red_full` | `128,384,64,64` | row 6, col 2 | red filled HP heart |
| `hp_red_empty` | `192,384,64,64` | row 6, col 3 | red empty HP heart |
| `tool_blue_wall` | `256,384,64,64` | row 6, col 4 | blue wall tool icon |
| `tool_blue_trap` | `320,384,64,64` | row 6, col 5 | blue trap tool icon |
| `tool_blue_scan` | `384,384,64,64` | row 6, col 6 | blue scan tool icon |
| `tool_blue_dash` | `448,384,64,64` | row 6, col 7 | blue dash tool icon |
| `tool_blue_heal` | `512,384,64,64` | row 6, col 8 | blue heal tool icon |
| `tool_red_wall` | `576,384,64,64` | row 6, col 9 | red wall tool icon |
| `tool_red_trap` | `640,384,64,64` | row 6, col 10 | red trap tool icon |
| `tool_red_scan` | `704,384,64,64` | row 6, col 11 | red scan tool icon |
| `tool_red_dash` | `768,384,64,64` | row 6, col 12 | red dash tool icon |
| `tool_red_heal` | `832,384,64,64` | row 6, col 13 | red heal tool icon |

## Legend icons and arrows

| Sprite/frame ID | Rect `x,y,w,h` | Grid position | Usage |
|---|---:|---|---|
| `icon_relic` | `896,384,64,64` | row 6, col 14 | Neutral legend icon: relic |
| `icon_bush` | `960,384,64,64` | row 6, col 15 | Neutral legend icon: bush |
| `icon_fire` | `1024,384,64,64` | row 6, col 16 | Neutral legend icon: fire |
| `icon_wall` | `1088,384,64,64` | row 6, col 17 | Neutral legend icon: wall |
| `icon_trap` | `1152,384,64,64` | row 6, col 18 | Neutral legend icon: trap |
| `arrow_blue` | `0,448,64,64` | row 7, col 0 | blue chevron/thinking arrow icon |
| `arrow_red` | `64,448,64,64` | row 7, col 1 | red chevron/thinking arrow icon |
| `arrow_gold` | `128,448,64,64` | row 7, col 2 | gold chevron/thinking arrow icon |

## Effects

| Sprite/frame ID | Rect `x,y,w,h` | Grid position | Usage |
|---|---:|---|---|
| `fx_spark_gold_0` | `192,448,64,64` | row 7, col 3 | gold sparkle FX frame |
| `fx_spark_gold_1` | `256,448,64,64` | row 7, col 4 | gold sparkle FX frame |
| `fx_spark_gold_2` | `320,448,64,64` | row 7, col 5 | gold sparkle FX frame |
| `fx_spark_gold_3` | `384,448,64,64` | row 7, col 6 | gold sparkle FX frame |
| `fx_spark_blue_0` | `448,448,64,64` | row 7, col 7 | blue sparkle FX frame |
| `fx_spark_blue_1` | `512,448,64,64` | row 7, col 8 | blue sparkle FX frame |
| `fx_spark_blue_2` | `576,448,64,64` | row 7, col 9 | blue sparkle FX frame |
| `fx_spark_blue_3` | `640,448,64,64` | row 7, col 10 | blue sparkle FX frame |
| `fx_spark_red_0` | `704,448,64,64` | row 7, col 11 | red sparkle FX frame |
| `fx_spark_red_1` | `768,448,64,64` | row 7, col 12 | red sparkle FX frame |
| `fx_spark_red_2` | `832,448,64,64` | row 7, col 13 | red sparkle FX frame |
| `fx_spark_red_3` | `896,448,64,64` | row 7, col 14 | red sparkle FX frame |
| `fx_hit_0` | `0,512,64,64` | row 8, col 0 | Hit/burst FX frame |
| `fx_hit_1` | `64,512,64,64` | row 8, col 1 | Hit/burst FX frame |
| `fx_hit_2` | `128,512,64,64` | row 8, col 2 | Hit/burst FX frame |
| `fx_hit_3` | `192,512,64,64` | row 8, col 3 | Hit/burst FX frame |
| `fx_scan_0` | `256,512,64,64` | row 8, col 4 | Scan pulse FX frame |
| `fx_scan_1` | `320,512,64,64` | row 8, col 5 | Scan pulse FX frame |
| `fx_scan_2` | `384,512,64,64` | row 8, col 6 | Scan pulse FX frame |
| `fx_scan_3` | `448,512,64,64` | row 8, col 7 | Scan pulse FX frame |
| `fx_dash_blue_0` | `512,512,64,64` | row 8, col 8 | Blue dash streak FX frame |
| `fx_dash_blue_1` | `576,512,64,64` | row 8, col 9 | Blue dash streak FX frame |
| `fx_dash_blue_2` | `640,512,64,64` | row 8, col 10 | Blue dash streak FX frame |
| `fx_dash_blue_3` | `704,512,64,64` | row 8, col 11 | Blue dash streak FX frame |
| `fx_dash_red_0` | `768,512,64,64` | row 8, col 12 | Red dash streak FX frame |
| `fx_dash_red_1` | `832,512,64,64` | row 8, col 13 | Red dash streak FX frame |
| `fx_dash_red_2` | `896,512,64,64` | row 8, col 14 | Red dash streak FX frame |
| `fx_dash_red_3` | `960,512,64,64` | row 8, col 15 | Red dash streak FX frame |
| `fx_dust_0` | `1024,512,64,64` | row 8, col 16 | Dust/footstep FX frame |
| `fx_dust_1` | `1088,512,64,64` | row 8, col 17 | Dust/footstep FX frame |
| `fx_dust_2` | `1152,512,64,64` | row 8, col 18 | Dust/footstep FX frame |
| `fx_dust_3` | `1216,512,64,64` | row 8, col 19 | Dust/footstep FX frame |


## Notes for usage

### Agents

Use regular idle/walk frames when the agent is not carrying the relic.  
Use carry idle/walk frames when the agent has the relic.  
Do not render the separate `relic_*` ground sprite while the relic is carried unless it is used as a UI icon.

### Relic

Use `relic_0..3` for the ground shimmer animation and for header/win-condition iconography if needed.

### Bases

Use `base_blue_0..3` and `base_red_0..3` as subtle animated flag/base markers. Loop at 4 fps.

### Fire

Use `fire_0..3` as a persistent hazard overlay. Loop at 7 fps.  
Gameplay rule recommendation: standing on fire at end of turn deals 1 HP damage.

### Traps

Use:

```text
trap_hidden      when opponent has not discovered trap
trap_armed       when trap is visible/known
trap_trigger_0..3 when trap activates
trap_disabled    after trap has been spent
```

### Walls and bushes

Use the bitmask tables.  
Do not hand-place wall and bush frames manually unless debugging.

### UI nameplates

Use:

```text
hp_blue_full / hp_blue_empty
hp_red_full / hp_red_empty
```

for the nameplate HP hearts.

### Tools

Use `tool_blue_*` and `tool_red_*` for side-panel tools:

```text
tool_blue_wall, tool_blue_trap, tool_blue_scan, tool_blue_dash, tool_blue_heal
tool_red_wall, tool_red_trap, tool_red_scan, tool_red_dash, tool_red_heal
```

### FX

Use `fx_*` as one-shot overlays above agents/terrain.
