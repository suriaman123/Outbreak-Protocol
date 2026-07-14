import * as THREE from 'three';
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
const state = {
  avatar: null,           // 'male' | 'female'
  loadout: { primary: null, secondary: null, melee: null },
  started: false,
  gameOver: false,
  levelUpActive: false,
  kills: 0
};

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

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 500);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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
  audio.playLevelUp();
  document.exitPointerLock();
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
  if (state.started && !state.gameOver) renderer.domElement.requestPointerLock();
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
}

// ======================================================================
// POINTER LOCK / PAUSE / DEATH HANDLING
// ======================================================================
const overlay = document.getElementById('overlay-message');

function startGame() {
  if (!worldData) initWorld();
  state.started = true;
  state.gameOver = false;
  renderer.domElement.requestPointerLock();
  updateHealthUI();
  updateZombieCountUI();
  clock.start();
  requestAnimationFrame(animate);
}

renderer.domElement.addEventListener('click', () => {
  if (state.started && !state.gameOver && !state.levelUpActive && document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  if (state.gameOver || state.levelUpActive) return;
  const locked = document.pointerLockElement === renderer.domElement;
  if (!locked && state.started) {
    overlay.classList.remove('hidden');
    document.getElementById('overlay-title').textContent = 'PAUSED';
    document.getElementById('overlay-btn').textContent = 'RESUME';
    document.getElementById('overlay-stats').textContent = 'CLICK RESUME TO CONTINUE';
    document.getElementById('interact-prompt').classList.add('hidden');
  } else if (locked) {
    overlay.classList.add('hidden');
  }
});

document.getElementById('overlay-btn').addEventListener('click', () => {
  if (state.gameOver) {
    location.reload();
  } else {
    renderer.domElement.requestPointerLock();
  }
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
  document.exitPointerLock();
  overlay.classList.remove('hidden');
  document.getElementById('overlay-title').textContent = 'YOU DIED';
  document.getElementById('overlay-btn').textContent = 'RETURN TO BASE';
  document.getElementById('overlay-stats').innerHTML =
    `HOSTILES ELIMINATED: <span>${state.kills}</span>`;
}

// ======================================================================
// MAIN LOOP
// ======================================================================
function animate() {
  if (!state.started) return;
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);

  if (document.pointerLockElement === renderer.domElement && !state.levelUpActive) {
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

  renderer.render(scene, camera);
}
