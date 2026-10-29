/* LuzMap — comunicación entre el editor y la ventana del proyector */
(function () {
  'use strict';
  const LM = window.LM;

  /**
   * Usa BroadcastChannel (si existe) y postMessage directo a las ventanas conocidas
   * (popup / opener). Los duplicados se descartan por número de secuencia.
   */
  class Link extends LM.Emitter {
    constructor(role) {
      super();
      this.role = role;
      this.id = LM.uid('w');
      this.seq = 0;
      this.seen = new Map();
      this.peers = new Set();
      try {
        this.bc = new BroadcastChannel('luzmap-v1');
        this.bc.onmessage = (e) => this._recv(e.data);
      } catch (e) {
        this.bc = null;
      }
      window.addEventListener('message', (e) => this._recv(e.data, e.source));
    }

    addPeer(win) {
      if (win) this.peers.add(win);
    }

    send(type, data = {}) {
      const msg = Object.assign({}, data, { t: type, _lm: 1, _from: this.id, _role: this.role, _seq: ++this.seq });
      if (this.bc) {
        try { this.bc.postMessage(msg); } catch (e) { /* p.ej. datos no clonables */ }
      }
      const targets = new Set(this.peers);
      try { if (window.opener && !window.opener.closed) targets.add(window.opener); } catch (e) { /* sin acceso */ }
      targets.forEach((w) => {
        try {
          if (w.closed) { this.peers.delete(w); return; }
          w.postMessage(msg, '*');
        } catch (e) { /* ventana cerrada */ }
      });
    }

    _recv(m, source) {
      if (!m || m._lm !== 1 || m._from === this.id || m._role === this.role) return;
      const last = this.seen.get(m._from) || 0;
      if (m._seq <= last) return;
      this.seen.set(m._from, m._seq);
      if (source && source !== window) this.addPeer(source);
      this.emit('message', m);
      this.emit(m.t, m);
    }
  }
  LM.Link = Link;
})();
