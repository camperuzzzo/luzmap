/* LuzMap — iconos SVG en línea */
(function () {
  'use strict';
  const LM = window.LM;

  const P = {
    plus: 'M12 5v14M5 12h14',
    x: 'M18 6 6 18M6 6l12 12',
    file: 'M6 2h9l5 5v15H6zM14 2v6h6',
    folder: 'M3 6h6l2 2h10v11H3z',
    save: 'M12 3v12M7 10l5 5 5-5M5 21h14',
    undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
    redo: 'm15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
    guides: 'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M9 9h6v6H9z',
    pattern: 'M3 3h18v18H3zM3 12h18M12 3v18M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z',
    power: 'M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    projector: 'M2 8h20v9H2zM16 10a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM5 11h5M5 14h3M6 17v2M18 17v2',
    expand: 'M8 3H3v5M21 8V3h-5M16 21h5v-5M3 16v5h5',
    help: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
    quad: 'M4 6l15-3 2 16-17 2z',
    mesh: 'M3 4c6 2 12 2 18 0v16c-6 2-12 2-18 0zM9 4.8v15.6M15 4.8v15.6M3 9.3c6 2 12 2 18 0M3 14.6c6 2 12 2 18 0',
    pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
    mask: 'M3 3h18v18H3zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
    pointer: 'M4 3l7 17 2.5-7.5L21 10z',
    grid: 'M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18',
    magnet: 'M5 3v8a7 7 0 0 0 14 0V3h-5v8a2 2 0 0 1-4 0V3zM5 7h5M14 7h5',
    eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    eyeOff: 'M17.9 17.9A10 10 0 0 1 12 19c-7 0-11-7-11-7a18 18 0 0 1 5-5.9M9.9 5.2A9 9 0 0 1 12 5c7 0 11 7 11 7a18 18 0 0 1-2.2 3.2M1 1l22 22',
    lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
    unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.9-1',
    trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    up: 'm18 15-6-6-6 6',
    down: 'm6 9 6 6 6-6',
    left: 'm15 18-6-6 6-6',
    right: 'm9 18 6-6-6-6',
    play: 'M7 4l13 8-13 8z',
    pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
    restart: 'M3 4v6h6M3.5 15a9 9 0 1 0 2.1-9.4L3 10',
    image: 'M3 3h18v18H3zM8.5 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM21 15l-5-5L5 21',
    video: 'M2 6h14v12H2zM16 10l6-4v12l-6-4z',
    text: 'M4 7V4h16v3M9 20h6M12 4v16',
    camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    sparkle: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4zM19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z',
    rotate: 'M21 2v6h-6M21 13a9 9 0 1 1-3-7.7L21 8',
    mirror: 'M12 3v18M8 7 3 12l5 5zM16 7l5 5-5 5z',
    fit: 'M3 3h18v18H3zM7 7h10v10H7z',
    layers: 'M12 2l10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5',
    link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  };
  const FILLED = { play: 1, pause: 1 };

  LM.icon = (name, cls) => {
    const d = P[name] || P.x;
    const fill = FILLED[name] ? 'currentColor' : 'none';
    return `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  };

  LM.hydrateIcons = (root) => {
    (root || document).querySelectorAll('i[data-icon]').forEach((el) => {
      el.outerHTML = LM.icon(el.getAttribute('data-icon'));
    });
  };
})();
