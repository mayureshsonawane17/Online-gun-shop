# MagicFX

Procedural real-time magic VFX for Three.js r160+. No external image, texture, or model assets.

## Files
- `magic-fx.js` — standalone ES module.
- `preview.html` — interactive dark demo (served over HTTP).
- `README.md` — this guide.

## Run the preview
From this folder, run a local static server, for example:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/preview.html`. ES modules/import maps generally do not work from `file://`.

## API

```js
import * as THREE from "three";
import { MagicFX } from "./magic-fx.js";

const fx = new MagicFX({
  renderer, scene, camera,
  quality: 1,              // 0.25–1
  postprocessing: true,
  maxParticles: 1500
});

const charge = fx.charge("energyWave", {
  origin: new THREE.Vector3(0, 0, 0),
  power: 0.7
});
charge.update({ origin: handPosition, power: 0.9 });
charge.stop();

const beam = fx.cast("energyWave", {
  origin: handPosition,
  direction: aimDirection,
  target: targetPosition,  // optional Vector3
  power: 0.9,
  color: new THREE.Color("#55aaff")
});

// Re-aim held effects every frame:
beam.update({ origin: handPosition, direction: aimDirection, target: targetPosition, power: 0.9 });
beam.stop();

fx.update(deltaSeconds);
fx.render();               // scene + post-processing; use instead of renderer.render()
fx.setPostFX({ bloom: 0.9, chroma: 0.4, vignette: 0.2 });
fx.dispose();
```

### Cast types
`energyWave`, `powerBlast`, `air`, `water`, `earth`, `fire`, `lightning`, `shield`.

`cast()` returns a handle with `update()` and `stop()`. Energy Wave and Shield are sustained/held effects. Other casts are timed effects. `charge()` creates a reusable charge orb; stop it when the gesture is released, then call `cast()` to fire.

## Webcam overlay integration
Create the renderer with alpha enabled and a transparent clear color:

```js
const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
  premultipliedAlpha: true
});
renderer.setClearColor(0x000000, 0);
renderer.domElement.style.position = "absolute";
renderer.domElement.style.inset = "0";
renderer.domElement.style.pointerEvents = "none";
```

Place the canvas above the mirrored video. Mirror the video with CSS, but keep the WebGL canvas unmirrored unless you also transform the gesture coordinates. Use `fx.render()` for the final draw. If your app owns its render loop, call `fx.update(dt)` exactly once per frame.

For hand tracking, convert normalized screen coordinates to NDC (`x * 2 - 1`, `1 - y * 2`) and raycast onto a plane or into your world. Pass the resulting world-space `Vector3` values to `cast()` / `handle.update()`.

## Tuning
- `quality` is an effect-density multiplier; the built-in FPS monitor reduces it when measured FPS falls below roughly 48 and slowly restores it above 57.
- `maxParticles` is capped at 1500. The pool reuses fixed GPU attributes.
- `setPostFX()` adjusts bloom, chromatic aberration, and vignette. Set `postprocessing:false` if another composer owns the final render.
- `power` is clamped to 0–1. Higher values increase scale, intensity, particle density, and shake.
- Keep one `MagicFX` instance per renderer/scene/camera.

## Approximation notes
This is a self-contained procedural starter library, not a physically based simulation:
- Bloom is a compact multi-tap bright-pass approximation, not a multi-resolution UnrealBloomPass.
- Shockwave distortion is a screen-space radial UV warp; it does not refract actual scene depth.
- Water refraction is represented by animated highlights/ripples, not true transmission or fluid simulation.
- Fire and smoke are layered procedural sprites/particles, not volumetric ray-marched media.
- Air turbulence is approximated with spiral streaks and particle motion rather than a full curl-noise field.
- Earth meshes are procedural low-poly rocks; ground cracks are represented by expanding rings and dust.
- Lightning is a randomized segmented branching-style bolt (single main zig-zag in this compact implementation); it is not a full conductive-path solver.
- Energy Wave uses a procedural animated beam shader and particles; no real audio is generated.

## Production integration notes
- The preview uses a perspective camera and a simple z=0 aim plane. Replace this with your app's hand-to-world mapping.
- If you use a separate post-processing composer, disable this module's post pass and render through your own pipeline.
- Dispose the instance when the webcam scene is torn down.
