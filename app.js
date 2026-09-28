import { Game } from './src/core/game.js';
import { EnemyPlanner } from './src/core/enemy-planner.js';
import { GAME, WEAPONS } from './src/data/game.js';
import { UI, SAVE } from './src/data/settings.js';
import { Renderer } from './src/render/renderer.js';
import { AudioManager } from './src/audio/audio.js';
import { SaveStore, parseSave, encodeSave } from './src/save/storage.js';
import { I18n, detectLanguage } from './src/i18n/index.js';

const $ = (id) => document.getElementById(id);
const store = new SaveStore({ getItem: (key) => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) });
const language = detectLanguage(store.loaded ? store.data.settings.language : null, new URL(location.href).searchParams.get('lang'), navigator.language);
const i18n = new I18n(language);
store.data.settings.language = language;
export const audio = new AudioManager(store.data.settings);
export const renderer = new Renderer($('battlefield'));
const enemyPlanner = new EnemyPlanner();
export const game = new Game({ onEvent: handleEvent, planWave: wave => enemyPlanner.get(wave),
  planAttacks: batch => enemyPlanner.attack(batch) });
const keys = new Set();
const directions = new Set();
const input = { axis: 0, targetX: null };
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const renderOptions = { t: i18n.t, reducedMotion: motion.matches };
let activePointer = null;
let pointerStart = null;
let lastTime = null;
let accumulator = 0;
let hudElapsed = 0;
let pendingImport = null;
let lastResult = null;
let recordedDate = null;
let pickupUntil = 0;
let pickupKey = '';
let noticeKey = '';
let offlineKey = 'ready';
let assetsReady = false;

function notify(key) { noticeKey = key; $('notice').textContent = i18n.t(key); $('notice').hidden = false; }
function persist() {
  if (['playing', 'paused', 'dying', 'death'].includes(game.state)) return;
  try { store.persist(); } catch (error) { notify(error.code); }
}
function number(value) { return Math.floor(value).toLocaleString(i18n.language === 'zh' ? 'zh-TW' : i18n.language); }
function clock(seconds) { return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`; }
function setText(id, text) { if ($(id).textContent !== String(text)) $(id).textContent = text; }
function weaponText() { return `L${game.player.level} · ${i18n.t(`weapon.${WEAPONS[game.player.level - 1].id}`)}`; }
function pickupText() { return pickupKey === 'pickup.power' ? `${i18n.t(pickupKey)} · ${weaponText()}` : i18n.t(pickupKey); }
function renderDeath() {
  const cause = i18n.t(`deathCause.${game.deathReason}`);
  const lives = `${i18n.t('deathLives')}: ${number(game.player.lives)}`;
  for (const id of ['death-cause', 'death-notice-cause']) setText(id, cause);
  for (const id of ['death-lives', 'death-notice-lives']) setText(id, lives);
}
function translate() {
  i18n.apply();
  $('language').value = i18n.language;
  $('language').setAttribute('aria-label', i18n.t('language'));
  $('left-button').setAttribute('aria-label', `${i18n.t('move')} ←`);
  $('right-button').setAttribute('aria-label', `${i18n.t('move')} →`);
  $('battlefield').setAttribute('aria-label', i18n.t('title'));
  document.querySelector('.toolbar').setAttribute('aria-label', `${i18n.t('language')} / ${i18n.t('sound')}`);
  document.querySelector('#system-status span').textContent = i18n.t(offlineKey);
  if (noticeKey) $('notice').textContent = i18n.t(noticeKey);
  if (pickupKey) $('pickup-notice').textContent = pickupText();
  renderRecords(); updateScreen(); updateHud();
  if (lastResult) renderResult();
  if ($('archive-dialog').open) renderArchive();
  if (pendingImport) previewImport(pendingImport);
}
function renderRecords() {
  setText('best-score', number(store.data.scores[0]?.score ?? 0).padStart(6, '0'));
  for (const [id, limit] of [['home-leaderboard', UI.previewScores], ['result-leaderboard', SAVE.maxScores]]) {
    const list = $(id); list.replaceChildren();
    if (!store.data.scores.length) {
      const item = document.createElement('li'); item.className = 'empty'; item.textContent = i18n.t('noScores'); list.append(item);
    }
    for (const entry of store.data.scores.slice(0, limit)) {
      const item = document.createElement('li');
      const name = document.createElement('span'); name.textContent = entry.name;
      const score = document.createElement('strong'); score.textContent = number(entry.score);
      item.append(name, score); list.append(item);
    }
  }
}
function updateScreen() {
  const flying = ['playing', 'paused', 'dying', 'death'].includes(game.state);
  const controls = game.state === 'playing' || game.state === 'paused';
  $('home-screen').hidden = game.state !== 'menu';
  $('pause-screen').hidden = game.state !== 'paused';
  $('death-notice').hidden = game.state !== 'dying';
  $('death-screen').hidden = game.state !== 'death';
  $('continue-button').hidden = game.player.lives <= 0;
  $('results-screen').hidden = game.state !== 'gameover';
  $('hud').hidden = !flying;
  $('pause-button').hidden = !controls;
  $('briefing').hidden = game.state !== 'menu';
  $('flight-controls').hidden = !controls;
  $('archive-button').hidden = flying;
  if (!controls) $('pickup-notice').hidden = true;
  if (game.state === 'dying' || game.state === 'death') renderDeath();
  document.querySelector('.main').classList.toggle('in-flight', flying);
  $('flight-status').dataset.i18n = flying ? 'live' : 'standby';
  $('flight-status').textContent = i18n.t(flying ? 'live' : 'standby');
}
function updateHud() {
  const player = game.player;
  setText('score', number(game.score).padStart(6, '0'));
  setText('wave', String(game.wave).padStart(2, '0'));
  setText('hp-value', Math.ceil(player.hp)); $('hp').value = player.hp;
  setText('lives', String(player.lives).padStart(2, '0'));
  setText('weapon', weaponText());
  setText('mobile-weapon', weaponText());
  setText('combo', `×${Math.max(1, game.combo)}`);
  setText('equipment', [player.shield ? i18n.t('shield') : '', player.homing ? i18n.t('homing') : ''].filter(Boolean).join(' / '));
  const track = audio.currentTrack;
  setText('track-name', track ? i18n.t(`track.${typeof track === 'string' ? track : track.id}`) : '');
}
function clearInput() {
  keys.clear(); directions.clear(); input.axis = 0; input.targetX = null; activePointer = null; pointerStart = null;
  $('left-button').classList.remove('pressed'); $('right-button').classList.remove('pressed');
}
function togglePause() {
  if (!['playing', 'paused'].includes(game.state)) return;
  clearInput(); game.togglePause(); accumulator = 0; updateScreen();
  if (game.state === 'paused') $('resume-button').focus(); else $('battlefield').focus({ preventScroll: true });
}
function start() {
  if (!assetsReady) return;
  if ($('archive-dialog').open) $('archive-dialog').close();
  saveCallsign();
  lastResult = null; recordedDate = null; clearInput(); pickupUntil = 0; pickupKey = '';
  $('pickup-notice').hidden = true;
  $('save-score').disabled = false; $('save-score').dataset.i18n = 'saveScore'; $('save-score').textContent = i18n.t('saveScore');
  game.start(); accumulator = 0; lastTime = null; updateScreen(); updateHud();
  $('battlefield').focus({ preventScroll: true });
  audio.unlock().catch(() => notify('audioUnavailable'));
}
function handleEvent(event) {
  renderer.event(event);
  if (event.type === 'death') audio.sfx('explosion');
  else if (event.type !== 'deathmenu' && event.type !== 'continue') audio.sfx(event.type);
  if (event.type === 'pickup') {
    pickupKey = `pickup.${event.pickup}`; pickupUntil = game.time + UI.pickupNotice;
    $('pickup-notice').textContent = pickupText(); $('pickup-notice').hidden = false;
  }
  if (event.type === 'death') {
    clearInput(); pickupUntil = 0; $('pickup-notice').hidden = true;
    updateScreen(); updateHud();
  }
  if (event.type === 'deathmenu') {
    updateScreen(); updateHud();
    $('continue-button').focus({ preventScroll: true });
  }
  if (event.type === 'gameover') {
    clearInput(); lastResult = { score: game.score, wave: game.wave, kills: game.kills, time: game.time };
    $('new-record').hidden = game.score <= (store.data.scores[0]?.score ?? 0);
    const entry = store.recordRun(lastResult, $('callsign').value || SAVE.defaultName);
    recordedDate = entry.date; persist(); renderRecords(); renderResult(); updateScreen();
    $('retry-button').focus({ preventScroll: true });
  }
}
function renderResult() {
  setText('result-score', number(lastResult.score)); setText('result-wave', lastResult.wave);
  setText('result-kills', lastResult.kills); setText('result-time', clock(lastResult.time));
}
function saveCallsign() {
  if (!recordedDate) return;
  const name = $('callsign').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, SAVE.callsignLength).padEnd(SAVE.callsignLength, 'X');
  const entry = store.data.scores.find((score) => score.date === recordedDate);
  if (entry) entry.name = name;
  persist(); renderRecords();
}
function renderAudioSettings() {
  for (const channel of ['bgm', 'sfx']) {
    $(`${channel}-enabled`).checked = store.data.settings[`${channel}Enabled`];
    $(`${channel}-volume`).value = store.data.settings[`${channel}Volume`];
    $(`${channel}-output`).value = store.data.settings[`${channel}Volume`];
  }
}
function renderArchive() {
  const { stats, updatedAt, scores } = store.data;
  $('archive-stats').textContent = `${i18n.t('runs')} ${number(stats.runs)}  /  ${i18n.t('bestWave')} ${stats.bestWave}  /  ${i18n.t('record')} ${number(scores[0]?.score ?? 0)}`;
  $('archive-stats').title = `${i18n.t('date')}: ${new Date(updatedAt).toLocaleString()}`;
}
function archiveMessage(key) { $('archive-message').textContent = i18n.t(key); }
function previewImport(save) {
  pendingImport = save; $('import-preview').hidden = false;
  $('preview-summary').textContent = `${i18n.t('runs')}: ${number(save.stats.runs)} · ${i18n.t('record')}: ${number(save.scores[0]?.score ?? 0)} · ${i18n.t('date')}: ${new Date(save.updatedAt).toLocaleString()}`;
}
function parseImport() {
  pendingImport = null; $('import-preview').hidden = true; $('archive-message').textContent = '';
  try { previewImport(parseSave($('save-code').value)); } catch (error) { archiveMessage(error.code); }
}

$('start-button').addEventListener('click', start);
$('retry-button').addEventListener('click', start);
$('continue-button').addEventListener('click', () => {
  if (!game.continueChallenge()) return;
  clearInput(); accumulator = 0; lastTime = null; pickupUntil = 0; pickupKey = '';
  $('pickup-notice').hidden = true; updateScreen(); updateHud();
  $('battlefield').focus({ preventScroll: true });
});
$('restart-button').addEventListener('click', start);
$('home-button').addEventListener('click', () => { saveCallsign(); game.state = 'menu'; updateScreen(); $('start-button').focus(); });
$('pause-button').addEventListener('click', togglePause);
$('resume-button').addEventListener('click', togglePause);
$('callsign-form').addEventListener('submit', (event) => {
  event.preventDefault(); saveCallsign(); $('save-score').disabled = true;
  $('save-score').dataset.i18n = 'scoreSaved'; $('save-score').textContent = i18n.t('scoreSaved');
});
$('callsign').addEventListener('input', () => { $('save-score').disabled = false; $('save-score').dataset.i18n = 'saveScore'; $('save-score').textContent = i18n.t('saveScore'); });
$('language').addEventListener('change', () => {
  i18n.set($('language').value); store.data.settings.language = i18n.language; translate(); persist();
});
window.addEventListener('popstate', () => {
  i18n.language = detectLanguage(store.data.settings.language, new URL(location.href).searchParams.get('lang'));
  store.data.settings.language = i18n.language; translate(); persist();
});
document.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('dialog')) return;
  const key = event.key.toLowerCase();
  const editing = event.target.closest('textarea, input:not([type="range"]):not([type="checkbox"])');
  if (['p', 'escape'].includes(key) && !event.repeat && !editing) {
    event.preventDefault(); togglePause(); return;
  }
  if (event.target.closest('input, textarea, select')) return;
  if (['arrowleft', 'arrowright', 'a', 'd'].includes(key) && ['playing', 'paused'].includes(game.state)) {
    event.preventDefault(); keys.add(key); input.targetX = null;
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
function suspend() { clearInput(); if (game.state === 'playing') { game.pause(); accumulator = 0; updateScreen(); } }
window.addEventListener('blur', suspend);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
for (const [id, direction] of [['left-button', -1], ['right-button', 1]]) {
  const button = $(id);
  let pressTime = null;
  let pressX = 0;
  button.addEventListener('pointerdown', (event) => {
    if (game.state !== 'playing') return;
    pressTime = game.time; pressX = game.player.x;
    event.preventDefault(); button.setPointerCapture(event.pointerId); directions.add(direction); input.targetX = null; button.classList.add('pressed');
  });
  const release = () => { directions.delete(direction); button.classList.remove('pressed'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  button.addEventListener('pointerup', () => {
    if (game.state === 'playing' && pressTime !== null && game.time - pressTime <= UI.tapDuration)
      input.targetX = pressX + direction * UI.tapStep;
    pressTime = null;
  });
  button.addEventListener('click', (event) => {
    if (game.state === 'playing' && event.detail === 0) input.targetX = game.player.x + direction * UI.tapStep;
  });
}
$('battlefield').addEventListener('pointerdown', (event) => {
  if (game.state !== 'playing' || activePointer !== null) return;
  event.preventDefault(); activePointer = event.pointerId;
  pointerStart = { clientX: event.clientX, x: game.player.x };
  $('battlefield').setPointerCapture(event.pointerId);
});
$('battlefield').addEventListener('pointermove', (event) => {
  if (event.pointerId !== activePointer || game.state !== 'playing') return;
  const rect = $('battlefield').getBoundingClientRect();
  input.targetX = pointerStart.x + (event.clientX - pointerStart.clientX) * GAME.width / rect.width;
});
const releasePointer = (event) => { if (event.pointerId === activePointer) { activePointer = null; pointerStart = null; input.targetX = null; } };
$('battlefield').addEventListener('pointerup', releasePointer);
$('battlefield').addEventListener('pointercancel', releasePointer);
$('battlefield').addEventListener('lostpointercapture', releasePointer);

$('audio-button').addEventListener('click', () => {
  $('audio-panel').hidden = !$('audio-panel').hidden;
  $('audio-button').setAttribute('aria-expanded', String(!$('audio-panel').hidden));
  audio.unlock().catch(() => notify('audioUnavailable'));
});
$('audio-close').addEventListener('click', () => { $('audio-panel').hidden = true; $('audio-button').setAttribute('aria-expanded', 'false'); $('audio-button').focus(); });
for (const channel of ['bgm', 'sfx']) {
  for (const control of ['enabled', 'volume']) $(`${channel}-${control}`).addEventListener('input', () => {
    store.data.settings[`${channel}Enabled`] = $(`${channel}-enabled`).checked;
    store.data.settings[`${channel}Volume`] = Number($(`${channel}-volume`).value);
    $(`${channel}-output`).value = $(`${channel}-volume`).value;
    audio.setSettings(store.data.settings); persist();
  });
  $(`${channel}-enabled`).addEventListener('change', () => audio.unlock().catch(() => notify('audioUnavailable')));
}
audio.onError = () => notify('audioUnavailable');
$('archive-button').addEventListener('click', () => { renderArchive(); $('archive-message').textContent = ''; $('archive-dialog').showModal(); });
$('archive-close').addEventListener('click', () => $('archive-dialog').close());
$('export-file').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'airhive-save.json'; anchor.click();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
});
$('export-code').addEventListener('click', () => {
  $('save-code').value = encodeSave(store.data); $('save-code').focus(); $('save-code').select(); archiveMessage('exported');
  pendingImport = null; $('import-preview').hidden = true;
});
$('preview-import').addEventListener('click', parseImport);
$('cancel-import').addEventListener('click', () => {
  pendingImport = null; $('import-preview').hidden = true; $('save-code').focus();
});
$('save-code').addEventListener('input', () => { pendingImport = null; $('import-preview').hidden = true; });
$('import-file').addEventListener('change', async () => {
  const file = $('import-file').files[0]; if (!file) return;
  pendingImport = null; $('import-preview').hidden = true;
  if (file.size > SAVE.maxBytes) { archiveMessage('invalidSave'); return; }
  try { $('save-code').value = await file.text(); parseImport(); } catch { archiveMessage('invalidSave'); }
  $('import-file').value = '';
});
document.querySelector('.file-label').addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('import-file').click(); } });
$('confirm-import').addEventListener('click', () => {
  if (!pendingImport || ['playing', 'paused'].includes(game.state)) return;
  try {
    store.import(pendingImport); pendingImport = null; $('import-preview').hidden = true; recordedDate = null;
    i18n.set(store.data.settings.language); audio.setSettings(store.data.settings); renderAudioSettings(); translate(); archiveMessage('imported');
  } catch (error) { archiveMessage(error.code); }
});
motion.addEventListener('change', () => { renderOptions.reducedMotion = motion.matches; });

async function frame(timestamp) {
  const dt = lastTime === null ? 0 : Math.min((timestamp - lastTime) / 1000, UI.maxFrame); lastTime = timestamp;
  input.axis = Number(keys.has('arrowright') || keys.has('d') || directions.has(1)) - Number(keys.has('arrowleft') || keys.has('a') || directions.has(-1));
  if (game.state === 'playing' || game.state === 'dying') {
    accumulator += dt;
    while (accumulator >= GAME.step && (game.state === 'playing' || game.state === 'dying')) {
      accumulator -= GAME.step;
      await game.update(GAME.step, input);
    }
    if (game.state !== 'playing' && game.state !== 'dying') accumulator = 0;
  } else accumulator = 0;
  renderer.render(game, dt, renderOptions);
  hudElapsed += dt;
  if (hudElapsed >= UI.hudInterval) { updateHud(); hudElapsed = 0; }
  if (pickupUntil && game.time >= pickupUntil) { $('pickup-notice').hidden = true; pickupUntil = 0; }
  requestAnimationFrame(frame);
}

translate(); renderAudioSettings();
if (store.error) notify(store.error);
try {
  await renderer.load(); assetsReady = true;
  $('start-button').disabled = false; $('start-button').querySelector('[data-i18n]').dataset.i18n = 'launch';
  $('start-button').querySelector('[data-i18n]').textContent = i18n.t('launch');
  requestAnimationFrame(frame);
} catch (error) { console.error('Airhive assets:', error); notify('assetsUnavailable'); }
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(async (registration) => {
    await navigator.serviceWorker.ready; offlineKey = 'offline';
    document.querySelector('#system-status span').textContent = i18n.t(offlineKey);
    const showUpdate = () => { if (registration.waiting && navigator.serviceWorker.controller) { offlineKey = 'updating'; document.querySelector('#system-status span').textContent = i18n.t(offlineKey); } };
    showUpdate(); registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', showUpdate));
  }).catch((error) => console.warn('Offline installation unavailable:', error));
}
