import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { resolveCollisions } from './world.js';

const WALK_SPEED = 6.2;
const SPRINT_MULT = 1.6;
const JUMP_VELOCITY = 7.2;
const GRAVITY = 19.5;
const PLAYER_RADIUS = 0.55;
const EYE_HEIGHT = 1.7;

export class Player {
  constructor(camera, domElement, colliders) {
    this.camera = camera;
    this.colliders = colliders;
    this.controls = new PointerLockControls(camera, domElement);

    this.position = new THREE.Vector3(0, EYE_HEIGHT, 0);
    this.velocityY = 0;
    this.onGround = true;
    this.sprinting = false;

    this.move = { forward: false, back: false, left: false, right: false };

    this.health = 100;
    this.maxHealth = 100;

    // head-bob
    this.bobTime = 0;

    // viewmodel holder (weapon meshes attach here in chunk 2)
    this.weaponAnchor = new THREE.Group();
    this.weaponAnchor.position.set(0.32, -0.28, -0.55);
    camera.add(this.weaponAnchor);

    this._bindKeys();
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW': this.move.forward = true; break;
        case 'KeyS': this.move.back = true; break;
        case 'KeyA': this.move.left = true; break;
        case 'KeyD': this.move.right = true; break;
        case 'ShiftLeft': case 'ShiftRight': this.sprinting = true; break;
        case 'Space':
          if (this.onGround) { this.velocityY = JUMP_VELOCITY; this.onGround = false; }
          break;
      }
    });
    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': this.move.forward = false; break;
        case 'KeyS': this.move.back = false; break;
        case 'KeyA': this.move.left = false; break;
        case 'KeyD': this.move.right = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.sprinting = false; break;
      }
    });
  }

  spawnAt(x, z) {
    this.position.set(x, EYE_HEIGHT, z);
    this.camera.position.copy(this.position);
  }

  get speed() {
    return WALK_SPEED * (this.sprinting && this.move.forward ? SPRINT_MULT : 1);
  }

  update(delta) {
    // --- horizontal movement relative to look direction ---
    const forwardInput = (this.move.forward ? 1 : 0) - (this.move.back ? 1 : 0);
    const rightInput = (this.move.right ? 1 : 0) - (this.move.left ? 1 : 0);

    let moving = false;
    if (forwardInput !== 0 || rightInput !== 0) {
      moving = true;
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      dir.y = 0; dir.normalize();
      const right = new THREE.Vector3().crossVectors(dir, this.camera.up).normalize();

      const move = new THREE.Vector3();
      move.addScaledVector(dir, forwardInput);
      move.addScaledVector(right, rightInput);
      if (move.lengthSq() > 0) move.normalize();

      const spd = this.speed;
      this.position.x += move.x * spd * delta;
      this.position.z += move.z * spd * delta;
    }

    // --- gravity / jump ---
    this.velocityY -= GRAVITY * delta;
    this.position.y += this.velocityY * delta;
    if (this.position.y <= EYE_HEIGHT) {
      this.position.y = EYE_HEIGHT;
      this.velocityY = 0;
      this.onGround = true;
    }

    // --- collisions ---
    resolveCollisions(this.position, PLAYER_RADIUS, this.colliders);

    // --- head bob ---
    if (moving && this.onGround) {
      this.bobTime += delta * (this.sprinting ? 12 : 8);
      const bobY = Math.sin(this.bobTime) * 0.045;
      const bobX = Math.cos(this.bobTime * 0.5) * 0.03;
      this.camera.position.set(this.position.x + bobX, this.position.y + Math.abs(bobY), this.position.z);
    } else {
      this.bobTime = 0;
      this.camera.position.copy(this.position);
    }
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }
}
