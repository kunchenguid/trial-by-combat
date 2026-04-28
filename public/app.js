import { drawDetailedFloor, palette } from './assets/pixel-assets.js?v=detailed-atlas-128-clean-floor';
import { AGENT_DUEL_ATLAS } from './assets/sprite-atlas.js?v=production-atlas-2048-v1';
import { buildTerrainSprites } from './assets/terrain-layout.js?v=detailed-atlas-128-clean-floor';

const params = new URLSearchParams(window.location.search);
const playerParam = params.get('player') === 'admin' ? 'admin' : 'spectate';
const role = playerParam;
const state = {
  ws: null,
  role,
  latest: null,
  lastStateFingerprint: null,
  xray: localStorage.getItem('xray') === 'true',
  boardRenderer: null,
  spectatorResizeBound: false,
  lastMessageAt: 0,
  watchdog: null,
  timerAnchor: null,
  timerInterval: null,
  lastThoughts: { blue: null, red: null },
  lastThoughtTurn: null,
  lastScore: null,
  nextRoundAt: null,
};

const REPO_URL = 'https://github.com/kunchenguid/agent-duel';

const appEl = document.getElementById('app');
const WIN_CONDITION_ICON_SCALE = 0.62;
const WIN_CONDITION_BASE_SCALE = 0.82;
const SERVER_SILENCE_MS = 30000;
connect();

function connect() {
  const wsUrl = new URL('/ws', window.location.href);
  wsUrl.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  wsUrl.searchParams.set('player', playerParam);
  state.ws = new WebSocket(wsUrl);
  state.ws.addEventListener('open', () => {
    state.lastMessageAt = Date.now();
    clearInterval(state.watchdog);
    state.watchdog = setInterval(() => {
      if (Date.now() - state.lastMessageAt > SERVER_SILENCE_MS && state.ws?.readyState === WebSocket.OPEN) {
        state.ws.close();
      }
    }, 5000);
  });
  state.ws.addEventListener('message', (event) => {
    state.lastMessageAt = Date.now();
    const message = JSON.parse(event.data);
    if (message.type === 'heartbeat') return;
    if (message.type === 'state') {
      const fingerprint = stateFingerprint(message);
      if (fingerprint === state.lastStateFingerprint) return;
      state.lastStateFingerprint = fingerprint;
      state.latest = message;
      render();
    }
  });
  state.ws.addEventListener('close', () => {
    clearInterval(state.watchdog);
    state.watchdog = null;
    state.latest = null;
    state.lastStateFingerprint = null;
    renderDisconnected();
    setTimeout(connect, 800);
  });
}

function renderDisconnected() {
  state.boardRenderer?.destroy();
  state.boardRenderer = null;
  document.body.style.cssText = '';
  appEl.style.cssText = '';
  appEl.className = 'app';
  appEl.innerHTML = `
    <main class="disconnected" style="display:flex;align-items:center;justify-content:center;min-height:60vh;flex-direction:column;gap:12px;">
      <h1 style="margin:0;">Disconnected</h1>
      <p style="margin:0;opacity:0.7;">Reconnecting to the server...</p>
    </main>
  `;
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
}

function renderShell(title, subtitle, content, pills = [], options = {}) {
  document.body.style.cssText = '';
  appEl.style.cssText = '';
  const header =
    options.showHeader === false
      ? ''
      : `
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

function renderSpectator(view) {
  const board = view.full_board_state;
  const bluePlayer = board.players.blue;
  const redPlayer = board.players.red;
  const waiting = view.phase === 'pre_lobby' || view.phase === 'lobby';
  renderShell(
    'AGENT DUEL',
    'Capture the Relic',
    waiting
      ? waitingSpectator(view)
      : `
      <main class="spectator-layout spectator-hud">
        <section class="broadcast-title">
          <div class="broadcast-rule pixel-panel">${escapeHtml(formatGameCount(view.match))}</div>
          <div>
            <h2>AGENT DUEL</h2>
            <div class="series-score">
              <strong class="blue-score">${scoreForSide(view.match, board, 'blue')}</strong>
              <a class="series-score-url" href="${REPO_URL}" target="_blank" rel="noopener">${escapeHtml(REPO_URL)}</a>
              <strong class="red-score">${scoreForSide(view.match, board, 'red')}</strong>
            </div>
          </div>
          <div class="broadcast-rule pixel-panel">Turn ${view.turn}<span class="broadcast-timer" data-turn-timer>${formatTimer(view.timer_seconds_remaining)}</span></div>
        </section>
        <section class="story-banner pixel-panel">
          ${spriteMarkup('relic_0', 0.72, 'story-relic')}
          <strong>${escapeHtml(storyBannerText(board, view.lobby))}</strong>
        </section>
        ${spectatorPlayerPanel('blue', bluePlayer, view.timer_seconds_remaining, view.lobby)}
        <section class="board-frame pixel-panel">
          <div class="axis top-axis">${axisLabels('A', 'I')}</div>
          <div id="board" class="board-wrap broadcast-board"></div>
          <div class="axis bottom-axis">${axisLabels('A', 'I')}</div>
          ${roundEndOverlay(view, board)}
        </section>
        ${spectatorPlayerPanel('red', redPlayer, view.timer_seconds_remaining, view.lobby)}
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
  resetTurnTimer(view, board);
  flashNewThoughts(view, board);
  flashScoreChanges(view, board);
  if (waiting) {
    hydrateBoard(board, { xray: true });
  } else {
    hydrateBoard(board, {
      xray: state.xray,
      events: view.public_events,
      gameNumber: view.match?.game_number,
    });
  }
}

function flashScoreChanges(view, board) {
  const score = view.match?.score;
  if (!score) return;
  const next = { player_1: score.player_1 ?? 0, player_2: score.player_2 ?? 0 };
  const prev = state.lastScore;
  state.lastScore = next;
  if (!prev) return;
  for (const slot of ['player_1', 'player_2']) {
    if (next[slot] > prev[slot]) {
      const side = board?.players?.blue?.slot === slot ? 'blue' : 'red';
      const el = document.querySelector(`.${side}-score`);
      if (!el) continue;
      el.classList.remove('score-flash');
      void el.offsetWidth;
      el.classList.add('score-flash');
      setTimeout(() => el.classList.remove('score-flash'), 1600);
    }
  }
}

function flashNewThoughts(view, board) {
  if (view.turn !== state.lastThoughtTurn) {
    state.lastThoughts = { blue: null, red: null };
    state.lastThoughtTurn = view.turn;
  }
  for (const side of ['blue', 'red']) {
    const thought = board?.players?.[side]?.action_thought ?? null;
    if (thought && thought !== state.lastThoughts[side]) {
      state.lastThoughts[side] = thought;
      const el = document.querySelector(`.player-hud.${side}`);
      if (!el) continue;
      el.classList.remove('thought-flash');
      void el.offsetWidth;
      el.classList.add('thought-flash');
      setTimeout(() => el.classList.remove('thought-flash'), 800);
    } else if (!thought) {
      state.lastThoughts[side] = null;
    }
  }
}

function resetTurnTimer(view, board) {
  state.nextRoundAt = typeof view.next_round_at === 'number' ? view.next_round_at : null;
  const paused = Boolean(view.paused);
  const seconds = view.timer_seconds_remaining;
  const turn = view.turn;
  const prev = state.timerAnchor;
  const sameTurn = prev && prev.turn === turn && prev.turnSeconds != null;
  const turnSeconds = sameTurn ? prev.turnSeconds : typeof seconds === 'number' ? seconds : null;
  state.timerAnchor = {
    seconds: typeof seconds === 'number' ? seconds : null,
    turnSeconds,
    turn,
    receivedAt: Date.now(),
    paused,
    statuses: {
      blue: board?.players?.blue?.action_status ?? 'thinking',
      red: board?.players?.red?.action_status ?? 'thinking',
    },
  };
  paintTurnTimer();
  if (!state.timerInterval) {
    state.timerInterval = setInterval(paintTurnTimer, 1000);
  }
}

function paintTurnTimer() {
  paintNextRoundCountdown();
  const anchor = state.timerAnchor;
  const turnEl = document.querySelector('[data-turn-timer]');
  const blueEl = document.querySelector('[data-status-timer="blue"]');
  const redEl = document.querySelector('[data-status-timer="red"]');
  if (!turnEl && !blueEl && !redEl) return;
  if (!anchor || anchor.seconds == null) {
    if (turnEl) turnEl.textContent = '';
    if (blueEl) blueEl.textContent = '';
    if (redEl) redEl.textContent = '';
    return;
  }
  const elapsed = anchor.paused ? 0 : Math.floor((Date.now() - anchor.receivedAt) / 1000);
  const remaining = Math.max(0, anchor.seconds - elapsed);
  const turnElapsed = anchor.turnSeconds != null ? Math.max(0, anchor.turnSeconds - remaining) : 0;
  const remainingLabel = formatTimer(remaining);
  const elapsedLabel = formatTimer(turnElapsed);
  if (turnEl) turnEl.textContent = remainingLabel;
  if (blueEl) blueEl.textContent = anchor.statuses.blue === 'ready' ? '' : elapsedLabel;
  if (redEl) redEl.textContent = anchor.statuses.red === 'ready' ? '' : elapsedLabel;
}

function paintNextRoundCountdown() {
  const el = document.querySelector('[data-next-round-countdown]');
  if (!el) return;
  const target = state.nextRoundAt;
  if (typeof target !== 'number') {
    el.textContent = '';
    return;
  }
  const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000));
  el.textContent = remaining > 0 ? `Next Round In ${remaining}` : 'Starting...';
}

function formatTimer(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '';
  return `${Math.max(0, Math.floor(seconds))}s`;
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
  hydrateBoard(view.current_game.full_board_state, {
    xray: true,
    events: view.current_game.public_events,
    gameNumber: view.current_game.match?.game_number,
  });
  for (const button of document.querySelectorAll('[data-admin]')) {
    button.addEventListener('click', () => {
      state.ws.send(
        JSON.stringify({
          type: 'admin',
          action: button.dataset.admin,
          ...(button.dataset.bestOf ? { bestOf: Number(button.dataset.bestOf) } : {}),
        }),
      );
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
  if (options.events) {
    state.boardRenderer.applyEvents(options.events, boardState, options.gameNumber);
  }
}

class BoardRenderer {
  constructor(target, size) {
    this.target = target;
    this.size = size;
    this.animatedActors = [];
    this.fxActors = [];
    this.heroPoses = { blue: null, red: null };
    this.lastEventSeq = -1;
    this.lastGameNumber = null;
    this.tick = this.tick.bind(this);
    this.app = new PIXI.Application();
    this.ready = this.app
      .init({
        width: this.size,
        height: this.size,
        background: palette.background,
        antialias: false,
        resolution: 1,
      })
      .then(() => {
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
    this.uiLayer.removeChildren();
    this.animatedActors = [];
    const cell = this.size / 9;
    for (let row = 1; row <= 9; row += 1) {
      for (let col = 0; col < 9; col += 1) {
        const _coord = `${String.fromCharCode(65 + col)}${row}`;
        const x = col * cell;
        const y = (row - 1) * cell;
        const floor = new PIXI.Graphics();
        drawDetailedFloor(floor, x, y, cell, row + col);
        this.floorLayer.addChild(floor);
      }
    }
    for (const sprite of buildRenderList(board, options)) {
      drawSpriteAt(sprite, cell, (x, y) => {
        if (sprite.kind === 'base')
          this.addWorldActor(this.terrainLayer, x, y, sprite, {
            animationName: sprite.animationName,
            width: cell,
            height: cell,
            anchor: [0, 0],
            animationKind: 'base',
          });
        if (sprite.kind === 'bush')
          this.addAtlasSprite(this.terrainLayer, sprite.frame, x, y, { width: cell, height: cell, anchor: [0, 0] });
        if (sprite.kind === 'fire')
          this.addWorldActor(this.terrainLayer, x + cell * 0.5, y + cell * 0.98, sprite, {
            animationName: 'fire_loop',
            height: cell * 0.86,
            animationKind: 'fire',
          });
        if (sprite.kind === 'wall')
          this.addAtlasSprite(this.terrainLayer, sprite.frame, x, y, { width: cell, height: cell, anchor: [0, 0] });
        if (sprite.kind === 'trap')
          this.addWorldActor(this.terrainLayer, x, y, sprite, {
            frameName: sprite.hidden ? 'trap_hidden' : 'trap_armed',
            width: cell,
            height: cell,
            anchor: [0, 0],
            animationKind: sprite.hidden ? 'static' : 'trap',
          });
        if (sprite.kind === 'relic')
          this.addWorldActor(this.relicGroundLayer, x + cell * 0.5, y + cell * 0.74, sprite, {
            animationName: 'relic_shimmer',
            height: cell * 0.66,
            animationKind: 'relic',
          });
        if (sprite.kind === 'hero') {
          const baseAnim = agentAnimationName(sprite.side, sprite.carrying, sprite.stunned);
          const pose = this.heroPoses[sprite.side];
          const useAnim = pose && pose.expiresAt > performance.now() ? pose.animationName : baseAnim;
          const heroActor = this.addWorldActor(this.agentLayer, x + cell * 0.5, y + cell * 1.02, sprite, {
            animationName: useAnim,
            height: cell * 1.08,
            animationKind: sprite.stunned ? 'hero_stunned' : 'hero',
          });
          heroActor.heroSide = sprite.side;
          heroActor.basePoseAnimation = baseAnim;
          heroActor.poseExpiresAt = useAnim === baseAnim ? null : pose.expiresAt;
          if (sprite.stunned) {
            this.addWorldActor(this.agentLayer, x + cell * 0.5, y + cell * 0.32, sprite, {
              animationName: 'fx_spark_gold',
              height: cell * 0.55,
              animationKind: 'aura',
            });
          }
        }
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
    sprite.phase = coordPoint(spriteData.coord).x * 0.47 + coordPoint(spriteData.coord).y * 0.71;
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
      if (actor.animationKind === 'hero' && actor.poseExpiresAt && frameNow > actor.poseExpiresAt) {
        const baseAnim = AGENT_DUEL_ATLAS.animations[actor.basePoseAnimation];
        if (baseAnim) {
          actor.animation = baseAnim;
          actor.animationName = actor.basePoseAnimation;
        }
        actor.poseExpiresAt = null;
        if (actor.heroSide && this.heroPoses[actor.heroSide]) this.heroPoses[actor.heroSide] = null;
      }
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
      } else if (actor.animationKind === 'hero_stunned') {
        actor.scale.set(actor.baseScale);
        actor.x = actor.baseX + Math.sin(t * 2.1) * 0.6;
        actor.alpha = 0.85;
      } else if (actor.animationKind === 'aura') {
        actor.scale.set(actor.baseScale * (1 + Math.sin(t * 4.2) * 0.06));
        actor.y = actor.baseY + Math.sin(t * 3.1) * 1.5;
        actor.alpha = 0.85 + Math.sin(t * 5.7) * 0.15;
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
    for (let i = this.fxActors.length - 1; i >= 0; i -= 1) {
      const fx = this.fxActors[i];
      const elapsed = frameNow - fx.t0;
      if (elapsed >= fx.lifetime) {
        fx.sprite.destroy();
        this.fxActors.splice(i, 1);
        continue;
      }
      if (fx.animation) {
        const frames = fx.animation.frames;
        const totalFrames = frames.length;
        const stepped = Math.floor((elapsed / 1000) * fx.animation.fps);
        const frameIndex = fx.animation.loop ? stepped % totalFrames : Math.min(totalFrames - 1, stepped);
        const nextFrame = frames[frameIndex];
        if (fx.sprite.currentFrame !== nextFrame) {
          fx.sprite.texture = this.atlas.texture(nextFrame);
          fx.sprite.currentFrame = nextFrame;
        }
      }
      const progress = elapsed / fx.lifetime;
      if (fx.fade) fx.sprite.alpha = (fx.alpha ?? 1) * (1 - progress);
      if (fx.scaleGrow) fx.sprite.scale.set(fx.baseScale * (1 + progress * fx.scaleGrow));
    }
  }

  spawnFx(animationOrFrame, x, y, options = {}) {
    const animation = AGENT_DUEL_ATLAS.animations[animationOrFrame] ?? null;
    const frameName = animation ? animation.frames[0] : animationOrFrame;
    const sprite = this.atlas.createSprite(frameName);
    sprite.anchor.set(options.anchorX ?? 0.5, options.anchorY ?? 0.5);
    sprite.x = Math.round(x);
    sprite.y = Math.round(y);
    const cell = this.size / 9;
    const targetSize = options.size ?? cell * 0.95;
    const frame = AGENT_DUEL_ATLAS.frames[frameName];
    const baseScale = targetSize / frame.h;
    sprite.scale.set(baseScale);
    sprite.alpha = options.alpha ?? 1;
    this.fxLayer.addChild(sprite);
    const lifetime = options.lifetime ?? (animation ? (animation.frames.length / animation.fps) * 1000 : 600);
    this.fxActors.push({
      sprite,
      animation,
      t0: performance.now(),
      lifetime,
      fade: options.fade ?? false,
      alpha: options.alpha ?? 1,
      baseScale,
      scaleGrow: options.scaleGrow ?? 0,
    });
    return sprite;
  }

  applyHeroPose(side, animationName, durationMs) {
    const pose = {
      animationName,
      expiresAt: performance.now() + durationMs,
    };
    this.heroPoses[side] = pose;
    const animation = AGENT_DUEL_ATLAS.animations[animationName];
    if (!animation) return;
    for (const actor of this.animatedActors) {
      if (actor.heroSide === side) {
        actor.animation = animation;
        actor.animationName = animationName;
        actor.poseExpiresAt = pose.expiresAt;
        const nextFrame = animation.frames[0];
        actor.texture = this.atlas.texture(nextFrame);
        actor.currentFrame = nextFrame;
        rescaleAnimatedSprite(actor, this.atlas.frame(nextFrame));
      }
    }
  }

  async applyEvents(events, board, gameNumber) {
    await this.ready;
    if (!Array.isArray(events) || events.length === 0) return;
    if (gameNumber !== this.lastGameNumber) {
      this.lastGameNumber = gameNumber;
      this.lastEventSeq = -1;
      for (const fx of this.fxActors) fx.sprite.destroy();
      this.fxActors = [];
      this.heroPoses = { blue: null, red: null };
    }
    for (const event of events) {
      if (event.seq < this.lastEventSeq) {
        this.lastEventSeq = -1;
        for (const fx of this.fxActors) fx.sprite.destroy();
        this.fxActors = [];
        this.heroPoses = { blue: null, red: null };
      }
      if (typeof event.seq !== 'number' || event.seq <= this.lastEventSeq) continue;
      this.dispatchEvent(event, board);
      this.lastEventSeq = event.seq;
    }
  }

  dispatchEvent(event, board) {
    const cell = this.size / 9;
    const tileCenter = (coord) => {
      if (!coord) return null;
      const { x, y } = coordPoint(coord);
      return { x: x * cell + cell * 0.5, y: y * cell + cell * 0.5 };
    };
    const opponent = (side) => (side === 'blue' ? 'red' : 'blue');
    const sideOf = event.actor;
    const actorPos = sideOf ? board?.players?.[sideOf]?.position : null;
    switch (event.event_type) {
      case 'attack': {
        if (sideOf) {
          this.applyHeroPose(sideOf, `agent_${sideOf}_attack`, 500);
        }
        const oppPos = sideOf ? board?.players?.[opponent(sideOf)]?.position : null;
        const target = tileCenter(oppPos);
        if (target) {
          this.spawnFx('fx_hit', target.x, target.y, { size: cell * 1.05, lifetime: 360 });
          this.spawnFx('target_marker', target.x, target.y, {
            size: cell * 0.95,
            lifetime: 1400,
            fade: true,
            alpha: 0.85,
          });
        }
        break;
      }
      case 'attack_miss': {
        if (sideOf) {
          this.applyHeroPose(sideOf, `agent_${sideOf}_attack`, 500);
        }
        break;
      }
      case 'trap_triggered': {
        const here = tileCenter(actorPos);
        if (here) {
          this.spawnFx('trap_trigger', here.x, here.y + cell * 0.1, { size: cell * 1.1, lifetime: 450 });
          this.spawnFx('fx_hit', here.x, here.y, { size: cell * 1.05, lifetime: 360 });
          this.spawnFx('danger_marker', here.x, here.y, { size: cell * 0.95, lifetime: 1400, fade: true, alpha: 0.85 });
        }
        break;
      }
      case 'scan':
      case 'scan_trap':
      case 'scan_opponent': {
        const here = tileCenter(actorPos);
        if (here) this.spawnFx('fx_scan', here.x, here.y, { size: cell * 2.2, lifetime: 500 });
        break;
      }
      case 'move': {
        if (event.meta?.dashed && event.meta.from && sideOf) {
          const from = tileCenter(event.meta.from);
          if (from) this.spawnFx(`fx_dash_${sideOf}`, from.x, from.y, { size: cell * 1.05, lifetime: 360, fade: true });
        }
        break;
      }
      case 'fire_damage': {
        const here = tileCenter(actorPos);
        if (here) this.spawnFx('fx_hit', here.x, here.y, { size: cell * 0.75, lifetime: 320 });
        break;
      }
      case 'damage': {
        const here = tileCenter(actorPos);
        if (here && sideOf)
          this.spawnFx(`fx_spark_${sideOf}`, here.x, here.y - cell * 0.2, {
            size: cell * 0.9,
            lifetime: 360,
            fade: true,
          });
        break;
      }
      case 'knockout': {
        const here = tileCenter(actorPos);
        if (here) {
          this.spawnFx('fx_spark_gold', here.x, here.y - cell * 0.25, { size: cell * 1.15, lifetime: 600, fade: true });
          this.spawnFx('fx_hit', here.x, here.y, { size: cell * 1.0, lifetime: 360 });
        }
        break;
      }
      case 'relic_picked_up':
      case 'relic_dropped': {
        const here = tileCenter(actorPos);
        if (here)
          this.spawnFx('fx_spark_gold', here.x, here.y - cell * 0.3, { size: cell * 1.15, lifetime: 600, fade: true });
        break;
      }
      case 'respawn': {
        const here = tileCenter(actorPos);
        if (here) this.spawnFx('fx_dust', here.x, here.y, { size: cell * 1.1, lifetime: 500, fade: true });
        break;
      }
      default:
        break;
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
  const scale =
    options.width && options.height
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
    if (trap.visible || options.xray)
      push(trap.coord, 'trap', { hidden: !options.xray && !trap.visible, depthOffset: 0.08 });
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

function agentAnimationName(side, carrying, stunned) {
  if (stunned) return `agent_${side}_stunned`;
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

function formatGameCount(match) {
  const bestOf = (match.best_of ?? Number(String(match.format ?? 'BO1').replace('BO', ''))) || 1;
  return `GAME ${match.game_number} / ${bestOf}`;
}

function scoreForSide(match, board, side) {
  const slot = board.players[side]?.slot;
  return match.score?.[slot] ?? 0;
}

function roundEndOverlay(view, board) {
  const isGameEnd = view.phase === 'game_end';
  const isSeriesEnd = view.phase === 'series_end';
  if (!isGameEnd && !isSeriesEnd) return '';
  if (isSeriesEnd) {
    const slot = view.match?.series_winner;
    const name = slot ? (view.lobby?.slots?.[slot]?.name ?? slot) : null;
    const headline = name ? `${name} Wins The Series` : 'Series Complete';
    const sub = `Final Score ${view.match.score?.player_1 ?? 0} - ${view.match.score?.player_2 ?? 0}`;
    return `
      <div class="round-end-banner series-end">
        <div class="round-end-tag">SERIES OVER</div>
        <h2>${escapeHtml(headline)}</h2>
        <div class="round-end-sub">${escapeHtml(sub)}</div>
      </div>
    `;
  }
  const winnerSide = view.winner;
  const replay = Boolean(view.replay_required);
  const winnerName = winnerSide ? agentName(winnerSide, board, view.lobby) : null;
  const headline = replay ? 'Round Replayed' : winnerName ? `${winnerName} Captured The Relic` : 'Round Complete';
  const sideClass = winnerSide ? `winner-${winnerSide}` : '';
  const trash = view.trash_talk ?? {};
  const blueSlot = board?.players?.blue?.slot;
  const redSlot = board?.players?.red?.slot;
  const blueTrash = blueSlot ? trash[blueSlot] : null;
  const redTrash = redSlot ? trash[redSlot] : null;
  const blueName = agentName('blue', board, view.lobby);
  const redName = agentName('red', board, view.lobby);
  const trashRow =
    blueTrash || redTrash
      ? `<div class="round-end-trash">
        ${blueTrash ? `<div class="trash-bubble blue"><span class="trash-name">${escapeHtml(blueName)}</span><span class="trash-text">${escapeHtml(blueTrash)}</span></div>` : ''}
        ${redTrash ? `<div class="trash-bubble red"><span class="trash-name">${escapeHtml(redName)}</span><span class="trash-text">${escapeHtml(redTrash)}</span></div>` : ''}
      </div>`
      : '';
  const tail =
    typeof view.next_round_at === 'number'
      ? `<div class="round-end-countdown" data-next-round-countdown></div>`
      : `<div class="round-end-sub">Score ${view.match.score?.player_1 ?? 0} - ${view.match.score?.player_2 ?? 0} - Waiting For Both Players To Ready Up</div>`;
  return `
    <div class="round-end-banner ${sideClass}">
      <div class="round-end-tag">ROUND ${view.match?.game_number ?? ''} OVER</div>
      <h2>${escapeHtml(headline)}</h2>
      ${trashRow}
      ${tail}
    </div>
  `;
}

function storyBannerText(board, lobby) {
  const carrier = board.relic?.carriedBy;
  if (carrier && board.players[carrier]?.position) {
    const distance = nearestBaseDistance(board.players[carrier].position, board.bases[carrier]);
    return `${agentName(carrier, board, lobby)} Has The Relic - ${distance} Tiles From Home`;
  }
  if (board.relic?.position) return `The Relic Is Loose At ${board.relic.position} - Both Agents Are Closing In`;
  return 'The Relic Is Contested - Both Agents Are Looking For The Handoff';
}

function nearestBaseDistance(coord, bases) {
  const point = coordPoint(coord);
  return Math.min(
    ...bases.map((base) => {
      const target = coordPoint(base);
      return Math.abs(point.x - target.x) + Math.abs(point.y - target.y);
    }),
  );
}

function agentName(side, board, lobby) {
  const slot = board?.players?.[side]?.slot;
  const lobbyName = slot ? lobby?.slots?.[slot]?.name : null;
  if (lobbyName) return lobbyName;
  return side === 'blue' ? 'Blue' : 'Red';
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
  return Array.from({ length: hearts }, (_, index) =>
    spriteMarkup(index * 2 < health ? frameFull : frameEmpty, 0.34, 'heart-sprite'),
  ).join('');
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

function spectatorPlayerPanel(side, player, timerSeconds, lobby) {
  const name = agentName(side, { players: { [side]: player } }, lobby);
  const thoughtMarkup = player.action_thought ? `<p>${escapeHtml(player.action_thought)}</p>` : '';
  return `
    <section class="hud-card pixel-panel player-hud slot-${side === 'blue' ? 'a' : 'b'} ${side}">
      <div class="player-status-tag ${player.action_status ?? 'thinking'}">${playerActionStatus(player)}<span class="status-timer" data-status-timer="${side}">${player.action_status === 'ready' ? '' : formatTimer(timerSeconds)}</span></div>
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
          ${Object.entries(player.inventory)
            .filter(([k]) => ['wall', 'trap', 'scan', 'dash'].includes(k))
            .map(([k, v]) => toolChip(side, k, v))
            .join('')}
        </div>
      </div>
    </section>
  `;
}

function waitingSpectator(view) {
  return `
    <main class="spectator-layout spectator-hud spectator-waiting">
      <section class="broadcast-title">
        <div class="broadcast-rule pixel-panel">${escapeHtml(formatGameCount(view.match))}</div>
        <div>
          <h2>AGENT DUEL</h2>
          <div class="series-score">
            <strong class="blue-score">${view.match.score.player_1 ?? 0}</strong>
            <a class="series-score-url" href="${REPO_URL}" target="_blank" rel="noopener">${escapeHtml(REPO_URL)}</a>
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

function _itemIcon(kind) {
  return (
    {
      wall: '#',
      trap: '^',
      scan: 'O',
      dash: '>>',
      heal: '+',
    }[kind] ?? '◆'
  );
}

function playerActionStatus(player) {
  return player.action_status === 'ready' ? 'READY' : 'THINKING';
}

function eventList(events) {
  if (!events?.length) return '<div class="event">Waiting for the first move.</div>';
  return events
    .slice(-5)
    .map((event) => `<div class="event">${escapeHtml(event.summary)}</div>`)
    .join('');
}

function slotStat(label, slot) {
  return `<div class="stat"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(slot.name ?? 'Empty')}</div><div>${slot.connected ? 'connected' : 'offline'} - ${slot.ready ? 'ready' : 'not ready'}</div></div>`;
}

function pausedOverlay() {
  return '<div class="paused"><div class="paused-box"><h2>PAUSED BY ADMIN</h2><p>Input is locked until the match resumes.</p></div></div>';
}

function _capitalize(value) {
  return value[0].toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
