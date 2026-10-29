/* LuzMap — archivo de proyecto .luzmap (mapeo + medios en un único archivo) */
(function () {
  'use strict';
  const LM = window.LM;

  const MAGIC = 'LUZMAP01';

  /**
   * Formato: "LUZMAP01" (8 bytes) + longitud del manifiesto (uint32 LE) + manifiesto JSON + bytes de los medios.
   * getBlob(id) → Promise<Blob|null>
   */
  async function build(project, getBlob) {
    const files = [];
    const parts = [];
    let offset = 0;
    for (const m of project.media) {
      const blob = await getBlob(m.id);
      if (!blob) continue;
      files.push({ id: m.id, offset, size: blob.size, mime: blob.type || m.mime || '' });
      parts.push(blob);
      offset += blob.size;
    }
    const manifest = new TextEncoder().encode(JSON.stringify({ app: 'luzmap', version: 1, project, files }));
    const header = new Uint8Array(12);
    header.set(new TextEncoder().encode(MAGIC), 0);
    new DataView(header.buffer).setUint32(8, manifest.length, true);
    return { blob: new Blob([header, manifest, ...parts], { type: 'application/octet-stream' }), missing: project.media.length - files.length };
  }

  /** Devuelve { project, files: [{ id, blob }] } */
  async function parse(file) {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const magic = new TextDecoder().decode(head.slice(0, 8));
    if (magic === MAGIC) {
      const len = new DataView(head.buffer, head.byteOffset, 12).getUint32(8, true);
      const manifest = JSON.parse(await file.slice(12, 12 + len).text());
      const base = 12 + len;
      const files = (manifest.files || []).map((f) => ({
        id: f.id,
        blob: new Blob([file.slice(base + f.offset, base + f.offset + f.size)], { type: f.mime }),
      }));
      return { project: manifest.project, files };
    }
    // proyecto en JSON simple (sin medios)
    const data = JSON.parse(await file.text());
    return { project: data.project || data, files: [] };
  }

  LM.ProjectFile = { build, parse };
})();
