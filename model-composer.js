// Combina os GLBs estáticos do catálogo sem alterar os arquivos originais.
const cache = new Map();
const decoder = new TextDecoder();
const encoder = new TextEncoder();

async function loadPart(path) {
  if (!cache.has(path)) {
    cache.set(path, (async () => {
      const response = await fetch(path, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Não foi possível carregar ${path}`);
      const data = await response.arrayBuffer();
      const view = new DataView(data);
      if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) throw new Error('GLB inválido');
      let json, binary;
      for (let offset = 12; offset < data.byteLength;) {
        const length = view.getUint32(offset, true);
        const type = view.getUint32(offset + 4, true);
        const chunk = new Uint8Array(data, offset + 8, length);
        if (type === 0x4e4f534a) json = JSON.parse(decoder.decode(chunk));
        if (type === 0x004e4942) binary = chunk;
        offset += 8 + length;
      }
      // Os nove arquivos atuais usam geometria estática e cores nos vértices.
      // Recusar recursos não suportados evita compor silenciosamente um arquivo incorreto.
      if (!json || !binary || json.buffers?.length !== 1 || json.buffers[0].uri ||
          json.extensionsRequired?.length || json.animations?.length || json.skins?.length ||
          json.textures?.length || json.images?.length ||
          json.nodes?.some(n => n.matrix || n.translation || n.rotation || n.scale) ||
          json.accessors?.some(a => a.sparse) ||
          json.meshes?.some(m => m.primitives.some(p => p.targets || p.extensions))) {
        throw new Error('Este GLB precisa ser exportado como geometria estática, com cores nos vértices.');
      }
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
        const accessor = json.accessors[primitive.attributes.POSITION];
        if (!accessor.min || !accessor.max) throw new Error('GLB sem limites de posição');
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis], accessor.min[axis]);
          max[axis] = Math.max(max[axis], accessor.max[axis]);
        }
      }
      return { json, binary, min, max };
    })().catch(error => { cache.delete(path); throw error; }));
  }
  return cache.get(path);
}

export async function composeConfiguration(paths) {
  const parts = await Promise.all(paths.map(loadPart));
  const output = {
    asset: { version: '2.0', generator: 'Pellens Showroom' }, scene: 0,
    scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], materials: []
  };
  const chunks = [];
  let binaryLength = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex];
    const source = structuredClone(part.json);
    const offsets = {
      nodes: output.nodes.length, meshes: output.meshes.length,
      accessors: output.accessors.length, views: output.bufferViews.length,
      materials: output.materials.length
    };
    // Assentar cada colchão no topo da base, inclusive as opções com alturas diferentes.
    const lift = partIndex === 1 ? parts[0].max[1] - part.min[1] : 0;
    for (let axis = 0; axis < 3; axis++) {
      const adjustment = axis === 1 ? lift : 0;
      min[axis] = Math.min(min[axis], part.min[axis] + adjustment);
      max[axis] = Math.max(max[axis], part.max[axis] + adjustment);
    }
    output.bufferViews.push(...source.bufferViews.map(v => ({
      ...v, buffer: 0, byteOffset: (v.byteOffset || 0) + binaryLength
    })));
    output.accessors.push(...source.accessors.map(a => ({ ...a, bufferView: a.bufferView + offsets.views })));
    output.materials.push(...(source.materials || []));
    output.meshes.push(...source.meshes.map(mesh => ({
      ...mesh, primitives: mesh.primitives.map(p => ({
        ...p,
        attributes: Object.fromEntries(Object.entries(p.attributes).map(([key, value]) => [key, value + offsets.accessors])),
        ...(p.indices !== undefined ? { indices: p.indices + offsets.accessors } : {}),
        ...(p.material !== undefined ? { material: p.material + offsets.materials } : {})
      }))
    })));
    output.nodes.push(...source.nodes.map(node => ({
      ...node,
      ...(node.mesh !== undefined ? { mesh: node.mesh + offsets.meshes } : {}),
      ...(node.children ? { children: node.children.map(i => i + offsets.nodes) } : {})
    })));
    const rootIndex = output.nodes.length;
    output.nodes.push({
      name: ['Base', 'Colchão', 'Cabeceira'][partIndex],
      children: source.scenes[source.scene || 0].nodes.map(i => i + offsets.nodes),
      translation: [0, lift, 0]
    });
    output.scenes[0].nodes.push(rootIndex);
    chunks.push(part.binary);
    binaryLength += part.binary.byteLength;
    const padding = (4 - binaryLength % 4) % 4;
    if (padding) { chunks.push(new Uint8Array(padding)); binaryLength += padding; }
  }
  output.buffers = [{ byteLength: binaryLength }];
  const json = encoder.encode(JSON.stringify(output));
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const buffer = new ArrayBuffer(12 + 8 + jsonLength + 8 + binaryLength);
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jsonLength);
  bytes.set(json, 20);
  const binaryStart = 20 + jsonLength;
  view.setUint32(binaryStart, binaryLength, true);
  view.setUint32(binaryStart + 4, 0x004e4942, true);
  let cursor = binaryStart + 8;
  for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.length; }
  const radius = Math.hypot(...max.map((value, i) => (value - min[i]) / 2));
  return { blob: new Blob([buffer], { type: 'model/gltf-binary' }), radius, document: output };
}
