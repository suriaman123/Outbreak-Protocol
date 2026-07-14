import * as THREE from 'three';
import { WORLD_SIZE } from './world.js';

const PICKUP_RADIUS = 2.4;
const MAX_BOXES = 6;
const RESPAWN_DELAY = 4; // seconds after a box is opened before a new one appears

const LOOT_COLORS = {
  xp: 0x9dff3c,
  health: 0xc1272d,
  weapon: 0xb4552f
};

function rollLootType() {
  const r = Math.random();
  if (r < 0.4) return 'xp';
  if (r < 0.72) return 'health';
  return 'weapon';
}

function buildCrateMesh(type) {
  const group = new THREE.Group();
  const color = LOOT_COLORS[type];

  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x2a2820, roughness: 0.8, metalness: 0.1 })
  );
  crate.castShadow = true;
  group.add(crate);

  // glowing edge frame to sell the "loot" read at a distance
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.62, 0.62, 0.62)),
    new THREE.LineBasicMaterial({ color })
  );
  group.add(edges);

  const light = new THREE.PointLight(color, 1.4, 5);
  light.position.set(0, 0.4, 0);
  group.add(light);

  // small icon sprite floating above the crate
  const iconCanvas = document.createElement('canvas');
  iconCanvas.width = iconCanvas.height = 64;
  const ctx = iconCanvas.getContext('2d');
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glyph = type === 'xp' ? '\u2726' : type === 'health' ? '+' : '\u2726';
  ctx.fillText(glyph, 32, 34);
  const iconTex = new THREE.CanvasTexture(iconCanvas);
  const iconSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex, transparent: true, depthWrite: false }));
  iconSprite.scale.set(0.5, 0.5, 0.5);
  iconSprite.position.set(0, 0.7, 0);
  group.add(iconSprite);

  group.userData.baseY = 0.45;
  group.position.y = group.userData.baseY;
  return group;
}

export class LootBox {
  constructor(scene, x, z, type) {
    this.type = type;
    this.x = x;
    this.z = z;
    this.progress = 0;
    this.required = 3 + Math.random() * 2; // 3-5 seconds
    this.active = true;
    this.spinPhase = Math.random() * 10;

    this.mesh = buildCrateMesh(type);
    this.mesh.position.x = x;
    this.mesh.position.z = z;
    scene.add(this.mesh);
  }

  update(delta) {
    this.spinPhase += delta;
    this.mesh.rotation.y += delta * 0.6;
    this.mesh.position.y = this.mesh.userData.baseY + Math.sin(this.spinPhase * 1.6) * 0.08;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.traverse(o => {
      if (o.isMesh || o.isSprite) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      }
    });
  }
}

export class LootManager {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.boxes = [];
    this.respawnTimer = 0;

    for (let i = 0; i < MAX_BOXES; i++) this.spawnOne();
  }

  _findClearSpot() {
    let x, z, tries = 0;
    const limit = WORLD_SIZE - 10;
    do {
      x = (Math.random() - 0.5) * limit * 2;
      z = (Math.random() - 0.5) * limit * 2;
      tries++;
    } while (this._isBlocked(x, z) && tries < 40);
    return { x, z };
  }

  _isBlocked(x, z) {
    if (Math.hypot(x, z) < 8) return true; // keep spawn area clear
    for (const c of this.colliders) {
      if (Math.abs(x - c.x) < c.halfW + 1.5 && Math.abs(z - c.z) < c.halfD + 1.5) return true;
    }
    for (const b of this.boxes) {
      if (Math.hypot(x - b.x, z - b.z) < 12) return true;
    }
    return false;
  }

  spawnOne() {
    const { x, z } = this._findClearSpot();
    const type = rollLootType();
    this.boxes.push(new LootBox(this.scene, x, z, type));
  }

  update(delta, playerPos, onOpen, hudCallback) {
    if (this.boxes.length < MAX_BOXES) {
      this.respawnTimer -= delta;
      if (this.respawnTimer <= 0) {
        this.spawnOne();
        this.respawnTimer = RESPAWN_DELAY;
      }
    }

    let activeBox = null;
    for (const box of this.boxes) {
      box.update(delta);
      const dist = Math.hypot(playerPos.x - box.x, playerPos.z - box.z);
      if (dist <= PICKUP_RADIUS) {
        activeBox = box;
        box.progress += delta;
        if (box.progress >= box.required) {
          this._openBox(box, onOpen);
        }
      } else if (box.progress > 0) {
        box.progress = 0;
      }
    }

    if (hudCallback) {
      if (activeBox && activeBox.active) {
        hudCallback(true, activeBox.progress / activeBox.required);
      } else {
        hudCallback(false, 0);
      }
    }
  }

  _openBox(box, onOpen) {
    box.active = false;
    box.dispose(this.scene);
    this.boxes = this.boxes.filter(b => b !== box);
    this.respawnTimer = Math.max(this.respawnTimer, RESPAWN_DELAY);
    if (onOpen) onOpen(box.type);
  }
}
