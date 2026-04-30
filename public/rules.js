export const RULES = {
  goal: 'Carry the relic to your base. First capture wins. Your side (blue/red) is fixed for the entire series - it does NOT swap between games. Turn cap 100 → replay.',

  decisionTip:
    "Both sides submit actions in the blind, and they resolve in lockstep at each step below. Before choosing your action, predict your opponent's most likely action this turn and pick the response that beats it (or hedges against the top 2 candidates). Acting without modeling the opponent is how you walk into traps and whiff attacks.",


  resolutionOrder: [
    { label: 'Heal / Scan / Dash setup', detail: 'Heals and scans apply. Dash spends 1 charge. (You cannot heal AFTER seeing an attack land - heals resolve before damage.)' },
    { label: 'Movement', detail: "Both sides' moves resolve simultaneously. Same target → both blocked. Swap → both blocked. Pick your move assuming the opponent also moves this turn." },
    { label: 'Relic auto-pickup (post-move)', detail: 'A free relic is picked up by a sole occupant of its tile right after movement, BEFORE attacks resolve. So an attacker adjacent to the relic can damage the new carrier the same turn and force a drop.' },
    {
      label: 'Attack',
      detail:
        "Range 1 ORTHOGONAL only (N/S/E/W). Diagonal opponents are NOT in range. Resolved AFTER both sides move. Adjacency is checked at post-movement positions, so an opponent who moves away is out of range.",
    },
    { label: 'Damage applied', detail: 'Guard reduces by 2. Damage ≥3 forces relic drop.' },
    { label: 'Place wall / trap', detail: "Adjacent empty tile (orthogonal or diagonal). Walls can't seal off relic or bases. Traps are permanent." },
    { label: 'Buff pickup', detail: 'Buff tiles are picked up by a single occupant; consumed on pickup.' },
    { label: 'End-of-turn relic pickup', detail: 'Final pickup pass for relics dropped during this turn (e.g. on knockout).' },
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
        { name: 'Attack', sprite: null, effect: '2 dmg to opponent ORTHOGONALLY adjacent (N/S/E/W only - diagonals do NOT count). 5 dmg if you started in a bush. +1 vs relic carrier.' },
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
        { name: 'Place Wall', sprite: 'tool_wall', effect: 'Adjacent tile (orthogonal or diagonal) becomes impassable. Bushes are valid targets (the wall replaces the bush). Cannot target tiles that have a wall, trap, buff, the relic, a base, or a player.' },
        { name: 'Place Trap', sprite: 'tool_trap', effect: 'Hidden trap on adjacent tile (orthogonal or diagonal). 5 dmg, cancels rest of enemy turn, AND stuns them for their next turn (forced WAIT, no respawn). PERMANENT - stays armed and re-triggers on every enemy step. Bushes are valid targets (a trap hidden in a bush is especially sneaky). Cannot target tiles that have a wall, trap, buff, the relic, a base, or a player. Tip: if you can predict the opponent\'s next move, place a trap on their path to cause damage.' },
      ],
    },
  ],

  tiles: [
    { name: 'Wall', sprite: 'icon_wall', effect: 'Impassable.' },
    {
      name: 'Bush',
      sprite: 'icon_bush',
      effect: 'Hides you unless opponent in range 2 or you carry relic. Attacks from a bush deal 5 dmg.',
    },
    { name: 'Fire', sprite: 'icon_fire', effect: '-2 HP when you walk onto it.' },
    { name: 'Trap', sprite: 'icon_trap', effect: '-5 HP on enemy step, cancels rest of their turn, and stuns them for their next turn (forced WAIT). Hidden. PERMANENT - re-triggers on every enemy step.' },
    { name: 'Relic', sprite: 'icon_relic', effect: 'The objective. Auto-pickup when alone on it.' },
    {
      name: 'Dash Pack',
      sprite: null,
      effect: 'Buff tile. Step on alone to gain +3 dash charges (cap 5). Consumed on pickup.',
    },
    {
      name: 'Big Heal',
      sprite: null,
      effect: 'Buff tile. Step on alone to restore HP to full. Consumed on pickup, even if already at full.',
    },
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
    'A trap you placed deals 5 damage to the enemy who steps on it, forces the rest of their turn to WAIT (their dash step 2 and any placements are canceled), AND stuns them for their NEXT turn (forced WAIT - they cannot move, attack, or place anything; they stay on the trap tile). Traps are PERMANENT - they stay armed and re-trigger on every future enemy step.',
    'ATTACK only hits opponents in the 4 orthogonal tiles (N/S/E/W). A diagonally adjacent opponent is NOT in range; move or wait for a 4-direction adjacency first.',
    "0 HP isn't death — skip a turn, respawn at base with 5 HP.",
    'Turn 100 cap → game replays without counting toward the series.',
    'Movement resolves before attacks. An opponent that moves out of adjacency dodges your ATTACK that turn.',
    "Movement is simultaneous, not reactive. Decide your action by predicting the opponent's move first - if you ATTACK their current tile, they may have already stepped away.",
    'Each turn has a 300s deadline (see Timer in the header). If you do not POST an action in time, the server forces WAIT for you. Decide quickly - over-thinking forfeits the turn.',
  ],
};
