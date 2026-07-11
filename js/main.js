import * as THREE from 'three';
import { buildWorld, WORLD_SIZE } from './world.js';
import { Player } from './player.js';
import { PRIMARY_WEAPONS, SECONDARY_WEAPONS, MELEE_WEAPONS } from './weapons.js';
import { ZombieManager } from './zombies.js';
import { WeaponSystem } from './combat.js';

// ======================================================================
// GAME STATE
// ======================================================================
const state = {
  avatar: null,           // 'male' | 'female'
  loadout: { primary: null, secondary: null, melee: null },
  started: false,
  gameOver: false,
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
}

function updateZombieCountUI() {
  document.getElementById('zombie-count').textContent = zombieManager.getAliveCount();
}

function addKillfeedEntry(zombie, headshot) {
  const feed = document.getElementById('killfeed');
  const entry = document.createElement('div');
  entry.className = 'kill-entry';
  const kind = zombie.isFat ? 'BLOATED HOSTILE' : 'HOSTILE';
  entry.textContent = headshot ? `${kind} ELIMINATED \u2014 HEADSHOT` : `${kind} ELIMINATED`;
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

  weaponSystem = new WeaponSystem({
    camera,
    weaponAnchor: player.weaponAnchor,
    scene,
    loadout: state.loadout,
    zombieManager,
    hud: hudHelpers,
    onKill: (zombie, headshot) => {
      state.kills++;
      addKillfeedEntry(zombie, headshot);
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
  if (state.started && !state.gameOver && document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  if (state.gameOver) return;
  const locked = document.pointerLockElement === renderer.domElement;
  if (!locked && state.started) {
    overlay.classList.remove('hidden');
    document.getElementById('overlay-title').textContent = 'PAUSED';
    document.getElementById('overlay-btn').textContent = 'RESUME';
    document.getElementById('overlay-stats').textContent = 'CLICK RESUME TO CONTINUE';
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

  if (document.pointerLockElement === renderer.domElement) {
    player.update(delta);
    weaponSystem.update(delta);
    zombieManager.update(delta, player.position, handlePlayerHit, () => updateZombieCountUI());
    updateZombieCountUI();

    worldData.particles.rotation.y += delta * 0.01;
  }

  renderer.render(scene, camera);
}
