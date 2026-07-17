import * as THREE from 'three';
import { resolveCollisions } from './world.js';

const WALK_SPEED = 6.2;
const SPRINT_MULT = 1.6;
const JUMP_VELOCITY = 7.2;
const GRAVITY = 19.5;
const PLAYER_RADIUS = 0.55;
const EYE_HEIGHT = 1.7;

const MOUSE_SENS = 0.0022;
const TOUCH_SENS = 0.0052;
const MAX_PITCH = Math.PI / 2 - 0.05;

export class Player {
  constructor(camera, domElement, colliders) {
    this.camera = camera;
    this.domElement = domElement;
    this.colliders = colliders;

    this.camera.rotation.order = 'YXZ';
    this.yaw = 0;
    this.pitch = 0;

    this.position = new THREE.Vector3(0, EYE_HEIGHT, 0);
    this.velocityY = 0;
    this.onGround = true;
    this.sprinting = false;

    this.move = { forward: false, back: false, left: false, right: false };
    this.analog = { x: 0, y: 0 }; // virtual joystick input, -1..1

    this.health = 100;
    this.maxHealth = 100;

    this.bobTime = 0;

    // viewmodel holder (weapon meshes attach here)
    this.weaponAnchor = new THREE.Group();
    this.weaponAnchor.position.set(0.26, -0.24, -0.45);
    this.weaponAnchor.scale.setScalar(1.35);
    camera.add(this.weaponAnchor);

    this._bindKeys();
    this._bindMouseLook();
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW': this.move.forward = true; break;
        case 'KeyS': this.move.back = true; break;
        case 'KeyA': this.move.left = true; break;
        case 'KeyD': this.move.right = true; break;
        case 'ShiftLeft': case 'ShiftRight': this.sprinting = true; break;
        case 'Space': this.jump(); break;
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

  _bindMouseLook() {
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.domElement) return;
      this._applyLookDelta(e.movementX, e.movementY, MOUSE_SENS);
    });
  }

  // called by touch "look zone" drag handlers on mobile
  lookTouchDelta(dx, dy) {
    this._applyLookDelta(dx, dy, TOUCH_SENS);
  }

  _applyLookDelta(dx, dy, sens) {
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  // called by the virtual joystick; x/y each in -1..1 (y positive = forward)
  setAnalogMove(x, y) {
    this.analog.x = x;
    this.analog.y = y;
  }

  jump() {
    if (this.onGround) {
      this.velocityY = JUMP_VELOCITY;
      this.onGround = false;
    }
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
    const analogActive = Math.abs(this.analog.x) > 0.05 || Math.abs(this.analog.y) > 0.05;
    const forwardInput = analogActive
      ? this.analog.y
      : (this.move.forward ? 1 : 0) - (this.move.back ? 1 : 0);
    const rightInput = analogActive
      ? this.analog.x
      : (this.move.right ? 1 : 0) - (this.move.left ? 1 : 0);

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
      if (move.lengthSq() > 1) move.normalize();

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
