# OUTBREAK://PROTOCOL

A first-person zombie-survival shooter that runs entirely in the browser — no build step, no backend, just static files. Built with [Three.js](https://threejs.org/) and vanilla JavaScript, ready to deploy on GitHub Pages.

## Features

- **Character select** — play as CPL. Drake or SGT. Vasquez
- **Full loadout system** — pick 1 primary, 1 secondary, and 1 melee weapon from 9 total, each with distinct stats and a unique procedural viewmodel
- **First-person shooter controls** — pointer-lock mouse look, WASD movement, sprint, jump, headshots (2x damage)
- **Zombie AI** — hordes spawn from all directions and path toward you, with occasional tougher/fatter zombies (1.5x health, slower)
- **XP & leveling** — kill zombies to level up, restore health, and pick from 3 upgrades (more health, more damage, slower enemies) each level
- **Rising difficulty** — zombies get stronger, faster, and spawn in greater numbers the higher your level
- **Loot crates** — scattered across the map; stand near one for 3–5 seconds to open it for XP, health, or an ammo resupply
- **Procedural audio** — all sound effects (gunfire, zombie groans, reloads, level-ups, etc.) are synthesized live with the Web Audio API — zero external audio files
- **Minimap/radar**, dynamic HUD, low-health pulse warning, and an atmospheric procedurally-generated city

## Controls

| Action | Key |
|---|---|
| Move | `W A S D` |
| Look | Mouse |
| Fire | Left Click (hold for automatic weapons) |
| Reload | `R` |
| Switch weapon | `1` `2` `3` |
| Sprint | `Shift` |
| Jump | `Space` |
| Pause | `Esc` |

## Running locally

Because the game uses native ES modules, it must be served over `http://`, not opened directly as a `file://` URL. From the project folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

(Any other static server works too — `npx serve`, VS Code's Live Server extension, etc.)

## Deploying to GitHub Pages

1. Create a new GitHub repository and push this project to it, keeping the folder structure intact:
   ```
   index.html
   css/style.css
   js/main.js
   js/player.js
   js/world.js
   js/zombies.js
   js/combat.js
   js/weapons.js
   js/progression.js
   js/loot.js
   js/minimap.js
   js/audio.js
   ```
   ```bash
   git init
   git add .
   git commit -m "Outbreak://Protocol"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to `Deploy from a branch`, **Branch** to `main` and folder to `/ (root)`, then **Save**.
4. Wait a minute or two, then your game will be live at:
   `https://YOUR_USERNAME.github.io/YOUR_REPO/`

Note: file and folder names are case-sensitive on GitHub Pages' servers (unlike Windows/macOS filesystems), so keep everything lowercase exactly as listed above.

## Technical notes

- Three.js is loaded from the `unpkg` CDN via an import map in `index.html` — the game needs an internet connection to fetch it on first load (it's then cached by the browser).
- All zombies, buildings, weapons, and the ground texture are generated procedurally in code — there are no external model or texture files to manage.
- All sound effects are synthesized at runtime via the Web Audio API — no audio files either.

## Project structure

| File | Responsibility |
|---|---|
| `index.html` | Menu markup, HUD markup, import map |
| `css/style.css` | All visual styling |
| `js/main.js` | Orchestrates menu, scene, and the game loop |
| `js/world.js` | Procedural city, lighting, fog, collisions |
| `js/player.js` | Pointer-lock FPS controller |
| `js/weapons.js` | Weapon stat data |
| `js/combat.js` | Weapon viewmodels, firing, reloading, recoil |
| `js/zombies.js` | Zombie entity + spawn/AI manager |
| `js/progression.js` | XP, leveling, upgrade choices, difficulty scaling |
| `js/loot.js` | Loot crate spawning and hold-to-open logic |
| `js/minimap.js` | Radar HUD element |
| `js/audio.js` | Procedural sound effects |
