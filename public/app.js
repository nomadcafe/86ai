(() => {
  // ====== 可改的文案 ======
  const TEXT_A = '86.Ai';
  const TEXT_B = 'CHINA AI';
  // ========================

  const FONT = '"Orbitron", "Helvetica Neue", Arial, sans-serif';
  const LOW_END = (navigator.hardwareConcurrency || 8) <= 4;
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BG = '#05050a';
  const cvs = document.getElementById('c');
  const ctx = cvs.getContext('2d');
  const sub = document.getElementById('sub');
  const huds = document.querySelectorAll('.hud');

  let W, H, DPR, fsA, fsB, ptsA, ptsB, gapA, gapB;
  let P = [];               // 粒子
  let layers = new Map();   // 故障文字图层缓存
  let phase, t0, steps, freeMode, flash, mx = -9999, my = -9999;
  const timers = [];
  let quick = false;
  let Rank;

  const rand = (a, b) => a + Math.random() * (b - a);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function fit(text) {
    ctx.font = `900 100px ${FONT}`;
    const w100 = ctx.measureText(text).width;
    return Math.min(H * 0.28, (W * 0.84 * 100) / w100, 340);
  }

  // 故障图层只画文字所在的横条（约 1.6 倍字号高），比整屏画布省一半以上内存
  let bandY, bandH;
  function makeLayer(text, fs, color, glow) {
    const c = document.createElement('canvas');
    c.width = W * DPR; c.height = Math.ceil(bandH * DPR);
    const o = c.getContext('2d');
    o.scale(DPR, DPR);
    o.font = `900 ${fs}px ${FONT}`;
    o.textAlign = 'center'; o.textBaseline = 'middle';
    if (glow) { o.shadowColor = glow; o.shadowBlur = fs * 0.18; }
    o.fillStyle = color;
    o.fillText(text, W / 2, H / 2 - bandY);
    return c;
  }

  function getLayers(text) {
    if (!layers.has(text)) {
      layers.set(text, {
        r: makeLayer(text, fsA, '#ff1744'),
        c: makeLayer(text, fsA, '#00e5ff'),
        w: makeLayer(text, fsA, '#ffffff', 'rgba(140,230,255,.9)'),
      });
    }
    return layers.get(text);
  }

  function sample(text, fs, cy = H / 2) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const o = c.getContext('2d', { willReadFrequently: true });
    o.font = `900 ${fs}px ${FONT}`;
    o.textAlign = 'center'; o.textBaseline = 'middle';
    o.fillStyle = '#fff';
    o.fillText(text, W / 2, cy);
    const d = o.getImageData(0, 0, W, H).data;
    const MAX = W < 700 ? 2200 : LOW_END ? 3400 : 5200;
    let gap = Math.max(2, Math.round(fs / 70)), pts;
    for (;;) {
      pts = [];
      for (let y = 0; y < H; y += gap)
        for (let x = 0; x < W; x += gap)
          if (d[(y * W + x) * 4 + 3] > 140) pts.push({ x, y });
      if (pts.length <= MAX || gap > 12) break;
      gap++;
    }
    return { pts: shuffle(pts), gap };
  }

  function scramble(s) {
    const pool = '01#%&@$86A!?/<>X';
    return [...s].map(ch => Math.random() < 0.55 ? pool[(Math.random() * pool.length) | 0] : ch).join('');
  }

  // ---------- 开场闪现时间线 ----------
  function buildSteps() {
    if (quick) return [
      { d: 250, on: false },
      { d: 70, on: true, flash: 1 },
      { d: 650, on: true, g: .35 },
    ];
    return [
      { d: 450, on: false },
      { d: 45, on: true, flash: .9 },
      { d: 110, on: false },
      { d: 60, on: true, text: scramble(TEXT_A), g: 1 },
      { d: 160, on: false },
      { d: 35, on: true, g: .8 },
      { d: 55, on: false },
      { d: 70, on: true, text: scramble(TEXT_A), g: 1 },
      { d: 260, on: false },
      { d: 520, on: true, g: 1 },
      { d: 70, on: false },
      { d: 70, on: true, flash: 1 },
      { d: 950, on: true, g: .3 },
    ];
  }

  function drawGlitch(text, g) {
    const L = getLayers(text);
    const dx = rand(-1, 1) * g * fsA * 0.07;
    const jy = rand(-1, 1) * g * 4;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(L.r, -dx, bandY + jy, W, bandH);
    ctx.drawImage(L.c, dx, bandY - jy, W, bandH);
    ctx.drawImage(L.w, 0, bandY, W, bandH);
    // 横向撕裂切片
    const n = (g * 7) | 0;
    for (let i = 0; i < n; i++) {
      const sy = H / 2 + rand(-0.55, 0.55) * fsA;
      const sh = rand(3, fsA * 0.14);
      const off = rand(-1, 1) * g * 70;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = BG;
      ctx.fillRect(0, sy, W, sh);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(L.w, 0, (sy - bandY) * DPR, W * DPR, sh * DPR, off, sy, W, sh);
    }
    // 噪点线
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 6 * g; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rand(.03, .15)})`;
      ctx.fillRect(0, rand(0, H), W, 1);
    }
  }

  function runIntro(t) {
    let acc = 0;
    for (const s of steps) {
      if (t < acc + s.d) {
        if (s.on) drawGlitch(s.text || TEXT_A, s.g ?? .6);
        if (s.flash) {
          const k = 1 - (t - acc) / s.d;
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = `rgba(255,255,255,${s.flash * k})`;
          ctx.fillRect(0, 0, W, H);
        }
        return;
      }
      acc += s.d;
    }
    startParticles();
  }

  // ---------- 粒子 ----------
  function startParticles(morph) {
    phase = 'particles';
    layers = new Map();   // 开场结束，释放故障图层
    const N = Math.max(ptsA.length, ptsB.length) + (W < 700 ? 200 : 450);
    P = [];
    for (let i = 0; i < N; i++) {
      const on = i < ptsA.length;
      const pt = on ? ptsA[i] : { x: rand(0, W), y: rand(0, H) };
      P.push({
        x: pt.x, y: pt.y, tx: pt.x, ty: pt.y,
        vx: on ? rand(-2, 2) : rand(-.3, .3), vy: on ? rand(-2, 2) : rand(-.3, .3),
        on, ph: Math.random() * 6.28,
        r: 255, g: 255, b: 255,
        tr: on ? rand(90, 170) : 120, tg: on ? rand(210, 240) : 140, tb: 255,
        s: on ? gapA * 0.6 : rand(.6, 1.4),
      });
    }
    if (REDUCE) {
      formB(); flash = 0;
      for (const p of P) { p.x = p.tx; p.y = p.ty; p.vx = p.vy = 0; p.r = p.tr; p.g = p.tg; p.b = p.tb; }
      sub.classList.add('show'); huds.forEach(h => h.classList.add('show'));
      Rank.show();
      return;
    }
    if (morph) {   // 窗口尺寸变化：不重播开场，粒子直接重组成 CHINA AI
      formB(); flash = 0;
      sub.classList.add('show'); huds.forEach(h => h.classList.add('show'));
      Rank.show();
      return;
    }
    const k = quick ? 0.55 : 1;
    at(1500 * k, () => explode());
    at(2250 * k, () => formB());
    at(3300 * k, () => { sub.classList.add('show'); huds.forEach(h => h.classList.add('show')); });
    at(3300 * k + 900, () => Rank.show());
  }

  function explode() {
    freeMode = true; flash = .55;
    for (const p of P) {
      if (!p.on) continue;
      const a = Math.atan2(p.y - H / 2, p.x - W / 2) + rand(-.6, .6);
      const sp = rand(6, 24);
      p.vx += Math.cos(a) * sp; p.vy += Math.sin(a) * sp;
      p.tr = 255; p.tg = 255; p.tb = 255;
    }
  }

  function formB() {
    freeMode = false; flash = .25;
    const left = W / 2 - W * 0.42, span = W * 0.84;
    P.forEach((p, i) => {
      if (i < ptsB.length) {
        const pt = ptsB[i];
        p.on = true; p.tx = pt.x; p.ty = pt.y; p.s = gapB * 0.62;
        const k = Math.min(1, Math.max(0, (pt.x - left) / span));
        // 中国红 → 金
        p.tr = 235 + 20 * k; p.tg = 20 + 170 * Math.pow(k, 1.4) + rand(-12, 12); p.tb = 40 + 10 * k;
      } else {
        p.on = false; p.s = rand(.6, 1.4);
        p.tr = 255; p.tg = 90; p.tb = 80;
      }
    });
  }

  const buckets = new Map();
  function updateParticles(now) {
    // 爆炸时用叠加发光，成形后用正常混合，保证红金颜色饱和
    ctx.globalCompositeOperation = freeMode ? 'lighter' : 'source-over';
    const R = Math.min(W, H) * 0.12, R2 = R * R;
    for (const p of P) {
      if (freeMode && p.on) {
        p.vx *= 0.95; p.vy *= 0.95;
        const dx = p.x - W / 2, dy = p.y - H / 2;
        p.vx += -dy * 0.0009; p.vy += dx * 0.0009; // 漩涡
      } else if (p.on) {
        const jx = REDUCE ? 0 : Math.sin(now * 0.002 + p.ph) * 0.6;
        const jy = REDUCE ? 0 : Math.cos(now * 0.0017 + p.ph) * 0.6;
        p.vx = (p.vx + (p.tx + jx - p.x) * 0.055) * 0.84;
        p.vy = (p.vy + (p.ty + jy - p.y) * 0.055) * 0.84;
      } else {
        p.vx = p.vx * 0.985 + rand(-.03, .03);
        p.vy = p.vy * 0.985 + rand(-.03, .03) - 0.01;
        if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
      }
      // 鼠标排斥
      const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
      if (d2 < R2 && d2 > 1) {
        const d = Math.sqrt(d2), f = (1 - d / R) * 5;
        p.vx += dx / d * f; p.vy += dy / d * f;
      }
      p.x += p.vx; p.y += p.vy;
      p.r += (p.tr - p.r) * 0.06; p.g += (p.tg - p.g) * 0.06; p.b += (p.tb - p.b) * 0.06;

      const key = (((p.r >> 3) << 10) | ((p.g >> 3) << 5) | (p.b >> 3)) * 2 + (p.on ? 1 : 0);
      let arr = buckets.get(key);
      if (!arr) buckets.set(key, (arr = []));
      arr.push(p.x, p.y, p.s);
    }
    for (const [key, arr] of buckets) {
      if (!arr.length) continue;
      const c = key >> 1, r = ((c >> 10) & 31) * 8 + 4, g = ((c >> 5) & 31) * 8 + 4, b = (c & 31) * 8 + 4;
      ctx.fillStyle = key & 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},.35)`;
      ctx.beginPath();
      for (let i = 0; i < arr.length; i += 3) ctx.rect(arr[i], arr[i + 1], arr[i + 2], arr[i + 2]);
      ctx.fill();
      arr.length = 0;
    }
    if (buckets.size > 3000) buckets.clear();
    if (flash > 0.01) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(255,255,255,${flash})`;
      ctx.fillRect(0, 0, W, H);
      flash *= 0.86;
    }
  }

  // ---------- 主循环 ----------
  function frame(now) {
    const t = now - t0;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = phase === 'intro' ? BG : 'rgba(5,5,10,.26)';
    ctx.fillRect(0, 0, W, H);
    if (phase === 'intro') runIntro(t); else updateParticles(now);
    requestAnimationFrame(frame);
  }

  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }

  function restart({ full = false, morph = false } = {}) {
    quick = !full && seenBefore();
    Rank.hide();
    timers.forEach(clearTimeout); timers.length = 0;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cvs.width = W * DPR; cvs.height = H * DPR;
    cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    fsA = fit(TEXT_A); fsB = fit(TEXT_B);
    // 有排行榜时，CHINA AI + 副标题整体上移，给底部榜单让位
    let cyB = H / 2;
    const panelH = Rank.height();
    if (panelH) {
      const subTop = H - (W <= 640 ? 58 : 64) - panelH - 84;  // 副标题区约 60px + 间距
      fsB = Math.min(fsB, (subTop - 18 - 50) / 1.05);
      cyB = Math.min(H / 2, subTop - 18 - fsB * 0.55);
    }
    ({ pts: ptsA, gap: gapA } = sample(TEXT_A, fsA));
    ({ pts: ptsB, gap: gapB } = sample(TEXT_B, fsB, cyB));
    bandH = fsA * 1.6; bandY = H / 2 - bandH / 2;
    layers = new Map();
    steps = buildSteps();
    // 预先生成故障图层，避免开场第一帧现场绘制（带 shadowBlur）造成卡顿
    if (!REDUCE && !morph) for (const s of steps) if (s.on) getLayers(s.text || TEXT_A);
    P = []; freeMode = false; flash = 0;
    sub.classList.remove('show');
    huds.forEach(h => h.classList.remove('show'));
    sub.style.top = (cyB + fsB * 0.55 + 18) + 'px';
    phase = 'intro'; t0 = performance.now();
    if (REDUCE || morph) startParticles(morph);
  }

  // 北京时间
  const clock = document.getElementById('clock');
  const tickClock = () => {
    const s = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Shanghai', hour12: false });
    clock.textContent = 'BEIJING ' + s;
  };
  tickClock(); setInterval(tickClock, 1000);

  // 交互
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; });
  addEventListener('pointerleave', () => { mx = my = -9999; });
  addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') { mx = my = -9999; } });
  addEventListener('click', e => { if (!e.target.closest('#rank, #contact')) restart({ full: true }); });
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('button, a')) return;   // 按钮/链接上的回车不触发重播
    if (e.code === 'Space' || e.code === 'Enter') restart({ full: true });
  });

  // 联系邮箱：源码里不出现明文，点击才解码显示（防爬虫采集）
  // 第一次点击：显示并复制；之后点击：打开邮件客户端
  const contact = document.getElementById('contact');
  contact.addEventListener('click', async () => {
    const addr = [...atob('aWEuNjhAMzIx')].reverse().join('');
    if (!contact.classList.contains('on')) {
      contact.classList.add('on');
      contact.querySelector('.lbl').textContent = addr;
      contact.querySelector('.arr').textContent = '↗';
      contact.setAttribute('aria-label', '发送邮件至 ' + addr);
      let tip = 'CLICK TO EMAIL';
      try { await navigator.clipboard.writeText(addr); tip = 'COPIED ✓'; } catch {}
      contact.dataset.tip = tip;
      setTimeout(() => delete contact.dataset.tip, 1600);
    } else {
      location.href = 'mailto:' + addr;
    }
  });
  let rt; addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => restart({ morph: phase === 'particles' }), 250);
  });

  // 等字体加载（最多 1.5 秒）再开始，保证粒子取样用的是正确字体
  const ready = document.fonts
    ? Promise.race([document.fonts.load(`900 100px Orbitron`), new Promise(r => setTimeout(r, 1500))])
    : Promise.resolve();
  Rank = Rank_();
  // 等字体和榜单数据（榜单最多等 2.5 秒，取不到就不显示榜单）
  Promise.all([ready, Rank.ready(2500)]).then(() => { restart(); requestAnimationFrame(frame); markSeen(); });

  // 首次访问播完整版，之后（12 小时内）播快速版
  function seenBefore() {
    try { return Date.now() - (+localStorage.getItem('86ai.seen') || 0) < 12 * 3600e3; } catch { return false; }
  }
  function markSeen() {
    try { localStorage.setItem('86ai.seen', String(Date.now())); } catch {}
  }

  // ---------- 大模型排行榜 ----------
  function Rank_() {
    const box = document.getElementById('rank');
    const list = document.getElementById('rankList');
    const stat = document.getElementById('rankStat');
    const sync = document.getElementById('rankSync');
    const src = document.getElementById('rankSrc');
    let data = null, visible = false, raf;

    const loading = fetch('/api/rankings')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (j && Array.isArray(j.models) && j.models.length) data = j; })
      .catch(() => {});

    const ago = t => {
      const m = Math.max(0, Math.round((Date.now() - t) / 60e3));
      if (m < 60) return (m || 1) + ' MIN AGO';
      const h = Math.round(m / 60);
      return h < 24 ? h + ' H AGO' : Math.round(h / 24) + ' D AGO';
    };

    function el(tag, cls, text) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    }

    // 统计数字：只用 textContent 写入，数据一律转成数字
    function countUp(cn, n, share) {
      cancelAnimationFrame(raf);
      const emCn = el('em'), emShare = el('em');
      stat.replaceChildren('CN ', emCn, ` / ${n}`);
      if (share != null) stat.append(' · ', emShare, ' SHARE');
      const t0 = performance.now(), D = REDUCE ? 0 : 1400;
      const tick = now => {
        const k = D ? Math.min(1, (now - t0) / D) : 1, e = 1 - Math.pow(1 - k, 3);
        emCn.textContent = Math.round(cn * e);
        if (share != null) emShare.textContent = (share * e).toFixed(1) + '%';
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    function render() {
      const { count, rows } = layout();
      const ms = data.models.slice(0, count);
      const num = v => (Number.isFinite(+v) ? +v : 0);
      const max = num(data.models[0].tokensNum) || 1;
      list.style.setProperty('--rows', rows);

      const bars = [];
      list.replaceChildren(...ms.map((m, i) => {
        m = { ...m, author: String(m.author).slice(0, 30), cn: m.cn === true, name: String(m.name).slice(0, 60), tokens: String(m.tokens).slice(0, 10),
              change: String(m.change).slice(0, 8), rank: num(m.rank), tokensNum: num(m.tokensNum) };
        const row = el('div', 'row' + (m.cn ? ' cn' : ''));
        row.style.transitionDelay = i * 70 + 'ms';
        row.title = `${m.name} · ${m.author}`;
        const bar = el('span', 'bar'), fill = el('i');
        bar.append(fill); bars.push([fill, m.tokensNum / max, i]);
        const ch = /^\+/.test(m.change) ? 'up' : /new/i.test(m.change) ? 'new' : '';
        row.append(
          el('span', 'rk', String(m.rank).padStart(2, '0')),
          el('span', 'nm', m.name),
          bar,
          el('span', 'tk', m.tokens),
          el('span', 'ch ' + ch, /new/i.test(m.change) ? 'NEW' : m.change),
        );
        return row;
      }));
      requestAnimationFrame(() => requestAnimationFrame(() => {
        for (const [fill, w, i] of bars) {
          fill.style.transitionDelay = 300 + i * 70 + 'ms';
          fill.style.width = Math.max(2, w * 100) + '%';
        }
      }));

      countUp(num(data.cnCount), data.models.length, data.cnShare == null ? null : num(data.cnShare));
      src.href = 'https://openrouter.ai/rankings';
      sync.textContent = 'SYNCED ' + ago(data.updated);
    }

    // 估算榜单高度（与 render 的行数规则一致），没有数据返回 0
    const layout = () => {
      const mobile = innerWidth <= 640, short = innerHeight < 720;
      const count = mobile ? (short ? 3 : 5) : (short ? 6 : 10);
      return { mobile, count, rows: Math.ceil(count / (mobile ? 1 : 2)) };
    };

    return {
      ready: ms => Promise.race([loading, new Promise(r => setTimeout(r, ms))]),
      height: () => (data ? layout().rows * 29 + 64 : 0),
      async show() {
        await loading;
        if (!data || visible) return;
        visible = true; render();
        box.classList.add('show');
      },
      hide() {
        visible = false; cancelAnimationFrame(raf);
        box.classList.remove('show');
      },
    };
  }
})();
