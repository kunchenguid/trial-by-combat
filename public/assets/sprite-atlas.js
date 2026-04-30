export const TRIAL_BY_COMBAT_ATLAS = Object.freeze({
  image: '/assets/trial-by-combat-sprite-sheet.png?v=production-atlas-2048-v2',
  width: 2048,
  height: 2048,
  cellSize: 64,
  columns: 32,
  rows: 32,
  settings: Object.freeze({
    filterMode: 'nearest',
    compression: 'lossless',
    mipmaps: false,
    wrapMode: 'clamp',
  }),
  bitmask: Object.freeze({"N":1,"E":2,"S":4,"W":8}),
  terrainAutotiles: deepFreeze({
  "wall": {
    "0": "wall_0",
    "1": "wall_1",
    "2": "wall_2",
    "3": "wall_3",
    "4": "wall_4",
    "5": "wall_5",
    "6": "wall_6",
    "7": "wall_7",
    "8": "wall_8",
    "9": "wall_9",
    "10": "wall_10",
    "11": "wall_11",
    "12": "wall_12",
    "13": "wall_13",
    "14": "wall_14",
    "15": "wall_15"
  },
  "bush": {
    "0": "bush_0",
    "1": "bush_1",
    "2": "bush_2",
    "3": "bush_3",
    "4": "bush_4",
    "5": "bush_5",
    "6": "bush_6",
    "7": "bush_7",
    "8": "bush_8",
    "9": "bush_9",
    "10": "bush_10",
    "11": "bush_11",
    "12": "bush_12",
    "13": "bush_13",
    "14": "bush_14",
    "15": "bush_15"
  }
}),
  frames: Object.freeze({
    agent_blue_idle_0: f(0, 0, 64, 64),
    agent_blue_idle_1: f(64, 0, 64, 64),
    agent_blue_idle_2: f(128, 0, 64, 64),
    agent_blue_idle_3: f(192, 0, 64, 64),
    agent_blue_walk_0: f(256, 0, 64, 64),
    agent_blue_walk_1: f(320, 0, 64, 64),
    agent_blue_walk_2: f(384, 0, 64, 64),
    agent_blue_walk_3: f(448, 0, 64, 64),
    agent_blue_carry_idle_0: f(512, 0, 64, 64),
    agent_blue_carry_idle_1: f(576, 0, 64, 64),
    agent_blue_carry_walk_0: f(640, 0, 64, 64),
    agent_blue_carry_walk_1: f(704, 0, 64, 64),
    agent_blue_carry_walk_2: f(768, 0, 64, 64),
    agent_blue_carry_walk_3: f(832, 0, 64, 64),
    agent_blue_attack_0: f(896, 0, 64, 64),
    agent_blue_attack_1: f(960, 0, 64, 64),
    agent_blue_stunned_0: f(1024, 0, 64, 64),
    agent_red_idle_0: f(0, 64, 64, 64),
    agent_red_idle_1: f(64, 64, 64, 64),
    agent_red_idle_2: f(128, 64, 64, 64),
    agent_red_idle_3: f(192, 64, 64, 64),
    agent_red_walk_0: f(256, 64, 64, 64),
    agent_red_walk_1: f(320, 64, 64, 64),
    agent_red_walk_2: f(384, 64, 64, 64),
    agent_red_walk_3: f(448, 64, 64, 64),
    agent_red_carry_idle_0: f(512, 64, 64, 64),
    agent_red_carry_idle_1: f(576, 64, 64, 64),
    agent_red_carry_walk_0: f(640, 64, 64, 64),
    agent_red_carry_walk_1: f(704, 64, 64, 64),
    agent_red_carry_walk_2: f(768, 64, 64, 64),
    agent_red_carry_walk_3: f(832, 64, 64, 64),
    agent_red_attack_0: f(896, 64, 64, 64),
    agent_red_attack_1: f(960, 64, 64, 64),
    agent_red_stunned_0: f(1024, 64, 64, 64),
    relic_0: f(0, 128, 64, 64),
    relic_1: f(64, 128, 64, 64),
    relic_2: f(128, 128, 64, 64),
    relic_3: f(192, 128, 64, 64),
    base_blue_0: f(256, 128, 64, 64),
    base_blue_1: f(320, 128, 64, 64),
    base_blue_2: f(384, 128, 64, 64),
    base_blue_3: f(448, 128, 64, 64),
    base_red_0: f(512, 128, 64, 64),
    base_red_1: f(576, 128, 64, 64),
    base_red_2: f(640, 128, 64, 64),
    base_red_3: f(704, 128, 64, 64),
    selection_ring_blue: f(768, 128, 64, 64),
    selection_ring_red: f(832, 128, 64, 64),
    legal_move: f(896, 128, 64, 64),
    target_marker: f(960, 128, 64, 64),
    danger_marker: f(1024, 128, 64, 64),
    hover_tile: f(1088, 128, 64, 64),
    floor_0: f(0, 192, 64, 64),
    floor_1: f(64, 192, 64, 64),
    floor_2: f(128, 192, 64, 64),
    floor_3: f(192, 192, 64, 64),
    fire_0: f(256, 192, 64, 64),
    fire_1: f(320, 192, 64, 64),
    fire_2: f(384, 192, 64, 64),
    fire_3: f(448, 192, 64, 64),
    trap_hidden: f(512, 192, 64, 64),
    trap_armed: f(576, 192, 64, 64),
    trap_trigger_0: f(640, 192, 64, 64),
    trap_trigger_1: f(704, 192, 64, 64),
    trap_trigger_2: f(768, 192, 64, 64),
    trap_trigger_3: f(832, 192, 64, 64),
    trap_disabled: f(896, 192, 64, 64),
    wall_0: f(0, 256, 64, 64),
    wall_1: f(64, 256, 64, 64),
    wall_2: f(128, 256, 64, 64),
    wall_3: f(192, 256, 64, 64),
    wall_4: f(256, 256, 64, 64),
    wall_5: f(320, 256, 64, 64),
    wall_6: f(384, 256, 64, 64),
    wall_7: f(448, 256, 64, 64),
    wall_8: f(512, 256, 64, 64),
    wall_9: f(576, 256, 64, 64),
    wall_10: f(640, 256, 64, 64),
    wall_11: f(704, 256, 64, 64),
    wall_12: f(768, 256, 64, 64),
    wall_13: f(832, 256, 64, 64),
    wall_14: f(896, 256, 64, 64),
    wall_15: f(960, 256, 64, 64),
    bush_0: f(0, 320, 64, 64),
    bush_1: f(64, 320, 64, 64),
    bush_2: f(128, 320, 64, 64),
    bush_3: f(192, 320, 64, 64),
    bush_4: f(256, 320, 64, 64),
    bush_5: f(320, 320, 64, 64),
    bush_6: f(384, 320, 64, 64),
    bush_7: f(448, 320, 64, 64),
    bush_8: f(512, 320, 64, 64),
    bush_9: f(576, 320, 64, 64),
    bush_10: f(640, 320, 64, 64),
    bush_11: f(704, 320, 64, 64),
    bush_12: f(768, 320, 64, 64),
    bush_13: f(832, 320, 64, 64),
    bush_14: f(896, 320, 64, 64),
    bush_15: f(960, 320, 64, 64),
    hp_blue_full: f(0, 384, 64, 64),
    hp_blue_empty: f(64, 384, 64, 64),
    hp_red_full: f(128, 384, 64, 64),
    hp_red_empty: f(192, 384, 64, 64),
    tool_blue_wall: f(256, 384, 64, 64),
    tool_blue_trap: f(320, 384, 64, 64),
    tool_blue_scan: f(384, 384, 64, 64),
    tool_blue_dash: f(448, 384, 64, 64),
    tool_blue_heal: f(512, 384, 64, 64),
    tool_red_wall: f(576, 384, 64, 64),
    tool_red_trap: f(640, 384, 64, 64),
    tool_red_scan: f(704, 384, 64, 64),
    tool_red_dash: f(768, 384, 64, 64),
    tool_red_heal: f(832, 384, 64, 64),
    icon_relic: f(896, 384, 64, 64),
    icon_bush: f(960, 384, 64, 64),
    icon_fire: f(1024, 384, 64, 64),
    icon_wall: f(1088, 384, 64, 64),
    icon_trap: f(1152, 384, 64, 64),
    arrow_blue: f(0, 448, 64, 64),
    arrow_red: f(64, 448, 64, 64),
    arrow_gold: f(128, 448, 64, 64),
    fx_spark_gold_0: f(192, 448, 64, 64),
    fx_spark_gold_1: f(256, 448, 64, 64),
    fx_spark_gold_2: f(320, 448, 64, 64),
    fx_spark_gold_3: f(384, 448, 64, 64),
    fx_spark_blue_0: f(448, 448, 64, 64),
    fx_spark_blue_1: f(512, 448, 64, 64),
    fx_spark_blue_2: f(576, 448, 64, 64),
    fx_spark_blue_3: f(640, 448, 64, 64),
    fx_spark_red_0: f(704, 448, 64, 64),
    fx_spark_red_1: f(768, 448, 64, 64),
    fx_spark_red_2: f(832, 448, 64, 64),
    fx_spark_red_3: f(896, 448, 64, 64),
    fx_hit_0: f(0, 512, 64, 64),
    fx_hit_1: f(64, 512, 64, 64),
    fx_hit_2: f(128, 512, 64, 64),
    fx_hit_3: f(192, 512, 64, 64),
    fx_scan_0: f(256, 512, 64, 64),
    fx_scan_1: f(320, 512, 64, 64),
    fx_scan_2: f(384, 512, 64, 64),
    fx_scan_3: f(448, 512, 64, 64),
    fx_dash_blue_0: f(512, 512, 64, 64),
    fx_dash_blue_1: f(576, 512, 64, 64),
    fx_dash_blue_2: f(640, 512, 64, 64),
    fx_dash_blue_3: f(704, 512, 64, 64),
    fx_dash_red_0: f(768, 512, 64, 64),
    fx_dash_red_1: f(832, 512, 64, 64),
    fx_dash_red_2: f(896, 512, 64, 64),
    fx_dash_red_3: f(960, 512, 64, 64),
    fx_dust_0: f(1024, 512, 64, 64),
    fx_dust_1: f(1088, 512, 64, 64),
    fx_dust_2: f(1152, 512, 64, 64),
    fx_dust_3: f(1216, 512, 64, 64),
  }),
  animations: deepFreeze({
  "agent_blue_idle": {
    "frames": [
      "agent_blue_idle_0",
      "agent_blue_idle_1",
      "agent_blue_idle_2",
      "agent_blue_idle_3"
    ],
    "fps": 4,
    "loop": true
  },
  "agent_blue_walk": {
    "frames": [
      "agent_blue_walk_0",
      "agent_blue_walk_1",
      "agent_blue_walk_2",
      "agent_blue_walk_3"
    ],
    "fps": 8,
    "loop": true
  },
  "agent_blue_carry_idle": {
    "frames": [
      "agent_blue_carry_idle_0",
      "agent_blue_carry_idle_1"
    ],
    "fps": 3,
    "loop": true
  },
  "agent_blue_carry_walk": {
    "frames": [
      "agent_blue_carry_walk_0",
      "agent_blue_carry_walk_1",
      "agent_blue_carry_walk_2",
      "agent_blue_carry_walk_3"
    ],
    "fps": 8,
    "loop": true
  },
  "agent_blue_attack": {
    "frames": [
      "agent_blue_attack_0",
      "agent_blue_attack_1"
    ],
    "fps": 8,
    "loop": false
  },
  "agent_blue_stunned": {
    "frames": [
      "agent_blue_stunned_0"
    ],
    "fps": 1,
    "loop": true
  },
  "agent_red_idle": {
    "frames": [
      "agent_red_idle_0",
      "agent_red_idle_1",
      "agent_red_idle_2",
      "agent_red_idle_3"
    ],
    "fps": 4,
    "loop": true
  },
  "agent_red_walk": {
    "frames": [
      "agent_red_walk_0",
      "agent_red_walk_1",
      "agent_red_walk_2",
      "agent_red_walk_3"
    ],
    "fps": 8,
    "loop": true
  },
  "agent_red_carry_idle": {
    "frames": [
      "agent_red_carry_idle_0",
      "agent_red_carry_idle_1"
    ],
    "fps": 3,
    "loop": true
  },
  "agent_red_carry_walk": {
    "frames": [
      "agent_red_carry_walk_0",
      "agent_red_carry_walk_1",
      "agent_red_carry_walk_2",
      "agent_red_carry_walk_3"
    ],
    "fps": 8,
    "loop": true
  },
  "agent_red_attack": {
    "frames": [
      "agent_red_attack_0",
      "agent_red_attack_1"
    ],
    "fps": 8,
    "loop": false
  },
  "agent_red_stunned": {
    "frames": [
      "agent_red_stunned_0"
    ],
    "fps": 1,
    "loop": true
  },
  "relic_shimmer": {
    "frames": [
      "relic_0",
      "relic_1",
      "relic_2",
      "relic_3"
    ],
    "fps": 5,
    "loop": true
  },
  "base_blue_flag": {
    "frames": [
      "base_blue_0",
      "base_blue_1",
      "base_blue_2",
      "base_blue_3"
    ],
    "fps": 4,
    "loop": true
  },
  "base_red_flag": {
    "frames": [
      "base_red_0",
      "base_red_1",
      "base_red_2",
      "base_red_3"
    ],
    "fps": 4,
    "loop": true
  },
  "fire_loop": {
    "frames": [
      "fire_0",
      "fire_1",
      "fire_2",
      "fire_3"
    ],
    "fps": 7,
    "loop": true
  },
  "trap_trigger": {
    "frames": [
      "trap_trigger_0",
      "trap_trigger_1",
      "trap_trigger_2",
      "trap_trigger_3"
    ],
    "fps": 10,
    "loop": false
  },
  "fx_hit": {
    "frames": [
      "fx_hit_0",
      "fx_hit_1",
      "fx_hit_2",
      "fx_hit_3"
    ],
    "fps": 12,
    "loop": false
  },
  "fx_scan": {
    "frames": [
      "fx_scan_0",
      "fx_scan_1",
      "fx_scan_2",
      "fx_scan_3"
    ],
    "fps": 10,
    "loop": false
  },
  "fx_dash_blue": {
    "frames": [
      "fx_dash_blue_0",
      "fx_dash_blue_1",
      "fx_dash_blue_2",
      "fx_dash_blue_3"
    ],
    "fps": 12,
    "loop": false
  },
  "fx_dash_red": {
    "frames": [
      "fx_dash_red_0",
      "fx_dash_red_1",
      "fx_dash_red_2",
      "fx_dash_red_3"
    ],
    "fps": 12,
    "loop": false
  },
  "fx_dust": {
    "frames": [
      "fx_dust_0",
      "fx_dust_1",
      "fx_dust_2",
      "fx_dust_3"
    ],
    "fps": 8,
    "loop": false
  },
  "fx_spark_gold": {
    "frames": [
      "fx_spark_gold_0",
      "fx_spark_gold_1",
      "fx_spark_gold_2",
      "fx_spark_gold_3"
    ],
    "fps": 6,
    "loop": true
  },
  "fx_spark_blue": {
    "frames": [
      "fx_spark_blue_0",
      "fx_spark_blue_1",
      "fx_spark_blue_2",
      "fx_spark_blue_3"
    ],
    "fps": 10,
    "loop": false
  },
  "fx_spark_red": {
    "frames": [
      "fx_spark_red_0",
      "fx_spark_red_1",
      "fx_spark_red_2",
      "fx_spark_red_3"
    ],
    "fps": 10,
    "loop": false
  }
}),
});

function f(x, y, w, h) {
  return Object.freeze({ x, y, w, h });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
