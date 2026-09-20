/* ==========================================================================
   service-detail.js — صفحه‌ی جزئیات یک خدمت (service.html?s=slug)
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = global.ZZ;
  var u = ZZ.u;
  var CUR = ZZ.config.booking.currency;

  function notFound(root) {
    root.innerHTML =
      '<div class="section"><div class="container">' +
        '<div class="empty" style="max-width:520px;margin-inline:auto;">' +
          '<div class="empty__icon">' + ZZ.icon('empty', null, 56) + '</div>' +
          '<h3>این خدمت پیدا نشد</h3>' +
          '<p>ممکن است آدرس اشتباه باشد یا این خدمت دیگر ارائه نشود.</p>' +
          '<a class="btn btn--primary" href="services.html" style="margin-top:var(--sp-4);">' +
            'بازگشت به فهرست خدمات</a>' +
        '</div>' +
      '</div></div>';
  }

  /**
   * بلوک مراقبتی و هشدارهای یک خدمت را برمی‌گرداند.
   *
   * دو منبع وجود دارد: ستون‌های آماده‌ی سرور (وقتی سایت به API وصل
   * است) و بلوک‌های مشترک محلی در service-care.js (حالت آفلاین یا
   * وقتی مدیر هنوز متنی وارد نکرده). اولی مقدم است.
   */
  function careOf(s) {
    var shared = ZZ.services.careOf ? ZZ.services.careOf(s) : null;
    var pmuBlock = (ZZ.care && ZZ.care.pmu) ? ZZ.care.pmu : null;

    var pre = (s.precare && s.precare.length) ? s.precare : (shared ? shared.pre : []);
    var post = (s.aftercare && s.aftercare.length) ? s.aftercare : (shared ? shared.post : []);
    var label = s.careLabel || (shared ? shared.label : '');

    /* فهرست ممنوعه‌ها فقط برای خدمت‌های رنگ‌دانه‌ای (PMU) معنا دارد */
    var contra = [];
    var contraNote = '';
    if (s.contraindications && s.contraindications.length) {
      contra = s.contraindications;
      contraNote = s.contraindicationsNote || '';
    } else if (s.pmu && pmuBlock) {
      contra = pmuBlock.items;
      contraNote = pmuBlock.note;
    }

    return { pre: pre, post: post, label: label, contra: contra, contraNote: contraNote };
  }

  /** یک بخش فهرستی ساده (تیک‌دار) */
  function listSection(title, items, sub) {
    if (!items || !items.length) return '';
    return '<div class="reveal" style="margin-top:var(--sp-6);">' +
             '<h2 style="font-size:var(--fs-xl);margin-bottom:' + (sub ? 'var(--sp-2)' : 'var(--sp-4)') + ';">' +
               u.esc(title) + '</h2>' +
             (sub ? '<p style="color:var(--text-muted);font-size:var(--fs-sm);margin-bottom:var(--sp-4);">' +
                      u.esc(sub) + '</p>' : '') +
             '<ul class="check-list">' +
               items.map(function (x) {
                 return '<li>' + ZZ.icon('check') + '<span>' + u.esc(x) + '</span></li>';
               }).join('') +
             '</ul>' +
           '</div>';
  }

  function render(root, s) {
    document.title = s.title + ' | ' + ZZ.config.brand.name;
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', s.short);

    /* ---- بلوک‌های مشترک مراقبت / هشدار ---- */
    var care = careOf(s);

    /* ---- جدول قیمت ---- */
    var priceRows = s.variants.map(function (v) {
      return '' +
        '<div class="price-row">' +
          '<div>' +
            '<div class="price-row__name">' + u.esc(v.name) + '</div>' +
            (v.note ? '<div class="price-row__note">' + u.esc(v.note) + '</div>' : '') +
          '</div>' +
          '<div class="price-row__meta">' +
            '<div class="price-row__price">' + u.money(v.price) + ' ' + CUR + '</div>' +
            '<div class="price-row__time">' + u.duration(v.durationMin) + '</div>' +
          '</div>' +
        '</div>';
    }).join('');

    /* ---- سوالات متداول ---- */
    var faq = s.faq.map(function (f, i) {
      return '' +
        '<div class="faq-item" data-faq="' + i + '">' +
          '<button class="faq-q" type="button" aria-expanded="false">' +
            '<span>' + u.esc(f.q) + '</span>' + ZZ.icon('plus', null, 18) +
          '</button>' +
          '<div class="faq-a"><div><p>' + u.esc(f.a) + '</p></div></div>' +
        '</div>';
    }).join('');

    /* ---- خدمات دیگر ---- */
    var others = ZZ.services.getAll().filter(function (x) { return x.id !== s.id; });
    var otherCards = others.map(function (x) {
      return '' +
        '<a href="service.html?s=' + x.slug + '" class="card card--pad card--hover" ' +
           'style="display:flex;gap:var(--sp-3);align-items:center;color:inherit;">' +
          '<span style="flex-shrink:0;width:40px;height:40px;display:grid;place-items:center;' +
                'border-radius:50%;background:var(--blush-100);color:var(--rose-500);">' +
            ZZ.icon(x.icon, null, 20) + '</span>' +
          '<span style="flex:1;min-width:0;">' +
            '<span style="display:block;font-weight:500;line-height:1.6;">' + u.esc(x.title) + '</span>' +
            '<span style="display:block;font-size:var(--fs-xs);color:var(--text-muted);">' +
              'از ' + u.money(x.priceFrom) + ' ' + CUR + '</span>' +
          '</span>' +
          ZZ.icon('chevronLeft', null, 18) +
        '</a>';
    }).join('');

    root.innerHTML = '' +
      /* ---------- سربرگ ---------- */
      '<div class="page-head">' +
        '<div class="container">' +
          '<nav class="crumbs" aria-label="مسیر">' +
            '<a href="index.html">خانه</a><span>/</span>' +
            '<a href="services.html">خدمات</a><span>/</span>' +
            '<span>' + u.esc(s.title) + '</span>' +
          '</nav>' +
          '<span class="eyebrow">' + u.duration(s.durationMin) + ' • از ' + u.money(s.priceFrom) + ' ' + CUR + '</span>' +
          '<h1>' + u.esc(s.title) + '</h1>' +
          (s.tagline ? '<p class="page-head__tagline">' + u.esc(s.tagline) + '</p>' : '') +
          '<p>' + u.esc(s.short) + '</p>' +
        '</div>' +
      '</div>' +

      /* ---------- بدنه ---------- */
      '<div class="section">' +
        '<div class="container">' +
          '<div class="detail-layout">' +

            /* ستون اصلی */
            '<div>' +
              '<div class="detail-hero reveal">' +
                '<img src="' + s.image + '" alt="' + u.esc(s.title) + '" width="1200" height="675">' +
              '</div>' +

              '<div class="prose reveal">' +
                '<h2>درباره‌ی این خدمت</h2>' +
                s.description.map(function (p) { return '<p>' + u.esc(p) + '</p>'; }).join('') +
              '</div>' +

              /* ---- مزایا ---- */
              (function () {
                if (!s.benefits || !s.benefits.length) return '';
                return '<div class="reveal" style="margin-top:var(--sp-6);">' +
                         '<h2 style="font-size:var(--fs-xl);margin-bottom:var(--sp-4);">مزایای این خدمت</h2>' +
                         '<ul class="check-list">' +
                           s.benefits.map(function (x) {
                             return '<li>' + ZZ.icon('sparkle') + '<span>' + u.esc(x) + '</span></li>';
                           }).join('') +
                         '</ul>' +
                       '</div>';
              })() +

              '<div class="reveal" style="margin-top:var(--sp-6);">' +
                '<h2 style="font-size:var(--fs-xl);margin-bottom:var(--sp-4);">این جلسه شامل چیست؟</h2>' +
                '<ul class="check-list">' +
                  s.includes.map(function (x) {
                    return '<li>' + ZZ.icon('check') + '<span>' + u.esc(x) + '</span></li>';
                  }).join('') +
                '</ul>' +
              '</div>' +

              /* ---- نکات مهم قبل از رزرو ---- */
              (function () {
                if (!s.beforeReserve || !s.beforeReserve.length) return '';
                return '<div class="reveal" style="margin-top:var(--sp-6);">' +
                         '<h2 style="font-size:var(--fs-xl);margin-bottom:var(--sp-4);">' +
                           'نکات مهم قبل از رزرو نوبت</h2>' +
                         '<div class="card card--pad">' +
                           '<ul class="check-list check-list--soft">' +
                             s.beforeReserve.map(function (x) {
                               return '<li>' + ZZ.icon('info') + '<span>' + u.esc(x) + '</span></li>';
                             }).join('') +
                           '</ul>' +
                         '</div>' +
                       '</div>';
              })() +

              '<div class="reveal" style="margin-top:var(--sp-6);">' +
                '<h2 style="font-size:var(--fs-xl);margin-bottom:var(--sp-4);">گزینه‌ها و قیمت‌ها</h2>' +
                '<div class="card card--pad"><div class="price-table">' + priceRows + '</div></div>' +
                '<div class="note note--warn" style="margin-top:var(--sp-3);">' +
                  ZZ.icon('info') +
                  '<span>قیمت‌های این نسخه نمونه هستند و با تعرفه‌ی واقعی سالن جایگزین می‌شوند. ' +
                  'قیمت نهایی در جلسه‌ی مشاوره و بر اساس وضعیت مژه و ابروی شما اعلام می‌شود.</span>' +
                '</div>' +
              '</div>' +

              /* ---- مراقبت‌های قبل از کار ---- */
              listSection('مراقبت‌های قبل از انجام کار', care.pre,
                care.label ? ('این موارد برای ' + care.label + ' مشترک است.') : '') +

              /* ---- مراقبت‌های بعد از کار ---- */
              listSection('مراقبت‌های بعد از انجام کار', care.post,
                care.label ? ('این موارد برای ' + care.label + ' مشترک است.') : '') +

              /* ---- موارد ممنوعه — فقط خدمت‌های رنگ‌دانه‌ای ---- */
              (function () {
                if (!care.contra.length) return '';
                return '<div class="reveal" style="margin-top:var(--sp-6);">' +
                         '<h2 style="font-size:var(--fs-xl);margin-bottom:var(--sp-2);">' +
                           'بیماری‌ها و شرایطی که باید اطلاع دهید</h2>' +
                         '<p style="color:var(--text-muted);font-size:var(--fs-sm);margin-bottom:var(--sp-4);">' +
                           'این موارد مانع همیشگی نیستند؛ بسته به شدت و نظر پزشک قابل انجام هستند. ' +
                           'قبل از رزرو با ما هماهنگ کنید تا بهترین تصمیم را با هم بگیریم.</p>' +
                         '<ul class="check-list check-list--soft">' +
                           care.contra.map(function (x) {
                             return '<li>' + ZZ.icon('alert') + '<span>' + u.esc(x) + '</span></li>';
                           }).join('') +
                         '</ul>' +
                         (care.contraNote
                           ? '<div class="note note--warn" style="margin-top:var(--sp-4);">' +
                               ZZ.icon('info') + '<span>' + u.esc(care.contraNote) + '</span></div>'
                           : '') +
                       '</div>';
              })() +

              '<div class="reveal" style="margin-top:var(--sp-6);">' +
                '<h2 style="font-size:var(--fs-xl);margin-bottom:var(--sp-2);">سوال‌های پرتکرار</h2>' +
                '<div id="faqList">' + faq + '</div>' +
              '</div>' +
            '</div>' +

            /* ستون کناری */
            '<aside class="detail-aside">' +
              '<div class="card booking-box reveal">' +
                '<span class="badge badge--accent" style="margin-bottom:var(--sp-3);">' +
                  ZZ.icon('sparkle', null, 14) + 'مشاوره رایگان</span>' +
                '<div class="booking-box__price">' +
                  '<span>شروع از</span>' +
                  '<strong>' + u.money(s.priceFrom) + '</strong>' +
                  '<span>' + CUR + '</span>' +
                '</div>' +

                '<div class="booking-box__rows">' +
                  '<div class="booking-box__row">' +
                    '<span>' + ZZ.icon('clock') + 'مدت تقریبی</span>' +
                    '<strong>' + u.duration(s.durationMin) + '</strong>' +
                  '</div>' +
                  '<div class="booking-box__row">' +
                    '<span>' + ZZ.icon('tag') + 'تعداد گزینه‌ها</span>' +
                    '<strong>' + u.toFa(s.variants.length) + ' مورد</strong>' +
                  '</div>' +
                  '<div class="booking-box__row">' +
                    '<span>' + ZZ.icon('shield') + 'ابزار استریل</span>' +
                    '<strong>بله</strong>' +
                  '</div>' +
                '</div>' +

                '<a class="btn btn--primary btn--block btn--lg" href="booking.html?service=' + s.id + '">' +
                  'رزرو این خدمت</a>' +
                '<a class="btn btn--quiet btn--block btn--sm" href="tel:' + ZZ.config.brand.phoneHref + '" ' +
                   'style="margin-top:var(--sp-3);">' + ZZ.icon('phone', null, 16) + 'مشاوره تلفنی</a>' +
              '</div>' +

              '<div class="card card--pad reveal" style="margin-top:var(--sp-4);">' +
                '<h3 style="font-size:var(--fs-md);margin-bottom:var(--sp-3);">مناسب برای</h3>' +
                '<div class="pill-row">' +
                  s.goodFor.map(function (g) {
                    return '<span class="badge badge--accent">' + u.esc(g) + '</span>';
                  }).join('') +
                '</div>' +
              '</div>' +

              '<div class="reveal" style="margin-top:var(--sp-4);display:flex;flex-direction:column;gap:var(--sp-2);">' +
                '<h3 style="font-size:var(--fs-md);margin-bottom:var(--sp-1);">خدمات دیگر</h3>' +
                otherCards +
              '</div>' +
            '</aside>' +

          '</div>' +
        '</div>' +
      '</div>' +

      /* ---------- CTA ---------- */
      '<div class="section--tight"><div class="container">' +
        '<div class="cta-band reveal">' +
          '<div class="cta-band__photo" aria-hidden="true">' +
            '<picture>' +
              '<source media="(max-width: 819px)" srcset="assets/img/banner-cta-mobile.jpg">' +
              '<img src="assets/img/banner-cta.jpg" alt="" loading="lazy" width="1208" height="313">' +
            '</picture>' +
          '</div>' +
          '<div class="cta-band__inner">' +
          '<h2>آماده‌اید شروع کنیم؟</h2>' +
          '<p>روز و ساعت دلخواهتان را انتخاب کنید؛ تایید نوبت بلافاصله انجام می‌شود.</p>' +
          '<div class="cta-actions">' +
            '<a class="btn btn--primary btn--lg" href="booking.html?service=' + s.id + '">رزرو ' + u.esc(s.title) + '</a>' +
            '<a class="btn btn--ghost btn--lg" href="services.html">دیدن بقیه‌ی خدمات</a>' +
          '</div>' +
          '</div>' +
        '</div>' +
      '</div></div>';

    /* ---- آکاردئون ---- */
    var faqList = u.$('#faqList');
    if (faqList) {
      faqList.addEventListener('click', function (e) {
        var btn = e.target.closest('.faq-q');
        if (!btn) return;
        var item = btn.closest('.faq-item');
        var open = item.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', String(open));
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    ZZ.shell({ active: 'services' });

    var root = u.$('#serviceRoot');
    var slug = u.param('s');

    var draw = function () {
      var svc = slug ? ZZ.services.getBySlug(slug) : null;
      if (!svc) notFound(root);
      else render(root, svc);
      ZZ.shell.reveal();
    };

    /* اگر بک‌اند فعال باشد، متن‌ها و قیمت‌ها از سرور می‌آیند و
       ممکن است مدیر آن‌ها را ویرایش کرده باشد. پس باید منتظر
       ZZ.ready بمانیم؛ وگرنه همیشه نسخه‌ی محلی و قدیمی را
       نشان می‌دهیم. */
    if (ZZ.ready && typeof ZZ.ready.then === 'function') {
      ZZ.ready.then(draw).catch(draw);
    } else {
      draw();
    }
  });
})(window);
