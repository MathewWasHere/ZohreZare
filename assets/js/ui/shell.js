/* ==========================================================================
   shell.js — هدر، منوی موبایل، فوتر و رفتارهای مشترک همه‌ی صفحات

   نکته‌ی مسیرها: صفحه‌های پنل داخل زیرپوشه هستند
   (panel/index.html و panel/admin/index.html)، پس همه‌ی لینک‌ها و
   مسیر دارایی‌ها با یک پیشوند (base) ساخته می‌شوند:
       ریشه            → ''
       panel/          → '../'
       panel/admin/    → '../../'
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = (global.ZZ = global.ZZ || {});
  var u = ZZ.u;
  var brand = ZZ.config.brand;

  /* پیشوند مسیر — با ZZ.shell({ base: '../' }) تنظیم می‌شود */
  var B = '';

  var NAV = [
    { href: 'index.html',    label: 'خانه',      key: 'home' },
    { href: 'services.html', label: 'خدمات',     key: 'services' },
    { href: 'booking.html',  label: 'رزرو نوبت', key: 'booking' },
    { href: 'about.html',    label: 'درباره ما', key: 'about' }
  ];

  /** آدرس پنل مناسب برای کاربر فعلی */
  function panelHref() {
    return ZZ.auth.isAdmin() ? B + 'panel/admin/index.html' : B + 'panel/index.html';
  }

  /** لینک مسیریابی گوگل‌مپ به مختصات سالن */
  function mapsLink() {
    var g = brand.geo;
    return 'https://www.google.com/maps/search/?api=1&query=' + g.lat + ',' + g.lng;
  }

  /**
   * لوگوی برند.
   * @param {string} sub  زیرنویس (پیش‌فرض از config)
   * @param {boolean} light نسخه‌ی روشن برای پس‌زمینه‌ی تیره
   */
  function brandMarkup(sub, light) {
    return '<a class="brand' + (light ? ' brand--light' : '') + '" href="' + B + 'index.html" ' +
              'aria-label="' + u.esc(brand.name) + '">' +
             '<img class="brand__logo" src="' + B + 'assets/img/brand/logo.png" ' +
                  'alt="' + u.esc(brand.name) + '" width="900" height="241">' +
             '<span class="brand__sub latin">' + u.esc(sub || brand.sub) + '</span>' +
           '</a>';
  }

  /* ---------------- هدر ---------------- */
  function buildHeader(active) {
    var loggedIn = ZZ.auth.isLoggedIn();

    var navItems = NAV.map(function (n) {
      return '<li><a class="nav__link' + (n.key === active ? ' is-active' : '') +
             '" href="' + B + n.href + '">' + n.label + '</a></li>';
    }).join('');

    /* به‌جای حرف اول اسم، یک باکس با نوشته‌ی «پروفایل» */
    var accountBtn = loggedIn
      ? '<a class="profile-box" href="' + panelHref() + '" title="پنل کاربری">پروفایل</a>'
      : '<a class="btn btn--ghost btn--sm" href="' + B + 'auth.html">ورود</a>';

    /* دکمه‌ی تماس و مشاوره‌ی رایگان — همیشه در دسترس */
    var callBtn =
      '<a class="call-btn" href="tel:' + brand.phoneHref + '" title="تماس و مشاوره رایگان">' +
        '<span class="call-btn__icon">' + ZZ.icon('phoneCall', null, 17) + '</span>' +
        '<span class="call-btn__text">' +
          '<span class="call-btn__label">مشاوره رایگان</span>' +
          '<span class="call-btn__num ltr phone-num">' + u.prettyPhoneHTML(brand.phone) + '</span>' +
        '</span>' +
      '</a>';

    var header = u.el('header', { class: 'header', id: 'siteHeader' });
    header.innerHTML =
      '<div class="container header__inner">' +
        brandMarkup() +
        '<nav class="nav" aria-label="منوی اصلی"><ul class="nav__list">' + navItems + '</ul></nav>' +
        '<div class="header__actions">' +
          callBtn +
          accountBtn +
          '<a class="btn btn--primary btn--sm header__cta" href="' + B + 'booking.html">رزرو نوبت</a>' +
          '<button class="burger" id="burgerBtn" aria-label="باز کردن منو" aria-expanded="false" aria-controls="mobileNav">' +
            '<span class="burger__box">' +
              '<span class="burger__line"></span>' +
              '<span class="burger__line"></span>' +
              '<span class="burger__line"></span>' +
            '</span>' +
          '</button>' +
        '</div>' +
      '</div>';

    /* منوی موبایل */
    var mobileLinks = NAV.map(function (n) {
      return { href: B + n.href, label: n.label, key: n.key };
    }).concat([
      loggedIn
        ? { href: panelHref(), label: ZZ.auth.isAdmin() ? 'پنل مدیریت' : 'پنل کاربری', key: 'account' }
        : { href: B + 'auth.html', label: 'ورود / ثبت‌نام', key: 'account' }
    ]).map(function (n) {
      return '<a class="mobile-nav__link' + (n.key === active ? ' is-active' : '') + '" href="' + n.href + '">' +
               '<span>' + n.label + '</span>' + ZZ.icon('chevronLeft', null, 16) +
             '</a>';
    }).join('');

    var mobileNav = u.el('div', { class: 'mobile-nav', id: 'mobileNav' });
    mobileNav.innerHTML =
      '<nav class="mobile-nav__list" aria-label="منوی موبایل">' + mobileLinks + '</nav>' +
      '<a class="btn btn--primary btn--block btn--lg" href="' + B + 'booking.html">رزرو نوبت</a>' +
      '<a class="btn btn--soft btn--block btn--lg" href="tel:' + brand.phoneHref + '" ' +
         'style="margin-top:var(--sp-3);">' + ZZ.icon('phoneCall', null, 18) + 'تماس و مشاوره رایگان</a>' +
      '<div style="margin-top:var(--sp-6);padding-top:var(--sp-5);border-top:1px solid var(--line);">' +
        '<a href="tel:' + brand.phoneHref + '" style="display:flex;align-items:center;gap:10px;color:var(--ink-700);margin-bottom:12px;">' +
          ZZ.icon('phone', null, 18) + '<span class="ltr phone-num">' + u.prettyPhoneHTML(brand.phone) + '</span></a>' +
        '<a href="' + mapsLink() + '" target="_blank" rel="noopener" ' +
           'style="display:flex;align-items:flex-start;gap:10px;color:var(--text-muted);font-size:var(--fs-sm);line-height:1.9;">' +
          ZZ.icon('pin', null, 18) + '<span>' + u.esc(brand.address) + '</span></a>' +
      '</div>';

    return { header: header, mobileNav: mobileNav };
  }

  /* ---------------- فوتر ---------------- */
  function buildFooter() {
    var hours = brand.hours.map(function (h) {
      return '<div style="display:flex;justify-content:space-between;gap:12px;font-size:var(--fs-sm);color:var(--ink-300);">' +
               '<span>' + u.esc(h.day) + '</span><span>' + u.esc(h.time) + '</span></div>';
    }).join('');

    var serviceLinks = ZZ.services.getAll().map(function (s) {
      return '<a href="' + B + 'service.html?s=' + s.slug + '">' + u.esc(s.title) + '</a>';
    }).join('');

    var loggedIn = ZZ.auth.isLoggedIn();

    var footer = u.el('footer', { class: 'footer' });
    footer.innerHTML =
      '<div class="container">' +
        '<div class="footer__grid">' +
          '<div class="footer__brand">' +
            brandMarkup(null, true) +
            '<p class="footer__desc">' +
              'آکادمی تخصصی لب، مژه و ابرو با تمرکز بر طراحی متناسب با چهره، رعایت کامل بهداشت و نتیجه‌ای که آرام و طبیعی به نظر می‌رسد.' +
            '</p>' +
          '</div>' +
          '<div>' +
            '<h4 class="footer__title">خدمات</h4>' +
            '<div class="footer__links">' + serviceLinks + '</div>' +
          '</div>' +
          '<div>' +
            '<h4 class="footer__title">دسترسی سریع</h4>' +
            '<div class="footer__links">' +
              '<a href="' + B + 'booking.html">رزرو نوبت</a>' +
              '<a href="' + (loggedIn ? panelHref() : B + 'auth.html') + '">' +
                (loggedIn ? 'پنل کاربری' : 'ورود / ثبت‌نام') + '</a>' +
              '<a href="' + B + 'about.html">درباره ما</a>' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<h4 class="footer__title">تماس و ساعات کاری</h4>' +
            '<div class="footer__links" style="margin-bottom:12px;">' +
              '<a href="tel:' + brand.phoneHref + '" class="ltr phone-num" style="align-self:flex-start;">' +
                u.prettyPhoneHTML(brand.phone) + '</a>' +
              '<span style="color:var(--ink-300);font-size:var(--fs-sm);line-height:1.9;">' + u.esc(brand.address) + '</span>' +
            '</div>' + hours +
          '</div>' +
        '</div>' +
        '<div class="footer__bottom">' +
          '<span>© ' + u.toFa('۱۴۰۵') + ' ' +
            '<a class="credit-link" href="https://t.me/MathewRepresents" target="_blank" rel="noopener">Mathew</a>' +
            ' — تمام حقوق محفوظ است.</span>' +
          '<div class="footer__socials">' +
            '<a href="' + brand.instagram + '" target="_blank" rel="noopener" aria-label="اینستاگرام">' + ZZ.icon('instagram', null, 18) + '</a>' +
            '<a href="' + brand.whatsapp + '" target="_blank" rel="noopener" aria-label="واتساپ">' + ZZ.icon('whatsapp', null, 18) + '</a>' +
            '<a href="' + brand.telegram + '" target="_blank" rel="noopener" aria-label="تلگرام">' + ZZ.icon('telegram', null, 18) + '</a>' +
            '<a href="' + mapsLink() + '" target="_blank" rel="noopener" aria-label="مسیریابی روی نقشه" ' +
               'title="مسیریابی روی نقشه">' + ZZ.icon('map', null, 18) + '</a>' +
          '</div>' +
        '</div>' +
      '</div>';
    return footer;
  }

  /* ---------------- انیمیشن ورود ملایم ---------------- */
  function initReveal() {
    var items = u.$$('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in global) || u.reducedMotion()) {
      items.forEach(function (n) { n.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var delay = parseInt(e.target.dataset.delay || '0', 10);
        setTimeout(function () { e.target.classList.add('is-visible'); }, delay);
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (n) { io.observe(n); });
  }

  /* ---------------- راه‌اندازی ---------------- */
  /**
   * @param {{active?:string, footer?:boolean, base?:string}} opts
   */
  ZZ.shell = function (opts) {
    var o = opts || {};
    B = o.base || '';

    var built = buildHeader(o.active);

    var mount = u.$('#shellHeader');
    if (mount) {
      mount.replaceWith(built.header);
      built.header.insertAdjacentElement('afterend', built.mobileNav);
    }

    var footMount = u.$('#shellFooter');
    if (footMount && o.footer !== false) footMount.replaceWith(buildFooter());
    else if (footMount) footMount.remove();

    /* منوی موبایل */
    var burger = u.$('#burgerBtn');
    var mnav = u.$('#mobileNav');
    if (burger && mnav) {
      burger.addEventListener('click', function () {
        var open = mnav.classList.toggle('is-open');
        burger.classList.toggle('is-open', open);
        burger.setAttribute('aria-expanded', String(open));
        burger.setAttribute('aria-label', open ? 'بستن منو' : 'باز کردن منو');
        document.body.classList.toggle('is-locked', open);
      });
      mnav.addEventListener('click', function (e) {
        if (e.target.closest('a')) {
          mnav.classList.remove('is-open');
          burger.classList.remove('is-open');
          document.body.classList.remove('is-locked');
        }
      });
      global.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && mnav.classList.contains('is-open')) burger.click();
      });
    }

    /* سایه‌ی هدر هنگام اسکرول */
    var header = built.header;
    var onScroll = function () {
      header.classList.toggle('is-stuck', global.scrollY > 8);
    };
    global.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    initReveal();
  };

  ZZ.shell.reveal = initReveal;
  /** آدرس پنل مناسب کاربر فعلی — برای استفاده در صفحه‌های دیگر */
  ZZ.shell.panelHref = panelHref;
  ZZ.shell.setBase = function (b) { B = b || ''; };
  ZZ.shell.mapsLink = mapsLink;
})(window);
