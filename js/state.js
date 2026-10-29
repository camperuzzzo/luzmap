/* LuzMap — modelo de datos del proyecto */
(function () {
  'use strict';
  const LM = window.LM;

  const VERSION = 1;

  const DEFAULT_SETTINGS = {
    guidesOnOutput: true, // mostrar contornos y puntos en el proyector mientras se mapea
    testPattern: false, // patrón de prueba en todas las superficies
    master: 1, // brillo general
    blackout: false,
    showGrid: false,
    gridSize: 40, // píxeles de salida
    snapGrid: false,
    snapPoints: true,
  };

  const DEFAULT_TEXT = {
    value: '¡Hola!',
    font: 'system-ui, sans-serif',
    size: 0.45, // relativo a la altura de la superficie
    bold: true,
    color: '#ffffff',
    bg: '#000000',
    bgOn: false,
    align: 'center',
    scroll: 0, // velocidad de desplazamiento horizontal (marquesina)
  };

  function defaultSource(type) {
    return {
      type: type || 'pattern',
      mediaId: null,
      color: '#ff9f1c',
      color2: '#3a86ff',
      generator: 'plasma',
      speed: 1,
      param: 0.5,
      deviceId: '',
      text: LM.clone(DEFAULT_TEXT),
    };
  }

  function defaultContent(type) {
    return {
      source: defaultSource(type),
      fit: 'stretch', // stretch | contain | cover | tile
      zoom: 1,
      rotation: 0,
      offsetX: 0,
      offsetY: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      brightness: 0,
      contrast: 1,
      saturation: 1,
      hue: 0,
    };
  }

  function emptyMesh(cols = 3, rows = 3) {
    const offsets = [];
    for (let i = 0; i < (cols + 1) * (rows + 1); i++) offsets.push([0, 0]);
    return { enabled: false, cols, rows, offsets };
  }

  function rectCorners(cx, cy, w, h) {
    return [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
  }

  function newScene(name) {
    return { id: LM.uid('sc'), name: name || 'Escena 1', duration: 0, contents: {} };
  }

  function newProject() {
    const scene = newScene('Escena 1');
    return {
      version: VERSION,
      name: 'Mi proyecto de mapping',
      output: { width: 1920, height: 1080, auto: true },
      settings: LM.clone(DEFAULT_SETTINGS),
      surfaces: [],
      media: [],
      scenes: [scene],
      activeScene: scene.id,
      playlist: { autoplay: false, transition: 1 },
    };
  }

  /**
   * Crea una superficie. opts: { corners, name, mesh(bool), masks, sourceType }
   * Se añade al proyecto con contenido por defecto en todas las escenas.
   */
  function addSurface(project, opts = {}) {
    const n = project.surfaces.length;
    const ar = project.output.width / project.output.height;
    const w = 0.34, h = Math.min(0.8, w * ar * 0.75);
    const shift = (n % 6) * 0.03;
    const s = {
      id: LM.uid('s'),
      name: opts.name || 'Superficie ' + (n + 1),
      color: LM.SURFACE_COLORS[n % LM.SURFACE_COLORS.length],
      visible: true,
      locked: false,
      corners: opts.corners || rectCorners(0.5 - 0.06 + shift, 0.5 - 0.04 + shift, w, h),
      mesh: emptyMesh(4, 4),
      masks: opts.masks || [],
      maskInvert: false,
      feather: 0,
      blend: 'normal',
    };
    if (opts.mesh) s.mesh.enabled = true;
    project.surfaces.push(s);
    project.scenes.forEach((sc) => {
      sc.contents[s.id] = defaultContent(opts.sourceType || 'pattern');
      if (opts.mediaId) {
        sc.contents[s.id].source.type = 'media';
        sc.contents[s.id].source.mediaId = opts.mediaId;
      }
    });
    return s;
  }

  function activeScene(project) {
    return project.scenes.find((s) => s.id === project.activeScene) || project.scenes[0];
  }

  /** Contenido editable de una superficie en la escena activa (lo crea si falta). */
  function content(project, surfaceId) {
    const sc = activeScene(project);
    if (!sc.contents[surfaceId]) sc.contents[surfaceId] = defaultContent('none');
    return sc.contents[surfaceId];
  }

  function contentIn(project, sceneId, surfaceId) {
    const sc = project.scenes.find((s) => s.id === sceneId);
    return sc ? sc.contents[surfaceId] || null : null;
  }

  function mergeDefaults(target, defaults) {
    Object.keys(defaults).forEach((k) => {
      if (target[k] === undefined || target[k] === null) target[k] = LM.clone(defaults[k]);
      else if (typeof defaults[k] === 'object' && !Array.isArray(defaults[k]) && defaults[k] !== null && typeof target[k] === 'object') mergeDefaults(target[k], defaults[k]);
    });
    return target;
  }

  /** Completa campos que falten (proyectos antiguos o importados). */
  function normalize(p) {
    if (!p || typeof p !== 'object') return newProject();
    const base = newProject();
    p.version = VERSION;
    p.name = p.name || base.name;
    p.output = mergeDefaults(p.output || {}, base.output);
    p.settings = mergeDefaults(p.settings || {}, DEFAULT_SETTINGS);
    p.playlist = mergeDefaults(p.playlist || {}, base.playlist);
    p.surfaces = Array.isArray(p.surfaces) ? p.surfaces : [];
    p.media = Array.isArray(p.media) ? p.media : [];
    p.scenes = Array.isArray(p.scenes) && p.scenes.length ? p.scenes : base.scenes;
    p.surfaces.forEach((s, i) => {
      s.id = s.id || LM.uid('s');
      s.name = s.name || 'Superficie ' + (i + 1);
      s.color = s.color || LM.SURFACE_COLORS[i % LM.SURFACE_COLORS.length];
      if (s.visible === undefined) s.visible = true;
      s.locked = !!s.locked;
      if (!Array.isArray(s.corners) || s.corners.length !== 4) s.corners = rectCorners(0.5, 0.5, 0.3, 0.3);
      if (!s.mesh || !Array.isArray(s.mesh.offsets)) s.mesh = emptyMesh(4, 4);
      if (s.mesh.offsets.length !== (s.mesh.cols + 1) * (s.mesh.rows + 1)) s.mesh = emptyMesh(s.mesh.cols || 4, s.mesh.rows || 4);
      s.masks = Array.isArray(s.masks) ? s.masks.filter((m) => Array.isArray(m) && m.length >= 3) : [];
      s.maskInvert = !!s.maskInvert;
      s.feather = +s.feather || 0;
      s.blend = s.blend || 'normal';
    });
    p.scenes.forEach((sc, i) => {
      sc.id = sc.id || LM.uid('sc');
      sc.name = sc.name || 'Escena ' + (i + 1);
      sc.duration = +sc.duration || 0;
      sc.contents = sc.contents || {};
      Object.keys(sc.contents).forEach((sid) => {
        const c = sc.contents[sid];
        mergeDefaults(c, defaultContent(c && c.source ? c.source.type : 'none'));
        mergeDefaults(c.source, defaultSource(c.source.type));
      });
    });
    if (!p.scenes.find((s) => s.id === p.activeScene)) p.activeScene = p.scenes[0].id;
    p.media.forEach((m) => {
      mergeDefaults(m, { loop: true, muted: true, volume: 1, speed: 1, paused: false });
    });
    return p;
  }

  LM.State = {
    VERSION, DEFAULT_SETTINGS, DEFAULT_TEXT, defaultSource, defaultContent, emptyMesh, rectCorners,
    newScene, newProject, addSurface, activeScene, content, contentIn, normalize,
  };

  /* ---------- Almacén con deshacer/rehacer ---------- */
  class Store extends LM.Emitter {
    constructor(project) {
      super();
      this.project = normalize(project || newProject());
      this.ui = { selectedId: null, tool: 'edit', point: null, draft: null };
      this.undoStack = [];
      this.redoStack = [];
      this._lastKey = null;
      this._lastTime = 0;
    }

    /** Guarda un punto de deshacer. Con `key`, cambios seguidos (sliders) se agrupan. */
    checkpoint(key) {
      const now = Date.now();
      if (key && key === this._lastKey && now - this._lastTime < 1500) {
        this._lastTime = now;
        return;
      }
      this.undoStack.push(JSON.stringify(this.project));
      if (this.undoStack.length > 120) this.undoStack.shift();
      this.redoStack.length = 0;
      this._lastKey = key || null;
      this._lastTime = now;
    }

    mutate(fn, opts = {}) {
      if (opts.checkpoint !== false) this.checkpoint(opts.key);
      fn(this.project);
      this.changed(opts.source || 'local', opts);
    }

    changed(source = 'local', opts = {}) {
      this.emit('change', { source, structural: !!opts.structural });
    }

    setProject(p, source = 'local', keepHistory = false) {
      this.project = normalize(p);
      if (!keepHistory) { this.undoStack = []; this.redoStack = []; }
      this._validateUI();
      this.changed(source, { structural: true });
      if (source === 'local') this.emit('ui', { source });
    }

    applyRemote(p) {
      this.checkpoint('remote');
      this.project = normalize(p);
      this._validateUI();
      this.changed('remote', { structural: true });
    }

    undo() {
      if (!this.undoStack.length) return false;
      this.redoStack.push(JSON.stringify(this.project));
      this.project = normalize(JSON.parse(this.undoStack.pop()));
      this._lastKey = null;
      this._validateUI();
      this.changed('local', { structural: true });
      this.emit('ui', { source: 'local' });
      return true;
    }

    redo() {
      if (!this.redoStack.length) return false;
      this.undoStack.push(JSON.stringify(this.project));
      this.project = normalize(JSON.parse(this.redoStack.pop()));
      this._lastKey = null;
      this._validateUI();
      this.changed('local', { structural: true });
      this.emit('ui', { source: 'local' });
      return true;
    }

    setUI(patch, source = 'local') {
      Object.assign(this.ui, patch);
      this._validateUI();
      this.emit('ui', { source });
    }

    _validateUI() {
      const ui = this.ui;
      if (ui.selectedId && !this.surface(ui.selectedId)) {
        ui.selectedId = null;
        ui.point = null;
      }
    }

    surface(id) {
      return this.project.surfaces.find((s) => s.id === id) || null;
    }

    get selected() {
      return this.surface(this.ui.selectedId);
    }
  }
  LM.Store = Store;
})();
