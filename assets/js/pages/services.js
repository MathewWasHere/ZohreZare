/* ==========================================================================
   services.js (صفحه) — فهرست خدمات و جدول مقایسه
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = global.ZZ;
  var u = ZZ.u;

  function cardHTML(s) {
    return '' +
      '<article class="svc-card">' +
        '<div class="svc-card__media">' +
          '<img src="' + s.image + '" alt="' + u.esc(s.title) + '" loading="lazy" width="800" height="500">' +
          '<span class="svc-card__icon">' + ZZ.icon(s.icon) + '</span>' +
        '</div>' +
        '<div class="svc-card__body">' +
          '<h3 class="svc-card__title">' + u.esc(s.title) + '</h3>' +
          '<p class="svc-card__text">' + u.esc(s.short) + '</p>' +
          '<div class="pill-row" style="margin-bottom:var(--sp-4);">' +
            s.variants.slice(0, 3).map(function (v) {
              return '<span class="badge">' + u.esc(v.name) + '</span>';
            }).join('') +
            (s.variants.length > 3 ? '<span class="badge badge--muted">+' + u.toFa(s.variants.length - 3) + '</span>' : '') +
          '</div>' +
          '<div class="svc-card__meta">' +
            '<span>' + ZZ.icon('clock') + u.duration(s.durationMin) + '</span>' +
            '<span>' + ZZ.icon('tag') + 'از ' + u.money(s.priceFrom) + ' ' + ZZ.config.booking.currency + '</span>' +
          '</div>' +
          '<div class="svc-card__actions">' +
            '<a class="btn btn--ghost btn--sm" href="service.html?s=' + s.slug + '">جزئیات کامل</a>' +
            '<a class="btn btn--primary btn--sm" href="booking.html?service=' + s.id + '">رزرو</a>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function draw() {
    var list = ZZ.services.getAll();

    var grid = u.$('#servicesGrid');
    if (grid) {
      grid.innerHTML = list.map(function (s, i) {
        return '<div class="reveal" data-delay="' + (i * 90) + '">' + cardHTML(s) + '</div>';
      }).join('');
    }

    /* ---------- مقایسه ---------- */
    var compare = u.$('#compareCard');
    if (compare) {
      compare.innerHTML = list.map(function (s, i) {
        return '' +
          '<div style="display:flex;gap:var(--sp-4);align-items:flex-start;padding:var(--sp-4) 0;' +
               (i < list.length - 1 ? 'border-bottom:1px dashed var(--line);' : '') + '">' +
            '<span style="flex-shrink:0;width:42px;height:42px;display:grid;place-items:center;' +
                  'border-radius:50%;background:var(--blush-100);color:var(--rose-500);">' +
              ZZ.icon(s.icon, null, 21) +
            '</span>' +
            '<div style="flex:1;min-width:0;">' +
              '<h3 style="font-size:var(--fs-md);margin-bottom:6px;">' + u.esc(s.title) + '</h3>' +
              '<p style="font-size:var(--fs-sm);color:var(--text-muted);line-height:1.9;margin-bottom:10px;">' +
                'مناسب برای: ' + s.goodFor.map(u.esc).join(' • ') +
              '</p>' +
              '<div class="svc-card__meta" style="border:none;padding:0;margin:0;">' +
                '<span>' + ZZ.icon('clock') + u.duration(s.durationMin) + '</span>' +
                '<span>' + ZZ.icon('tag') + 'از ' + u.money(s.priceFrom) + ' ' + ZZ.config.booking.currency + '</span>' +
              '</div>' +
            '</div>' +
            '<a class="btn btn--soft btn--sm" href="service.html?s=' + s.slug + '" style="flex-shrink:0;">جزئیات</a>' +
          '</div>';
      }).join('');
    }

    ZZ.shell.reveal();
  }

  document.addEventListener('DOMContentLoaded', function () {
    ZZ.shell({ active: 'services' });

    /* در حالت متصل به سرور، عنوان/قیمت/تگ‌ها ممکن است در پنل
       مدیریت ویرایش شده باشند؛ پس منتظر داده‌ی سرور می‌مانیم. */
    if (ZZ.ready && typeof ZZ.ready.then === 'function') {
      ZZ.ready.then(draw).catch(draw);
    } else {
      draw();
    }
  });
})(window);
