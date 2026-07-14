import * as THREE from 'three';
import { resolveCollisions, WORLD_SIZE } from './world.js';
import { audio } from './audio.js';

// ---- base balance values (chunk 3 will scale these with player level) ----
export const BASE_ZOMBIE_HEALTH = 55;
export const BASE_ZOMBIE_SPEED = 2.3;
export const BASE_ZOMBIE_DAMAGE = 9;
export const FAT_ZOMBIE_HEALTH_MULT = 1.5;
export const FAT_ZOMBIE_SPEED_MULT = 0.72;
export const FAT_ZOMBIE_SCALE = 1.55;

const ZOMBIE_RADIUS = 0.5;
const ATTACK_RANGE = 1.7;
const ATTACK_COOLDOWN = 1.1;

let zombieIdCounter = 0;

function buildZombieMesh(isFat) {
  const group = new THREE.Group();
  const hue = 0.28 + Math.random() * 0.06;
  const rot = Math.random() * 0.5 - 0.25;
  const skinColor = new THREE.Color().setHSL(hue, 0.35, isFat ? 0.28 : 0.22);
  const clothColor = new THREE.Color().setHSL(Math.random(), 0.2, 0.15);

  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 1 });
  const clothMat = new THREE.MeshStandardMaterial({ color: clothColor, roughness: 1 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(isFat ? 0.85 : 0.55, 0.8, 0.35), clothMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skinMat);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);

  // glowing eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2b1e });
  [-0.09, 0.09].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eyeMat);
    eye.position.set(ex, 1.64, 0.21);
    group.add(eye);
  });

  const armGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6);
  const legGeo = new THREE.CylinderGeometry(0.1, 0.09, 0.8, 6);

  const armL = new THREE.Mesh(armGeo, skinMat);
  armL.position.set(-0.4 * (isFat ? 1.3 : 1), 1.05, 0);
  armL.rotation.z = 0.3;
  armL.castShadow = true;
  const armR = armL.clone();
  armR.position.x *= -1;
  armR.rotation.z *= -1;

  const legL = new THREE.Mesh(legGeo, clothMat);
  legL.position.set(-0.16, 0.4, 0);
  legL.castShadow = true;
  const legR = legL.clone();
  legR.position.x *= -1;

  group.add(armL, armR, legL, legR);
  group.rotation.y = rot;
  group.scale.setScalar(isFat ? FAT_ZOMBIE_SCALE : 1);

  group.userData.parts = { armL, armR, legL, legR, head };
  return group;
}

export class Zombie {
  constructor(scene, x, z, isFat, healthMult = 1, speedMult = 1) {
    this.id = zombieIdCounter++;
    this.isFat = isFat;
    this.maxHealth = BASE_ZOMBIE_HEALTH * (isFat ? FAT_ZOMBIE_HEALTH_MULT : 1) * healthMult;
    this.health = this.maxHealth;
    this.speed = BASE_ZOMBIE_SPEED * (isFat ? FAT_ZOMBIE_SPEED_MULT : 1) * speedMult;
    this.damage = BASE_ZOMBIE_DAMAGE * (isFat ? 1.4 : 1);
    this.alive = true;
    this.attackTimer = 0;
    this.walkPhase = Math.random() * 10;

    this.mesh = buildZombieMesh(isFat);
    this.mesh.position.set(x, 0, z);
    this.mesh.userData.zombieRef = this;
    this.mesh.traverse(o => { o.userData.zombieRef = this; });
    scene.add(this.mesh);
  }

  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0 && this.alive) {
      this.alive = false;
      return true; // died
    }
    return false;
  }

  update(delta, playerPos, colliders) {
    if (!this.alive) return 'none';

    const pos = this.mesh.position;
    const dx = playerPos.x - pos.x;
    const dz = playerPos.z - pos.z;
    const dist = Math.hypot(dx, dz);

    this.attackTimer = Math.max(0, this.attackTimer - delta);

    if (dist > ATTACK_RANGE) {
      const nx = dx / dist, nz = dz / dist;
      pos.x += nx * this.speed * delta;
      pos.z += nz * this.speed * delta;
      this.mesh.rotation.y = Math.atan2(nx, nz);

      // simple building/debris avoidance
      const tmp = new THREE.Vector3(pos.x, 0, pos.z);
      resolveCollisions(tmp, ZOMBIE_RADIUS, colliders);
      pos.x = tmp.x; pos.z = tmp.z;

      // walk animation
      this.walkPhase += delta * (this.isFat ? 6 : 8);
      const swing = Math.sin(this.walkPhase) * 0.5;
      const { armL, armR, legL, legR, head } = this.mesh.userData.parts;
      armL.rotation.x = swing;
      armR.rotation.x = -swing;
      legL.rotation.x = -swing;
      legR.rotation.x = swing;
      head.rotation.z = Math.sin(this.walkPhase * 0.5) * 0.08;

      if (Math.random() < delta * 0.06 && dist < 25) audio.playZombieGroan();

      return 'chasing';
    } else {
      this.mesh.rotation.y = Math.atan2(dx, dz);
      if (this.attackTimer <= 0) {
        this.attackTimer = ATTACK_COOLDOWN;
        return 'attack';
      }
      return 'idle';
    }
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.traverse(o => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (o.material) o.material.dispose();
      }
    });
  }
}

export class ZombieManager {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.zombies = [];
    this.spawnTimer = 0;

    // tunable difficulty knobs (chunk 3 hooks into these via setDifficulty)
    this.spawnInterval = 2.4;
    this.maxAlive = 18;
    this.spawnBatch = 1;
    this.healthMult = 1;
    this.speedMult = 1;
    this.fatChance = 0.12;
  }

  setDifficulty({ spawnInterval, maxAlive, spawnBatch, healthMult, speedMult, fatChance }) {
    if (spawnInterval !== undefined) this.spawnInterval = spawnInterval;
    if (maxAlive !== undefined) this.maxAlive = maxAlive;
    if (spawnBatch !== undefined) this.spawnBatch = spawnBatch;
    if (healthMult !== undefined) this.healthMult = healthMult;
    if (speedMult !== undefined) this.speedMult = speedMult;
    if (fatChance !== undefined) this.fatChance = fatChance;
  }

  spawnOne(playerPos) {
    // spawn on a ring around the player, just beyond fog visibility, from a random direction
    const angle = Math.random() * Math.PI * 2;
    const dist = 34 + Math.random() * 14;
    let x = playerPos.x + Math.cos(angle) * dist;
    let z = playerPos.z + Math.sin(angle) * dist;
    const limit = WORLD_SIZE - 4;
    x = Math.max(-limit, Math.min(limit, x));
    z = Math.max(-limit, Math.min(limit, z));

    const isFat = Math.random() < this.fatChance;
    const z2 = new Zombie(this.scene, x, z, isFat, this.healthMult, this.speedMult);
    this.zombies.push(z2);
  }

  update(delta, playerPos, onPlayerHit, onZombieDied) {
    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0 && this.zombies.length < this.maxAlive) {
      for (let i = 0; i < this.spawnBatch; i++) this.spawnOne(playerPos);
      this.spawnTimer = this.spawnInterval;
    }

    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      const result = z.update(delta, playerPos, this.colliders);
      if (result === 'attack') onPlayerHit(z.damage);
      if (!z.alive) {
        z.dispose(this.scene);
        this.zombies.splice(i, 1);
        audio.playZombieDeath();
        if (onZombieDied) onZombieDied(z);
      }
    }
  }

  getAliveCount() {
    return this.zombies.length;
  }

  // returns flat list of hittable meshes for raycasting
  getHitboxMeshes() {
    const meshes = [];
    for (const z of this.zombies) {
      if (z.alive) meshes.push(z.mesh);
    }
    return meshes;
  }
}
