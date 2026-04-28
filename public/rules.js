export const RULES = {
  goal: 'Carry the relic to your base. First capture wins. Sides swap each game; turn cap 40 → replay.',

  resolutionOrder: [
    { label: 'Heal / Scan / Dash setup', detail: 'Heals and scans apply. Dash spends 1 charge.' },
    { label: 'Movement', detail: 'Simultaneous. Same target → both blocked. Swap → both blocked.' },
    { label: 'Attack', detail: 'Range 1, after movement (so moving out of range dodges).' },
    { label: 'Damage applied', detail: 'Guard reduces by 2. Damage ≥3 forces relic drop.' },
    { label: 'Place wall / trap', detail: "Adjacent empty tile. Walls can't seal off relic or bases." },
    { label: 'Auto-pickup', detail: 'A free relic is picked up only by a single occupant.' },
  ],

  actionGroups: [
    {
      title: 'Movement',
      items: [
        { name: 'Move', sprite: null, effect: '1 tile, 4 directions.' },
        { name: 'Dash', sprite: 'tool_dash', effect: '2 tiles, 1 direction. Costs 1 dash. Not while carrying relic.' },
      ],
    },
    {
      title: 'Combat',
      items: [
        { name: 'Attack', sprite: null, effect: '2 dmg adjacent. +1 from bush, +1 vs relic carrier.' },
        { name: 'Guard', sprite: null, effect: 'Reduce incoming damage by 2 this turn.' },
      ],
    },
    {
      title: 'Utility',
      items: [
        { name: 'Heal', sprite: 'tool_heal', effect: '+3 HP. Costs 1 heal.' },
        { name: 'Scan', sprite: 'tool_scan', effect: 'Reveal traps and opponent in range 2. Costs 1 scan.' },
        { name: 'Drop Relic', sprite: null, effect: 'Drop the relic on your tile.' },
        { name: 'Wait', sprite: null, effect: 'Skip your turn.' },
      ],
    },
    {
      title: 'Placement',
      items: [
        { name: 'Place Wall', sprite: 'tool_wall', effect: 'Adjacent tile becomes impassable.' },
        { name: 'Place Trap', sprite: 'tool_trap', effect: 'Hidden trap, 3 dmg + cancels rest of enemy turn.' },
      ],
    },
  ],

  tiles: [
    { name: 'Wall', sprite: 'icon_wall', effect: 'Impassable.' },
    {
      name: 'Bush',
      sprite: 'icon_bush',
      effect: 'Hides you unless opponent in range 2 or you carry relic. +1 dmg to bush attacks.',
    },
    { name: 'Fire', sprite: 'icon_fire', effect: '-2 HP when you walk onto it.' },
    { name: 'Trap', sprite: 'icon_trap', effect: '-3 HP on enemy step, cancels rest of their turn. Hidden.' },
    { name: 'Relic', sprite: 'icon_relic', effect: 'The objective. Auto-pickup when alone on it.' },
  ],

  startingInventory: [
    { kind: 'wall', count: 2, sprite: 'tool_wall' },
    { kind: 'trap', count: 2, sprite: 'tool_trap' },
    { kind: 'scan', count: 1, sprite: 'tool_scan' },
    { kind: 'dash', count: 1, sprite: 'tool_dash' },
    { kind: 'heal', count: 1, sprite: 'tool_heal' },
  ],

  health: {
    max: 10,
    knockoutRespawn: 5,
    summary: '10 max HP. 0 HP = knocked out: skip a turn, respawn at base with 5 HP. Drop the relic if carrying.',
  },

  gotchas: [
    'Bush ambush bonus uses your start-of-turn position.',
    'Trap step converts the rest of your turn to WAIT (cancels dash step 2 and placements).',
    "0 HP isn't death — skip a turn, respawn at base with 5 HP.",
    'Turn 40 cap → game replays without counting toward the series.',
  ],
};
