/* LuzMap — escenario: lienzo WebGL + guías + interacción con ratón/teclado (editor y proyector) */
(function () {
  'use strict';
  const LM = window.LM;
  const Geom = LM.Geom;

  class Stage extends LM.Emitter {
    constructor({ host, store, media, role }) {
      super();
      this.host = host;
      this.store = store;
      this.media = media;
      this.role = role;
      this.fill = role === 'output';
      // pantallas táctiles: tiradores más grandes y más margen para el dedo
      this.touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
      this.frameEl = document.createElement('div');
      this.frameEl.className = 'stage-frame';
      this.glc = document.createElement('canvas');
      this.glc.className = 'stage-gl';
      this.ovc = document.createElement('canvas');
      this.ovc.className = 'stage-overlay';
      this.frameEl.append(this.glc, this.ovc);
      host.appendChild(this.frameEl);
      this.renderer = new LM.Renderer(this.glc, media);
      if (this.renderer.failed) this.emit('error', 'WebGL no disponible');
      this.ctx = this.ovc.getContext('2d');
      this.state = { pointer: null, snap: null };
      this.sceneId = store.project.activeScene;
      this.transition = null;
      this.fps = 0;
      this._frames = 0;
      this._fpsT = performance.now();
      this.t0 = performance.now();
      this.interaction = new Interaction(this);
      this.layout();
      if (window.ResizeObserver) new ResizeObserver(() => this.layout()).observe(host);
      window.addEventListener('resize', () => this.layout());
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    get showOverlay() {
      // En el editor siempre; a pantalla completa o en el proyector, solo con "Guías" activado
      if (this.role === 'editor' && !this.fill) return true;
      return this.store.project.settings.guidesOnOutput;
    }

    layout() {
      const p = this.store.project;
      const ar = p.output.width / p.output.height;
      let W, H;
      const hw = this.host.clientWidth, hh = this.host.clientHeight;
      if (this.fill) {
        W = hw; H = hh;
        if (this.role !== 'output') {
          // pantalla completa del editor: respeta la proporción de salida
          if (hw / hh > ar) { H = hh; W = H * ar; } else { W = hw; H = W / ar; }
        }
      } else {
        const pad = 18;
        const cw = Math.max(50, hw - pad * 2), ch = Math.max(50, hh - pad * 2);
        if (cw / ch > ar) { H = ch; W = H * ar; } else { W = cw; H = W / ar; }
      }
      W = Math.max(10, Math.floor(W));
      H = Math.max(10, Math.floor(H));
      this.frameEl.style.width = W + 'px';
      this.frameEl.style.height = H + 'px';
      let dpr = window.devicePixelRatio || 1;
      const maxDim = 4096;
      if (Math.max(W, H) * dpr > maxDim) dpr = maxDim / Math.max(W, H);
      this.dpr = dpr;
      [this.glc, this.ovc].forEach((c) => {
        const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
        if (c.width !== cw) c.width = cw;
        if (c.height !== ch) c.height = ch;
      });
      this.w = W;
      this.h = H;
      this._ar = ar;
    }

    loop(now) {
      requestAnimationFrame(this.loop);
      const p = this.store.project;
      if (Math.abs(p.output.width / p.output.height - this._ar) > 1e-4) this.layout();
      if (p.activeScene !== this.sceneId) {
        const dur = Math.max(0, +p.playlist.transition || 0) * 1000;
        this.transition = dur > 0 ? { from: this.sceneId, start: now, dur, p: 0 } : null;
        this.sceneId = p.activeScene;
      }
      if (this.transition) {
        this.transition.p = (now - this.transition.start) / this.transition.dur;
        if (this.transition.p >= 1) this.transition = null;
      }
      this.renderer.render(p, { time: (now - this.t0) / 1000, transition: this.transition });
      if (this.showOverlay) {
        LM.Overlay.draw(this.ctx, { w: this.w, h: this.h, dpr: this.dpr, role: this.role, touch: this.touch }, p, this.store.ui, this.state);
        this._overlayClear = false;
      } else if (!this._overlayClear) {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.ovc.width, this.ovc.height);
        this._overlayClear = true;
      }
      this._frames++;
      if (now - this._fpsT > 1000) {
        this.fps = Math.round((this._frames * 1000) / (now - this._fpsT));
        this._frames = 0;
        this._fpsT = now;
        this.emit('fps', this.fps);
      }
    }

    /** Coordenadas normalizadas (0..1) a partir de un evento. */
    norm(e) {
      const r = this.ovc.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    }

    /** Superficie bajo un punto normalizado (la de más arriba). */
    surfaceAt(pt) {
      const list = this.store.project.surfaces;
      for (let i = list.length - 1; i >= 0; i--) {
        const s = list[i];
        if (s.visible && Geom.pointInPoly(pt, Geom.border(s))) return s;
      }
      return null;
    }
  }

  /* ---------- Interacción ---------- */
  class Interaction {
    constructor(stage) {
      this.stage = stage;
      this.store = stage.store;
      this.drag = null;
      const el = stage.ovc;
      el.addEventListener('pointerdown', (e) => this.down(e));
      el.addEventListener('pointermove', (e) => this.move(e));
      el.addEventListener('pointerup', (e) => this.up(e));
      el.addEventListener('pointercancel', (e) => this.up(e));
      el.addEventListener('pointerleave', () => { stage.state.pointer = null; });
      el.addEventListener('contextmenu', (e) => this.context(e));
      el.addEventListener('dblclick', (e) => this.dbl(e));
    }

    get enabled() { return this.stage.showOverlay; }
    get project() { return this.store.project; }
    get ui() { return this.store.ui; }
    get tol() { return this.stage.touch ? 26 : this.stage.role === 'output' ? 18 : 11; }

    distPx(a, b) {
      return Math.hypot((a[0] - b[0]) * this.stage.w, (a[1] - b[1]) * this.stage.h);
    }

    hit(pt) {
      const tol = this.tol;
      const sel = this.store.selected;
      const tool = this.ui.tool;
      if (tool === 'mask') {
        if (!sel) return null;
        for (let m = 0; m < sel.masks.length; m++) {
          const poly = sel.masks[m];
          for (let k = 0; k < poly.length; k++) if (this.distPx(pt, poly[k]) < tol) return { type: 'mask', m, k };
        }
        for (let m = 0; m < sel.masks.length; m++) {
          const poly = sel.masks[m];
          for (let k = 0; k < poly.length; k++) {
            const a = poly[k], b = poly[(k + 1) % poly.length];
            const W = this.stage.w, H = this.stage.h;
            const r = Geom.distToSeg([pt[0] * W, pt[1] * H], [a[0] * W, a[1] * H], [b[0] * W, b[1] * H]);
            if (r.d < tol * 0.7) return { type: 'maskEdge', m, k };
          }
        }
        return null;
      }
      if (tool === 'draw') return null;
      if (sel && sel.visible && !sel.locked) {
        for (let k = 0; k < 4; k++) if (this.distPx(pt, sel.corners[k]) < tol) return { type: 'corner', sid: sel.id, idx: k };
        if (sel.mesh.enabled) {
          const mp = Geom.meshPoints(sel).find((q) => this.distPx(pt, [q.x, q.y]) < tol * 0.8);
          if (mp) return { type: 'mesh', sid: sel.id, i: mp.i, j: mp.j };
        }
      }
      const list = this.project.surfaces;
      for (let i = list.length - 1; i >= 0; i--) {
        const s = list[i];
        if (!s.visible || s.locked || s === sel) continue;
        for (let k = 0; k < 4; k++) if (this.distPx(pt, s.corners[k]) < tol * 0.8) return { type: 'corner', sid: s.id, idx: k };
      }
      const body = this.stage.surfaceAt(pt);
      if (body) return { type: 'body', sid: body.id };
      return null;
    }

    /** Imán: a puntos de otras superficies y/o a la rejilla. */
    snap(pt, e, exclude) {
      this.stage.state.snap = null;
      if (e && e.altKey) return pt;
      const st = this.project.settings;
      if (st.snapPoints) {
        let best = null, bd = this.tol;
        this.project.surfaces.forEach((s) => {
          if (!s.visible) return;
          const cand = [];
          if (!(exclude && exclude.sid === s.id && exclude.type === 'corner')) cand.push(...s.corners);
          if (!(exclude && exclude.sid === s.id && exclude.type === 'mask')) s.masks.forEach((m) => cand.push(...m));
          if (exclude && exclude.sid === s.id && exclude.type === 'mask') cand.push(...s.corners);
          cand.forEach((c) => {
            const d = this.distPx(pt, c);
            if (d < bd) { bd = d; best = c; }
          });
        });
        if (best) {
          this.stage.state.snap = [best[0], best[1]];
          return [best[0], best[1]];
        }
      }
      if (st.snapGrid && st.gridSize > 0) {
        const gx = st.gridSize / this.project.output.width;
        const gy = st.gridSize / this.project.output.height;
        return [Math.round(pt[0] / gx) * gx, Math.round(pt[1] / gy) * gy];
      }
      return pt;
    }

    down(e) {
      this.stage.touch = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (!this.enabled || e.button === 2) return;
      const pt = this.stage.norm(e);
      const tool = this.ui.tool;
      const h = this.hit(pt);
      this.stage.ovc.setPointerCapture(e.pointerId);

      if (tool === 'draw' || (tool === 'mask' && !h)) {
        if (tool === 'mask' && !this.store.selected) {
          const s = this.stage.surfaceAt(pt);
          if (s) this.store.setUI({ selectedId: s.id, point: null });
          else this.stage.emit('hint', 'Selecciona primero una superficie para añadirle una máscara');
          return;
        }
        this.draftClick(pt, e);
        return;
      }
      if (!h) {
        if (tool === 'edit') this.store.setUI({ selectedId: null, point: null });
        return;
      }
      const p = this.project;
      if (h.type === 'corner') {
        const s = this.store.surface(h.sid);
        this.store.setUI({ selectedId: s.id, point: { type: 'corner', idx: h.idx } });
        this.store.checkpoint();
        const c = s.corners[h.idx];
        this.drag = { kind: 'corner', sid: s.id, idx: h.idx, grab: [c[0] - pt[0], c[1] - pt[1]] };
      } else if (h.type === 'mesh') {
        const s = this.store.surface(h.sid);
        this.store.setUI({ point: { type: 'mesh', i: h.i, j: h.j } });
        this.store.checkpoint();
        const mp = Geom.meshPoints(s).find((q) => q.i === h.i && q.j === h.j);
        this.drag = { kind: 'mesh', sid: s.id, i: h.i, j: h.j, base: [mp.bx, mp.by], grab: [mp.x - pt[0], mp.y - pt[1]] };
      } else if (h.type === 'mask' || h.type === 'maskEdge') {
        const s = this.store.selected;
        let k = h.k;
        this.store.checkpoint();
        if (h.type === 'mask' && e.altKey) {
          this.deleteMaskPoint(h.m, h.k);
          return;
        }
        if (h.type === 'maskEdge') {
          k = h.k + 1;
          this.store.mutate((pr) => { this.store.surface(s.id).masks[h.m].splice(k, 0, [pt[0], pt[1]]); }, { checkpoint: false });
        }
        const c = s.masks[h.m][k];
        this.store.setUI({ point: { type: 'mask', m: h.m, k } });
        this.drag = { kind: 'mask', sid: s.id, m: h.m, k, grab: [c[0] - pt[0], c[1] - pt[1]] };
      } else if (h.type === 'body') {
        const s = this.store.surface(h.sid);
        this.store.setUI({ selectedId: s.id, point: null });
        if (!s.locked) {
          this.store.checkpoint();
          this.drag = { kind: 'body', sid: s.id, start: pt, corners: LM.clone(s.corners), masks: LM.clone(s.masks) };
        }
      }
      void p;
    }

    move(e) {
      if (!this.enabled) return;
      const pt = this.stage.norm(e);
      this.stage.state.pointer = pt;
      const d = this.drag;
      if (!d) {
        const h = this.ui.tool === 'draw' ? null : this.hit(pt);
        let cur = 'default';
        if (this.ui.tool === 'draw' || (this.ui.tool === 'mask' && !h)) cur = 'crosshair';
        else if (h && h.type === 'body') cur = this.store.surface(h.sid).locked ? 'pointer' : 'move';
        else if (h && h.type === 'maskEdge') cur = 'copy';
        else if (h) cur = 'grab';
        this.stage.ovc.style.cursor = cur;
        return;
      }
      this.stage.ovc.style.cursor = d.kind === 'body' ? 'move' : 'grabbing';
      const s = this.store.surface(d.sid);
      if (!s) { this.drag = null; return; }
      if (d.kind === 'corner') {
        const q = this.snap([pt[0] + d.grab[0], pt[1] + d.grab[1]], e, { sid: s.id, type: 'corner' });
        this.store.mutate(() => { s.corners[d.idx] = q; }, { checkpoint: false });
      } else if (d.kind === 'mesh') {
        const q = [pt[0] + d.grab[0], pt[1] + d.grab[1]];
        // la base se recalcula por si las esquinas cambiaron
        const g = Geom.prepare(s);
        const b = Geom.basePoint(g, d.i / s.mesh.cols, d.j / s.mesh.rows);
        this.store.mutate(() => { s.mesh.offsets[d.j * (s.mesh.cols + 1) + d.i] = [q[0] - b[0], q[1] - b[1]]; }, { checkpoint: false });
      } else if (d.kind === 'mask') {
        const q = this.snap([pt[0] + d.grab[0], pt[1] + d.grab[1]], e, { sid: s.id, type: 'mask' });
        this.store.mutate(() => { if (s.masks[d.m]) s.masks[d.m][d.k] = q; }, { checkpoint: false });
      } else if (d.kind === 'body') {
        let dx = pt[0] - d.start[0], dy = pt[1] - d.start[1];
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        this.store.mutate(() => {
          s.corners = d.corners.map((c) => [c[0] + dx, c[1] + dy]);
          s.masks = d.masks.map((poly) => poly.map((c) => [c[0] + dx, c[1] + dy]));
        }, { checkpoint: false });
      }
    }

    up(e) {
      if (this.drag) {
        this.drag = null;
        this.stage.state.snap = null;
        this.store.changed('local', { dragEnd: true });
      }
      try { this.stage.ovc.releasePointerCapture(e.pointerId); } catch (err) { /* ya liberado */ }
    }

    context(e) {
      e.preventDefault();
      if (!this.enabled) return;
      const ui = this.ui;
      if (ui.draft && ui.draft.points.length) {
        this.removeDraftPoint();
        return;
      }
      if (ui.tool === 'mask') {
        const h = this.hit(this.stage.norm(e));
        if (h && h.type === 'mask') {
          this.store.checkpoint();
          this.deleteMaskPoint(h.m, h.k);
        }
      }
    }

    dbl(e) {
      if (!this.enabled) return;
      if (this.ui.draft && this.ui.draft.points.length >= 3) {
        e.preventDefault();
        // el doble clic añade un punto extra en el primer clic; se elimina
        const d = this.ui.draft;
        if (d.points.length > 3) d.points.pop();
        this.finishDraft();
      }
    }

    /* ----- Formas en construcción ----- */
    draftClick(pt, e) {
      const tool = this.ui.tool;
      let d = this.ui.draft;
      if (!d || d.kind !== tool) d = { kind: tool, points: [] };
      if (d.points.length >= 3 && this.distPx(pt, d.points[0]) < this.tol) {
        this.store.setUI({ draft: d });
        this.finishDraft();
        return;
      }
      const sel = this.store.selected;
      const q = this.snap(pt, e, tool === 'mask' && sel ? { sid: sel.id, type: 'mask' } : null);
      d.points.push(q);
      this.store.setUI({ draft: d });
      if (d.points.length === 1) {
        this.stage.emit('hint', 'Sigue haciendo clic alrededor del objeto. Cierra la forma pulsando el primer punto, con doble clic o Intro.');
      }
    }

    removeDraftPoint() {
      const d = this.ui.draft;
      if (!d) return;
      d.points.pop();
      this.store.setUI({ draft: d.points.length ? d : null });
    }

    finishDraft() {
      const d = this.ui.draft;
      if (!d || d.points.length < 3) {
        this.store.setUI({ draft: null });
        return;
      }
      const pts = d.points.map((p) => [p[0], p[1]]);
      if (d.kind === 'mask') {
        const sel = this.store.selected;
        if (sel) this.store.mutate(() => { sel.masks.push(pts); }, { structural: true });
        this.store.setUI({ draft: null });
        this.stage.emit('hint', 'Máscara añadida. Arrastra sus puntos para afinarla; clic derecho o Alt+clic borra un punto.');
      } else {
        let created;
        this.store.mutate((p) => {
          const b = Geom.bbox(pts);
          created = LM.State.addSurface(p, {
            name: 'Forma ' + (p.surfaces.length + 1),
            corners: [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]],
            masks: [pts],
          });
        }, { structural: true });
        this.store.setUI({ draft: null, selectedId: created.id, tool: 'edit', point: null });
        this.stage.emit('hint', 'Forma creada. Ahora elige qué proyectar en ella desde el panel derecho.');
      }
    }

    deleteMaskPoint(m, k) {
      const sel = this.store.selected;
      if (!sel || !sel.masks[m]) return;
      this.store.mutate(() => {
        sel.masks[m].splice(k, 1);
        if (sel.masks[m].length < 3) sel.masks.splice(m, 1);
      }, { checkpoint: false, structural: true });
      this.store.setUI({ point: null });
    }

    /* ----- Teclado (devuelve true si gestionó la tecla) ----- */
    key(e) {
      if (!this.enabled) return false;
      const ui = this.ui;
      const sel = this.store.selected;
      const k = e.key;
      if (ui.draft && ui.draft.points.length) {
        if (k === 'Enter') { this.finishDraft(); return true; }
        if (k === 'Escape') { this.store.setUI({ draft: null }); return true; }
        if (k === 'Backspace' || k === 'Delete') { this.removeDraftPoint(); return true; }
      }
      if (k === 'Escape') {
        if (ui.point) this.store.setUI({ point: null });
        else if (ui.tool !== 'edit') this.store.setUI({ tool: 'edit' });
        else this.store.setUI({ selectedId: null });
        return true;
      }
      if (!sel) return false;
      if (k.startsWith('Arrow')) {
        if (sel.locked) return true;
        const step = e.shiftKey ? 10 : e.altKey ? 0.25 : 1;
        const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0;
        const dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
        this.nudge(dx, dy);
        return true;
      }
      if (k === 'Tab') {
        if (ui.tool === 'mask' && sel.masks.length) {
          const pts = [];
          sel.masks.forEach((poly, m) => poly.forEach((_, kk) => pts.push({ type: 'mask', m, k: kk })));
          let i = ui.point && ui.point.type === 'mask' ? pts.findIndex((q) => q.m === ui.point.m && q.k === ui.point.k) : -1;
          i = (i + (e.shiftKey ? -1 : 1) + pts.length) % pts.length;
          this.store.setUI({ point: pts[i] });
        } else {
          let i = ui.point && ui.point.type === 'corner' ? ui.point.idx : -1;
          i = (i + (e.shiftKey ? -1 : 1) + 4) % 4;
          this.store.setUI({ point: { type: 'corner', idx: i }, tool: 'edit' });
        }
        return true;
      }
      if ((k === 'Delete' || k === 'Backspace') && ui.point && ui.point.type === 'mask') {
        this.store.checkpoint();
        this.deleteMaskPoint(ui.point.m, ui.point.k);
        return true;
      }
      return false;
    }

    /** Mueve el punto seleccionado (o la superficie entera) en píxeles de salida. */
    nudge(dx, dy) {
      const sel = this.store.selected;
      if (!sel) return;
      const nx = dx / this.project.output.width, ny = dy / this.project.output.height;
      const pt = this.ui.point;
      this.store.mutate(() => {
        if (pt && pt.type === 'corner') {
          const c = sel.corners[pt.idx];
          sel.corners[pt.idx] = [c[0] + nx, c[1] + ny];
        } else if (pt && pt.type === 'mesh' && sel.mesh.enabled) {
          const i = pt.j * (sel.mesh.cols + 1) + pt.i;
          const o = sel.mesh.offsets[i] || [0, 0];
          sel.mesh.offsets[i] = [o[0] + nx, o[1] + ny];
        } else if (pt && pt.type === 'mask' && sel.masks[pt.m]) {
          const c = sel.masks[pt.m][pt.k];
          if (c) sel.masks[pt.m][pt.k] = [c[0] + nx, c[1] + ny];
        } else {
          sel.corners = sel.corners.map((c) => [c[0] + nx, c[1] + ny]);
          sel.masks = sel.masks.map((poly) => poly.map((c) => [c[0] + nx, c[1] + ny]));
        }
      }, { key: 'nudge:' + sel.id });
    }
  }

  LM.Stage = Stage;
})();
