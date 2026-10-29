/* LuzMap — guías dibujadas encima de la imagen: contornos, esquinas, malla, máscaras */
(function () {
  'use strict';
  const LM = window.LM;
  const Geom = LM.Geom;

  function path(ctx, pts, close) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    if (close) ctx.closePath();
  }

  function handle(ctx, x, y, r, fill, stroke, label, active) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = active ? stroke : fill;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, r / 4);
    ctx.strokeStyle = active ? '#fff' : stroke;
    ctx.stroke();
    if (label) {
      ctx.fillStyle = active ? '#000' : '#fff';
      ctx.font = `700 ${Math.round(r * 1.05)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y + 0.5);
    }
  }

  function crosshair(ctx, x, y, r, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - r * 2.2, y); ctx.lineTo(x - r * 0.6, y);
    ctx.moveTo(x + r * 0.6, y); ctx.lineTo(x + r * 2.2, y);
    ctx.moveTo(x, y - r * 2.2); ctx.lineTo(x, y - r * 0.6);
    ctx.moveTo(x, y + r * 0.6); ctx.lineTo(x, y + r * 2.2);
    ctx.stroke();
  }

  function label(ctx, text, x, y, color, big) {
    ctx.font = `600 ${big ? 16 : 12}px system-ui, sans-serif`;
    const tw = ctx.measureText(text).width;
    const pad = big ? 6 : 4, hgt = big ? 22 : 17;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x, y - hgt, tw + pad * 2, hgt);
    ctx.fillStyle = color;
    ctx.fillRect(x, y - hgt, 3, hgt);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + pad + 1, y - hgt / 2);
  }

  /**
   * view: { w, h, dpr, role }   state: { pointer, snap, hover }
   */
  function draw(ctx, view, project, ui, state) {
    const { w, h, dpr } = view;
    const big = view.role === 'output' || view.touch;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const P = (p) => [p[0] * w, p[1] * h];
    const st = project.settings;
    const lw = big ? 2.5 : 1.4;
    const R = big ? 13 : 8;

    if (st.showGrid) {
      const step = (st.gridSize * w) / project.output.width;
      if (step >= 4) {
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = step; x < w; x += step) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
        for (let y = step; y < h; y += step) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
        ctx.stroke();
      }
    }

    const sel = project.surfaces.find((s) => s.id === ui.selectedId);
    const tool = ui.tool;

    project.surfaces.forEach((s) => {
      if (!s.visible) return;
      const isSel = s === sel;
      const b = Geom.border(s).map(P);
      ctx.setLineDash(s.locked ? [7, 5] : []);
      ctx.lineWidth = isSel ? lw * 2 : lw;
      ctx.strokeStyle = s.color;
      path(ctx, b, true);
      if (isSel) {
        ctx.fillStyle = s.color + '14';
        ctx.fill();
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (!isSel && !s.locked && tool === 'edit') {
        s.corners.forEach((c) => {
          const p = P(c);
          ctx.beginPath();
          ctx.arc(p[0], p[1], big ? 5 : 3.5, 0, Math.PI * 2);
          ctx.fillStyle = s.color;
          ctx.fill();
        });
      }
      const c0 = P(s.corners[0]);
      label(ctx, (s.locked ? '🔒 ' : '') + s.name, c0[0] + 2, c0[1] - (isSel ? R + 4 : 4), s.color, big);
    });

    if (sel && sel.visible) {
      // máscaras
      sel.masks.forEach((poly, m) => {
        const pts = poly.map(P);
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = big ? 2 : 1.5;
        ctx.strokeStyle = tool === 'mask' ? '#ffffff' : 'rgba(255,255,255,0.55)';
        path(ctx, pts, true);
        ctx.stroke();
        ctx.setLineDash([]);
        if (tool === 'mask') {
          pts.forEach((p, k) => {
            const active = ui.point && ui.point.type === 'mask' && ui.point.m === m && ui.point.k === k;
            const r = big ? 8 : 5;
            ctx.fillStyle = active ? sel.color : '#111';
            ctx.strokeStyle = active ? '#fff' : '#fff';
            ctx.lineWidth = 1.5;
            ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
            ctx.strokeRect(p[0] - r, p[1] - r, r * 2, r * 2);
          });
        }
      });

      if (tool === 'edit' && !sel.locked) {
        if (sel.mesh.enabled) {
          ctx.strokeStyle = sel.color + 'aa';
          ctx.lineWidth = 1;
          Geom.meshLines(sel).forEach((line) => { path(ctx, line.map(P), false); ctx.stroke(); });
          Geom.meshPoints(sel).forEach((mp) => {
            const p = P([mp.x, mp.y]);
            const active = ui.point && ui.point.type === 'mesh' && ui.point.i === mp.i && ui.point.j === mp.j;
            handle(ctx, p[0], p[1], big ? 7 : 4.5, '#111', sel.color, null, active);
          });
        }
        sel.corners.forEach((c, k) => {
          const p = P(c);
          const active = ui.point && ui.point.type === 'corner' && ui.point.idx === k;
          handle(ctx, p[0], p[1], R, 'rgba(10,10,14,0.85)', sel.color, String(k + 1), active);
          if (active) crosshair(ctx, p[0], p[1], R, '#fff');
        });
      }
    }

    // forma en construcción (herramientas Dibujar / Máscara)
    const d = ui.draft;
    if (d && d.points.length) {
      const pts = d.points.map(P);
      ctx.strokeStyle = d.kind === 'mask' ? '#ffffff' : '#ffd60a';
      ctx.lineWidth = big ? 2.5 : 1.6;
      path(ctx, pts, false);
      ctx.stroke();
      if (state.pointer) {
        const q = P(state.pointer);
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        ctx.lineTo(q[0], q[1]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      pts.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p[0], p[1], i === 0 ? (big ? 9 : 6) : big ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#ffd60a' : '#fff';
        ctx.fill();
      });
    }

    if (state.snap) {
      const p = P(state.snap);
      ctx.strokeStyle = '#00f5d4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p[0], p[1], R + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  LM.Overlay = { draw };
})();
