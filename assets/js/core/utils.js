/* ==========================================================================
   utils.js — توابع کمکی مشترک (تاریخ شمسی، اعداد فارسی، DOM، اعتبارسنجی)
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = (global.ZZ = global.ZZ || {});
  var FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  var u = {

    /* ---------------- اعداد ---------------- */

    /** تبدیل ارقام لاتین به فارسی */
    toFa: function (input) {
      return String(input == null ? '' : input).replace(/[0-9]/g, function (d) {
        return FA_DIGITS[+d];
      });
    },

    /** تبدیل ارقام فارسی/عربی به لاتین (برای ورودی کاربر) */
    toEn: function (input) {
      return String(input == null ? '' : input)
        .replace(/[\u06F0-\u06F9]/g, function (c) { return String(c.charCodeAt(0) - 0x06F0); })
        .replace(/[\u0660-\u0669]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); });
    },

    /** جداکننده‌ی هزارگان با ارقام فارسی */
    money: function (n) {
      if (n == null || isNaN(n)) return '—';
      return u.toFa(String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));
    },

    /** «۹۰ دقیقه» یا «۲ ساعت و ۳۰ دقیقه» */
    duration: function (minutes) {
      if (!minutes) return '—';
      var h = Math.floor(minutes / 60);
      var m = minutes % 60;
      if (h && m) return u.toFa(h) + ' ساعت و ' + u.toFa(m) + ' دقیقه';
      if (h) return u.toFa(h) + ' ساعت';
      return u.toFa(m) + ' دقیقه';
    },

    /* ---------------- تاریخ ---------------- */

    /** کلید تاریخ به شکل YYYY-MM-DD در تقویم میلادی (کلید داخلی) */
    dateKey: function (d) {
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    },

    /** ساخت Date از کلید */
    fromKey: function (key) {
      var p = String(key).split('-');
      return new Date(+p[0], +p[1] - 1, +p[2]);
    },

    _fmt: function (opts) {
      try {
        return new Intl.DateTimeFormat('fa-IR-u-ca-persian', opts);
      } catch (e) {
        try { return new Intl.DateTimeFormat('fa-IR', opts); } catch (e2) { return null; }
      }
    },

    /** «یکشنبه ۴ مرداد» */
    faDate: function (d, withYear) {
      var opts = { weekday: 'long', day: 'numeric', month: 'long' };
      if (withYear) opts.year = 'numeric';
      var f = u._fmt(opts);
      if (!f) return u.dateKey(d);
      /* Intl خروجی را به شکل «۱۴۰۵ مرداد ۴, یکشنبه» می‌دهد؛ مرتب‌سازی می‌کنیم */
      var parts = f.formatToParts(d);
      var get = function (t) {
        for (var i = 0; i < parts.length; i++) if (parts[i].type === t) return parts[i].value;
        return '';
      };
      var out = get('weekday') + ' ' + get('day') + ' ' + get('month');
      if (withYear) out += ' ' + get('year');
      return out.trim();
    },

    /** «۴ مرداد» */
    faDateShort: function (d) {
      var f = u._fmt({ day: 'numeric', month: 'long' });
      if (!f) return u.dateKey(d);
      var parts = f.formatToParts(d);
      var get = function (t) {
        for (var i = 0; i < parts.length; i++) if (parts[i].type === t) return parts[i].value;
        return '';
      };
      return (get('day') + ' ' + get('month')).trim();
    },

    /** نام کوتاه روز هفته: «یکشنبه» */
    faWeekday: function (d) {
      var f = u._fmt({ weekday: 'long' });
      return f ? f.format(d) : '';
    },

    /** حرف روز هفته — برای خانه‌های کوچک تقویم (ش ی د س چ پ ج) */
    faWeekdayShort: function (d) {
      var map = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];   /* 0=یکشنبه … 6=شنبه */
      return map[d.getDay()] || '';
    },

    /** «امروز» / «فردا» / نام روز */
    faDayLabel: function (d) {
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var t = new Date(d); t.setHours(0, 0, 0, 0);
      var diff = Math.round((t - today) / 86400000);
      if (diff === 0) return 'امروز';
      if (diff === 1) return 'فردا';
      return u.faWeekday(d);
    },

    /** آیا این تاریخ گذشته است؟ */
    isPast: function (dateKey, time) {
      var d = u.fromKey(dateKey);
      if (time) {
        var hm = String(time).split(':');
        d.setHours(+hm[0] || 0, +hm[1] || 0, 0, 0);
      } else {
        d.setHours(23, 59, 59, 999);
      }
      return d.getTime() < Date.now();
    },

    /** فاصله تا زمان نوبت به ساعت */
    hoursUntil: function (dateKey, time) {
      var d = u.fromKey(dateKey);
      var hm = String(time || '00:00').split(':');
      d.setHours(+hm[0] || 0, +hm[1] || 0, 0, 0);
      return (d.getTime() - Date.now()) / 3600000;
    },

    /* ---------------- تاریخ تولد (شمسی) ---------------- */

    /** نام ماه‌های شمسی */
    jMonths: [
      'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
      'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
    ],

    /** آیا سال شمسی کبیسه است؟ (الگوریتم ۳۳ساله) */
    isJalaliLeap: function (jy) {
      var r = jy % 33;
      return r === 1 || r === 5 || r === 9 || r === 13 ||
             r === 17 || r === 22 || r === 26 || r === 30;
    },

    /** تعداد روزهای یک ماه شمسی */
    jMonthDays: function (jy, jm) {
      if (jm <= 6) return 31;
      if (jm <= 11) return 30;
      return u.isJalaliLeap(jy) ? 30 : 29;
    },

    /** سال شمسی جاری */
    jCurrentYear: function () {
      try {
        var s = new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric' })
          .format(new Date());
        var n = parseInt(String(s).replace(/\D/g, ''), 10);
        if (n > 1300 && n < 1500) return n;
      } catch (e) { /* noop */ }
      /* تخمین پشتیبان */
      return new Date().getFullYear() - 621;
    },

    /**
     * اعتبارسنجی تاریخ تولد شمسی
     * @returns {{ok:boolean, msg?:string}}
     */
    validBirth: function (jy, jm, jd) {
      var cy = u.jCurrentYear();
      if (!jy || !jm || !jd) return { ok: false, msg: 'تاریخ تولد کامل نیست.' };
      if (jm < 1 || jm > 12) return { ok: false, msg: 'ماه معتبر نیست.' };
      if (jy < cy - 100 || jy > cy - 5) return { ok: false, msg: 'سال تولد معتبر نیست.' };
      var max = u.jMonthDays(jy, jm);
      if (jd < 1 || jd > max) {
        return { ok: false, msg: u.esc(u.jMonths[jm - 1]) + ' ' + u.toFa(max) + ' روز دارد.' };
      }
      return { ok: true };
    },

    /** «۱۲ مرداد ۱۳۷۵» */
    formatBirth: function (b) {
      if (!b || !b.y || !b.m || !b.d) return '';
      return u.toFa(b.d) + ' ' + u.jMonths[b.m - 1] + ' ' + u.toFa(b.y);
    },

    /* ---------------- اعتبارسنجی ---------------- */

    /** نرمال‌سازی شماره موبایل ایران به شکل 09xxxxxxxxx */
    normalizePhone: function (value) {
      var v = u.toEn(value || '').replace(/[\s\-()]/g, '');
      if (v.indexOf('+98') === 0) v = '0' + v.slice(3);
      else if (v.indexOf('0098') === 0) v = '0' + v.slice(4);
      else if (v.indexOf('98') === 0 && v.length === 12) v = '0' + v.slice(2);
      else if (v.length === 10 && v.indexOf('9') === 0) v = '0' + v;
      return v;
    },

    isValidPhone: function (value) {
      return /^09\d{9}$/.test(u.normalizePhone(value));
    },

    /** نمایش زیبای شماره با خط تیره: ۰۹۱۷-۸۳۹-۹۰۵۵ */
    /**
     * نمایش شماره با نقطه‌ی کم‌رنگ بین بخش‌ها: ۰۹۱۷ · ۸۳۹ · ۹۰۵۵
     * خروجی متن ساده است (بدون HTML) — برای input و جاهایی که
     * نمی‌شود تگ گذاشت.
     */
    prettyPhone: function (value) {
      var v = u.normalizePhone(value);
      if (v.length !== 11) return u.toFa(v);
      return u.toFa(v.slice(0, 4)) + ' · ' + u.toFa(v.slice(4, 7)) + ' · ' + u.toFa(v.slice(7));
    },

    /**
     * همان شماره، ولی نقطه‌ها در span با کلاس .phone-dot می‌آیند
     * تا با CSS کم‌رنگ شوند. برای نمایش در صفحه.
     */
    prettyPhoneHTML: function (value) {
      var v = u.normalizePhone(value);
      if (v.length !== 11) return u.esc(u.toFa(v));
      var dot = '<span class="phone-dot">·</span>';
      return u.toFa(v.slice(0, 4)) + dot + u.toFa(v.slice(4, 7)) + dot + u.toFa(v.slice(7));
    },

    /* ---------------- DOM ---------------- */

    $: function (sel, root) { return (root || document).querySelector(sel); },
    $$: function (sel, root) {
      return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    },

    /** ساخت المان: el('div', {class:'x'}, [child]) */
    el: function (tag, attrs, children) {
      var node = document.createElement(tag);
      if (attrs) {
        Object.keys(attrs).forEach(function (k) {
          var v = attrs[k];
          if (v == null || v === false) return;
          if (k === 'class') node.className = v;
          else if (k === 'html') node.innerHTML = v;
          else if (k === 'text') node.textContent = v;
          else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
          else if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
          else node.setAttribute(k, v === true ? '' : v);
        });
      }
      (children || []).forEach(function (c) {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
      return node;
    },

    /** فرار از HTML برای درج امن متن */
    esc: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    /** پارامتر آدرس */
    param: function (name) {
      return new URLSearchParams(global.location.search).get(name);
    },

    /** آیا کاربر انیمیشن کم می‌خواهد؟ */
    reducedMotion: function () {
      return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },

    /** تاخیر تابع */
    debounce: function (fn, wait) {
      var t;
      return function () {
        var ctx = this, args = arguments;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(ctx, args); }, wait || 150);
      };
    }
  };

  ZZ.u = u;
})(window);
