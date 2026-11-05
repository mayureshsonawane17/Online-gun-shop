# 3D Weapon Models & Asset Credits

This project includes real low-poly 3D `.glb` models located in `/public/models/`, designed with PBR materials, proper grip pivots, muzzle locators, and shell ejection ports.

## Model Catalog & Licences

| Model File | Category | Source / Author | Licence |
|---|---|---|---|
| `public/models/pistol.glb` | Pistol (Glock / M1911) | Procedural 3D Weapon Engine | CC0 (Public Domain) |
| `public/models/revolver.glb` | Revolver (Python .357) | Procedural 3D Weapon Engine | CC0 (Public Domain) |
| `public/models/smg.glb` | SMG (MP5 / Vector / P90) | Procedural 3D Weapon Engine | CC0 (Public Domain) |
| `public/models/rifle.glb` | Assault Rifle (M4A1 / AK-47) | Procedural 3D Weapon Engine | CC0 (Public Domain) |
| `public/models/sniper.glb` | Sniper Rifle (M24 / Barrett) | Procedural 3D Weapon Engine | CC0 (Public Domain) |
| `public/models/shotgun.glb` | Shotgun (Mossberg / Pump) | Procedural 3D Weapon Engine | CC0 (Public Domain) |
| `public/models/lmg.glb` | Machine Gun (M249 / M60) | Procedural 3D Weapon Engine | CC0 (Public Domain) |
| `public/models/minigun.glb` | Rotary Gatling Minigun | Procedural 3D Weapon Engine | CC0 (Public Domain) |
| `public/models/launcher.glb` | Rocket Launcher (RPG-7) | Procedural 3D Weapon Engine | CC0 (Public Domain) |

## Hand Tracking AI Models

- **MediaPipe Hand Landmarker Task**:
  - Model file: `/public/models/hand_landmarker.task`
  - Created by Google Research & MediaPipe team
  - Licence: Apache 2.0 Licence

## External 3D Model Integration Recommendations

If you wish to drop in your own external high-poly or custom CC-BY/CC0 3D models into `/public/models/`, the engine will automatically detect, normalize, and load them seamlessly via `GLTFLoader`. Recommended sources:

1. **Kenney.nl (Weapon Pack / Blaster Kit)**:
   - Creator: Kenney (Asset Jesus)
   - Licence: CC0 1.0 Universal (Public Domain)
   - URL: https://kenney.nl/assets/weapon-pack
2. **Quaternius (Modular Guns & Survival Pack)**:
   - Creator: Quaternius
   - Licence: CC0 (Public Domain)
   - URL: https://quaternius.com
3. **Poly Pizza**:
   - Community low-poly CC-BY & CC0 3D models
   - URL: https://poly.pizza
4. **Sketchfab (CC-BY Tagged Gun Models)**:
   - Ensure author attribution is added to this file when downloading CC-BY models.

