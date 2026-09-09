// 优化混元3D生成的人体 GLB：减面 + 纹理缩小压缩
// 用法: node scripts/optimize-human.mjs <input.glb> <output.glb> [targetTris] [texSize]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, textureCompress, dequantize } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

await MeshoptSimplifier.ready;

const input = process.argv[2];
const output = process.argv[3];
const targetTris = parseInt(process.argv[4] || '50000', 10);
const texSize = parseInt(process.argv[5] || '1024', 10);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);

// 优化前面数/纹理统计
let beforeTris = 0;
doc.getRoot().listMeshes().forEach(m => m.listPrimitives().forEach(p => {
  beforeTris += p.getIndices() ? p.getIndices().getCount() / 3 : 0;
}));
console.log(`优化前: ${Math.round(beforeTris)} 三角面, ${(await import('fs')).statSync(input).size/1024/1024|0}MB`);

await doc.transform(
  // 焊接重复顶点（减面前必须做）
  weld(),
  // 减面
  simplify({ simplifier: MeshoptSimplifier, ratio: targetTris / beforeTris, error: 0.001 }),
  // 纹理缩小 + 转 JPEG
  textureCompress({
    encoder: sharp,
    targetFormat: 'jpeg',
    quality: 82,
    resizedFilter: 'lanczos3',
    resize: [texSize, texSize],
  }),
  // normal 贴图不能转 jpeg（需要无损），单独处理：保持 png 但缩小
  dedup(),
  prune({ keepAttributes: ['NORMAL', 'TEXCOORD_0'] }),
);

// normal 纹理转回 PNG（JPEG 压缩法线会产生伪影）
for (const tex of doc.getRoot().listTextures()) {
  const slots = [];
  doc.getRoot().listMaterials().forEach(mat => {
    if (mat.getNormalTexture() === tex) slots.push('normal');
  });
  if (slots.includes('normal')) {
    const img = await sharp(Buffer.from(tex.getImage()))
      .resize(texSize, texSize, { fit: 'inside' })
      .png({ quality: 90, compressionLevel: 9 })
      .toBuffer();
    tex.setImage(new Uint8Array(img));
    tex.setMimeType('image/png');
  }
}

await io.write(output, doc);

let afterTris = 0;
doc.getRoot().listMeshes().forEach(m => m.listPrimitives().forEach(p => {
  afterTris += p.getIndices() ? p.getIndices().getCount() / 3 : 0;
}));
const outSize = (await import('fs')).statSync(output).size;
console.log(`优化后: ${Math.round(afterTris)} 三角面, ${(outSize/1024/1024).toFixed(2)}MB -> ${output}`);
