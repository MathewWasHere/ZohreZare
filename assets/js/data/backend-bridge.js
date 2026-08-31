/* ==========================================================================
   backend-bridge.js — پل بین فرانت و بک‌اند

   اگر سرور در دسترس باشد، متدهای ZZ.auth و ZZ.appointments و
   ZZ.services را با نسخه‌ی متصل به API جایگزین می‌کند.
   اگر نباشد، هیچ کاری نمی‌کند و همان نسخه‌ی localStorage می‌ماند.

   این فایل باید بعد از data/*.js و قبل از pages/*.js بارگذاری شود.

   چرا پل جدا و نه تغییر مستقیم فایل‌ها؟
   چون این‌طور نسخه‌ی استاتیک دست‌نخورده می‌ماند و می‌شود سایت را
   بدون سرور هم نمایش داد — مثلاً برای دمو یا وقتی سرور down است.
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = (global.ZZ = global.ZZ || {});
  var u = ZZ.u;

  /* اگر api.js نبود یا خاموش بود، کاری نکن */
  if (!ZZ.api || !ZZ.config.api || ZZ.config.api.enabled === false) return;

  var K_USER = 'apiUser';          // کش کاربر فعلی
  var pendingPhone = null;         // شماره‌ی در جریانِ تایید

  /* ---------------- تبدیل قالب ---------------- */

  /** کاربر سرور → قالبی که فرانت می‌شناسد */
  function mapUser(u0) {
    if (!u0) return null;
    return {
      id: u0.id,
      phone: u0.phone,
      name: u0.name || '',
      birth: u0.birth || null,
      birthLabel: u0.birth_label || null,
      isBirthdayToday: !!u0.is_birthday_today,
      role: u0.role || 'user'
    };
  }

  /** نوبت سرور → قالب فرانت */
  function mapAppointment(a) {
    return {
      id: a.id,
      serviceId: a.service_id,
      serviceTitle: a.service_title,
      variantId: a.variant_id,
      variantName: a.variant_name,
      date: a.date,
      dateLabel: a.date_label,
      time: a.time,
      durationMin: a.duration_min,
      price: a.price,
      status: a.status,
      statusLabel: a.status_label,
      statusClass: a.status_class,
      note: a.note || '',
      isPast: a.is_past,
      canCancel: a.can_cancel,
      user: a.user || null
    };
  }

  /** خدمت سرور → قالب فرانت */
  function mapService(s) {
    return {
      id: s.id,
      slug: s.slug,
      title: s.title,
      short: s.short,
      image: s.image,
      icon: s.icon,
      igLink: s.ig_link || null,
      durationMin: s.duration_min,
      priceFrom: s.price_from,
      variants: (s.variants || []).map(function (v) {
        return {
          id: v.id,
          name: v.name,
          note: v.note || '',
          durationMin: v.duration_min,
          price: v.price
        };
      }),
      /* محتوای صفحه — حالا سرور هم نگهشان می‌دارد و از پنل
         مدیریت قابل ویرایش‌اند. */
      description: s.description || [],
      includes: s.includes || [],
      aftercare: s.aftercare || [],
      goodFor: s.good_for || [],
      faq: s.faq || []
    };
  }

  /* ---------------- جایگزینی auth ---------------- */

  function patchAuth() {
    var store = ZZ.store;

    ZZ.auth.requestCode = function (rawPhone) {
      return ZZ.api.auth.requestCode(rawPhone).then(function (r) {
        pendingPhone = r.phone;
        return {
          phone: r.phone,
          code: r.dev_code || null,
          isNewUser: r.is_new_user,
          expiresAt: Date.now() + (r.expires_in * 1000)
        };
      });
    };

    ZZ.auth.verifyCode = function (rawCode) {
      var phone = pendingPhone || (store.get('pending', {}) || {}).phone;
      if (!phone) {
        return Promise.reject(
          new Error('درخواستی در جریان نیست. لطفاً دوباره شماره‌تان را وارد کنید.')
        );
      }
      return ZZ.api.auth.verify(phone, rawCode).then(function (r) {
        var user = mapUser(r.user);
        store.set(K_USER, user);
        pendingPhone = null;
        return { user: user, isNewUser: r.is_new_user };
      });
    };

    ZZ.auth.currentUser = function () {
      return store.get(K_USER, null);
    };

    ZZ.auth.isLoggedIn = function () {
      return !!store.get(K_USER, null);
    };

    ZZ.auth.isAdmin = function () {
      var user = store.get(K_USER, null);
      return !!(user && user.role === 'admin');
    };

    ZZ.auth.updateProfile = function (patch) {
      var body = {};
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.birth === null) body.clear_birth = true;
      else if (patch.birth) body.birth = patch.birth;

      return ZZ.api.auth.updateProfile(body).then(function (r) {
        var user = mapUser(r);
        store.set(K_USER, user);
        return user;
      });
    };

    ZZ.auth.logout = function () {
      store.remove(K_USER);
      pendingPhone = null;
      return ZZ.api.auth.logout().catch(function () { /* مهم نیست */ });
    };

    ZZ.auth.clearPending = function () { pendingPhone = null; };

    /**
     * همگام‌سازی با سرور.
     * اگر کوکی منقضی شده باشد، کش پاک می‌شود.
     */
    ZZ.auth.sync = function () {
      return ZZ.api.auth.me()
        .then(function (r) {
          var user = mapUser(r);
          store.set(K_USER, user);
          return user;
        })
        .catch(function (err) {
          if (err.status === 401) store.remove(K_USER);
          return null;
        });
    };
  }

  /* ---------------- جایگزینی appointments ---------------- */

  function patchAppointments() {
    var A = ZZ.appointments;

    /* کش تقویم — تا هر بار کلیک، درخواست تازه نرود */
    var daysCache = null;
    var slotsCache = {};

    A.loadDays = function (count) {
      return ZZ.api.booking.days(count).then(function (rows) {
        daysCache = rows.map(function (d) {
          return {
            key: d.key,
            date: u.fromKey(d.key),
            label: d.label,
            short: d.short,
            closed: d.closed,
            closedByAdmin: d.closed_by_admin,
            hasOpenSlot: d.has_open_slot
          };
        });
        return daysCache;
      });
    };

    A.loadSlots = function (dateKey) {
      return ZZ.api.booking.slots(dateKey).then(function (rows) {
        slotsCache[dateKey] = rows;
        return rows;
      });
    };

    /* --- نسخه‌های همگام ---
       صفحات موجود این‌ها را بدون await صدا می‌زنند، پس باید همیشه
       چیزی برگردانند. راه‌حل: از کش می‌خوانیم و اگر کش خالی بود،
       در پس‌زمینه پرش می‌کنیم و بعد از آمدن داده، رویداد
       'zz:calendar' منتشر می‌شود تا صفحه دوباره رندر کند. */
    var daysLoading = false;
    var slotsLoading = {};

    function emitUpdate() {
      try {
        global.dispatchEvent(new CustomEvent('zz:calendar'));
      } catch (e) { /* مرورگرهای قدیمی */ }
    }

    A.getDays = function () {
      if (!daysCache && !daysLoading) {
        daysLoading = true;
        A.loadDays().then(function () {
          daysLoading = false;
          emitUpdate();
        }).catch(function () { daysLoading = false; });
      }
      return daysCache || [];
    };

    A.getSlots = function (dateKey) {
      if (!dateKey) return [];
      if (!slotsCache[dateKey] && !slotsLoading[dateKey]) {
        slotsLoading[dateKey] = true;
        A.loadSlots(dateKey).then(function () {
          slotsLoading[dateKey] = false;
          emitUpdate();
        }).catch(function () { slotsLoading[dateKey] = false; });
      }
      return slotsCache[dateKey] || [];
    };

    A.hasOpenSlot = function (dateKey) {
      var d = (daysCache || []).filter(function (x) { return x.key === dateKey; })[0];
      return d ? d.hasOpenSlot : false;
    };

    /** بعد از رزرو یا لغو، کش باید تازه شود */
    A.invalidateCache = function () {
      daysCache = null;
      slotsCache = {};
    };

    A.create = function (data) {
      return ZZ.api.booking.create({
        service_id: data.serviceId,
        variant_id: data.variantId,
        date: data.date,
        time: data.time,
        note: data.note || ''
      }).then(function (a) {
        A.invalidateCache();
        return mapAppointment(a);
      });
    };

    A.loadMine = function () {
      return ZZ.api.booking.mine().then(function (r) {
        return {
          upcoming: r.upcoming.map(mapAppointment),
          past: r.past.map(mapAppointment),
          total: r.total
        };
      });
    };

    A.cancel = function (id) {
      return ZZ.api.booking.cancel(id).then(function (r) {
        A.invalidateCache();
        return r;
      });
    };

    /* بخش مدیریت
       ⚠️ این شیء «در جا» تغییر داده می‌شود و جایگزین نمی‌شود؛ چون
       صفحه‌هایی مثل admin.js در همان ابتدا با
       «var A = ZZ.appointments.admin» یک ارجاع از آن می‌گیرند. اگر
       این‌جا شیء تازه بسازیم، آن صفحه‌ها به شیء قدیمیِ localStorage
       چسبیده می‌مانند و تغییراتشان هیچ‌وقت به سرور نمی‌رسد. */
    var adminApi = {
      stats: function () {
        return ZZ.api.admin.stats().then(function (s) {
          return {
            today: s.today, upcoming: s.upcoming, total: s.total,
            cancelled: s.cancelled, users: s.users,
            revenue: s.revenue_done, birthdays: s.birthdays_today
          };
        });
      },
      listAll: function (filter) {
        var params = {};
        if (filter && filter.status && filter.status !== 'all') params.status = filter.status;
        else params.status = 'all';
        if (filter && filter.q) params.q = filter.q;
        return ZZ.api.admin.appointments(params).then(function (rows) {
          /* جدول مدیریت قالب { appt, user, service, variant, isPast }
             می‌خواهد — همان چیزی که نسخه‌ی localStorage می‌دهد. */
          return rows.map(function (row) {
            var a = mapAppointment(row);
            return {
              appt: a,
              user: a.user,
              service: { id: a.serviceId, title: a.serviceTitle },
              variant: { id: a.variantId, name: a.variantName },
              isPast: a.isPast
            };
          });
        });
      },
      daySlots: function (dateKey) {
        return ZZ.api.admin.daySlots(dateKey).then(function (rows) {
          return rows.map(function (s) {
            return {
              time: s.time, booked: s.booked, blocked: s.blocked,
              appointmentId: s.appointment_id, customer: s.customer
            };
          });
        });
      },
      toggleDay: function (dateKey) {
        return ZZ.api.admin.toggleDay(dateKey).then(function (r) { return r.blocked; });
      },
      toggleSlot: function (dateKey, time) {
        return ZZ.api.admin.toggleSlot(dateKey, time).then(function (r) { return r.blocked; });
      },
      cancelAppointment: function (id) { return ZZ.api.admin.cancel(id); },
      users: function (params) { return ZZ.api.admin.users(params); },
      birthdays: function () { return ZZ.api.admin.birthdays(); },
      services: function () { return ZZ.api.admin.services(); },
      updateService: function (id, data) {
        return ZZ.api.admin.updateService(id, data).then(function (r) {
          /* کش خدمات باطل شود تا قیمت جدید همه‌جا دیده شود */
          if (ZZ.services.load) ZZ.services.load();
          return r;
        });
      },
      baseTimes: function () { return []; }
    };

    /* در جا کپی کن تا ارجاع‌های گرفته‌شده معتبر بمانند */
    A.admin = A.admin || {};
    Object.keys(adminApi).forEach(function (k) { A.admin[k] = adminApi[k]; });

    /* نسخه‌ی سرور این دو را ندارد؛ حذفشان کن تا کد به‌اشتباه
       سراغ نسخه‌ی localStorage نرود و وضعیت واقعی را اشتباه نخواند. */
    delete A.admin.isDayClosed;
    delete A.admin.getBlocks;
    delete A.admin.isSlotBlocked;
  }

  /* ---------------- جایگزینی services ---------------- */

  function patchServices() {
    var cached = null;

    ZZ.services.load = function () {
      return ZZ.api.services.list().then(function (rows) {
        cached = rows.map(mapService);
        return cached;
      });
    };

    var originalGetAll = ZZ.services.getAll;
    var originalById = ZZ.services.getById;
    var originalBySlug = ZZ.services.getBySlug;

    /* تا وقتی داده‌ی سرور نیامده، از نسخه‌ی محلی استفاده کن —
       این‌طور صفحه هرگز خالی نمی‌ماند */
    ZZ.services.getAll = function () {
      return cached || originalGetAll();
    };
    ZZ.services.getById = function (id) {
      if (!cached) return originalById(id);
      return cached.filter(function (s) { return s.id === id; })[0] || originalById(id);
    };
    ZZ.services.getBySlug = function (slug) {
      /* سرور حالا محتوای کامل صفحه را هم دارد (متن‌ها، تگ‌ها،
         پرسش‌ها) و همه از پنل مدیریت ویرایش می‌شوند. پس نسخه‌ی
         سرور مبناست؛ نسخه‌ی محلی فقط جای خالی‌ها را پر می‌کند
         (مثلاً وقتی مدیر هنوز متنی وارد نکرده). */
      var local = originalBySlug(slug);
      if (!cached) return local;
      var remote = cached.filter(function (s) { return s.slug === slug; })[0];
      if (!remote) return local;
      if (!local) return remote;

      var merged = Object.assign({}, local, remote);

      /* اگر فهرستی روی سرور خالی بود، از نسخه‌ی محلی استفاده کن */
      ['description', 'includes', 'aftercare', 'goodFor', 'faq'].forEach(function (k) {
        if (!remote[k] || !remote[k].length) merged[k] = local[k] || [];
      });

      return merged;
    };
  }

  /* ---------------- راه‌اندازی ---------------- */

  /**
   * قبل از هر کاری سلامت سرور بررسی می‌شود.
   * ZZ.ready یک Promise است که صفحات می‌توانند منتظرش بمانند.
   */
  ZZ.ready = ZZ.api.check().then(function (isOnline) {
    if (!isOnline) {
      if (global.console && console.info) {
        console.info('ℹ️ بک‌اند در دسترس نیست — حالت آفلاین (localStorage)');
      }
      return false;
    }

    patchAuth();
    patchAppointments();
    patchServices();

    /* داده‌های اولیه را موازی بگیر */
    return Promise.all([
      ZZ.services.load().catch(function () { return null; }),
      ZZ.auth.sync().catch(function () { return null; }),
      /* تقویم را از همان اول می‌گیریم تا صفحه‌ی رزرو منتظر نماند */
      ZZ.appointments.loadDays().catch(function () { return null; })
    ]).then(function () { return true; });
  });

  ZZ.isBackendMode = function () { return ZZ.api.isOnline(); };
})(window);
