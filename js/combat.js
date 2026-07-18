import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getWeaponById } from './weapons.js';
import { audio } from './audio.js';

const gltfLoader = new GLTFLoader();

// ---- tuning knobs for imported models: adjust these if a model loads sideways,
// upside down, oversized, or with its muzzle pointing the wrong way ----
const IMPORTED_MODEL_TUNING = {
  'tommy_gun.glb': {
    targetLength: 0.78,
    rotationOffset: new THREE.Euler(0, Math.PI, 0),
    positionOffset: new THREE.Vector3(0, 0, 0),
    muzzleZ: -0.35
  },
  'ak47.glb': {
    targetLength: 0.87,
    rotationOffset: new THREE.Euler(0, Math.PI, 0),
    positionOffset: new THREE.Vector3(0, 0, 0),
    muzzleZ: -0.39
  },
  'makarov.glb': {
    targetLength: 0.16,
    rotationOffset: new THREE.Euler(0, Math.PI, 0),
    positionOffset: new THREE.Vector3(0, 0, 0),
    muzzleZ: -0.07
  },
  'axe.glb': {
    targetLength: 0.6,
    rotationOffset: new THREE.Euler(0, Math.PI, 0),
    positionOffset: new THREE.Vector3(0, 0, 0),
    muzzleZ: -0.3
  },
  'scythe.glb': {
    targetLength: 1.3,
    rotationOffset: new THREE.Euler(0, Math.PI, 0),
    positionOffset: new THREE.Vector3(0, 0, 0),
    muzzleZ: -0.3
  },
  'sledgehammer.glb': {
    targetLength: 0.75,
    rotationOffset: new THREE.Euler(0, Math.PI, 0),
    positionOffset: new THREE.Vector3(0, 0, 0),
    muzzleZ: -0.3
  }
};

// ---- hand-arm placement: right hand always grips the trigger/handle; left hand only
// shows up on two-handed weapons (long guns + big melee) as a forward support hand.
// Positions are computed relative to each weapon's own muzzleZ so longer weapons
// automatically get a further-forward support hand. Adjust the multipliers below,
// or add a per-weapon-id override to HAND_OVERRIDES, if a grip looks off. ----
const TWO_HANDED_IDS = new Set(['smg', 'rifle', 'shotgun', 'axe', 'sledgehammer', 'scythe']);
const HAND_OVERRIDES = {}; // e.g. pistol: { right: { position: new THREE.Vector3(...), rotation: new THREE.Euler(...) } }

function computeHandPose(weaponData, muzzleZ) {
  if (HAND_OVERRIDES[weaponData.id]) return HAND_OVERRIDES[weaponData.id];
  const right = {
    position: new THREE.Vector3(0.045, -0.13, muzzleZ * 0.15),
    rotation: new THREE.Euler(0.35, 0.15, -0.15)
  };
  if (!TWO_HANDED_IDS.has(weaponData.id)) return { right, left: null };
  const left = {
    position: new THREE.Vector3(-0.03, -0.06, muzzleZ * 0.55),
    rotation: new THREE.Euler(-0.8, -0.15, 0.25)
  };
  return { right, left };
}

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

// ---- procedural viewmodel builders: distinct, more detailed silhouette per weapon id ----
function buildViewmodel(weapon) {
  const g = new THREE.Group();

  // materials — separated into a matte gunmetal body, darker polymer furniture,
  // and a brighter accent metal for small hardware, plus a tiny glowing sight bead
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x24261f, roughness: 0.42, metalness: 0.75 });
  const polymer = new THREE.MeshStandardMaterial({ color: 0x1a1c16, roughness: 0.6, metalness: 0.2 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x44473c, roughness: 0.3, metalness: 0.85 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 0.65, metalness: 0.05 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x3e2a17, roughness: 0.7, metalness: 0.05 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xd7ded4, roughness: 0.2, metalness: 0.85 });
  const sightGlow = new THREE.MeshStandardMaterial({ color: 0x9dff3c, emissive: 0x9dff3c, emissiveIntensity: 1.6, roughness: 0.4 });

  const halfGuard = () => new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 10, Math.PI * 1.3), accent);
  const sightPost = (h) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, h, 0.012), accent);
    return m;
  };
  const sightBead = () => new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), sightGlow);

  let muzzleZ = -0.4;

  switch (weapon.id) {
    case 'smg': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.46), gunmetal);
      const lowerReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.06, 0.2), polymer);
      lowerReceiver.position.set(0, -0.09, 0.08);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.07), polymer);
      mag.position.set(0, -0.2, 0.06);
      mag.rotation.x = -0.12;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.19, 0.065), polymer);
      grip.position.set(0, -0.13, 0.19);
      grip.rotation.x = 0.22;
      const stockArm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.24), accent);
      stockArm.position.set(0, -0.02, 0.36);
      const stockPlate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.02), polymer);
      stockPlate.position.set(0, -0.03, 0.47);
      const guard = halfGuard();
      guard.rotation.z = Math.PI;
      guard.position.set(0, -0.1, 0.14);
      const frontSight = sightPost(0.035);
      frontSight.position.set(0, 0.09, -0.22);
      const bead = sightBead();
      bead.position.set(0, 0.108, -0.22);
      g.add(body, lowerReceiver, mag, grip, stockArm, stockPlate, guard, frontSight, bead);
      muzzleZ = -0.26;
      break;
    }
    case 'rifle': {
      const upperReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.5), gunmetal);
      upperReceiver.position.set(0, 0.02, -0.05);
      const lowerReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.24), polymer);
      lowerReceiver.position.set(0, -0.05, 0.14);
      const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.075, 0.26), polymer);
      handguard.position.set(0, 0.0, -0.33);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.24), polymer);
      stock.position.set(0, -0.01, 0.4);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.075), polymer);
      mag.position.set(0, -0.19, 0.05);
      mag.rotation.x = -0.28;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.22, 8), gunmetal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.02, -0.54);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), accent);
      handle.position.set(0, 0.09, -0.12);
      const guard = halfGuard();
      guard.rotation.z = Math.PI;
      guard.position.set(0, -0.06, 0.1);
      const frontSight = sightPost(0.05);
      frontSight.position.set(0, 0.1, -0.46);
      const bead = sightBead();
      bead.position.set(0, 0.125, -0.46);
      const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.015), accent);
      rearSight.position.set(0, 0.09, 0.02);
      g.add(upperReceiver, lowerReceiver, handguard, stock, mag, barrel, handle, guard, frontSight, bead, rearSight);
      muzzleZ = -0.64;
      break;
    }
    case 'shotgun': {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.22), gunmetal);
      receiver.position.set(0, 0, 0.08);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.46, 10), gunmetal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.025, -0.24);
      const tubeMag = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 8), accent);
      tubeMag.rotation.x = Math.PI / 2;
      tubeMag.position.set(0, -0.045, -0.24);
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.06, 0.12), woodDark);
      pump.position.set(0, -0.04, -0.14);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.1, 0.24), wood);
      stock.position.set(0, -0.005, 0.36);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), wood);
      grip.position.set(0, -0.09, 0.2);
      grip.rotation.x = 0.3;
      const bead = sightBead();
      bead.position.set(0, 0.06, -0.46);
      g.add(receiver, barrel, tubeMag, pump, stock, grip, bead);
      muzzleZ = -0.48;
      break;
    }
    case 'pistol': {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.28), gunmetal);
      slide.position.set(0, 0.03, -0.04);
      // slide serrations
      for (let i = 0; i < 4; i++) {
        const groove = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.09, 0.006), accent);
        groove.position.set(0, 0.03, 0.08 + i * 0.012);
        g.add(groove);
      }
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.2), polymer);
      frame.position.set(0, -0.03, 0.02);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.085), polymer);
      grip.position.set(0, -0.13, 0.1);
      grip.rotation.x = 0.28;
      const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.012), accent);
      trigger.position.set(0, -0.05, -0.02);
      const guard = halfGuard();
      guard.rotation.z = Math.PI;
      guard.scale.setScalar(0.7);
      guard.position.set(0, -0.06, -0.01);
      const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.012), accent);
      hammer.position.set(0, 0.08, 0.13);
      const frontSight = sightPost(0.02);
      frontSight.position.set(0, 0.085, -0.17);
      const bead = sightBead();
      bead.position.set(0, 0.098, -0.17);
      g.add(slide, frame, grip, trigger, guard, hammer, frontSight, bead);
      muzzleZ = -0.18;
      break;
    }
    case 'revolver': {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.28, 8), gunmetal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.01, -0.12);
      const underlug = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 0.2), gunmetal);
      underlug.position.set(0, -0.015, -0.14);
      const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.09, 12), steel);
      cylinder.rotation.x = Math.PI / 2;
      cylinder.position.z = 0.06;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.12), gunmetal);
      frame.position.set(0, 0, 0.1);
      const gripL = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.15, 0.09), wood);
      gripL.position.set(0.017, -0.12, 0.16);
      gripL.rotation.x = 0.3;
      const gripR = gripL.clone();
      gripR.position.x = -0.017;
      const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.03, 0.015), accent);
      hammer.position.set(0, 0.075, 0.2);
      const guard = halfGuard();
      guard.rotation.z = Math.PI;
      guard.position.set(0, -0.05, 0.09);
      g.add(barrel, underlug, cylinder, frame, gripL, gripR, hammer, guard);
      muzzleZ = -0.24;
      break;
    }
    case 'machinepistol': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.24), gunmetal);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.055), polymer);
      mag.position.set(0, -0.15, 0.01);
      mag.rotation.x = -0.1;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.065), polymer);
      grip.position.set(0, -0.09, 0.11);
      grip.rotation.x = 0.25;
      const foldStock = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.14), accent);
      foldStock.position.set(0, -0.01, 0.22);
      const frontSight = sightPost(0.025);
      frontSight.position.set(0, 0.07, -0.11);
      const bead = sightBead();
      bead.position.set(0, 0.08, -0.11);
      g.add(body, mag, grip, foldStock, frontSight, bead);
      muzzleZ = -0.14;
      break;
    }
    case 'knife': {
      const bladeShape = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.3, 4), steel);
      bladeShape.rotation.x = -Math.PI / 2;
      bladeShape.rotation.z = Math.PI / 4;
      bladeShape.scale.set(1, 1, 0.35);
      bladeShape.position.set(0, 0, -0.14);
      const spine = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.24), steel);
      spine.position.set(0, 0, -0.12);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.02), accent);
      guard.position.z = 0.02;
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.16, 8), polymer);
      handle.rotation.x = Math.PI / 2;
      handle.position.z = 0.11;
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), accent);
      pommel.position.z = 0.19;
      g.add(bladeShape, spine, guard, handle, pommel);
      break;
    }
    case 'bat': {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.045, 0.62, 10), wood);
      shaft.rotation.x = Math.PI / 2.3;
      shaft.position.set(0, -0.02, -0.05);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.16, 8), polymer);
      grip.rotation.x = Math.PI / 2.3;
      grip.position.set(0, -0.09, 0.22);
      // wrapped grip tape ridges
      for (let i = 0; i < 5; i++) {
        const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.004, 6, 8), accent);
        ridge.rotation.x = Math.PI / 2.3;
        ridge.position.set(0, -0.09 - i * 0.006, 0.18 + i * 0.028);
        g.add(ridge);
      }
      // nails for a "spiked" look
      for (let i = 0; i < 4; i++) {
        const nail = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 5), accent);
        nail.position.set((Math.random() - 0.5) * 0.03, -0.05 - i * 0.09, -0.25 + i * 0.09);
        nail.rotation.z = Math.random() * Math.PI;
        g.add(nail);
      }
      g.add(shaft, grip);
      break;
    }
    case 'axe': {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.52, 8), wood);
      shaft.rotation.x = Math.PI / 2.3;
      shaft.position.set(0, -0.02, -0.02);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.15, 4), gunmetal);
      head.rotation.z = Math.PI / 2;
      head.scale.set(1, 1, 0.55);
      head.position.set(0.02, 0.17, -0.25);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), gunmetal);
      spike.rotation.z = -Math.PI / 2;
      spike.position.set(0.02, 0.17, -0.13);
      const lashing = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 8), accent);
      lashing.rotation.x = Math.PI / 2.3;
      lashing.position.set(0, 0.13, -0.19);
      g.add(shaft, head, spike, lashing);
      break;
    }
    default: {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), gunmetal));
    }
  }

  g.userData.muzzleZ = muzzleZ;
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
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
      let mesh;
      if (data.modelPath) {
        mesh = new THREE.Group(); // populated asynchronously once the model finishes loading
        const fileName = data.modelPath.split('/').pop();
        const tuning = IMPORTED_MODEL_TUNING[fileName];
        mesh.userData.muzzleZ = tuning ? tuning.muzzleZ : -0.3;
        this._loadExternalModel(mesh, data);
      } else {
        mesh = buildViewmodel(data);
      }
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
    this.swingT = null;
    this.swingDuration = 0.28;

    this._muzzleLight = new THREE.PointLight(0xfff2c0, 0, 4);
    weaponAnchor.add(this._muzzleLight);

    // dedicated fill light so the viewmodel always reads clearly, independent of
    // world lighting direction (a common FPS trick — CS2 does this too)
    const viewmodelFill = new THREE.PointLight(0xcfd8c8, 0.9, 3.5);
    viewmodelFill.position.set(0.1, 0.4, 0.3);
    weaponAnchor.add(viewmodelFill);

    this._buildArms(weaponAnchor); // instant fallback, hidden once the real hand model loads
    this._loadHandArm(weaponAnchor);

    this.effects = []; // active tracers + impact particles, in world space
    this.effectsGroup = new THREE.Group();
    scene.add(this.effectsGroup);

    this._setupInput();
    this.switchSlot(1);
  }

  // low-poly forearms + hands — instant placeholder shown until the real scanned
  // hand-arm model finishes loading, then hidden.
  _buildArms(anchor) {
    const skin = new THREE.MeshStandardMaterial({ color: 0xc99270, roughness: 0.85 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2e3427, roughness: 0.9 });
    const group = new THREE.Group();

    const rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.5, 8), sleeve);
    rightForearm.position.set(0.08, -0.28, 0.28);
    rightForearm.rotation.set(1.15, 0.15, -0.25);
    group.add(rightForearm);

    const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.12), skin);
    rightHand.position.set(0.03, -0.1, 0.02);
    rightHand.rotation.set(0.3, 0.1, -0.1);
    group.add(rightHand);

    const leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.45, 8), sleeve);
    leftForearm.position.set(-0.05, -0.22, -0.28);
    leftForearm.rotation.set(-0.9, -0.2, 0.3);
    group.add(leftForearm);

    const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.1), skin);
    leftHand.position.set(-0.02, -0.08, -0.42);
    leftHand.rotation.set(0.2, -0.1, 0.15);
    group.add(leftHand);

    anchor.add(group);
    this.fallbackArmsGroup = group;
  }

  // Loads the (pre-decimated, pre-scaled-to-meters) hand-arm scan once, then clones
  // it into a right-hand and a mirrored left-hand slot. Both slots are repositioned
  // per weapon in _applyHandPose() so the grip roughly follows whatever's equipped.
  _loadHandArm(anchor) {
    this.rightHandSlot = new THREE.Group();
    this.leftHandSlot = new THREE.Group();
    anchor.add(this.rightHandSlot, this.leftHandSlot);
    this.rightHandSlot.visible = false;
    this.leftHandSlot.visible = false;

    gltfLoader.load(
      'assets/hand_arm.glb',
      (gltf) => {
        const template = gltf.scene;
        const box = new THREE.Box3().setFromObject(template);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 0.42 / maxDim; // forearm+hand, tip to tip
        template.scale.setScalar(scale);

        const box2 = new THREE.Box3().setFromObject(template);
        const center = new THREE.Vector3();
        box2.getCenter(center);
        template.position.sub(center);

        template.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = false;
          o.receiveShadow = false;
          o.frustumCulled = false;
        });

        const right = template.clone();
        const left = template.clone();
        left.scale.x *= -1; // mirror geometry for the left hand
        this.rightHandSlot.add(right);
        this.leftHandSlot.add(left);

        if (this.fallbackArmsGroup) this.fallbackArmsGroup.visible = false;
        this._applyHandPose();
      },
      undefined,
      (err) => {
        console.error('Failed to load hand-arm model, keeping procedural fallback arms.', err);
      }
    );
  }

  _applyHandPose() {
    if (!this.rightHandSlot || this.rightHandSlot.children.length === 0) return;
    const rt = this.current;
    const muzzleZ = rt.mesh.userData.muzzleZ || -0.3;
    const pose = computeHandPose(rt.data, muzzleZ);

    this.rightHandSlot.position.copy(pose.right.position);
    this.rightHandSlot.rotation.copy(pose.right.rotation);
    this.rightHandSlot.visible = true;

    if (pose.left) {
      this.leftHandSlot.position.copy(pose.left.position);
      this.leftHandSlot.rotation.copy(pose.left.rotation);
      this.leftHandSlot.visible = true;
    } else {
      this.leftHandSlot.visible = false;
    }
  }

  // Loads an external .glb, normalizes its scale/orientation to fit our viewmodel
  // anchor, strips any leftover backdrop geometry from the source scene, and tones
  // down overly-hot baked emissive materials (common in Sketchfab exports).
  _loadExternalModel(group, data) {
    const fileName = data.modelPath.split('/').pop();
    const tuning = IMPORTED_MODEL_TUNING[fileName] || {
      targetLength: 0.24,
      rotationOffset: new THREE.Euler(0, 0, 0),
      positionOffset: new THREE.Vector3(0, 0, 0),
      muzzleZ: -0.3
    };

    gltfLoader.load(
      data.modelPath,
      (gltf) => {
        const model = gltf.scene;

        // remove known non-weapon leftovers from the source scene (e.g. a Sketchfab
        // viewer backdrop plane) if present
        const stray = model.getObjectByName('Plane001');
        if (stray && stray.parent) stray.parent.remove(stray);

        // normalize to a realistic real-world size regardless of the source file's units
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = tuning.targetLength / maxDim;
        model.scale.setScalar(scale);

        // re-center after scaling so it rotates/positions predictably in the anchor
        const box2 = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        box2.getCenter(center);
        model.position.sub(center);
        model.position.add(tuning.positionOffset);
        model.rotation.copy(tuning.rotationOffset);

        model.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = false;
          o.receiveShadow = false;
          o.frustumCulled = false; // viewmodel is camera-relative; never let it get culled
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (!m) return;
            // several Sketchfab exports bake a very hot emissive strength (10x) meant
            // for their own preview shader — tone it down for normal scene lighting
            if (m.emissiveIntensity !== undefined && m.emissiveIntensity > 1) {
              m.emissiveIntensity = 0.5;
            }
          });
        });

        group.add(model);
        group.userData.muzzleZ = tuning.muzzleZ;
      },
      undefined,
      (err) => {
        console.error(`Failed to load weapon model "${data.modelPath}", using procedural fallback.`, err);
        const fallback = buildViewmodel(data);
        while (fallback.children.length) group.add(fallback.children[0]);
        group.userData.muzzleZ = fallback.userData.muzzleZ;
      }
    );
  }
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
    this.swingT = null;
    this._applyHandPose();
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

  _triggerSwing() {
    this.swingT = 0;
  }

  _doHitscan(pelletCount, damage, spread, range, spawnTracer = true) {
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

      if (spawnTracer) this._spawnTracer(muzzleOrigin, endPoint);
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
      this._triggerSwing();
      audio.playMeleeSwing();
      const hit = this._doHitscan(1, data.damage, 0.02, data.range, false); // no bullet tracer for melee
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

    let swingRotZ = 0, swingRotX = 0, swingPosX = 0, swingPosY = 0;
    if (this.swingT !== null) {
      this.swingT += delta;
      if (this.swingT >= this.swingDuration) {
        this.swingT = null;
      } else {
        const p = this.swingT / this.swingDuration;
        const arc = Math.sin(p * Math.PI); // 0 -> 1 -> 0, a quick forward-down chop
        swingRotZ = -arc * 1.1;
        swingRotX = arc * 0.45;
        swingPosX = -arc * 0.16;
        swingPosY = -arc * 0.05;
      }
    }

    this.anchor.position.set(
      0.26 + sway + swingPosX,
      -0.24 - this.recoil * 0.4 - reloadDip + swingPosY,
      -0.45 + this.recoil * 0.15
    );
    this.anchor.rotation.x = -this.recoil * 1.4 + reloadTilt * 0.5 + swingRotX;
    this.anchor.rotation.z = reloadTilt * 0.4 + swingRotZ;
  }
}
