import * as THREE from 'three';
import { getWeaponById } from './weapons.js';
import { audio } from './audio.js';

const RAYCASTER = new THREE.Raycaster();

function findZombieFromHit(object) {
  let o = object;
  while (o) {
    if (o.userData && o.userData.zombieRef) return o.userData.zombieRef;
    o = o.parent;
  }
  return null;
}

// ---- procedural viewmodel builders: distinct silhouette per weapon id ----
function buildViewmodel(weapon) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b2f27, roughness: 0.45, metalness: 0.6 });
  const darkGrip = new THREE.MeshStandardMaterial({ color: 0x17150f, roughness: 0.8 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 0.7 });

  let muzzleZ = -0.4;

  switch (weapon.id) {
    case 'smg': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.5), metal);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.08), darkGrip);
      mag.position.set(0, -0.16, 0.05);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.07), darkGrip);
      grip.position.set(0, -0.14, 0.16);
      g.add(body, mag, grip);
      muzzleZ = -0.28;
      break;
    }
    case 'rifle': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.72), metal);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.22), darkGrip);
      stock.position.set(0, -0.02, 0.42);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.08), darkGrip);
      mag.position.set(0, -0.15, 0.02);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8), metal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.01, -0.46);
      g.add(body, stock, mag, barrel);
      muzzleZ = -0.56;
      break;
    }
    case 'shotgun': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.65, 8), metal);
      body.rotation.x = Math.PI / 2;
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.14), wood);
      pump.position.set(0, -0.05, -0.1);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.2), wood);
      stock.position.set(0, -0.01, 0.4);
      g.add(body, pump, stock);
      muzzleZ = -0.5;
      break;
    }
    case 'pistol': {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.32), metal);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.09), darkGrip);
      grip.position.set(0, -0.12, 0.11);
      g.add(slide, grip);
      muzzleZ = -0.2;
      break;
    }
    case 'revolver': {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.3, 8), metal);
      barrel.rotation.x = Math.PI / 2;
      const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 10), metal);
      cylinder.rotation.x = Math.PI / 2;
      cylinder.position.z = 0.07;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.09), wood);
      grip.position.set(0, -0.12, 0.14);
      g.add(barrel, cylinder, grip);
      muzzleZ = -0.16;
      break;
    }
    case 'machinepistol': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.11, 0.28), metal);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.06), darkGrip);
      mag.position.set(0, -0.13, 0.02);
      g.add(body, mag);
      muzzleZ = -0.16;
      break;
    }
    case 'knife': {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.28), new THREE.MeshStandardMaterial({ color: 0xc9d2c6, roughness: 0.25, metalness: 0.8 }));
      blade.position.z = -0.1;
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8), darkGrip);
      handle.rotation.x = Math.PI / 2;
      handle.position.z = 0.08;
      g.add(blade, handle);
      break;
    }
    case 'bat': {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.6, 8), wood);
      shaft.rotation.x = Math.PI / 2.3;
      shaft.position.set(0, -0.02, -0.05);
      g.add(shaft);
      break;
    }
    case 'axe': {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.5, 8), wood);
      shaft.rotation.x = Math.PI / 2.3;
      shaft.position.set(0, -0.02, -0.02);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 4), metal);
      head.rotation.z = Math.PI / 2;
      head.position.set(0.02, 0.16, -0.24);
      g.add(shaft, head);
      break;
    }
    default: {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), metal));
    }
  }

  g.userData.muzzleZ = muzzleZ;
  return g;
}

export class WeaponSystem {
  constructor({ camera, weaponAnchor, scene, loadout, zombieManager, hud, onKill, getDamageMultiplier }) {
    this.camera = camera;
    this.anchor = weaponAnchor;
    this.scene = scene;
    this.zombieManager = zombieManager;
    this.hud = hud;
    this.onKill = onKill;
    this.getDamageMultiplier = getDamageMultiplier || (() => 1);

    this.slots = { 1: loadout.primary, 2: loadout.secondary, 3: loadout.melee };
    this.currentSlotNum = 1;

    this.runtime = {}; // id -> { data, mesh, ammoInMag, ammoReserve, cooldown, reloading, reloadTimer }
    Object.values(this.slots).forEach(id => {
      const data = getWeaponById(id);
      const mesh = buildViewmodel(data);
      mesh.visible = false;
      weaponAnchor.add(mesh);
      this.runtime[id] = {
        data,
        mesh,
        ammoInMag: data.magSize || 0,
        ammoReserve: data.reserveMax || 0,
        cooldown: 0,
        reloading: false,
        reloadTimer: 0
      };
    });

    this.recoil = 0;
    this.bobT = 0;
    this.firing = false;
    this.triggerHeld = false;

    this._muzzleLight = new THREE.PointLight(0xfff2c0, 0, 4);
    weaponAnchor.add(this._muzzleLight);

    this._setupInput();
    this.switchSlot(1);
  }

  _setupInput() {
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 && document.pointerLockElement) { this.firing = true; this.triggerHeld = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.firing = false; this.triggerHeld = false; }
    });
    window.addEventListener('keydown', (e) => {
      if (!document.pointerLockElement) return;
      if (e.code === 'Digit1') this.switchSlot(1);
      if (e.code === 'Digit2') this.switchSlot(2);
      if (e.code === 'Digit3') this.switchSlot(3);
      if (e.code === 'KeyR') this.startReload();
    });
  }

  get current() {
    return this.runtime[this.slots[this.currentSlotNum]];
  }

  switchSlot(n) {
    if (!this.slots[n]) return;
    Object.values(this.runtime).forEach(r => r.mesh.visible = false);
    this.currentSlotNum = n;
    const rt = this.current;
    rt.mesh.visible = true;
    document.querySelectorAll('.slot').forEach(el => el.classList.toggle('active', Number(el.dataset.slot) === n));
    document.getElementById('weapon-name').textContent = rt.data.name;
    this._updateAmmoHUD();
  }

  startReload() {
    const rt = this.current;
    if (rt.data.slot === 'melee') return;
    if (rt.reloading || rt.ammoInMag >= rt.data.magSize || rt.ammoReserve <= 0) return;
    rt.reloading = true;
    rt.reloadTimer = rt.data.reloadTime;
    audio.playReloadClick();
    this._updateAmmoHUD();
  }

  _updateAmmoHUD() {
    const rt = this.current;
    const curEl = document.getElementById('ammo-current');
    const resEl = document.getElementById('ammo-reserve');
    if (rt.data.slot === 'melee') {
      curEl.textContent = '--';
      resEl.textContent = '';
    } else {
      curEl.textContent = rt.reloading ? '...' : rt.ammoInMag;
      resEl.textContent = rt.ammoReserve;
    }
  }

  _flashMuzzle() {
    this._muzzleLight.intensity = 3.2;
    this._muzzleLight.position.set(0, 0, this.current.mesh.userData.muzzleZ || -0.3);
  }

  _applyRecoil(amount) {
    this.recoil = Math.min(this.recoil + amount, 0.35);
  }

  _doHitscan(pelletCount, damage, spread, range) {
    let hitAny = false;
    const originVec = new THREE.Vector3();
    this.camera.getWorldPosition(originVec);
    for (let i = 0; i < pelletCount; i++) {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      dir.x += (Math.random() - 0.5) * spread;
      dir.y += (Math.random() - 0.5) * spread;
      dir.normalize();

      RAYCASTER.set(originVec, dir);
      RAYCASTER.far = range;
      const meshes = this.zombieManager.getHitboxMeshes();
      const hits = RAYCASTER.intersectObjects(meshes, true);
      if (hits.length > 0) {
        const zombie = findZombieFromHit(hits[0].object);
        if (zombie) {
          hitAny = true;
          const headshot = hits[0].object === zombie.mesh.userData.parts.head;
          const dmg = (headshot ? damage * 2 : damage) * this.getDamageMultiplier();
          const died = zombie.takeDamage(dmg);
          if (died && this.onKill) this.onKill(zombie, headshot);
        }
      }
    }
    return hitAny;
  }

  fireOnce() {
    const rt = this.current;
    const data = rt.data;
    if (rt.reloading) return;

    if (data.slot === 'melee') {
      if (rt.cooldown > 0) return;
      rt.cooldown = 1 / data.fireRate;
      this._applyRecoil(0.12);
      audio.playMeleeSwing();
      const hit = this._doHitscan(1, data.damage, 0.02, data.range);
      if (hit && this.hud) this.hud.flashHitmarker();
      return;
    }

    if (rt.ammoInMag <= 0) {
      this.startReload();
      return;
    }
    if (rt.cooldown > 0) return;

    rt.cooldown = 1 / data.fireRate;
    rt.ammoInMag--;
    this._updateAmmoHUD();
    this._applyRecoil(data.pellets ? 0.28 : 0.09);
    this._flashMuzzle();
    audio.playGunshot(data.id);

    const hit = this._doHitscan(data.pellets || 1, data.damage, data.spread, data.range);
    if (hit && this.hud) this.hud.flashHitmarker();

    if (rt.ammoInMag <= 0) this.startReload();
    if (!data.auto) this.firing = false; // semi-auto: require a fresh click
  }

  resupplyAmmo() {
    Object.values(this.runtime).forEach(r => {
      if (r.data.slot === 'melee') return;
      r.ammoReserve = r.data.reserveMax;
      if (r.ammoInMag < r.data.magSize) {
        r.ammoInMag = r.data.magSize;
        r.reloading = false;
      }
    });
    this._updateAmmoHUD();
  }

  update(delta) {
    const rt = this.current;

    Object.values(this.runtime).forEach(r => { if (r.cooldown > 0) r.cooldown -= delta; });

    if (rt.reloading) {
      rt.reloadTimer -= delta;
      if (rt.reloadTimer <= 0) {
        const need = rt.data.magSize - rt.ammoInMag;
        const take = Math.min(need, rt.ammoReserve);
        rt.ammoInMag += take;
        rt.ammoReserve -= take;
        rt.reloading = false;
        this._updateAmmoHUD();
      }
    }

    if (this.firing && !rt.reloading && rt.cooldown <= 0) {
      this.fireOnce();
    }

    this._muzzleLight.intensity *= Math.max(0, 1 - delta * 14);

    this.recoil *= Math.max(0, 1 - delta * 10);
    this.bobT += delta;
    const sway = Math.sin(this.bobT * 1.4) * 0.004;
    this.anchor.position.set(0.32 + sway, -0.28 - this.recoil * 0.4, -0.55 + this.recoil * 0.15);
    this.anchor.rotation.x = -this.recoil * 1.4;
  }
}
