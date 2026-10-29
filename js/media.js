/* LuzMap — biblioteca de medios: almacenamiento (IndexedDB) y fuentes en tiempo real */
(function () {
  'use strict';
  const LM = window.LM;

  /* ---------- IndexedDB para guardar imágenes y vídeos entre sesiones ---------- */
  LM.DB = (function () {
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('IndexedDB no disponible'));
        const req = indexedDB.open('luzmap', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('media');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      dbp.catch(() => { dbp = null; });
      return dbp;
    }
    function run(mode, fn) {
      return open().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction('media', mode);
        const req = fn(tx.objectStore('media'));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }));
    }
    return {
      put: (id, blob) => run('readwrite', (s) => s.put(blob, id)),
      get: (id) => run('readonly', (s) => s.get(id)).catch(() => null),
      del: (id) => run('readwrite', (s) => s.delete(id)).catch(() => null),
      keys: () => run('readonly', (s) => s.getAllKeys()).catch(() => []),
    };
  })();

  /* ---------- Dibujo de patrones de prueba y textos ---------- */
  function drawPattern(ctx, w, h, surface, index) {
    const color = surface.color || '#ff9f1c';
    ctx.fillStyle = '#0d0d10';
    ctx.fillRect(0, 0, w, h);
    const m = Math.min(w, h);
    // rejilla
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = Math.max(1, m / 300);
    const nx = 8, ny = 8;
    ctx.beginPath();
    for (let i = 1; i < nx; i++) { const x = (i / nx) * w; ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let j = 1; j < ny; j++) { const y = (j / ny) * h; ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    // diagonales
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h);
    ctx.stroke();
    // círculo central y cruz
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, m / 120);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, m * 0.38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w / 2 - m * 0.06, h / 2); ctx.lineTo(w / 2 + m * 0.06, h / 2);
    ctx.moveTo(w / 2, h / 2 - m * 0.06); ctx.lineTo(w / 2, h / 2 + m * 0.06);
    ctx.stroke();
    // borde
    const bw = Math.max(4, m / 40);
    ctx.lineWidth = bw;
    ctx.strokeRect(bw / 2, bw / 2, w - bw, h - bw);
    // flecha "arriba"
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(w / 2, bw * 2.2);
    ctx.lineTo(w / 2 - m * 0.05, bw * 2.2 + m * 0.06);
    ctx.lineTo(w / 2 + m * 0.05, bw * 2.2 + m * 0.06);
    ctx.closePath();
    ctx.fill();
    // números de esquina (coinciden con los tiradores del editor)
    const r = m * 0.055;
    const pad = bw + r * 1.3;
    [[pad, pad], [w - pad, pad], [w - pad, h - pad], [pad, h - pad]].forEach(([x, y], k) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = `bold ${Math.round(r * 1.2)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(k + 1), x, y + r * 0.05);
    });
    // nombre
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let fs = Math.round(m * 0.13);
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    const label = surface.name || 'Superficie ' + (index + 1);
    const maxW = w * 0.8;
    const tw = ctx.measureText(label).width;
    if (tw > maxW) { fs = Math.floor((fs * maxW) / tw); ctx.font = `800 ${fs}px system-ui, sans-serif`; }
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = fs * 0.2;
    ctx.fillText(label, w / 2, h / 2 + m * 0.2);
    ctx.shadowBlur = 0;
  }

  function textFont(t, px) {
    return `${t.bold ? '800' : '400'} ${Math.max(4, Math.round(px))}px ${t.font || 'system-ui, sans-serif'}`;
  }

  /** Ancho necesario (en proporción de la altura) para una marquesina. */
  function marqueeAspect(t, h) {
    const c = marqueeAspect._c || (marqueeAspect._c = document.createElement('canvas').getContext('2d'));
    c.font = textFont(t, t.size * h);
    const line = String(t.value || '').replace(/\n/g, '   ');
    return Math.max(0.5, (c.measureText(line).width + h * 0.8) / h);
  }

  function drawText(ctx, w, h, t, marquee) {
    ctx.clearRect(0, 0, w, h);
    if (t.bgOn) { ctx.fillStyle = t.bg; ctx.fillRect(0, 0, w, h); }
    ctx.fillStyle = t.color;
    ctx.textBaseline = 'middle';
    const px = t.size * h;
    ctx.font = textFont(t, px);
    if (marquee) {
      ctx.textAlign = 'left';
      ctx.fillText(String(t.value || '').replace(/\n/g, '   '), h * 0.4, h / 2);
      return;
    }
    const lines = String(t.value || '').split('\n');
    const lh = px * 1.15;
    // reduce el tamaño si alguna línea no cabe
    let scale = 1;
    lines.forEach((l) => { const lw = ctx.measureText(l).width; if (lw > w * 0.94) scale = Math.min(scale, (w * 0.94) / lw); });
    if (lines.length * lh > h) scale = Math.min(scale, h / (lines.length * lh));
    if (scale < 1) ctx.font = textFont(t, px * scale);
    const totalH = lines.length * lh * scale;
    const x = t.align === 'left' ? w * 0.03 : t.align === 'right' ? w * 0.97 : w / 2;
    ctx.textAlign = t.align || 'center';
    lines.forEach((l, i) => ctx.fillText(l, x, h / 2 - totalH / 2 + lh * scale * (i + 0.5)));
  }

  LM.Draw = { drawPattern, drawText, marqueeAspect };

  /* ---------- Fuentes de medios en tiempo de ejecución (una por ventana) ---------- */
  class MediaRuntime extends LM.Emitter {
    constructor({ role, fetchBlob }) {
      super();
      this.role = role;
      this.fetchBlob = fetchBlob;
      this.items = new Map();
      this.cameras = new Map();
      this.canvases = new Map();
      this.host = document.createElement('div');
      this.host.setAttribute('aria-hidden', 'true');
      // Los vídeos deben estar en el DOM para que el navegador no los pause
      this.host.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1';
      document.body.appendChild(this.host);
      this.maxTex = 4096;
    }

    get(id) {
      const it = this.items.get(id);
      return it && it.ready ? it : null;
    }

    info(id) {
      return this.items.get(id) || null;
    }

    /** Carga un medio. `blob` opcional (si no, se pide con fetchBlob). */
    async load(meta, blob) {
      const existing = this.items.get(meta.id);
      if (existing && !existing.missing) return existing;
      const item = existing || { id: meta.id, kind: meta.kind, ready: false, missing: false, w: 0, h: 0, duration: 0, thumb: null };
      item.missing = false;
      item.loading = true;
      this.items.set(meta.id, item);
      try {
        if (!blob) blob = await this.fetchBlob(meta.id, meta);
      } catch (e) { blob = null; }
      if (!this.items.has(meta.id)) return null; // eliminado mientras cargaba
      item.loading = false;
      if (!blob) {
        item.missing = true;
        this.emit('missing', meta.id);
        return item;
      }
      item.blob = blob;
      item.url = URL.createObjectURL(blob);
      if (meta.kind === 'video') this._makeVideo(item, meta);
      else this._makeImage(item);
      return item;
    }

    /** Sustituye un medio que faltaba (p.ej. recibido desde el editor). */
    provide(meta, blob) {
      const it = this.items.get(meta.id);
      if (it && it.ready) return;
      if (it) this.items.delete(meta.id);
      this.load(meta, blob);
    }

    _makeImage(item) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        let src = img;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (Math.max(w, h) > this.maxTex) {
          const s = this.maxTex / Math.max(w, h);
          const c = document.createElement('canvas');
          c.width = Math.round(w * s); c.height = Math.round(h * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          src = c; w = c.width; h = c.height;
        }
        item.el = src;
        item.w = w; item.h = h;
        item.ready = true;
        item.thumb = item.url;
        item.version = (item.version || 0) + 1;
        this.emit('ready', item);
      };
      img.onerror = () => { item.error = true; this.emit('error', item); };
      img.src = item.url;
    }

    _makeVideo(item, meta) {
      const v = document.createElement('video');
      v.playsInline = true;
      v.muted = true;
      v.loop = meta.loop !== false;
      v.preload = 'auto';
      v.setAttribute('playsinline', '');
      v.src = item.url;
      this.host.appendChild(v);
      item.el = v;
      v.addEventListener('loadeddata', () => {
        item.w = v.videoWidth; item.h = v.videoHeight;
        item.duration = v.duration;
        item.ready = true;
        this.applyVideoProps(item, meta);
        this.emit('ready', item);
        if (this.role === 'editor') this._videoThumb(item);
      }, { once: true });
      v.addEventListener('error', () => { item.error = true; this.emit('error', item); });
      v.addEventListener('ended', () => this.emit('ended', item));
    }

    _videoThumb(item) {
      const v = document.createElement('video');
      v.muted = true;
      v.preload = 'auto';
      v.src = item.url;
      v.addEventListener('loadeddata', () => {
        v.currentTime = Math.min(1, (v.duration || 1) * 0.1);
      }, { once: true });
      v.addEventListener('seeked', () => {
        try {
          const c = document.createElement('canvas');
          const ar = v.videoWidth / v.videoHeight || 16 / 9;
          c.width = 192; c.height = Math.round(192 / ar);
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          item.thumb = c.toDataURL('image/jpeg', 0.7);
          this.emit('thumb', item);
        } catch (e) { /* sin miniatura */ }
        v.removeAttribute('src');
        v.load();
      }, { once: true });
    }

    applyVideoProps(item, meta) {
      const v = item.el;
      if (!v || item.kind !== 'video') return;
      v.loop = meta.loop !== false;
      v.playbackRate = LM.clamp(+meta.speed || 1, 0.1, 4);
      v.volume = LM.clamp(meta.volume == null ? 1 : +meta.volume, 0, 1);
      // El audio solo suena en el editor; el proyector siempre en silencio
      const wantMuted = this.role !== 'editor' || !!meta.muted;
      if (v.muted !== wantMuted) v.muted = wantMuted;
      if (meta.paused) {
        if (!v.paused) v.pause();
      } else if (v.paused && !(v.ended && !v.loop)) {
        const p = v.play();
        if (p && p.catch) {
          p.catch(() => {
            if (!v.muted) {
              v.muted = true;
              this.emit('autoplay-blocked', item);
              v.play().catch(() => {});
            }
          });
        }
      }
    }

    /** Ajusta la biblioteca de esta ventana al proyecto (carga, elimina, propiedades de vídeo). */
    sync(project) {
      const ids = new Set(project.media.map((m) => m.id));
      project.media.forEach((meta) => {
        const it = this.items.get(meta.id);
        if (!it) this.load(meta);
        else if (it.ready) this.applyVideoProps(it, meta);
      });
      Array.from(this.items.keys()).forEach((id) => { if (!ids.has(id)) this.remove(id); });
    }

    remove(id) {
      const it = this.items.get(id);
      if (!it) return;
      this.items.delete(id);
      if (it.kind === 'video' && it.el) {
        it.el.pause();
        it.el.removeAttribute('src');
        it.el.load();
        it.el.remove();
      }
      if (it.url) setTimeout(() => URL.revokeObjectURL(it.url), 1000);
      this.emit('removed', id);
    }

    retryMissing(project) {
      project.media.forEach((meta) => {
        const it = this.items.get(meta.id);
        if (it && it.missing) { this.items.delete(meta.id); this.load(meta); }
      });
    }

    /** Estado de reproducción para sincronizar el proyector. */
    syncPayload() {
      const out = [];
      this.items.forEach((it) => {
        if (it.kind === 'video' && it.ready) out.push({ id: it.id, time: it.el.currentTime, paused: it.el.paused });
      });
      return out;
    }

    applySync(list, project) {
      list.forEach((s) => {
        const it = this.items.get(s.id);
        if (!it || it.kind !== 'video' || !it.ready) return;
        const v = it.el;
        const dur = v.duration || 0;
        let diff = s.time - v.currentTime;
        if (dur && Math.abs(diff) > dur / 2) diff -= Math.sign(diff) * dur;
        if (Math.abs(diff) > 0.3) {
          try { v.currentTime = dur ? ((s.time % dur) + dur) % dur : s.time; } catch (e) { /* aún no se puede saltar */ }
        }
        const meta = project && project.media.find((m) => m.id === s.id);
        if (meta && !meta.paused && v.paused && !s.paused) v.play().catch(() => {});
      });
    }

    seek(id, time) {
      const it = this.get(id);
      if (it && it.kind === 'video') {
        try { it.el.currentTime = time; } catch (e) { /* ignorar */ }
      }
    }

    /** Cámara web (se abre al primer uso). */
    camera(deviceId) {
      const key = deviceId || 'default';
      let c = this.cameras.get(key);
      if (c) return c;
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      this.host.appendChild(v);
      c = { key, el: v, ready: false, error: null, w: 0, h: 0, kind: 'camera' };
      this.cameras.set(key, c);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        c.error = new Error('Cámara no disponible en este navegador');
        this.emit('camera-error', c.error);
        return c;
      }
      const constraints = { audio: false, video: deviceId ? { deviceId: { exact: deviceId } } : { width: { ideal: 1920 }, height: { ideal: 1080 } } };
      navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
        c.stream = stream;
        v.srcObject = stream;
        v.addEventListener('loadeddata', () => { c.w = v.videoWidth; c.h = v.videoHeight; c.ready = true; this.emit('ready', c); }, { once: true });
        v.play().catch(() => {});
      }).catch((err) => {
        c.error = err;
        this.emit('camera-error', err);
      });
      return c;
    }

    /** Lienzo cacheado (patrones / textos). Se redibuja solo si cambia la firma. */
    canvas(key, w, h, sig, draw) {
      let c = this.canvases.get(key);
      if (!c) {
        c = { canvas: document.createElement('canvas'), sig: null, version: 0 };
        this.canvases.set(key, c);
      }
      if (c.sig !== sig) {
        c.canvas.width = Math.max(2, Math.round(w));
        c.canvas.height = Math.max(2, Math.round(h));
        draw(c.canvas.getContext('2d'), c.canvas.width, c.canvas.height);
        c.sig = sig;
        c.version++;
      }
      c.used = performance.now();
      return c;
    }

    gcCanvases(maxAgeMs = 5000) {
      const now = performance.now();
      this.canvases.forEach((c, k) => { if (now - (c.used || 0) > maxAgeMs) this.canvases.delete(k); });
    }
  }
  LM.MediaRuntime = MediaRuntime;
})();
