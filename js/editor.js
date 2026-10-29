/* LuzMap — editor: paneles, biblioteca, escenas, inspector, archivos y conexión con el proyector */
(function () {
  'use strict';
  const LM = window.LM;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = LM.escapeHtml;
  const LS_KEY = 'luzmap.project.v1';

  LM.hydrateIcons();

  /* ---------- Arranque ---------- */
  function loadLocal() {
    try {
      const t = localStorage.getItem(LS_KEY);
      return t ? JSON.parse(t) : null;
    } catch (e) {
      return null;
    }
  }

  const store = new LM.Store(loadLocal() || undefined);
  const link = new LM.Link('editor');
  const media = new LM.MediaRuntime({ role: 'editor', fetchBlob: (id) => LM.DB.get(id) });
  const stageHost = $('#stageHost');
  const stage = new LM.Stage({ host: stageHost, store, media, role: 'editor' });
  LM.app = { store, media, stage, link }; // útil para depurar desde la consola

  /* ---------- Avisos ---------- */
  let toastT = null;
  function toast(msg, err) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('err', !!err);
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('show'), err ? 6000 : 3800);
    $('#stHint').textContent = msg;
  }
  let badgeT = null;
  function badge(msg, ms = 3500) {
    const el = $('#stageBadge');
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(badgeT);
    badgeT = setTimeout(() => (el.style.opacity = '0'), ms);
  }
  stage.on('hint', (m) => toast(m));
  stage.on('error', (m) => toast(m, true));
  if (stage.renderer.failed) toast('Tu navegador no soporta WebGL: usa Chrome, Edge o Firefox actualizados.', true);
  media.on('autoplay-blocked', () => toast('El navegador bloqueó el sonido. Pulsa en la página y vuelve a activar el sonido.', true));
  media.on('camera-error', (e) => toast('No se pudo abrir la cámara: ' + (e && e.message ? e.message : e), true));
  media.on('error', (it) => toast('No se pudo leer un medio (' + (nameOf(it.id) || 'archivo') + '). ¿Formato compatible?', true));
  ['ready', 'thumb', 'missing', 'removed'].forEach((ev) => media.on(ev, () => scheduleRefresh()));

  function nameOf(mid) {
    const m = store.project.media.find((x) => x.id === mid);
    return m ? m.name : '';
  }

  /* ---------- Guardado automático ---------- */
  let quotaWarned = false;
  const saveLocal = LM.debounce(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(store.project));
    } catch (e) {
      if (!quotaWarned) { quotaWarned = true; toast('No se pudo guardar automáticamente en el navegador. Usa Guardar para descargar el proyecto.', true); }
    }
  }, 400);

  /* ---------- Conexión con el proyector ---------- */
  let outWin = null;
  const outputs = new Map();
  const pickUI = () => ({ selectedId: store.ui.selectedId, tool: store.ui.tool, point: store.ui.point, draft: store.ui.draft });
  const hasOutputs = () => outputs.size > 0 || (outWin && !outWin.closed);

  let stateTimer = null;
  function sendState(now) {
    if (!hasOutputs()) return;
    if (now) {
      clearTimeout(stateTimer);
      stateTimer = null;
      link.send('state', { project: store.project });
      return;
    }
    if (stateTimer) return;
    stateTimer = setTimeout(() => {
      stateTimer = null;
      link.send('state', { project: store.project });
    }, 16);
  }
  const sendUI = () => { if (hasOutputs()) link.send('ui', { ui: pickUI() }); };
  const sendVsync = () => { if (hasOutputs()) link.send('vsync', { list: media.syncPayload() }); };

  link.on('message', (m) => {
    if (m._role !== 'output') return;
    let o = outputs.get(m._from);
    const isNew = !o;
    if (!o) { o = {}; outputs.set(m._from, o); }
    o.lastSeen = Date.now();
    if (isNew || m.t === 'hello') {
      sendState(true);
      sendUI();
      sendVsync();
      refreshStatus();
    }
    if (m.w && m.h) handleOutputSize(m.w, m.h);
    if (m.t === 'needMedia') provideMedia(m.id);
    else if (m.t === 'state' && m.project) store.applyRemote(m.project);
    else if (m.t === 'ui' && m.ui) store.setUI(m.ui, 'remote');
  });

  function handleOutputSize(w, h) {
    const p = store.project;
    if (!p.output.auto || document.fullscreenElement || w < 100 || h < 100) return;
    if (p.output.width === w && p.output.height === h) return;
    store.mutate((pr) => { pr.output.width = w; pr.output.height = h; }, { checkpoint: false });
  }

  async function provideMedia(id) {
    const meta = store.project.media.find((m) => m.id === id);
    if (!meta) return;
    const it = media.info(id);
    const blob = (it && it.blob) || (await LM.DB.get(id));
    if (blob) link.send('media', { id, meta, blob });
  }

  setInterval(() => {
    const now = Date.now();
    outputs.forEach((o, k) => { if (now - o.lastSeen > 10000) outputs.delete(k); });
    refreshStatus();
  }, 1000);
  setInterval(sendVsync, 1000);

  function projectorConnected() {
    const now = Date.now();
    for (const o of outputs.values()) if (now - o.lastSeen < 4000) return true;
    return false;
  }

  // En el móvil no hay segunda ventana: la proyección es la propia pantalla (cable USB-C a HDMI o Smart View)
  const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

  function openOutput() {
    if (IS_MOBILE) {
      if (document.fullscreenElement !== stageHost) toggleFullscreen();
      toast('En el móvil se proyecta esta misma pantalla: conéctalo al proyector con cable USB-C a HDMI o con Smart View.');
      return;
    }
    if (outWin && !outWin.closed) {
      outWin.focus();
      toast('La ventana del proyector ya está abierta. Haz doble clic en ella para pantalla completa.');
      return;
    }
    const url = new URL('output.html', location.href).href;
    let w = window.open('', 'luzmap-output', 'popup=yes,width=1280,height=720');
    if (!w) {
      toast('El navegador bloqueó la ventana del proyector: permite las ventanas emergentes para esta página.', true);
      return;
    }
    try {
      if (!w.location.href || w.location.href === 'about:blank') w.location.href = url;
    } catch (e) { /* ya es la ventana de salida */ }
    outWin = w;
    link.addPeer(w);
    toast('Arrastra la ventana negra al proyector y haz doble clic en ella (o pulsa F) para pantalla completa.');
    placeOnSecondScreen(w);
  }

  async function placeOnSecondScreen(w) {
    if (!('getScreenDetails' in window)) return;
    try {
      const sd = await window.getScreenDetails();
      const others = sd.screens.filter((s) => s !== sd.currentScreen);
      const target = others.find((s) => !s.isPrimary) || others[0];
      if (!target) return;
      w.moveTo(target.availLeft, target.availTop);
      w.resizeTo(target.availWidth, target.availHeight);
      toast('Ventana enviada a la otra pantalla: haz doble clic en ella para ponerla a pantalla completa.');
    } catch (e) { /* sin permiso: el usuario la mueve a mano */ }
  }

  /* ---------- Cambios del proyecto ---------- */
  store.on('change', (e) => {
    media.sync(store.project);
    if (e.source === 'local') sendState();
    saveLocal();
    scheduleRefresh();
  });
  store.on('ui', (e) => {
    if (e.source === 'local') sendUI();
    scheduleRefresh();
  });

  let refreshPending = false;
  function scheduleRefresh() {
    if (refreshPending) return;
    refreshPending = true;
    const run = () => { if (refreshPending) { refreshPending = false; refresh(); } };
    requestAnimationFrame(run);
    setTimeout(run, 120); // por si la pestaña no está visible
  }

  function refresh() {
    renderSurfaces();
    renderMedia();
    renderScenes();
    renderInspector();
    syncBindings();
    refreshTopbar();
    refreshStatus();
    $('#stageEmpty').style.display = store.project.surfaces.length ? 'none' : '';
    const sel = store.selected;
    const title = $('#inspector .insp-title');
    if (sel && title) {
      title.querySelector('b').textContent = sel.name;
      const sw = title.querySelector('.sw');
      if (sw) sw.style.background = sel.color;
    }
    const nm = $('#projectName');
    if (document.activeElement !== nm) nm.value = store.project.name;
    document.title = store.project.name + ' · LuzMap';
    const nl = $('#nudgeLabel');
    if (nl) {
      const pt = store.ui.point;
      nl.textContent = !pt ? 'Mueve: toda la superficie' : pt.type === 'corner' ? 'Mueve: esquina ' + (pt.idx + 1) : pt.type === 'mesh' ? 'Mueve: punto de malla' : 'Mueve: punto de máscara';
    }
  }

  /* ---------- Superficies ---------- */
  function contentLabel(c) {
    if (!c) return 'Vacío';
    const s = c.source;
    switch (s.type) {
      case 'pattern': return 'Patrón de prueba';
      case 'media': return nameOf(s.mediaId) || 'Medio sin elegir';
      case 'color': return 'Color sólido';
      case 'generator': return 'Efecto · ' + ((LM.GENERATORS[s.generator] || {}).label || '');
      case 'text': return 'Texto · ' + String(s.text.value || '').split('\n')[0];
      case 'camera': return 'Cámara en directo';
      default: return 'Vacío';
    }
  }

  let surfSig = '';
  function renderSurfaces() {
    const p = store.project;
    const items = p.surfaces.slice().reverse();
    const sig = JSON.stringify([store.ui.selectedId, p.activeScene, items.map((s) => [s.id, s.name, s.color, s.visible, s.locked, contentLabel(LM.State.contentIn(p, p.activeScene, s.id))])]);
    if (sig === surfSig) return;
    surfSig = sig;
    const el = $('#surfaceList');
    if (!items.length) {
      el.innerHTML = '<div class="empty">Aún no hay superficies. Añade un plano y encájalo en tu objeto.</div>';
      return;
    }
    el.innerHTML = items.map((s) => `
      <div class="sitem ${s.id === store.ui.selectedId ? 'sel' : ''} ${s.visible ? '' : 'hidden'}" data-sid="${s.id}">
        <span class="sw" style="background:${esc(s.color)}"></span>
        <span class="nm">${esc(s.name)}<span class="sub">${esc(contentLabel(LM.State.contentIn(p, p.activeScene, s.id)))}</span></span>
        <span class="acts">
          <button class="btn ghost icon" data-sact="up" title="Traer adelante">${LM.icon('up')}</button>
          <button class="btn ghost icon" data-sact="down" title="Enviar atrás">${LM.icon('down')}</button>
          <button class="btn ghost icon" data-sact="vis" title="${s.visible ? 'Ocultar' : 'Mostrar'}">${LM.icon(s.visible ? 'eye' : 'eyeOff')}</button>
          <button class="btn ghost icon" data-sact="lock" title="${s.locked ? 'Desbloquear' : 'Bloquear para no moverla sin querer'}">${LM.icon(s.locked ? 'lock' : 'unlock')}</button>
        </span>
      </div>`).join('');
  }

  $('#surfaceList').addEventListener('click', (e) => {
    const row = e.target.closest('[data-sid]');
    if (!row) return;
    const sid = row.dataset.sid;
    const btn = e.target.closest('[data-sact]');
    if (!btn) {
      store.setUI({ selectedId: sid, point: null, tool: store.ui.tool === 'draw' ? 'edit' : store.ui.tool });
      return;
    }
    const act = btn.dataset.sact;
    store.mutate((p) => {
      const i = p.surfaces.findIndex((s) => s.id === sid);
      const s = p.surfaces[i];
      if (act === 'vis') s.visible = !s.visible;
      else if (act === 'lock') s.locked = !s.locked;
      else if (act === 'up' && i < p.surfaces.length - 1) p.surfaces.splice(i + 1, 0, p.surfaces.splice(i, 1)[0]);
      else if (act === 'down' && i > 0) p.surfaces.splice(i - 1, 0, p.surfaces.splice(i, 1)[0]);
    }, { structural: true });
  });

  function addSurface(mesh) {
    let s;
    store.mutate((p) => { s = LM.State.addSurface(p, { mesh }); }, { structural: true });
    store.setUI({ selectedId: s.id, point: null, tool: 'edit', draft: null });
    toast(mesh ? 'Malla añadida: mueve las esquinas y luego los puntos intermedios para seguir la curva.' : 'Plano añadido: arrastra sus 4 esquinas hasta las esquinas reales del objeto.');
  }

  function duplicateSurface() {
    const s = store.selected;
    if (!s) return;
    let copy;
    store.mutate((p) => {
      copy = LM.clone(s);
      copy.id = LM.uid('s');
      copy.name = s.name + ' (copia)';
      copy.locked = false;
      copy.corners = copy.corners.map((c) => [c[0] + 0.02, c[1] + 0.02]);
      copy.masks = copy.masks.map((poly) => poly.map((c) => [c[0] + 0.02, c[1] + 0.02]));
      const i = p.surfaces.findIndex((x) => x.id === s.id);
      p.surfaces.splice(i + 1, 0, copy);
      p.scenes.forEach((sc) => { if (sc.contents[s.id]) sc.contents[copy.id] = LM.clone(sc.contents[s.id]); });
    }, { structural: true });
    store.setUI({ selectedId: copy.id, point: null });
  }

  function deleteSurface() {
    const s = store.selected;
    if (!s) return;
    if (!confirm(`¿Eliminar la superficie «${s.name}»?`)) return;
    store.mutate((p) => {
      p.surfaces = p.surfaces.filter((x) => x.id !== s.id);
      p.scenes.forEach((sc) => delete sc.contents[s.id]);
    }, { structural: true });
    store.setUI({ selectedId: null, point: null });
  }

  /** Reordena las esquinas (y la malla) para girar el contenido 90° o reflejarlo. */
  function rotateCorners(mirror) {
    const s = store.selected;
    if (!s) return;
    store.mutate(() => {
      const c = s.corners;
      const m = s.mesh;
      const C = m.cols, R = m.rows, old = m.offsets;
      if (mirror) {
        s.corners = [c[1], c[0], c[3], c[2]];
        const off = [];
        for (let j = 0; j <= R; j++) for (let i = 0; i <= C; i++) off.push(old[j * (C + 1) + (C - i)]);
        m.offsets = off;
      } else {
        s.corners = [c[3], c[0], c[1], c[2]];
        const nc = R, nr = C, off = [];
        for (let j = 0; j <= nr; j++) for (let i = 0; i <= nc; i++) off.push(old[(R - i) * (C + 1) + j]);
        m.cols = nc; m.rows = nr; m.offsets = off;
      }
    }, { structural: true });
  }

  /* ---------- Biblioteca de medios ---------- */
  const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv|mkv)$/i;
  const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;

  async function importFiles(fileList) {
    const files = Array.from(fileList || []);
    const added = [];
    let skipped = 0, dbFailed = false;
    for (const f of files) {
      const kind = f.type.startsWith('video/') || VIDEO_EXT.test(f.name) ? 'video' : f.type.startsWith('image/') || IMAGE_EXT.test(f.name) ? 'image' : null;
      if (!kind) { skipped++; continue; }
      const meta = { id: LM.uid('m'), name: f.name, kind, mime: f.type, size: f.size, loop: true, muted: true, volume: 1, speed: 1, paused: false };
      try { await LM.DB.put(meta.id, f); } catch (e) { dbFailed = true; }
      media.load(meta, f);
      added.push(meta);
    }
    if (added.length) store.mutate((p) => { p.media.push(...added); }, { structural: true });
    if (skipped) toast(`${skipped} archivo(s) ignorado(s): solo se admiten imágenes y vídeos.`, true);
    else if (dbFailed) toast('Medios importados, pero el navegador no permitió guardarlos: tendrás que volver a importarlos al recargar.', true);
    else if (added.length) toast(added.length === 1 ? `«${added[0].name}» añadido a la biblioteca.` : `${added.length} medios añadidos a la biblioteca.`);
    return added;
  }

  function assignMedia(sid, mid) {
    store.mutate((p) => {
      const c = LM.State.content(p, sid);
      c.source.type = 'media';
      c.source.mediaId = mid;
      const m = p.media.find((x) => x.id === mid);
      if (m && m.kind === 'video') m.paused = false;
    }, { structural: true });
  }

  function surfaceForMedia(mid, pt) {
    const it = media.get(mid);
    const ar = it && it.w ? it.w / it.h : 16 / 9;
    const p = store.project;
    const outAr = p.output.width / p.output.height;
    let w = 0.4, h = (w * outAr) / ar;
    if (h > 0.7) { h = 0.7; w = (h * ar) / outAr; }
    const cx = LM.clamp(pt ? pt[0] : 0.5, w / 2, 1 - w / 2);
    const cy = LM.clamp(pt ? pt[1] : 0.5, h / 2, 1 - h / 2);
    let s;
    store.mutate((pr) => {
      s = LM.State.addSurface(pr, { corners: LM.State.rectCorners(cx, cy, w, h), mediaId: mid, name: nameOf(mid).replace(/\.[^.]+$/, '') || undefined });
    }, { structural: true });
    store.setUI({ selectedId: s.id, point: null, tool: 'edit' });
  }

  /** Coloca un medio: en la superficie bajo el punto, en la seleccionada o en una nueva. */
  function placeMedia(mid, pt) {
    const target = pt ? stage.surfaceAt(pt) : store.selected;
    if (target) {
      assignMedia(target.id, mid);
      store.setUI({ selectedId: target.id });
      toast(`«${nameOf(mid)}» proyectado en «${target.name}».`);
    } else {
      surfaceForMedia(mid, pt);
      toast('Nueva superficie creada con el medio. Ajusta sus esquinas al objeto.');
    }
  }

  let mediaSig = '';
  function renderMedia() {
    const p = store.project;
    const used = new Set();
    p.scenes.forEach((sc) => Object.values(sc.contents).forEach((c) => { if (c.source.type === 'media' && c.source.mediaId) used.add(c.source.mediaId); }));
    const rows = p.media.map((m) => {
      const it = media.info(m.id);
      return [m.id, m.name, m.kind, it ? !!it.missing : false, it ? it.thumb : null, it && it.error, used.has(m.id)];
    });
    const sig = JSON.stringify(rows.map((r) => r.map((v, i) => (i === 4 && v ? v.length : v))));
    if (sig === mediaSig) return;
    mediaSig = sig;
    const el = $('#mediaGrid');
    if (!rows.length) {
      el.innerHTML = '<div class="empty" style="grid-column:1/-1">Tu biblioteca está vacía.</div>';
      return;
    }
    el.innerHTML = rows.map(([id, name, kind, missing, thumb, error, isUsed]) => `
      <div class="mitem ${missing || error ? 'missing' : ''} ${isUsed ? 'used' : ''}" draggable="true" data-mid="${id}" title="${esc(name)}${missing ? ' — falta el archivo: haz clic para volver a vincularlo' : ' — clic para proyectarlo en la superficie seleccionada, o arrástralo'}">
        ${thumb ? `<img src="${esc(thumb)}" alt="">` : `<div class="ph">${missing ? 'Falta el archivo<br>clic para vincular' : error ? 'No compatible' : LM.icon(kind === 'video' ? 'video' : 'image')}</div>`}
        <span class="kind">${kind === 'video' ? 'Vídeo' : 'Imagen'}</span>
        <span class="cap">${esc(name)}</span>
        <button class="del" data-mact="del" title="Quitar de la biblioteca">${LM.icon('x')}</button>
      </div>`).join('');
  }

  let relinkId = null;
  $('#mediaGrid').addEventListener('click', (e) => {
    const item = e.target.closest('[data-mid]');
    if (!item) return;
    const mid = item.dataset.mid;
    if (e.target.closest('[data-mact="del"]')) {
      if (!confirm(`¿Quitar «${nameOf(mid)}» de la biblioteca? Las superficies que lo usan quedarán vacías.`)) return;
      store.mutate((p) => {
        p.media = p.media.filter((m) => m.id !== mid);
        p.scenes.forEach((sc) => Object.values(sc.contents).forEach((c) => {
          if (c.source.type === 'media' && c.source.mediaId === mid) { c.source.mediaId = null; c.source.type = 'none'; }
        }));
      }, { structural: true });
      return;
    }
    const it = media.info(mid);
    if (it && it.missing) {
      relinkId = mid;
      $('#fileRelink').click();
      return;
    }
    if (!store.selected) {
      surfaceForMedia(mid, null);
      toast('Nueva superficie creada con el medio. Ajusta sus esquinas al objeto.');
      return;
    }
    placeMedia(mid, null);
  });

  $('#mediaGrid').addEventListener('dragstart', (e) => {
    const item = e.target.closest('[data-mid]');
    if (!item) return;
    e.dataTransfer.setData('application/x-luzmap-media', item.dataset.mid);
    e.dataTransfer.setData('text/plain', nameOf(item.dataset.mid));
    e.dataTransfer.effectAllowed = 'copy';
  });

  $('#fileRelink').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f || !relinkId) return;
    const meta = store.project.media.find((m) => m.id === relinkId);
    if (!meta) return;
    try { await LM.DB.put(meta.id, f); } catch (err) { /* sin persistencia */ }
    media.provide(meta, f);
    link.send('media', { id: meta.id, meta, blob: f });
    toast(`«${meta.name}» vinculado de nuevo.`);
    relinkId = null;
  });

  $('#fileMedia').addEventListener('change', async (e) => {
    const files = e.target.files;
    const added = await importFiles(files);
    e.target.value = '';
    const sel = store.selected;
    if (added.length && sel) {
      const c = LM.State.contentIn(store.project, store.project.activeScene, sel.id);
      if (!c || ['none', 'pattern', 'media'].includes(c.source.type)) assignMedia(sel.id, added[0].id);
    }
  });

  // arrastrar y soltar
  const isMediaDrag = (e) => Array.from(e.dataTransfer.types || []).some((t) => t === 'Files' || t === 'application/x-luzmap-media');
  window.addEventListener('dragover', (e) => { if (isMediaDrag(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => { if (isMediaDrag(e)) e.preventDefault(); });
  [stageHost, $('#dropzone')].forEach((zone) => {
    zone.addEventListener('dragover', (e) => {
      if (!isMediaDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      zone.classList.add('over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', async (e) => {
      zone.classList.remove('over');
      if (!isMediaDrag(e)) return;
      e.preventDefault();
      const onStage = zone === stageHost;
      const pt = onStage ? stage.norm(e) : null;
      const inside = pt && pt[0] >= 0 && pt[0] <= 1 && pt[1] >= 0 && pt[1] <= 1;
      const mid = e.dataTransfer.getData('application/x-luzmap-media');
      if (mid) {
        if (onStage) placeMedia(mid, inside ? pt : [0.5, 0.5]);
        return;
      }
      const added = await importFiles(e.dataTransfer.files);
      if (onStage && added.length) placeMedia(added[0].id, inside ? pt : [0.5, 0.5]);
    });
  });

  /* ---------- Escenas ---------- */
  let sceneSig = '';
  function renderScenes() {
    const p = store.project;
    const sig = JSON.stringify([p.activeScene, p.scenes.map((s) => [s.id, s.name, s.duration])]);
    if (sig === sceneSig) return;
    sceneSig = sig;
    $('#sceneList').innerHTML = p.scenes.map((s, i) => `
      <div class="scitem ${s.id === p.activeScene ? 'sel' : ''}" data-scid="${s.id}">
        <span class="num">${i + 1}</span>
        <span class="nm" title="Doble clic para renombrar">${esc(s.name)}</span>
        <input class="dur" type="number" min="0" step="0.5" value="${s.duration}" data-scdur title="Duración en segundos para el modo bucle (0 = manual)">
        <button class="btn ghost icon" data-scact="dup" title="Duplicar escena">${LM.icon('copy')}</button>
        <button class="btn ghost icon" data-scact="del" title="Eliminar escena">${LM.icon('trash')}</button>
      </div>`).join('');
  }

  function setScene(id) {
    if (store.project.activeScene === id) return;
    store.mutate((p) => { p.activeScene = id; }, { checkpoint: false, structural: true });
  }

  function gotoScene(delta) {
    const p = store.project;
    const i = p.scenes.findIndex((s) => s.id === p.activeScene);
    const n = p.scenes.length;
    setScene(p.scenes[(i + delta + n) % n].id);
  }

  function addScene(fromId) {
    let sc;
    store.mutate((p) => {
      const src = p.scenes.find((s) => s.id === (fromId || p.activeScene)) || p.scenes[0];
      sc = LM.State.newScene('Escena ' + (p.scenes.length + 1));
      sc.contents = LM.clone(src.contents);
      sc.duration = src.duration;
      const i = p.scenes.indexOf(src);
      p.scenes.splice(i + 1, 0, sc);
      p.activeScene = sc.id;
    }, { structural: true });
    toast('Escena creada (copia de la anterior). Cambia el contenido de las superficies para esta escena.');
  }

  $('#sceneList').addEventListener('click', (e) => {
    const row = e.target.closest('[data-scid]');
    if (!row || e.target.matches('input')) return;
    const id = row.dataset.scid;
    const act = e.target.closest('[data-scact]');
    if (!act) { setScene(id); return; }
    if (act.dataset.scact === 'dup') addScene(id);
    else if (act.dataset.scact === 'del') {
      const p = store.project;
      if (p.scenes.length < 2) { toast('Debe haber al menos una escena.'); return; }
      const sc = p.scenes.find((s) => s.id === id);
      if (!confirm(`¿Eliminar la escena «${sc.name}»?`)) return;
      store.mutate((pr) => {
        const i = pr.scenes.findIndex((s) => s.id === id);
        pr.scenes.splice(i, 1);
        if (pr.activeScene === id) pr.activeScene = pr.scenes[Math.max(0, i - 1)].id;
      }, { structural: true });
    }
  });
  $('#sceneList').addEventListener('dblclick', (e) => {
    const row = e.target.closest('[data-scid]');
    if (!row || !e.target.closest('.nm')) return;
    const sc = store.project.scenes.find((s) => s.id === row.dataset.scid);
    const name = prompt('Nombre de la escena', sc.name);
    if (name && name.trim()) store.mutate(() => { sc.name = name.trim(); }, { structural: true });
  });
  $('#sceneList').addEventListener('input', (e) => {
    if (!e.target.matches('[data-scdur]')) return;
    const id = e.target.closest('[data-scid]').dataset.scid;
    const v = Math.max(0, parseFloat(e.target.value) || 0);
    store.mutate((p) => { p.scenes.find((s) => s.id === id).duration = v; }, { key: 'dur:' + id });
  });

  // reproducción automática de escenas
  let sceneStart = performance.now();
  let lastScene = store.project.activeScene;
  setInterval(() => {
    const p = store.project;
    if (p.activeScene !== lastScene) { lastScene = p.activeScene; sceneStart = performance.now(); }
    if (!p.playlist.autoplay || p.scenes.length < 2) return;
    const sc = LM.State.activeScene(p);
    if (sc.duration > 0 && performance.now() - sceneStart >= sc.duration * 1000) gotoScene(1);
  }, 100);

  /* ---------- Enlace de controles con el modelo ---------- */
  function scopeTarget(p, scope) {
    if (scope === 'settings') return p.settings;
    if (scope === 'output') return p.output;
    if (scope === 'playlist') return p.playlist;
    const s = p.surfaces.find((x) => x.id === store.ui.selectedId);
    if (!s) return null;
    if (scope === 'surface') return s;
    const c = LM.State.content(p, s.id);
    if (scope === 'content') return c;
    if (scope === 'source') return c.source;
    if (scope === 'text') return c.source.text;
    if (scope === 'media') return p.media.find((m) => m.id === c.source.mediaId) || null;
    return null;
  }

  function readInput(el) {
    if (el.type === 'checkbox') return el.dataset.invert ? !el.checked : el.checked;
    if (el.type === 'range' || el.type === 'number' || el.dataset.type === 'num') {
      const v = parseFloat(el.value);
      return isFinite(v) ? v : 0;
    }
    return el.value;
  }

  const FMT = {
    pct: (v) => Math.round(v * 100) + '%',
    spct: (v) => (v > 0 ? '+' : '') + Math.round(v * 100) + '%',
    deg: (v) => Math.round(v) + '°',
    x: (v) => (+v).toFixed(2) + '×',
    s: (v) => (+v).toFixed(1) + ' s',
    n2: (v) => (+v).toFixed(2),
    px: (v) => Math.round(v) + ' px',
  };

  function syncBindings() {
    const p = store.project;
    $$('[data-k]').forEach((el) => {
      const [scope, path] = el.dataset.k.split(':');
      const t = scopeTarget(p, scope);
      if (!t) return;
      const v = LM.getPath(t, path);
      if (el.type === 'checkbox') el.checked = el.dataset.invert ? !v : !!v;
      else if (document.activeElement !== el) {
        const sv = v == null ? '' : String(v);
        if (el.value !== sv) el.value = sv;
      }
    });
    $$('[data-out]').forEach((el) => {
      const [scope, path] = el.dataset.out.split(':');
      const t = scopeTarget(p, scope);
      if (!t) return;
      const v = LM.getPath(t, path);
      const f = FMT[el.dataset.fmt] || ((x) => (+x).toFixed(2));
      el.textContent = v == null ? '' : f(+v);
    });
  }

  function afterSet(p, scope, path, value) {
    if (scope === 'source' && path === 'type') {
      const c = scopeTarget(p, 'content');
      if (value === 'media' && !c.source.mediaId && p.media.length) c.source.mediaId = p.media[p.media.length - 1].id;
    }
    if (scope === 'output' && (path === 'width' || path === 'height')) {
      p.output[path] = LM.clamp(Math.round(value) || 1, 16, 16384);
      p.output.auto = false;
    }
    if (scope === 'settings' && path === 'gridSize') p.settings.gridSize = LM.clamp(value, 2, 1000);
  }

  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-k]');
    if (!el) return;
    const [scope, path] = el.dataset.k.split(':');
    const value = readInput(el);
    store.mutate((p) => {
      const t = scopeTarget(p, scope);
      if (!t) return;
      LM.setPath(t, path, value);
      afterSet(p, scope, path, value);
    }, { key: el.dataset.k + ':' + store.ui.selectedId, structural: el.dataset.structural === '1' });
  });

  document.addEventListener('dblclick', (e) => {
    const el = e.target.closest('input[type=range][data-default]');
    if (!el) return;
    el.value = el.dataset.default;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  /* ---------- Inspector ---------- */
  const secOpen = { content: true, adjust: true, surface: true, fine: stage.touch, mesh: false, mask: false, output: true, steps: true, grid: false, files: false };
  let nudgeStep = 1;
  let cameraList = [];
  let inspSig = '';
  let inspForce = false;

  function slider(k, label, min, max, step, fmt, def) {
    return `<label class="field"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" data-k="${k}" ${def != null ? `data-default="${def}"` : ''}><output data-out="${k}" data-fmt="${fmt}"></output></label>`;
  }
  function select(k, label, options, structural) {
    return `<label class="field wide"><span>${label}</span><select data-k="${k}" ${structural ? 'data-structural="1"' : ''}>${options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>`;
  }
  function color(k, label) {
    return `<label class="field wide"><span>${label}</span><input type="color" data-k="${k}"></label>`;
  }
  function check(k, label, extra) {
    return `<label class="cb"><input type="checkbox" data-k="${k}" ${extra || ''}>${label}</label>`;
  }
  function sec(id, title, body, forceOpen) {
    const open = forceOpen || secOpen[id];
    return `<details class="sec" data-sec="${id}" ${open ? 'open' : ''}><summary class="sec-h">${title}</summary><div class="sec-b">${body}</div></details>`;
  }

  const SOURCES = [
    ['none', 'Nada (apagada)'],
    ['pattern', 'Patrón de prueba'],
    ['media', 'Imagen o vídeo'],
    ['color', 'Color sólido'],
    ['generator', 'Efecto animado'],
    ['text', 'Texto'],
    ['camera', 'Cámara web'],
  ];
  const FONTS = [
    ['system-ui, sans-serif', 'Sans'],
    ['Georgia, "Times New Roman", serif', 'Serif'],
    ['Impact, "Arial Black", sans-serif', 'Impact'],
    ['"Courier New", ui-monospace, monospace', 'Máquina de escribir'],
    ['"Comic Sans MS", "Chalkboard SE", cursive', 'Manuscrita'],
    ['"Brush Script MT", cursive', 'Pincel'],
  ];
  const PRESETS = [
    ['1920x1080', '1920 × 1080 · Full HD 16:9'],
    ['1280x720', '1280 × 720 · HD 16:9'],
    ['3840x2160', '3840 × 2160 · 4K 16:9'],
    ['1920x1200', '1920 × 1200 · WUXGA 16:10'],
    ['1280x800', '1280 × 800 · WXGA 16:10 (proyectores LED)'],
    ['1024x768', '1024 × 768 · XGA 4:3'],
    ['800x600', '800 × 600 · SVGA 4:3'],
    ['854x480', '854 × 480 · Mini proyector'],
  ];

  function computeInspSig() {
    const p = store.project;
    const s = store.selected;
    if (!s) return ['none', p.output.width, p.output.height, p.media.length].join('|');
    const c = LM.State.contentIn(p, p.activeScene, s.id);
    const src = c ? c.source : {};
    const m = src.type === 'media' ? p.media.find((x) => x.id === src.mediaId) : null;
    const it = m ? media.info(m.id) : null;
    return [s.id, p.activeScene, src.type, src.mediaId, m && m.kind, it && it.thumb ? 1 : 0, s.mesh.enabled, s.masks.length, p.media.map((x) => x.id + x.name).join(','), cameraList.length].join('|');
  }

  function renderInspector() {
    const sig = computeInspSig();
    if (sig === inspSig && !inspForce) return;
    inspSig = sig;
    inspForce = false;
    const el = $('#inspector');
    const scroll = el.scrollTop;
    el.innerHTML = store.selected ? surfaceInspector(store.selected) : projectInspector();
    el.scrollTop = scroll;
    $$('details[data-sec]', el).forEach((d) => d.addEventListener('toggle', () => { secOpen[d.dataset.sec] = d.open; }));
  }

  function sourceFields(p, c) {
    const src = c.source;
    switch (src.type) {
      case 'none':
        return '<div class="note">La superficie no proyecta nada en esta escena.</div>';
      case 'pattern':
        return '<div class="note">Patrón de calibración: los números <b>1-4</b> coinciden con las esquinas del editor y la flecha indica <b>arriba</b>. El círculo debe verse redondo en el objeto real.</div>';
      case 'media': {
        if (!p.media.length) {
          return '<div class="note">Tu biblioteca está vacía.</div><div class="row"><button class="btn primary" data-act="import">' + LM.icon('plus') + 'Importar imagen o vídeo</button></div>';
        }
        const m = p.media.find((x) => x.id === src.mediaId);
        const it = m ? media.info(m.id) : null;
        let html = select('source:mediaId', 'Archivo', [['', '— elige —'], ...p.media.map((x) => [x.id, (x.kind === 'video' ? '🎬 ' : '🖼 ') + x.name])], true);
        if (it && it.thumb) html += `<div class="preview"><img src="${esc(it.thumb)}" alt=""><span class="note">${esc(m.name)}<br>${it.w ? it.w + ' × ' + it.h : ''} ${m.size ? '· ' + LM.fmtBytes(m.size) : ''}</span></div>`;
        if (m && m.kind === 'video') {
          html += `<div class="vidbar">
              <button class="btn icon" data-act="vidToggle" id="vidPlay" title="Reproducir / pausar (Espacio)">${LM.icon(m.paused ? 'play' : 'pause')}</button>
              <button class="btn icon" data-act="vidRestart" title="Volver al principio">${LM.icon('restart')}</button>
              <span class="time" id="vidTime"></span>
            </div>
            <div class="row">${check('media:loop', 'Bucle')}${check('media:muted', 'Sonido', 'data-invert="1"')}</div>
            ${slider('media:volume', 'Volumen', 0, 1, 0.01, 'pct', 1)}
            ${slider('media:speed', 'Velocidad', 0.25, 2, 0.05, 'x', 1)}
            <div class="note">El sonido sale por el ordenador del editor; el proyector siempre va en silencio.</div>`;
        }
        html += '<div class="row"><button class="btn sm" data-act="import">' + LM.icon('plus') + 'Importar otro</button></div>';
        return html;
      }
      case 'color':
        return color('source:color', 'Color');
      case 'generator':
        return select('source:generator', 'Efecto', Object.entries(LM.GENERATORS).map(([k, g]) => [k, g.label])) +
          color('source:color', 'Color 1') + color('source:color2', 'Color 2') +
          slider('source:speed', 'Velocidad', 0, 5, 0.05, 'x', 1) +
          slider('source:param', 'Tamaño', 0, 1, 0.01, 'pct', 0.5);
      case 'text':
        return `<label class="field wide"><span>Texto</span><textarea data-k="text:value" rows="3" spellcheck="false"></textarea></label>` +
          select('text:font', 'Fuente', FONTS) +
          slider('text:size', 'Tamaño', 0.05, 1, 0.01, 'pct', 0.45) +
          color('text:color', 'Color') +
          `<div class="row">${check('text:bold', 'Negrita')}${check('text:bgOn', 'Fondo')}</div>` +
          color('text:bg', 'Color fondo') +
          select('text:align', 'Alineación', [['center', 'Centrado'], ['left', 'Izquierda'], ['right', 'Derecha']]) +
          slider('text:scroll', 'Desplazar', -3, 3, 0.05, 'n2', 0) +
          '<div class="note">Con <b>Desplazar</b> distinto de 0 el texto corre como una marquesina.</div>';
      case 'camera':
        return select('source:deviceId', 'Cámara', [['', 'Predeterminada'], ...cameraList.map((d, i) => [d.deviceId, d.label || 'Cámara ' + (i + 1)])]) +
          '<div class="row"><button class="btn sm" data-act="camDetect">' + LM.icon('camera') + 'Buscar cámaras</button></div>' +
          '<div class="note">El navegador pedirá permiso en el editor y en la ventana del proyector.</div>';
      default:
        return '';
    }
  }

  function surfaceInspector(s) {
    const p = store.project;
    const c = LM.State.content(p, s.id);
    const scene = LM.State.activeScene(p);
    const t = c.source.type;
    const showAdjust = !['none'].includes(t);
    const showFit = ['media', 'camera'].includes(t);
    let html = `<div class="insp-title"><span class="sw" style="background:${esc(s.color)}"></span><b>${esc(s.name)}</b>
        <button class="btn sm icon ghost" data-act="dupSurface" title="Duplicar (Ctrl+D)">${LM.icon('copy')}</button>
        <button class="btn sm icon ghost danger" data-act="delSurface" title="Eliminar (Supr)">${LM.icon('trash')}</button></div>`;

    html += sec('content', 'Contenido · ' + esc(scene.name), select('source:type', 'Proyectar', SOURCES, true) + sourceFields(p, c));

    if (showAdjust) {
      let body = '';
      if (showFit) {
        body += select('content:fit', 'Encaje', [['stretch', 'Estirar a la superficie'], ['cover', 'Rellenar (recorta)'], ['contain', 'Encajar (sin recortar)'], ['tile', 'Mosaico']]);
      }
      body += slider('content:zoom', 'Zoom', 0.1, 5, 0.01, 'x', 1) +
        slider('content:rotation', 'Giro', -180, 180, 1, 'deg', 0) +
        slider('content:offsetX', 'Mover X', -1, 1, 0.005, 'spct', 0) +
        slider('content:offsetY', 'Mover Y', -1, 1, 0.005, 'spct', 0) +
        `<div class="row">${check('content:flipX', 'Espejo horizontal')}${check('content:flipY', 'Espejo vertical')}</div>` +
        slider('content:opacity', 'Opacidad', 0, 1, 0.01, 'pct', 1) +
        slider('content:brightness', 'Brillo', -1, 1, 0.01, 'spct', 0) +
        slider('content:contrast', 'Contraste', 0, 3, 0.01, 'x', 1) +
        slider('content:saturation', 'Saturación', 0, 3, 0.01, 'x', 1) +
        slider('content:hue', 'Tono', -180, 180, 1, 'deg', 0) +
        `<div class="row"><button class="btn sm" data-act="resetAdjust">${LM.icon('restart')}Restablecer ajustes</button></div>
         <div class="note">Doble clic en un deslizador lo devuelve a su valor inicial.</div>`;
      html += sec('adjust', 'Encaje y color', body);
    }

    html += sec('surface', 'Superficie',
      `<label class="field wide"><span>Nombre</span><input type="text" data-k="surface:name" spellcheck="false"></label>` +
      color('surface:color', 'Color guía') +
      select('surface:blend', 'Fusión', [['normal', 'Normal'], ['add', 'Sumar luz'], ['screen', 'Trama'], ['multiply', 'Multiplicar']]) +
      slider('surface:feather', 'Borde suave', 0, 0.5, 0.005, 'pct', 0) +
      `<div class="row">${check('surface:visible', 'Visible')}${check('surface:locked', 'Bloqueada')}</div>
       <div class="row2">
         <button class="btn sm" data-act="resetShape" title="Vuelve a un rectángulo centrado">${LM.icon('fit')}Rectángulo</button>
         <button class="btn sm" data-act="fullShape" title="Ocupa toda la salida">${LM.icon('expand')}Toda la salida</button>
         <button class="btn sm" data-act="rotCorners" title="Gira el contenido 90° sin mover la superficie">${LM.icon('rotate')}Girar 90°</button>
         <button class="btn sm" data-act="mirrorCorners" title="Refleja el contenido sin mover la superficie">${LM.icon('mirror')}Reflejar</button>
       </div>
       <div class="note">Arrastra las esquinas en el escenario. Flechas: 1 px · <kbd>Shift</kbd>: 10 px · <kbd>Tab</kbd>: siguiente esquina.</div>`);

    html += sec('fine', 'Ajuste fino', `<div class="nudge">
        <div class="nudge-pad">
          <button class="btn icon" data-nudge="0,-1" title="Arriba" style="grid-area:up">${LM.icon('up')}</button>
          <button class="btn icon" data-nudge="-1,0" title="Izquierda" style="grid-area:left">${LM.icon('left')}</button>
          <button class="btn icon" data-nudge="0,1" title="Abajo" style="grid-area:down">${LM.icon('down')}</button>
          <button class="btn icon" data-nudge="1,0" title="Derecha" style="grid-area:right">${LM.icon('right')}</button>
        </div>
        <div class="nudge-side">
          <span id="nudgeLabel" class="note"></span>
          <button class="btn sm" data-act="nextPoint" title="Siguiente esquina (Tab)">Siguiente punto</button>
          <button class="btn sm" data-act="nudgeStep" id="nudgeStep">Paso: ${nudgeStep} px</button>
        </div>
      </div>
      <div class="note">Para afinar sin teclado: elige una esquina (tócala o pulsa «Siguiente punto») y muévela píxel a píxel. Mantén pulsada una flecha para avanzar seguido.</div>`);

    let meshBody = `<div class="row">${check('surface:mesh.enabled', 'Deformar con malla', 'data-structural="1"')}</div>`;
    if (s.mesh.enabled) {
      meshBody += `<div class="row2">
          <label class="field wide" style="grid-template-columns:52px 1fr"><span>Columnas</span><input type="number" min="1" max="12" value="${s.mesh.cols}" data-mesh="cols"></label>
          <label class="field wide" style="grid-template-columns:42px 1fr"><span>Filas</span><input type="number" min="1" max="12" value="${s.mesh.rows}" data-mesh="rows"></label>
        </div>
        <div class="row"><button class="btn sm" data-act="meshReset">${LM.icon('restart')}Aplanar malla</button></div>`;
    }
    meshBody += '<div class="note">Para columnas, toldos, carrocerías y otras superficies curvas: mueve los puntos intermedios para seguir la forma.</div>';
    html += sec('mesh', 'Malla · superficies curvas', meshBody, s.mesh.enabled);

    html += sec('mask', `Máscaras (${s.masks.length})`,
      `<div class="row2">
         <button class="btn sm ${store.ui.tool === 'mask' ? 'on' : ''}" data-act="maskTool">${LM.icon('pen')}Dibujar máscara</button>
         <button class="btn sm" data-act="maskEllipse" title="Máscara redonda que sigue la perspectiva">${LM.icon('pattern')}Elipse</button>
         <button class="btn sm" data-act="maskRect" title="Máscara con la forma actual (para editarla punto a punto)">${LM.icon('quad')}Contorno</button>
         <button class="btn sm danger" data-act="maskClear" ${s.masks.length ? '' : 'disabled'}>${LM.icon('trash')}Quitar todas</button>
       </div>
       <div class="row">${check('surface:maskInvert', 'Invertir (agujero)')}</div>
       <div class="note">La máscara recorta lo que se ve: solo se proyecta dentro de ella. Varias máscaras superpuestas crean huecos. En modo máscara: clic en el borde añade un punto, clic derecho lo borra.</div>`,
      s.masks.length > 0 || store.ui.tool === 'mask');
    return html;
  }

  function projectInspector() {
    const p = store.project;
    const cur = p.output.width + 'x' + p.output.height;
    const known = PRESETS.some(([v]) => v === cur);
    let html = '<div class="insp-title"><b>Proyecto</b></div>';
    html += sec('steps', 'Primeros pasos', `<ol class="steps">
        <li>Conecta el proyector como <b>pantalla extendida</b> y pulsa <b>Proyectar</b>. Pon esa ventana a pantalla completa en el proyector (doble clic).</li>
        <li>Añade un <b>Plano</b> por cada cara del objeto y arrastra sus esquinas hasta que encajen en la realidad.</li>
        <li>Usa <b>Malla</b> para superficies curvas y <b>Máscara</b> o <b>Dibujar</b> para formas irregulares.</li>
        <li><b>Importa</b> tus imágenes o vídeos y arrástralos sobre cada superficie.</li>
        <li>Desactiva <b>Guías</b> y… ¡a disfrutar del show! Guarda el proyecto para llevártelo.</li>
      </ol><div class="row"><button class="btn sm" data-act="help">${LM.icon('help')}Guía completa y atajos</button></div>`);
    html += sec('output', 'Salida (proyector)',
      `<label class="field wide"><span>Resolución</span><select id="outPreset">${PRESETS.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('')}${known ? '' : `<option value="${cur}" selected>${p.output.width} × ${p.output.height} · personalizada</option>`}</select></label>
       <div class="row2">
         <label class="field wide" style="grid-template-columns:40px 1fr"><span>Ancho</span><input type="number" min="16" max="16384" data-k="output:width"></label>
         <label class="field wide" style="grid-template-columns:40px 1fr"><span>Alto</span><input type="number" min="16" max="16384" data-k="output:height"></label>
       </div>
       <div class="row">${check('output:auto', 'Usar la resolución del proyector al conectarlo')}</div>
       <div class="note">El mapeo se guarda en proporción a la salida, así que funciona con cualquier resolución con la misma forma.</div>`);
    html += sec('grid', 'Rejilla, imán y guías',
      `<label class="field wide"><span>Rejilla (px)</span><input type="number" min="2" max="1000" data-k="settings:gridSize"></label>
       <div class="row">${check('settings:showGrid', 'Ver rejilla')}${check('settings:snapGrid', 'Ajustar a rejilla')}</div>
       <div class="row">${check('settings:snapPoints', 'Imán entre esquinas')}${check('settings:guidesOnOutput', 'Guías en el proyector')}</div>`);
    const bytes = p.media.reduce((a, m) => a + (m.size || 0), 0);
    html += sec('files', 'Archivos',
      `<div class="note">${p.media.length} medio(s) · ${LM.fmtBytes(bytes) || '0 B'} guardados en este navegador.</div>
       <div class="row2">
         <button class="btn sm" data-act="save">${LM.icon('save')}Guardar .luzmap</button>
         <button class="btn sm" data-act="open">${LM.icon('folder')}Abrir…</button>
         <button class="btn sm" data-act="exportJson" title="Solo el mapeo, sin medios (archivo pequeño)">${LM.icon('save')}Solo mapeo .json</button>
         <button class="btn sm danger" data-act="new">${LM.icon('file')}Proyecto nuevo</button>
       </div>`);
    return html;
  }

  document.addEventListener('change', (e) => {
    if (e.target.id === 'outPreset') {
      const [w, h] = e.target.value.split('x').map(Number);
      store.mutate((p) => { p.output.width = w; p.output.height = h; p.output.auto = false; }, { structural: true });
      return;
    }
    const mk = e.target.dataset && e.target.dataset.mesh;
    if (mk) {
      const s = store.selected;
      if (!s) return;
      const v = LM.clamp(parseInt(e.target.value, 10) || 1, 1, 12);
      store.mutate(() => {
        const cols = mk === 'cols' ? v : s.mesh.cols;
        const rows = mk === 'rows' ? v : s.mesh.rows;
        s.mesh = LM.Geom.resampleMesh(s.mesh, cols, rows);
      }, { structural: true });
      inspForce = true;
      scheduleRefresh();
    }
  });

  // tiempo del vídeo
  setInterval(() => {
    const el = $('#vidTime');
    if (!el) return;
    const s = store.selected;
    const c = s && LM.State.contentIn(store.project, store.project.activeScene, s.id);
    const it = c && media.get(c.source.mediaId);
    if (!it || it.kind !== 'video') { el.textContent = ''; return; }
    el.textContent = LM.fmtTime(it.el.currentTime) + ' / ' + LM.fmtTime(it.el.duration);
    const meta = store.project.media.find((m) => m.id === it.id);
    const btn = $('#vidPlay');
    const want = meta && meta.paused ? 'play' : 'pause';
    if (btn && btn.dataset.ic !== want) { btn.innerHTML = LM.icon(want); btn.dataset.ic = want; }
  }, 250);

  /* ---------- Barra superior y estado ---------- */
  function refreshTopbar() {
    const p = store.project;
    $$('[data-toggle]').forEach((b) => b.classList.toggle('on', !!LM.getPath(p, b.dataset.toggle)));
    $$('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === store.ui.tool));
    $('[data-act="undo"]').disabled = !store.undoStack.length;
    $('[data-act="redo"]').disabled = !store.redoStack.length;
    const hints = {
      edit: 'Arrastra las esquinas numeradas para encajar la superficie · arrastra el interior para moverla · flechas para afinar',
      mask: store.selected ? 'Haz clic alrededor de la zona a mostrar · cierra en el primer punto o con Intro · clic en un borde añade punto · clic derecho borra' : 'Selecciona una superficie para añadirle una máscara',
      draw: 'Haz clic alrededor del objeto real para dibujar su contorno · cierra en el primer punto, con doble clic o Intro',
    };
    $('#toolHint').textContent = hints[store.ui.tool] || '';
  }

  function ratioLabel(w, h) {
    const r = w / h;
    const known = [[16 / 9, '16:9'], [16 / 10, '16:10'], [4 / 3, '4:3'], [21 / 9, '21:9'], [1, '1:1'], [5 / 4, '5:4']];
    const k = known.find(([v]) => Math.abs(v - r) < 0.01);
    return k ? k[1] : r.toFixed(2) + ':1';
  }

  function refreshStatus() {
    const p = store.project;
    $('#stOutput').textContent = `Salida ${p.output.width}×${p.output.height} (${ratioLabel(p.output.width, p.output.height)})`;
    const on = projectorConnected();
    $('#stProjector').innerHTML = `<span class="dot ${on ? 'on' : ''}"></span>${on ? 'Proyector conectado' : 'Proyector sin abrir'}`;
    $('[data-act="output"]').classList.toggle('on', on);
  }
  stage.on('fps', (f) => { $('#stFps').textContent = f + ' fps'; });

  $('#projectName').addEventListener('input', (e) => {
    const v = e.target.value;
    store.mutate((p) => { p.name = v || 'Sin nombre'; }, { key: 'name' });
  });

  /* ---------- Archivos de proyecto ---------- */
  const safeName = (s) => (String(s || 'proyecto').replace(/[^\w\- áéíóúñÁÉÍÓÚÑ]+/g, '').trim() || 'proyecto').replace(/\s+/g, '_');

  async function saveProject() {
    toast('Preparando el archivo…');
    try {
      const { blob, missing } = await LM.ProjectFile.build(store.project, async (id) => {
        const it = media.info(id);
        return (it && it.blob) || LM.DB.get(id);
      });
      LM.downloadBlob(blob, safeName(store.project.name) + '.luzmap');
      toast(`Proyecto guardado (${LM.fmtBytes(blob.size)}).` + (missing ? ` Atención: faltan ${missing} medio(s) que no se pudieron incluir.` : ''), !!missing);
    } catch (e) {
      toast('No se pudo guardar: ' + e.message, true);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ app: 'luzmap', version: 1, project: store.project }, null, 1)], { type: 'application/json' });
    LM.downloadBlob(blob, safeName(store.project.name) + '.json');
  }

  async function gcDB() {
    const keep = new Set(store.project.media.map((m) => m.id));
    const keys = await LM.DB.keys();
    (keys || []).forEach((k) => { if (!keep.has(k)) LM.DB.del(k); });
  }

  async function openProject(file) {
    try {
      const { project, files } = await LM.ProjectFile.parse(file);
      if (!project || !Array.isArray(project.surfaces)) throw new Error('el archivo no es un proyecto de LuzMap');
      const metas = new Map((project.media || []).map((m) => [m.id, m]));
      for (const f of files) {
        try { await LM.DB.put(f.id, f.blob); } catch (e) { /* sin persistencia */ }
        const meta = metas.get(f.id);
        if (meta) media.provide(meta, f.blob);
      }
      store.setProject(project);
      store.setUI({ selectedId: null, point: null, draft: null, tool: 'edit' });
      sendState(true);
      gcDB();
      const missing = (project.media || []).length - files.length;
      toast(`Proyecto «${store.project.name}» abierto.` + (missing > 0 ? ` Faltan ${missing} medio(s): haz clic en ellos para volver a vincularlos.` : ''), missing > 0);
    } catch (e) {
      toast('No se pudo abrir el archivo: ' + e.message, true);
    }
  }
  $('#fileProject').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) openProject(f);
  });

  function newProject() {
    if (!confirm('¿Empezar un proyecto nuevo? Se borrará el actual de este navegador (guárdalo antes si lo quieres conservar).')) return;
    store.setProject(LM.State.newProject());
    store.setUI({ selectedId: null, point: null, draft: null, tool: 'edit' });
    sendState(true);
    gcDB();
  }

  /* ---------- Pantalla completa en esta ventana ---------- */
  function toggleFullscreen() {
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (!stageHost.requestFullscreen) { toast('Este navegador no permite la pantalla completa.', true); return; }
    stageHost.requestFullscreen({ navigationUI: 'hide' }).then(() => {
      if (IS_MOBILE && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    }).catch(() => toast('No se pudo activar la pantalla completa.', true));
  }

  /** A pantalla completa, la salida es esta pantalla: adopta su resolución (también al girar el móvil). */
  function adoptFullscreenSize() {
    if (document.fullscreenElement !== stageHost || !store.project.output.auto) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
    if (w < 100 || h < 100) return;
    if (w !== store.project.output.width || h !== store.project.output.height) store.mutate((p) => { p.output.width = w; p.output.height = h; }, { checkpoint: false });
  }
  window.addEventListener('resize', adoptFullscreenSize);
  document.addEventListener('fullscreenchange', () => {
    const fs = document.fullscreenElement === stageHost;
    stage.fill = fs;
    adoptFullscreenSize();
    setTimeout(adoptFullscreenSize, 400);
    stage.layout();
    keepAwake();
    if (fs) badge(IS_MOBILE ? 'Pantalla completa · gesto Atrás para salir · mueve las esquinas con el dedo' : 'Pantalla completa · Esc para salir · G muestra u oculta las guías');
  });

  /* ---------- Que la pantalla no se apague durante el show ---------- */
  let wakeLock = null;
  async function keepAwake() {
    if (wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { /* no disponible o sin permiso */ }
  }
  document.addEventListener('visibilitychange', keepAwake);
  window.addEventListener('pointerdown', keepAwake);

  /* ---------- Acciones ---------- */
  function videoMetaOfSelection() {
    const s = store.selected;
    const c = s && LM.State.contentIn(store.project, store.project.activeScene, s.id);
    return c && c.source.type === 'media' ? store.project.media.find((m) => m.id === c.source.mediaId && m.kind === 'video') : null;
  }

  function toggleAllVideos() {
    const vids = store.project.media.filter((m) => m.kind === 'video');
    if (!vids.length) return;
    const anyPlaying = vids.some((m) => !m.paused);
    store.mutate(() => vids.forEach((m) => { m.paused = anyPlaying; }), { checkpoint: false });
    toast(anyPlaying ? 'Vídeos en pausa' : 'Vídeos en reproducción');
  }

  async function detectCameras() {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
      const devs = await navigator.mediaDevices.enumerateDevices();
      tmp.getTracks().forEach((t) => t.stop());
      cameraList = devs.filter((d) => d.kind === 'videoinput');
      toast(cameraList.length + ' cámara(s) encontrada(s).');
      inspForce = true;
      scheduleRefresh();
    } catch (e) {
      toast('No se pudo acceder a la cámara: ' + e.message, true);
    }
  }

  const ACTIONS = {
    new: newProject,
    open: () => $('#fileProject').click(),
    save: saveProject,
    exportJson,
    undo: () => store.undo(),
    redo: () => store.redo(),
    output: openOutput,
    fullscreen: toggleFullscreen,
    help: () => $('#helpDialog').showModal(),
    closeHelp: () => $('#helpDialog').close(),
    addQuad: () => addSurface(false),
    addMesh: () => addSurface(true),
    toolDraw: () => { store.setUI({ tool: 'draw', draft: null }); toast('Haz clic alrededor del objeto real para dibujar su contorno.'); },
    import: () => $('#fileMedia').click(),
    addScene: () => addScene(),
    dupSurface: duplicateSurface,
    delSurface: deleteSurface,
    resetShape: () => {
      const s = store.selected;
      const p = store.project;
      const ar = p.output.width / p.output.height;
      store.mutate(() => {
        s.corners = LM.State.rectCorners(0.5, 0.5, 0.34, Math.min(0.8, 0.34 * ar * 0.75));
        s.mesh.offsets = s.mesh.offsets.map(() => [0, 0]);
      }, { structural: true });
    },
    fullShape: () => {
      const s = store.selected;
      store.mutate(() => { s.corners = [[0, 0], [1, 0], [1, 1], [0, 1]]; }, { structural: true });
    },
    rotCorners: () => rotateCorners(false),
    mirrorCorners: () => rotateCorners(true),
    meshReset: () => {
      const s = store.selected;
      store.mutate(() => { s.mesh.offsets = s.mesh.offsets.map(() => [0, 0]); }, { structural: true });
    },
    maskTool: () => {
      store.setUI({ tool: store.ui.tool === 'mask' ? 'edit' : 'mask', draft: null });
      inspForce = true;
    },
    maskEllipse: () => {
      const s = store.selected;
      store.mutate(() => { s.masks.push(LM.Geom.ellipse(s, 64)); }, { structural: true });
      toast('Máscara elíptica añadida. Pasa a la herramienta Máscara para retocar sus puntos.');
    },
    maskRect: () => {
      const s = store.selected;
      const b = LM.Geom.border(s, 4);
      store.mutate(() => { s.masks.push(b.map((q) => [q[0], q[1]])); }, { structural: true });
      store.setUI({ tool: 'mask' });
      toast('Máscara con el contorno añadida: arrastra sus puntos o haz clic en un borde para añadir más.');
    },
    maskClear: () => {
      const s = store.selected;
      if (!confirm('¿Quitar todas las máscaras de esta superficie?')) return;
      store.mutate(() => { s.masks = []; }, { structural: true });
    },
    resetAdjust: () => {
      const s = store.selected;
      store.mutate((p) => {
        const c = LM.State.content(p, s.id);
        const d = LM.State.defaultContent(c.source.type);
        Object.keys(d).forEach((k) => { if (k !== 'source') c[k] = d[k]; });
      }, { structural: true });
    },
    vidToggle: () => {
      const m = videoMetaOfSelection();
      if (m) store.mutate(() => { m.paused = !m.paused; }, { checkpoint: false });
    },
    vidRestart: () => {
      const m = videoMetaOfSelection();
      if (!m) return;
      media.seek(m.id, 0);
      setTimeout(sendVsync, 50);
    },
    camDetect: detectCameras,
    nextPoint: () => stage.interaction.key({ key: 'Tab', shiftKey: false, altKey: false }),
    nudgeStep: () => {
      nudgeStep = nudgeStep === 1 ? 10 : nudgeStep === 10 ? 0.25 : 1;
      const b = $('#nudgeStep');
      if (b) b.textContent = 'Paso: ' + nudgeStep + ' px';
    },
  };

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a && !a.disabled && ACTIONS[a.dataset.act]) {
      ACTIONS[a.dataset.act]();
      return;
    }
    const t = e.target.closest('[data-toggle]');
    if (t) {
      const path = t.dataset.toggle;
      store.mutate((p) => LM.setPath(p, path, !LM.getPath(p, path)), { key: 'toggle:' + path });
      return;
    }
    const tool = e.target.closest('[data-tool]');
    if (tool) store.setUI({ tool: tool.dataset.tool, draft: null, point: null });
  });

  let nudgeTimer = null;
  const stopNudge = () => { clearTimeout(nudgeTimer); clearInterval(nudgeTimer); nudgeTimer = null; };
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-nudge]');
    if (!b) return;
    e.preventDefault();
    const s = store.selected;
    if (!s) return;
    if (s.locked) { toast('La superficie está bloqueada.'); return; }
    const [dx, dy] = b.dataset.nudge.split(',').map(Number);
    const step = () => stage.interaction.nudge(dx * nudgeStep, dy * nudgeStep);
    step();
    stopNudge();
    nudgeTimer = setTimeout(() => { nudgeTimer = setInterval(step, 60); }, 350);
  });
  ['pointerup', 'pointercancel', 'blur'].forEach((ev) => window.addEventListener(ev, stopNudge));
  document.addEventListener('pointerout', (e) => { if (e.target.closest && e.target.closest('[data-nudge]')) stopNudge(); });

  $('#helpDialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  /* ---------- Teclado ---------- */
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (LM.isTyping(e)) {
      if (e.key === 'Escape') e.target.blur();
      // Guardar/abrir funcionan también escribiendo; deshacer se deja al campo de texto
      if (mod && (k === 's' || k === 'o')) {
        e.preventDefault();
        if (k === 's') saveProject();
        else $('#fileProject').click();
      }
      return;
    }
    if (mod) {
      let done = true;
      if (k === 'z' && !e.shiftKey) store.undo();
      else if ((k === 'z' && e.shiftKey) || k === 'y') store.redo();
      else if (k === 's') saveProject();
      else if (k === 'o') $('#fileProject').click();
      else if (k === 'd') duplicateSurface();
      else done = false;
      if (done) e.preventDefault();
      return;
    }
    if ($('#helpDialog').open) return;
    if (stage.interaction.key(e)) { e.preventDefault(); return; }
    let done = true;
    switch (k) {
      case 'v': store.setUI({ tool: 'edit', draft: null }); break;
      case 'm': store.setUI({ tool: 'mask', draft: null }); break;
      case 'd': ACTIONS.toolDraw(); break;
      case 'a': addSurface(false); break;
      case 'g': store.mutate((p) => { p.settings.guidesOnOutput = !p.settings.guidesOnOutput; }, { key: 'g' }); badge(store.project.settings.guidesOnOutput ? 'Guías visibles en el proyector' : 'Guías ocultas', 1500); break;
      case 't': store.mutate((p) => { p.settings.testPattern = !p.settings.testPattern; }, { key: 't' }); break;
      case 'b': store.mutate((p) => { p.settings.blackout = !p.settings.blackout; }, { key: 'b' }); badge(store.project.settings.blackout ? 'Proyección en negro' : 'Proyección activa', 1500); break;
      case 'p': openOutput(); break;
      case 'f': toggleFullscreen(); break;
      case '?': case 'h': ACTIONS.help(); break;
      case ' ': toggleAllVideos(); break;
      case 'delete': case 'backspace': deleteSurface(); break;
      default:
        if (/^[1-9]$/.test(k)) {
          const sc = store.project.scenes[+k - 1];
          if (sc) setScene(sc.id);
        } else done = false;
    }
    if (done) e.preventDefault();
  });

  /* ---------- Inicio ---------- */
  media.sync(store.project);
  gcDB().catch(() => {});
  refresh();
  keepAwake();
  if (!store.project.surfaces.length && !loadLocal()) {
    setTimeout(() => toast('¡Bienvenido! Pulsa «Proyectar» y añade un plano para empezar. La ayuda (?) explica todo paso a paso.'), 600);
  }
  if (window.location.protocol.startsWith('http') && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
