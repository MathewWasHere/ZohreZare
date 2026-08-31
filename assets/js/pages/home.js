/* ==========================================================================
   home.js — منطق صفحه‌ی اصلی
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = global.ZZ;
  var u = ZZ.u;

  /* ---------- کارت خدمت (مشترک با صفحه‌ی خدمات) ---------- */
  ZZ.serviceCardHTML = function (s) {
    return '' +
      '<article class="svc-card">' +
        '<div class="svc-card__media">' +
          '<img src="' + s.image + '" alt="' + u.esc(s.title) + '" loading="lazy" width="800" height="500">' +
          '<span class="svc-card__icon">' + ZZ.icon(s.icon) + '</span>' +
        '</div>' +
        '<div class="svc-card__body">' +
          '<h3 class="svc-card__title">' + u.esc(s.title) + '</h3>' +
          '<div class="pill-row">' +
            (s.variants || []).slice(0, 3).map(function (v) {
              return '<span class="badge">' + u.esc(v.name) + '</span>';
            }).join('') +
            ((s.variants || []).length > 3 ? '<span class="badge badge--muted">+' + u.toFa((s.variants || []).length - 3) + '</span>' : '') +
          '</div>' +
          '<p class="svc-card__text">' + u.esc(s.short) + '</p>' +
          '<div class="svc-card__meta">' +
            '<span>' + ZZ.icon('clock') + u.duration(s.durationMin) + '</span>' +
            '<span>' + ZZ.icon('tag') + 'از ' + u.money(s.priceFrom) + '</span>' +
          '</div>' +
          '<div class="svc-card__actions">' +
            '<a class="btn btn--ghost btn--sm" href="service.html?s=' + s.slug + '">جزئیات</a>' +
            '<a class="btn btn--primary btn--sm" href="booking.html?service=' + s.id + '">رزرو</a>' +
          '</div>' +
        '</div>' +
      '</article>';
  };

  document.addEventListener('DOMContentLoaded', function () {
    ZZ.shell({ active: 'home' });

    /* آیکون داخل دکمه‌های هیرو */
    var btnIcons = [['.hero__actions .btn--primary .btn__ico', 'calendar'],
                    ['.hero__actions .btn--ghost .btn__ico', 'grid']];
    btnIcons.forEach(function (pair) {
      var el = u.$(pair[0]);
      if (el) el.innerHTML = ZZ.icon(pair[1], null, 17);
    });

    /* آیکون نوار پایین هیرو */
    var hint = u.$('#heroHint i');
    if (hint) hint.innerHTML = ZZ.icon('heart', null, 13);


    /* ---------- کارت‌های آمار و مزیت ---------- */
    var heroCards = [
      { icon: 'award',   big: '+۷ سال',        sub: 'سابقه‌ی تخصصی' },
      { icon: 'heart',   big: 'هزاران',        sub: 'مشتری راضی' },
      { icon: 'chat',    big: 'مشاوره رایگان', sub: 'قبل از خدمات' }
    ];
    var hc = u.$('#heroCards');
    if (hc) {
      hc.innerHTML = heroCards.map(function (c) {
        return '<div class="hero-card">' +
                 '<span class="hero-card__icon">' + ZZ.icon(c.icon, null, 19) + '</span>' +
                 '<strong class="hero-card__big">' + u.esc(c.big) + '</strong>' +
                 '<span class="hero-card__sub">' + u.esc(c.sub) + '</span>' +
               '</div>';
      }).join('');
    }

    /* ---------- مزیت‌ها ---------- */
    var perks = [
      { icon: 'shield',  text: 'ابزار استریل و مواد دارای گواهی' },
      { icon: 'sparkle', text: 'مشاوره‌ی رایگان پیش از هر کار' },
      { icon: 'clock',   text: 'زمان‌بندی دقیق، بدون معطلی' },
      { icon: 'heart',   text: 'فضای آرام و خصوصی' }
    ];
    var perksRow = u.$('#perksRow');
    if (perksRow) {
      perksRow.innerHTML = perks.map(function (p) {
        return '<span class="marquee__item">' + ZZ.icon(p.icon) + u.esc(p.text) + '</span>';
      }).join('');
    }

    /* ---------- آیکون‌های بخش اعتماد ---------- */
    u.$$('[data-proof-icon]').forEach(function (el) {
      el.innerHTML = ZZ.icon(el.dataset.proofIcon, null, 24);
    });

    /* ---------- خدمات ----------
       اگر بک‌اند فعال باشد، عنوان و قیمت‌ها ممکن است در پنل مدیریت
       ویرایش شده باشند. drawServices بعد از آمدن داده‌ی سرور دوباره
       صدا زده می‌شود. */
    function drawServices() {
      var grid = u.$('#servicesGrid');
      if (grid) {
        grid.innerHTML = ZZ.services.getAll().map(function (s, i) {
          return '<div class="reveal" data-delay="' + (i * 90) + '">' + ZZ.serviceCardHTML(s) + '</div>';
        }).join('');
      }
      drawWorks(activePortfolioFilter);
    }

    /* ---------- نمونه کارها ----------
       تصاویر بر اساس نام فایل دسته‌بندی شده‌اند و در قالب کارت‌های
       اختصاصی قبل/بعد یا نتیجه‌ی نهایی نمایش داده می‌شوند. */
    var PORTFOLIO_LABELS = {
      brows: 'نانوبروز و ابرو',
      lips: 'تینت و شیدینگ لب',
      lashes: 'بن‌مژه',
      eyeliner: 'خط چشم دائم',
      'lash-lift': 'لیفت و لمینت'
    };

    var PORTFOLIO = [
      /* --- ابرو --- */
      { category: 'brows', type: 'pair', before: 'brows-before-01.webp', after: 'brows-after-01.webp' },
      { category: 'brows', type: 'pair', before: 'brows-before-02.webp', after: 'brows-after-02.webp' },
      { category: 'brows', type: 'pair', before: 'brows-before-03.webp', after: 'brows-after-03.webp' },
      { category: 'brows', type: 'single', image: 'brows-after-04.webp' },
      { category: 'brows', type: 'pair', before: 'brows-before-06.webp', after: 'brows-after-06.webp' },
      { category: 'brows', type: 'pair', before: 'brows-before-05.webp', after: 'brows-after-09.webp' },
      { category: 'brows', type: 'pair', before: 'brows-before-10.webp', after: 'brows-after-10.webp' },
      { category: 'brows', type: 'pair', before: 'brows-before-13.webp', after: 'brows-after-13.webp' },
      { category: 'brows', type: 'pair', before: 'brows-before-14.webp', after: 'brows-after-14.webp' },
      { category: 'brows', type: 'single', image: 'brows-after-15.webp' },
      { category: 'brows', type: 'pair', before: 'brows-before-16.webp', after: 'brows-after-16.webp' },
      { category: 'brows', type: 'single', image: 'brows-after-16-second.webp' },
      { category: 'brows', type: 'single', image: 'brows-after-17.webp' },
      { category: 'brows', type: 'composite', image: 'brows-before-after-05.webp' },
      { category: 'brows', type: 'composite', image: 'brows-before-after-07.webp' },
      { category: 'brows', type: 'composite', image: 'brows-before-after-08.webp' },
      { category: 'brows', type: 'composite', image: 'brows-before-after-11.webp' },
      { category: 'brows', type: 'composite', image: 'brows-before-after-12.webp' },
      { category: 'brows', type: 'pair', before: 'brows-cover-old-before.webp', after: 'lips-cover-old-after.webp' },
      { category: 'brows', type: 'composite', image: 'brows-lift-01.webp' },
      /* --- لب --- */
      { category: 'lips', type: 'pair', before: 'lips-01-before.webp', after: 'lips-01-after.webp' },
      { category: 'lips', type: 'pair', before: 'lips-02-before.webp', after: 'lips-02-after.webp' },
      { category: 'lips', type: 'pair', before: 'lips-03-before.webp', after: 'lips-03-after.webp' },
      { category: 'lips', type: 'pair', before: 'lips-04-before.webp', after: 'lips-04-after.webp' },
      { category: 'lips', type: 'pair', before: 'lips-05-before.webp', after: 'lips-05-after.webp' },
      { category: 'lips', type: 'composite', image: 'lips-tint-composite.webp' },
      { category: 'lips', type: 'single', image: 'lips-cover-old-after.webp' },
      /* --- بن‌مژه --- */
      { category: 'lashes', type: 'single', image: 'lashes-after-01.webp' },
      { category: 'lashes', type: 'single', image: 'lashes-after-02.webp' },
      { category: 'lashes', type: 'single', image: 'lashes-after-03.webp' },
      { category: 'lashes', type: 'single', image: 'lashes-after-04.webp' },
      { category: 'lashes', type: 'single', image: 'lashes-after-05.webp' },
      { category: 'lashes', type: 'composite', image: 'lashes-band-01.webp' },
      { category: 'lashes', type: 'composite', image: 'lashes-band-02.webp' },
      { category: 'lashes', type: 'composite', image: 'lashes-band-03.webp' },
      { category: 'lashes', type: 'composite', image: 'lashes-band-04.webp' },
      { category: 'lashes', type: 'composite', image: 'lashes-band-05.webp' },
      /* --- خط چشم --- */
      { category: 'eyeliner', type: 'composite', image: 'eyeliner-01.webp' },
      { category: 'eyeliner', type: 'composite', image: 'eyeliner-02.webp' },
      /* --- لیفت و لمینت --- */
      { category: 'lash-lift', type: 'composite', image: 'lashes-lift-01.webp' },
      { category: 'lash-lift', type: 'composite', image: 'lashes-lift-02.webp' },
      { category: 'lash-lift', type: 'composite', image: 'lashes-lift-03.webp' },
      { category: 'lash-lift', type: 'composite', image: 'lashes-lift-04.webp' }
    ];

    var activePortfolioFilter = 'all';
    var portfolioRoot = 'assets/img/portfolio/';
    var portfolioBrand = 'assets/img/brand/logo.png';

    function portfolioImage(file, alt, label) {
      return '<div class="portfolio-card__pane">' +
               '<img src="' + portfolioRoot + file + '" alt="' + u.esc(alt) + '" loading="lazy">' +
               (label ? '<span class="portfolio-card__label">' + label + '</span>' : '') +
             '</div>';
    }

    function portfolioMedia(item) {
      var brand = '<img class="portfolio-card__brand" src="' + portfolioBrand + '" alt="" aria-hidden="true">';
      var category = PORTFOLIO_LABELS[item.category];

      if (item.type === 'pair') {
        return '<div class="portfolio-card__media portfolio-card__media--pair">' +
                 portfolioImage(item.before, category + ' — قبل', 'قبل') +
                 portfolioImage(item.after, category + ' — بعد', 'بعد') +
                 brand +
               '</div>';
      }

      return '<div class="portfolio-card__media' +
               (item.type === 'composite' ? ' portfolio-card__media--composite' : '') + '">' +
               '<img src="' + portfolioRoot + item.image + '" alt="' + u.esc(item.title) + '" loading="lazy">' +
               brand +
             '</div>';
    }

    function portfolioCard(item) {
      var category = PORTFOLIO_LABELS[item.category];
      return '<article class="portfolio-card" data-category="' + item.category + '">' +
               portfolioMedia(item) +
               '<div class="portfolio-card__body">' +
                 '<span class="portfolio-card__category">' + u.esc(category) + '</span>' +
                 '<h3>' + u.esc(item.title) + '</h3>' +
                 '<span class="portfolio-card__note">طراحی متناسب با فرم چهره</span>' +
               '</div>' +
             '</article>';
    }

    function drawWorks(filter) {
      var works = u.$('#worksList');
      if (!works) return;

      var visible = filter === 'all'
        ? PORTFOLIO
        : PORTFOLIO.filter(function (item) { return item.category === filter; });

      works.innerHTML = visible.map(portfolioCard).join('');
    }

    /* ---------- کشیدن ریل نمونه‌کار با موس و لمس ---------- */
    function enablePortfolioDrag() {
      var rail = u.$('#worksList');
      if (!rail) return;

      var dragging = false;
      var moved = false;
      var startX = 0;
      var startScroll = 0;
      var lastX = 0;
      var lastAt = 0;
      var velocity = 0;
      var momentumFrame = 0;

      function stopMomentum() {
        if (momentumFrame) global.cancelAnimationFrame(momentumFrame);
        momentumFrame = 0;
        velocity = 0;
        rail.classList.remove('is-momentum');
      }

      function momentum() {
        velocity *= 0.93;
        if (Math.abs(velocity) < 0.08) {
          momentumFrame = 0;
          velocity = 0;
          rail.classList.remove('is-momentum');
          return;
        }
        rail.scrollLeft -= velocity * 16;
        momentumFrame = global.requestAnimationFrame(momentum);
      }

      rail.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        stopMomentum();
        dragging = true;
        moved = false;
        startX = e.clientX;
        startScroll = rail.scrollLeft;
        lastX = e.clientX;
        lastAt = performance.now();
        rail.classList.add('is-dragging');
        if (rail.setPointerCapture) rail.setPointerCapture(e.pointerId);
      });

      rail.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var now = performance.now();
        var distance = e.clientX - startX;
        var delta = e.clientX - lastX;
        var elapsed = Math.max(now - lastAt, 1);
        if (Math.abs(distance) > 4) moved = true;
        velocity = delta / elapsed;
        lastX = e.clientX;
        lastAt = now;
        rail.scrollLeft = startScroll - distance;
      });

      function stopDrag(e) {
        if (!dragging) return;
        dragging = false;
        rail.classList.remove('is-dragging');
        if (e && rail.releasePointerCapture && rail.hasPointerCapture(e.pointerId)) {
          rail.releasePointerCapture(e.pointerId);
        }
        if (Math.abs(velocity) > 0.08) {
          rail.classList.add('is-momentum');
          momentumFrame = global.requestAnimationFrame(momentum);
        }
      }

      rail.addEventListener('pointerup', stopDrag);
      rail.addEventListener('pointercancel', stopDrag);
      rail.addEventListener('pointerleave', function (e) {
        if (e.pointerType === 'mouse') stopDrag(e);
      });

      rail.addEventListener('click', function (e) {
        if (!moved) return;
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }, true);

      rail.addEventListener('wheel', function (e) {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        e.preventDefault();
        rail.scrollLeft += e.deltaY;
      }, { passive: false });
    }

    u.$$('.portfolio-filter').forEach(function (button) {
      button.addEventListener('click', function () {
        activePortfolioFilter = button.dataset.portfolioFilter || 'all';
        u.$$('.portfolio-filter').forEach(function (item) {
          var active = item === button;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-selected', String(active));
        });
        drawWorks(activePortfolioFilter);
        ZZ.shell.reveal();
      });
    });

    enablePortfolioDrag();

    /* رسم اولیه با داده‌ی محلی تا صفحه خالی نماند */
    drawServices();

    /* و بعد از رسیدن داده‌ی سرور، دوباره با مقادیر تازه */
    if (ZZ.ready && typeof ZZ.ready.then === 'function') {
      ZZ.ready.then(function (online) {
        if (online) { drawServices(); ZZ.shell.reveal(); }
      }).catch(function () { /* نسخه‌ی محلی نمایش داده می‌شود */ });
    }

    ZZ.shell.reveal();
  });
})(window);
