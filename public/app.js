import {
  drawDetailedFloor,
  palette,
} from './assets/pixel-assets.js?v=detailed-atlas-128-clean-floor';
import { AGENT_DUEL_ATLAS } from './assets/sprite-atlas.js?v=production-atlas-2048-v1';
import {
  buildTerrainSprites,
} from './assets/terrain-layout.js?v=detailed-atlas-128-clean-floor';
import { RULES } from './rules.js?v=1';

const params = new URLSearchParams(window.location.search);
const playerParam = params.get('player') ?? 'spectate';
const role = playerParam === '1' ? 'player_1' : playerParam === '2' ? 'player_2' : playerParam;
const name = params.get('name') ?? '';
const state = {
  ws: null,
  role,
  latest: null,
  lastStateFingerprint: null,
  selectedAction: null,
  xray: localStorage.getItem('xray') === 'true',
  boardRenderer: null,
  spectatorResizeBound: false,
  playerCountdownTimer: null,
  playerCountdownTurn: null,
  playerCountdownEndsAt: 0,
  playerTurnKey: null,
  iAmReady: false,
};

const appEl = document.getElementById('app');
const WIN_CONDITION_ICON_SCALE = 0.62;
const WIN_CONDITION_BASE_SCALE = 0.82;
connect();

function connect() {
  const wsUrl = new URL('/ws', window.location.href);
  wsUrl.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  wsUrl.searchParams.set('player', playerParam);
  if (name) wsUrl.searchParams.set('name', name);
  state.ws = new WebSocket(wsUrl);
  state.ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'state') {
      const fingerprint = stateFingerprint(message);
      if (fingerprint === state.lastStateFingerprint) return;
      state.lastStateFingerprint = fingerprint;
      state.latest = message;
      render();
    } else if (message.type === 'validation_error') {
      setError(message.error);
    } else if (message.type === 'action_locked') {
      setError(message.reason ? `Locked as WAIT: ${message.reason}` : 'Action locked. Waiting for opponent.');
    } else if (message.type === 'error') {
      setError(message.error);
    }
  });
  state.ws.addEventListener('close', () => {
    setTimeout(connect, 800);
  });
}

function stateFingerprint(message) {
  if (message.role !== 'spectate') return JSON.stringify(message);
  const normalized = JSON.parse(JSON.stringify(message));
  delete normalized.state?.turn_timer_seconds_remaining;
  delete normalized.state?.timer_seconds_remaining;
  return JSON.stringify(normalized);
}

function render() {
  const message = state.latest;
  if (!message) return;
  if (message.role === 'admin') renderAdmin(message.state);
  else if (message.role === 'spectate') renderSpectator(message.state);
  else renderPlayer(message.state);
}

function renderShell(title, subtitle, content, pills = [], options = {}) {
  const header = options.showHeader === false ? '' : `
    <header class="topbar pixel-panel">
      <div class="brand">
        <div class="brand-mark"></div>
        <div>
          <h1 class="title">${escapeHtml(title)}</h1>
          <div class="subtitle">${escapeHtml(subtitle)}</div>
        </div>
      </div>
      <div class="pill-row">${pills.map((pill) => `<span class="pill ${pill.tone ?? ''}">${escapeHtml(pill.text)}</span>`).join('')}</div>
    </header>
  `;
  appEl.className = `app ${options.appClass ?? ''}`.trim();
  appEl.innerHTML = `
    ${header}
    ${content}
  `;
}

function renderPlayer(view) {
  const isLobby = view.phase === 'pre_lobby' || view.phase === 'lobby';
  if (isLobby) {
    renderBriefing(view);
    return;
  }
  const side = view.side;
  const actionLocked = view.action_locked || view.paused || view.phase !== 'awaiting_action';
  const turnKey = `${view.match?.game_number ?? 1}:${view.turn}`;
  if (state.playerTurnKey !== turnKey) {
    state.playerTurnKey = turnKey;
    state.selectedAction = null;
  }
  renderShell(
    'AGENT DUEL',
    `${view.player_name} - you are ${side.toUpperCase()}`,
    `
      <main class="layout arcade-layout player-layout">
        <section class="panel pixel-panel stack player-info-panel">
          ${statusPanel('You', view.you, side)}
          ${opponentPanel(view.opponent, side === 'blue' ? 'red' : 'blue')}
        </section>
        <section class="panel pixel-panel board-panel">
          <div class="turn-state-banner ${actionLocked ? 'waiting' : 'active'}">${turnStateText(view)}</div>
          <div id="board" class="board-wrap"></div>
        </section>
        <section class="panel pixel-panel action-panel">
          <div class="panel-header">
            <h2 class="panel-title">Legal Actions</h2>
            <span class="pill gold" data-countdown>${view.turn_timer_seconds_remaining ?? '-'}s</span>
          </div>
          <div class="panel-body stack">
            <div class="action-grid">
              ${view.legal_actions.map((action) => actionButton(action, actionLocked)).join('')}
            </div>
            <div class="panel pixel-panel submit-panel">
              <div class="panel-header"><h2 class="panel-title">Submit Action</h2></div>
              <div class="panel-body stack">
                <input id="intent" maxlength="140" placeholder="Required thought">
                <div class="submit-row"><span class="submit-hint">Required</span><button id="submit">Submit</button></div>
                <div id="error" class="error"></div>
              </div>
            </div>
          </div>
        </section>
      </main>
      ${view.paused ? pausedOverlay() : ''}
    `,
    [
      { text: formatGameCount(view.match), tone: 'gold' },
      { text: `Turn ${view.turn}` },
      { text: view.relic.status.replaceAll('_', ' '), tone: 'gold' },
    ],
    { appClass: 'player-app arcade-app' },
  );
  hydrateBoard(viewToBoard(view), { legalActions: view.legal_actions, side });
  for (const button of document.querySelectorAll('[data-action]')) {
    button.addEventListener('click', () => {
      state.selectedAction = JSON.parse(button.dataset.action);
      render();
    });
  }
  const submit = document.getElementById('submit');
  const intent = document.getElementById('intent');
  const updateSubmitState = () => {
    if (submit) submit.disabled = actionLocked || !state.selectedAction || !intent?.value.trim();
  };
  updateSubmitState();
  intent?.addEventListener('input', updateSubmitState);
  submit?.addEventListener('click', () => {
    const intentText = intent?.value.trim();
    if (!intentText) {
      setError('Thought is required before submitting an action.');
      updateSubmitState();
      return;
    }
    state.ws.send(JSON.stringify({
      type: 'submit_action',
      action: {
        ...state.selectedAction,
        intent_summary: intentText.split(/\s+/).slice(0, 20).join(' '),
      },
    }));
  });
  startPlayerCountdown(view.turn_timer_seconds_remaining);
}

function renderBriefing(view) {
  const side = view.side;
  const otherSide = side === 'blue' ? 'red' : 'blue';
  const playerName = view.player_name || `Player ${view.slot === 'player_1' ? '1' : '2'}`;
  const ready = state.iAmReady;
  renderShell(
    'AGENT DUEL',
    `${playerName} — you are ${side.toUpperCase()}`,
    `
      <main class="briefing arcade-layout">
        <section class="briefing-hero panel pixel-panel ${side}">
          <div class="briefing-hero-text">
            <span class="briefing-eyebrow">Briefing</span>
            <h2 class="briefing-title">Capture the Relic</h2>
            <p class="briefing-goal">${escapeHtml(RULES.goal)}</p>
          </div>
          <div class="briefing-hero-art">
            ${spriteMarkup(`agent_${side}_idle_0`, 1.4, `briefing-agent ${side}`)}
            <div class="briefing-vs">vs</div>
            ${spriteMarkup(`agent_${otherSide}_idle_0`, 1.4, `briefing-agent ${otherSide}`)}
          </div>
        </section>

        <section class="briefing-grid">
          <div class="briefing-col briefing-col-left">
            <article class="panel pixel-panel briefing-section">
              <div class="panel-header"><h3 class="panel-title">Each Turn Resolves In Order</h3></div>
              <div class="panel-body">
                <ol class="briefing-order">
                  ${RULES.resolutionOrder.map((step, i) => `
                    <li>
                      <span class="briefing-order-num">${i + 1}</span>
                      <div>
                        <strong>${escapeHtml(step.label)}</strong>
                        <p>${escapeHtml(step.detail)}</p>
                      </div>
                    </li>
                  `).join('')}
                </ol>
              </div>
            </article>

            <article class="panel pixel-panel briefing-section">
              <div class="panel-header"><h3 class="panel-title">Tiles</h3></div>
              <div class="panel-body">
                <ul class="briefing-list">
                  ${RULES.tiles.map((tile) => `
                    <li>
                      ${tile.sprite ? spriteMarkup(tile.sprite, 0.5, 'briefing-icon') : '<span class="briefing-icon-placeholder"></span>'}
                      <div>
                        <strong>${escapeHtml(tile.name)}</strong>
                        <p>${escapeHtml(tile.effect)}</p>
                      </div>
                    </li>
                  `).join('')}
                </ul>
              </div>
            </article>
          </div>

          <div class="briefing-col briefing-col-center">
            <article class="panel pixel-panel briefing-section briefing-map-card">
              <div class="panel-header"><h3 class="panel-title">Starting Layout</h3></div>
              <div class="panel-body briefing-map-body">
                <div id="board" class="board-wrap briefing-board"></div>
                <p class="briefing-map-caption">You spawn on the ${side.toUpperCase()} side. The relic starts at ${escapeHtml(view.relic?.position ?? '?')}.</p>
              </div>
            </article>

            <article class="panel pixel-panel briefing-section briefing-gotchas">
              <div class="panel-header"><h3 class="panel-title">Things People Get Wrong</h3></div>
              <div class="panel-body">
                <ul class="briefing-gotcha-list">
                  ${RULES.gotchas.map((g) => `<li>${escapeHtml(g)}</li>`).join('')}
                </ul>
              </div>
            </article>
          </div>

          <div class="briefing-col briefing-col-right">
            <article class="panel pixel-panel briefing-section">
              <div class="panel-header"><h3 class="panel-title">Actions</h3></div>
              <div class="panel-body briefing-actions">
                ${RULES.actionGroups.map((group) => `
                  <div class="briefing-action-group">
                    <h4>${escapeHtml(group.title)}</h4>
                    <ul class="briefing-list">
                      ${group.items.map((item) => `
                        <li>
                          ${item.sprite ? spriteMarkup(briefingSpriteFor(item.sprite, side), 0.46, 'briefing-icon') : '<span class="briefing-icon-placeholder"></span>'}
                          <div>
                            <strong>${escapeHtml(item.name)}</strong>
                            <p>${escapeHtml(item.effect)}</p>
                          </div>
                        </li>
                      `).join('')}
                    </ul>
                  </div>
                `).join('')}
              </div>
            </article>

            <article class="panel pixel-panel briefing-section">
              <div class="panel-header"><h3 class="panel-title">You Start With</h3></div>
              <div class="panel-body">
                <div class="briefing-inventory">
                  ${RULES.startingInventory.map((item) => `
                    <div class="briefing-inv-chip">
                      ${spriteMarkup(briefingSpriteFor(item.sprite, side), 0.5)}
                      <strong>x${item.count}</strong>
                      <span>${escapeHtml(item.kind.toUpperCase())}</span>
                    </div>
                  `).join('')}
                </div>
                <p class="briefing-health">${escapeHtml(RULES.health.summary)}</p>
              </div>
            </article>
          </div>
        </section>

        <section class="briefing-cta panel pixel-panel ${side}">
          ${ready
            ? `<div class="briefing-waiting"><span class="briefing-spinner" aria-hidden="true"></span><strong>Waiting for opponent…</strong><p>The match starts the moment they hit Ready.</p></div>`
            : `<div class="briefing-cta-text"><strong>Read the briefing, then jump in.</strong><p>Once both sides are ready, the match starts and the rest of the page becomes the gameplay HUD.</p></div>
               <button id="ready" class="briefing-ready ${side}">Ready</button>`
          }
        </section>
      </main>
    `,
    [
      { text: formatGameCount(view.match), tone: 'gold' },
      { text: `You are ${side.toUpperCase()}` },
      { text: ready ? 'WAITING' : 'BRIEFING' },
    ],
    { appClass: 'player-app arcade-app briefing-app' },
  );

  hydrateBoard(viewToBoard(view), { side });

  document.getElementById('ready')?.addEventListener('click', () => {
    state.iAmReady = true;
    state.ws.send(JSON.stringify({ type: 'ready' }));
    render();
  });
}

function briefingSpriteFor(spriteName, side) {
  if (!spriteName) return null;
  if (spriteName.startsWith('tool_')) return spriteName.replace('tool_', `tool_${side}_`);
  return spriteName;
}

function renderSpectator(view) {
  const board = view.full_board_state;
  const bluePlayer = board.players.blue;
  const redPlayer = board.players.red;
  const waiting = view.phase === 'pre_lobby' || view.phase === 'lobby';
  renderShell(
    'AGENT DUEL',
    'Capture the Relic',
    waiting ? waitingSpectator(view) : `
      <main class="spectator-layout spectator-hud">
        <section class="broadcast-title">
          <div class="broadcast-rule pixel-panel">${escapeHtml(formatGameCount(view.match))}<span class="broadcast-score">Score ${escapeHtml(scoreText(view.match, board))}</span></div>
          <div>
            <h2>AGENT DUEL</h2>
            <div class="series-score">
              <span>SERIES SCORE</span>
              <strong class="blue-score">${scoreForSide(view.match, board, 'blue')}</strong>
              <b>-</b>
              <strong class="red-score">${scoreForSide(view.match, board, 'red')}</strong>
            </div>
          </div>
          <div class="broadcast-rule pixel-panel">Turn ${view.turn}</div>
        </section>
        <section class="story-banner pixel-panel">
          ${spriteMarkup('relic_0', 0.72, 'story-relic')}
          <strong>${escapeHtml(storyBannerText(board))}</strong>
        </section>
        ${spectatorPlayerPanel('blue', bluePlayer)}
        <section class="board-frame pixel-panel">
          <div class="axis top-axis">${axisLabels('A', 'I')}</div>
          <div id="board" class="board-wrap broadcast-board"></div>
          <div class="axis bottom-axis">${axisLabels('A', 'I')}</div>
        </section>
        ${spectatorPlayerPanel('red', redPlayer)}
        <section class="lower-hud">
          <div class="hud-card pixel-panel event-hud">
            <h3>What Just Happened</h3>
            <div class="event-list">${eventList(view.public_events)}</div>
          </div>
          <div class="hud-card pixel-panel win-hud">
            <h3>Win Condition</h3>
            <div class="win-icons">
              ${winConditionIcons()}
            </div>
            <p>Bring the relic back to your base.</p>
          </div>
          <div class="hud-card pixel-panel legend-hud">
            <h3>Legend</h3>
            ${legendGrid()}
          </div>
        </section>
      </main>
      ${view.paused ? pausedOverlay() : ''}
    `,
    [
      { text: view.match.format, tone: 'gold' },
      { text: `Score ${scoreText(view.match, board)}` },
      { text: `Game ${view.match.game_number}` },
      { text: `Turn ${view.turn}` },
    ],
    { showHeader: false, appClass: 'spectator-app' },
  );
  fitSpectatorViewport();
  if (waiting) {
    hydrateBoard(board, { xray: true });
  } else {
    hydrateBoard(board, { xray: state.xray });
  }
}

function fitSpectatorViewport() {
  const layout = document.querySelector('.spectator-hud');
  if (!layout) return;
  const updateScale = () => {
    const scale = Math.min(window.innerWidth / 1792, window.innerHeight / 1000);
    document.documentElement.style.setProperty('--spectator-scale', scale.toFixed(4));
  };
  updateScale();
  if (!state.spectatorResizeBound) {
    window.addEventListener('resize', updateScale);
    state.spectatorResizeBound = true;
  }
}

function turnStateText(view) {
  if (view.paused) return 'PAUSED';
  if (view.action_locked) return 'WAITING FOR OPPONENT';
  if (view.phase === 'awaiting_action') return 'YOUR TURN';
  if (view.phase === 'pre_lobby' || view.phase === 'lobby') return 'LOBBY';
  return 'WAITING FOR OPPONENT';
}

function startPlayerCountdown(initialSeconds) {
  const countdown = document.querySelector('[data-countdown]');
  if (!countdown) {
    clearInterval(state.playerCountdownTimer);
    state.playerCountdownTimer = null;
    return;
  }
  const seconds = initialSeconds == null ? NaN : Number(initialSeconds);
  const turn = state.latest?.state?.turn ?? 0;
  if (Number.isFinite(seconds) && state.playerCountdownTurn !== turn) {
    state.playerCountdownTurn = turn;
    state.playerCountdownEndsAt = Date.now() + seconds * 1000;
  }
  const update = () => {
    if (!Number.isFinite(seconds)) {
      countdown.textContent = '-s';
      return;
    }
    const remaining = Math.max(0, Math.ceil((state.playerCountdownEndsAt - Date.now()) / 1000));
    countdown.textContent = `${remaining}s`;
  };
  update();
  clearInterval(state.playerCountdownTimer);
  state.playerCountdownTimer = setInterval(update, 250);
}

function scoreText(match, board) {
  return `${scoreForSide(match, board, 'blue')}-${scoreForSide(match, board, 'red')}`;
}

function renderAdmin(view) {
  renderShell(
    'Agent Duel Admin',
    'Operator controls',
    `
      <main class="admin-layout arcade-layout">
        <section class="panel pixel-panel">
          <div class="panel-header"><h2 class="panel-title">Series</h2></div>
          <div class="panel-body stack">
            <div class="radio-row">
              ${[1, 3, 5, 7].map((n) => `<button data-admin="set_series_length" data-best-of="${n}" class="${view.match.format === `BO${n}` ? 'active' : ''}" ${view.lobby.series_locked ? 'disabled' : ''}>BO${n}</button>`).join('')}
            </div>
            <div class="status-grid">
              ${slotStat('Slot 1', view.lobby.slots.player_1)}
              ${slotStat('Slot 2', view.lobby.slots.player_2)}
            </div>
            <div class="control-grid">
              <button data-admin="pause">Pause</button>
              <button data-admin="resume">Resume</button>
              <button data-admin="restart_game">Restart Game</button>
              <button data-admin="restart_series">Restart Series</button>
              <button data-admin="next_game">Next Game</button>
            </div>
          </div>
        </section>
        <section class="panel pixel-panel">
          <div class="panel-header"><h2 class="panel-title">Diagnostics</h2></div>
          <div class="panel-body stack">
            <pre>${escapeHtml(JSON.stringify(view.diagnostics, null, 2))}</pre>
            <div id="board" class="board-wrap"></div>
          </div>
        </section>
      </main>
      ${view.paused ? pausedOverlay() : ''}
    `,
    [
      { text: view.phase },
      { text: view.match.format, tone: 'gold' },
      { text: `Score ${view.match.score.player_1 ?? 0}-${view.match.score.player_2 ?? 0}` },
    ],
    { appClass: 'admin-app arcade-app' },
  );
  hydrateBoard(view.current_game.full_board_state, { xray: true });
  for (const button of document.querySelectorAll('[data-admin]')) {
    button.addEventListener('click', () => {
      state.ws.send(JSON.stringify({
        type: 'admin',
        action: button.dataset.admin,
        ...(button.dataset.bestOf ? { bestOf: Number(button.dataset.bestOf) } : {}),
      }));
    });
  }
}

function hydrateBoard(boardState, options = {}) {
  const target = document.getElementById('board');
  if (!target || !window.PIXI) return;
  const nextSize = Math.floor(target.getBoundingClientRect().width || 600);
  if (!state.boardRenderer || state.boardRenderer.size !== nextSize) {
    state.boardRenderer?.destroy();
    state.boardRenderer = new BoardRenderer(target, nextSize);
  } else {
    state.boardRenderer.attach(target);
  }
  state.boardRenderer.draw(boardState, options);
}

class BoardRenderer {
  constructor(target, size) {
    this.target = target;
    this.size = size;
    this.animatedActors = [];
    this.tick = this.tick.bind(this);
    this.app = new PIXI.Application();
    this.ready = this.app.init({
      width: this.size,
      height: this.size,
      background: palette.background,
      antialias: false,
      resolution: 1,
    }).then(() => {
      this.atlas = new SpriteAtlas();
      this.floorLayer = new PIXI.Container();
      this.terrainLayer = new PIXI.Container();
      this.relicGroundLayer = new PIXI.Container();
      this.highlightLayer = new PIXI.Container();
      this.agentLayer = new PIXI.Container();
      this.carriedRelicLayer = new PIXI.Container();
      this.fxLayer = new PIXI.Container();
      this.uiLayer = new PIXI.Container();
      this.app.stage.addChild(
        this.floorLayer,
        this.terrainLayer,
        this.relicGroundLayer,
        this.highlightLayer,
        this.agentLayer,
        this.carriedRelicLayer,
        this.fxLayer,
        this.uiLayer,
      );
      this.app.ticker.add(this.tick);
      this.attach(target);
      return this.atlas.ready;
    });
  }

  attach(target) {
    this.target = target;
    target.innerHTML = '';
    if (this.app.canvas && this.app.canvas.parentElement !== target) {
      target.appendChild(this.app.canvas);
    }
  }

  destroy() {
    this.app.ticker.remove(this.tick);
    this.app.destroy(true);
  }

  async draw(board, options) {
    await this.ready;
    this.floorLayer.removeChildren();
    this.terrainLayer.removeChildren();
    this.relicGroundLayer.removeChildren();
    this.highlightLayer.removeChildren();
    this.agentLayer.removeChildren();
    this.carriedRelicLayer.removeChildren();
    this.fxLayer.removeChildren();
    this.uiLayer.removeChildren();
    this.animatedActors = [];
    const cell = this.size / 9;
    for (let row = 1; row <= 9; row += 1) {
      for (let col = 0; col < 9; col += 1) {
        const coord = `${String.fromCharCode(65 + col)}${row}`;
        const x = col * cell;
        const y = (row - 1) * cell;
        const floor = new PIXI.Graphics();
        drawDetailedFloor(floor, x, y, cell, row + col);
        this.floorLayer.addChild(floor);
      }
    }
    for (const sprite of buildRenderList(board, options)) {
      drawSpriteAt(sprite, cell, (x, y) => {
        if (sprite.kind === 'base') this.addWorldActor(this.terrainLayer, x, y, sprite, { animationName: sprite.animationName, width: cell, height: cell, anchor: [0, 0], animationKind: 'base' });
        if (sprite.kind === 'bush') this.addAtlasSprite(this.terrainLayer, sprite.frame, x, y, { width: cell, height: cell, anchor: [0, 0] });
        if (sprite.kind === 'fire') this.addWorldActor(this.terrainLayer, x + cell * 0.5, y + cell * 0.98, sprite, { animationName: 'fire_loop', height: cell * 0.86, animationKind: 'fire' });
        if (sprite.kind === 'wall') this.addAtlasSprite(this.terrainLayer, sprite.frame, x, y, { width: cell, height: cell, anchor: [0, 0] });
        if (sprite.kind === 'trap') this.addWorldActor(this.terrainLayer, x, y, sprite, { frameName: sprite.hidden ? 'trap_hidden' : 'trap_armed', width: cell, height: cell, anchor: [0, 0], animationKind: sprite.hidden ? 'static' : 'trap' });
        if (sprite.kind === 'relic') this.addWorldActor(this.relicGroundLayer, x + cell * 0.5, y + cell * 0.74, sprite, { animationName: 'relic_shimmer', height: cell * 0.66, animationKind: 'relic' });
        if (sprite.kind === 'hero') this.addWorldActor(this.agentLayer, x + cell * 0.5, y + cell * 1.02, sprite, { animationName: agentAnimationName(sprite.side, sprite.carrying), height: cell * 1.08, animationKind: 'hero' });
      });
    }
    for (const action of options.legalActions ?? []) {
      if (action.target) {
        drawAt(action.target, cell, (x, y) => {
          const ui = new PIXI.Graphics();
          ui.rect(x + 8, y + 8, cell - 16, cell - 16).stroke({ width: 3, color: palette.highlight, alpha: 0.8 });
          this.highlightLayer.addChild(ui);
        });
      }
    }
  }

  addAtlasSprite(layer, frameName, x, y, options = {}) {
    const sprite = this.atlas.createSprite(frameName);
    positionAndScaleSprite(sprite, this.atlas.frame(frameName), x, y, options);
    layer.addChild(sprite);
    return sprite;
  }

  addWorldActor(layer, x, y, spriteData, { frameName, animationName, width, height, anchor, animationKind }) {
    const animation = animationName ? AGENT_DUEL_ATLAS.animations[animationName] : null;
    const firstFrame = frameName ?? animation.frames[0];
    const sprite = this.addAtlasSprite(layer, firstFrame, x, y, { width, height, anchor });
    sprite.baseX = x;
    sprite.baseY = y;
    sprite.targetHeight = height;
    sprite.animationKind = animationKind;
    sprite.phase = (coordPoint(spriteData.coord).x * 0.47) + (coordPoint(spriteData.coord).y * 0.71);
    sprite.animation = animation;
    sprite.animationName = animationName;
    sprite.hiddenInBush = Boolean(spriteData.hiddenInBush);
    if (animationKind !== 'static') this.animatedActors.push(sprite);
    return sprite;
  }

  tick(now = performance.now()) {
    const frameNow = typeof now === 'number' ? now : performance.now();
    const time = frameNow / 1000;
    for (const actor of this.animatedActors) {
      const t = time + actor.phase;
      actor.x = actor.baseX;
      actor.y = actor.baseY;
      actor.alpha = 1;
      actor.scale.set(actor.baseScale);
      if (actor.animation) {
        const frameIndex = Math.floor(t * actor.animation.fps) % actor.animation.frames.length;
        const nextFrame = actor.animation.frames[frameIndex];
        if (actor.currentFrame !== nextFrame) {
          actor.texture = this.atlas.texture(nextFrame);
          actor.currentFrame = nextFrame;
          rescaleAnimatedSprite(actor, this.atlas.frame(nextFrame));
        }
      }
      if (actor.animationKind === 'hero') {
        actor.scale.set(actor.baseScale);
        actor.y = actor.baseY + Math.sin(t * 4.4) * 1.4;
        actor.alpha = actor.hiddenInBush ? 0.5 : 1;
      } else if (actor.animationKind === 'relic') {
        const pulse = 1 + Math.sin(t * 3.6) * 0.045;
        actor.y = actor.baseY + Math.sin(t * 2.8) * 2;
        actor.alpha = 0.9 + Math.sin(t * 5.2) * 0.1;
        actor.scale.set(actor.baseScale * pulse);
      } else if (actor.animationKind === 'trap') {
        actor.scale.set(actor.baseScale);
        actor.alpha = 0.74 + Math.sin(t * 5.8) * 0.2;
      } else if (actor.animationKind === 'foliage') {
        actor.scale.set(actor.baseScale);
        actor.x = actor.baseX + Math.sin(t * 1.8) * 0.7;
        actor.y = actor.baseY + Math.sin(t * 2.1) * 0.35;
      } else if (actor.animationKind === 'fire') {
        actor.scale.set(actor.baseScale * (1 + Math.sin(t * 8.2) * 0.03));
      }
    }
  }
}

class SpriteAtlas {
  constructor() {
    this.textures = new Map();
    this.ready = this.load();
  }

  async load() {
    this.baseTexture = await PIXI.Assets.load(AGENT_DUEL_ATLAS.image);
    configureAtlasTexture(this.baseTexture);
    for (const [name, frame] of Object.entries(AGENT_DUEL_ATLAS.frames)) {
      const texture = new PIXI.Texture({
        source: this.baseTexture,
        frame: new PIXI.Rectangle(frame.x, frame.y, frame.w, frame.h),
      });
      texture.frame = new PIXI.Rectangle(frame.x, frame.y, frame.w, frame.h);
      texture.orig = new PIXI.Rectangle(0, 0, frame.w, frame.h);
      texture.updateUvs?.();
      configureAtlasTexture(texture);
      this.textures.set(name, texture);
    }
  }

  texture(name) {
    return this.textures.get(name);
  }

  frame(name) {
    return AGENT_DUEL_ATLAS.frames[name];
  }

  createSprite(name) {
    const sprite = new PIXI.Sprite(this.texture(name));
    sprite.texture.source.scaleMode = 'nearest';
    sprite.roundPixels = true;
    sprite.currentFrame = name;
    return sprite;
  }
}

function configureAtlasTexture(texture) {
  if (!texture) return;
  if (texture.source) {
    texture.source.scaleMode = 'nearest';
    texture.source.autoGenerateMipmaps = false;
    texture.source.mipmap = false;
    texture.source.wrapMode = 'clamp';
    texture.source.addressMode = 'clamp-to-edge';
  }
  if (texture.baseTexture) {
    texture.baseTexture.scaleMode = PIXI.SCALE_MODES?.NEAREST ?? 'nearest';
    texture.baseTexture.mipmap = PIXI.MIPMAP_MODES?.OFF ?? false;
    texture.baseTexture.wrapMode = PIXI.WRAP_MODES?.CLAMP ?? 'clamp';
  }
}

function positionAndScaleSprite(sprite, frame, x, y, options = {}) {
  const anchor = options.anchor ?? [0.5, 1];
  sprite.anchor.set(anchor[0], anchor[1]);
  sprite.x = Math.round(x);
  sprite.y = Math.round(y);
  const scale = options.width && options.height
    ? Math.min(options.width / frame.w, options.height / frame.h)
    : options.width
      ? options.width / frame.w
      : options.height
        ? options.height / frame.h
        : 1;
  sprite.scale.set(scale);
  sprite.baseScale = scale;
}

function rescaleAnimatedSprite(actor, frame) {
  if (!actor.targetHeight) return;
  actor.baseScale = actor.targetHeight / frame.h;
  actor.scale.set(actor.baseScale);
}

function buildRenderList(board, options) {
  const sprites = [];
  const push = (coord, kind, data = {}) => {
    const { x, y } = coordPoint(coord);
    sprites.push({ coord, kind, depth: y * 10 + x + (data.depthOffset ?? 0), ...data });
  };
  for (const coord of board.bases.blue) push(coord, 'base', { animationName: 'base_blue_flag', depthOffset: 0.02 });
  for (const coord of board.bases.red) push(coord, 'base', { animationName: 'base_red_flag', depthOffset: 0.02 });
  sprites.push(...buildTerrainSprites(board.bushes, 'bush'));
  for (const coord of board.fire ?? []) push(coord, 'fire', { depthOffset: 0.14 });
  sprites.push(...buildTerrainSprites(board.walls, 'wall'));
  for (const trap of board.traps ?? []) {
    if (trap.visible || options.xray) push(trap.coord, 'trap', { hidden: !options.xray && !trap.visible, depthOffset: 0.08 });
  }
  if (board.relic?.position) push(board.relic.position, 'relic', { depthOffset: 0.1 });
  for (const side of ['blue', 'red']) {
    const player = board.players[side];
    if (player?.position) {
      push(player.position, 'hero', {
        side,
        carrying: player.carrying_relic,
        stunned: player.stunned,
        hiddenInBush: player.hidden_in_bush ?? player.hiddenInBush,
        depthOffset: 0.36,
      });
    }
  }
  return sprites.sort((a, b) => a.depth - b.depth);
}

function agentAnimationName(side, carrying) {
  if (side === 'blue' && carrying) return 'agent_blue_carry_idle';
  if (side === 'blue') return 'agent_blue_idle';
  if (carrying) return 'agent_red_carry_idle';
  return 'agent_red_idle';
}

function drawAt(coord, cell, draw) {
  const { x, y } = coordPoint(coord);
  draw(x * cell, y * cell);
}

function drawSpriteAt(sprite, cell, draw) {
  if (sprite.position) {
    draw(sprite.position.x * cell, sprite.position.y * cell);
  } else {
    drawAt(sprite.coord, cell, draw);
  }
}

function coordPoint(coord) {
  return { x: coord.charCodeAt(0) - 65, y: Number(coord.slice(1)) - 1 };
}

function viewToBoard(view) {
  const traps = [
    ...view.known_tiles.own_traps.map((coord) => ({ coord, owner: view.side, visible: true })),
    ...view.known_tiles.known_enemy_traps.map((coord) => ({ coord, owner: view.side === 'blue' ? 'red' : 'blue', visible: true })),
  ];
  return {
    size: 9,
    bases: { blue: ['A4', 'A5', 'A6'], red: ['I4', 'I5', 'I6'] },
    walls: view.known_tiles.walls,
    bushes: view.known_tiles.bushes,
    fire: view.known_tiles.fire,
    traps,
    relic: { position: view.relic.position },
    players: {
      [view.side]: {
        position: view.you.position,
        carrying_relic: view.you.carrying_relic,
        stunned: view.you.stunned,
        hiddenInBush: false,
      },
      [view.side === 'blue' ? 'red' : 'blue']: {
        position: view.opponent.visible ? view.opponent.position : null,
        carrying_relic: view.opponent.carrying_relic,
        stunned: false,
        hiddenInBush: false,
      },
    },
  };
}

function actionButton(action, disabled) {
  const selected = state.selectedAction && JSON.stringify(state.selectedAction) === JSON.stringify(action);
  const label = action.target ? `${action.action_type.replace('_', ' ')} ${action.target}` : action.action_type.replaceAll('_', ' ');
  return `<button data-action="${escapeHtml(JSON.stringify(action))}" class="${selected ? 'selected' : ''}" ${disabled ? 'disabled' : ''}>${escapeHtml(label)}</button>`;
}

function formatGameCount(match) {
  const bestOf = (match.best_of ?? Number(String(match.format ?? 'BO1').replace('BO', ''))) || 1;
  return `GAME ${match.game_number} / ${bestOf}`;
}

function scoreForSide(match, board, side) {
  const slot = board.players[side]?.slot;
  return match.score?.[slot] ?? 0;
}

function storyBannerText(board) {
  const carrier = board.relic?.carriedBy;
  if (carrier && board.players[carrier]?.position) {
    const distance = nearestBaseDistance(board.players[carrier].position, board.bases[carrier]);
    if (carrier === 'blue') return `Codex Blue Has The Relic - ${distance} Tiles From Home`;
    return `Codex Red Has The Relic - ${distance} Tiles From Home`;
  }
  if (board.relic?.position) return `The Relic Is Loose At ${board.relic.position} - Both Agents Are Closing In`;
  return 'The Relic Is Contested - Both Agents Are Looking For The Handoff';
}

function nearestBaseDistance(coord, bases) {
  const point = coordPoint(coord);
  return Math.min(...bases.map((base) => {
    const target = coordPoint(base);
    return Math.abs(point.x - target.x) + Math.abs(point.y - target.y);
  }));
}

function agentName(side) {
  return side === 'blue' ? 'Codex Blue' : 'Codex Red';
}

function spriteMarkup(frameName, scale = 1, className = '') {
  const frame = AGENT_DUEL_ATLAS.frames[frameName];
  const width = frame.w * scale;
  const height = frame.h * scale;
  return `<span class="atlas-sprite-wrap ${className}" style="width:${width}px;height:${height}px" aria-hidden="true"><span class="atlas-sprite" style="${spriteStyle(frameName, scale)}"></span></span>`;
}

function winConditionIcons() {
  return `
    ${spriteMarkup('icon_relic', WIN_CONDITION_ICON_SCALE, 'win-icon win-icon-relic')}
    <span>&gt;</span>
    ${spriteMarkup('agent_blue_idle_0', WIN_CONDITION_ICON_SCALE, 'win-icon win-icon-agent')}
    <span>&gt;</span>
    ${spriteMarkup('base_blue_0', WIN_CONDITION_BASE_SCALE, 'win-icon win-icon-base')}
  `;
}

function spriteStyle(frameName, scale = 1) {
  const frame = AGENT_DUEL_ATLAS.frames[frameName];
  return [
    `width:${frame.w}px`,
    `height:${frame.h}px`,
    `background-image:url('${AGENT_DUEL_ATLAS.image}')`,
    `background-size:${AGENT_DUEL_ATLAS.width}px ${AGENT_DUEL_ATLAS.height}px`,
    `background-position:-${frame.x}px -${frame.y}px`,
    `transform:scale(${scale})`,
  ].join(';');
}

function healthHearts(side, health, maxHealth) {
  const frameFull = side === 'blue' ? 'hp_blue_full' : 'hp_red_full';
  const frameEmpty = side === 'blue' ? 'hp_blue_empty' : 'hp_red_empty';
  const hearts = Math.ceil(maxHealth / 2);
  return Array.from({ length: hearts }, (_, index) => spriteMarkup(index * 2 < health ? frameFull : frameEmpty, 0.34, 'heart-sprite')).join('');
}

function toolChip(side, kind, count) {
  const frame = `tool_${side}_${kind}`;
  return `<div class="tool-chip">${spriteMarkup(frame, 0.46)}<b>x${count}</b><span>${escapeHtml(kind.toUpperCase())}</span></div>`;
}

function legendGrid() {
  const items = [
    ['base_blue_0', 'Blue Base'],
    ['base_red_0', 'Red Base'],
    ['icon_relic', 'Relic'],
    ['icon_bush', 'Bush'],
    ['icon_fire', 'Fire'],
    ['icon_wall', 'Wall'],
    ['icon_trap', 'Trap'],
  ];
  return `<div class="legend-grid">${items.map(([frame, label]) => `<span>${spriteMarkup(frame, 0.42)}${escapeHtml(label)}</span>`).join('')}</div>`;
}

function statusPanel(title, player, side) {
  return `
    <div class="panel pixel-panel player-card ${side}">
      <div class="panel-header"><h2 class="panel-title">${escapeHtml(title)}</h2><span class="pill ${side}">${escapeHtml(side.toUpperCase())}</span></div>
      <div class="panel-body stack">
        <div class="status-grid">
          <div class="stat"><div class="stat-label">Position</div><div class="stat-value">${escapeHtml(player.position ?? 'Hidden')}</div></div>
          <div class="stat"><div class="stat-label">Relic</div><div class="stat-value">${player.carrying_relic ? 'Carrying' : 'No'}</div></div>
          <div class="stat"><div class="stat-label">Health</div><div class="stat-value">${player.health ?? '?'} / ${player.max_health ?? 10}</div><div class="health"><span style="width:${((player.health ?? 0) / (player.max_health ?? 10)) * 100}%"></span></div></div>
          <div class="stat"><div class="stat-label">State</div><div class="stat-value">${player.stunned ? 'Stunned' : 'Ready'}</div></div>
        </div>
        ${player.inventory ? `<div class="pill-row">${Object.entries(player.inventory).map(([k, v]) => `<span class="pill">${escapeHtml(k)} x${v}</span>`).join('')}</div>` : ''}
      </div>
    </div>
  `;
}

function opponentPanel(opponent, side) {
  return statusPanel('Opponent', {
    position: opponent.visible ? opponent.position : 'Hidden',
    carrying_relic: opponent.carrying_relic,
    health: opponent.health ?? '?',
    max_health: 10,
    stunned: false,
    inventory: opponent.known_inventory,
  }, side);
}

function spectatorPlayerPanel(side, player) {
  const name = agentName(side);
  const thoughtMarkup = player.action_thought ? `<p>${escapeHtml(player.action_thought)}</p>` : '';
  return `
    <section class="hud-card pixel-panel player-hud slot-${side === 'blue' ? 'a' : 'b'} ${side}">
      <div class="player-status-tag ${player.action_status ?? 'thinking'}">${playerActionStatus(player)}</div>
      <div class="agent-nameplate">
        ${spriteMarkup(`agent_${side}_idle_0`, 0.86, 'agent-avatar')}
        <div>
          <h2>${escapeHtml(name)}</h2>
        <div class="health-strip">${healthHearts(side, player.health, player.max_health ?? 10)}<strong>${player.health} / ${player.max_health ?? 10}</strong></div>
        </div>
      </div>
      <div class="thinking-box">
        <h3>THOUGHT</h3>
        ${thoughtMarkup}
      </div>
      <div class="tools-box">
        <h3>Tools</h3>
        <div class="tool-grid">
          ${Object.entries(player.inventory).filter(([k]) => ['wall', 'trap', 'scan', 'dash'].includes(k)).map(([k, v]) => toolChip(side, k, v)).join('')}
        </div>
      </div>
    </section>
  `;
}

function waitingSpectator(view) {
  return `
    <main class="spectator-layout spectator-hud spectator-waiting">
      <section class="broadcast-title">
        <div class="broadcast-rule pixel-panel">${escapeHtml(formatGameCount(view.match))}<span class="broadcast-score">Score ${escapeHtml(scoreText(view.match, view.full_board_state))}</span></div>
        <div>
          <h2>AGENT DUEL</h2>
          <div class="series-score">
            <span>SERIES SCORE</span>
            <strong class="blue-score">${view.match.score.player_1 ?? 0}</strong>
            <b>-</b>
            <strong class="red-score">${view.match.score.player_2 ?? 0}</strong>
          </div>
        </div>
        <div class="broadcast-rule pixel-panel">Waiting</div>
      </section>
      <section class="waiting-strip">
        <span class="join-prompt blue">${escapeHtml(waitingSlotText(1, view.lobby.slots.player_1))}</span>
        <span class="join-prompt red">${escapeHtml(waitingSlotText(2, view.lobby.slots.player_2))}</span>
      </section>
      <section class="board-frame pixel-panel">
        <div class="axis top-axis">${axisLabels('A', 'I')}</div>
        <div id="board" class="board-wrap broadcast-board"></div>
        <div class="axis bottom-axis">${axisLabels('A', 'I')}</div>
      </section>
      <section class="lower-hud waiting-lower">
        <div class="hud-card pixel-panel win-hud">
          <h3>Win Condition</h3>
          <div class="win-icons">${winConditionIcons()}</div>
          <p>Bring the relic back to your base.</p>
        </div>
      </section>
    </main>
  `;
}

function waitingSlotText(slotNumber, slot) {
  if (!slot.connected) return `Waiting for player ${slotNumber} to join`;
  return `${slot.name ?? `Player ${slotNumber}`} ${slot.ready ? 'ready' : 'joined'}`;
}

function axisLabels(start, end) {
  const first = start.charCodeAt(0);
  const last = end.charCodeAt(0);
  const labels = [];
  for (let code = first; code <= last; code += 1) labels.push(`<span>${String.fromCharCode(code)}</span>`);
  return labels.join('');
}

function itemIcon(kind) {
  return {
    wall: '#',
    trap: '^',
    scan: 'O',
    dash: '>>',
    heal: '+',
  }[kind] ?? '◆';
}

function playerActionStatus(player) {
  return player.action_status === 'ready' ? 'READY' : 'THINKING';
}

function eventList(events) {
  if (!events?.length) return '<div class="event">Waiting for the first move.</div>';
  return events.slice(-5).map((event) => `<div class="event">${escapeHtml(event.summary)}</div>`).join('');
}

function slotStat(label, slot) {
  return `<div class="stat"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(slot.name ?? 'Empty')}</div><div>${slot.connected ? 'connected' : 'offline'} - ${slot.ready ? 'ready' : 'not ready'}</div></div>`;
}

function pausedOverlay() {
  return '<div class="paused"><div class="paused-box"><h2>PAUSED BY ADMIN</h2><p>Input is locked until the match resumes.</p></div></div>';
}

function setError(message) {
  const el = document.getElementById('error');
  if (el) el.textContent = message;
}

function capitalize(value) {
  return value[0].toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
