// 从 GLB 中提取所有纹理，用于分析 UV 布局
import { NodeIO } from '@gltf-transform/core';
import fs from 'fs';
import path from 'path';

const file = process.argv[2];
const outDir = process.argv[3];

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const doc = await new NodeIO().read(file);
const textures = doc.getRoot().listTextures();

textures.forEach((tex, i) => {
  const image = tex.getImage();
  const mime = tex.getMimeType();
  const ext = mime === 'image/png' ? 'png' : 'jpg';
  const name = tex.getName() || `texture_${i}`;
  const out = path.join(outDir, `${i}_${name}.${ext}`);
  fs.writeFileSync(out, Buffer.from(image));
  console.log(`[${i}] ${name} ${mime} ${tex.getSize().join('x')} -> ${out} (${(image.length/1024).toFixed(0)}KB)`);
});

// 输出 mesh 信息
const meshes = doc.getRoot().listMeshes();
meshes.forEach((m, i) => {
  m.listPrimitives().forEach((prim, j) => {
    const pos = prim.getAttribute('POSITION');
    const idx = prim.getIndices();
    console.log(`Mesh[${i}] ${m.getName()} prim[${j}] verts=${pos.getCount()} tris=${idx.getCount()/3} material=${prim.getMaterial()?.getName()}`);
  });
});
