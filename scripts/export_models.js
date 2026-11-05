import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';
import { ProceduralGuns } from '../src/models/ProceduralGuns.js';

class FileReaderPolyfill {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(buf => {
      this.result = buf;
      if (this.onloadend) this.onloadend();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then(buf => {
      this.result = 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + Buffer.from(buf).toString('base64');
      if (this.onloadend) this.onloadend();
    });
  }
}
globalThis.FileReader = FileReaderPolyfill;

const categories = [
  { name: 'pistol', cat: 'Pistol' },
  { name: 'revolver', cat: 'Revolver' },
  { name: 'smg', cat: 'SMG' },
  { name: 'rifle', cat: 'Rifle' },
  { name: 'sniper', cat: 'Sniper' },
  { name: 'shotgun', cat: 'Shotgun' },
  { name: 'lmg', cat: 'LMG' },
  { name: 'minigun', cat: 'Minigun' },
  { name: 'launcher', cat: 'Launcher' }
];

const outDir = path.resolve('public/models');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function exportAll() {
  const exporter = new GLTFExporter();
  for (const item of categories) {
    const gunGroup = ProceduralGuns.createGun(item.cat);
    const glbBuffer = await new Promise((resolve, reject) => {
      exporter.parse(gunGroup, resolve, reject, { binary: true });
    });
    const filePath = path.join(outDir, `${item.name}.glb`);
    fs.writeFileSync(filePath, Buffer.from(glbBuffer));
    console.log(`Generated: ${filePath} (${fs.statSync(filePath).size} bytes)`);
  }
  console.log('All 3D models exported successfully to public/models/');
}

exportAll();
