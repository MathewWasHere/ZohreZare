/* ==========================================================================
   about.js — صفحه‌ی درباره ما
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = global.ZZ;
  var u = ZZ.u;
  var brand = ZZ.config.brand;


  /* ---------------- نقشه ----------------
     دو حالت:
     ۱) اگر کلید Google Maps در config باشد → iframe رسمی Embed API
     ۲) بدون کلید → iframe رایگان گوگل‌مپ (بدون نیاز به حساب)
     در هر دو حالت، کلیک روی دکمه مسیریابی را در اپ گوگل‌مپ باز می‌کند. */
  function buildMap() {
    var wrap = u.$('#mapWrap');
    if (!wrap) return;

    var g = brand.geo;
    var key = (ZZ.config.maps && ZZ.config.maps.apiKey) || '';
    var q = g.lat + ',' + g.lng;

    /* لینک مسیریابی — روی موبایل اپ گوگل‌مپ باز می‌شود */
    var directions = 'https://www.google.com/maps/dir/?api=1&destination=' + q;
    var viewLink = 'https://www.google.com/maps/search/?api=1&query=' + q;

    var src = key
      ? 'https://www.google.com/maps/embed/v1/place?key=' + encodeURIComponent(key) +
        '&q=' + q + '&zoom=' + g.zoom + '&language=fa&region=IR'
      /* حالت بدون کلید: خروجی embed کلاسیک گوگل — رایگان و بدون ثبت‌نام */
      : 'https://maps.google.com/maps?q=' + q + '&z=' + g.zoom + '&hl=fa&output=embed';

    wrap.innerHTML =
      '<div class="map-card">' +
        '<div class="map-frame">' +
          '<iframe src="' + src + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" ' +
                  'title="موقعیت آکادمی روی نقشه" allowfullscreen></iframe>' +
        '</div>' +
        '<div class="map-card__foot">' +
          '<div>' +
            '<div style="display:flex;align-items:flex-start;gap:8px;font-size:var(--fs-sm);' +
                 'line-height:1.9;color:var(--ink-800);font-weight:500;">' +
              '<span style="color:var(--rose-500);flex-shrink:0;">' + ZZ.icon('pin', null, 18) + '</span>' +
              '<span>' + u.esc(brand.address) + '</span>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:var(--sp-2);flex-wrap:wrap;">' +
            '<a class="btn btn--primary btn--sm" href="' + directions + '" target="_blank" rel="noopener">' +
              ZZ.icon('map', null, 16) + 'مسیریابی</a>' +
            '<a class="btn btn--ghost btn--sm" href="' + viewLink + '" target="_blank" rel="noopener">' +
              'باز کردن در گوگل‌مپ</a>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    ZZ.shell({ active: 'about' });

    buildMap();

    /* ---------- ارزش‌ها ---------- */
    var values = [
      { icon: 'shield',  title: 'بهداشت بدون استثنا',
        text: 'ابزارها قبل از هر جلسه استریل می‌شوند و برای هر مراجعه‌کننده ست یک‌بارمصرف جداگانه باز می‌شود.' },
      { icon: 'sparkle', title: 'طراحی متناسب با چهره',
        text: 'قبل از شروع، فرم پیشنهادی را روی صورت شما می‌کشیم و تا وقتی راضی نشوید جلو نمی‌رویم.' },
      { icon: 'clock',   title: 'احترام به وقت شما',
        text: 'هر جلسه فقط یک پذیرش دارد. نه معطلی، نه عجله، نه تمدید بی‌خبر.' },
      { icon: 'heart',   title: 'پیگیری بعد از کار',
        text: 'تا جلسه‌ی بعد پاسخگوی سوال‌هایتان هستیم و در صورت نیاز، رفع اشکال رایگان است.' }
    ];

    var grid = u.$('#valueGrid');
    if (grid) {
      grid.innerHTML = values.map(function (v, i) {
        return '<div class="value reveal" data-delay="' + (i * 80) + '">' +
                 '<div class="value__icon">' + ZZ.icon(v.icon) + '</div>' +
                 '<h3>' + u.esc(v.title) + '</h3>' +
                 '<p>' + u.esc(v.text) + '</p>' +
               '</div>';
      }).join('');
    }

    /* ---------- تماس ---------- */
    var contact = u.$('#contactCard');
    if (contact) {
      contact.innerHTML = '' +
        '<div style="display:flex;align-items:flex-start;gap:var(--sp-3);padding-bottom:var(--sp-4);' +
             'border-bottom:1px dashed var(--line);">' +
          '<span style="color:var(--rose-500);flex-shrink:0;">' + ZZ.icon('pin', null, 20) + '</span>' +
          '<div><strong style="display:block;font-weight:500;margin-bottom:2px;">آدرس</strong>' +
          '<span class="muted" style="font-size:var(--fs-sm);line-height:1.9;">' + u.esc(brand.address) + '</span></div>' +
        '</div>' +
        '<div style="display:flex;align-items:flex-start;gap:var(--sp-3);padding-block:var(--sp-4);' +
             'border-bottom:1px dashed var(--line);">' +
          '<span style="color:var(--rose-500);flex-shrink:0;">' + ZZ.icon('phone', null, 20) + '</span>' +
          '<div><strong style="display:block;font-weight:500;margin-bottom:2px;">تلفن</strong>' +
          '<a class="ltr phone-num" style="display:inline-block;" href="tel:' + brand.phoneHref + '">' + u.prettyPhoneHTML(brand.phone) + '</a></div>' +
        '</div>' +
        '<div style="display:flex;gap:var(--sp-2);padding-top:var(--sp-4);flex-wrap:wrap;">' +
          '<a class="btn btn--soft btn--sm" href="' + brand.instagram + '" target="_blank" rel="noopener">' +
            ZZ.icon('instagram', null, 16) + 'اینستاگرام</a>' +
          '<a class="btn btn--soft btn--sm" href="' + brand.whatsapp + '" target="_blank" rel="noopener">' +
            ZZ.icon('whatsapp', null, 16) + 'واتساپ</a>' +
          '<a class="btn btn--soft btn--sm" href="' + brand.telegram + '" target="_blank" rel="noopener">' +
            ZZ.icon('telegram', null, 16) + 'تلگرام</a>' +
          '<a class="btn btn--soft btn--sm" href="https://www.google.com/maps/search/?api=1&query=' +
             brand.geo.lat + ',' + brand.geo.lng + '" target="_blank" rel="noopener">' +
            ZZ.icon('map', null, 16) + 'نقشه</a>' +
        '</div>';
    }

    /* ---------- ساعات کاری ---------- */
    var hours = u.$('#hoursCard');
    if (hours) {
      hours.innerHTML = brand.hours.map(function (h, i) {
        var off = h.time === 'تعطیل';
        return '<div style="display:flex;justify-content:space-between;align-items:center;gap:var(--sp-3);' +
                    'padding:var(--sp-3) 0;' +
                    (i < brand.hours.length - 1 ? 'border-bottom:1px dashed var(--line);' : '') + '">' +
                 '<span style="font-weight:500;">' + u.esc(h.day) + '</span>' +
                 '<span class="badge ' + (off ? 'badge--muted' : 'badge--ok') + '">' + u.esc(h.time) + '</span>' +
               '</div>';
      }).join('');
    }

    ZZ.shell.reveal();
  });
})(window);
