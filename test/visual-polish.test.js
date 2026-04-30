import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('spectator UI uses the polished broadcast overlay and detailed pixel renderer', async () => {
  const [index, app, styles, assets, atlas, terrainLayout] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/assets/pixel-assets.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/assets/sprite-atlas.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/assets/terrain-layout.js', import.meta.url), 'utf8'),
  ]);

  assert.match(app, /spectator-hud/);
  assert.match(index, /app\.js\?v=production-atlas-2048-v2/);
  assert.match(app, /sprite-atlas\.js\?v=production-atlas-2048-v2/);
  assert.match(atlas, /trial-by-combat-sprite-sheet\.png\?v=production-atlas-2048-v2/);
  assert.match(app, /'TRIAL BY COMBAT'/);
  assert.match(app, /lastStateFingerprint/);
  assert.match(app, /stateFingerprint\(message\)/);
  assert.match(app, /return;/);
  assert.match(app, /state\.boardRenderer/);
  assert.match(app, /attach\(target\)/);
  assert.match(app, /class BoardRenderer/);
  assert.match(app, /event\.seq <=? this\.lastEventSeq/);
  assert.match(app, /this\.app\.ticker\.add/);
  assert.match(app, /tick\(now = performance\.now\(\)\)/);
  assert.match(app, /this\.floorLayer/);
  assert.match(app, /drawDetailedFloor\(floor,/);
  assert.doesNotMatch(app, /this\.addAtlasSprite\(this\.floorLayer, floorFrame/);
  assert.match(app, /addWorldActor/);
  assert.match(app, /addAtlasSprite/);
  assert.match(app, /agentAnimationName/);
  assert.match(app, /positionAndScaleSprite/);
  assert.match(app, /spriteMarkup\('icon_relic'/);
  assert.match(app, /function winConditionIcons\(\)/);
  assert.match(app, /WIN_CONDITION_BASE_SCALE/);
  assert.match(app, /spriteMarkup\('icon_relic', WIN_CONDITION_ICON_SCALE, 'win-icon win-icon-relic'/);
  assert.match(app, /spriteMarkup\('agent_blue_idle_0', WIN_CONDITION_ICON_SCALE, 'win-icon win-icon-agent'/);
  assert.match(app, /spriteMarkup\('base_blue_0', WIN_CONDITION_BASE_SCALE, 'win-icon win-icon-base'/);
  assert.doesNotMatch(
    app,
    /spriteMarkup\('icon_relic', 0\.78\)[\s\S]*spriteMarkup\('agent_blue_idle_0', 0\.54\)[\s\S]*spriteMarkup\('base_blue_0', 0\.48\)/,
  );
  assert.match(app, /this\.terrainLayer/);
  assert.match(app, /this\.relicGroundLayer/);
  assert.match(app, /this\.highlightLayer/);
  assert.match(app, /this\.agentLayer/);
  assert.match(app, /this\.carriedRelicLayer/);
  assert.match(app, /this\.fxLayer/);
  assert.match(app, /this\.uiLayer/);
  assert.match(app, /this\.animatedActors/);
  assert.match(app, /SpriteAtlas/);
  assert.match(app, /configureAtlasTexture/);
  assert.match(app, /source: this\.baseTexture,/);
  assert.match(app, /texture\.updateUvs\?\.\(\)/);
  assert.match(app, /actor\.targetHeight/);
  assert.match(app, /rescaleAnimatedSprite\(actor, this\.atlas\.frame\(nextFrame\)\)/);
  assert.match(app, /TRIAL_BY_COMBAT_ATLAS/);
  assert.match(app, /agent_blue_idle/);
  assert.match(app, /agent_blue_carry_idle/);
  assert.match(app, /relic_shimmer/);
  assert.match(app, /fire_loop/);
  assert.match(app, /storyBannerText/);
  assert.match(app, /Has The Relic - \$\{distance\} Tiles From Home/);
  assert.match(app, /formatGameCount\(view\.match\)/);
  assert.match(app, /class="series-score"/);
  assert.match(app, /THOUGHT/);
  assert.match(app, /What Just Happened/);
  assert.match(app, /showHeader: false/);
  assert.match(app, /function waitingSpectator[\s\S]*<h2>TRIAL BY COMBAT<\/h2>/);
  assert.match(app, /waitingSlotText\(1, view\.lobby\.slots\.player_1\)/);
  assert.match(app, /Waiting for player \$\{slotNumber\} to join/);
  assert.doesNotMatch(app, /Slot 1: \$\{escapeHtml\(view\.lobby\.slots\.player_1\.name \?\? 'waiting'\)/);
  assert.doesNotMatch(app, /<p>LLM Duel<\/p>/);
  assert.doesNotMatch(app, /LLM A/);
  assert.doesNotMatch(app, /LLM B/);
  assert.doesNotMatch(app, /advantage-strip/);
  assert.doesNotMatch(app, /advantage_breakdown/);
  assert.doesNotMatch(app, /Relic: <strong>/);
  assert.doesNotMatch(app, /Intent/);
  assert.doesNotMatch(app, /Carry the glowing relic home/);
  assert.doesNotMatch(app, /g\.rect\(x \+ 2, y \+ 2, cell - 4, cell - 4\).*baseBlue/);
  assert.doesNotMatch(app, /g\.rect\(x \+ 2, y \+ 2, cell - 4, cell - 4\).*baseRed/);
  assert.match(app, /buildRenderList/);
  assert.match(app, /buildTerrainSprites/);
  assert.match(app, /drawSpriteAt/);
  assert.match(app, /board\.fire/);
  assert.match(terrainLayout, /\$\{kind\}_\$\{mask\}/);
  assert.match(terrainLayout, /footprint: \{ width: 1, height: 1 \}/);
  assert.doesNotMatch(app, /function bushFrame/);
  assert.doesNotMatch(app, /function wallFrame/);
  assert.match(styles, /broadcast-title/);
  assert.match(styles, /spectator-waiting/);
  assert.match(styles, /\.waiting-strip \{[\s\S]*align-items: center/);
  assert.match(styles, /\.join-prompt \{[\s\S]*font-size: clamp\(13px, 1\.08vw, 18px\)/);
  assert.match(styles, /\.lower-hud\.waiting-lower \{[\s\S]*grid-template-columns: minmax\(420px, 560px\)/);
  assert.match(styles, /\.lower-hud\.waiting-lower \{[\s\S]*justify-content: center/);
  assert.match(styles, /\.waiting-lower \.win-hud \{[\s\S]*width: 560px/);
  assert.match(styles, /\.waiting-lower \.win-hud p \{[\s\S]*white-space: nowrap/);
  assert.match(styles, /\.win-icon \{[\s\S]*display: inline-flex/);
  assert.match(styles, /\.win-icon-base \{[\s\S]*transform: translateY\(-3px\)/);
  assert.match(styles, /hud-card/);
  assert.match(styles, /board-frame/);
  assert.match(styles, /story-banner/);
  assert.match(styles, /agent-nameplate/);
  assert.match(styles, /tool-grid/);
  assert.match(styles, /atlas-sprite/);
  assert.match(styles, /font-family: "Press Start 2P"/);
  assert.match(styles, /--hud-blue: #2f9bff/);
  assert.match(styles, /--hud-red: #ff4b3f/);
  assert.match(styles, /--hud-gold: #ffc84a/);
  assert.match(styles, /\.spectator-layout::before/);
  assert.match(styles, /pixel-panel/);
  assert.match(styles, /clip-path: polygon/);
  assert.match(styles, /repeating-linear-gradient\(90deg/);
  assert.match(styles, /grid-template-columns: 386px minmax\(760px, 930px\) 386px/);
  assert.match(styles, /grid-template-rows: 150px 70px minmax\(520px, 1fr\) 192px/);
  assert.match(styles, /aspect-ratio: 16 \/ 9/);
  assert.match(styles, /--spectator-scale/);
  assert.match(styles, /text-shadow:\s*3px 0 0 #1b2939/);
  assert.match(app, /fitSpectatorViewport/);
  assert.match(app, /1920/);
  assert.match(app, /1080/);
  assert.match(app, /appClass: 'admin-app arcade-app'/);
  assert.match(app, /class="admin-layout arcade-layout"/);
  assert.match(app, /class="panel pixel-panel/);
  assert.doesNotMatch(app, /class="panel pixel-panel state-panel"/);
  assert.match(app, /class="topbar pixel-panel"/);
  assert.match(styles, /\.arcade-app/);
  assert.match(styles, /\.arcade-layout/);
  assert.match(styles, /\.arcade-app button/);
  assert.match(styles, /\.arcade-app input/);
  assert.match(styles, /\.panel\.pixel-panel/);
  assert.match(styles, /\.player-card\.blue/);
  assert.match(styles, /\.player-card\.red/);
  assert.match(app, /Tiles From Home/);
  assert.doesNotMatch(app, /Heading to base\\nto secure the win\./);
  assert.doesNotMatch(app, /Cutting off the\\nescape route\./);
  assert.match(assets, /export function drawDetailedFloor/);
  assert.match(assets, /export function drawBaseBanner/);
  assert.match(assets, /export function drawRelicGlow/);
  assert.match(assets, /export function drawTallHero/);
  assert.match(assets, /export function drawTallBush/);
  assert.match(assets, /export function drawTallWall/);
  assert.match(assets, /drawLeafCluster/);
  assert.match(assets, /bushTrunk/);
  assert.match(atlas, /trial-by-combat-sprite-sheet\.png/);
  assert.match(atlas, /filterMode: 'nearest'/);
  assert.match(atlas, /compression: 'lossless'/);
  assert.match(atlas, /mipmaps: false/);
  assert.match(atlas, /wrapMode: 'clamp'/);
  assert.match(atlas, /frames: Object\.freeze/);
  assert.match(atlas, /cellSize: 64/);
  assert.match(atlas, /columns: 32/);
  assert.match(atlas, /agent_blue_idle_0/);
  assert.match(atlas, /agent_blue_carry_idle_0/);
  assert.match(atlas, /agent_red_idle_0/);
  assert.match(atlas, /relic_0/);
  assert.match(atlas, /fire_0/);
  assert.match(atlas, /animations: deepFreeze/);
});

test('public app.js does not contain player UI (slots are API-only)', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /renderPlayer\b/);
  assert.doesNotMatch(app, /renderBriefing\b/);
  assert.doesNotMatch(app, /turnStateText\b/);
  assert.doesNotMatch(app, /startPlayerCountdown\b/);
  assert.doesNotMatch(app, /class="action-panel"/);
});

test('spectator UI exposes stealth visibility, thinking status, and zero scores', async () => {
  const [app, styles] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(app, /hiddenInBush: player\.hidden_in_bush \?\? player\.hiddenInBush/);
  assert.match(app, /sprite\.hiddenInBush/);
  assert.match(app, /sprite\.hiddenInBush = Boolean\(spriteData\.hiddenInBush\)/);
  assert.match(app, /actor\.alpha = actor\.hiddenInBush \? 0\.5 : 1/);
  assert.match(app, /class="player-status-tag/);
  assert.match(app, /player\.action_thought \? `<p>\$\{escapeHtml\(player\.action_thought\)\}<\/p>` : ''/);
  assert.match(app, /playerActionStatus\(player\)/);
  assert.match(app, /READY/);
  assert.match(app, /THINKING/);
  assert.match(app, /scoreForSide\(view\.match, board, 'blue'\)/);
  assert.match(app, /scoreForSide\(view\.match, board, 'red'\)/);
  assert.match(app, /class="series-score-url"/);
  assert.match(styles, /\.player-status-tag/);
  assert.match(styles, /\.series-score-url/);
});

test('spectator player panels give spare vertical space to thinking text', async () => {
  const styles = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.match(styles, /\.player-hud \{[\s\S]*grid-template-rows: auto auto minmax\(200px, 1fr\) auto/);
  assert.match(styles, /\.player-hud \{[\s\S]*gap: 14px/);
  assert.match(styles, /\.agent-nameplate \{[\s\S]*grid-template-columns: 74px 1fr/);
  assert.match(styles, /\.agent-nameplate \{[\s\S]*padding-bottom: 14px/);
  assert.match(styles, /\.thinking-box \{[\s\S]*min-height: 200px/);
});

test('attack events update the currently drawn hero actor pose', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.match(app, /applyHeroPose\(sideOf, `agent_\$\{sideOf\}_attack`, 500\)/);
  assert.match(app, /actor\.heroSide === side/);
  assert.match(app, /actor\.animationName = animationName/);
  assert.match(app, /actor\.poseExpiresAt = pose\.expiresAt/);
});
