/* LuzMap — ventana de salida para el proyector */
(function () {
  'use strict';
  const LM = window.LM;
  const $ = (s) => document.querySelector(s);

  let initial = null;
  try { initial = JSON.parse(localStorage.getItem('luzmap.project.v1') || 'null'); } catch (e) { /* sin datos */ }

  const store = new LM.Store(initial || undefined);
  const link = new LM.Link('output');

  // Los medios se leen del almacenamiento del navegador; si no están, se piden al editor
  const pending = new Map();
  function requestFromEditor(id) {
    return new Promise((resolve) => {
      pending.set(id, resolve);
      link.send('needMedia', { id });
      setTimeout(() => {
        if (pending.get(id) === resolve) { pending.delete(id); resolve(null); }
      }, 20000);
    });
  }
  const media = new LM.MediaRuntime({
    role: 'output',
    fetchBlob: async (id) => (await LM.DB.get(id)) || requestFromEditor(id),
  });

  const stage = new LM.Stage({ host: $('#out'), store, media, role: 'output' });
  media.sync(store.project);

  const size = () => ({ w: Math.round(window.innerWidth * (window.devicePixelRatio || 1)), h: Math.round(window.innerHeight * (window.devicePixelRatio || 1)) });

  let gotState = false;
  let lastRetry = 0;
  link.on('state', (m) => {
    gotState = true;
    store.setProject(m.project, 'remote', true);
    media.sync(store.project);
    if (Date.now() - lastRetry > 5000) { lastRetry = Date.now(); media.retryMissing(store.project); }
    updateMsg();
  });
  link.on('ui', (m) => store.setUI(m.ui, 'remote'));
  link.on('vsync', (m) => media.applySync(m.list || [], store.project));
  link.on('media', (m) => {
    const r = pending.get(m.id);
    if (r) { pending.delete(m.id); r(m.blob); } else if (m.meta && m.blob) media.provide(m.meta, m.blob);
  });

  // Ediciones hechas directamente sobre la proyección → al editor
  let stateTimer = null;
  store.on('change', (e) => {
    if (e.source !== 'local') return;
    if (stateTimer) return;
    stateTimer = setTimeout(() => { stateTimer = null; link.send('state', { project: store.project }); }, 16);
  });
  store.on('ui', (e) => {
    if (e.source === 'local') link.send('ui', { ui: { selectedId: store.ui.selectedId, tool: store.ui.tool, point: store.ui.point, draft: store.ui.draft } });
  });

  link.send('hello', size());
  setInterval(() => link.send('ping', size()), 1500);
  window.addEventListener('resize', () => link.send('ping', size()));

  /* ---------- Pantalla completa, mensajes y cursor ---------- */
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  const msg = $('#outMsg');
  let msgTimer = null;
  function updateMsg() {
    const fs = !!document.fullscreenElement;
    if (fs) {
      msg.classList.add('hide');
      return;
    }
    $('#outMsgText').innerHTML = gotState
      ? 'Mueve esta ventana a la pantalla del proyector y haz <strong>doble clic</strong> (o pulsa <strong>F</strong>) para ponerla a pantalla completa.'
      : 'Esperando al editor… Abre LuzMap en otra ventana y pulsa <strong>Proyectar</strong>.';
    msg.classList.remove('hide');
    clearTimeout(msgTimer);
    if (gotState) msgTimer = setTimeout(() => msg.classList.add('hide'), 9000);
  }
  document.addEventListener('fullscreenchange', () => { updateMsg(); link.send('ping', size()); });
  updateMsg();
  setTimeout(updateMsg, 2500);

  stage.ovc.addEventListener('dblclick', () => {
    if (!store.ui.draft || !store.ui.draft.points.length) toggleFullscreen();
  });
  // sin guías, el doble clic sobre la imagen también sirve
  document.addEventListener('dblclick', (e) => { if (e.target === document.body || e.target === msg) toggleFullscreen(); });

  window.addEventListener('keydown', (e) => {
    if (stage.interaction.key(e)) { e.preventDefault(); return; }
    const k = e.key.toLowerCase();
    if (k === 'f') toggleFullscreen();
  });

  let idle = null;
  function wake() {
    document.body.classList.remove('nocursor');
    clearTimeout(idle);
    idle = setTimeout(() => { if (!store.project.settings.guidesOnOutput) document.body.classList.add('nocursor'); }, 1500);
  }
  window.addEventListener('pointermove', wake);
  wake();

  // que la pantalla no se apague durante el show
  let wakeLock = null;
  async function keepAwake() {
    if (wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { /* no disponible */ }
  }
  document.addEventListener('visibilitychange', keepAwake);
  document.addEventListener('fullscreenchange', keepAwake);
  window.addEventListener('pointerdown', keepAwake);
  keepAwake();

  LM.app = { store, media, stage, link };
})();
