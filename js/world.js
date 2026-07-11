import * as THREE from 'three';

export const WORLD_SIZE = 220; // half-extent of the playable ground (world spans -SIZE..+SIZE)

// Procedurally generates a grimy asphalt/dirt texture for the ground using canvas.
function makeGroundTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#23261f';
  ctx.fillRect(0, 0, size, size);

  // noise speckle
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const v = Math.random();
    ctx.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.15)' : 'rgba(120,130,90,0.08)';
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  // cracks
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    let x = Math.random() * size, y = Math.random() * size;
    ctx.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // faint toxic patches
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 20 + Math.random() * 50;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(120,200,40,0.10)');
    g.addColorStop(1, 'rgba(120,200,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(40, 40);
  tex.anisotropy = 4;
  return tex;
}

function makeWindowTexture(litRatio = 0.35) {
  const w = 64, h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#141712';
  ctx.fillRect(0, 0, w, h);
  const cols = 4, rows = 6;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random() < litRatio;
      ctx.fillStyle = lit ? 'rgba(157,255,60,0.55)' : 'rgba(10,12,9,0.9)';
      ctx.fillRect(c * (w / cols) + 3, r * (h / rows) + 3, w / cols - 6, h / rows - 6);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function buildBuilding(x, z) {
  const group = new THREE.Group();
  const width = 8 + Math.random() * 10;
  const depth = 8 + Math.random() * 10;
  const height = 10 + Math.random() * 26;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.28 + Math.random() * 0.05, 0.12, 0.11 + Math.random() * 0.05),
    roughness: 0.95,
    metalness: 0.05
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bodyMat);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // window strip texture on faces via emissive planes for a lit-window feel
  const winTex = makeWindowTexture(0.25 + Math.random() * 0.3);
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  winTex.repeat.set(Math.max(1, Math.round(width / 3)), Math.max(1, Math.round(height / 4)));
  const winMat = new THREE.MeshBasicMaterial({ map: winTex, transparent: false });

  const faceOffsets = [
    { pos: [0, height / 2, depth / 2 + 0.02], rotY: 0, w: width, h: height },
    { pos: [0, height / 2, -depth / 2 - 0.02], rotY: Math.PI, w: width, h: height },
    { pos: [width / 2 + 0.02, height / 2, 0], rotY: Math.PI / 2, w: depth, h: height },
    { pos: [-width / 2 - 0.02, height / 2, 0], rotY: -Math.PI / 2, w: depth, h: height }
  ];
  faceOffsets.forEach(f => {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(f.w * 0.94, f.h * 0.94), winMat);
    plane.position.set(...f.pos);
    plane.rotation.y = f.rotY;
    group.add(plane);
  });

  // rooftop clutter box
  if (Math.random() < 0.6) {
    const clutter = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.3, 1.4, depth * 0.3),
      new THREE.MeshStandardMaterial({ color: 0x1a1c16, roughness: 1 })
    );
    clutter.position.set((Math.random() - 0.5) * width * 0.4, height + 0.7, (Math.random() - 0.5) * depth * 0.4);
    clutter.castShadow = true;
    group.add(clutter);
  }

  group.position.set(x, 0, z);
  group.userData.isBuilding = true;
  group.userData.bounds = { x, z, halfW: width / 2 + 0.6, halfD: depth / 2 + 0.6 };
  return group;
}

function buildDebris(x, z) {
  const kind = Math.random();
  let mesh;
  if (kind < 0.4) {
    // burnt-out car
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a1e18, roughness: 0.8, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.3, 2), bodyMat);
    body.position.y = 0.85;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 1.9), bodyMat);
    cabin.position.set(-0.2, 1.7, 0);
    group.add(body, cabin);
    group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.userData.bounds = { x, z, halfW: 2.4, halfD: 1.3 };
    mesh = group;
  } else if (kind < 0.7) {
    // concrete barrier
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x4a4a44, roughness: 1 })
    );
    mesh.position.y = 0.5;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.bounds = { x, z, halfW: 1.3, halfD: 0.5 };
  } else {
    // rubble pile
    mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.9 + Math.random() * 0.6, 0),
      new THREE.MeshStandardMaterial({ color: 0x33342c, roughness: 1 })
    );
    mesh.position.y = 0.5;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.bounds = { x, z, halfW: 1, halfD: 1 };
  }
  mesh.position.x = x;
  mesh.position.z = z;
  return mesh;
}

export function buildWorld(scene) {
  const colliders = []; // { x, z, halfW, halfD } used for simple AABB collision

  // ---- sky / fog ----
  scene.background = new THREE.Color(0x0a0d10);
  scene.fog = new THREE.FogExp2(0x0a0d10, 0.011);

  // subtle sky gradient dome
  const skyGeo = new THREE.SphereGeometry(500, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top: { value: new THREE.Color(0x131a12) },
      bottom: { value: new THREE.Color(0x03130a) }
    },
    vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vPos; uniform vec3 top; uniform vec3 bottom;
      void main(){
        float h = normalize(vPos).y * 0.5 + 0.5;
        gl_FragColor = vec4(mix(bottom, top, h), 1.0);
      }`
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // ---- lighting ----
  const hemi = new THREE.HemisphereLight(0x3d4a33, 0x0b0a08, 0.6);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0x9fb8ff, 0.55);
  moon.position.set(-80, 120, -60);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -120;
  moon.shadow.camera.right = 120;
  moon.shadow.camera.top = 120;
  moon.shadow.camera.bottom = -120;
  moon.shadow.camera.far = 300;
  moon.shadow.bias = -0.0015;
  scene.add(moon);

  const fill = new THREE.DirectionalLight(0x6d5a3a, 0.15);
  fill.position.set(60, 40, 80);
  scene.add(fill);

  // ---- ground ----
  const groundTex = makeGroundTexture();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- perimeter fence glow (visually bounds the play area) ----
  const fenceMat = new THREE.MeshBasicMaterial({ color: 0x9dff3c, transparent: true, opacity: 0.15 });
  const fenceGeo = new THREE.PlaneGeometry(WORLD_SIZE * 2, 6);
  [0, 1, 2, 3].forEach(i => {
    const f = new THREE.Mesh(fenceGeo, fenceMat);
    f.position.y = 3;
    if (i === 0) f.position.z = -WORLD_SIZE;
    if (i === 1) { f.position.z = WORLD_SIZE; f.rotation.y = Math.PI; }
    if (i === 2) { f.position.x = -WORLD_SIZE; f.rotation.y = Math.PI / 2; }
    if (i === 3) { f.position.x = WORLD_SIZE; f.rotation.y = -Math.PI / 2; }
    scene.add(f);
  });

  // ---- buildings scattered in a ring layout, keeping a clear spawn zone in the middle ----
  const buildingCount = 34;
  for (let i = 0; i < buildingCount; i++) {
    let x, z, tries = 0;
    do {
      x = (Math.random() - 0.5) * WORLD_SIZE * 1.8;
      z = (Math.random() - 0.5) * WORLD_SIZE * 1.8;
      tries++;
    } while (Math.hypot(x, z) < 22 && tries < 20);
    const b = buildBuilding(x, z);
    scene.add(b);
    colliders.push(b.userData.bounds);
  }

  // ---- scattered debris/props for cover & visual detail ----
  const debrisCount = 60;
  for (let i = 0; i < debrisCount; i++) {
    const x = (Math.random() - 0.5) * WORLD_SIZE * 1.9;
    const z = (Math.random() - 0.5) * WORLD_SIZE * 1.9;
    if (Math.hypot(x, z) < 10) continue;
    const d = buildDebris(x, z);
    scene.add(d);
    if (d.userData.bounds) colliders.push(d.userData.bounds);
  }

  // ---- drifting ash particles for atmosphere ----
  const particleCount = 500;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * WORLD_SIZE * 2;
    positions[i * 3 + 1] = Math.random() * 40;
    positions[i * 3 + 2] = (Math.random() - 0.5) * WORLD_SIZE * 2;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particleMat = new THREE.PointsMaterial({ color: 0x8a9478, size: 0.12, transparent: true, opacity: 0.5 });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  return { colliders, particles };
}

// simple circle-vs-AABB collision resolution used by the player controller
export function resolveCollisions(pos, radius, colliders) {
  for (const c of colliders) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const overlapX = c.halfW + radius - Math.abs(dx);
    const overlapZ = c.halfD + radius - Math.abs(dz);
    if (overlapX > 0 && overlapZ > 0) {
      if (overlapX < overlapZ) {
        pos.x += overlapX * Math.sign(dx || 1);
      } else {
        pos.z += overlapZ * Math.sign(dz || 1);
      }
    }
  }
  const limit = WORLD_SIZE - 2;
  pos.x = Math.max(-limit, Math.min(limit, pos.x));
  pos.z = Math.max(-limit, Math.min(limit, pos.z));
}
