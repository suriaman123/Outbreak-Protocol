// ==========================================================
// Weapon data. Stats are balanced against BASE_ZOMBIE_HEALTH (see zombies.js, chunk 2).
// dps is informational (shown in menu), actual fire logic arrives in chunk 2.
// ==========================================================

export const PRIMARY_WEAPONS = [
  {
    id: 'smg',
    slot: 'primary',
    name: 'VIPER SMG',
    damage: 14,
    fireRate: 9,      // rounds per second
    magSize: 30,
    reserveMax: 180,
    reloadTime: 1.6,
    spread: 0.035,
    range: 40,
    auto: true,
    desc: 'HIGH ROF / LOW DMG'
  },
  {
    id: 'rifle',
    slot: 'primary',
    name: 'AR-15 CARBINE',
    damage: 26,
    fireRate: 6,
    magSize: 25,
    reserveMax: 150,
    reloadTime: 2.0,
    spread: 0.018,
    range: 60,
    auto: true,
    desc: 'BALANCED / RELIABLE'
  },
  {
    id: 'shotgun',
    slot: 'primary',
    name: 'TREN-12 SHOTGUN',
    damage: 18,
    pellets: 8,
    fireRate: 1.1,
    magSize: 8,
    reserveMax: 48,
    reloadTime: 2.6,
    spread: 0.09,
    range: 16,
    auto: false,
    desc: 'CLOSE RANGE / DEVASTATING'
  }
];

export const SECONDARY_WEAPONS = [
  {
    id: 'pistol',
    slot: 'secondary',
    name: 'M9 SIDEARM',
    damage: 20,
    fireRate: 4,
    magSize: 15,
    reserveMax: 90,
    reloadTime: 1.3,
    spread: 0.02,
    range: 35,
    auto: false,
    desc: 'STEADY BACKUP',
    modelPath: 'assets/9mm.glb'
  },
  {
    id: 'revolver',
    slot: 'secondary',
    name: '.44 HAND CANNON',
    damage: 45,
    fireRate: 1.6,
    magSize: 6,
    reserveMax: 42,
    reloadTime: 2.2,
    spread: 0.01,
    range: 50,
    auto: false,
    desc: 'HIGH DMG / SLOW'
  },
  {
    id: 'machinepistol',
    slot: 'secondary',
    name: 'SCORPION MP',
    damage: 11,
    fireRate: 11,
    magSize: 20,
    reserveMax: 120,
    reloadTime: 1.4,
    spread: 0.05,
    range: 25,
    auto: true,
    desc: 'SPRAY & PRAY'
  }
];

export const MELEE_WEAPONS = [
  {
    id: 'knife',
    slot: 'melee',
    name: 'COMBAT KNIFE',
    damage: 35,
    fireRate: 2.2,
    range: 2.2,
    desc: 'FAST / SILENT'
  },
  {
    id: 'bat',
    slot: 'melee',
    name: 'SPIKED BAT',
    damage: 55,
    fireRate: 1.3,
    range: 2.5,
    desc: 'CROWD CONTROL'
  },
  {
    id: 'axe',
    slot: 'melee',
    name: 'FIRE AXE',
    damage: 80,
    fireRate: 0.9,
    range: 2.6,
    desc: 'HEAVY / LETHAL'
  }
];

export function getWeaponById(id) {
  return [...PRIMARY_WEAPONS, ...SECONDARY_WEAPONS, ...MELEE_WEAPONS].find(w => w.id === id);
}
