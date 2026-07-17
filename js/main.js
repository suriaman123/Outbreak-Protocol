import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { buildWorld, WORLD_SIZE } from './world.js';
import { Player } from './player.js';
import { PRIMARY_WEAPONS, SECONDARY_WEAPONS, MELEE_WEAPONS } from './weapons.js';
import { ZombieManager } from './zombies.js';
import { WeaponSystem } from './combat.js';
import { Progression } from './progression.js';
import { LootManager } from './loot.js';
import { Minimap } from './minimap.js';
import { audio } from './audio.js';

// ======================================================================
// GAME STATE
// ======================================================================
const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;

const state = {
  avatar: null,           // 'male' | 'female'
  loadout: { primary: null, secondary: null, melee: null },
  started: false,
  gameOver: false,
  levelUpActive: false,
  controlsLocked: false,  // unified "actively playing" flag for both pointer-lock (desktop) and touch (mobile)
  mobile: isMobile,
  kills: 0
};

// ======================================================================
// BEST SCORE (localStorage)
// ======================================================================
const BEST_SCORE_KEY = 'outbreak_protocol_best_score';

function getBestScore() {
  return parseInt(localStorage.getItem(BEST_SCORE_KEY) || '0', 10);
}

function computeScore() {
  const level = progression ? progression.level : 1;
  return state.kills * 10 + (level - 1) * 100;
}

function saveBestScoreIfHigher(score) {
  const best = getBestScore();
  if (score > best) {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
    return true;
  }
  return false;
}

function refreshBestScoreBadge() {
  document.getElementById('best-score-value').textContent = getBestScore();
}
refreshBestScoreBadge();

// ======================================================================
// MENU WIRING
// ======================================================================
const avatarCards = document.querySelectorAll('.avatar-card');
avatarCards.forEach(card => {
  card.addEventListener('click', () => {
    avatarCards.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.avatar = card.dataset.avatar;
    refreshDeployReadiness();
  });
});

function renderWeaponList(containerId, weapons, slotKey) {
  const container = document.getElementById(containerId);
  weapons.forEach(w => {
    const card = document.createElement('div');
    card.className = 'weapon-card';
    card.dataset.id = w.id;
    const statLine = w.pellets
      ? `DMG ${w.damage}x${w.pellets} &bull; MAG ${w.magSize}`
      : (w.slot === 'melee' ? `DMG ${w.damage} &bull; SPD ${w.fireRate}/s` : `DMG ${w.damage} &bull; MAG ${w.magSize}`);
    card.innerHTML = `
      <div class="weapon-icon"></div>
      <div class="weapon-info">
        <div class="wname">${w.name}</div>
        <div class="wstats">${statLine} &bull; ${w.desc}</div>
      </div>`;
    card.addEventListener('click', () => {
      container.querySelectorAll('.weapon-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.loadout[slotKey] = w.id;
      refreshDeployReadiness();
    });
    container.appendChild(card);
  });
}
renderWeaponList('list-primary', PRIMARY_WEAPONS, 'primary');
renderWeaponList('list-secondary', SECONDARY_WEAPONS, 'secondary');
renderWeaponList('list-melee', MELEE_WEAPONS, 'melee');

const deployBtn = document.getElementById('deploy-btn');
const loadoutSummary = document.getElementById('loadout-summary');

function refreshDeployReadiness() {
  const ready = state.avatar && state.loadout.primary && state.loadout.secondary && state.loadout.melee;
  deployBtn.disabled = !ready;
  if (ready) {
    const p = PRIMARY_WEAPONS.find(w => w.id === state.loadout.primary);
    const s = SECONDARY_WEAPONS.find(w => w.id === state.loadout.secondary);
    const m = MELEE_WEAPONS.find(w => w.id === state.loadout.melee);
    loadoutSummary.innerHTML = `OPERATIVE <span>${state.avatar === 'male' ? 'CPL. DRAKE' : 'SGT. VASQUEZ'}</span> &nbsp;|&nbsp; <span>${p.name}</span> + <span>${s.name}</span> + <span>${m.name}</span>`;
  } else {
    loadoutSummary.textContent = 'SELECT AN OPERATIVE AND FULL LOADOUT TO DEPLOY';
  }
}
refreshDeployReadiness();

if (state.mobile) {
  document.getElementById('controls-hint').textContent =
    'LEFT STICK MOVE \u2022 DRAG RIGHT SIDE TO LOOK \u2022 FIRE / RLD / JUMP BUTTONS \u2022 TAP 1/2/3 TO SWITCH';
  document.getElementById('loading-note').textContent = 'TAP DEPLOY TO BEGIN';
}

deployBtn.addEventListener('click', () => {
  if (deployBtn.disabled) return;
  audio.init();
  document.getElementById('menu-root').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  startGame();
});

// ======================================================================
// THREE.JS SETUP
// ======================================================================
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 500);
scene.add(camera); // REQUIRED: the weapon viewmodel is parented to the camera, so the
                    // camera must be part of the scene graph or the renderer never finds it

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55,  // strength
  0.4,   // radius
  0.82   // threshold — only genuinely bright things (muzzle flash, tracers, eyes) bloom
);
composer.addPass(bloomPass);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

let worldData = null;
let player = null;
let zombieManager = null;
let weaponSystem = null;
let progression = null;
let lootManager = null;
let minimap = null;
let clock = new THREE.Clock();

// ======================================================================
// HUD HELPERS
// ======================================================================
const hudHelpers = {
  flashHitmarker() {
    const el = document.getElementById('hit-marker');
    el.classList.remove('show');
    void el.offsetWidth; // restart animation
    el.classList.add('show');
  }
};

function flashDamageVignette() {
  const el = document.getElementById('damage-vignette');
  el.classList.add('hit');
  clearTimeout(flashDamageVignette._t);
  flashDamageVignette._t = setTimeout(() => el.classList.remove('hit'), 300);
}

function updateHealthUI() {
  const pct = Math.max(0, (player.health / player.maxHealth) * 100);
  document.getElementById('health-fill').style.width = pct + '%';
  document.getElementById('health-text').textContent = Math.ceil(Math.max(0, player.health));
  document.getElementById('damage-vignette').classList.toggle('low-health', pct > 0 && pct <= 30);
}

function updateZombieCountUI() {
  document.getElementById('zombie-count').textContent = zombieManager.getAliveCount();
}

function updateProgressionUI({ level, xp, xpToNext }) {
  document.getElementById('level-value').textContent = level;
  const pct = Math.min(100, (xp / xpToNext) * 100);
  document.getElementById('xp-bar-fill').style.width = pct + '%';
}

function showLevelUpBanner(choices) {
  state.levelUpActive = true;
  state.controlsLocked = false;
  audio.playLevelUp();
  if (document.pointerLockElement) document.exitPointerLock();
  const banner = document.getElementById('levelup-banner');
  const choicesEl = document.getElementById('levelup-choices');
  choicesEl.innerHTML = '';
  choices.forEach((choice, i) => {
    const div = document.createElement('div');
    div.className = 'levelup-choice';
    div.innerHTML = `<div class="lu-title">${choice.title}</div><div class="lu-desc">${choice.desc}</div>`;
    div.addEventListener('click', () => {
      progression.chooseUpgrade(choice);
    });
    choicesEl.appendChild(div);
  });
  banner.classList.remove('hidden');
}

function hideLevelUpBanner() {
  document.getElementById('levelup-banner').classList.add('hidden');
  state.levelUpActive = false;
  if (state.started && !state.gameOver) {
    if (state.mobile) {
      state.controlsLocked = true;
    } else {
      renderer.domElement.requestPointerLock();
    }
  }
}

function updateLootPrompt(inRange, progress) {
  const prompt = document.getElementById('interact-prompt');
  if (inRange) {
    prompt.classList.remove('hidden');
    document.getElementById('loot-progress-fill').style.width = Math.min(100, progress * 100) + '%';
  } else {
    prompt.classList.add('hidden');
  }
}

const LOOT_LABELS = {
  xp: amt => `+${amt} XP RECOVERED`,
  health: amt => `+${amt} HEALTH RESTORED`,
  weapon: () => 'AMMO CACHE RESUPPLIED'
};

function handleLootOpen(type) {
  audio.playLootPickup();
  let amount = 0;
  if (type === 'xp') {
    amount = 40 + Math.floor(Math.random() * 30);
    progression.addXp(amount);
  } else if (type === 'health') {
    amount = 30 + Math.floor(Math.random() * 20);
    player.heal(amount);
    updateHealthUI();
  } else if (type === 'weapon') {
    weaponSystem.resupplyAmmo();
  }
  addKillfeedEntry(null, false, LOOT_LABELS[type](amount));
}

function addKillfeedEntry(zombie, headshot, customText) {
  const feed = document.getElementById('killfeed');
  const entry = document.createElement('div');
  entry.className = 'kill-entry';
  if (customText) {
    entry.textContent = customText;
  } else {
    const kind = zombie.isFat ? 'BLOATED HOSTILE' : 'HOSTILE';
    entry.textContent = headshot ? `${kind} ELIMINATED \u2014 HEADSHOT` : `${kind} ELIMINATED`;
  }
  feed.appendChild(entry);
  setTimeout(() => entry.remove(), 3000);
  while (feed.children.length > 6) feed.removeChild(feed.firstChild);
}

// ======================================================================
// WORLD / GAME INIT
// ======================================================================
function initWorld() {
  worldData = buildWorld(scene);
  player = new Player(camera, renderer.domElement, worldData.colliders);

  let sx, sz, tries = 0;
  do {
    sx = (Math.random() - 0.5) * WORLD_SIZE * 1.2;
    sz = (Math.random() - 0.5) * WORLD_SIZE * 1.2;
    tries++;
  } while (Math.hypot(sx, sz) > WORLD_SIZE - 15 && tries < 30);
  player.spawnAt(sx, sz);

  zombieManager = new ZombieManager(scene, worldData.colliders);
  lootManager = new LootManager(scene, worldData.colliders);
  minimap = new Minimap(document.getElementById('minimap-canvas'));

  progression = new Progression({
    player,
    zombieManager,
    onLevelUpStart: showLevelUpBanner,
    onLevelUpEnd: hideLevelUpBanner,
    onChange: updateProgressionUI
  });

  weaponSystem = new WeaponSystem({
    camera,
    weaponAnchor: player.weaponAnchor,
    scene,
    loadout: state.loadout,
    zombieManager,
    hud: hudHelpers,
    getDamageMultiplier: () => progression.getDamageMultiplier(),
    onKill: (zombie, headshot) => {
      state.kills++;
      addKillfeedEntry(zombie, headshot);
      progression.addKillXp(zombie.isFat, headshot);
    }
  });

  // tapping weapon slot icons switches weapons on both desktop and mobile
  document.querySelectorAll('.slot').forEach(el => {
    el.addEventListener('click', () => weaponSystem.switchSlot(Number(el.dataset.slot)));
  });
}

// ======================================================================
// POINTER LOCK / PAUSE / DEATH / QUIT HANDLING
// ======================================================================
const overlay = document.getElementById('overlay-message');
const overlayBtn = document.getElementById('overlay-btn');
const overlayQuitBtn = document.getElementById('overlay-quit-btn');
const mobilePauseBtn = document.getElementById('mobile-pause-btn');
const touchControls = document.getElementById('touch-controls');

function startGame() {
  if (!worldData) initWorld();
  state.started = true;
  state.gameOver = false;

  if (state.mobile) {
    mobilePauseBtn.classList.remove('hidden');
    touchControls.classList.remove('hidden');
    state.controlsLocked = true;
    // best-effort fullscreen + landscape lock; silently ignored where unsupported
    const fsEl = document.documentElement;
    if (fsEl.requestFullscreen) {
      fsEl.requestFullscreen().catch(() => {});
    }
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }
  } else {
    renderer.domElement.requestPointerLock();
  }

  updateHealthUI();
  updateZombieCountUI();
  clock.start();
  requestAnimationFrame(animate);
}

renderer.domElement.addEventListener('click', () => {
  if (state.mobile) return;
  if (state.started && !state.gameOver && !state.levelUpActive && document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});

function showPauseOverlay() {
  overlay.classList.remove('hidden');
  document.getElementById('overlay-title').textContent = 'PAUSED';
  overlayBtn.textContent = 'RESUME';
  document.getElementById('overlay-stats').textContent = 'SURVIVAL SCORE: ' + computeScore();
  overlayQuitBtn.classList.remove('hidden');
  document.getElementById('interact-prompt').classList.add('hidden');
}

// desktop: Esc releases pointer lock natively, which we detect here
document.addEventListener('pointerlockchange', () => {
  if (state.mobile || state.gameOver || state.levelUpActive) return;
  const locked = document.pointerLockElement === renderer.domElement;
  state.controlsLocked = locked;
  if (!locked && state.started) {
    showPauseOverlay();
  } else if (locked) {
    overlay.classList.add('hidden');
  }
});

// mobile: dedicated pause button since there's no Esc key
mobilePauseBtn.addEventListener('click', () => {
  if (!state.started || state.gameOver || state.levelUpActive) return;
  state.controlsLocked = false;
  showPauseOverlay();
});

overlayBtn.addEventListener('click', () => {
  if (state.gameOver) {
    location.reload();
    return;
  }
  overlay.classList.add('hidden');
  if (state.mobile) {
    state.controlsLocked = true;
  } else {
    renderer.domElement.requestPointerLock();
  }
});

overlayQuitBtn.addEventListener('click', () => {
  const score = computeScore();
  saveBestScoreIfHigher(score);
  location.reload();
});

function handlePlayerHit(damage) {
  const died = player.takeDamage(damage);
  updateHealthUI();
  flashDamageVignette();
  audio.playPlayerHurt();
  if (died) handleDeath();
}

function handleDeath() {
  state.started = false;
  state.gameOver = true;
  state.controlsLocked = false;
  if (document.pointerLockElement) document.exitPointerLock();

  const score = computeScore();
  const isNewBest = saveBestScoreIfHigher(score);

  overlay.classList.remove('hidden');
  document.getElementById('overlay-title').textContent = 'YOU DIED';
  overlayBtn.textContent = 'RETURN TO BASE';
  overlayQuitBtn.classList.add('hidden');
  document.getElementById('overlay-stats').innerHTML =
    `HOSTILES ELIMINATED: <span>${state.kills}</span><br>` +
    `SURVIVAL SCORE: <span>${score}</span>${isNewBest ? ' \u2014 NEW BEST!' : ''}<br>` +
    `BEST SCORE: <span>${getBestScore()}</span>`;
}

// ======================================================================
// MOBILE TOUCH CONTROLS
// ======================================================================
if (state.mobile) {
  const joystickBase = document.getElementById('joystick-base');
  const joystickStick = document.getElementById('joystick-stick');
  const lookZone = document.getElementById('touch-look-zone');
  const fireBtn = document.getElementById('touch-fire-btn');
  const reloadBtn = document.getElementById('touch-reload-btn');
  const jumpBtn = document.getElementById('touch-jump-btn');

  let joystickTouchId = null;
  let joyCenter = { x: 0, y: 0 };
  const JOY_MAX_RADIUS = 40;

  joystickBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!state.controlsLocked) return;
    const t = e.changedTouches[0];
    joystickTouchId = t.identifier;
    const rect = joystickBase.getBoundingClientRect();
    joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, { passive: false });

  joystickBase.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== joystickTouchId) continue;
      let dx = t.clientX - joyCenter.x;
      let dy = t.clientY - joyCenter.y;
      const dist = Math.hypot(dx, dy);
      if (dist > JOY_MAX_RADIUS) { dx = (dx / dist) * JOY_MAX_RADIUS; dy = (dy / dist) * JOY_MAX_RADIUS; }
      joystickStick.style.transform = `translate(${dx}px, ${dy}px)`;
      if (player) player.setAnalogMove(dx / JOY_MAX_RADIUS, -dy / JOY_MAX_RADIUS);
    }
  }, { passive: false });

  function releaseJoystick(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === joystickTouchId) {
        joystickTouchId = null;
        joystickStick.style.transform = 'translate(0,0)';
        if (player) player.setAnalogMove(0, 0);
      }
    }
  }
  joystickBase.addEventListener('touchend', releaseJoystick);
  joystickBase.addEventListener('touchcancel', releaseJoystick);

  let lookTouchId = null;
  let lastLookX = 0, lastLookY = 0;

  lookZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!state.controlsLocked) return;
    const t = e.changedTouches[0];
    lookTouchId = t.identifier;
    lastLookX = t.clientX; lastLookY = t.clientY;
  }, { passive: false });

  lookZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!state.controlsLocked || !player) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== lookTouchId) continue;
      const dx = t.clientX - lastLookX;
      const dy = t.clientY - lastLookY;
      lastLookX = t.clientX; lastLookY = t.clientY;
      player.lookTouchDelta(dx, dy);
    }
  }, { passive: false });

  lookZone.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) if (t.identifier === lookTouchId) lookTouchId = null;
  });

  fireBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!state.controlsLocked || !weaponSystem) return;
    weaponSystem.startFiring();
  }, { passive: false });
  fireBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (weaponSystem) weaponSystem.stopFiring();
  }, { passive: false });
  fireBtn.addEventListener('touchcancel', () => { if (weaponSystem) weaponSystem.stopFiring(); });

  reloadBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!state.controlsLocked || !weaponSystem) return;
    weaponSystem.startReload();
  }, { passive: false });

  jumpBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!state.controlsLocked || !player) return;
    player.jump();
  }, { passive: false });
}

// ======================================================================
// MAIN LOOP
// ======================================================================
function animate() {
  if (!state.started) return;
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);

  if (state.controlsLocked && !state.levelUpActive) {
    player.update(delta);
    weaponSystem.update(delta);
    zombieManager.update(delta, player.position, handlePlayerHit, () => updateZombieCountUI());
    lootManager.update(delta, player.position, handleLootOpen, updateLootPrompt);
    updateZombieCountUI();

    worldData.particles.rotation.y += delta * 0.01;
  }

  if (minimap && !state.gameOver) minimap.update(camera, player.position, zombieManager, lootManager);
  if (progression && !state.gameOver) progression.tick();
  if (player && !state.gameOver) updateHealthUI();

  composer.render();
}
