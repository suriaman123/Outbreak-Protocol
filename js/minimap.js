import * as THREE from 'three';

const _dir = new THREE.Vector3();

export class Minimap {
  constructor(canvas, range = 55) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.range = range;
    this.w = canvas.width;
    this.h = canvas.height;
  }

  update(camera, playerPos, zombieManager, lootManager) {
    const ctx = this.ctx;
    const w = this.w, h = this.h;
    const cx = w / 2, cy = h / 2;
    const scale = (w / 2 - 4) / this.range;

    camera.getWorldDirection(_dir);
    const angle = Math.atan2(_dir.x, _dir.z);
    const cosA = Math.cos(angle), sinA = Math.sin(angle);

    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(10,13,10,0.6)';
    ctx.fillRect(0, 0, w, h);

    // range rings
    ctx.strokeStyle = 'rgba(157,255,60,0.12)';
    ctx.lineWidth = 1;
    [0.33, 0.66, 1].forEach(f => {
      ctx.beginPath();
      ctx.arc(cx, cy, (w / 2 - 4) * f, 0, Math.PI * 2);
      ctx.stroke();
    });

    const project = (wx, wz) => {
      const dx = wx - playerPos.x;
      const dz = wz - playerPos.z;
      const rx = dx * cosA - dz * sinA;
      const rz = dx * sinA + dz * cosA;
      return { x: cx + rx * scale, y: cy - rz * scale, dist: Math.hypot(dx, dz) };
    };

    // north marker
    const north = project(playerPos.x, playerPos.z + this.range * 0.94);
    ctx.fillStyle = 'rgba(232,228,216,0.5)';
    ctx.font = '9px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', north.x, north.y);

    // loot boxes
    if (lootManager) {
      for (const box of lootManager.boxes) {
        const p = project(box.x, box.z);
        if (p.dist > this.range) continue;
        ctx.fillStyle = box.type === 'xp' ? '#9dff3c' : box.type === 'health' ? '#c1272d' : '#b4552f';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // zombies
    if (zombieManager) {
      for (const z of zombieManager.zombies) {
        if (!z.alive) continue;
        const p = project(z.mesh.position.x, z.mesh.position.z);
        if (p.dist > this.range) continue;
        ctx.fillStyle = z.isFat ? '#ff6a3d' : '#c1272d';
        ctx.beginPath();
        ctx.arc(p.x, p.y, z.isFat ? 3.4 : 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();

    // outer ring + player marker (always centered, pointing up)
    ctx.strokeStyle = 'rgba(157,255,60,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#9dff3c';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx - 4, cy + 5);
    ctx.lineTo(cx + 4, cy + 5);
    ctx.closePath();
    ctx.fill();
  }
}
