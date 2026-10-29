/* LuzMap — utilidades comunes */
(function () {
  'use strict';
  const LM = (window.LM = window.LM || {});

  LM.uid = (prefix = 'id') =>
    prefix + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

  LM.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  LM.lerp = (a, b, t) => a + (b - a) * t;
  LM.clone = (o) => JSON.parse(JSON.stringify(o));

  LM.debounce = (fn, ms) => {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  LM.escapeHtml = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  LM.hexToRgb = (hex) => {
    let h = String(hex || '#000000').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  LM.fmtTime = (sec) => {
    if (!isFinite(sec)) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  };

  LM.fmtBytes = (b) => {
    if (!b) return '';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return b.toFixed(i ? 1 : 0) + ' ' + u[i];
  };

  /** Lee/escribe propiedades anidadas con rutas tipo "source.color". */
  LM.getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  LM.setPath = (obj, path, value) => {
    const keys = path.split('.');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
  };

  LM.downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  LM.isTyping = (ev) => {
    const t = ev.target;
    if (!t || !t.tagName) return false;
    const tag = t.tagName.toLowerCase();
    if (tag === 'textarea' || t.isContentEditable) return true;
    if (tag === 'input') {
      const type = (t.type || '').toLowerCase();
      return !['checkbox', 'radio', 'range', 'button', 'color', 'file'].includes(type);
    }
    return tag === 'select';
  };

  LM.SURFACE_COLORS = ['#ff9f1c', '#2ec4b6', '#e71d36', '#7b61ff', '#3a86ff', '#8ac926', '#ff5d8f', '#ffd60a', '#00b4d8', '#f15bb5'];

  /** Emisor de eventos mínimo. */
  class Emitter {
    constructor() { this._h = {}; }
    on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return () => this.off(ev, fn); }
    off(ev, fn) { this._h[ev] = (this._h[ev] || []).filter((f) => f !== fn); }
    emit(ev, ...args) { (this._h[ev] || []).slice().forEach((fn) => fn(...args)); }
  }
  LM.Emitter = Emitter;
})();
