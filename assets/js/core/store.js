/* ==========================================================================
   store.js — لایه‌ی ذخیره‌سازی
   یک آداپتور نازک روی localStorage با fallback حافظه‌ای.
   برای اتصال به دیتابیس واقعی فقط کافی است پیاده‌سازی این ماژول عوض شود
   (مثلاً fetch به API) — بقیه‌ی کد دست نمی‌خورد.
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = (global.ZZ = global.ZZ || {});
  var PREFIX = ZZ.config.storage.prefix;

  /* اگر localStorage در دسترس نبود (مثلاً حالت خصوصی یا file://) */
  var memory = {};
  var hasLS = (function () {
    try {
      var k = '__zz_probe__';
      global.localStorage.setItem(k, '1');
      global.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  })();

  function raw(key) {
    if (hasLS) {
      try { return global.localStorage.getItem(PREFIX + key); } catch (e) { /* noop */ }
    }
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
  }

  function write(key, value) {
    if (hasLS) {
      try { global.localStorage.setItem(PREFIX + key, value); return; } catch (e) { /* noop */ }
    }
    memory[key] = value;
  }

  function drop(key) {
    if (hasLS) {
      try { global.localStorage.removeItem(PREFIX + key); } catch (e) { /* noop */ }
    }
    delete memory[key];
  }

  var listeners = [];

  var store = {
    /** آیا ذخیره‌سازی پایدار در دسترس است؟ */
    persistent: hasLS,

    /** خواندن مقدار JSON */
    get: function (key, fallback) {
      var v = raw(key);
      if (v == null) return typeof fallback === 'undefined' ? null : fallback;
      try { return JSON.parse(v); } catch (e) { return typeof fallback === 'undefined' ? null : fallback; }
    },

    /** نوشتن مقدار JSON */
    set: function (key, value) {
      write(key, JSON.stringify(value));
      emit(key, value);
      return value;
    },

    /** حذف کلید */
    remove: function (key) {
      drop(key);
      emit(key, null);
    },

    /** اشتراک در تغییرات (برای همگام‌سازی UI بین تب‌ها/بخش‌ها) */
    subscribe: function (fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i > -1) listeners.splice(i, 1);
      };
    }
  };

  function emit(key, value) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](key, value); } catch (e) { /* noop */ }
    }
  }

  /* همگام‌سازی بین تب‌های باز */
  if (hasLS) {
    global.addEventListener('storage', function (e) {
      if (!e.key || e.key.indexOf(PREFIX) !== 0) return;
      var key = e.key.slice(PREFIX.length);
      var val = null;
      try { val = e.newValue ? JSON.parse(e.newValue) : null; } catch (err) { /* noop */ }
      emit(key, val);
    });
  }

  /** تولید شناسه‌ی یکتا — بعداً جای آن id دیتابیس می‌نشیند */
  store.uid = function (prefix) {
    return (prefix || 'id') + '_' +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8);
  };

  ZZ.store = store;
})(window);
