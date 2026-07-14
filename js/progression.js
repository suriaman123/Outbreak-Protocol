// ==========================================================
// Progression: XP -> levels -> upgrade choices, and per-level
// difficulty scaling fed into the ZombieManager.
// ==========================================================

const XP_NORMAL_KILL = 14;
const XP_FAT_KILL = 30;
const XP_HEADSHOT_BONUS = 5;

const HEALTH_UPGRADE_AMOUNT = 20;
const DAMAGE_UPGRADE_MULT = 1.15;
const SLOW_UPGRADE_MULT = 0.92; // multiplies zombie speed (lower = slower)
const SLOW_UPGRADE_FLOOR = 0.45;

export class Progression {
  constructor({ player, zombieManager, onLevelUpStart, onLevelUpEnd, onChange }) {
    this.player = player;
    this.zombieManager = zombieManager;
    this.onLevelUpStart = onLevelUpStart; // called when banner should show (game should pause)
    this.onLevelUpEnd = onLevelUpEnd;     // called when banner closes (game should resume)
    this.onChange = onChange;             // called whenever level/xp changes, for HUD refresh

    this.level = 1;
    this.xp = 0;
    this.xpToNext = this._xpForLevel(1);

    this.upgrades = { health: 0, damage: 0, slow: 0 };
    this.damageMultiplier = 1;
    this.playerSlowMult = 1; // multiplies zombie speed downward as player picks "slow enemies"

    this.isChoosingUpgrade = false;

    this._applyDifficulty(); // set initial (level 1) difficulty
    this._notify();
  }

  _xpForLevel(level) {
    return Math.round(50 + (level - 1) * 32);
  }

  getDamageMultiplier() {
    return this.damageMultiplier;
  }

  addKillXp(isFat, headshot) {
    let amount = isFat ? XP_FAT_KILL : XP_NORMAL_KILL;
    if (headshot) amount += XP_HEADSHOT_BONUS;
    this._addXp(amount);
  }

  addXp(amount) {
    this._addXp(amount);
  }

  _addXp(amount) {
    if (this.isChoosingUpgrade) {
      // queue nothing fancy — just still grant xp, next level check happens after banner closes too
    }
    this.xp += amount;
    let leveled = false;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this._levelUp();
      leveled = true;
    }
    this._notify();
    return leveled;
  }

  _levelUp() {
    this.level++;
    this.xpToNext = this._xpForLevel(this.level);

    // restore some health on level up
    this.player.heal(this.player.maxHealth * 0.18 + 8);

    // zombies scale up with level regardless of player choices
    this._applyDifficulty();

    // queue the upgrade-choice UI (handled by caller; only one banner at a time)
    this._pendingLevelUps = (this._pendingLevelUps || 0) + 1;
  }

  // Called by main loop each frame (cheap check) to pop a pending level-up banner
  // if one is queued and none is currently showing.
  tick() {
    if (!this.isChoosingUpgrade && this._pendingLevelUps > 0) {
      this._pendingLevelUps--;
      this.isChoosingUpgrade = true;
      if (this.onLevelUpStart) this.onLevelUpStart(this._buildChoices());
    }
  }

  _buildChoices() {
    return [
      {
        id: 'health',
        title: 'REINFORCED VITALS',
        desc: `+${HEALTH_UPGRADE_AMOUNT} MAX HEALTH (LV.${this.upgrades.health + 1}) — HEALS ON PICK`,
        apply: () => {
          this.player.maxHealth += HEALTH_UPGRADE_AMOUNT;
          this.player.heal(HEALTH_UPGRADE_AMOUNT);
          this.upgrades.health++;
        }
      },
      {
        id: 'damage',
        title: 'ORDNANCE UPGRADE',
        desc: `+15% WEAPON DAMAGE (LV.${this.upgrades.damage + 1}) — ALL WEAPONS`,
        apply: () => {
          this.damageMultiplier *= DAMAGE_UPGRADE_MULT;
          this.upgrades.damage++;
        }
      },
      {
        id: 'slow',
        title: 'NEURO-TOXIN ROUNDS',
        desc: `-8% ZOMBIE MOVEMENT SPEED (LV.${this.upgrades.slow + 1})`,
        apply: () => {
          this.playerSlowMult = Math.max(SLOW_UPGRADE_FLOOR, this.playerSlowMult * SLOW_UPGRADE_MULT);
          this.upgrades.slow++;
          this._applyDifficulty();
        }
      }
    ];
  }

  chooseUpgrade(choice) {
    choice.apply();
    this.isChoosingUpgrade = false;
    if (this.onLevelUpEnd) this.onLevelUpEnd();
    this._notify();
  }

  _applyDifficulty() {
    const level = this.level;
    const healthMult = 1 + (level - 1) * 0.09;
    const levelSpeedMult = Math.min(1.9, 1 + (level - 1) * 0.035);
    const spawnInterval = Math.max(0.65, 2.4 - (level - 1) * 0.09);
    const maxAlive = Math.min(42, 18 + Math.floor((level - 1) * 1.3));
    const spawnBatch = 1 + Math.floor((level - 1) / 4);
    const fatChance = Math.min(0.35, 0.12 + (level - 1) * 0.01);

    this.zombieManager.setDifficulty({
      healthMult,
      speedMult: levelSpeedMult * this.playerSlowMult,
      spawnInterval,
      maxAlive,
      spawnBatch,
      fatChance
    });
  }

  _notify() {
    if (this.onChange) {
      this.onChange({ level: this.level, xp: this.xp, xpToNext: this.xpToNext });
    }
  }
}
