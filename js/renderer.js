/* LuzMap — motor de render WebGL: perspectiva, malla, máscaras, efectos y fundidos */
(function () {
  'use strict';
  const LM = window.LM;
  const Geom = LM.Geom;

  const VS = `
attribute vec2 a_pos;
attribute float a_w;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4((a_pos.x * 2.0 - 1.0) * a_w, (1.0 - a_pos.y * 2.0) * a_w, 0.0, a_w);
}`;

  const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform int u_mode;
uniform mat3 u_uvm;
uniform vec2 u_wrap;
uniform vec3 u_color;
uniform vec3 u_color2;
uniform float u_speed;
uniform float u_param;
uniform float u_time;
uniform float u_aspect;
uniform float u_opacity;
uniform float u_bright;
uniform float u_contrast;
uniform float u_sat;
uniform float u_hue;
uniform float u_feather;
uniform float u_master;

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

vec3 hueShift(vec3 col, float h) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * col;
  float hue = atan(yiq.z, yiq.y) + h;
  float chroma = length(yiq.yz);
  return toRGB * vec3(yiq.x, chroma * cos(hue), chroma * sin(hue));
}

vec4 generator(int mode, vec2 uv) {
  float t = u_time * u_speed;
  vec2 p = vec2((uv.x - 0.5) * u_aspect, uv.y - 0.5);
  if (mode == 3) { // plasma
    float s = 2.0 + u_param * 14.0;
    vec2 q = p * s;
    float v = sin(q.x + t) + sin((q.y + t) * 0.5) + sin((q.x + q.y + t) * 0.5);
    vec2 c = q + vec2(sin(t / 3.0), cos(t / 2.0)) * s * 0.5;
    v += sin(sqrt(c.x * c.x + c.y * c.y + 1.0) + t);
    return vec4(mix(u_color, u_color2, 0.5 + 0.5 * sin(v * 3.14159)), 1.0);
  }
  if (mode == 4) { // degradado
    float k = 0.5 + 0.5 * sin((uv.x + uv.y) * 3.14159 * (0.5 + u_param * 3.0) - t * 1.5);
    return vec4(mix(u_color, u_color2, k), 1.0);
  }
  if (mode == 5) { // franjas
    float n = 2.0 + u_param * 30.0;
    float k = step(0.5, fract((p.x + p.y) * n * 0.5 - t * 0.5));
    return vec4(mix(u_color, u_color2, k), 1.0);
  }
  if (mode == 6) { // arcoíris
    float h = fract((p.x * 0.5 + p.y * 0.25) * (0.5 + u_param * 2.0) - t * 0.1);
    return vec4(hsv2rgb(vec3(h, 0.9, 1.0)), 1.0);
  }
  if (mode == 7) { // bordes de neón
    float e = min(min(uv.x, 1.0 - uv.x) * u_aspect, min(uv.y, 1.0 - uv.y));
    float w = 0.004 + u_param * 0.08;
    float core = 1.0 - smoothstep(w * 0.4, w, e);
    float halo = exp(-e / (w * 1.5)) * 0.9;
    float pulse = 0.75 + 0.25 * sin(t * 3.0);
    float a = clamp(core + halo, 0.0, 1.0) * pulse;
    return vec4(mix(u_color, vec3(1.0), core * 0.5), a);
  }
  if (mode == 8) { // pulso
    float k = pow(0.5 + 0.5 * sin(t * 2.0), 1.0 + u_param * 3.0);
    return vec4(mix(u_color2, u_color, k), 1.0);
  }
  if (mode == 9) { // barrido
    float pos = fract(t * 0.25);
    float w = 0.02 + u_param * 0.25;
    float d = abs(uv.y - pos);
    d = min(d, 1.0 - d);
    return vec4(mix(u_color2, u_color, exp(-(d * d) / (w * w))), 1.0);
  }
  return vec4(0.0);
}

void main() {
  vec4 col;
  if (u_mode == 1) {
    vec2 q = (u_uvm * vec3(v_uv, 1.0)).xy;
    if (u_wrap.x > 0.5) q.x = fract(q.x);
    if (u_wrap.y > 0.5) q.y = fract(q.y);
    if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) col = vec4(0.0);
    else col = texture2D(u_tex, q);
  } else if (u_mode == 2) {
    col = vec4(u_color, 1.0);
  } else {
    col = generator(u_mode, v_uv);
  }
  vec3 c = (col.rgb - 0.5) * u_contrast + 0.5 + u_bright;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, u_sat);
  if (abs(u_hue) > 0.001) c = hueShift(c, u_hue);
  c = clamp(c, 0.0, 1.0);
  float a = col.a * u_opacity;
  if (u_feather > 0.0) {
    float e = min(min(v_uv.x, 1.0 - v_uv.x) * u_aspect, min(v_uv.y, 1.0 - v_uv.y));
    a *= smoothstep(0.0, u_feather, e);
  }
  gl_FragColor = vec4(c * a * u_master, a);
}`;

  const MASK_VS = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos.x * 2.0 - 1.0, 1.0 - a_pos.y * 2.0, 0.0, 1.0); }`;
  const MASK_FS = `
precision mediump float;
void main() { gl_FragColor = vec4(1.0); }`;

  const GENERATORS = {
    plasma: { mode: 3, label: 'Plasma' },
    gradient: { mode: 4, label: 'Degradado' },
    stripes: { mode: 5, label: 'Franjas' },
    rainbow: { mode: 6, label: 'Arcoíris' },
    neon: { mode: 7, label: 'Bordes de neón' },
    pulse: { mode: 8, label: 'Pulso' },
    scan: { mode: 9, label: 'Barrido' },
  };
  LM.GENERATORS = GENERATORS;

  const PATTERN_CONTENT = LM.State.defaultContent('pattern');

  /** Matriz uv de la superficie → uv de la textura (encaje, zoom, giro, desplazamiento, espejo). */
  function uvMatrix(c, As, At, fit, scrollX) {
    let Tw, Th;
    if (fit === 'contain') { Th = Math.min(1, As / At); Tw = Th * At; }
    else if (fit === 'cover') { Th = Math.max(1, As / At); Tw = Th * At; }
    else if (fit === 'tile') { Th = 1; Tw = At; }
    else { Tw = As; Th = 1; }
    const z = Math.max(0.01, +c.zoom || 1);
    const th = ((+c.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(th), sin = Math.sin(th);
    const px0 = -As * (0.5 + (+c.offsetX || 0));
    const py0 = -(0.5 + (+c.offsetY || 0));
    let a = (cos * As) / (z * Tw), cc = sin / (z * Tw), e = (cos * px0 + sin * py0) / (z * Tw) + 0.5 + (scrollX || 0);
    let b = (-sin * As) / (z * Th), d = cos / (z * Th), f = (-sin * px0 + cos * py0) / (z * Th) + 0.5;
    if (c.flipX) { a = -a; cc = -cc; e = 1 - e; }
    if (c.flipY) { b = -b; d = -d; f = 1 - f; }
    return new Float32Array([a, b, 0, cc, d, 0, e, f, 1]);
  }

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  function program(gl, vs, fs, attribs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    attribs.forEach((name, i) => gl.bindAttribLocation(p, i, name));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  class Renderer {
    constructor(canvas, media) {
      this.canvas = canvas;
      this.media = media;
      this.frame = 0;
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
      canvas.addEventListener('webglcontextrestored', () => this.init());
      this.init();
    }

    init() {
      const opts = { alpha: false, antialias: true, stencil: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
      const c = this.canvas;
      const gl = (this.gl = c.getContext('webgl2', opts) || c.getContext('webgl', opts) || c.getContext('experimental-webgl', opts));
      this.geo = new Map();
      this.textures = new Map();
      if (!gl) { this.failed = true; return; }
      this.lost = false;
      this.main = program(gl, VS, FS, ['a_pos', 'a_w', 'a_uv']);
      this.mask = program(gl, MASK_VS, MASK_FS, ['a_pos']);
      this.maskBuf = gl.createBuffer();
      const attrs = gl.getContextAttributes();
      this.hasStencil = !!(attrs && attrs.stencil);
      this.media.maxTex = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }

    geometry(s) {
      const key = JSON.stringify([s.corners, s.mesh.enabled ? [s.mesh.cols, s.mesh.rows, s.mesh.offsets] : 0]);
      let g = this.geo.get(s.id);
      if (g && g.key === key) { g.used = this.frame; return g; }
      const gl = this.gl;
      const data = Geom.buildGrid(s);
      if (!g) g = { pos: gl.createBuffer(), w: gl.createBuffer(), uv: gl.createBuffer(), idx: gl.createBuffer() };
      gl.bindBuffer(gl.ARRAY_BUFFER, g.pos); gl.bufferData(gl.ARRAY_BUFFER, data.pos, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.w); gl.bufferData(gl.ARRAY_BUFFER, data.w, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.uv); gl.bufferData(gl.ARRAY_BUFFER, data.uv, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.idx, gl.DYNAMIC_DRAW);
      g.count = data.count;
      g.key = key;
      g.used = this.frame;
      this.geo.set(s.id, g);
      return g;
    }

    /** Sube (si hace falta) una fuente a textura. version='video' → se refresca cada fotograma. */
    texture(key, el, version) {
      const gl = this.gl;
      let t = this.textures.get(key);
      if (!t) {
        t = { tex: gl.createTexture(), version: null, time: -1, frame: -1 };
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
        this.textures.set(key, t);
      }
      t.used = performance.now();
      let need;
      if (version === 'video') need = el.readyState >= 2 && t.frame !== this.frame && (el.currentTime !== t.time || t.version === null || el.srcObject);
      else need = t.version !== version;
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      if (need) {
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
          t.version = version;
          t.time = el.currentTime;
          t.frame = this.frame;
          t.ok = true;
        } catch (e) { /* fuente aún no lista */ }
      }
      return t.ok ? t : null;
    }

    gc() {
      const gl = this.gl;
      const now = performance.now();
      this.textures.forEach((t, k) => { if (now - t.used > 4000) { gl.deleteTexture(t.tex); this.textures.delete(k); } });
      this.geo.forEach((g, k) => {
        if (this.frame - g.used > 300) {
          [g.pos, g.w, g.uv, g.idx].forEach((b) => gl.deleteBuffer(b));
          this.geo.delete(k);
        }
      });
      this.media.gcCanvases();
    }

    layers(project, s, transition) {
      if (project.settings.testPattern) return [{ content: PATTERN_CONTENT, alpha: 1 }];
      const vis = (c) => c && c.source && c.source.type !== 'none' && c.opacity > 0;
      const cur = LM.State.contentIn(project, project.activeScene, s.id);
      if (transition && transition.p < 1 && transition.from !== project.activeScene) {
        const prev = LM.State.contentIn(project, transition.from, s.id);
        const a = vis(prev), b = vis(cur);
        if (a && b) return [{ content: prev, alpha: 1 }, { content: cur, alpha: transition.p }];
        if (a) return [{ content: prev, alpha: 1 - transition.p }];
        if (b) return [{ content: cur, alpha: transition.p }];
        return [];
      }
      return vis(cur) ? [{ content: cur, alpha: 1 }] : [];
    }

    render(project, opts) {
      const gl = this.gl;
      if (!gl || this.failed || this.lost || gl.isContextLost()) return;
      this.frame++;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.disable(gl.STENCIL_TEST);
      gl.colorMask(true, true, true, true);
      gl.stencilMask(0xff);
      gl.clearColor(0, 0, 0, 1);
      gl.clearStencil(0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      if (this.frame % 120 === 0) this.gc();
      const st = project.settings;
      const master = st.blackout ? 0 : LM.clamp(+st.master, 0, 1);
      if (master <= 0.001) return;
      gl.enable(gl.BLEND);
      project.surfaces.forEach((s, index) => {
        if (!s.visible) return;
        const layers = this.layers(project, s, opts.transition);
        if (!layers.length) return;
        const geo = this.geometry(s);
        const masked = this.hasStencil && s.masks.length > 0;
        if (masked) this.drawMasks(s);
        layers.forEach((l) => this.drawLayer(project, s, index, geo, l.content, l.alpha, master, opts));
        if (masked) gl.disable(gl.STENCIL_TEST);
      });
    }

    drawMasks(s) {
      const gl = this.gl;
      gl.enable(gl.STENCIL_TEST);
      gl.stencilMask(0xff);
      gl.clear(gl.STENCIL_BUFFER_BIT);
      gl.colorMask(false, false, false, false);
      gl.stencilMask(1);
      gl.stencilFunc(gl.ALWAYS, 0, 1);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
      gl.useProgram(this.mask.p);
      gl.disableVertexAttribArray(1);
      gl.disableVertexAttribArray(2);
      gl.enableVertexAttribArray(0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.maskBuf);
      s.masks.forEach((poly) => {
        if (poly.length < 3) return;
        const arr = new Float32Array(poly.length * 2);
        poly.forEach((p, i) => { arr[i * 2] = p[0]; arr[i * 2 + 1] = p[1]; });
        gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, poly.length);
      });
      gl.colorMask(true, true, true, true);
      gl.stencilFunc(gl.EQUAL, s.maskInvert ? 0 : 1, 1);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    }

    /** Resuelve la fuente de un contenido → { mode, tex, At, fit, scroll, wrap } o null. */
    resolve(project, s, index, content, opts) {
      const src = content.source;
      const outW = project.output.width, outH = project.output.height;
      const As = Geom.aspect(s, outW, outH);
      const media = this.media;
      switch (src.type) {
        case 'media': {
          const it = media.get(src.mediaId);
          if (!it || !it.w) return null;
          const tex = this.texture('m:' + it.id, it.el, it.kind === 'video' ? 'video' : it.version);
          return tex && { mode: 1, tex, At: it.w / it.h, fit: content.fit };
        }
        case 'camera': {
          const cam = media.camera(src.deviceId);
          if (!cam.ready) return null;
          const tex = this.texture('c:' + cam.key, cam.el, 'video');
          return tex && { mode: 1, tex, At: cam.w / cam.h, fit: content.fit };
        }
        case 'pattern': {
          const ph = Geom.pixelSize(s, outW, outH)[1];
          const H = LM.clamp(Math.round(ph / 128) * 128, 256, 1024);
          const ar = Math.round(As * 20) / 20;
          const W = Math.min(4096, Math.round(H * ar));
          const sig = [s.name, s.color, index, W, H].join('|');
          const cv = media.canvas('p:' + s.id, W, H, sig, (ctx, w, h) => LM.Draw.drawPattern(ctx, w, h, s, index));
          const tex = this.texture('p:' + s.id, cv.canvas, cv.version);
          return tex && { mode: 1, tex, At: W / H, fit: 'stretch' };
        }
        case 'text': {
          const t = src.text;
          const ph = Geom.pixelSize(s, outW, outH)[1];
          const H = LM.clamp(Math.round(ph / 64) * 64, 128, 768);
          const marquee = Math.abs(+t.scroll || 0) > 0.001;
          let W;
          if (marquee) W = Math.min(4096, Math.round(H * LM.Draw.marqueeAspect(t, H)));
          else W = Math.min(4096, Math.round(H * Math.round(As * 20) / 20));
          const sig = JSON.stringify([t, W, H, marquee]);
          const cv = media.canvas('t:' + s.id, W, H, sig, (ctx, w, h) => LM.Draw.drawText(ctx, w, h, t, marquee));
          const tex = this.texture('t:' + s.id, cv.canvas, cv.version);
          if (!tex) return null;
          if (marquee) return { mode: 1, tex, At: W / H, fit: 'tile', wrap: [1, 0], scroll: opts.time * t.scroll * 0.15 };
          return { mode: 1, tex, At: W / H, fit: 'stretch' };
        }
        case 'color':
          return { mode: 2 };
        case 'generator': {
          const g = GENERATORS[src.generator] || GENERATORS.plasma;
          return { mode: g.mode };
        }
        default:
          return null;
      }
    }

    drawLayer(project, s, index, geo, content, alpha, master, opts) {
      const gl = this.gl;
      const r = this.resolve(project, s, index, content, opts);
      if (!r) return;
      const As = Geom.aspect(s, project.output.width, project.output.height);
      const P = this.main;
      gl.useProgram(P.p);
      gl.enableVertexAttribArray(0);
      gl.enableVertexAttribArray(1);
      gl.enableVertexAttribArray(2);
      gl.bindBuffer(gl.ARRAY_BUFFER, geo.pos); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, geo.w); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, geo.uv); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geo.idx);

      const u = P.u;
      const src = content.source;
      gl.uniform1i(u.u_mode, r.mode);
      if (r.mode === 1) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, r.tex.tex);
        gl.uniform1i(u.u_tex, 0);
        const fit = r.fit || 'stretch';
        gl.uniformMatrix3fv(u.u_uvm, false, uvMatrix(content, As, r.At || 1, fit, r.scroll));
        const wrap = r.wrap || (fit === 'tile' ? [1, 1] : [0, 0]);
        gl.uniform2f(u.u_wrap, wrap[0], wrap[1]);
      }
      gl.uniform3fv(u.u_color, LM.hexToRgb(src.color));
      gl.uniform3fv(u.u_color2, LM.hexToRgb(src.color2));
      gl.uniform1f(u.u_speed, +src.speed || 0);
      gl.uniform1f(u.u_param, LM.clamp(+src.param || 0, 0, 1));
      gl.uniform1f(u.u_time, opts.time || 0);
      gl.uniform1f(u.u_aspect, As);
      gl.uniform1f(u.u_opacity, LM.clamp(+content.opacity, 0, 1) * alpha);
      gl.uniform1f(u.u_bright, +content.brightness || 0);
      gl.uniform1f(u.u_contrast, content.contrast == null ? 1 : +content.contrast);
      gl.uniform1f(u.u_sat, content.saturation == null ? 1 : +content.saturation);
      gl.uniform1f(u.u_hue, ((+content.hue || 0) * Math.PI) / 180);
      gl.uniform1f(u.u_feather, Math.max(0, +s.feather || 0));
      gl.uniform1f(u.u_master, master);

      switch (s.blend) {
        case 'add': gl.blendFunc(gl.ONE, gl.ONE); break;
        case 'screen': gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); break;
        case 'multiply': gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA); break;
        default: gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }
      gl.drawElements(gl.TRIANGLES, geo.count, gl.UNSIGNED_SHORT, 0);
    }
  }

  LM.Renderer = Renderer;
  LM.uvMatrix = uvMatrix;
})();
