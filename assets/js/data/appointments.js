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
   *   durationMin, price,
   *   status: 'pending'|'confirmed'|'rejected'|'cancelled'|'done'|'no_show',
   *   note, createdAt,
   *   deposit: { amount, method, ref, paidAt, note } | null,
   *   decidedAt, decidedBy, rejectReason
   * }
   *
   * چرخه‌ی وضعیت (بدون درگاه پرداخت):
   *
   *   مشتری ساعت را می‌گیرد
   *          ↓
   *   pending ──(مدیر تماس می‌گیرد و تأیید می‌کند)──→ confirmed ──→ done
   *      │                                               │
   *      │                                               └──→ no_show
   *      ├──(مدیر رد می‌کند)──→ rejected
   *      └──(مشتری منصرف می‌شود)──→ cancelled
   *
   * بیعانه یک رکورد ساده روی نوبت است، نه یک تراکنش بانکی. مدیر
   * حین تماس مبلغ را می‌گیرد (کارت‌به‌کارت یا نقدی) و همین‌جا ثبتش
   * می‌کند. هر وقت درگاه پرداخت اضافه شد، فقط یک method جدید به
   * همین رکورد اضافه می‌شود و بقیه‌ی کد دست نمی‌خورد.
   */

  /* وضعیت‌هایی که ساعت را اشغال می‌کنند */
  var HOLDING = ['confirmed'];
  if (ZZ.config.approval && ZZ.config.approval.enabled &&
      ZZ.config.approval.holdSlot !== false) {
    HOLDING.push('pending');
  }

  /** آیا این نوبت ساعتش را اشغال کرده است؟ */
  function holdsSlot(a) {
    return HOLDING.indexOf(a.status) > -1;
  }

  /** آیا این نوبت هنوز «باز» است؟ (نه لغو، نه رد، نه گذشته) */
  function isOpen(a) {
    return (a.status === 'pending' || a.status === 'confirmed') &&
           !u.isPast(a.date, a.time);
  }
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
        if (a.date === dateKey && holdsSlot(a)) booked[a.time] = a.status;
      });

      var seed = hash(dateKey + '|' + (serviceId || ''));

      return BASE_TIMES.map(function (time, idx) {
        var reason = null;
        var available = true;

        /* ۱) نوبت‌های واقعی رزرو‌شده — تأییدشده یا در انتظار تأیید.
              درخواستِ در انتظار هم ساعت را نگه می‌دارد تا دو نفر یک
              ساعت را نگیرند. */
        if (booked[time]) {
          available = false;
          reason = booked[time] === 'pending' ? 'در انتظار تأیید' : 'رزرو شده';
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

        /* سقف درخواست‌های باز — وگرنه یک نفر می‌تواند با چند درخواست
           کل تقویم را قفل کند. */
        var ap = ZZ.config.approval || {};
        var maxOpen = ap.maxOpenRequests || 0;
        if (ap.enabled && maxOpen > 0) {
          var open = all().filter(function (a) {
            return a.userId === user.id && a.status === 'pending' && isOpen(a);
          });          if (open.length >= maxOpen) {
            return reject(new Error(
              'شما ' + u.toFa(open.length) + ' درخواست در انتظار تأیید دارید. ' +
              'لطفاً تا تعیین تکلیف آن‌ها صبر کنید یا یکی را لغو کنید.'
            ));
          }
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
            /* بدون درگاه پرداخت، هیچ رزروی خودبه‌خود قطعی نمی‌شود؛
               مدیر بعد از تماس تأییدش می‌کند. */
            status: ap.enabled ? 'pending' : 'confirmed',
            note: (data.note || '').slice(0, 400),
            deposit: null,
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
        var closed = a.status === 'cancelled' || a.status === 'rejected';
        if (closed || isOver) {
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
        if (found.status === 'rejected') return reject(new Error('این درخواست قبلاً رد شده است.'));

        /* درخواستی که هنوز تأیید نشده، هر وقت خواست قابل لغو است —
           محدودیت ۲۴ ساعته فقط برای نوبت‌های قطعی‌شده معنا دارد. */
        if (found.status !== 'pending') {
          var hrs = u.hoursUntil(found.date, found.time);
          if (hrs < cfg.cancelWindowHours && hrs > 0) {
            return reject(new Error(
              'لغو نوبت فقط تا ' + u.toFa(cfg.cancelWindowHours) + ' ساعت قبل ممکن است. لطفاً تماس بگیرید.'
            ));
          }
        }

        found.status = 'cancelled';
        found.cancelledAt = Date.now();
        saveAll(list);
        resolve(found);
      });
    },

    /** برچسب وضعیت برای نمایش */
    statusLabel: function (appt) {
      switch (appt.status) {
        case 'pending':
          return { text: 'در انتظار تأیید', cls: 'badge--gold' };
        case 'rejected':
          return { text: 'رد شده', cls: 'badge--danger' };
        case 'cancelled':
          return { text: 'لغو شده', cls: 'badge--danger' };
        case 'no_show':
          return { text: 'غیبت', cls: 'badge--danger' };
        case 'done':
          return { text: 'انجام شده', cls: 'badge--muted' };
      }
      if (u.isPast(appt.date, appt.time)) return { text: 'انجام شده', cls: 'badge--muted' };
      var hrs = u.hoursUntil(appt.date, appt.time);
      if (hrs < 24) return { text: 'به‌زودی', cls: 'badge--gold' };
      return { text: 'تایید شده', cls: 'badge--ok' };
    },

    /** خلاصه‌ی وضعیت بیعانه — برای نمایش به مشتری و مدیر */
    depositLabel: function (appt) {
      var d = appt.deposit;
      if (!d || !d.amount) return null;
      var m = (ZZ.config.deposit.methods || []).filter(function (x) {
        return x.id === d.method;
      })[0];
      return {
        text: 'بیعانه دریافت شد',
        amount: d.amount,
        method: m ? m.label : (d.method || ''),
        ref: d.ref || ''
      };
    },

    /* ======================================================================
       بخش مدیریت
       همه‌ی متدهای زیر فقط برای نقش admin معنا دارند. در نسخه‌ی متصل
       به سرور، هر کدام باید یک endpoint محافظت‌شده صدا بزند.
       ====================================================================== */
    admin: {

      /* ---------------- تأیید و رد درخواست ----------------
         قلب جریانِ بدون درگاه پرداخت. مدیر درخواست را می‌بیند،
         با مشتری تماس می‌گیرد، و بعد تصمیم می‌گیرد. */

      /** پیدا کردن نوبت و اجرای یک تغییر روی آن */
      _mutate: function (id, fn) {
        var list = all();
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === id) {
            var r = fn(list[i]);
            if (r === false) return null;
            saveAll(list);
            return list[i];
          }
        }
        return null;
      },

      /** تأیید نهایی درخواست — نوبت قطعی می‌شود */
      approve: function (id) {
        return appointments.admin._mutate(id, function (a) {
          if (a.status !== 'pending') return false;
          a.status = 'confirmed';
          a.decidedAt = Date.now();
          a.decidedBy = 'admin';
          delete a.rejectReason;
        });
      },

      /** رد درخواست — ساعت آزاد می‌شود و دلیلش به مشتری نشان داده می‌شود */
      reject: function (id, reason) {
        return appointments.admin._mutate(id, function (a) {
          if (a.status !== 'pending') return false;
          a.status = 'rejected';
          a.decidedAt = Date.now();
          a.decidedBy = 'admin';
          a.rejectReason = (reason || '').slice(0, 200);
        });
      },

      /** برگرداندن نوبت تأییدشده به حالت بررسی */
      revertToPending: function (id) {
        return appointments.admin._mutate(id, function (a) {
          if (a.status !== 'confirmed') return false;
          a.status = 'pending';
          delete a.decidedAt;
          delete a.decidedBy;
        });
      },

      /** ثبت بیعانه‌ی دریافت‌شده (کارت‌به‌کارت، نقدی یا آنلاین) */
      setDeposit: function (id, data) {
        var amount = parseInt(u.toEn(String(data.amount || '')).replace(/\D/g, ''), 10);
        if (!amount || amount <= 0) {
          throw new Error('مبلغ بیعانه را درست وارد کنید.');
        }
        return appointments.admin._mutate(id, function (a) {
          a.deposit = {
            amount: amount,
            method: data.method || 'card',
            ref: (data.ref || '').slice(0, 40),
            note: (data.note || '').slice(0, 200),
            paidAt: Date.now()
          };
        });
      },

      /** حذف بیعانه — مثلاً وقتی اشتباه ثبت شده یا برگشت خورده */
      clearDeposit: function (id) {
        return appointments.admin._mutate(id, function (a) { a.deposit = null; });
      },

      /** علامت‌زدن غیبت — پایه‌ی تصمیم‌گیری برای بیعانه‌ی دفعه‌ی بعد */
      markNoShow: function (id) {
        return appointments.admin._mutate(id, function (a) {
          a.status = 'no_show';
          a.decidedAt = Date.now();
        });
      },

      /** علامت‌زدن انجام‌شده */
      markDone: function (id) {
        return appointments.admin._mutate(id, function (a) { a.status = 'done'; });
      },

      /**
       * سابقه‌ی یک مراجعه‌کننده — به مدیر می‌گوید موقع تماس بیعانه
       * بگیرد یا نه. کسی که قبلاً غیبت کرده، ریسک بیشتری دارد.
       */
      userHistory: function (userId) {
        var done = 0, noShow = 0, cancelled = 0;
        all().forEach(function (a) {
          if (a.userId !== userId) return;
          if (a.status === 'no_show') noShow++;
          else if (a.status === 'cancelled') cancelled++;
          else if (a.status === 'done' || (a.status === 'confirmed' && u.isPast(a.date, a.time))) done++;
        });
        return {
          done: done,
          noShow: noShow,
          cancelled: cancelled,
          isNew: done + noShow + cancelled === 0,
          /* پیشنهاد سیستم به مدیر — تصمیم نهایی با خودش است */
          suggestDeposit: noShow > 0
        };
      },

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
            isPast: u.isPast(a.date, a.time),
            history: appointments.admin.userHistory(a.userId)
          };
        });

        if (f.status === 'pending') {
          rows = rows.filter(function (r) { return r.appt.status === 'pending'; });
        } else if (f.status === 'upcoming') {
          rows = rows.filter(function (r) { return r.appt.status === 'confirmed' && !r.isPast; });
        } else if (f.status === 'past') {
          rows = rows.filter(function (r) {
            return r.isPast && r.appt.status !== 'cancelled' && r.appt.status !== 'rejected';
          });
        } else if (f.status === 'cancelled') {
          rows = rows.filter(function (r) {
            return r.appt.status === 'cancelled' || r.appt.status === 'rejected';
          });
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

        /* درخواست‌های در انتظار: قدیمی‌ترین اول (کسی که بیشتر منتظر
           مانده باید زودتر جواب بگیرد)
           پیش رو: نزدیک‌ترین اول — گذشته: جدیدترین اول */
        rows.sort(function (x, y) {
          if (f.status === 'pending') {
            return (x.appt.createdAt || 0) - (y.appt.createdAt || 0);
          }
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
        var pending = 0, deposits = 0, noShow = 0;

        list.forEach(function (a) {
          if (a.deposit && a.deposit.amount) deposits += a.deposit.amount;
          if (a.status === 'pending') { pending++; return; }
          if (a.status === 'no_show') { noShow++; return; }
          if (a.status === 'cancelled' || a.status === 'rejected') { cancelled++; return; }
          if (a.date === today) todayCount++;
          if (!u.isPast(a.date, a.time)) upcoming++;
          else revenue += a.price || 0;
        });

        var users = ZZ.auth.allUsers ? ZZ.auth.allUsers() : {};
        return {
          total: list.length,
          pending: pending,
          upcoming: upcoming,
          today: todayCount,
          cancelled: cancelled,
          noShow: noShow,
          revenue: revenue,
          deposits: deposits,
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
          if (a.date === dateKey && holdsSlot(a)) booked[a.time] = a;
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
