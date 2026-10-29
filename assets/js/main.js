(() => {
  'use strict';

  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // ─── Utilities ───────────────────────────────

  // FNV-1a: turns any string into a 32-bit seed.
  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // Small, fast seeded PRNG.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function tokens() {
    const s = getComputedStyle(root);
    const get = (name) => s.getPropertyValue(name).trim();
    return {
      bg: getComputedStyle(document.body).backgroundColor,
      surface: get('--surface'),
      fg: get('--fg'),
      palette: [get('--accent'), get('--accent-2'), get('--accent-3')],
    };
  }

  const themeListeners = [];
  const onThemeChange = (fn) => themeListeners.push(fn);
  const emitThemeChange = () => {
    // Wait a frame so computed styles reflect the new theme.
    requestAnimationFrame(() => themeListeners.forEach((fn) => fn()));
  };

  // ─── Theme toggle ────────────────────────────

  const toggle = document.querySelector('[data-theme-toggle]');
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : systemDark.matches;

  function syncThemeMeta() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = tokens().bg;
    if (toggle) toggle.setAttribute('aria-pressed', String(isDark()));
  }

  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) {}
      emitThemeChange();
    });
  }
  systemDark.addEventListener('change', () => { if (!root.dataset.theme) emitThemeChange(); });
  onThemeChange(syncThemeMeta);
  syncThemeMeta();

  // ─── Hero flow field ─────────────────────────

  const PRESETS = {
    calm:   { mode: 'flow',   freq: 0.0018, speed: 0.7, curl: 1.1, trail: 0.05, width: 1.1 },
    storm:  { mode: 'flow',   freq: 0.0045, speed: 2.4, curl: 2.4, trail: 0.12, width: 0.9 },
    bloom:  { mode: 'bloom',  freq: 0.0025, speed: 1.2, curl: 0.9, trail: 0.06, width: 1.2 },
    glitch: { mode: 'glitch', freq: 0.0030, speed: 1.6, curl: 1.6, trail: 0.10, width: 1.0 },
  };
  const MODES = ['flow', 'bloom', 'glitch'];

  function paramsFromPrompt(text) {
    const seed = hashString(text.trim().toLowerCase());
    const rand = mulberry32(seed);
    return {
      seed,
      mode: MODES[Math.floor(rand() * MODES.length)],
      freq: 0.001 + rand() * 0.004,
      speed: 0.5 + rand() * 2,
      curl: 0.8 + rand() * 2,
      trail: 0.04 + rand() * 0.08,
      width: 0.8 + rand() * 0.8,
      paletteShift: Math.floor(rand() * 3),
    };
  }

  function presetParams(name) {
    return { seed: hashString(name), paletteShift: 0, ...PRESETS[name] };
  }

  const field = (() => {
    const canvas = document.getElementById('field');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');

    let w = 0, h = 0, dpr = 1;
    let particles = [];
    let params = presetParams('calm');
    let colors = tokens();
    let t = 0;
    let raf = 0;
    let visible = true;
    const pointer = { x: -1e4, y: -1e4 };

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedParticles();
    }

    function seedParticles() {
      const count = Math.min(1400, Math.round((w * h) / 900));
      const rand = mulberry32(params.seed);
      particles = Array.from({ length: count }, () => spawn({}, rand));
      clear();
    }

    function spawn(p, rand = Math.random) {
      p.x = rand() * w;
      p.y = rand() * h;
      p.life = 60 + rand() * 240;
      p.c = Math.floor(rand() * 3);
      return p;
    }

    function clear() {
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, w, h);
    }

    function angleAt(x, y) {
      const f = params.freq;
      let a = Math.sin(x * f + t * 0.3 + params.seed % 7)
            + Math.cos(y * f * 1.3 - t * 0.2)
            + Math.sin((x - y) * f * 0.6 + t * 0.1);
      a *= params.curl;
      if (params.mode === 'bloom') {
        a = Math.atan2(y - h * 0.45, x - w * 0.6) + a * 0.35;
      } else if (params.mode === 'glitch') {
        a = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
      }
      return a;
    }

    function step() {
      // Fade the previous frame to leave trails.
      ctx.globalAlpha = params.trail;
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = params.width;
      ctx.lineCap = 'round';

      // Batch strokes by color: three paths per frame.
      const paths = [new Path2D(), new Path2D(), new Path2D()];
      for (const p of particles) {
        const a = angleAt(p.x, p.y);
        let vx = Math.cos(a) * params.speed;
        let vy = Math.sin(a) * params.speed;

        // The cursor swirls particles around it.
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 160 * 160) {
          const force = (1 - Math.sqrt(d2) / 160) * 3;
          vx += (-dy / 160) * force + (dx / 160) * force * 0.5;
          vy += (dx / 160) * force + (dy / 160) * force * 0.5;
        }

        const path = paths[(p.c + params.paletteShift) % 3];
        path.moveTo(p.x, p.y);
        p.x += vx;
        p.y += vy;
        path.lineTo(p.x, p.y);

        if (--p.life <= 0 || p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) spawn(p);
      }
      paths.forEach((path, i) => {
        ctx.strokeStyle = colors.palette[i];
        ctx.stroke(path);
      });
      ctx.globalAlpha = 1;
      t += 0.01;
    }

    function loop() {
      step();
      raf = requestAnimationFrame(loop);
    }

    function stop() { cancelAnimationFrame(raf); raf = 0; }

    function start() {
      stop();
      if (reducedMotion.matches) {
        // Draw a still composition instead of animating.
        clear();
        for (let i = 0; i < 180; i++) step();
        return;
      }
      if (visible && !document.hidden) loop();
    }

    function set(next) {
      params = next;
      t = 0;
      seedParticles();
      start();
    }

    window.addEventListener('resize', () => { resize(); start(); });
    canvas.parentElement.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    });
    canvas.parentElement.addEventListener('pointerleave', () => { pointer.x = pointer.y = -1e4; });
    document.addEventListener('visibilitychange', start);
    reducedMotion.addEventListener('change', start);
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      visible ? start() : stop();
    }).observe(canvas);
    onThemeChange(() => { colors = tokens(); clear(); start(); });

    resize();
    start();
    return { set, get params() { return params; } };
  })();

  // ─── Prompt UI ───────────────────────────────

  const promptForm = document.querySelector('[data-prompt]');
  if (promptForm && field) {
    const input = promptForm.querySelector('input');
    const readout = promptForm.querySelector('[data-readout]');
    const chips = promptForm.querySelectorAll('[data-preset]');

    const show = (label) => {
      const p = field.params;
      readout.textContent = `seed 0x${p.seed.toString(16).padStart(8, '0')} · mode ${p.mode} · “${label}”`;
    };
    const setActive = (name) => chips.forEach((c) => c.classList.toggle('is-active', c.dataset.preset === name));

    chips.forEach((chip) => chip.addEventListener('click', () => {
      const name = chip.dataset.preset;
      field.set(presetParams(name));
      setActive(name);
      input.value = '';
      show(name);
    }));

    promptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      field.set(paramsFromPrompt(text));
      setActive(null);
      show(text);
    });

    setActive('calm');
    show('calm');
  }

  // ─── Generated thumbnails ────────────────────

  const DRAW = {
    flow(ctx, w, h, rand, pal) {
      const f = 0.004 + rand() * 0.006;
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 520; i++) {
        let x = rand() * w, y = rand() * h;
        ctx.strokeStyle = pal[i % 3];
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 40; s++) {
          const a = (Math.sin(x * f) + Math.cos(y * f * 1.4) + Math.sin((x + y) * f * 0.5)) * 1.6;
          x += Math.cos(a) * 3;
          y += Math.sin(a) * 3;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    },
    grid(ctx, w, h, rand, pal) {
      const n = 8 + Math.floor(rand() * 6);
      const size = Math.max(w, h) / n;
      for (let gx = 0; gx < w / size; gx++) {
        for (let gy = 0; gy < h / size; gy++) {
          const r = rand();
          const cx = gx * size + size / 2, cy = gy * size + size / 2;
          ctx.fillStyle = pal[Math.floor(rand() * 3)];
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(Math.floor(rand() * 4) * Math.PI / 2);
          if (r < 0.35) {
            ctx.beginPath(); ctx.arc(-size / 2, -size / 2, size, 0, Math.PI / 2); ctx.lineTo(-size / 2, -size / 2); ctx.fill();
          } else if (r < 0.6) {
            ctx.beginPath(); ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2); ctx.fill();
          } else if (r < 0.75) {
            ctx.fillRect(-size / 2, -size / 2, size, size / 2);
          }
          ctx.restore();
        }
      }
    },
    rings(ctx, w, h, rand, pal) {
      const cx = w * (0.3 + rand() * 0.4), cy = h * (0.3 + rand() * 0.4);
      ctx.lineWidth = 2;
      for (let r = 8; r < Math.max(w, h); r += 10 + rand() * 8) {
        ctx.strokeStyle = pal[Math.floor(rand() * 3)];
        ctx.beginPath();
        ctx.arc(cx + Math.sin(r * 0.02) * 20, cy + Math.cos(r * 0.03) * 14, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
    waves(ctx, w, h, rand, pal) {
      const rows = 28;
      const amp = 10 + rand() * 30, f = 0.006 + rand() * 0.01, ph = rand() * 10;
      ctx.lineWidth = 2;
      for (let i = 0; i < rows; i++) {
        const y0 = (i + 0.5) * (h / rows);
        ctx.strokeStyle = pal[i % 3];
        ctx.beginPath();
        for (let x = 0; x <= w; x += 6) {
          const env = Math.sin((x / w) * Math.PI);
          const y = y0 + Math.sin(x * f + i * 0.35 + ph) * amp * env;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    },
    blobs(ctx, w, h, rand, pal) {
      ctx.globalCompositeOperation = isDark() ? 'screen' : 'multiply';
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = pal[i % 3];
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(rand() * w, rand() * h, (0.15 + rand() * 0.3) * Math.min(w, h), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
    glitch(ctx, w, h, rand, pal) {
      for (let y = 0; y < h;) {
        const bh = 2 + rand() * 18;
        let x = 0;
        while (x < w) {
          const bw = 20 + rand() * 220;
          if (rand() > 0.35) {
            ctx.fillStyle = pal[Math.floor(rand() * 3)];
            ctx.globalAlpha = 0.4 + rand() * 0.6;
            ctx.fillRect(x, y, bw, bh);
          }
          x += bw;
        }
        y += bh + rand() * 4;
      }
    },
  };

  function drawThumb(canvas) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { surface, palette } = tokens();
    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, rect.width, rect.height);
    const rand = mulberry32(Number(canvas.dataset.seed) || hashString(canvas.dataset.style || ''));
    (DRAW[canvas.dataset.style] || DRAW.flow)(ctx, rect.width, rect.height, rand, palette);
    ctx.globalAlpha = 1;
  }

  const thumbs = document.querySelectorAll('canvas.thumb');
  const drawAllThumbs = () => thumbs.forEach(drawThumb);
  if (thumbs.length) {
    const ro = new ResizeObserver((entries) => entries.forEach((e) => drawThumb(e.target)));
    thumbs.forEach((c) => ro.observe(c));
    onThemeChange(drawAllThumbs);
  }

  // ─── Project filters ─────────────────────────

  const filterButtons = document.querySelectorAll('[data-filter]');
  if (filterButtons.length) {
    const cards = document.querySelectorAll('.card[data-tags]');
    const count = document.querySelector('[data-count]');
    const empty = document.querySelector('[data-empty]');

    filterButtons.forEach((btn) => btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      filterButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      let shown = 0;
      cards.forEach((card) => {
        const match = filter === 'all' || card.dataset.tags.split(' ').includes(filter);
        card.hidden = !match;
        if (match) { shown++; card.classList.add('is-in'); }
      });
      if (count) count.textContent = String(shown).padStart(2, '0');
      if (empty) empty.hidden = shown > 0;
    }));
  }

  // ─── Reveal on scroll ────────────────────────

  const revealables = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    revealables.forEach((el) => io.observe(el));
  } else {
    revealables.forEach((el) => el.classList.add('is-in'));
  }

  // ─── Nav hides on scroll down ────────────────

  const nav = document.querySelector('[data-nav]');
  if (nav) {
    let lastY = window.scrollY;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      nav.classList.toggle('is-hidden', y > lastY && y > 240 && !nav.contains(document.activeElement));
      lastY = y;
    }, { passive: true });
  }

  // ─── Footer year ─────────────────────────────

  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
