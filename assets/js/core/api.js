/* ==========================================================================
   api.js — لایه‌ی ارتباط با بک‌اند

   اگر بک‌اند در دسترس باشد، ماژول‌های data/ از این استفاده می‌کنند؛
   وگرنه به حالت localStorage برمی‌گردند. این‌طور سایت هم به‌صورت
   استاتیک کار می‌کند و هم با سرور.

   تنظیم آدرس سرور: ZZ.config.api.baseUrl در config.js
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = (global.ZZ = global.ZZ || {});
  var cfg = (ZZ.config && ZZ.config.api) || {};

  /* اگر خالی باشد، همان دامنه‌ی صفحه استفاده می‌شود */
  var BASE = (cfg.baseUrl || '').replace(/\/$/, '');

  /** آیا بک‌اند در دسترس است؟ null یعنی هنوز بررسی نشده */
  var online = null;

  function url(path) {
    return BASE + path;
  }

  /**
   * درخواست به API.
   * خطاها به شکل Error با پیام فارسی برمی‌گردند تا UI مستقیم
   * نمایششان دهد.
   */
  function request(method, path, body) {
    var opts = {
      method: method,
      headers: { 'Accept': 'application/json' },
      /* لازم است تا کوکی نشست رد و بدل شود */
      credentials: 'include'
    };

    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    return fetch(url(path), opts).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { /* noop */ }

        if (!res.ok) {
          var msg = (data && data.message) || 'خطا در ارتباط با سرور.';
          var err = new Error(msg);
          err.status = res.status;
          err.field = data && data.field;
          throw err;
        }
        return data;
      });
    });
  }

  var api = {
    baseUrl: BASE,

    get:    function (p)    { return request('GET', p); },
    post:   function (p, b) { return request('POST', p, b); },
    patch:  function (p, b) { return request('PATCH', p, b); },
    del:    function (p)    { return request('DELETE', p); },

    /**
     * بررسی در دسترس بودن بک‌اند.
     * نتیجه کش می‌شود تا هر بار درخواست نرود.
     */
    check: function () {
      if (online !== null) return Promise.resolve(online);

      return fetch(url('/api/health'), { credentials: 'include' })
        .then(function (r) { online = r.ok; return online; })
        .catch(function () { online = false; return false; });
    },

    isOnline: function () { return online === true; },

    /* ---------------- احراز هویت ---------------- */
    auth: {
      requestCode: function (phone) {
        return api.post('/api/auth/request-code', { phone: phone });
      },
      verify: function (phone, code) {
        return api.post('/api/auth/verify', { phone: phone, code: code });
      },
      me: function () { return api.get('/api/auth/me'); },
      updateProfile: function (patch) { return api.patch('/api/auth/me', patch); },
      logout: function () { return api.post('/api/auth/logout'); }
    },

    /* ---------------- خدمات ---------------- */
    services: {
      list: function () { return api.get('/api/services'); },
      get: function (slug) { return api.get('/api/services/' + encodeURIComponent(slug)); }
    },

    /* ---------------- تقویم و نوبت ---------------- */
    booking: {
      days: function (count) {
        return api.get('/api/days' + (count ? '?count=' + count : ''));
      },
      slots: function (dateKey) {
        return api.get('/api/slots?date=' + encodeURIComponent(dateKey));
      },
      mine: function () { return api.get('/api/appointments/me'); },
      create: function (data) { return api.post('/api/appointments', data); },
      cancel: function (id) { return api.del('/api/appointments/' + id); }
    },

    /* ---------------- مدیریت ---------------- */
    admin: {
      stats: function () { return api.get('/api/admin/stats'); },
      appointments: function (params) {
        var q = new URLSearchParams(params || {}).toString();
        return api.get('/api/admin/appointments' + (q ? '?' + q : ''));
      },
      cancel: function (id) { return api.del('/api/admin/appointments/' + id); },
      daySlots: function (dateKey) {
        return api.get('/api/admin/day-slots?date=' + encodeURIComponent(dateKey));
      },
      toggleDay: function (dateKey, reason) {
        return api.post('/api/admin/block-day', { date: dateKey, reason: reason || '' });
      },
      toggleSlot: function (dateKey, time, reason) {
        return api.post('/api/admin/block-slot', {
          date: dateKey, time: time, reason: reason || ''
        });
      },
      users: function (params) {
        var q = new URLSearchParams(params || {}).toString();
        return api.get('/api/admin/users' + (q ? '?' + q : ''));
      },
      birthdays: function () { return api.get('/api/admin/birthdays'); },
      services: function () { return api.get('/api/admin/services'); },
      updateService: function (id, data) {
        return api.patch('/api/admin/services/' + id, data);
      }
    }
  };

  ZZ.api = api;
})(window);
