import * as THREE from 'three';
import { getWeaponById } from './weapons.js';
import { audio } from './audio.js';

const RAYCASTER = new THREE.Raycaster();

// shared geometries for hit-effects — built once, reused for every tracer/impact
// so rapid-fire weapons don't allocate dozens of new BufferGeometries per second
const TRACER_GEOMETRY = new THREE.CylinderGeometry(0.012, 0.012, 1, 5, 1, true);
TRACER_GEOMETRY.translate(0, 0.5, 0); // extends from local origin up to local +Y
const IMPACT_GEOMETRY = new THREE.OctahedronGeometry(0.045, 0);
const UP_AXIS = new THREE.Vector3(0, 1, 0);

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

    // dedicated fill light so the viewmodel always reads clearly, independent of
    // world lighting direction (a common FPS trick — CS2 does this too)
    const viewmodelFill = new THREE.PointLight(0xcfd8c8, 0.9, 3.5);
    viewmodelFill.position.set(0.1, 0.4, 0.3);
    weaponAnchor.add(viewmodelFill);

    this._buildArms(weaponAnchor);

    this.effects = []; // active tracers + impact particles, in world space
    this.effectsGroup = new THREE.Group();
    scene.add(this.effectsGroup);

    this._setupInput();
    this.switchSlot(1);
  }

  // low-poly forearms + hands gripping the weapon, always visible regardless of
  // which weapon is equipped — this is what actually sells "a gun in my hands"
  _buildArms(anchor) {
    const skin = new THREE.MeshStandardMaterial({ color: 0xc99270, roughness: 0.85 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2e3427, roughness: 0.9 });

    const rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.5, 8), sleeve);
    rightForearm.position.set(0.08, -0.28, 0.28);
    rightForearm.rotation.set(1.15, 0.15, -0.25);
    anchor.add(rightForearm);

    const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.12), skin);
    rightHand.position.set(0.03, -0.1, 0.02);
    rightHand.rotation.set(0.3, 0.1, -0.1);
    anchor.add(rightHand);

    const leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.45, 8), sleeve);
    leftForearm.position.set(-0.05, -0.22, -0.28);
    leftForearm.rotation.set(-0.9, -0.2, 0.3);
    anchor.add(leftForearm);

    const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.1), skin);
    leftHand.position.set(-0.02, -0.08, -0.42);
    leftHand.rotation.set(0.2, -0.1, 0.15);
    anchor.add(leftHand);
  }

  // public hooks for touch/mobile fire button (bypasses the desktop mousedown gate)
  startFiring() { this.firing = true; }
  stopFiring() { this.firing = false; }

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
    window.addEventListener('wheel', (e) => {
      if (!document.pointerLockElement) return;
      const order = [1, 2, 3];
      const idx = order.indexOf(this.currentSlotNum);
      const dir = e.deltaY > 0 ? 1 : -1;
      const next = order[(idx + dir + order.length) % order.length];
      this.switchSlot(next);
    }, { passive: true });
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

  _muzzleWorldPos() {
    const rt = this.current;
    const local = new THREE.Vector3(0, 0, rt.mesh.userData.muzzleZ || -0.3);
    return rt.mesh.localToWorld(local);
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
    const muzzleOrigin = this._muzzleWorldPos();

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

      let endPoint;
      if (hits.length > 0) {
        endPoint = hits[0].point.clone();
        const zombie = findZombieFromHit(hits[0].object);
        if (zombie) {
          hitAny = true;
          const headshot = hits[0].object === zombie.mesh.userData.parts.head;
          const dmg = (headshot ? damage * 2 : damage) * this.getDamageMultiplier();
          const died = zombie.takeDamage(dmg);
          audio.playZombieHit();
          if (died && this.onKill) this.onKill(zombie, headshot);
          this._spawnImpact(endPoint);
        }
      } else {
        endPoint = originVec.clone().addScaledVector(dir, range);
      }

      this._spawnTracer(muzzleOrigin, endPoint);
    }
    return hitAny;
  }

  _spawnTracer(start, end) {
    const dist = start.distanceTo(end);
    if (dist < 0.05) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff6c9, transparent: true, opacity: 0.9, depthWrite: false });
    const mesh = new THREE.Mesh(TRACER_GEOMETRY, mat);
    mesh.scale.set(1, dist, 1);
    mesh.position.copy(start);
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    mesh.quaternion.setFromUnitVectors(UP_AXIS, dir);
    this.effectsGroup.add(mesh);
    this.effects.push({ kind: 'tracer', mesh, life: 0.09, maxLife: 0.09 });
  }

  _spawnImpact(point) {
    const count = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x9dff3c, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(IMPACT_GEOMETRY, mat);
      mesh.scale.setScalar(0.7 + Math.random() * 0.6);
      mesh.position.copy(point);
      this.effectsGroup.add(mesh);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 2.5 + 0.5,
        (Math.random() - 0.5) * 3
      );
      this.effects.push({ kind: 'impact', mesh, life: 0.4, maxLife: 0.4, velocity });
    }
  }

  _updateEffects(delta) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.life -= delta;
      if (fx.life <= 0) {
        this.effectsGroup.remove(fx.mesh);
        fx.mesh.material.dispose(); // geometry is shared — do not dispose it here
        this.effects.splice(i, 1);
        continue;
      }
      const t = fx.life / fx.maxLife;
      fx.mesh.material.opacity = fx.kind === 'tracer' ? t * 0.9 : t;
      if (fx.kind === 'impact') {
        fx.velocity.y -= 9 * delta;
        fx.mesh.position.addScaledVector(fx.velocity, delta);
      }
    }
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
    this._updateEffects(delta);

    this.recoil *= Math.max(0, 1 - delta * 10);
    this.bobT += delta;
    const sway = Math.sin(this.bobT * 1.4) * 0.004;

    let reloadDip = 0, reloadTilt = 0;
    if (rt.reloading && rt.data.slot !== 'melee') {
      const progress = 1 - Math.max(0, rt.reloadTimer) / rt.data.reloadTime;
      const dipCurve = Math.sin(Math.min(1, progress) * Math.PI); // 0 -> 1 -> 0
      reloadDip = dipCurve * 0.16;
      reloadTilt = dipCurve * 0.55;
    }

    this.anchor.position.set(0.26 + sway, -0.24 - this.recoil * 0.4 - reloadDip, -0.45 + this.recoil * 0.15);
    this.anchor.rotation.x = -this.recoil * 1.4 + reloadTilt * 0.5;
    this.anchor.rotation.z = reloadTilt * 0.4;
  }
}
