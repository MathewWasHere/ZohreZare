/* ==========================================================================
   appointments.js — نوبت‌ها و بازه‌های زمانی
   بازه‌های زمانی فعلاً به‌صورت نمونه (mock) و قابل‌پیش‌بینی تولید می‌شوند.
   برای اتصال واقعی: getSlots() → GET /api/slots?date=…&serviceId=…
                     create()   → POST /api/appointments
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = (global.ZZ = global.ZZ || {});
  var store = ZZ.store;
  var u = ZZ.u;
  var cfg = ZZ.config.booking;

  var K_APPTS  = 'appointments';   // [Appointment]
  var K_BLOCKS = 'blocks';         // { closedDays: [dateKey], blockedSlots: { dateKey: [time] } }

  /**
   * مدل نوبت:
   * {
   *   id, userId, serviceId, variantId,
   *   date: 'YYYY-MM-DD', time: 'HH:MM',
   *   durationMin, price, status: 'confirmed'|'cancelled'|'done',
   *   note, createdAt
   * }
   */

  /* ساعت‌های پایه‌ی کاری سالن */
  var BASE_TIMES = ['10:00', '11:30', '13:00', '14:30', '16:00', '17:30', '19:00'];

  /** هش ساده و پایدار از یک رشته — برای ساخت اشغال‌بودن‌های ثابت (نه تصادفی هر بار) */
  function hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  function all() { return store.get(K_APPTS, []) || []; }
  function saveAll(list) { return store.set(K_APPTS, list); }

  /* ---------------- مسدودسازی توسط مدیر ----------------
     مدیر می‌تواند یک روز کامل را تعطیل کند یا فقط چند بازه‌ی
     مشخص را ببندد (مثلاً وقتی نوبت حضوری/تلفنی گرفته). */
  function blocks() {
    return store.get(K_BLOCKS, { closedDays: [], blockedSlots: {} }) ||
           { closedDays: [], blockedSlots: {} };
  }
  function saveBlocks(b) { return store.set(K_BLOCKS, b); }

  var appointments = {

    /* ---------------- روزهای قابل رزرو ---------------- */

    /**
     * لیست روزهای پیش رو
     * @returns [{ key, date, label, dayNum, monthName, closed }]
     */
    getDays: function (count) {
      var n = count || cfg.daysAhead;
      var out = [];
      var today = new Date();
      today.setHours(0, 0, 0, 0);

      var b = blocks();

      for (var i = 0; i < n; i++) {
        var d = new Date(today);
        d.setDate(today.getDate() + i);
        var key = u.dateKey(d);
        /* جمعه تعطیل ثابت + روزهایی که مدیر بسته */
        var weekly = d.getDay() === 5;
        var byAdmin = b.closedDays.indexOf(key) > -1;
        out.push({
          key: key,
          date: d,
          label: u.faDayLabel(d),
          short: u.faDateShort(d),
          closed: weekly || byAdmin,
          closedByAdmin: byAdmin
        });
      }
      return out;
    },

    /* ---------------- بازه‌های زمانی ---------------- */

    /**
     * بازه‌های یک روز برای یک خدمت
     * @returns [{ time, available, reason }]
     */
    getSlots: function (dateKey, serviceId) {
      var day = u.fromKey(dateKey);
      if (day.getDay() === 5) return [];    // جمعه تعطیل

      var b = blocks();
      if (b.closedDays.indexOf(dateKey) > -1) return [];   // مدیر بسته

      var blockedHere = b.blockedSlots[dateKey] || [];

      var booked = {};
      all().forEach(function (a) {
        if (a.date === dateKey && a.status === 'confirmed') booked[a.time] = true;
      });

      var seed = hash(dateKey + '|' + (serviceId || ''));

      return BASE_TIMES.map(function (time, idx) {
        var reason = null;
        var available = true;

        /* ۱) نوبت‌های واقعی رزرو‌شده‌ی همین مرورگر */
        if (booked[time]) {
          available = false;
          reason = 'رزرو شده';
        }

        /* ۲) بازه‌هایی که مدیر دستی بسته */
        if (available && blockedHere.indexOf(time) > -1) {
          available = false;
          reason = 'تکمیل';
        }

        /* ۳) اشغال‌بودن نمونه — ثابت برای هر ترکیب روز/خدمت */
        if (available && (seed >> idx) % 4 === 0) {
          available = false;
          reason = 'تکمیل';
        }

        /* ۴) ساعت‌های گذشته‌ی امروز */
        if (available && u.isPast(dateKey, time)) {
          available = false;
          reason = 'گذشته';
        }

        return { time: time, available: available, reason: reason };
      });
    },

    /** آیا روز اصلاً بازه‌ی آزادی دارد؟ */
    hasOpenSlot: function (dateKey, serviceId) {
      return appointments.getSlots(dateKey, serviceId).some(function (s) { return s.available; });
    },

    /* ---------------- عملیات روی نوبت ---------------- */

    /** ثبت نوبت جدید */
    create: function (data) {
      return new Promise(function (resolve, reject) {
        var user = ZZ.auth.currentUser();
        if (!user) return reject(new Error('برای ثبت نوبت باید وارد حساب کاربری شوید.'));

        var service = ZZ.services.getById(data.serviceId);
        if (!service) return reject(new Error('خدمت انتخاب‌شده معتبر نیست.'));

        var variant = ZZ.services.getVariant(data.serviceId, data.variantId) || service.variants[0];

        if (!data.date || !data.time) return reject(new Error('لطفاً روز و ساعت نوبت را انتخاب کنید.'));

        var slots = appointments.getSlots(data.date, data.serviceId);
        var slot = slots.filter(function (s) { return s.time === data.time; })[0];
        if (!slot || !slot.available) {
          return reject(new Error('این بازه‌ی زمانی دیگر در دسترس نیست. لطفاً ساعت دیگری انتخاب کنید.'));
        }

        setTimeout(function () {
          var appt = {
            id: store.uid('apt'),
            userId: user.id,
            serviceId: service.id,
            variantId: variant.id,
            date: data.date,
            time: data.time,
            durationMin: variant.durationMin,
            price: variant.price,
            status: 'confirmed',
            note: (data.note || '').slice(0, 400),
            createdAt: Date.now()
          };
          var list = all();
          list.push(appt);
          saveAll(list);
          resolve(appt);
        }, 500);
      });
    },

    /** نوبت‌های یک کاربر (پیش‌فرض: کاربر فعلی) */
    listForUser: function (userId) {
      var uid = userId || (ZZ.auth.currentUser() || {}).id;
      if (!uid) return [];
      return all()
        .filter(function (a) { return a.userId === uid; })
        .sort(function (a, b) {
          return (a.date + a.time).localeCompare(b.date + b.time);
        });
    },

    /** تفکیک آینده / گذشته با به‌روزرسانی خودکار وضعیت */
    groupedForUser: function (userId) {
      var list = appointments.listForUser(userId);
      var upcoming = [];
      var past = [];

      list.forEach(function (a) {
        var isOver = u.isPast(a.date, a.time);
        if (a.status === 'cancelled' || isOver) {
          past.push(a);
        } else {
          upcoming.push(a);
        }
      });

      past.reverse();   // جدیدترین اول
      return { upcoming: upcoming, past: past, total: list.length };
    },

    getById: function (id) {
      return all().filter(function (a) { return a.id === id; })[0] || null;
    },

    /** لغو نوبت */
    cancel: function (id) {
      return new Promise(function (resolve, reject) {
        var list = all();
        var found = null;
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === id) { found = list[i]; break; }
        }
        if (!found) return reject(new Error('نوبت پیدا نشد.'));

        var user = ZZ.auth.currentUser();
        if (!user || found.userId !== user.id) return reject(new Error('دسترسی مجاز نیست.'));
        if (found.status === 'cancelled') return reject(new Error('این نوبت قبلاً لغو شده است.'));

        var hrs = u.hoursUntil(found.date, found.time);
        if (hrs < cfg.cancelWindowHours && hrs > 0) {
          return reject(new Error(
            'لغو نوبت فقط تا ' + u.toFa(cfg.cancelWindowHours) + ' ساعت قبل ممکن است. لطفاً تماس بگیرید.'
          ));
        }

        found.status = 'cancelled';
        found.cancelledAt = Date.now();
        saveAll(list);
        resolve(found);
      });
    },

    /** برچسب وضعیت برای نمایش */
    statusLabel: function (appt) {
      if (appt.status === 'cancelled') return { text: 'لغو شده', cls: 'badge--danger' };
      if (u.isPast(appt.date, appt.time)) return { text: 'انجام شده', cls: 'badge--muted' };
      var hrs = u.hoursUntil(appt.date, appt.time);
      if (hrs < 24) return { text: 'به‌زودی', cls: 'badge--gold' };
      return { text: 'تایید شده', cls: 'badge--ok' };
    },

    /* ======================================================================
       بخش مدیریت
       همه‌ی متدهای زیر فقط برای نقش admin معنا دارند. در نسخه‌ی متصل
       به سرور، هر کدام باید یک endpoint محافظت‌شده صدا بزند.
       ====================================================================== */
    admin: {

      /** همه‌ی نوبت‌ها، همراه با اطلاعات کاربر و خدمت (برای جدول مدیریت) */
      listAll: function (filter) {
        var f = filter || {};
        var users = ZZ.auth.allUsers ? ZZ.auth.allUsers() : {};

        var rows = all().map(function (a) {
          var user = users[a.userId] || null;
          var svc = ZZ.services.getById(a.serviceId);
          var variant = ZZ.services.getVariant(a.serviceId, a.variantId);
          return {
            appt: a,
            user: user,
            service: svc,
            variant: variant,
            isPast: u.isPast(a.date, a.time)
          };
        });

        if (f.status === 'upcoming') {
          rows = rows.filter(function (r) { return r.appt.status === 'confirmed' && !r.isPast; });
        } else if (f.status === 'past') {
          rows = rows.filter(function (r) { return r.isPast && r.appt.status !== 'cancelled'; });
        } else if (f.status === 'cancelled') {
          rows = rows.filter(function (r) { return r.appt.status === 'cancelled'; });
        }

        if (f.date) rows = rows.filter(function (r) { return r.appt.date === f.date; });

        if (f.q) {
          var q = u.toEn(String(f.q)).toLowerCase().trim();
          rows = rows.filter(function (r) {
            var name = (r.user && r.user.name || '').toLowerCase();
            var phone = (r.user && r.user.phone || '');
            var svcName = (r.service && r.service.title || '').toLowerCase();
            return name.indexOf(q) > -1 || phone.indexOf(q) > -1 || svcName.indexOf(q) > -1;
          });
        }

        /* پیش رو: نزدیک‌ترین اول — گذشته: جدیدترین اول */
        rows.sort(function (x, y) {
          var kx = x.appt.date + x.appt.time;
          var ky = y.appt.date + y.appt.time;
          return f.status === 'past' ? ky.localeCompare(kx) : kx.localeCompare(ky);
        });

        return rows;
      },

      /** آمار خلاصه برای بالای پنل */
      stats: function () {
        var list = all();
        var today = u.dateKey(new Date());
        var upcoming = 0, todayCount = 0, cancelled = 0, revenue = 0;

        list.forEach(function (a) {
          if (a.status === 'cancelled') { cancelled++; return; }
          if (a.date === today) todayCount++;
          if (!u.isPast(a.date, a.time)) upcoming++;
          else revenue += a.price || 0;
        });

        var users = ZZ.auth.allUsers ? ZZ.auth.allUsers() : {};
        return {
          total: list.length,
          upcoming: upcoming,
          today: todayCount,
          cancelled: cancelled,
          revenue: revenue,
          users: Object.keys(users).length
        };
      },

      /* ---------------- تعطیل کردن روز ---------------- */

      getBlocks: function () { return blocks(); },

      isDayClosed: function (dateKey) {
        return blocks().closedDays.indexOf(dateKey) > -1;
      },

      /** تعطیل/باز کردن یک روز کامل */
      toggleDay: function (dateKey) {
        var b = blocks();
        var i = b.closedDays.indexOf(dateKey);
        if (i > -1) b.closedDays.splice(i, 1);
        else b.closedDays.push(dateKey);
        saveBlocks(b);
        return i === -1;   // true یعنی الان بسته شد
      },

      /* ---------------- پر کردن یک بازه ---------------- */

      isSlotBlocked: function (dateKey, time) {
        return (blocks().blockedSlots[dateKey] || []).indexOf(time) > -1;
      },

      /** پر/آزاد کردن یک بازه‌ی مشخص */
      toggleSlot: function (dateKey, time) {
        var b = blocks();
        var arr = b.blockedSlots[dateKey] || [];
        var i = arr.indexOf(time);
        if (i > -1) arr.splice(i, 1);
        else arr.push(time);

        if (arr.length) b.blockedSlots[dateKey] = arr;
        else delete b.blockedSlots[dateKey];

        saveBlocks(b);
        return i === -1;   // true یعنی الان پر شد
      },

      /** همه‌ی بازه‌های یک روز با وضعیتشان — برای جدول مدیریت */
      daySlots: function (dateKey) {
        var b = blocks();
        var blockedHere = b.blockedSlots[dateKey] || [];
        var booked = {};
        all().forEach(function (a) {
          if (a.date === dateKey && a.status === 'confirmed') booked[a.time] = a;
        });

        return BASE_TIMES.map(function (time) {
          return {
            time: time,
            booked: !!booked[time],
            appt: booked[time] || null,
            blocked: blockedHere.indexOf(time) > -1
          };
        });
      },

      /** لغو نوبت توسط مدیر — بدون محدودیت ۲۴ ساعته */
      cancelAppointment: function (id) {
        var list = all();
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === id) {
            list[i].status = 'cancelled';
            list[i].cancelledAt = Date.now();
            list[i].cancelledBy = 'admin';
            saveAll(list);
            return list[i];
          }
        }
        return null;
      },

      /** ساعت‌های کاری پایه — برای نمایش در پنل */
      baseTimes: function () { return BASE_TIMES.slice(); }
    }
  };

  ZZ.appointments = appointments;
})(window);
