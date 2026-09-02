/* ==========================================================================
   auth.js — احراز هویت با شماره موبایل و کد یک‌بارمصرف (OTP)

   این نسخه فقط وقتی اجرا می‌شود که بک‌اند در دسترس نباشد (حالت آفلاین).
   ⚠️ امنیت: رفتارهای نمایشی — کد ثابت "1234"، نمایش کد روی صفحه و
   نقش «مدیر» برای شماره‌های config — فقط با پرچم config.demo فعال‌اند.
   بسته‌ی پروداکشن این پرچم را خاموش می‌کند؛ پس روی سایت واقعی،
   آفلاین بودن سرور یعنی «ورود ممکن نیست»، نه «ورود با ۱۲۳۴».

   وقتی سرور بالاست، backend-bridge.js این دو تابع را با نسخه‌ی
   واقعی (پیامک + کوکی نشست) جایگزین می‌کند:
     - requestCode()  →  POST /api/auth/request-code
     - verifyCode()   →  POST /api/auth/verify
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = (global.ZZ = global.ZZ || {});
  var store = ZZ.store;
  var u = ZZ.u;
  var cfg = ZZ.config.auth;

  var K_USERS   = 'users';    // { [userId]: User }
  var K_SESSION = 'session';  // { userId, phone, at }
  var K_PENDING = 'pending';  // درخواست OTP در جریان

  /** آیا حالت نمایشی روشن است؟ (در بسته‌ی پروداکشن خاموش است) */
  function demoMode() { return ZZ.config.demo === true; }

  /**
   * مدل کاربر:
   * {
   *   id, phone, name,
   *   birth: { y, m, d } | null,   // تاریخ تولد شمسی — برای تخفیف تولد
   *   role: 'user' | 'admin',
   *   createdAt, lastLoginAt
   * }
   */

  function allUsers() { return store.get(K_USERS, {}) || {}; }

  function findByPhone(phone) {
    var users = allUsers();
    var keys = Object.keys(users);
    for (var i = 0; i < keys.length; i++) {
      if (users[keys[i]].phone === phone) return users[keys[i]];
    }
    return null;
  }

  function saveUser(user) {
    var users = allUsers();
    users[user.id] = user;
    store.set(K_USERS, users);
    return user;
  }

  function randomCode(len) {
    var s = '';
    for (var i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
    return s;
  }

  var auth = {

    /* ---------------- درخواست کد ---------------- */

    /**
     * ارسال (شبیه‌سازی‌شده‌ی) کد تایید
     * @returns {Promise<{phone, code, isNewUser, expiresAt}>}
     */
    requestCode: function (rawPhone) {
      return new Promise(function (resolve, reject) {
        var phone = u.normalizePhone(rawPhone);

        if (!u.isValidPhone(phone)) {
          return reject(new Error('شماره موبایل معتبر نیست. مثال: ۰۹۱۲۳۴۵۶۷۸۹'));
        }

        /* بیرون از حالت نمایشی، ورودِ محلی ممنوع است: وقتی این نسخه
           اجرا می‌شود یعنی سرور در دسترس نیست، و پذیرشِ کدِ جعلی
           یعنی هر بازدیدکننده‌ای می‌تواند خودش را مدیر جا بزند. */
        if (!demoMode()) {
          return reject(new Error(
            'سرور سایت در دسترس نیست؛ ورود و ثبت نوبت فعلاً ممکن نیست. ' +
            'لطفاً چند لحظه بعد دوباره تلاش کنید.'
          ));
        }

        /* تاخیر کوتاه برای شبیه‌سازی رفت‌وبرگشت شبکه */
        setTimeout(function () {
          var code = (cfg.mockMode && demoMode()) ? cfg.staticCode : randomCode(cfg.codeLength);
          var pending = {
            phone: phone,
            code: code,
            attempts: 0,
            createdAt: Date.now(),
            expiresAt: Date.now() + 2 * 60 * 1000  // ۲ دقیقه اعتبار
          };
          store.set(K_PENDING, pending);

          resolve({
            phone: phone,
            /* در نسخه‌ی واقعی این فیلد هرگز به کلاینت برنمی‌گردد */
            code: (cfg.revealCodeOnScreen && demoMode()) ? code : null,
            isNewUser: !findByPhone(phone),
            expiresAt: pending.expiresAt
          });
        }, 550);
      });
    },

    /** آخرین درخواست در جریان */
    getPending: function () { return store.get(K_PENDING, null); },

    clearPending: function () { store.remove(K_PENDING); },

    /* ---------------- تایید کد ---------------- */

    /**
     * بررسی کد و ورود/ثبت‌نام
     * @returns {Promise<{user, isNewUser}>}
     */
    verifyCode: function (rawCode) {
      return new Promise(function (resolve, reject) {
        var pending = store.get(K_PENDING, null);
        var code = u.toEn(String(rawCode || '')).replace(/\D/g, '');

        if (!pending) {
          return reject(new Error('درخواستی در جریان نیست. لطفاً دوباره شماره‌تان را وارد کنید.'));
        }
        if (Date.now() > pending.expiresAt) {
          store.remove(K_PENDING);
          return reject(new Error('کد منقضی شده است. لطفاً کد جدید بگیرید.'));
        }
        if (pending.attempts >= cfg.maxAttempts) {
          store.remove(K_PENDING);
          return reject(new Error('تعداد تلاش‌ها بیش از حد مجاز بود. لطفاً از ابتدا شروع کنید.'));
        }

        setTimeout(function () {
          /* در حالت نمایشی، کد ثابت هم پذیرفته می‌شود */
          var ok = code === pending.code ||
            (cfg.mockMode && demoMode() && code === cfg.staticCode);

          if (!ok) {
            pending.attempts++;
            store.set(K_PENDING, pending);
            var left = cfg.maxAttempts - pending.attempts;
            return reject(new Error(
              'کد وارد‌شده درست نیست.' + (left > 0 ? ' ' + u.toFa(left) + ' تلاش دیگر باقی مانده.' : '')
            ));
          }

          var user = findByPhone(pending.phone);
          var isNewUser = !user;

          if (isNewUser) {
            user = {
              id: store.uid('usr'),
              phone: pending.phone,
              name: '',
              birth: null,
              /* نقش: فقط در حالت نمایشی و فقط از config محلی.
                 روی سایت واقعی نقش را سرور تعیین می‌کند و این
                 مسیر اصلاً نباید مدیر بسازد. */
              role: (demoMode() &&
                     (ZZ.config.admin && ZZ.config.admin.phones || [])
                       .indexOf(pending.phone) > -1) ? 'admin' : 'user',
              createdAt: Date.now(),
              lastLoginAt: Date.now()
            };
          } else {
            user.lastLoginAt = Date.now();
          }
          saveUser(user);

          store.set(K_SESSION, { userId: user.id, phone: user.phone, at: Date.now() });
          store.remove(K_PENDING);

          resolve({ user: user, isNewUser: isNewUser });
        }, 450);
      });
    },

    /* ---------------- نشست ---------------- */

    /**
     * کاربر فعلی یا null.
     *
     * در حالت بک‌اند، لاگینِ واقعی با کوکی سرویس کار می‌کند و کاربرِ
     * فعلی در کلید apiUser نگه داشته می‌شود. اگر برای یک لحظه نشستِ
     * بک‌اند پچ نشده باشد (مثلاً بررسی سلامت سرور کمی طول بکشد یا
     * یکی از صفحه‌ها زودتر از موعد اجرا شود)، نباید کاربر بیهوده
     * از حساب بیرون بیفتد. پس به «apiUser» هم به‌عنوان کش محلی نگاه
     * می‌کنیم. اگر سرور بعداً کوکی را قبول نکند، خودش با ۴۰۱ آن را
     * پاک می‌کند.
     */
    currentUser: function () {
      var s = store.get(K_SESSION, null);
      if (s && s.userId) {
        var users = allUsers();
        if (users[s.userId]) return users[s.userId];
      }
      return store.get('apiUser', null) || null;
    },

    isLoggedIn: function () { return !!auth.currentUser(); },

    /** آیا کاربر فعلی مدیر است؟ */
    isAdmin: function () {
      var user = auth.currentUser();
      return !!(user && user.role === 'admin');
    },

    /** همه‌ی کاربران — فقط برای پنل مدیریت */
    allUsers: function () { return allUsers(); },

    /** یک کاربر بر اساس شناسه */
    getUser: function (id) { return allUsers()[id] || null; },

    /** به‌روزرسانی پروفایل (مثلاً نام) */
    updateProfile: function (patch) {
      var user = auth.currentUser();
      if (!user) return null;
      Object.keys(patch || {}).forEach(function (k) {
        /* این‌ها را کاربر نمی‌تواند عوض کند */
        if (k === 'id' || k === 'phone' || k === 'role') return;
        user[k] = patch[k];
      });
      return saveUser(user);
    },

    logout: function () {
      store.remove(K_SESSION);
      store.remove(K_PENDING);
      store.remove('apiUser');
    },

    /**
     * محافظت از صفحه: اگر وارد نشده، به صفحه‌ی ورود می‌فرستد
     * @param {string} nextUrl آدرس بازگشت بعد از ورود
     */
    requireAuth: function (nextUrl, base) {
      if (auth.isLoggedIn()) return true;
      var next = nextUrl || (global.location.pathname.split('/').pop() + global.location.search);
      var b = base || (nextUrl && nextUrl.indexOf('panel/') === 0 ? '../' : '');
      global.location.href = b + 'auth.html?next=' + encodeURIComponent(next);
      return false;
    },

    /**
     * محافظت از صفحه‌ی مدیریت.
     * ⚠️ این فقط یک گارد سمت کلاینت است و امنیت واقعی نمی‌آورد؛
     * در نسخه‌ی متصل به سرور، هر درخواست ادمین باید سمت سرور هم
     * بررسی شود.
     */
    requireAdmin: function (base) {
      var b = base || '../../';   // پیش‌فرض: از panel/admin/
      if (!auth.isLoggedIn()) {
        global.location.href = b + 'auth.html?next=' +
          encodeURIComponent('panel/admin/index.html');
        return false;
      }
      if (!auth.isAdmin()) {
        global.location.href = b + 'panel/index.html';
        return false;
      }
      return true;
    }
  };

  ZZ.auth = auth;
})(window);
