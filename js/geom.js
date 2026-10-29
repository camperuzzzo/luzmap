/* LuzMap — geometría: homografía (perspectiva), malla de deformación, polígonos */
(function () {
  'use strict';
  const LM = window.LM;
  const clamp = LM.clamp;

  /**
   * Homografía del cuadrado unidad (u,v) a un cuadrilátero.
   * Esquinas en orden: 0=(0,0) arriba-izq, 1=(1,0) arriba-der, 2=(1,1) abajo-der, 3=(0,1) abajo-izq.
   * Devuelve [a,b,c,d,e,f,g,h,1]: x=(a u+b v+c)/W, y=(d u+e v+f)/W, W=g u+h v+1
   */
  function homography(p) {
    const [x0, y0] = p[0], [x1, y1] = p[1], [x2, y2] = p[2], [x3, y3] = p[3];
    const sx = x0 - x1 + x2 - x3;
    const sy = y0 - y1 + y2 - y3;
    let g = 0, h = 0;
    if (Math.abs(sx) > 1e-12 || Math.abs(sy) > 1e-12) {
      const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
      const det = dx1 * dy2 - dx2 * dy1;
      if (Math.abs(det) < 1e-12) return null;
      g = (sx * dy2 - dx2 * sy) / det;
      h = (dx1 * sy - sx * dy1) / det;
    }
    return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
  }

  function isConvex(p) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) < 1e-10) return false;
      const s = cross > 0 ? 1 : -1;
      if (!sign) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  }

  function bilinear(p, u, v) {
    const top = [LM.lerp(p[0][0], p[1][0], u), LM.lerp(p[0][1], p[1][1], u)];
    const bot = [LM.lerp(p[3][0], p[2][0], u), LM.lerp(p[3][1], p[2][1], u)];
    return [LM.lerp(top[0], bot[0], v), LM.lerp(top[1], bot[1], v)];
  }

  const cr = (p0, p1, p2, p3, t) =>
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

  /** Desplazamiento interpolado (Catmull-Rom bicúbico) de la malla en (u,v). */
  function meshOffset(mesh, u, v) {
    const C = mesh.cols, R = mesh.rows, o = mesh.offsets;
    const fx = clamp(u, 0, 1) * C, fy = clamp(v, 0, 1) * R;
    let i = Math.floor(fx), j = Math.floor(fy);
    if (i >= C) i = C - 1;
    if (j >= R) j = R - 1;
    const tx = fx - i, ty = fy - j;
    const get = (ii, jj) => o[clamp(jj, 0, R) * (C + 1) + clamp(ii, 0, C)] || [0, 0];
    const rows = [];
    for (let m = -1; m <= 2; m++) {
      const a = get(i - 1, j + m), b = get(i, j + m), c = get(i + 1, j + m), d = get(i + 2, j + m);
      rows.push([cr(a[0], b[0], c[0], d[0], tx), cr(a[1], b[1], c[1], d[1], tx)]);
    }
    return [
      cr(rows[0][0], rows[1][0], rows[2][0], rows[3][0], ty),
      cr(rows[0][1], rows[1][1], rows[2][1], rows[3][1], ty),
    ];
  }

  /** Prepara datos de geometría reutilizables para una superficie. */
  function prepare(surface) {
    const H = homography(surface.corners);
    const convex = !!H && isConvex(surface.corners);
    return { H, convex: convex && checkW(H), mesh: surface.mesh && surface.mesh.enabled ? surface.mesh : null, corners: surface.corners };
  }

  function checkW(H) {
    // W debe ser positivo en las 4 esquinas para que la interpolación en perspectiva sea válida
    const pts = [[0, 0], [1, 0], [1, 1], [0, 1]];
    return pts.every(([u, v]) => H[6] * u + H[7] * v + H[8] > 1e-4);
  }

  /** Posición base (sin malla) → [x, y, w] */
  function basePoint(g, u, v) {
    if (g.convex) {
      const H = g.H;
      const W = H[6] * u + H[7] * v + H[8];
      return [(H[0] * u + H[1] * v + H[2]) / W, (H[3] * u + H[4] * v + H[5]) / W, W];
    }
    const b = bilinear(g.corners, u, v);
    return [b[0], b[1], 1];
  }

  /** Posición final (con malla) → [x, y, w] */
  function point(g, u, v) {
    const p = basePoint(g, u, v);
    if (g.mesh) {
      const d = meshOffset(g.mesh, u, v);
      p[0] += d[0];
      p[1] += d[1];
    }
    return p;
  }

  /** Malla de triángulos para dibujar la superficie. */
  function buildGrid(surface) {
    const g = prepare(surface);
    let seg;
    if (g.mesh) seg = clamp(Math.max(g.mesh.cols, g.mesh.rows) * 8, 16, 64);
    else seg = g.convex ? 1 : 16;
    const n = seg + 1;
    const pos = new Float32Array(n * n * 2);
    const w = new Float32Array(n * n);
    const uv = new Float32Array(n * n * 2);
    let k = 0;
    for (let j = 0; j <= seg; j++) {
      for (let i = 0; i <= seg; i++) {
        const u = i / seg, v = j / seg;
        const p = point(g, u, v);
        pos[k * 2] = p[0];
        pos[k * 2 + 1] = p[1];
        w[k] = p[2];
        uv[k * 2] = u;
        uv[k * 2 + 1] = v;
        k++;
      }
    }
    const idx = new Uint16Array(seg * seg * 6);
    let q = 0;
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx[q++] = a; idx[q++] = b; idx[q++] = d;
        idx[q++] = a; idx[q++] = d; idx[q++] = c;
      }
    }
    return { pos, w, uv, idx, count: idx.length };
  }

  /** Contorno de la superficie (para guías y detección de clics). */
  function border(surface, perEdge) {
    const g = prepare(surface);
    if (!g.mesh && g.convex) return surface.corners.map((c) => [c[0], c[1]]);
    const n = perEdge || 16;
    const out = [];
    for (let i = 0; i < n; i++) out.push(point(g, i / n, 0));
    for (let i = 0; i < n; i++) out.push(point(g, 1, i / n));
    for (let i = 0; i < n; i++) out.push(point(g, 1 - i / n, 1));
    for (let i = 0; i < n; i++) out.push(point(g, 0, 1 - i / n));
    return out.map((p) => [p[0], p[1]]);
  }

  /** Líneas internas de la malla (para dibujar la rejilla deformada). */
  function meshLines(surface, samples) {
    const g = prepare(surface);
    const m = surface.mesh;
    const s = samples || 24;
    const lines = [];
    for (let i = 1; i < m.cols; i++) {
      const line = [];
      for (let t = 0; t <= s; t++) line.push(point(g, i / m.cols, t / s));
      lines.push(line);
    }
    for (let j = 1; j < m.rows; j++) {
      const line = [];
      for (let t = 0; t <= s; t++) line.push(point(g, t / s, j / m.rows));
      lines.push(line);
    }
    return lines;
  }

  /** Puntos de control de la malla: [{i,j,x,y,bx,by}] (excluye las 4 esquinas). */
  function meshPoints(surface) {
    const g = prepare(surface);
    const m = surface.mesh;
    const pts = [];
    for (let j = 0; j <= m.rows; j++) {
      for (let i = 0; i <= m.cols; i++) {
        const corner = (i === 0 || i === m.cols) && (j === 0 || j === m.rows);
        if (corner) continue;
        const b = basePoint(g, i / m.cols, j / m.rows);
        const o = m.offsets[j * (m.cols + 1) + i] || [0, 0];
        pts.push({ i, j, x: b[0] + o[0], y: b[1] + o[1], bx: b[0], by: b[1] });
      }
    }
    return pts;
  }

  /** Remuestrea la malla a una nueva resolución conservando la forma. */
  function resampleMesh(mesh, cols, rows) {
    const offsets = [];
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const corner = (i === 0 || i === cols) && (j === 0 || j === rows);
        offsets.push(corner || !mesh.offsets.length ? [0, 0] : meshOffset(mesh, i / cols, j / rows));
      }
    }
    return { enabled: mesh.enabled, cols, rows, offsets };
  }

  /** Polígono de una elipse inscrita en la superficie (respeta la perspectiva). */
  function ellipse(surface, n) {
    const g = prepare(surface);
    const pts = [];
    const N = n || 64;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const p = point(g, 0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a));
      pts.push([p[0], p[1]]);
    }
    return pts;
  }

  /** Proporción aparente (ancho/alto en píxeles) de la superficie. */
  function aspect(surface, outW, outH) {
    const c = surface.corners;
    const d = (a, b) => Math.hypot((b[0] - a[0]) * outW, (b[1] - a[1]) * outH);
    const w = d(c[0], c[1]) + d(c[3], c[2]);
    const h = d(c[0], c[3]) + d(c[1], c[2]);
    return h > 1e-6 ? clamp(w / h, 0.02, 50) : 1;
  }

  function pixelSize(surface, outW, outH) {
    const c = surface.corners;
    const d = (a, b) => Math.hypot((b[0] - a[0]) * outW, (b[1] - a[1]) * outH);
    return [(d(c[0], c[1]) + d(c[3], c[2])) / 2, (d(c[0], c[3]) + d(c[1], c[2])) / 2];
  }

  function pointInPoly(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function distToSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    return { d: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)), t };
  }

  function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    return { x0, y0, x1, y1 };
  }

  LM.Geom = {
    homography, isConvex, bilinear, meshOffset, prepare, basePoint, point, buildGrid, border, meshLines,
    meshPoints, resampleMesh, ellipse, aspect, pixelSize, pointInPoly, distToSeg, bbox,
  };
})();
