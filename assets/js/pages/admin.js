/* ==========================================================================
   admin.js — پنل مدیریت (panel/admin) — بازطراحی موبایل‌محور

   قابلیت‌ها:
   • ناوبری پایین‌صفحه (dock) در موبایل + سایدبار ثابت در دسکتاپ
   • مشاهده‌ی همه‌ی نوبت‌ها با فیلتر و جست‌وجو + اسکلت بارگذاری
   • کارت‌های آماریِ کلیک‌پذیر (پرش مستقیم به فهرست/برنامه‌ی روز)
   • تقویم ماهانه‌ی شمسی برای مدیریت روزها + برنامه‌ی روز با نام
     مراجعه‌کننده‌ها و تماس یک‌لمسی
   • پنجره‌های گفت‌وگوی هماهنگ با طراحی (جایگزین prompt/confirm بومی):
     رد درخواست با دلایل آماده، تأیید لغو/غیبت/خروج، ثبت بیعانه
   • تعطیل کردن روز، پر کردن دستی بازه، لغو نوبت بدون محدودیت ۲۴ ساعته

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

  /* بخش‌های پنل — هم برای dock موبایل هم سایدبار دسکتاپ */
  var TABS = [
    { id: 'appointments', label: 'نوبت‌ها',       short: 'نوبت‌ها',  icon: 'calendarDays' },
    { id: 'days',         label: 'روزها و ساعت‌ها', short: 'روزها',   icon: 'clock' },
    { id: 'customers',    label: 'باشگاه مشتریان', short: 'مشتریان', icon: 'users' },
    { id: 'services',     label: 'خدمات و محتوا',  short: 'خدمات',  icon: 'tag' }
  ];

  /* دلایل آماده‌ی رد — ۸۰٪ مواقع مدیر با همین‌ها جواب می‌دهد */
  var REJECT_REASONS = [
    'در این ساعت امکان پذیرش نبود',
    'ظرفیت این روز تکمیل است',
    'این خدمت فعلاً ارائه نمی‌شود',
    'برای هماهنگی ساعت دیگر با شما تماس می‌گیریم'
  ];

  /* سرِ هفته‌ی فارسی: شنبه…جمعه */
  var J_WEEK = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

  var state = {
    tab: 'appointments',   // appointments | days | customers | services
    /* پیش‌فرض روی صف درخواست‌هاست: اولین چیزی که مدیر باید ببیند
       رزروهایی است که منتظر تماس و تأیید او هستند. */
    filter: 'pending',     // pending | upcoming | past | cancelled | all
    q: '',
    selectedDay: null,
    calIndex: 0,           // کدام ماهِ تقویم باز است
    custQ: '',             // جست‌وجوی باشگاه مشتریان
    custId: null,          // مشتری که پرونده‌اش باز است
    services: null,        // کش خدمات برای تب ویرایش
    editingId: null,       // خدمتی که ویرایشگرش باز است
    /* dirty یعنی کاربر در ویرایشگر چیزی تغییر داده که هنوز ذخیره
       نشده — تا وقتی true است هیچ رندر مجددی فرم او را بازنویسی
       نمی‌کند و خروج از تب/ویرایشگر اول تأیید می‌گیرد. */
    dirty: false,
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
          /* safeRender تا ویرایشگر خدمتِ در حال تایپ از بین نرود */
          safeRender();
        }).catch(function (err) {
          state.cache[key] = fallback;
          loading[key] = false;
          ZZ.toast.error((err && err.message) || 'دریافت اطلاعات از سرور ناموفق بود.');
          safeRender();
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
    invalidate('customers');
    invalidate('cust:');
    render();
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

  /* ---------------- پنجره‌های گفت‌وگو ----------------
     همه‌ی تصمیم‌های مخرب (رد، لغو، غیبت، خروج) از همین‌جا می‌گذرند.
     dialog.js فوکوس‌ترپ، Esc، قفل اسکرول و برگشت فوکوس را مدیریت می‌کند. */

  /**
   * پنجره‌ی رد درخواست — دلایل آماده + متن آزاد.
   * جایگزین prompt() بومی که با طراحی سایت نمی‌خواند.
   */
  function openRejectDialog(apptId) {
    var reason = REJECT_REASONS[0];

    ZZ.dialog.open({
      title: 'رد این درخواست',
      hint: 'دلیل رد به مراجعه‌کننده نشان داده می‌شود و ساعتِ او فوراً آزاد می‌شود.',
      body:
        '<div class="chip-row" id="rejChips" role="group" aria-label="دلایل آماده">' +
          REJECT_REASONS.map(function (r, i) {
            return '<button type="button" class="chip' + (i === 0 ? ' is-active' : '') +
              '" data-reason="' + u.esc(r) + '">' + u.esc(r) + '</button>';
          }).join('') +
        '</div>' +
        '<label class="field" style="margin:var(--sp-4) 0 0;">' +
          '<span class="field__label">دلیل رد</span>' +
          '<textarea class="input" id="rejReason" rows="3" maxlength="200">' +
            u.esc(REJECT_REASONS[0]) + '</textarea>' +
        '</label>',
      confirmLabel: 'رد درخواست',
      danger: true,
      onMount: function (host) {
        var chips = host.querySelector('#rejChips');
        chips.addEventListener('click', function (ev) {
          var chip = ev.target.closest('[data-reason]');
          if (!chip) return;
          u.$$('.chip', chips).forEach(function (c) { c.classList.remove('is-active'); });
          chip.classList.add('is-active');
          host.querySelector('#rejReason').value = chip.dataset.reason;
        });
      },
      onConfirm: function (host) {
        var t = host.querySelector('#rejReason').value.trim();
        if (!t) {
          ZZ.toast.error('دلیل رد را بنویسید یا یکی از گزینه‌ها را انتخاب کنید.');
          return false;
        }
        reason = t;
        return true;
      }
    }).then(function (ok) {
      if (!ok) return;
      run(A.reject(apptId, reason), function (res) {
        if (!res) { ZZ.toast.error('این درخواست دیگر در انتظار تأیید نیست.'); }
        else { ZZ.toast.ok('درخواست رد شد و ساعت آزاد شد'); }
        afterChange();
      });
    });
  }

  /** پنجره‌ی تأیید مخرب — هم‌ارز confirm() بومی */
  function confirmDanger(opts) {
    return ZZ.dialog.confirm({
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel || 'بله، انجام بده',
      danger: true
    });
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
    var payload = {};

    ZZ.dialog.open({
      title: current ? 'ویرایش بیعانه' : 'ثبت بیعانه‌ی دریافت‌شده',
      hint: (row && row.user
        ? u.esc(row.user.name || 'بدون نام') + ' — ' +
          '<span class="ltr">' + u.esc(row.user.phone || '') + '</span>'
        : ''),
      body:
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
            'value="' + u.esc(current ? current.ref || '' : '') + '"></label>',
      extra: current
        ? '<button type="button" class="btn btn--quiet btn--sm" data-clear="1">حذف بیعانه</button>'
        : '',
      confirmLabel: 'ثبت',
      onMount: function (host, api) {
        var amountInput = host.querySelector('#depAmount');
        amountInput.focus();
        amountInput.select();

        host.addEventListener('click', function (ev) {
          if (ev.target.closest('[data-clear]')) api.close('clear');
        });
      },
      onConfirm: function (host) {
        payload = {
          amount: host.querySelector('#depAmount').value,
          method: host.querySelector('#depMethod').value,
          ref: host.querySelector('#depRef').value
        };
        /* همان اعتبارسنجیِ لایه‌ی داده — اینجا تا کاربر درست وارد
           نکند پنجره بسته نمی‌شود. */
        var amt = parseInt(u.toEn(String(payload.amount)).replace(/\D/g, ''), 10);
        if (!amt || amt <= 0) {
          ZZ.toast.error('مبلغ بیعانه را درست وارد کنید.');
          return false;
        }
        return true;
      }
    }).then(function (res) {
      if (res === 'clear') {
        run(A.clearDeposit(apptId), function () {
          ZZ.toast.ok('بیعانه حذف شد');
          afterChange();
        });
        return;
      }
      if (res !== true) return;
      run(A.setDeposit(apptId, payload), function () {
        ZZ.toast.ok('بیعانه ثبت شد');
        afterChange();
      });
    });
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
               (isB ? '<span class="birth-ico" title="امروز تولد اوست">' + ZZ.icon('cake', null, 14) + '</span>' : '') +
               u.esc(lbl) +
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
             (isBirthday ? '<span class="birth-ico" title="امروز تولد اوست">' + ZZ.icon('cake', null, 14) + '</span>' : '') +
             u.formatBirth(b) +
           '</span>';
  }

  /* ---------------- اسکلت بارگذاری ----------------
     به‌جای متنِ «در حال بارگذاری…» — جای واقعی محتوا را نگه
     می‌دارد تا صفحه نپرد و حس سرعت بدهد. */

  function skeletonAppts() {
    var card =
      '<div class="skel-card" aria-hidden="true">' +
        '<div class="skel-row"><span class="skel skel--chip"></span><span class="skel skel--chip"></span></div>' +
        '<span class="skel skel--line"></span>' +
        '<span class="skel skel--line skel--sm"></span>' +
        '<div class="skel-row"><span class="skel skel--btn"></span><span class="skel skel--btn"></span></div>' +
      '</div>';
    return '<div class="admin-list" aria-busy="true">' + card + card + card + '</div>';
  }

  function skeletonSlots() {
    var cell = '<span class="skel skel--slot"></span>';
    return '<div class="admin-slots" aria-busy="true">' + cell + cell + cell + cell + cell + cell + '</div>';
  }

  function skeletonCal() {
    var cells = '';
    for (var i = 0; i < 28; i++) cells += '<span class="skel skel--day"></span>';
    return '<div class="cal-grid" aria-busy="true">' + cells + '</div>';
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
        btns.push('<a class="btn btn--call btn--sm" href="' + tel + '">' +
                  ZZ.icon('phone', null, 14) + 'تماس</a>');
      }
      btns.push('<button class="btn btn--ghost btn--sm" data-deposit="' + a.id + '">' +
                (a.deposit ? 'بیعانه' : 'ثبت بیعانه') + '</button>');
      btns.push('<button class="btn btn--primary btn--sm" data-approve="' + a.id + '">' +
                ZZ.icon('check', null, 15) + 'تأیید</button>');
      btns.push('<button class="btn btn--quiet btn--sm" data-reject="' + a.id + '">رد</button>');
    } else if (a.status === 'confirmed' && !r.isPast) {
      btns.push('<button class="btn btn--ghost btn--sm" data-deposit="' + a.id + '">' +
                (a.deposit ? 'بیعانه' : 'ثبت بیعانه') + '</button>');
      if (canCancel) {
        btns.push('<button class="btn btn--quiet btn--sm" data-cancel="' + a.id + '">لغو</button>');
      }
    } else if (a.status === 'confirmed' && r.isPast) {
      btns.push('<button class="btn btn--ghost btn--sm" data-done="' + a.id + '">' +
                ZZ.icon('check', null, 15) + 'انجام شد</button>');
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
      return skeletonAppts();
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

  /* ---------------- تقویم شمسی (تب روزها) ---------------- */

  var J_FMT = null;

  /** تبدیل Date به (سال، ماه، روز) شمسی — همان روش tools/check-jalali.js */
  function jParts(d) {
    if (!J_FMT) {
      J_FMT = new Intl.DateTimeFormat('en-u-ca-persian', {
        year: 'numeric', month: 'numeric', day: 'numeric'
      });
    }
    var o = {};
    J_FMT.formatToParts(d).forEach(function (p) {
      if (p.type === 'year' || p.type === 'month' || p.type === 'day') {
        o[p.type] = parseInt(p.value, 10);
      }
    });
    return { y: o.year || 0, m: o.month || 0, d: o.day || 0 };
  }

  /** شماره‌ی روز هفته به سبک فارسی: شنبه=۰ … جمعه=۶ */
  function pWeek(d) { return (d.getDay() + 1) % 7; }

  /** گروه‌بندی روزها بر اساس ماه شمسی */
  function monthGroups(days) {
    var groups = [];
    days.forEach(function (d) {
      var jp = jParts(d.date);
      var g = groups[groups.length - 1];
      if (g && g.y === jp.y && g.m === jp.m) { g.days.push(d); return; }
      groups.push({ y: jp.y, m: jp.m, label: u.jMonths[jp.m - 1] || '', days: [d] });
    });
    return groups;
  }

  /** نام و شماره‌ی مشتریِ یک بازه‌ی رزروشده — هم حالت سرور هم محلی */
  function slotCustomer(s) {
    if (s.customer && s.customer.name) return s.customer.name;
    if (s.appt && ZZ.auth.allUsers) {
      var usr = (ZZ.auth.allUsers() || {})[s.appt.userId];
      if (usr && usr.name) return usr.name;
    }
    return null;
  }

  function slotPhone(s) {
    if (s.customer && s.customer.phone) return s.customer.phone;
    if (s.appt && ZZ.auth.allUsers) {
      var usr = (ZZ.auth.allUsers() || {})[s.appt.userId];
      if (usr) return usr.phone || null;
    }
    return null;
  }

  function slotHTML(s) {
    /* بازه‌ی رزروشده: کارت با نام مراجعه‌کننده — لمس یعنی تماس */
    if (s.booked) {
      var cust = slotCustomer(s);
      var phone = slotPhone(s);
      if (phone) {
        var href = 'tel:' + u.normalizePhone(phone).replace(/^0/, '+98');
        return '<a class="admin-slot is-booked" href="' + href + '" ' +
          'title="' + u.esc(cust || 'رزرو شده') + ' — تماس">' +
          '<span class="admin-slot__time">' + u.toFa(s.time) + '</span>' +
          '<span class="admin-slot__state">' +
            '<strong>' + u.esc(cust || 'رزرو شده') + '</strong>' +
            '<small>' + ZZ.icon('phone', null, 11) + 'برای تماس بزنید</small>' +
          '</span>' +
        '</a>';
      }
      return '<div class="admin-slot is-booked">' +
        '<span class="admin-slot__time">' + u.toFa(s.time) + '</span>' +
        '<span class="admin-slot__state"><strong>' + u.esc(cust || 'رزرو شده') + '</strong></span>' +
      '</div>';
    }

    var blocked = s.blocked;
    return '<button type="button" class="admin-slot' + (blocked ? ' is-blocked' : '') +
      '" data-slot="' + s.time + '" aria-pressed="' + (blocked ? 'true' : 'false') + '">' +
      '<span class="admin-slot__time">' + u.toFa(s.time) + '</span>' +
      '<span class="admin-slot__state">' + (blocked ? 'پر (دستی)' : 'آزاد') + '</span>' +
    '</button>';
  }

  function renderDays() {
    /* تقویم مستقیم خوانده می‌شود (نه با pull) — در حالت سرور اول
       خالی می‌آید و رویداد zz:calendar بعداً دوباره رندر می‌کند. */
    var days = ZZ.appointments.getDays(60);

    if (!days || !days.length) {
      return '<div class="day-manage">' +
        '<div class="cal-card"><div class="cal-head"><span class="skel skel--chip"></span></div>' + skeletonCal() + '</div>' +
        '<div>' + skeletonSlots() + '</div>' +
      '</div>';
    }

    var todayKey = u.dateKey(new Date());

    /* روزِ انتخاب‌شده معتبر نیست؟ برگرد به امروز */
    var hasSel = days.some(function (d) { return d.key === state.selectedDay; });
    if (!state.selectedDay || !hasSel) {
      state.selectedDay = todayKey;
      state.calIndex = 0;
    }

    var groups = monthGroups(days);
    var gi = Math.max(0, Math.min(state.calIndex || 0, groups.length - 1));
    state.calIndex = gi;
    var g = groups[gi];

    /* ---- خانه‌های تقویم ---- */
    var cells = '';
    var lead = pWeek(g.days[0].date);
    for (var b = 0; b < lead; b++) {
      cells += '<span class="cal-cell cal-cell--blank" aria-hidden="true"></span>';
    }

    g.days.forEach(function (d) {
      var jp = jParts(d.date);
      var weekly = d.date.getDay() === 5;
      var isSel = d.key === state.selectedDay;
      var isToday = d.key === todayKey;
      var adminClosed = !!d.closedByAdmin;
      var full = !weekly && !adminClosed && !ZZ.appointments.hasOpenSlot(d.key, null);

      var cls = 'cal-cell';
      if (adminClosed) cls += ' is-closed';
      if (weekly) cls += ' is-weekly';
      if (full && !isSel) cls += ' is-full';
      if (isToday) cls += ' is-today';
      if (isSel) cls += ' is-selected';

      var dot = adminClosed
        ? '<span class="cal-dot cal-dot--closed" aria-hidden="true"></span>'
        : (full ? '<span class="cal-dot cal-dot--full" aria-hidden="true"></span>' : '');

      var aria = u.esc(u.faDayLabel(d.date) + ' ' + u.toFa(jp.d) + ' ' + g.label) +
        (adminClosed ? ' — تعطیل' : (weekly ? ' — تعطیل هفتگی' : (full ? ' — تکمیل' : '')));

      cells += '<button type="button" class="' + cls + '" data-day="' + d.key + '"' +
        (isSel ? ' aria-current="date"' : '') + ' aria-label="' + aria + '">' +
        '<span class="cal-cell__num">' + u.toFa(jp.d) + '</span>' + dot +
      '</button>';
    });

    var calHead =
      '<div class="cal-head">' +
        '<button type="button" class="icon-btn cal-nav" data-cal="-1" aria-label="ماه قبل"' +
          (gi === 0 ? ' disabled' : '') + '>' + ZZ.icon('chevronRight', null, 18) + '</button>' +
        '<h4 class="cal-title" aria-live="polite">' + u.esc(g.label) + ' ' + u.toFa(g.y) + '</h4>' +
        '<button type="button" class="icon-btn cal-nav" data-cal="1" aria-label="ماه بعد"' +
          (gi >= groups.length - 1 ? ' disabled' : '') + '>' + ZZ.icon('chevronLeft', null, 18) + '</button>' +
      '</div>';

    var cal =
      '<div class="cal-card">' +
        calHead +
        '<div class="cal-grid cal-grid--head" aria-hidden="true">' +
          J_WEEK.map(function (w) { return '<span class="cal-cell cal-cell--week">' + w + '</span>'; }).join('') +
        '</div>' +
        '<div class="cal-grid">' + cells + '</div>' +
        '<div class="cal-legend">' +
          '<span><span class="cal-dot cal-dot--closed"></span>تعطیل</span>' +
          '<span><span class="cal-dot cal-dot--full"></span>ظرفیت تکمیل</span>' +
          '<span><span class="cal-dot cal-dot--today"></span>امروز</span>' +
        '</div>' +
      '</div>';

    /* ---- جزئیات روز انتخاب‌شده ---- */
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
        '<span>این روز را تعطیل کرده‌اید. برای باز کردن دوباره، دکمه‌ی روبه‌رو را بزنید.</span></div>';
    } else {
      var slots = pull('slots:' + sel, function () { return A.daySlots(sel); }, null);

      if (slots === null) {
        slotsHTML = skeletonSlots();
      } else {
        var booked = slots.filter(function (s) { return s.booked; }).length;
        var open = slots.filter(function (s) { return !s.booked && !s.blocked; }).length;

        slotsHTML =
          '<div class="day-meta">' +
            '<span>' + ZZ.icon('calendarDays', null, 15) + u.toFa(booked) + ' نوبت رزروشده</span>' +
            '<span>' + ZZ.icon('clock', null, 15) + u.toFa(open) + ' بازه‌ی آزاد</span>' +
          '</div>' +
          '<div class="admin-slots">' + slots.map(slotHTML).join('') + '</div>' +
          '<p class="admin-hint">' +
            'روی بازه‌ی آزاد بزنید تا دستی «پر» شود؛ بازه‌ی رزروشده هم مستقیم شماره‌ی مراجعه‌کننده را می‌گیرد. ' +
            'برای لغو یک رزرو واقعی از تب «نوبت‌ها» استفاده کنید.' +
          '</p>';
      }
    }

    return '<div class="day-manage">' +
      cal +
      '<div>' +
        '<div class="day-detail__head">' +
          '<h3 class="day-detail__title">' + u.esc(u.faDate(selDate, true)) + '</h3>' +
          (isWeeklyOff ? '' :
            '<button class="btn ' + (isClosed ? 'btn--soft' : 'btn--ghost') + ' btn--sm" data-toggle-day="1">' +
              (isClosed ? ZZ.icon('check', null, 16) + 'باز کردن روز'
                        : ZZ.icon('x', null, 16) + 'تعطیل کردن روز') +
            '</button>') +
        '</div>' +
        slotsHTML +
      '</div>' +
    '</div>';
  }

  /* ---------------- تب مدیریت خدمات ----------------
     دو نما:
       ۱) فهرست خدمت‌ها (کارت‌های ساده + دکمه‌ی «مشاهده‌ی صفحه»)
       ۲) ویرایشگر تمام‌صفحه‌ی یک خدمت — همه‌ی گزینه‌ها همیشه باز،
          فقط اسکرول عمودی، بدون آکاردئون تو‌درتو.
     هدف UX: مدیر موبایلی نباید هیچ‌وقت دنبال گزینه‌ی پنهان‌شده
     بگردد یا افقی اسکرول کند. */

  /** کارت گروه در ویرایشگر — برخلاف قبل، همیشه باز است */
  function svcGroup(icon, title, hint, inner) {
    return '<section class="svc-group">' +
      '<header class="svc-group__head">' +
        '<span class="svc-group__ico">' + ZZ.icon(icon, null, 17) + '</span>' +
        '<div class="svc-group__txt">' +
          '<h3 class="svc-group__title">' + u.esc(title) + '</h3>' +
          (hint ? '<p class="svc-group__hint">' + u.esc(hint) + '</p>' : '') +
        '</div>' +
      '</header>' +
      '<div class="svc-group__body">' + inner + '</div>' +
    '</section>';
  }

  /** کاتالوگ محلی (حالت نمایشی بدون سرور) → قالب ویرایشگر، تا کل
      تجربه‌ی ویرایش بدون PHP هم قابل مشاهده و ارزیابی باشد */
  function localServiceRows() {
    return ZZ.services.getAll().map(function (s) {
      return {
        id: s.id,
        slug: s.slug,
        title: s.title,
        short: s.short || '',
        icon: s.icon,
        ig_link: '',
        is_active: 1,
        price_from: s.priceFrom || 0,
        variants: (s.variants || []).map(function (v) {
          return {
            id: v.id,
            name: v.name,
            note: v.note || '',
            duration_min: v.durationMin,
            price: v.price
          };
        }),
        description: s.description || [],
        includes: s.includes || [],
        aftercare: s.aftercare || [],
        good_for: s.goodFor || [],
        faq: s.faq || []
      };
    });
  }

  /** نمای فهرست — یک کارت در هر خدمت، ضربه = ویرایش */
  function servicesListHTML(list) {
    if (!list.length) {
      return '<div class="empty">' +
               '<div class="empty__icon">' + ZZ.icon('tag', null, 56) + '</div>' +
               '<h3>خدمتی پیدا نشد</h3>' +
               '<p>اتصال به سرور برقرار نیست یا هنوز خدمتی تعریف نشده.</p>' +
             '</div>';
    }

    return '<div class="svc-items">' + list.map(function (s) {
      var prices = s.variants.map(function (v) { return v.price; });
      var minPrice = prices.length ? Math.min.apply(null, prices) : (s.price_from || 0);
      var off = s.is_active === 0;

      return '<article class="svc-item' + (off ? ' is-off' : '') + '">' +
        '<button type="button" class="svc-item__main" data-edit="' + u.esc(s.id) + '">' +
          '<span class="svc-item__icon">' + ZZ.icon(s.icon || 'sparkle', null, 20) + '</span>' +
          '<span class="svc-item__info">' +
            '<span class="svc-item__name">' + u.esc(s.title) + '</span>' +
            '<span class="svc-item__meta">' +
              u.toFa(s.variants.length) + ' گزینه · از ' + u.money(minPrice) + ' ' + CUR +
            '</span>' +
          '</span>' +
          (off ? '<span class="badge badge--muted">غیرفعال</span>' : '') +
          ZZ.icon('chevronLeft', 'svc-item__arrow', 18) +
        '</button>' +
        (s.slug
          ? '<a class="svc-item__view" href="' + B + 'service.html?s=' + u.esc(s.slug) + '" ' +
              'target="_blank" rel="noopener" aria-label="مشاهده‌ی صفحه‌ی ' + u.esc(s.title) + '">' +
              ZZ.icon('eye', null, 16) + '<span>مشاهده‌ی صفحه</span>' +
            '</a>'
          : '') +
      '</article>';
    }).join('') + '</div>' +

    '<div class="note note--info" style="margin-top:var(--sp-4);">' + ZZ.icon('info') +
      '<span>برای ویرایش، روی خدمت بزنید. «مشاهده‌ی صفحه» همان چیزی را نشان می‌دهد که مشتری می‌بیند.' +
      ' تغییر قیمت روی نوبت‌های ثبت‌شده اثر ندارد.</span></div>';
  }

  /** ویرایشگر یک خدمت — همه‌ی گروه‌ها یک‌جا */
  function serviceEditorHTML(s) {
    var canSave = typeof A.updateService === 'function';
    var dirtyCls = state.dirty ? ' is-dirty' : '';
    var saveDisabled = canSave ? '' : ' disabled title="در حالت نمایشی، ذخیره نیاز به سرور دارد"';

    var variantRows = s.variants.map(function (v, i) {
      return '<div class="svc-var" data-vi="' + i + '">' +
        '<div class="svc-var__foot svc-var__foot--top">' +
          '<span class="svc-var__num">' + u.toFa(i + 1) + '</span>' +
          '<span class="svc-var__price" data-price-live="' + i + '">' + u.money(v.price) + ' ' + CUR + '</span>' +
        '</div>' +
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
      '</div>';
    }).join('');

    return '<div class="svc-edit" data-svc="' + u.esc(s.id) + '">' +

      /* ---- نوار چسبان: بازگشت + نام زنده + ذخیره ---- */
      '<div class="svc-edit__bar">' +
        '<button type="button" class="icon-btn" data-back="1" ' +
          'aria-label="بازگشت به فهرست خدمات">' +
          ZZ.icon('chevronRight', null, 18) +
        '</button>' +
        '<div class="svc-edit__crumb">' +
          '<span>ویرایش خدمت</span>' +
          '<strong id="svcEditTitle">' + u.esc(s.title) + '</strong>' +
        '</div>' +
        '<button type="button" class="btn btn--primary btn--sm" data-save="' + u.esc(s.id) + '"' +
          saveDisabled + dirtyCls + '>' +
          'ذخیره<span class="dirty-dot" aria-hidden="true"></span>' +
        '</button>' +
      '</div>' +

      (canSave ? '' :
        '<div class="note note--warn">' + ZZ.icon('info') +
          '<span>حالت نمایشی: همه‌چیز قابل مشاهده است، اما ذخیره‌ی تغییرات به اتصال سرور نیاز دارد.</span>' +
        '</div>') +

      svcGroup('edit', 'اطلاعات پایه‌ی خدمت',
        'عنوان و توضیحی که روی کارت خدمت دیده می‌شود.',
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
        '</label>' +
        '<label class="svc-toggle">' +
          '<input type="checkbox" data-s="active"' + (s.is_active === 0 ? '' : ' checked') + '>' +
          '<span class="svc-toggle__track" aria-hidden="true"><span class="svc-toggle__knob"></span></span>' +
          '<span class="svc-toggle__txt">' +
            '<strong>نمایش در سایت</strong>' +
            '<small>خدمت غیرفعال برای مشتری دیده نمی‌شود؛ نوبت‌های قبلی سر جای خود می‌مانند.</small>' +
          '</span>' +
        '</label>') +

      svcGroup('tag', 'گزینه‌ها و قیمت‌ها',
        'همان گزینه‌هایی که مشتری موقع رزرو می‌بیند؛ قیمت «از …» روی کارت از ارزان‌ترین گزینه حساب می‌شود.',
        '<div class="svc-vars">' + variantRows + '</div>') +

      svcGroup('empty', 'محتوای صفحه‌ی خدمت',
        'این متن‌ها در صفحه‌ی اختصاصی هر خدمت، همان‌طور که اینجا مرتبشان می‌کنید، نمایش داده می‌شوند.',
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
        '</div>') +

      /* ---- ذخیره‌ی پایین: در دسترسِ شست در موبایل ---- */
      '<div class="svc-edit__foot">' +
        '<button type="button" class="btn btn--primary" data-save="' + u.esc(s.id) + '"' +
          saveDisabled + dirtyCls + '>' +
          ZZ.icon('check', null, 16) + 'ذخیره‌ی تغییرات' +
          '<span class="dirty-dot" aria-hidden="true"></span>' +
        '</button>' +
        '<button type="button" class="btn btn--quiet" data-back="1">بازگشت به فهرست</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------------- باشگاه مشتریان ----------------
     فهرست همه‌ی مشتری‌ها با جست‌وجو، و با یک لمس پرونده‌ی کامل:
     مشخصات، آمار سابقه و همه‌ی نوبت‌های او. */

  /** چیپ‌های کوچک آمار روی کارت مشتری */
  function custChips(c) {
    var out = [];
    if (c.doneCount) {
      out.push('<span class="cust-chip">' + u.toFa(c.doneCount) + ' مراجعه</span>');
    }
    var active = (c.upcomingCount || 0) + (c.pendingCount || 0);
    if (active) {
      out.push('<span class="cust-chip cust-chip--wait">' + u.toFa(active) + ' فعال</span>');
    }
    if (c.noShowCount) {
      out.push('<span class="cust-chip cust-chip--bad">' + u.toFa(c.noShowCount) + ' غیبت</span>');
    }
    if (!c.apptCount) {
      out.push('<span class="cust-chip cust-chip--new">مشتری جدید</span>');
    }
    if (c.isBirthdayToday) {
      out.push('<span class="cust-chip cust-chip--bday">' + ZZ.icon('cake', null, 12) + 'تولد امروز</span>');
    }
    if (c.role === 'admin') {
      out.push('<span class="cust-chip cust-chip--admin">مدیر</span>');
    }
    return out.join('');
  }

  function custAvatar(c, lg) {
    var initial = (c.name || '').trim().charAt(0);
    return '<span class="cust-avatar' + (lg ? ' cust-avatar--lg' : '') + '" aria-hidden="true">' +
      (initial ? u.esc(initial) : ZZ.icon('user', null, lg ? 26 : 18)) +
    '</span>';
  }

  function customerCard(c) {
    var name = c.name || 'بدون نام';
    var last = c.lastVisit
      ? 'آخرین مراجعه: ' + u.esc(u.faDate(u.fromKey(String(c.lastVisit).slice(0, 10))))
      : 'هنوز مراجعه‌ای نداشته';

    return '' +
      '<button type="button" class="cust-card" data-cust="' + u.esc(c.id) + '">' +
        custAvatar(c) +
        '<span class="cust-card__main">' +
          '<strong class="cust-card__name">' + u.esc(name) + '</strong>' +
          '<span class="cust-card__phone ltr phone-num">' + u.prettyPhoneHTML(c.phone || '') + '</span>' +
          '<span class="cust-card__last">' + last + '</span>' +
        '</span>' +
        '<span class="cust-card__chips">' + custChips(c) + '</span>' +
        ZZ.icon('chevronLeft', 'cust-card__go', 16) +
      '</button>';
  }

  function skeletonCustomers() {
    return skeletonAppts();
  }

  /** یک ردیف از سابقه‌ی نوبت‌های مشتری */
  function custHistRow(r) {
    var a = r.appt;
    var st = a.statusLabel
      ? { text: a.statusLabel, cls: a.statusClass || 'badge--ok' }
      : ZZ.appointments.statusLabel(a);
    var d = u.fromKey(a.date);
    var svc = r.service && r.service.title ? r.service.title : '—';
    var variant = r.variant && r.variant.name ? r.variant.name : '';
    var dep = a.deposit || null;

    return '' +
      '<article class="cust-hist admin-appt--' + a.status + (a.status === 'cancelled' ? ' is-cancelled' : '') + '">' +
        '<div class="cust-hist__when">' +
          '<span class="cust-hist__date">' + u.esc(u.faDate(d)) + '</span>' +
          '<span class="cust-hist__time">' + ZZ.icon('clock', null, 13) + 'ساعت ' + u.toFa(a.time) + '</span>' +
        '</div>' +
        '<div class="cust-hist__body">' +
          '<div class="cust-hist__svc">' + u.esc(svc) +
            (variant ? ' <small>' + u.esc(variant) + '</small>' : '') +
          '</div>' +
          '<div class="cust-hist__meta">' +
            '<span>' + u.money(a.price || 0) + ' ' + CUR + '</span>' +
            (dep ? '<span class="cust-hist__dep">' + ZZ.icon('wallet', null, 13) +
              'بیعانه ' + u.money(dep.amount) + '</span>' : '') +
            (a.note ? '<span class="cust-hist__note">' + ZZ.icon('edit', null, 13) + u.esc(a.note) + '</span>' : '') +
            (a.status === 'rejected' && a.rejectReason
              ? '<span class="cust-hist__note">' + ZZ.icon('info', null, 13) + u.esc(a.rejectReason) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<span class="badge ' + st.cls + '">' + st.text + '</span>' +
      '</article>';
  }

  /** پرونده‌ی کامل مشتری — نمای تک‌صفحه مثل ویرایشگر خدمت */
  function renderCustomerDetail() {
    var key = 'cust:' + state.custId;
    var data = pull(key, function () { return A.userDetail(state.custId); }, null);

    if (data === null) {
      return '<div class="svc-edit">' +
        '<div class="svc-edit__head">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-back-cust>' +
            ZZ.icon('arrowRight', null, 16) + 'بازگشت</button>' +
          '<h2>پرونده‌ی مشتری</h2>' +
        '</div>' + skeletonCustomers() + '</div>';
    }
    if (!data) {
      return '<div class="svc-edit">' +
        '<div class="svc-edit__head">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-back-cust>' +
            ZZ.icon('arrowRight', null, 16) + 'بازگشت</button>' +
          '<h2>پرونده‌ی مشتری</h2>' +
        '</div>' +
        '<div class="empty"><div class="empty__icon">' + ZZ.icon('user', null, 56) + '</div>' +
          '<h3>پیدا نشد</h3><p>این مشتری حذف شده است.</p></div></div>';
    }

    var c = data.user;
    var h = data.history || {};
    var rows = data.appointments || [];
    var waPhone = '98' + String(c.phone || '').replace(/^0+/, '');

    var stats = [
      { num: u.toFa(c.doneCount || 0), label: 'مراجعه' },
      { num: u.toFa((c.upcomingCount || 0) + (c.pendingCount || 0)), label: 'فعال' },
      { num: u.toFa(c.noShowCount || 0), label: 'غیبت', bad: c.noShowCount > 0 },
      { num: u.toFa(c.cancelledCount || 0), label: 'لغو' },
      { num: u.money(c.totalSpent || 0), label: 'مجموع خرید ' + CUR, wide: true }
    ];
    if (c.totalDeposit) {
      stats.push({ num: u.money(c.totalDeposit), label: 'بیعانه ' + CUR, wide: true });
    }

    var meta = [];
    if (c.birthLabel || (c.birth && u.formatBirth)) {
      meta.push({ ico: 'cake', label: 'تاریخ تولد',
        val: c.birthLabel || u.formatBirth(c.birth) + (c.isBirthdayToday ? ' — امروز تولدش است!' : '') });
    }
    if (c.createdAt) {
      meta.push({ ico: 'calendar', label: 'عضو از', val: u.faDate(new Date(c.createdAt)) });
    }
    if (c.lastLoginAt) {
      meta.push({ ico: 'clock', label: 'آخرین ورود', val: u.faDate(new Date(c.lastLoginAt)) });
    }

    return '' +
      '<div class="svc-edit" data-cust-open="1">' +
        '<div class="svc-edit__head">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-back-cust>' +
            ZZ.icon('arrowRight', null, 16) + 'بازگشت به فهرست</button>' +
          '<h2>پرونده‌ی مشتری</h2>' +
        '</div>' +

        /* مشخصات */
        '<div class="cust-profile">' +
          '<div class="cust-profile__top">' +
            custAvatar(c, true) +
            '<div class="cust-profile__id">' +
              '<h3>' + u.esc(c.name || 'بدون نام') + '</h3>' +
              '<a class="cust-profile__phone ltr phone-num" href="tel:+' + waPhone + '">' +
                u.prettyPhoneHTML(c.phone || '') + '</a>' +
              '<div class="cust-profile__chips">' + custChips(c) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="cust-profile__actions">' +
            '<a class="btn btn--primary btn--sm" href="tel:+' + waPhone + '">' +
              ZZ.icon('phoneCall', null, 16) + 'تماس</a>' +
            '<a class="btn btn--soft btn--sm" href="https://wa.me/' + waPhone +
              '" target="_blank" rel="noopener">' + ZZ.icon('whatsapp', null, 16) + 'واتساپ</a>' +
            (h.suggestDeposit
              ? '<span class="badge badge--danger">' + ZZ.icon('alert', null, 13) +
                'سابقه‌ی غیبت — بیعانه بگیرید</span>'
              : '') +
          '</div>' +
          (meta.length
            ? '<dl class="cust-profile__meta">' + meta.map(function (m) {
                return '<div><dt>' + ZZ.icon(m.ico, null, 14) + m.label + '</dt><dd>' + u.esc(m.val) + '</dd></div>';
              }).join('') + '</dl>'
            : '') +
        '</div>' +

        /* آمار */
        '<div class="cust-stats">' +
          stats.map(function (s) {
            return '<div class="cust-stat' + (s.wide ? ' cust-stat--wide' : '') +
              (s.bad ? ' cust-stat--bad' : '') + '">' +
              '<strong>' + s.num + '</strong><span>' + u.esc(s.label) + '</span></div>';
          }).join('') +
        '</div>' +

        /* سابقه */
        '<h3 class="cust-hist__title">' + ZZ.icon('calendarDays', null, 16) +
          'سابقه‌ی نوبت‌ها' + (rows.length ? ' (' + u.toFa(rows.length) + ')' : '') + '</h3>' +
        (rows.length
          ? '<div class="cust-hist__list">' + rows.map(custHistRow).join('') + '</div>'
          : '<div class="empty"><div class="empty__icon">' + ZZ.icon('calendar', null, 48) + '</div>' +
              '<h3>هنوز نوبتی ثبت نشده</h3>' +
              '<p>این مشتری تا الان رزرويی نداشته است.</p></div>') +
      '</div>';
  }

  function renderCustomers() {
    if (state.custId != null) return renderCustomerDetail();

    var key = 'customers:' + state.custQ;
    var rows = pull(key, function () { return A.users({ q: state.custQ }); }, null);

    var search = '' +
      '<div class="admin-search">' +
        ZZ.icon('search', 'admin-search__ico', 17) +
        '<input class="input" id="custSearch" type="search" ' +
          'placeholder="جست‌وجوی نام یا شماره…‌" value="' + u.esc(state.custQ) + '" ' +
          'aria-label="جست‌وجو در باشگاه مشتریان">' +
      '</div>';

    if (rows === null) return search + skeletonCustomers();

    if (!rows.length) {
      return search +
        '<div class="empty">' +
          '<div class="empty__icon">' + ZZ.icon('users', null, 56) + '</div>' +
          '<h3>مشتری پیدا نشد</h3>' +
          '<p>' + (state.custQ ? 'با این جست‌وجو نتیجه‌ای نبود.' :
            'هر کسی که وارد حساب شود یا نوبت بگیرد، این‌جا دیده می‌شود.') + '</p>' +
        '</div>';
    }

    return search + '<div class="cust-list">' + rows.map(customerCard).join('') + '</div>';
  }

  function renderServices() {
    if (!state.services) {
      /* هنوز نیامده — در پس‌زمینه بگیر */
      if (A.services) {
        A.services().then(function (rows) {
          state.services = rows;
          safeRender();
        }).catch(function (err) {
          state.services = [];
          ZZ.toast.error(err.message || 'خدمات بارگذاری نشد.');
          safeRender();
        });

        return '<div class="svc-editor" aria-busy="true">' +
          '<div class="skel-card"><span class="skel skel--line"></span><span class="skel skel--line skel--sm"></span></div>' +
          '<div class="skel-card"><span class="skel skel--line"></span><span class="skel skel--line skel--sm"></span></div>' +
        '</div>';
      }

      /* حالت نمایشی (بدون سرور): همان کاتالوگ سایت — تا ویرایشگر
         بدون PHP هم دیده و ارزیابی شود */
      state.services = localServiceRows();
    }

    /* ویرایشگر یک خدمت باز است؟ */
    if (state.editingId != null) {
      var editing = state.services.filter(function (s) {
        return String(s.id) === String(state.editingId);
      })[0];
      if (editing) return serviceEditorHTML(editing);
      state.editingId = null;   /* دیگر وجود ندارد؛ برگرد به فهرست */
    }

    return servicesListHTML(state.services);
  }

  /* ---------------- ویرایشگر فهرست‌ها ----------------
     یک فهرست ساده از سطرهای متنی: هر سطر یک ورودی با دکمه‌های
     جابه‌جایی و حذف، به‌علاوه‌ی یک دکمه برای افزودن سطر تازه.
     ترتیب سطرها همان ترتیب نمایش در صفحه‌ی خدمت است. */

  /** خوشه‌ی دکمه‌های هر سطر: بالا / پایین / حذف */
  function rowBtns(delTitle) {
    return '<span class="svc-row__btns">' +
      '<button type="button" class="row-btn" data-row-up="1" ' +
        'title="انتقال به بالا" aria-label="انتقال به بالا">' + ZZ.icon('chevronUp', null, 14) + '</button>' +
      '<button type="button" class="row-btn" data-row-down="1" ' +
        'title="انتقال به پایین" aria-label="انتقال به پایین">' + ZZ.icon('chevronDown', null, 14) + '</button>' +
      '<button type="button" class="row-btn row-btn--del" data-del-row="1" ' +
        'title="' + delTitle + '" aria-label="' + delTitle + '">' + ZZ.icon('x', null, 14) + '</button>' +
    '</span>';
  }

  function listRow(field, value, placeholder, chip) {
    return '<div class="svc-row' + (chip ? ' svc-row--chip' : '') + '">' +
             (chip
               ? '<input class="input" type="text" data-list="' + field + '" ' +
                   'placeholder="' + placeholder + '" value="' + u.esc(value) + '">'
               : '<textarea class="input" rows="2" data-list="' + field + '" ' +
                   'placeholder="' + placeholder + '">' + u.esc(value) + '</textarea>') +
             rowBtns('حذف این سطر') +
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
               rowBtns('حذف این پرسش') +
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
    var svc = state.services.filter(function (x) {
      return String(x.id) === String(card.dataset.svc);
    })[0];

    var payload = {};
    u.$$('[data-s]', card).forEach(function (el) {
      if (el.dataset.s === 'active') {
        payload.active = !!el.checked;   // کلید نمایش/عدم نمایش خدمت
      } else {
        payload[el.dataset.s] = el.value.trim();
      }
    });

    payload.variants = u.$$('.svc-var', card).map(function (row) {
      var orig = svc.variants[parseInt(row.dataset.vi, 10)] || {};
      var get = function (f) { return u.$('[data-f="' + f + '"]', row); };
      return {
        id: orig.id,
        name: get('name').value.trim(),
        note: get('note').value.trim(),
        price: parseInt(get('price').value, 10) || 0,
        duration_min: parseInt(get('duration_min').value, 10) || 60
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

  /** جابه‌جایی سطر فهرست (بالا/پایین) — مستقیم روی DOM، بدون رندر */
  function moveRow(btn, dir) {
    var row = btn.closest('.svc-faq') || btn.closest('.svc-row');
    if (!row) return;
    var sib = dir === -1 ? row.previousElementSibling : row.nextElementSibling;
    if (!sib || (!sib.classList.contains('svc-row') && !sib.classList.contains('svc-faq'))) return;
    if (dir === -1) row.parentNode.insertBefore(row, sib);
    else row.parentNode.insertBefore(sib, row);
    markDirty();
  }

  /** علامت‌گذاری «تغییر ذخیره‌نشده» روی دکمه‌های ذخیره‌ی ویرایشگر */
  function markDirty() {
    if (state.dirty) return;
    state.dirty = true;
    u.$$('.svc-edit [data-save]').forEach(function (b) {
      b.classList.add('is-dirty');
    });
  }

  /** پیاده‌کردن نتیجه‌ی ذخیره روی کش محلی — به‌جای گرفتن دوباره‌ی
      کل فهرست از سرور که جای فرم و اسکرول کاربر را عوض می‌کند */
  function applyServicePayload(sid, payload) {
    var svc = (state.services || []).filter(function (x) {
      return String(x.id) === String(sid);
    })[0];
    if (!svc) return;

    svc.title = payload.title;
    svc.short = payload.short || '';
    svc.ig_link = payload.ig_link || '';
    if (typeof payload.active === 'boolean') svc.is_active = payload.active ? 1 : 0;

    (payload.variants || []).forEach(function (v, i) {
      var orig = svc.variants[i];
      if (!orig) return;
      orig.name = v.name;
      orig.note = v.note;
      orig.price = v.price;
      orig.duration_min = v.duration_min;
    });

    ['description', 'includes', 'aftercare', 'good_for', 'faq'].forEach(function (f) {
      if (payload[f]) svc[f] = payload[f];
    });

    var prices = svc.variants.map(function (v) { return v.price; });
    if (prices.length) svc.price_from = Math.min.apply(null, prices);
  }

  /** رندر امن — وقتی ویرایشگر خدمتی با تغییرات ذخیره‌نشده باز است،
      هیچ رندر مجددی نباید اتفاق بیفتد وگرنه فرم کاربر با داده‌ی کش
      بازنویسی و متن تایپ‌شده‌ی او از بین می‌رود. */
  function safeRender() {
    if (state.editingId != null && state.dirty) return;
    render();
  }

  /* ---------------- رندر کل صفحه ---------------- */

  /** کارت‌های آمار — کلیک‌پذیر تا مدیر با یک لمس به همان فهرست برسد */
  function dashHTML(st) {
    var pendingNum = (typeof st.pending === 'number') ? st.pending : null;

    function card(c) {
      var inner =
        '<span class="dash-card__ico">' + ZZ.icon(c.icon, null, 19) + '</span>' +
        '<strong class="dash-card__num">' + (c.num === undefined || c.num === null ? '—' : c.num) + '</strong>' +
        '<span class="dash-card__lbl">' + c.label + '</span>';

      var cls = 'dash-card' + (c.cls ? ' ' + c.cls : '') + (c.wide ? ' dash-card--wide' : '');
      if (!c.goto) {
        return '<div class="' + cls + '">' + inner + '</div>';
      }
      return '<button type="button" class="' + cls +
        '" data-goto="' + c.goto + '" title="' + u.esc(c.title || c.label) + '">' + inner + '</button>';
    }

    var cards = [
      { num: pendingNum === null ? '—' : u.toFa(pendingNum), label: 'در انتظار تأیید',
        icon: 'clock', goto: 'appointments:pending', title: 'دیدن درخواست‌های در انتظار',
        cls: pendingNum ? 'is-wait' : '' },
      { num: st.today === undefined ? '—' : u.toFa(st.today), label: 'نوبت امروز',
        icon: 'calendarDays', goto: 'days:today', title: 'برنامه و ساعت‌های امروز' },
      { num: st.upcoming === undefined ? '—' : u.toFa(st.upcoming), label: 'نوبت پیش رو',
        icon: 'calendar', goto: 'appointments:upcoming', title: 'دیدن نوبت‌های تأییدشده' },
      { num: st.users === undefined ? '—' : u.toFa(st.users), label: 'مشتری',
        icon: 'users', goto: 'customers', title: 'باشگاه مشتریان — سابقه و مشخصات' },
      { num: (typeof st.deposits === 'number') ? u.money(st.deposits) : '—',
        label: 'بیعانه‌ی دریافتی', icon: 'wallet', wide: true }
    ];

    return '<div class="admin-dash">' + cards.map(card).join('') + '</div>';
  }

  function render() {
    var root = u.$('#adminRoot');
    var st = pull('stats', function () { return A.stats(); },
                  { today: '—', upcoming: '—', users: '—', pending: 0 });
    var user = ZZ.auth.currentUser() || {};

    var pendingCount = (typeof st.pending === 'number') ? st.pending : 0;

    var filters = [
      { id: 'pending',   label: 'در انتظار تأیید', count: pendingCount },
      { id: 'upcoming',  label: 'تأییدشده' },
      { id: 'past',      label: 'انجام شده' },
      { id: 'cancelled', label: 'لغو / رد' },
      { id: 'all',       label: 'همه' }
    ];

    /* ---- دکمه‌ی تب — یک‌بار برای سایدبار، یک‌بار برای dock ---- */
    function tabBtn(t, kind) {
      var active = state.tab === t.id;
      var badge = (t.id === 'appointments' && pendingCount)
        ? '<span class="count-badge">' + u.toFa(pendingCount) + '</span>' : '';
      if (kind === 'dock') {
        return '<button type="button" class="admin-dock__btn' + (active ? ' is-active' : '') +
          '" data-tab="' + t.id + '" role="tab" aria-selected="' + (active ? 'true' : 'false') +
          '" aria-controls="panel-' + t.id + '" tabindex="' + (active ? '0' : '-1') + '">' +
          '<span class="admin-dock__ico">' + ZZ.icon(t.icon, null, 22) + '</span>' +
          '<span class="admin-dock__lbl">' + u.esc(t.short) + '</span>' + badge +
        '</button>';
      }
      return '<button type="button" class="admin-side__link' + (active ? ' is-active' : '') +
        '" id="tab-' + t.id + '" data-tab="' + t.id + '" role="tab"' +
        ' aria-selected="' + (active ? 'true' : 'false') + '" aria-controls="panel-' + t.id +
        '" tabindex="' + (active ? '0' : '-1') + '">' +
        ZZ.icon(t.icon, null, 19) + '<span>' + u.esc(t.label) + '</span>' +
        (t.id === 'appointments' && pendingCount
          ? '<span class="count-badge">' + u.toFa(pendingCount) + '</span>' : '') +
      '</button>';
    }

    root.innerHTML = '' +
      /* ---- سایدبار دسکتاپ ---- */
      '<aside class="admin-side">' +
        '<a class="admin-side__brand" href="' + B + 'index.html" aria-label="بازگشت به سایت">' +
          '<img src="' + B + 'assets/img/brand/logo.png" alt="' + u.esc(ZZ.config.brand.name) +
            '" width="900" height="241" loading="lazy">' +
          '<span class="admin-side__tag">پنل مدیریت</span>' +
        '</a>' +
        '<nav class="admin-side__nav" role="tablist" aria-label="بخش‌های پنل مدیریت">' +
          TABS.map(function (t) { return tabBtn(t, 'side'); }).join('') +
        '</nav>' +
        '<div class="admin-side__foot">' +
          '<span class="admin-side__user">' +
            '<strong>' + u.esc(user.name || 'مدیر') + '</strong>' +
            '<span class="ltr">' + u.prettyPhoneHTML(user.phone || '') + '</span>' +
          '</span>' +
          '<a class="admin-side__link" href="' + B + 'panel/index.html">' +
            ZZ.icon('user', null, 19) + '<span>پنل کاربری</span>' +
          '</a>' +
          '<button type="button" class="admin-side__link admin-side__link--out" data-logout="1">' +
            ZZ.icon('logout', null, 19) + '<span>خروج از حساب</span>' +
          '</button>' +
        '</div>' +
      '</aside>' +

      '<div class="admin-body">' +
        /* ---- سربرگ فشرده ---- */
        '<header class="admin-head">' +
          '<div class="admin-head__in">' +
            '<div>' +
              '<h1>پنل مدیریت</h1>' +
              '<p>' +
                (pendingCount
                  ? 'سلام ' + u.esc(user.name || 'مدیر') + '؛ ' + u.toFa(pendingCount) +
                    ' درخواست در انتظار تماس و تأیید شماست.'
                  : 'سلام ' + u.esc(user.name || 'مدیر') + '؛ در انتظار جدیدی نیست. همه‌چیز مرتب است.') +
              '</p>' +
            '</div>' +
            '<div class="admin-head__actions">' +
              '<span class="badge badge--gold">' + ZZ.icon('shield', null, 14) + 'دسترسی مدیر</span>' +
              '<a class="icon-btn" href="' + B + 'panel/index.html" aria-label="پنل کاربری" ' +
                'title="پنل کاربری">' + ZZ.icon('user', null, 18) + '</a>' +
              '<button type="button" class="icon-btn" data-logout="1" aria-label="خروج از حساب" ' +
                'title="خروج از حساب">' + ZZ.icon('logout', null, 18) + '</button>' +
            '</div>' +
          '</div>' +
        '</header>' +

        '<div class="admin-content">' +
          /* ---- آمار کلیک‌پذیر ---- */
          dashHTML(st) +

          /* ---- گام‌ها (پنل‌ها) ---- */
          '<section class="admin-panel" id="panel-appointments" role="tabpanel" ' +
            'aria-labelledby="tab-appointments"' + (state.tab === 'appointments' ? '' : ' hidden') + '>' +
            '<div class="admin-filters" role="group" aria-label="فیلتر وضعیت نوبت‌ها">' +
              filters.map(function (f) {
                var on = state.filter === f.id;
                return '<button type="button" class="fchip' + (on ? ' is-active' : '') +
                  '" data-filter="' + f.id + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
                  f.label +
                  (f.count ? '<span class="count-dot">' + u.toFa(f.count) + '</span>' : '') +
                '</button>';
              }).join('') +
            '</div>' +
            '<div class="admin-search">' +
              ZZ.icon('search', 'admin-search__ico', 17) +
              '<input class="input" id="searchInput" type="search" ' +
                'placeholder="جست‌وجوی نام، شماره یا خدمت…" value="' + u.esc(state.q) + '"' +
                ' aria-label="جست‌وجو در نوبت‌ها">' +
            '</div>' +
            renderAppointments() +
          '</section>' +

          '<section class="admin-panel" id="panel-days" role="tabpanel" ' +
            'aria-labelledby="tab-days"' + (state.tab === 'days' ? '' : ' hidden') + '>' +
            renderDays() +
          '</section>' +

          '<section class="admin-panel" id="panel-customers" role="tabpanel" ' +
            'aria-labelledby="tab-customers"' + (state.tab === 'customers' ? '' : ' hidden') + '>' +
            renderCustomers() +
          '</section>' +

          '<section class="admin-panel" id="panel-services" role="tabpanel" ' +
            'aria-labelledby="tab-services"' + (state.tab === 'services' ? '' : ' hidden') + '>' +
            renderServices() +
          '</section>' +
        '</div>' +
      '</div>' +

      /* ---- ناوبری پایین (موبایل) ---- */
      '<nav class="admin-dock" role="tablist" aria-label="بخش‌های پنل مدیریت">' +
        TABS.map(function (t) { return tabBtn(t, 'dock'); }).join('') +
      '</nav>';
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

  /* جست‌وجوی باشگاه مشتریان — debounce جدا تا با نوبت‌ها قاطی نشود */
  var runCustSearch = u.debounce(function () {
    render();
    var s2 = u.$('#custSearch');
    if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }
  }, 300);

  /** تعویض تب + اسکرول به بالای محتوا
      اگر ویرایشگر خدمت با تغییرات ذخیره‌نشده باز باشد، اول تأیید بگیر. */
  function setTab(tab, opts) {
    if (state.tab === 'services' && tab !== 'services' && state.editingId != null && state.dirty) {
      confirmDanger({
        title: 'تغییرات ذخیره نشده',
        message: 'در ویرایشگر خدمت تغییرات ذخیره‌نشده دارید. بدون ذخیره خارج می‌شوید؟',
        confirmLabel: 'خروج بدون ذخیره'
      }).then(function (ok) {
        if (!ok) return;
        state.dirty = false;
        doSetTab(tab, opts);
      });
      return;
    }
    doSetTab(tab, opts);
  }

  function doSetTab(tab, opts) {
    state.tab = tab;
    if (opts && opts.apply) opts.apply();
    try {
      history.replaceState(null, '', '#' + tab);
    } catch (e) { /* noop */ }
    render();
    if (!opts || !opts.keepScroll) {
      global.scrollTo({
        top: 0,
        behavior: u.reducedMotion() ? 'auto' : 'smooth'
      });
    }
  }

  function bind() {
    if (bound) return;
    bound = true;

    var root = u.$('#adminRoot');

    root.addEventListener('click', function (e) {
      /* ---- تب‌ها (dock و سایدبار) ---- */
      var tab = e.target.closest('[data-tab]');
      if (tab) { setTab(tab.dataset.tab); return; }

      /* ---- پرش از کارت‌های آمار ---- */
      var gotoEl = e.target.closest('[data-goto]');
      if (gotoEl) {
        var g = gotoEl.dataset.goto.split(':');
        /* تغییرات وابسته (فیلتر/روز انتخابی) بعد از گاردِ تغییرات
           ذخیره‌نشده اعمال می‌شوند، نه قبل از آن */
        setTab(g[0], {
          apply: function () {
            if (g[0] === 'appointments' && g[1]) state.filter = g[1];
            if (g[0] === 'days' && g[1] === 'today') {
              state.selectedDay = u.dateKey(new Date());
              state.calIndex = 0;
            }
          }
        });
        return;
      }

      /* ---- ماه قبل/بعد در تقویم ---- */
      var calNav = e.target.closest('[data-cal]');
      if (calNav && !calNav.disabled) {
        state.calIndex = Math.max(0, (state.calIndex || 0) + parseInt(calNav.dataset.cal, 10));
        render();
        return;
      }

      /* ---- فیلتر ---- */
      var f = e.target.closest('[data-filter]');
      if (f) { state.filter = f.dataset.filter; render(); return; }

      /* ---- انتخاب روز ---- */
      var day = e.target.closest('[data-day]');
      if (day && !day.disabled) {
        state.selectedDay = day.dataset.day;
        render();
        return;
      }

      /* ---- تعطیل/باز کردن روز ---- */
      var dayBtn = e.target.closest('[data-toggle-day]');
      if (dayBtn) {
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

      /* ---- پر/آزاد کردن بازه ---- */
      var slot = e.target.closest('[data-slot]');
      if (slot && !slot.disabled) {
        /* جلوگیری از کلیک دوباره تا وقتی پاسخ سرور برسد */
        slot.disabled = true;
        run(A.toggleSlot(state.selectedDay, slot.dataset.slot), function (blocked) {
          ZZ.toast.ok(blocked ? 'این بازه پر شد' : 'این بازه آزاد شد');
          invalidate('slots:' + state.selectedDay);
          invalidate('days');
          invalidate('stats');
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

      /* ---- رد درخواست (پنجره با دلایل آماده) ---- */
      var rej = e.target.closest('[data-reject]');
      if (rej) {
        openRejectDialog(rej.dataset.reject);
        return;
      }

      /* ---- ثبت بیعانه ---- */
      var depBtn = e.target.closest('[data-deposit]');
      if (depBtn) {
        openDepositDialog(depBtn.dataset.deposit);
        return;
      }

      /* ---- انجام شد ---- */
      var doneBtn = e.target.closest('[data-done]');
      if (doneBtn) {
        run(A.markDone(doneBtn.dataset.done), function () {
          ZZ.toast.ok('نوبت انجام‌شده ثبت شد');
          afterChange();
        });
        return;
      }

      /* ---- غیبت ---- */
      var nsBtn = e.target.closest('[data-noshow]');
      if (nsBtn) {
        confirmDanger({
          title: 'ثبت غیبت',
          message: 'غیبت این مراجعه‌کننده ثبت شود؟ دفعه‌ی بعد به شما یادآوری می‌شود که بیعانه بگیرید.',
          confirmLabel: 'ثبت غیبت'
        }).then(function (ok) {
          if (!ok) return;
          run(A.markNoShow(nsBtn.dataset.noshow), function () {
            ZZ.toast.ok('غیبت ثبت شد');
            afterChange();
          });
        });
        return;
      }

      /* ---- لغو نوبت ---- */
      var cancel = e.target.closest('[data-cancel]');
      if (cancel) {
        confirmDanger({
          title: 'لغو این نوبت',
          message: 'این نوبت لغو شود؟ ساعت فوراً آزاد می‌شود؛ به مراجعه‌کننده هم اطلاع بدهید.',
          confirmLabel: 'بله، لغو کن'
        }).then(function (ok) {
          if (!ok) return;
          cancel.disabled = true;
          run(A.cancelAppointment(cancel.dataset.cancel), function () {
            ZZ.toast.ok('نوبت لغو شد');
            invalidate('appts:');
            invalidate('slots:');
            invalidate('days');
            invalidate('stats');
            invalidate('customers');
            invalidate('cust:');
            render();
          });
        });
        return;
      }

      /* ---- باشگاه مشتریان: باز کردن پرونده ---- */
      var cust = e.target.closest('[data-cust]');
      if (cust) {
        state.custId = cust.dataset.cust;
        render();
        global.scrollTo({
          top: 0,
          behavior: u.reducedMotion() ? 'auto' : 'smooth'
        });
        return;
      }

      /* ---- باشگاه مشتریان: بازگشت به فهرست ---- */
      if (e.target.closest('[data-back-cust]')) {
        state.custId = null;
        render();
        return;
      }

      /* ---- خدمات: باز کردن ویرایشگر از فهرست ---- */
      var edit = e.target.closest('[data-edit]');
      if (edit) {
        state.editingId = edit.dataset.edit;
        state.dirty = false;
        render();
        global.scrollTo({
          top: 0,
          behavior: u.reducedMotion() ? 'auto' : 'smooth'
        });
        return;
      }

      /* ---- خدمات: بازگشت از ویرایشگر به فهرست ---- */
      var back = e.target.closest('[data-back]');
      if (back) {
        if (state.dirty) {
          confirmDanger({
            title: 'تغییرات ذخیره نشده',
            message: 'از ویرایش این خدمت خارج می‌شوید؟ تغییرات ذخیره‌نشده از بین می‌رود.',
            confirmLabel: 'خروج بدون ذخیره'
          }).then(function (ok) {
            if (!ok) return;
            state.dirty = false;
            state.editingId = null;
            render();
          });
          return;
        }
        state.editingId = null;
        render();
        return;
      }

      /* ---- افزودن/حذف/جابه‌جایی سطر در ویرایشگر خدمات ----
         این‌ها مستقیم روی DOM کار می‌کنند و render() صدا نمی‌زنند،
         وگرنه بقیه‌ی تغییرات ذخیره‌نشده‌ی کاربر پاک می‌شد. */

      var up = e.target.closest('[data-row-up]');
      if (up) { moveRow(up, -1); return; }

      var down = e.target.closest('[data-row-down]');
      if (down) { moveRow(down, 1); return; }

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
        markDirty();
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

      /* ---- ذخیره‌ی خدمت ---- */
      var save = e.target.closest('[data-save]');
      if (save) {
        var sid = save.dataset.save;
        var editor = save.closest('.svc-edit');

        if (typeof A.updateService !== 'function') {
          ZZ.toast.info('در حالت نمایشی ذخیره‌ی محتوا ممکن نیست؛ پنل باید به سرور وصل باشد.');
          return;
        }
        if (!editor) return;

        var payload = collectService(editor);

        if (!payload.title) {
          ZZ.toast.error('نام خدمت نمی‌تواند خالی باشد.');
          var titleInput = u.$('[data-s="title"]', editor);
          if (titleInput) titleInput.focus();
          return;
        }

        u.$$('[data-save]', editor).forEach(function (b) {
          b.classList.add('is-loading');
        });
        A.updateService(sid, payload)
          .then(function () {
            ZZ.toast.ok('تغییرات ذخیره شد.');
            state.dirty = false;
            /* کش محلی را همان لحظه به‌روز کن ولی دوباره رندر نکن:
               فرم همان‌جا می‌ماند و جای اسکرول کاربر عوض نمی‌شود. */
            applyServicePayload(sid, payload);
            u.$$('.svc-edit [data-save]').forEach(function (b) {
              b.classList.remove('is-loading');
              b.classList.remove('is-dirty');
            });
          })
          .catch(function (err) {
            u.$$('[data-save]', editor).forEach(function (b) {
              b.classList.remove('is-loading');
            });
            ZZ.toast.error(err.message || 'ذخیره نشد.');
          });
        return;
      }

      /* ---- خروج ---- */
      if (e.target.closest('[data-logout]')) {
        confirmDanger({
          title: 'خروج از حساب',
          message: 'از حساب مدیریت خارج می‌شوید؟',
          confirmLabel: 'خروج'
        }).then(function (ok) {
          if (!ok) return;
          ZZ.auth.logout();
          global.location.href = B + 'index.html';
        });
      }
    });

    /* ---- کیبورد تب‌ها (WAI-ARIA tablist) ----
       در RTL فلش چپ یعنی تبِ بعدی (چیدمان از راست به چپ). */
    root.addEventListener('keydown', function (e) {
      var tab = e.target.closest && e.target.closest('[role="tab"]');
      if (tab) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
          var list = tab.closest('[role="tablist"]') || tab.closest('.admin-dock');
          if (!list) return;
          var tabs = u.$$('[role="tab"]', list);
          var i = tabs.indexOf(tab);
          if (i < 0) return;
          var ni = i;
          if (e.key === 'ArrowLeft') ni = (i + 1) % tabs.length;
          else if (e.key === 'ArrowRight') ni = (i - 1 + tabs.length) % tabs.length;
          else if (e.key === 'Home') ni = 0;
          else ni = tabs.length - 1;
          e.preventDefault();
          tabs[ni].focus();
          tabs[ni].click();
          return;
        }
      }

      /* صفحه‌کلید: Enter/Space روی سربرگ‌ها هم کلیک را شبیه‌سازی کند
         (سربرگ‌ها button هستند؛ این پشتیبانِ نسخه‌های قدیمی مرورگر است) */
    });

    /* ورودی‌ها — واگذارشده (delegated)، چون خودِ فیلدها با هر render
       دوباره ساخته می‌شوند و شنونده‌ی مستقیم روی آن‌ها از بین می‌رود. */
    root.addEventListener('input', function (e) {
      var el = e.target;
      if (!el || !el.dataset) return;

      /* ویرایشگر خدمت: هر تایپ یعنی تغییر ذخیره‌نشده؛ نام خدمت
         هم‌زمان در نوار بالای ویرایشگر زنده به‌روز می‌شود. */
      if (el.closest('.svc-edit') &&
          (el.dataset.s || el.dataset.f || el.dataset.list || el.dataset.faq)) {
        markDirty();
        if (el.dataset.s === 'title') {
          var crumb = u.$('#svcEditTitle');
          if (crumb) crumb.textContent = el.value.trim() || 'خدمت بی‌نام';
        }
      }

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
      if (el.id === 'custSearch') {
        state.custQ = el.value;
        runCustSearch();
      }
    });
  }

  /* ---------------- شروع ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    ZZ.shell({ active: 'account', base: B });

    /* علامت‌گذاری صفحه — CSS با آن هدر سایت را در دسکتاپ مخفی
       می‌کند و سایدبار را نشان می‌دهد. */
    document.body.classList.add('on-admin');

    /* اگر بک‌اند فعال است، نشست به‌صورت ناهمگام از سرور می‌آید.
       گارد نقش باید صبر کند وگرنه قبل از رسیدن پاسخ، کاربر را
       بیرون می‌اندازد. */
    /* وقتی تقویم ناهم‌گام از سرور رسید، دوباره رندر کن */
    global.addEventListener('zz:calendar', function () {
      if (u.$('#adminRoot') && u.$('#adminRoot').innerHTML) safeRender();
    });

    /* تازه‌سازی داده‌ها وقتی مدیر به پنل برمی‌گردد — او معمولاً برای
       تماس با مشتری از مرورگر خارج می‌شود؛ موقع برگشت باید داده‌ی
       تازه ببیند، نه کشِ لحظه‌ی ورود را. ویرایشگر بازِ خدمات عمداً
       دست‌نخورده می‌ماند تا متنِ نوشته‌شده از بین نرود. */
    function refreshAll() {
      if (!u.$('#adminRoot') || !u.$('#adminRoot').innerHTML) return;
      invalidate('appts:');
      invalidate('slots:');
      invalidate('days');
      invalidate('stats');
      safeRender();
    }
    global.addEventListener('zz:refresh', refreshAll);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') refreshAll();
    });

    /* تبِ قبلی از hash یا پارامتر آدرس — تا با رفرش یا لینک مستقیم،
       مدیر همان‌جا بماند که بود (مثلاً ?tab=days&filter=cancelled) */
    var h = (global.location.hash || '').replace('#', '');
    var tParam = u.param('tab');
    var tab = TABS.some(function (x) { return x.id === tParam; }) ? tParam : h;
    if (TABS.some(function (x) { return x.id === tab; })) state.tab = tab;

    var fl = u.param('filter');
    if (['pending', 'upcoming', 'past', 'cancelled', 'all'].indexOf(fl) > -1) {
      state.filter = fl;
    }

    /* لینک مستقیم به ویرایشگر یک خدمت: ?tab=services&svc={id} —
       هم برای اشتراک‌گذاری، هم برای تست خودکار */
    var svParam = u.param('svc');
    if (svParam) {
      state.tab = 'services';
      state.editingId = svParam;
    }

    /* لینک مستقیم به پرونده‌ی یک مشتری: ?tab=customers&cust={id} */
    var cuParam = u.param('cust');
    if (cuParam) {
      state.tab = 'customers';
      state.custId = cuParam;
    }

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
