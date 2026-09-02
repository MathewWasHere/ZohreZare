/* ==========================================================================
   admin.js — پنل مدیریت (panel/admin)

   قابلیت‌ها:
   • مشاهده‌ی همه‌ی نوبت‌ها با فیلتر و جست‌وجو
   • دیدن شماره تماس و تاریخ تولد هر مراجعه‌کننده کنار نوبتش
   • تماس مستقیم با کلیک روی شماره (tel:) — روی موبایل شماره‌گیر باز می‌شود
   • تعطیل کردن یک روز کامل
   • پر کردن دستی یک بازه‌ی زمانی
   • لغو نوبت (بدون محدودیت ۲۴ ساعته)

   ⚠️ امنیت: گارد نقش اینجا فقط سمت کلاینت است. وقتی به سرور وصل شد،
   هر endpoint باید نقش را دوباره بررسی کند.
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = global.ZZ;
  var u = ZZ.u;
  var CUR = ZZ.config.booking.currency;
  var A = ZZ.appointments.admin;

  /* این صفحه در panel/admin/ است */
  var B = '../../';

  var state = {
    tab: 'appointments',   // appointments | days | services
    /* پیش‌فرض روی صف درخواست‌هاست: اولین چیزی که مدیر باید ببیند
       رزروهایی است که منتظر تماس و تأیید او هستند. */
    filter: 'pending',     // pending | upcoming | past | cancelled | all
    q: '',
    selectedDay: null,
    services: null,        // کش خدمات برای تب ویرایش
    editingId: null,       // خدمتی که باز است
    cache: {}              // کش داده‌های سرور
  };

  /* ---------------- لایه‌ی داده ----------------
     پنل در دو حالت کار می‌کند:
       • بدون سرور → متدهای ZZ.appointments.admin مقدار مستقیم می‌دهند
       • با سرور   → همان متدها Promise می‌دهند
     این لایه هر دو را یک‌جور می‌کند: اگر داده در کش بود همان را
     می‌دهد، وگرنه مقدار پیش‌فرض را برمی‌گرداند و داده را در
     پس‌زمینه می‌گیرد و بعد از رسیدن، دوباره رندر می‌کند. */

  function isThenable(x) { return !!x && typeof x.then === 'function'; }

  var loading = {};

  function pull(key, fn, fallback) {
    if (Object.prototype.hasOwnProperty.call(state.cache, key)) return state.cache[key];
    if (!loading[key]) {
      loading[key] = true;
      var res;
      try { res = fn(); } catch (e) { res = fallback; }

      if (isThenable(res)) {
        res.then(function (v) {
          state.cache[key] = v;
          loading[key] = false;
          render();
        }).catch(function (err) {
          state.cache[key] = fallback;
          loading[key] = false;
          ZZ.toast.error((err && err.message) || 'دریافت اطلاعات از سرور ناموفق بود.');
          render();
        });
      } else {
        state.cache[key] = res;
        loading[key] = false;
        return res;
      }
    }
    return fallback;
  }

  /** پاک کردن کش — با پیشوند یا همه */
  function invalidate(prefix) {
    Object.keys(state.cache).forEach(function (k) {
      if (!prefix || k.indexOf(prefix) === 0) delete state.cache[k];
    });
  }

  /** بعد از هر تغییر روی نوبت‌ها: کش‌های مرتبط را دور بریز و دوباره بکش */
  function afterChange() {
    invalidate('appts:');
    invalidate('slots:');
    invalidate('days');
    invalidate('stats');
    render();
  }

  /**
   * پنجره‌ی ثبت بیعانه.
   *
   * عمداً یک فرم ساده‌ی درون‌صفحه‌ای است و نه یک جریان پرداخت:
   * پول بیرون از سایت جابه‌جا می‌شود (کارت‌به‌کارت یا نقدی) و اینجا
   * فقط ثبت می‌شود که چقدر، با چه روشی و با چه کد پیگیری‌ای گرفته
   * شده. هر وقت درگاه پرداخت اضافه شد، فقط یک روش دیگر به همین
   * فرم اضافه می‌شود.
   */
  function openDepositDialog(apptId) {
    var rows = state.cache['appts:' + state.filter + ':' + state.q] || [];
    var row = rows.filter(function (r) { return r.appt.id === apptId; })[0];
    var appt = row ? row.appt : null;
    var dcfg = ZZ.config.deposit;
    var current = (appt && appt.deposit) || null;

    var host = u.el('div', { class: 'modal-host', id: 'depositModal' });
    host.innerHTML =
      '<div class="modal-back" data-close="1"></div>' +
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="depTitle">' +
        '<h3 id="depTitle" class="modal__title">ثبت بیعانه‌ی دریافت‌شده</h3>' +
        '<p class="modal__hint">' +
          (row && row.user
            ? u.esc(row.user.name || 'بدون نام') + ' — ' +
              '<span class="ltr">' + u.esc(row.user.phone || '') + '</span>'
            : '') +
        '</p>' +
        '<label class="field"><span class="field__label">مبلغ (' + CUR + ')</span>' +
          '<input class="input" id="depAmount" type="text" inputmode="numeric" ' +
            'value="' + (current ? current.amount : (dcfg.suggested || '')) + '"></label>' +
        '<label class="field"><span class="field__label">روش دریافت</span>' +
          '<select class="input" id="depMethod">' +
            (dcfg.methods || []).map(function (m) {
              var sel = current && current.method === m.id ? ' selected' : '';
              return '<option value="' + m.id + '"' + sel + '>' + u.esc(m.label) + '</option>';
            }).join('') +
          '</select></label>' +
        '<label class="field"><span class="field__label">کد پیگیری / چهار رقم آخر کارت (اختیاری)</span>' +
          '<input class="input ltr" id="depRef" type="text" ' +
            'value="' + u.esc(current ? current.ref || '' : '') + '"></label>' +
        '<div class="modal__actions">' +
          (current
            ? '<button class="btn btn--quiet btn--sm" data-clear="1">حذف بیعانه</button>'
            : '') +
          '<span style="flex:1;"></span>' +
          '<button class="btn btn--ghost btn--sm" data-close="1">انصراف</button>' +
          '<button class="btn btn--primary btn--sm" data-save="1">ثبت</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(host);
    var amountInput = host.querySelector('#depAmount');
    amountInput.focus();
    amountInput.select();

    function close() {
      if (host.parentNode) host.parentNode.removeChild(host);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(ev) { if (ev.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    host.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-close]')) { close(); return; }

      if (ev.target.closest('[data-clear]')) {
        close();
        run(A.clearDeposit(apptId), function () {
          ZZ.toast.ok('بیعانه حذف شد');
          afterChange();
        });
        return;
      }

      if (ev.target.closest('[data-save]')) {
        var payload = {
          amount: host.querySelector('#depAmount').value,
          method: host.querySelector('#depMethod').value,
          ref: host.querySelector('#depRef').value
        };
        var res;
        try {
          res = A.setDeposit(apptId, payload);
        } catch (err) {
          ZZ.toast.error(err.message);
          return;
        }
        close();
        run(res, function () {
          ZZ.toast.ok('بیعانه ثبت شد');
          afterChange();
        });
      }
    });
  }

  /** اجرای یک عمل که ممکن است هم‌گام یا ناهم‌گام باشد */
  function run(result, onOk) {
    if (isThenable(result)) {
      result.then(function (v) { onOk(v); })
            .catch(function (err) {
              ZZ.toast.error((err && err.message) || 'عملیات ناموفق بود.');
            });
    } else {
      onOk(result);
    }
  }

  /* ---------------- کمکی‌ها ---------------- */

  function telCell(user) {
    if (!user || !user.phone) {
      return '<span class="muted" style="font-size:var(--fs-xs);">—</span>';
    }
    /* tel: با فرمت بین‌المللی تا روی همه‌ی گوشی‌ها درست شماره بگیرد */
    var href = 'tel:' + u.normalizePhone(user.phone).replace(/^0/, '+98');
    return '<a class="admin-tel" href="' + href + '" title="تماس مستقیم">' +
             ZZ.icon('phone', null, 14) +
             '<span class="ltr">' + u.prettyPhoneHTML(user.phone) + '</span>' +
           '</a>';
  }

  function birthCell(user) {
    if (!user) return '<span class="admin-cell__birth muted">ثبت نشده</span>';

    /* حالت سرور: برچسب آماده می‌آید */
    if (user.birth_label || user.birthLabel) {
      var lbl = user.birth_label || user.birthLabel;
      var isB = user.is_birthday_today || user.isBirthdayToday;
      return '<span class="admin-cell__birth">' +
               (isB ? '\uD83C\uDF82 ' : '') + u.esc(lbl) +
             '</span>';
    }

    if (!user.birth) {
      return '<span class="admin-cell__birth muted">ثبت نشده</span>';
    }
    var b = user.birth;
    var today = new Date();
    /* آیا امروز تولدش است؟ مقایسه‌ی ماه/روز شمسی با امروز */
    var isBirthday = false;
    try {
      var parts = new Intl.DateTimeFormat('en-u-ca-persian', { month: 'numeric', day: 'numeric' })
        .formatToParts(today);
      var tm = 0, td = 0;
      parts.forEach(function (p) {
        if (p.type === 'month') tm = parseInt(p.value, 10);
        if (p.type === 'day') td = parseInt(p.value, 10);
      });
      isBirthday = (tm === b.m && td === b.d);
    } catch (e) { /* noop */ }

    return '<span class="admin-cell__birth">' +
             (isBirthday ? '\uD83C\uDF82 ' : '') + u.formatBirth(b) +
           '</span>';
  }

  /* ---------------- تب نوبت‌ها ---------------- */

  /** برچسب فارسی روش پرداخت بیعانه */
  function depMethodLabel(dep) {
    var m = (ZZ.config.deposit.methods || []).filter(function (x) {
      return x.id === dep.method;
    })[0];
    return m ? m.label : (dep.method || 'نامشخص');
  }

  /**
   * دکمه‌های عملیات هر سطر.
   *
   * برای درخواستِ در انتظار، ترتیب دکمه‌ها عمداً همان ترتیب کاری
   * مدیر است: اول تماس بگیر، اگر بیعانه گرفتی ثبتش کن، بعد تأیید
   * یا رد کن.
   */
  function actionsHTML(a, r, canCancel) {
    var btns = [];

    if (a.status === 'pending') {
      if (r.user && r.user.phone) {
        var tel = 'tel:' + u.normalizePhone(r.user.phone).replace(/^0/, '+98');
        btns.push('<a class="btn btn--ghost btn--sm" href="' + tel + '">' +
                  ZZ.icon('phone', null, 14) + 'تماس</a>');
      }
      btns.push('<button class="btn btn--ghost btn--sm" data-deposit="' + a.id + '">' +
                (a.deposit ? 'ویرایش بیعانه' : 'ثبت بیعانه') + '</button>');
      btns.push('<button class="btn btn--primary btn--sm" data-approve="' + a.id + '">تأیید</button>');
      btns.push('<button class="btn btn--quiet btn--sm" data-reject="' + a.id + '">رد</button>');
    } else if (a.status === 'confirmed' && !r.isPast) {
      btns.push('<button class="btn btn--ghost btn--sm" data-deposit="' + a.id + '">' +
                (a.deposit ? 'ویرایش بیعانه' : 'ثبت بیعانه') + '</button>');
      if (canCancel) {
        btns.push('<button class="btn btn--quiet btn--sm" data-cancel="' + a.id + '">لغو</button>');
      }
    } else if (a.status === 'confirmed' && r.isPast) {
      btns.push('<button class="btn btn--ghost btn--sm" data-done="' + a.id + '">انجام شد</button>');
      btns.push('<button class="btn btn--quiet btn--sm" data-noshow="' + a.id + '">غیبت کرد</button>');
    }

    if (!btns.length) return '<span class="muted" style="font-size:var(--fs-xs);">—</span>';
    return '<div class="row-actions">' + btns.join('') + '</div>';
  }

  /** آیا این ردیف سابقه‌ی پرریسک دارد؟ */
  function riskHTML(a, hist) {
    if (!hist || a.status !== 'pending') return '';
    if (hist.suggestDeposit) {
      return '<span class="admin-chip admin-chip--danger" title="این مراجعه‌کننده سابقه‌ی غیبت دارد">' +
        ZZ.icon('info', null, 13) + 'سابقه‌ی ' + u.toFa(hist.noShow) + ' غیبت</span>';
    }
    if (hist.isNew) {
      return '<span class="admin-chip admin-chip--new">' + ZZ.icon('sparkle', null, 13) + 'مراجعه‌کننده‌ی جدید</span>';
    }
    return '';
  }

  function renderAppointments() {
    var key = 'appts:' + state.filter + ':' + state.q;
    var rows = pull(key, function () {
      return A.listAll({ status: state.filter === 'all' ? null : state.filter, q: state.q });
    }, null);

    if (rows === null) {
      return '<div class="note">' + ZZ.icon('info') +
             '<span>در حال بارگذاری نوبت‌ها…</span></div>';
    }

    if (!rows.length) {
      return '<div class="empty">' +
               '<div class="empty__icon">' + ZZ.icon('calendar', null, 56) + '</div>' +
               '<h3>نوبتی پیدا نشد</h3>' +
               '<p>با این فیلتر نتیجه‌ای نبود. فیلتر یا عبارت جست‌وجو را عوض کنید.</p>' +
             '</div>';
    }

    var body = rows.map(function (r) {
      var a = r.appt;
      var st = a.statusLabel
        ? { text: a.statusLabel, cls: a.statusClass || 'badge--ok' }
        : ZZ.appointments.statusLabel(a);
      var d = u.fromKey(a.date);
      var canCancel = a.status === 'confirmed' && !r.isPast;
      var dep = a.deposit || null;
      var hist = r.history || null;
      var svcTitle = r.service && r.service.title ? r.service.title : '—';
      var variant = r.variant && r.variant.name ? r.variant.name : '';

      return '' +
        '<article class="admin-appt admin-appt--' + a.status + (a.status === 'cancelled' ? ' is-cancelled' : '') + '">' +
          '<div class="admin-appt__top">' +
            '<div class="admin-appt__when">' +
              '<span class="admin-appt__date">' + u.esc(u.faDate(d)) + '</span>' +
              '<span class="admin-appt__time">' + ZZ.icon('clock', null, 14) + 'ساعت ' + u.toFa(a.time) + '</span>' +
            '</div>' +
            '<div class="admin-appt__badges">' +
              '<span class="badge ' + st.cls + '">' + st.text + '</span>' +
              riskHTML(a, hist) +
            '</div>' +
          '</div>' +

          '<div class="admin-appt__body">' +
            '<div class="admin-appt__service">' +
              '<span class="admin-appt__label">خدمت</span>' +
              '<strong>' + u.esc(svcTitle) + '</strong>' +
              (variant ? '<small>' + u.esc(variant) + '</small>' : '') +
            '</div>' +

            '<div class="admin-appt__customer">' +
              '<span class="admin-appt__label">مراجعه‌کننده</span>' +
              '<strong>' + u.esc(r.user && r.user.name ? r.user.name : 'بدون نام') + '</strong>' +
              birthCell(r.user) +
              '<div class="admin-appt__tel">' + telCell(r.user) + '</div>' +
            '</div>' +

            '<div class="admin-appt__money">' +
              '<span class="admin-appt__label">مبلغ</span>' +
              '<strong class="nowrap">' + u.money(a.price) + ' ' + CUR + '</strong>' +
              (dep
                ? '<span class="dep-chip" title="' + u.esc(depMethodLabel(dep) + (dep.ref ? ' — کد ' + dep.ref : '')) + '">' +
                    ZZ.icon('checkCircle', null, 13) + 'بیعانه ' + u.money(dep.amount) +
                  '</span>'
                : '') +
            '</div>' +
          '</div>' +

          (a.note
            ? '<div class="admin-appt__note">' + ZZ.icon('edit', null, 14) + u.esc(a.note) + '</div>'
            : '') +

          (a.status === 'rejected' && a.rejectReason
            ? '<div class="admin-appt__reject">' + ZZ.icon('x', null, 14) + u.esc(a.rejectReason) + '</div>'
            : '') +

          '<div class="admin-appt__actions">' +
            actionsHTML(a, r, canCancel) +
          '</div>' +
        '</article>';
    }).join('');

    return '<div class="admin-list">' + body + '</div>';
  }

  /* ---------------- تب مدیریت روزها ---------------- */

  function renderDays() {
    var days = ZZ.appointments.getDays(21);

    /* در حالت سرور، تقویم ناهم‌گام می‌آید؛ تا آن موقع پیام بارگذاری
       نشان بده (رویداد zz:calendar بعداً دوباره رندر می‌کند). */
    if (!days || !days.length) {
      return '<div class="note">' + ZZ.icon('info') +
             '<span>در حال بارگذاری تقویم…</span></div>';
    }

    if (!state.selectedDay) {
      var firstOpen = days.filter(function (d) { return d.date.getDay() !== 5; })[0];
      state.selectedDay = firstOpen ? firstOpen.key : days[0].key;
    }

    var dayList = days.map(function (d) {
      var weekly = d.date.getDay() === 5;
      var cls = 'day-item' +
        (d.key === state.selectedDay ? ' is-active' : '') +
        (d.closed ? ' is-closed' : '');
      var sub = weekly ? 'تعطیل هفتگی' : (d.closedByAdmin ? 'شما بسته‌اید' : d.short);
      return '<button type="button" class="' + cls + '" data-day="' + d.key + '"' +
               (weekly ? ' disabled' : '') + '>' +
               '<span>' +
                 '<span class="day-item__main">' + u.esc(d.label) + '</span><br>' +
                 '<span class="day-item__sub">' + u.esc(sub) + '</span>' +
               '</span>' +
               (d.closed ? ZZ.icon('x', null, 16) : ZZ.icon('chevronLeft', null, 16)) +
             '</button>';
    }).join('');

    var sel = state.selectedDay;
    var selDate = u.fromKey(sel);
    var isWeeklyOff = selDate.getDay() === 5;

    /* وضعیت تعطیلی: در حالت سرور از همان فهرست روزها خوانده می‌شود
       (isDayClosed فقط در نسخه‌ی محلی وجود دارد). */
    var selDay = days.filter(function (d) { return d.key === sel; })[0];
    var isClosed = A.isDayClosed
      ? A.isDayClosed(sel)
      : !!(selDay && (selDay.closedByAdmin || (selDay.closed && !isWeeklyOff)));

    var slotsHTML;
    if (isWeeklyOff) {
      slotsHTML = '<div class="note note--warn">' + ZZ.icon('info') +
        '<span>جمعه‌ها تعطیلی ثابت است و در تنظیمات سالن تعریف شده.</span></div>';
    } else if (isClosed) {
      slotsHTML = '<div class="note note--danger">' + ZZ.icon('alert') +
        '<span>این روز را تعطیل کرده‌اید. برای باز کردن دوباره، دکمه‌ی بالا را بزنید.</span></div>';
    } else {
      var slots = pull('slots:' + sel, function () { return A.daySlots(sel); }, null);

      if (slots === null) {
        return dayManageShell(dayList, selDate, isWeeklyOff, isClosed,
          '<div class="note">' + ZZ.icon('info') +
          '<span>در حال بارگذاری ساعت‌ها…</span></div>');
      }

      slotsHTML = '<div class="admin-slots">' + slots.map(function (s) {
        var cls = 'admin-slot' +
          (s.booked ? ' is-booked' : '') +
          (s.blocked && !s.booked ? ' is-blocked' : '');
        var label = s.booked ? 'رزرو شده' : (s.blocked ? 'پر (دستی)' : 'آزاد');
        return '<button type="button" class="' + cls + '" data-slot="' + s.time + '"' +
                 (s.booked ? ' disabled title="این بازه رزرو واقعی دارد"' : '') + '>' +
                 '<span class="admin-slot__time">' + u.toFa(s.time) + '</span>' +
                 '<span class="admin-slot__state">' + label + '</span>' +
               '</button>';
      }).join('') + '</div>' +
      '<p class="muted" style="font-size:var(--fs-xs);margin-top:var(--sp-3);line-height:1.9;">' +
        'روی هر بازه بزنید تا دستی «پر» یا «آزاد» شود. بازه‌هایی که رزرو واقعی دارند قابل تغییر نیستند؛ ' +
        'برای آن‌ها از تب «نوبت‌ها» استفاده کنید.' +
      '</p>';
    }

    return dayManageShell(dayList, selDate, isWeeklyOff, isClosed, slotsHTML);
  }

  /** قالب مشترک تب «مدیریت روزها» */
  function dayManageShell(dayList, selDate, isWeeklyOff, isClosed, slotsHTML) {
    return '<div class="day-manage">' +
      '<div>' +
        '<h3 style="font-size:var(--fs-md);margin-bottom:var(--sp-3);">انتخاب روز</h3>' +
        '<div class="day-list">' + dayList + '</div>' +
      '</div>' +
      '<div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3);' +
             'margin-bottom:var(--sp-4);flex-wrap:wrap;">' +
          '<h3 style="font-size:var(--fs-md);margin:0;">' + u.esc(u.faDate(selDate, true)) + '</h3>' +
          (isWeeklyOff ? '' :
            '<button class="btn ' + (isClosed ? 'btn--soft' : 'btn--ghost') + ' btn--sm" id="toggleDayBtn">' +
              (isClosed ? ZZ.icon('check', null, 16) + 'باز کردن این روز'
                        : ZZ.icon('x', null, 16) + 'تعطیل کردن این روز') +
            '</button>') +
        '</div>' +
        slotsHTML +
      '</div>' +
    '</div>';
  }


  /* ---------------- تب مدیریت خدمات ---------------- */

  /** بسته‌بندی هر بخش از ویرایشگر خدمت */
  function svcSection(num, title, desc, inner) {
    return '<section class="svc-section">' +
      '<header class="svc-section__head">' +
        '<span class="svc-section__num">' + u.toFa(num) + '</span>' +
        '<div>' +
          '<h3 class="svc-section__title">' + u.esc(title) + '</h3>' +
          (desc ? '<p class="svc-section__desc">' + u.esc(desc) + '</p>' : '') +
        '</div>' +
      '</header>' +
      '<div class="svc-section__body">' + inner + '</div>' +
    '</section>';
  }

  function renderServices() {
    if (!state.services) {
      /* هنوز نیامده — در پس‌زمینه بگیر */
      if (ZZ.appointments.admin.services) {
        ZZ.appointments.admin.services().then(function (rows) {
          state.services = rows;
          render();
        }).catch(function (err) {
          state.services = [];
          ZZ.toast.error(err.message || 'خدمات بارگذاری نشد.');
          render();
        });
      } else {
        state.services = [];
      }
      return '<div class="note">' + ZZ.icon('info') +
             '<span>در حال بارگذاری خدمات…</span></div>';
    }

    if (!state.services.length) {
      return '<div class="empty">' +
               '<div class="empty__icon">' + ZZ.icon('tag', null, 56) + '</div>' +
               '<h3>خدمتی پیدا نشد</h3>' +
               '<p>اتصال به سرور برقرار نیست یا هنوز خدمتی تعریف نشده.</p>' +
             '</div>';
    }

    return '<div class="svc-editor">' + state.services.map(function (s) {
      var open = state.editingId === s.id;

      var rows = s.variants.map(function (v, i) {
        return '<div class="svc-var' + (v.is_active ? '' : ' is-off') + '" data-vi="' + i + '">' +
          '<div class="svc-var__grid">' +
            '<label class="svc-field svc-field--name">' +
              '<span>نام گزینه</span>' +
              '<input class="input" type="text" data-f="name" value="' + u.esc(v.name) + '">' +
            '</label>' +
            '<label class="svc-field">' +
              '<span>قیمت — تومان</span>' +
              '<input class="input ltr" type="number" min="0" step="50000" ' +
                'data-f="price" value="' + v.price + '">' +
            '</label>' +
            '<label class="svc-field">' +
              '<span>مدت (دقیقه)</span>' +
              '<input class="input ltr" type="number" min="5" step="15" ' +
                'data-f="duration_min" value="' + v.duration_min + '">' +
            '</label>' +
          '</div>' +
          '<label class="svc-field">' +
            '<span>توضیح کوتاه</span>' +
            '<input class="input" type="text" data-f="note" value="' + u.esc(v.note || '') + '">' +
          '</label>' +
          '<div class="svc-var__foot">' +
            '<label class="svc-check">' +
              '<input type="checkbox" data-f="is_active"' + (v.is_active ? ' checked' : '') + '>' +
              '<span>فعال</span>' +
            '</label>' +
            '<span class="svc-var__price">' + u.money(v.price) + ' ' + CUR + '</span>' +
          '</div>' +
        '</div>';
      }).join('');

      return '<article class="svc-card' + (open ? ' is-open' : '') + '" data-svc="' + s.id + '">' +
        '<button type="button" class="svc-card__head" data-toggle="' + s.id + '">' +
          '<span class="svc-card__icon">' + ZZ.icon(s.icon || 'sparkle', null, 20) + '</span>' +
          '<span class="svc-card__info">' +
            '<span class="svc-card__name">' + u.esc(s.title) + '</span>' +
            '<span class="svc-card__meta">' +
              u.toFa(s.variants.length) + ' گزینه · از ' +
              u.money(Math.min.apply(null, s.variants.map(function (v) { return v.price; }))) +
              ' ' + CUR +
            '</span>' +
          '</span>' +
          (s.is_active ? '' : '<span class="badge badge--muted">غیرفعال</span>') +
          ZZ.icon('chevronLeft', 'svc-card__arrow', 18) +
        '</button>' +

        '<div class="svc-card__body"><div class="svc-card__body__inner">' +
          svcSection(1, 'اطلاعات پایه‌ی خدمت', 'عنوان، توضیح کوتاه و لینک اینستاگرام.', 
            '<label class="svc-field">' +
              '<span>نام خدمت</span>' +
              '<input class="input" type="text" data-s="title" value="' + u.esc(s.title) + '">' +
            '</label>' +
            '<label class="svc-field">' +
              '<span>توضیح کوتاه (زیر عنوان کارت)</span>' +
              '<textarea class="input" data-s="short" rows="2">' + u.esc(s.short || '') + '</textarea>' +
            '</label>' +
            '<label class="svc-field">' +
              '<span>لینک اینستاگرام (اختیاری)</span>' +
              '<input class="input ltr" type="url" data-s="ig_link" ' +
                'placeholder="https://instagram.com/…" value="' + u.esc(s.ig_link || '') + '">' +
            '</label>'
          ) +

          svcSection(2, 'گزینه‌ها و قیمت‌ها', 'هر گزینه، قیمت و مدت مخصوص خودش را دارد.', 
            '<div class="svc-vars">' + rows + '</div>'
          ) +

          svcSection(3, 'محتوای صفحه‌ی خدمت', 'این بخش همان چیزی است که مشتری در صفحه‌ی جزئیات می‌بیند.',
            '<div class="svc-subgroup">' +
              '<h4 class="svc-sub">تگ‌ها — «مناسب برای»</h4>' +
              listEditor('good_for', s.good_for || [], 'مثلاً: مژه‌های کم‌پشت', true) +
            '</div>' +
            '<div class="svc-subgroup">' +
              '<h4 class="svc-sub">متن معرفی</h4>' +
              '<p class="svc-hint">هر بند یک پاراگراف جدا در صفحه‌ی خدمت است.</p>' +
              listEditor('description', s.description || [], 'متن پاراگراف…', false) +
            '</div>' +
            '<div class="svc-subgroup">' +
              '<h4 class="svc-sub">این خدمت شامل چه چیزهایی می‌شود</h4>' +
              listEditor('includes', s.includes || [], 'مثلاً: مشاوره‌ی رایگان', false) +
            '</div>' +
            '<div class="svc-subgroup">' +
              '<h4 class="svc-sub">مراقبت‌های بعد از انجام</h4>' +
              listEditor('aftercare', s.aftercare || [], 'مثلاً: تا ۲۴ ساعت آب نزنید', false) +
            '</div>' +
            '<div class="svc-subgroup">' +
              '<h4 class="svc-sub">پرسش‌های متداول</h4>' +
              '<p class="svc-hint">پرسش‌ها برای مشتری بالای صفحه‌ی خدمت نمایش داده می‌شوند.</p>' +
              faqEditor(s.faq || []) +
            '</div>'
          ) +

          '<div class="svc-editor__actions">' +
            '<button class="btn btn--primary btn--sm" data-save="' + s.id + '">' +
              ZZ.icon('check', null, 16) + 'ذخیره‌ی تغییرات</button>' +
            '<button class="btn btn--quiet btn--sm" data-cancel-edit="1">انصراف</button>' +
          '</div>' +
        '</div></div>' +
      '</article>';
    }).join('') + '</div>' +

    '<div class="note note--info" style="margin-top:var(--sp-4);">' + ZZ.icon('info') +
      '<span>تغییر قیمت روی نوبت‌های ثبت‌شده اثر ندارد؛ هر نوبت قیمت زمان رزرو ' +
      'خودش را نگه می‌دارد.</span></div>';
  }

  /* ---------------- ویرایشگر فهرست‌ها ----------------
     یک فهرست ساده از سطرهای متنی: هر سطر یک ورودی با دکمه‌ی حذف،
     به‌علاوه‌ی یک دکمه برای افزودن سطر تازه. */

  function listRow(field, value, placeholder, chip) {
    return '<div class="svc-row' + (chip ? ' svc-row--chip' : '') + '">' +
             (chip
               ? '<input class="input" type="text" data-list="' + field + '" ' +
                   'placeholder="' + placeholder + '" value="' + u.esc(value) + '">'
               : '<textarea class="input" rows="2" data-list="' + field + '" ' +
                   'placeholder="' + placeholder + '">' + u.esc(value) + '</textarea>') +
             '<button type="button" class="svc-del" data-del-row="1" ' +
               'title="حذف این سطر" aria-label="حذف">' + ZZ.icon('x', null, 15) + '</button>' +
           '</div>';
  }

  function listEditor(field, items, placeholder, chip) {
    var rows = (items.length ? items : ['']).map(function (v) {
      return listRow(field, v, placeholder, chip);
    }).join('');

    return '<div class="svc-list" data-list-wrap="' + field + '">' +
             rows +
             '<button type="button" class="svc-add" data-add-row="' + field + '" ' +
               'data-chip="' + (chip ? '1' : '') + '" ' +
               'data-ph="' + placeholder + '">' +
               ZZ.icon('plus', null, 15) + 'افزودن' +
             '</button>' +
           '</div>';
  }

  function faqRow(q, a) {
    return '<div class="svc-faq">' +
             '<div class="svc-faq__head">' +
               '<input class="input" type="text" data-faq="q" placeholder="پرسش…" ' +
                 'value="' + u.esc(q) + '">' +
               '<button type="button" class="svc-del" data-del-row="1" ' +
                 'title="حذف این پرسش" aria-label="حذف">' + ZZ.icon('x', null, 15) + '</button>' +
             '</div>' +
             '<textarea class="input" rows="2" data-faq="a" ' +
               'placeholder="پاسخ…">' + u.esc(a) + '</textarea>' +
           '</div>';
  }

  function faqEditor(items) {
    var rows = (items.length ? items : [{ q: '', a: '' }]).map(function (f) {
      return faqRow(f.q || '', f.a || '');
    }).join('');

    return '<div class="svc-list" data-faq-wrap="1">' +
             rows +
             '<button type="button" class="svc-add" data-add-faq="1">' +
               ZZ.icon('plus', null, 15) + 'افزودن پرسش' +
             '</button>' +
           '</div>';
  }

  /** جمع‌آوری مقادیر فرم یک خدمت */
  function collectService(card) {
    var payload = {};
    u.$$('[data-s]', card).forEach(function (el) {
      payload[el.dataset.s] = el.value.trim();
    });

    payload.variants = u.$$('.svc-var', card).map(function (row) {
      var i = parseInt(row.dataset.vi, 10);
      var svc = state.services.filter(function (x) {
        return x.id === parseInt(card.dataset.svc, 10);
      })[0];
      var orig = svc.variants[i];

      var get = function (f) { return u.$('[data-f="' + f + '"]', row); };
      return {
        id: orig.id,
        key: orig.key,
        name: get('name').value.trim(),
        note: get('note').value.trim(),
        price: parseInt(get('price').value, 10) || 0,
        duration_min: parseInt(get('duration_min').value, 10) || 60,
        is_active: get('is_active').checked
      };
    });

    /* ---- فهرست‌های متنی ---- */
    ['good_for', 'description', 'includes', 'aftercare'].forEach(function (field) {
      var wrap = u.$('[data-list-wrap="' + field + '"]', card);
      if (!wrap) return;
      payload[field] = u.$$('[data-list]', wrap)
        .map(function (el) { return el.value.trim(); })
        .filter(function (v) { return v; });   // سطرهای خالی حذف
    });

    /* ---- پرسش‌های متداول ---- */
    var faqWrap = u.$('[data-faq-wrap]', card);
    if (faqWrap) {
      payload.faq = u.$$('.svc-faq', faqWrap).map(function (row) {
        return {
          q: (u.$('[data-faq="q"]', row) || {}).value || '',
          a: (u.$('[data-faq="a"]', row) || {}).value || ''
        };
      }).filter(function (f) {
        return f.q.trim() && f.a.trim();       // فقط جفت‌های کامل
      }).map(function (f) {
        return { q: f.q.trim(), a: f.a.trim() };
      });
    }

    return payload;
  }

  /* ---------------- رندر کل صفحه ---------------- */

  function render() {
    var root = u.$('#adminRoot');
    var st = pull('stats', function () { return A.stats(); },
                  { today: '—', upcoming: '—', users: '—', total: '—' });
    var user = ZZ.auth.currentUser() || {};

    var pendingCount = (typeof st.pending === 'number') ? st.pending : 0;
    var filters = [
      { id: 'pending', label: 'در انتظار تأیید', count: pendingCount },
      { id: 'upcoming', label: 'تأییدشده' },
      { id: 'past', label: 'انجام شده' },
      { id: 'cancelled', label: 'لغو / رد شده' },
      { id: 'all', label: 'همه' }
    ];

    root.innerHTML = '' +
      /* ---- سربرگ تیره ---- */
      '<div class="panel-head">' +
        '<div class="container">' +
          '<div class="panel-head__row">' +
            '<div>' +
              '<h1>پنل مدیریت</h1>' +
              '<p>خوش آمدید ' + u.esc(user.name || 'مدیر') + ' — نوبت‌های در انتظار، امروز و آمار سالن را اینجا می‌بینید.</p>' +
            '</div>' +
            '<div class="panel-head__actions">' +
              '<span class="badge badge--gold">' + ZZ.icon('shield', null, 14) + 'دسترسی مدیر</span>' +
              '<a class="btn btn--ghost btn--sm head-link" href="' + B + 'panel/index.html">' +
                '<span class="ltr">' + u.prettyPhoneHTML(user.phone || '') + '</span>' +
              '</a>' +
              '<button class="btn btn--quiet btn--sm head-logout" id="logoutBtn">' +
                ZZ.icon('logout', null, 16) + 'خروج</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="container">' +
        /* ---- آمار ---- */
        '<div class="admin-stats">' +
          '<div class="admin-stat' + (pendingCount ? ' admin-stat--wait' : '') + '">' +
            '<strong>' + u.toFa(st.pending === undefined ? '—' : st.pending) + '</strong>' +
            '<span>در انتظار تأیید</span></div>' +
          '<div class="admin-stat admin-stat--accent"><strong>' + u.toFa(st.today) + '</strong><span>نوبت امروز</span></div>' +
          '<div class="admin-stat"><strong>' + u.toFa(st.upcoming) + '</strong><span>نوبت پیش رو</span></div>' +
          '<div class="admin-stat"><strong>' + u.toFa(st.users) + '</strong><span>مراجعه‌کننده</span></div>' +
        '</div>' +

        /* ---- تب‌ها ---- */
        '<div class="admin-tabs" role="tablist">' +
          '<button class="admin-tab' + (state.tab === 'appointments' ? ' is-active' : '') + '" ' +
            'data-tab="appointments" role="tab">' + ZZ.icon('calendar', null, 17) + 'نوبت‌ها</button>' +
          '<button class="admin-tab' + (state.tab === 'days' ? ' is-active' : '') + '" ' +
            'data-tab="days" role="tab">' + ZZ.icon('grid', null, 17) + 'روزها و ساعت‌ها</button>' +
          '<button class="admin-tab' + (state.tab === 'services' ? ' is-active' : '') + '" ' +
            'data-tab="services" role="tab">' + ZZ.icon('tag', null, 17) + 'خدمات و محتوا</button>' +
        '</div>' +

        (state.tab === 'services'
          ? renderServices()
          : state.tab === 'appointments'
          ? /* ---- نوار ابزار ---- */
            '<div class="admin-toolbar">' +
              filters.map(function (f) {
                return '<button class="btn ' +
                  (state.filter === f.id ? 'btn--primary' : 'btn--ghost') +
                  ' btn--sm" data-filter="' + f.id + '">' + f.label +
                  (f.count ? '<span class="count-dot">' + u.toFa(f.count) + '</span>' : '') +
                  '</button>';
              }).join('') +
              '<span class="admin-toolbar__spacer"></span>' +
              '<input class="input" id="searchInput" type="search" placeholder="جست‌وجوی نام، شماره یا خدمت…" ' +
                'value="' + u.esc(state.q) + '">' +
            '</div>' +
            renderAppointments()
          : renderDays()) +

        '<div style="height:var(--sp-8);"></div>' +
      '</div>';
  }

  /* ---------------- رویدادها ---------------- */

  /* ⚠️ نکته‌ی مهم:
     render() فقط innerHTML عنصر #adminRoot را عوض می‌کند و خودِ این عنصر
     هیچ‌وقت از DOM حذف نمی‌شود. پس شنونده‌هایی که به آن وصل می‌شوند باقی
     می‌مانند. اگر bind() در انتهای هر render() صدا زده شود، شنونده‌ها روی
     هم انباشته می‌شوند و یک کلیک ساده چند بار اجرا می‌شود (۲ بار، بعد ۴،
     بعد ۸ و ...). چون toggleSlot() یک کلید است، اجرای زوج آن را باز و
     دوباره بسته می‌کند؛ در نتیجه ظاهراً «هیچ اتفاقی نمی‌افتد» ولی چند
     پیام هم‌زمان نشان داده می‌شود.
     راه‌حل: شنونده‌ها فقط یک بار وصل شوند. */
  var bound = false;

  /* جست‌وجو با تاخیر — بیرون از bind() ساخته می‌شود تا debounce
     بین کلیدفشارها حالتش را نگه دارد. */
  var runSearch = u.debounce(function () {
    render();
    /* فوکوس را برگردان تا تایپ قطع نشود */
    var s2 = u.$('#searchInput');
    if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }
  }, 300);

  function bind() {
    if (bound) return;
    bound = true;

    var root = u.$('#adminRoot');

    root.addEventListener('click', function (e) {
      /* تب‌ها */
      var tab = e.target.closest('[data-tab]');
      if (tab) { state.tab = tab.dataset.tab; render(); return; }

      /* فیلتر */
      var f = e.target.closest('[data-filter]');
      if (f) { state.filter = f.dataset.filter; render(); return; }

      /* انتخاب روز */
      var day = e.target.closest('[data-day]');
      if (day && !day.disabled) {
        state.selectedDay = day.dataset.day;
        render();
        return;
      }

      /* تعطیل/باز کردن روز */
      if (e.target.closest('#toggleDayBtn')) {
        var dayBtn = e.target.closest('#toggleDayBtn');
        if (dayBtn.disabled) return;
        dayBtn.disabled = true;
        run(A.toggleDay(state.selectedDay), function (closed) {
          ZZ.toast.ok(closed ? 'این روز تعطیل شد' : 'این روز دوباره باز شد');
          invalidate('slots:');
          invalidate('days');
          invalidate('stats');
          render();
        });
        return;
      }

      /* پر/آزاد کردن بازه */
      var slot = e.target.closest('[data-slot]');
      if (slot && !slot.disabled) {
        /* جلوگیری از کلیک دوباره تا وقتی پاسخ سرور برسد */
        slot.disabled = true;
        run(A.toggleSlot(state.selectedDay, slot.dataset.slot), function (blocked) {
          ZZ.toast.ok(blocked ? 'این بازه پر شد' : 'این بازه آزاد شد');
          invalidate('slots:' + state.selectedDay);
          invalidate('days');
          render();
        });
        return;
      }

      /* ---- تأیید درخواست ---- */
      var appr = e.target.closest('[data-approve]');
      if (appr) {
        appr.disabled = true;
        run(A.approve(appr.dataset.approve), function (res) {
          if (!res) { ZZ.toast.error('این درخواست دیگر در انتظار تأیید نیست.'); }
          else { ZZ.toast.ok('نوبت تأیید شد'); }
          afterChange();
        });
        return;
      }

      /* ---- رد درخواست ---- */
      var rej = e.target.closest('[data-reject]');
      if (rej) {
        var why = global.prompt(
          'دلیل رد درخواست (به مراجعه‌کننده نشان داده می‌شود):',
          'در این ساعت امکان پذیرش نبود'
        );
        if (why === null) return;
        rej.disabled = true;
        run(A.reject(rej.dataset.reject, why), function (res) {
          if (!res) { ZZ.toast.error('این درخواست دیگر در انتظار تأیید نیست.'); }
          else { ZZ.toast.ok('درخواست رد شد و ساعت آزاد شد'); }
          afterChange();
        });
        return;
      }

      /* ---- ثبت بیعانه ---- */
      var depBtn = e.target.closest('[data-deposit]');
      if (depBtn) {
        openDepositDialog(depBtn.dataset.deposit);
        return;
      }

      /* ---- انجام شد / غیبت ---- */
      var doneBtn = e.target.closest('[data-done]');
      if (doneBtn) {
        run(A.markDone(doneBtn.dataset.done), function () {
          ZZ.toast.ok('نوبت انجام‌شده ثبت شد');
          afterChange();
        });
        return;
      }

      var nsBtn = e.target.closest('[data-noshow]');
      if (nsBtn) {
        if (!global.confirm('غیبت این مراجعه‌کننده ثبت شود؟ دفعه‌ی بعد به شما یادآوری می‌شود که بیعانه بگیرید.')) return;
        run(A.markNoShow(nsBtn.dataset.noshow), function () {
          ZZ.toast.ok('غیبت ثبت شد');
          afterChange();
        });
        return;
      }

      /* لغو نوبت */
      var cancel = e.target.closest('[data-cancel]');
      if (cancel) {
        if (!global.confirm('این نوبت لغو شود؟ به مراجعه‌کننده اطلاع بدهید.')) return;
        cancel.disabled = true;
        run(A.cancelAppointment(cancel.dataset.cancel), function () {
          ZZ.toast.ok('نوبت لغو شد');
          invalidate('appts:');
          invalidate('slots:');
          invalidate('stats');
          render();
        });
        return;
      }

      /* باز/بسته کردن کارت خدمت */
      var toggle = e.target.closest('[data-toggle]');
      if (toggle) {
        var id = parseInt(toggle.dataset.toggle, 10);
        state.editingId = (state.editingId === id) ? null : id;
        render();
        return;
      }

      if (e.target.closest('[data-cancel-edit]')) {
        state.editingId = null;
        render();
        return;
      }

      /* ---- افزودن/حذف سطر در ویرایشگر خدمات ----
         این‌ها مستقیم روی DOM کار می‌کنند و render() صدا نمی‌زنند،
         وگرنه بقیه‌ی تغییرات ذخیره‌نشده‌ی کاربر پاک می‌شد. */

      var del = e.target.closest('[data-del-row]');
      if (del) {
        var row = del.closest('.svc-faq') || del.closest('.svc-row');
        var wrap = row && row.parentNode;
        if (row) row.parentNode.removeChild(row);
        /* اگر هیچ سطری نماند، یک سطر خالی بگذار تا فرم خالی نماند */
        if (wrap && !u.$$('.svc-row, .svc-faq', wrap).length) {
          var addBtn = u.$('[data-add-row], [data-add-faq]', wrap);
          if (addBtn) addBtn.click();
        }
        return;
      }

      var addRow = e.target.closest('[data-add-row]');
      if (addRow) {
        var field = addRow.dataset.addRow;
        var isChip = !!addRow.dataset.chip;
        var ph = addRow.dataset.ph || '';
        var tmp = document.createElement('div');
        tmp.innerHTML = listRow(field, '', ph, isChip);
        var node = tmp.firstChild;
        addRow.parentNode.insertBefore(node, addRow);
        var input = u.$('[data-list]', node);
        if (input) input.focus();
        return;
      }

      if (e.target.closest('[data-add-faq]')) {
        var addFaq = e.target.closest('[data-add-faq]');
        var tmp2 = document.createElement('div');
        tmp2.innerHTML = faqRow('', '');
        var node2 = tmp2.firstChild;
        addFaq.parentNode.insertBefore(node2, addFaq);
        var qi = u.$('[data-faq="q"]', node2);
        if (qi) qi.focus();
        return;
      }

      /* ذخیره‌ی خدمت */
      var save = e.target.closest('[data-save]');
      if (save) {
        var sid = parseInt(save.dataset.save, 10);
        var card = save.closest('.svc-card');
        var payload = collectService(card);

        if (!payload.title) {
          ZZ.toast.error('نام خدمت نمی‌تواند خالی باشد.');
          return;
        }

        save.classList.add('is-loading');
        ZZ.appointments.admin.updateService(sid, payload)
          .then(function () {
            ZZ.toast.ok('تغییرات ذخیره شد.');
            state.services = null;   // تازه‌سازی از سرور
            state.editingId = null;
            render();
          })
          .catch(function (err) {
            save.classList.remove('is-loading');
            ZZ.toast.error(err.message || 'ذخیره نشد.');
          });
        return;
      }

      /* خروج */
      if (e.target.closest('#logoutBtn')) {
        if (!global.confirm('از حساب خارج می‌شوید؟')) return;
        ZZ.auth.logout();
        global.location.href = B + 'index.html';
      }
    });

    /* ورودی‌ها — واگذارشده (delegated)، چون خودِ فیلدها با هر render
       دوباره ساخته می‌شوند و شنونده‌ی مستقیم روی آن‌ها از بین می‌رود. */
    root.addEventListener('input', function (e) {
      var el = e.target;
      if (!el || !el.dataset) return;

      /* نمایش زنده‌ی قیمت هنگام تایپ */
      if (el.dataset.f === 'price') {
        var row = el.closest('.svc-var');
        var out = row ? u.$('.svc-var__price', row) : null;
        if (out) out.textContent = u.money(parseInt(el.value, 10) || 0) + ' ' + CUR;
        return;
      }

      /* جست‌وجو */
      if (el.id === 'searchInput') {
        state.q = el.value;
        runSearch();
      }
    });
  }

  /* ---------------- شروع ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    ZZ.shell({ active: 'account', base: B });

    /* اگر بک‌اند فعال است، نشست به‌صورت ناهمگام از سرور می‌آید.
       گارد نقش باید صبر کند وگرنه قبل از رسیدن پاسخ، کاربر را
       بیرون می‌اندازد. */
    /* وقتی تقویم ناهم‌گام از سرور رسید، دوباره رندر کن */
    global.addEventListener('zz:calendar', function () {
      if (u.$('#adminRoot') && u.$('#adminRoot').innerHTML) render();
    });

    var boot = function () {
      if (!ZZ.auth.requireAdmin(B)) return;
      render();
      bind();   // فقط یک بار — بعد از ساخته‌شدن اولین محتوا
    };

    if (ZZ.ready && typeof ZZ.ready.then === 'function') {
      ZZ.ready.then(boot).catch(boot);
    } else {
      boot();
    }
  });
})(window);
