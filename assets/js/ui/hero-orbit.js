/* ==========================================================================
   hero-orbit.js — بج‌های شناور دور پرتره‌ی هیرو

   بج‌ها روی یک مسیر بیضویِ پیوسته می‌چرخند (orbit واقعی، نه نوسان).
   هر بج شعاع، سرعت و فاز کمی متفاوت دارد تا حرکت یکنواخت ولی
   غیرمکانیکی به نظر برسد.

   چرا CSS/JS خالص و نه WebGL؟
   • پرتره یک عکس واقعی است، نه مدل سه‌بعدی
   • فقط سه المان جابه‌جا می‌شوند — نیازی به GPU pipeline نیست
   • با translate3d روی لایه‌ی composite اجرا می‌شود، بدون reflow

   نکته‌ی کلیدی برای روانی روی موبایل: در هر فریم فقط `transform` و
   `opacity` عوض می‌شوند (هر دو GPU-accelerated). هیچ خاصیتی که
   layout را دوباره محاسبه کند لمس نمی‌شود.
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = (global.ZZ = global.ZZ || {});
  var u = ZZ.u;

  /**
   * بج‌های شناور.
   *   angle : زاویه‌ی شروع (درجه) — ۰ راست، ۹۰ پایین، ۱۸۰ چپ، ۲۷۰ بالا
   *   rk    : ضریب شعاع نسبت به بیضی پایه
   *   speed : سرعت چرخش (دور بر ثانیه × ۱۰۰) — منفی = خلاف عقربه
   */
  /**
   * بج‌های شناور.
   * هر سه با یک سرعت و یک شعاع می‌چرخند و زاویه‌شان دقیقاً
   * ۱۲۰ درجه فاصله دارد — پس هرگز به هم نمی‌رسند.
   */
  var BADGES = [
    { icon: 'sparkle', title: 'نتیجه‌ی طبیعی', sub: 'تضمین رضایت' },
    { icon: 'heart',   title: 'مورد اعتماد',   sub: 'صدها زیباجو' },
    { icon: 'shield',  title: 'مراقبت تخصصی',  sub: 'با استانداردهای حرفه‌ای' }
  ];

  /** سرعت چرخش مدار (درجه بر ثانیه) */
  var ORBIT_SPEED = 11;

  /** زاویه‌ی شروع مدار */
  var ORBIT_START = 210;

  /**
   * @param {HTMLElement} stage عنصر .hero-stage
   */
  ZZ.heroOrbit = function (stage) {
    if (!stage) return null;

    var orbit = u.$('.hero-stage__orbit', stage);
    if (!orbit) return null;

    var reduced = u.reducedMotion();
    var coarse = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;

    /* ---------- ساخت بج‌ها ---------- */
    orbit.innerHTML = BADGES.map(function (b, i) {
      return '<div class="orbit-badge" style="--delay:' + (i * 140) + 'ms">' +
               '<span class="orbit-badge__icon">' + ZZ.icon(b.icon, null, 20) + '</span>' +
               '<span class="orbit-badge__text">' +
                 '<strong>' + u.esc(b.title) + '</strong>' +
                 '<span>' + u.esc(b.sub) + '</span>' +
               '</span>' +
             '</div>';
    }).join('');

    var nodes = u.$$('.orbit-badge', orbit);

    /* ---------- وضعیت ---------- */
    var t = 0;                      // زمان انباشته (ثانیه)
    var pointer = { x: 0, y: 0 };
    var target = { x: 0, y: 0 };
    var running = false;
    var rafId = 0;
    var last = 0;
    var visible = true;

    var rx = 0, ry = 0;             // شعاع بیضی
    var narrow = false;

    function measure() {
      var w = stage.clientWidth || 320;
      var h = stage.clientHeight || 440;
      narrow = global.innerWidth < 720;

      /* روی موبایل بج‌ها باید تو‌تر بنشینند وگرنه از کادر بیرون می‌زنند */
      rx = w * (narrow ? 0.44 : 0.52);
      ry = h * (narrow ? 0.26 : 0.32);
    }

    /* easing نمایی — مستقل از نرخ فریم */
    function damp(cur, goal, lambda, dt) {
      return goal + (cur - goal) * Math.exp(-lambda * dt);
    }

    function place() {
      var par = narrow ? 0.35 : 1;
      var step = 360 / nodes.length;      // فاصله‌ی ثابت بین بج‌ها

      for (var i = 0; i < nodes.length; i++) {
        /* زاویه‌ی هر بج = شروع + سهم خودش + چرخش زمان */
        var deg = ORBIT_START + i * step + t * ORBIT_SPEED;
        var a = deg * Math.PI / 180;

        var cos = Math.cos(a);
        var sin = Math.sin(a);

        var x = cos * rx;
        var y = sin * ry;

        /* پارالاکس: بج‌ها خلاف جهت موس جابه‌جا می‌شوند */
        x += -pointer.x * 15 * par;
        y += -pointer.y * 11 * par;

        /* --- عمق ---
           sin منفی یعنی بج در نیمه‌ی بالایی مدار است. آنجا را
           «پشت سوژه» در نظر می‌گیریم: بج پشت عکس می‌رود، کوچک‌تر
           و کم‌رنگ‌تر می‌شود. این‌طور هیچ‌وقت چهره را نمی‌پوشاند. */
        var behind = sin < 0;
        var depth = (sin + 1) / 2;               // ۰ = دورترین، ۱ = نزدیک‌ترین
        var scale = 0.82 + depth * 0.22;
        var op = behind ? (0.34 + depth * 0.52) : 1;

        var n = nodes[i];
        n.style.transform =
          'translate3d(calc(-50% + ' + x.toFixed(1) + 'px), calc(-50% + ' + y.toFixed(1) + 'px), 0)' +
          ' scale(' + scale.toFixed(3) + ')';
        n.style.opacity = op.toFixed(2);
        /* zIndex پایین‌تر از عکس (۵) وقتی پشت است */
        n.style.zIndex = behind ? '1' : '12';
      }

      /* پارالاکس ملایم روی عکس و حلقه */
      var photo = u.$('.hero-stage__photo', stage);
      if (photo) {
        photo.style.transform =
          'translate3d(' + (pointer.x * 7 * par).toFixed(1) + 'px, ' +
                           (pointer.y * 5 * par).toFixed(1) + 'px, 0)';
      }
      var ring = u.$('.hero-stage__ring', stage);
      if (ring) {
        ring.style.transform =
          'translate3d(' + (-pointer.x * 12 * par).toFixed(1) + 'px, ' +
                           (-pointer.y * 9 * par).toFixed(1) + 'px, 0)' +
          ' rotate(' + (t * 5).toFixed(2) + 'deg)';
      }
    }

    function frame(now) {
      if (!running) return;
      rafId = global.requestAnimationFrame(frame);

      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      t += dt;

      pointer.x = damp(pointer.x, target.x, 3.0, dt);
      pointer.y = damp(pointer.y, target.y, 3.0, dt);

      place();
    }

    function start() {
      if (running || reduced) return;
      running = true;
      last = performance.now();
      rafId = global.requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (rafId) global.cancelAnimationFrame(rafId);
      rafId = 0;
    }

    /* ---------- تعامل ---------- */
    function onMove(e) {
      var p = e.touches ? e.touches[0] : e;
      target.x = (p.clientX / global.innerWidth) * 2 - 1;
      target.y = (p.clientY / global.innerHeight) * 2 - 1;
    }
    function onLeave() { target.x = 0; target.y = 0; }

    if (!coarse) {
      global.addEventListener('pointermove', onMove, { passive: true });
      global.addEventListener('pointerleave', onLeave, { passive: true });
    }

    /* ---------- اندازه ---------- */
    var ro = null;
    if (global.ResizeObserver) {
      ro = new ResizeObserver(u.debounce(function () { measure(); place(); }, 100));
      ro.observe(stage);
    } else {
      global.addEventListener('resize', u.debounce(function () { measure(); place(); }, 140));
    }
    measure();

    /* ---------- فقط وقتی در دید است ---------- */
    var io = null;
    if ('IntersectionObserver' in global) {
      io = new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        if (visible && !document.hidden) start(); else stop();
      }, { threshold: 0.02 });
      io.observe(stage);
    } else {
      start();
    }

    function onVis() {
      if (document.hidden) stop();
      else if (visible) start();
    }
    document.addEventListener('visibilitychange', onVis);

    place();
    if (!reduced) start();

    stage.classList.add('is-ready');

    return {
      destroy: function () {
        stop();
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        global.removeEventListener('pointermove', onMove);
        global.removeEventListener('pointerleave', onLeave);
      }
    };
  };
})(window);
