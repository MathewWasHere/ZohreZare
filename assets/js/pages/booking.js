/* ==========================================================================
   booking.js — جریان رزرو نوبت
   گام ۱ خدمت → گام ۲ روز و ساعت → گام ۳ تایید → گام ۴ نتیجه

   انتخاب ناتمام کاربر در حافظه ذخیره می‌شود تا اگر برای ورود به صفحه‌ی
   احراز هویت رفت، بعد از برگشت همه‌چیز سر جایش باشد.
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = global.ZZ;
  var u = ZZ.u;
  var CUR = ZZ.config.booking.currency;
  var DRAFT_KEY = 'bookingDraft';

  var STEPS = [
    { id: 'panelService', label: 'خدمت' },
    { id: 'panelTime',    label: 'زمان' },
    { id: 'panelConfirm', label: 'تایید' },
    { id: 'panelDone',    label: 'ثبت' }
  ];

  var state = {
    step: 0,
    serviceId: null,
    variantId: null,
    date: null,
    time: null,
    note: '',
    calIndex: 0           // کدام ماهِ تقویم باز است
  };

  /* ---------------- پیش‌نویس ---------------- */
  function saveDraft() {
    ZZ.store.set(DRAFT_KEY, {
      serviceId: state.serviceId,
      variantId: state.variantId,
      date: state.date,
      time: state.time,
      note: state.note,
      step: Math.min(state.step, 2)
    });
  }
  function loadDraft() {
    var d = ZZ.store.get(DRAFT_KEY, null);
    if (!d) return null;
    /* اگر روز انتخاب‌شده گذشته باشد، زمان را دور می‌ریزیم */
    if (d.date && u.isPast(d.date, d.time)) { d.date = null; d.time = null; d.step = Math.min(d.step, 1); }
    return d;
  }
  function clearDraft() { ZZ.store.remove(DRAFT_KEY); }

  /* ---------------- نوار مراحل ---------------- */
  function renderSteps() {
    var bar = u.$('#stepsBar');
    bar.innerHTML = STEPS.map(function (s, i) {
      var cls = i === state.step ? ' is-active' : (i < state.step ? ' is-done' : '');
      return '<span class="step' + cls + '" role="listitem">' +
               '<span class="step__num">' + (i < state.step ? ZZ.icon('check', null, 14) : u.toFa(i + 1)) + '</span>' +
               '<span>' + s.label + '</span>' +
             '</span>' +
             (i < STEPS.length - 1 ? '<span class="step__line"></span>' : '');
    }).join('');
  }

  function goStep(n) {
    state.step = n;
    u.$$('.book-panel').forEach(function (p) { p.classList.remove('is-active'); });
    u.$('#' + STEPS[n].id).classList.add('is-active');
    renderSteps();
    if (n < 3) saveDraft();

    /* نوار چسبان تا ثبت نهایی زیر انگشت می‌ماند؛ روی صفحه‌ی موفقیت
       دیگر دکمه‌ای لازم نیست. */
    var cta = u.$('#bookCta');
    if (cta) cta.hidden = n === 3;
    updateCtaBar();

    var top = u.$('#stepsBar').getBoundingClientRect().top + global.scrollY - 90;
    global.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  /* ---------------- نوار چسبان پایین ----------------
     دکمه‌ی اصلی هر گام + خلاصه‌ی انتخاب (قیمت یا زمان) همیشه در دسترسِ
     شست کاربر است؛ لازم نیست تا انتهای صفحه اسکرول کند. */
  function ctaState() {
    var s = ZZ.services.getById(state.serviceId);
    var v = s ? ZZ.services.getVariant(state.serviceId, state.variantId) : null;
    var approve = ZZ.config.approval && ZZ.config.approval.enabled;

    if (state.step === 0) {
      return {
        label: 'ادامه: انتخاب زمان',
        disabled: !(state.serviceId && state.variantId),
        info: v
          ? u.esc(v.name) + ' · ' + u.money(v.price) + ' ' + CUR + ' · ' + u.duration(v.durationMin)
          : 'اول خدمت و گزینه‌ی دقیق را انتخاب کنید'
      };
    }

    if (state.step === 1) {
      var d = state.date ? u.fromKey(state.date) : null;
      return {
        label: 'ادامه: بررسی نهایی',
        disabled: !(state.date && state.time),
        info: (d && state.time)
          ? u.esc(u.faDate(d, true)) + ' · ساعت ' + u.toFa(state.time)
          : 'روز و ساعت را انتخاب کنید'
      };
    }

    /* گام بررسی نهایی */
    return {
      label: ZZ.auth.isLoggedIn()
        ? (approve ? 'ثبت درخواست نوبت' : 'ثبت نهایی نوبت')
        : (approve ? 'ورود و ثبت درخواست' : 'ورود و ثبت نوبت'),
      disabled: false,
      info: v ? 'مبلغ تقریبی: ' + u.money(v.price) + ' ' + CUR : ''
    };
  }

  function updateCtaBar() {
    var btn = u.$('#ctaBtn');
    var info = u.$('#ctaInfo');
    if (!btn || !info) return;
    var c = ctaState();
    btn.textContent = c.label;
    btn.disabled = c.disabled;
    info.innerHTML = c.info;
  }



  /* ---------------- گام ۱: خدمت ----------------
     هر خدمت یک کارت است و گزینه‌های دقیق همان‌جا داخل همان کارت
     باز می‌شوند — یک کارت، یک تصمیم؛ گزینه‌ها دیگر در بلوک جدا و
     پایین‌صفحه پنهان نمی‌مانند. */
  function renderServices() {
    var box = u.$('#serviceChoices');

    box.innerHTML = ZZ.services.getAll().map(function (s) {
      var vars = s.variants.map(function (v) {
        return '<label class="choice svc-choice__var">' +
            '<input type="radio" name="variant" value="' + v.id + '"' +
              (state.variantId === v.id ? ' checked' : '') + '>' +
            '<span class="choice__box">' +
              '<span class="choice__txt">' +
                '<span class="choice__title">' + u.esc(v.name) + '</span><br>' +
                '<span class="choice__meta">' + u.esc(v.note || '') + '</span>' +
              '</span>' +
              '<span class="choice__pricebox">' +
                '<span class="choice__price">' + u.money(v.price) + ' ' + CUR + '</span>' +
                '<span class="choice__dur">' + u.duration(v.durationMin) + '</span>' +
              '</span>' +
            '</span>' +
          '</label>';
      }).join('');

      return '<div class="svc-choice' + (state.serviceId === s.id ? ' is-open' : '') +
          '" data-service="' + u.esc(s.id) + '">' +
        '<label class="choice svc-choice__head">' +
          '<input type="radio" name="service" value="' + s.id + '"' +
            (state.serviceId === s.id ? ' checked' : '') + '>' +
          '<span class="choice__box">' +
            '<span class="choice__ico">' + ZZ.icon(s.icon, null, 20) + '</span>' +
            '<span class="choice__txt">' +
              '<span class="choice__title">' + u.esc(s.title) + '</span><br>' +
              '<span class="choice__meta">' + u.esc(s.short) + '</span>' +
            '</span>' +
            ZZ.icon('chevronDown', 'svc-choice__chev', 18) +
          '</span>' +
        '</label>' +
        '<div class="svc-choice__body"' + (state.serviceId === s.id ? '' : ' hidden') + '>' +
          '<p class="svc-choice__lbl" id="lblVars-' + u.esc(s.id) + '">کدام گزینه؟</p>' +
          '<div class="svc-choice__vars" role="group" aria-labelledby="lblVars-' + u.esc(s.id) + '">' +
            vars +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    box.addEventListener('change', function (e) {
      if (e.target.name === 'service') {
        state.serviceId = e.target.value;
        state.variantId = null;
        state.date = null;
        state.time = null;
        /* انتخابِ خدمتِ دیگر، گزینه‌ی قبلی را هم پاک می‌کند */
        u.$$('input[name="variant"]', box).forEach(function (r) { r.checked = false; });
        openServiceCard(state.serviceId, true);
        updateStep1Button();
        saveDraft();
        return;
      }
      if (e.target.name === 'variant') {
        state.variantId = e.target.value;
        updateStep1Button();
        saveDraft();
      }
    });
  }

  /** باز کردن کارت یک خدمت و بستن بقیه — با اسکرول ملایم به گزینه‌ها */
  function openServiceCard(id, scroll) {
    u.$$('.svc-choice', u.$('#serviceChoices')).forEach(function (card) {
      var isOpen = card.dataset.service === id;
      card.classList.toggle('is-open', isOpen);
      var body = u.$('.svc-choice__body', card);
      if (body) body.hidden = !isOpen;
    });

    if (scroll) {
      var body = u.$('.svc-choice[data-service="' + id + '"] .svc-choice__body');
      if (body && body.scrollIntoView) {
        try {
          body.scrollIntoView({
            behavior: u.reducedMotion() ? 'auto' : 'smooth',
            block: 'nearest'
          });
        } catch (e) { /* noop */ }
      }
    }
  }

  function updateStep1Button() { updateCtaBar(); }

  /* ---------------- گام ۲: روز و ساعت ----------------
     تقویم ماهانه‌ی شمسی — همان مؤلفه‌ای که مدیر در تب «روزها» می‌بیند:
     یک عدد در هر خانه، نقطه‌ی وضعیت، ناوبری ماه. مشتری با تقویمِ ماه آشناست و هیچ متنی روی هم نمی‌افتد. */

  var J_WEEK = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
  var J_FMT = null;

  /** تبدیل Date به (سال، ماه، روز) شمسی — همان روش پنل مدیریت */
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

  function renderDays() {
    var wrap = u.$('#calWrap');
    /* در حالت بک‌اند، کش تقویم ممکن است برای پنل مدیریت بازتر باشد
       (مثلاً ۶۰ روز)؛ تقویم مشتری همیشه فقط به اندازه‌ی تنظیمات نشان
       می‌دهد — روزهای بعد از افق رزرو اصلاً رندر نمی‌شوند. */
    var days = ZZ.appointments.getDays().slice(0, ZZ.config.booking.daysAhead);

    /* اگر روزِ انتخاب‌شده معتبر نیست، اولین روزِ باز را بردار */
    if (!state.date || !days.some(function (d) { return d.key === state.date; })) {
      var first = days.filter(function (d) {
        return !d.closed && ZZ.appointments.hasOpenSlot(d.key, state.serviceId);
      })[0];
      state.date = first ? first.key : null;
      if (!first) state.time = null;
    }

    var groups = monthGroups(days);
    var gi = Math.max(0, Math.min(state.calIndex || 0, groups.length - 1));
    state.calIndex = gi;
    var g = groups[gi];
    var todayKey = u.dateKey(new Date());

    /* ---- خانه‌های ماه: فقط عدد + نقطه‌ی وضعیت ---- */
    var cells = '';
    var lead = pWeek(g.days[0].date);
    for (var b = 0; b < lead; b++) {
      cells += '<span class="cal-cell cal-cell--blank" aria-hidden="true"></span>';
    }

    g.days.forEach(function (d) {
      var jp = jParts(d.date);
      var sel = state.date === d.key;
      var isToday = d.key === todayKey;
      var full = !d.closed && !ZZ.appointments.hasOpenSlot(d.key, state.serviceId);

      var cls = 'cal-cell';
      if (d.closed) cls += ' is-closed';
      if (full && !sel) cls += ' is-full';
      if (isToday) cls += ' is-today';
      if (sel) cls += ' is-selected';

      var dot = d.closed
        ? '<span class="cal-dot cal-dot--closed" aria-hidden="true"></span>'
        : (full ? '<span class="cal-dot cal-dot--full" aria-hidden="true"></span>' : '');

      var aria = u.esc(u.faDayLabel(d.date) + ' ' + u.toFa(jp.d) + ' ' + g.label) +
        (d.closed ? ' — تعطیل' : (full ? ' — ظرفیت تکمیل' : ''));

      cells += '<button type="button" class="' + cls + '" data-date="' + d.key + '"' +
        (sel ? ' aria-current="date"' : '') + ' aria-label="' + aria + '"' +
        ((d.closed || full) && !sel ? ' disabled' : '') + '>' +
        '<span class="cal-cell__num">' + u.toFa(jp.d) + '</span>' + dot +
      '</button>';
    });

    wrap.innerHTML =
      '<div class="cal-card">' +
        '<div class="cal-head">' +
          '<button type="button" class="icon-btn cal-nav" data-cal="-1" aria-label="ماه قبل"' +
            (gi === 0 ? ' disabled' : '') + '>' + ZZ.icon('chevronRight', null, 18) + '</button>' +
          '<h4 class="cal-title" aria-live="polite">' + u.esc(g.label) + ' ' + u.toFa(g.y) + '</h4>' +
          '<button type="button" class="icon-btn cal-nav" data-cal="1" aria-label="ماه بعد"' +
            (gi >= groups.length - 1 ? ' disabled' : '') + '>' + ZZ.icon('chevronLeft', null, 18) + '</button>' +
        '</div>' +
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
  }

  function renderSlots() {
    var grid = u.$('#slotGrid');
    var empty = u.$('#slotEmpty');

    if (!state.date) {
      grid.innerHTML = '';
      empty.innerHTML = '<p class="muted" style="font-size:var(--fs-sm);">ابتدا یک روز انتخاب کنید.</p>';
      return;
    }

    var slots = ZZ.appointments.getSlots(state.date, state.serviceId);
    var open = slots.filter(function (s) { return s.available; });

    if (!open.length) {
      grid.innerHTML = '';
      empty.innerHTML = '<div class="note note--warn">' + ZZ.icon('info') +
        '<span>این روز ظرفیت خالی ندارد. لطفاً روز دیگری را امتحان کنید یا با ما تماس بگیرید.</span></div>';
      return;
    }

    empty.innerHTML = '';
    grid.innerHTML = slots.map(function (s) {
      var sel = state.time === s.time;
      return '<button type="button" class="slot' + (sel ? ' is-selected' : '') + '" ' +
               'data-time="' + s.time + '"' + (s.available ? '' : ' disabled') + '>' +
               u.toFa(s.time) +
               (s.reason ? '<small>' + u.esc(s.reason) + '</small>' : '') +
             '</button>';
    }).join('');
  }

  function updateStep2Button() { updateCtaBar(); }

  /* ---------------- گام ۳: خلاصه ---------------- */
  function summaryHTML() {
    var s = ZZ.services.getById(state.serviceId);
    var v = ZZ.services.getVariant(state.serviceId, state.variantId);
    if (!s || !v) return '';

    var d = u.fromKey(state.date);
    var rows = [
      ['خدمت', u.esc(s.title)],
      ['گزینه', u.esc(v.name)],
      ['روز', u.esc(u.faDate(d, true))],
      ['ساعت', u.toFa(state.time)],
      ['مدت تقریبی', u.duration(v.durationMin)]
    ];
    if (state.note) rows.push(['توضیح شما', u.esc(state.note)]);

    return '<dl style="margin:0;">' +
      rows.map(function (r) {
        return '<div class="summary__row"><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>';
      }).join('') +
      '</dl>' +
      '<div class="summary__total">' +
        '<span>مبلغ تقریبی</span>' +
        '<strong>' + u.money(v.price) + ' ' + CUR + '</strong>' +
      '</div>' +
      '<p class="muted" style="font-size:var(--fs-xs);margin-top:var(--sp-3);margin-bottom:0;line-height:1.85;">' +
        ((ZZ.config.approval && ZZ.config.approval.enabled)
          ? 'با ثبت درخواست، این ساعت برای شما نگه داشته می‌شود و همکاران ما برای ' +
            'هماهنگی نهایی با شما تماس می‌گیرند. پرداخت در محل انجام می‌شود و مبلغ ' +
            'نهایی ممکن است بعد از مشاوره‌ی حضوری کمی تغییر کند.'
          : 'پرداخت در محل انجام می‌شود. مبلغ نهایی ممکن است بعد از مشاوره‌ی حضوری کمی تغییر کند.') +
      '</p>';
  }

  function renderConfirm() {
    u.$('#summaryBox').innerHTML = summaryHTML();

    var notice = u.$('#authNotice');

    if (ZZ.auth.isLoggedIn()) {
      var user = ZZ.auth.currentUser();
      notice.innerHTML = '<div class="note note--ok">' + ZZ.icon('checkCircle') +
        '<span>به‌عنوان <strong class="ltr phone-num">' + u.prettyPhoneHTML(user.phone) + '</strong> وارد شده‌اید.</span></div>';
    } else {
      notice.innerHTML = '<div class="note note--info">' + ZZ.icon('info') +
        '<span>برای ثبت نوبت، شماره‌ی موبایل خود را تایید کنید. با زدن دکمه‌ی زیر ' +
        'همان‌جا و بدون ترک این صفحه کد را وارد می‌کنید؛ انتخاب‌هایتان حفظ می‌شود.</span></div>';
    }

    updateCtaBar();
  }

  /* ---------------- ورود در همان صفحه ----------------
     به‌جای پرتاب کاربر به صفحه‌ی ورود، شماره و کد همان‌جا در یک پنجره
     گرفته می‌شود؛ خلاصه‌ی نوبت زیر پنجره سر جایش می‌ماند و کاربر
     هیچ‌وقت حس «از جریان خارج شدم» نمی‌گیرد. */
  function openLoginDialog() {
    var apiRef = null;

    function showErr(host, msg) {
      var err = u.$('#dlgErr', host);
      err.textContent = msg;
      err.hidden = false;
    }

    /* یک مرحله: شماره → کد. با «تایید» پیش می‌رود و پنجره تا رسیدن
       به نتیجه باز می‌ماند (onConfirm همیشه false برمی‌گرداند). */
    function stage(host, api) {
      var btn = u.$('[data-confirm]', host);
      var err = u.$('#dlgErr', host);
      err.hidden = true;

      /* --- مرحله‌ی ۱: گرفتن کد برای شماره --- */
      if (u.$('#dlgStep2', host).hidden) {
        btn.classList.add('is-loading');
        ZZ.auth.requestCode(u.$('#dlgPhone', host).value)
          .then(function (res) {
            btn.classList.remove('is-loading');
            u.$('#dlgStep2', host).hidden = false;
            btn.textContent = 'تایید و ثبت نوبت';
            u.$('#dlgCode', host).focus();

            /* حالت نمایشی: کد روی صفحه نشان داده می‌شود */
            var demo = u.$('#dlgDemo', host);
            if (demo) {
              if (res && res.code) {
                demo.textContent = 'کد نمایشی: ' + u.toFa(res.code);
                demo.hidden = false;
              } else {
                demo.hidden = true;
              }
            }
          })
          .catch(function (e) {
            btn.classList.remove('is-loading');
            showErr(host, (e && e.message) || 'ارسال کد ناموفق بود.');
            u.$('#dlgPhone', host).focus();
          });
        return false;
      }

      /* --- مرحله‌ی ۲: تایید کد --- */
      btn.classList.add('is-loading');
      ZZ.auth.verifyCode(u.$('#dlgCode', host).value)
        .then(function () {
          api.close(true);
        })
        .catch(function (e) {
          btn.classList.remove('is-loading');
          showErr(host, (e && e.message) || 'کد تایید نشد.');
          u.$('#dlgCode', host).focus();
        });
      return false;
    }

    return ZZ.dialog.open({
      title: 'تایید شماره موبایل',
      hint: 'برای ثبت نوبت فقط شماره‌ی موبایل لازم است.',
      body:
        '<div class="login-box">' +
          '<label class="field"><span class="field__label" for="dlgPhone">شماره موبایل</span>' +
          '<input class="input ltr phone-num" id="dlgPhone" type="tel" inputmode="tel" ' +
            'autocomplete="tel" placeholder="09…" maxlength="14"></label>' +
          '<div id="dlgStep2" hidden>' +
            '<label class="field"><span class="field__label" for="dlgCode">کد تایید پیامک‌شده</span>' +
            '<input class="input ltr" id="dlgCode" type="text" inputmode="numeric" ' +
              'autocomplete="one-time-code" maxlength="6" placeholder="----"></label>' +
            '<p class="login-box__links">' +
              '<button type="button" class="linklike" id="dlgResend">ارسال دوباره‌ی کد</button>' +
              '<button type="button" class="linklike" id="dlgChange">تغییر شماره</button>' +
            '</p>' +
          '</div>' +
          '<p class="login-box__demo" id="dlgDemo" hidden></p>' +
          '<p class="login-box__err" id="dlgErr" role="alert" hidden></p>' +
        '</div>',
      confirmLabel: 'دریافت کد',
      cancelLabel: 'انصراف',
      onMount: function (host, api) {
        apiRef = api;

        var phone = u.$('#dlgPhone', host);
        var confirmBtn = u.$('[data-confirm]', host);

        /* Enter در هر فیلد یعنی همان کلیک روی «تایید» */
        [phone, u.$('#dlgCode', host)].forEach(function (el) {
          el.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
              e.preventDefault();
              confirmBtn.click();
            }
          });
        });

        u.$('#dlgResend', host).addEventListener('click', function () {
          u.$('#dlgErr', host).hidden = true;
          stage(host, api);
        });
        u.$('#dlgChange', host).addEventListener('click', function () {
          u.$('#dlgErr', host).hidden = true;
          u.$('#dlgDemo', host).hidden = true;
          u.$('#dlgStep2', host).hidden = true;
          confirmBtn.textContent = 'دریافت کد';
          phone.focus();
        });

        setTimeout(function () { if (phone) phone.focus(); }, 60);
      },
      onConfirm: function (host) {
        return stage(host, apiRef);
      }
    });
  }

  /* ---------------- صفحه‌ی موفقیت ---------------- */

  /** کد کوتاه پیگیری — از شناسه‌ی نوبت ساخته می‌شود تا مشتری هنگام
      تماس سالن به آن اشاره کند و طرفین همان نوبت را منظور کنند */
  function trackCode(id) {
    var s = u.toEn(String(id || '')).replace(/[^0-9a-zA-Z]/g, '');
    return s.slice(-6).toUpperCase() || '—';
  }

  /** فایل تقویم (iCal) — کاملاً در مرورگر ساخته می‌شود؛ بدون سرویس
      بیرونی. تاریخ‌ها محلی‌اند (بدون TZ) که تقویم گوشی خودش درست
      تفسیر می‌کند. */
  function buildICS(appt) {
    var s = ZZ.services.getById(appt.serviceId);
    var v = ZZ.services.getVariant(appt.serviceId, appt.variantId);
    var dur = (v && v.durationMin) || appt.durationMin || 90;

    var start = u.fromKey(appt.date);
    var hm = String(appt.time).split(':');
    start.setHours(+hm[0] || 0, +hm[1] || 0, 0, 0);
    var end = new Date(start.getTime() + dur * 60000);

    function stamp(d) {
      return d.getFullYear() +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0') + 'T' +
        String(d.getHours()).padStart(2, '0') +
        String(d.getMinutes()).padStart(2, '0') + '00';
    }
    function escIcs(t) {
      return String(t == null ? '' : t)
        .replace(/\\/g, '\\\\').replace(/;/g, '\\;')
        .replace(/,/g, '\\,').replace(/\n/g, '\\n');
    }

    var brand = ZZ.config.brand || {};
    var addr = brand.address || '';

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ZohreZare//Booking//FA',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:' + appt.id + '@zohrezare',
      'DTSTAMP:' + stamp(new Date()),
      'DTSTART:' + stamp(start),
      'DTEND:' + stamp(end),
      'SUMMARY:' + escIcs((s ? s.title : 'نوبت') + (v ? ' — ' + v.name : '') + ' | ' + (brand.name || '')),
      'LOCATION:' + escIcs(addr),
      'DESCRIPTION:' + escIcs('کد پیگیری: ' + trackCode(appt.id) +
        (appt.note ? '\nتوضیح: ' + appt.note : '')),
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
  }

  /** کد پیگیری + آدرس + مسیریابی + «افزودن به تقویم» */
  function renderDoneExtras(appt) {
    var box = u.$('#doneDetails');
    var icsBtn = u.$('#icsBtn');
    var brand = ZZ.config.brand || {};
    var addr = brand.address || '';
    var addrShort = brand.addressShort || addr;
    var geo = brand.geo;
    var code = trackCode(appt.id);

    box.innerHTML =
      '<div class="done-meta__row">' +
        '<span class="done-meta__lbl">کد پیگیری</span>' +
        '<strong class="done-meta__val ltr" dir="ltr">' + u.esc(code) + '</strong>' +
      '</div>' +
      '<div class="done-meta__row">' +
        '<span class="done-meta__lbl">آدرس سالن</span>' +
        '<span class="done-meta__val">' + u.esc(addrShort) + '</span>' +
      '</div>' +
      (addr
        ? '<a class="done-meta__map" href="https://maps.google.com/?q=' +
            encodeURIComponent(geo ? (geo.lat + ',' + geo.lng) : addr) + '" ' +
            'target="_blank" rel="noopener">' + ZZ.icon('pin', null, 15) + 'مسیریابی</a>'
        : '');

    /* «افزودن به تقویم» فقط جایی که مرورگر از Blob پشتیبانی می‌کند */
    if (global.Blob && global.URL && global.URL.createObjectURL) {
      icsBtn.hidden = false;
      icsBtn.innerHTML = ZZ.icon('calendarPlus', null, 16) + 'افزودن به تقویم';
      icsBtn.onclick = function () {
        var blob = new global.Blob([buildICS(appt)], { type: 'text/calendar;charset=utf-8' });
        var url = global.URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'nobat-' + code + '.ics';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { global.URL.revokeObjectURL(url); }, 2000);
        ZZ.toast.ok('به تقویمتان اضافه شد');
      };
    }
  }

  /* ---------------- ثبت نهایی ---------------- */
  function submit() {
    var btn = u.$('#ctaBtn');

    /* اگر وارد نشده: ورود در همان صفحه (پنجره‌ی شماره و کد)؛
       پیش‌نویس هم ذخیره می‌شود تا اگر اتفاقی افتاد، همه‌چیز در امان باشد */
    if (!ZZ.auth.isLoggedIn()) {
      saveDraft();
      openLoginDialog().then(function (ok) {
        if (!ok) return;
        renderConfirm();   /* اطلاعِ «وارد شدید» تازه شود */
        submit();          /* و ثبت، همان‌جا ادامه پیدا کند */
      });
      return;
    }

    btn.classList.add('is-loading');

    ZZ.appointments.create({
      serviceId: state.serviceId,
      variantId: state.variantId,
      date: state.date,
      time: state.time,
      note: state.note
    })
      .then(function (appt) {
        btn.classList.remove('is-loading');
        clearDraft();

        var d = u.fromKey(appt.date);
        var pending = appt.status === 'pending';
        var respHours = (ZZ.config.approval && ZZ.config.approval.responseHours) || 6;

        var title = u.$('#doneTitle');
        if (title) {
          title.textContent = pending ? 'درخواستتان ثبت شد' : 'نوبتتان ثبت شد';
        }
        u.$('#doneText').textContent = pending
          ? u.faDate(d) + ' ساعت ' + u.toFa(appt.time) + ' برای شما نگه داشته شد. ' +
            'تا حدود ' + u.toFa(respHours) + ' ساعت آینده برای هماهنگی نهایی با شما تماس می‌گیریم.'
          : 'منتظرتان هستیم؛ ' + u.faDate(d) + ' ساعت ' + u.toFa(appt.time) + '.';
        u.$('#doneSummary').innerHTML = summaryHTML();
        renderDoneExtras(appt);

        goStep(3);
        ZZ.toast.ok(pending ? 'درخواست شما ثبت شد' : 'نوبت شما با موفقیت ثبت شد');
      })
      .catch(function (err) {
        btn.classList.remove('is-loading');
        ZZ.toast.error(err.message);
        /* اگر بازه پر شده بود، برگرد به انتخاب زمان */
        if (/در دسترس نیست/.test(err.message)) {
          state.time = null;
          renderDays();
          renderSlots();
          updateStep2Button();
          goStep(1);
        }
      });
  }

  /* ---------------- راه‌اندازی ---------------- */
  var bound = false;

  document.addEventListener('DOMContentLoaded', function () {
    /* گارد در برای دوبار اجرا شدنِ رویداد (مثلاً در محیط تست):
       شنونده‌های واگذارشده نباید دوباره بسته شوند. */
    if (bound) return;
    bound = true;

    ZZ.shell({ active: 'booking' });

    /* CSS با این کلاس برای نوار چسبانِ پایین، جا باز می‌کند */
    document.body.classList.add('on-booking');

    /* اگر بک‌اند فعال است، تقویم به‌صورت ناهمگام می‌آید.
       این رویداد وقتی داده رسید منتشر می‌شود تا دوباره رندر کنیم. */
    global.addEventListener('zz:calendar', function () {
      if (state.step === 1) {
        renderDays();
        renderSlots();
        updateStep2Button();
      }
    });

    u.$('#doneIcon').innerHTML = ZZ.icon('checkCircle', null, 38);

    /* --- بازیابی وضعیت ---
       پیش‌نویس فقط وقتی استفاده می‌شود که کاربر از صفحه‌ی ورود برگشته
       باشد (?resume=1). ورود تازه به این صفحه همیشه باید از «انتخاب
       خدمت» شروع شود؛ چون پرش ناخواسته به مرحله‌ی بعد برای کاربر گیج‌کننده
       است و گاهی باعث می‌شد با یک خدمتِ تصادفی وارد مرحله‌ی تأیید شود. */
    var resume = u.param('resume') === '1';
    var urlService = u.param('service');

    if (resume) {
      var draft = loadDraft();
      if (draft) {
        state.serviceId = draft.serviceId;
        state.variantId = draft.variantId;
        state.date = draft.date;
        state.time = draft.time;
        state.note = draft.note || '';
      }
    } else {
      clearDraft();
    }

    /* فقط خودِ خدمتِ از قبل انتخاب‌شده را نگه می‌داریم؛ حتی اگر از
       صفحه‌ی خدمت آمده باشید، جریان از مرحله‌ی «انتخاب خدمت» شروع
       می‌شود تا همیشه واضح باشد چه چیزی را انتخاب کرده‌اید. */
    if (urlService && ZZ.services.getById(urlService)) {
      state.serviceId = urlService;
      state.variantId = null;
      state.date = null;
      state.time = null;
    }

    /* --- گام ۱ --- */
    renderServices();
    updateStep1Button();

    /* خدمتِ از قبل انتخاب‌شده (لینک مستقیم یا پیش‌نویس): کارتش باز است؛
       اگر زیر صفحه است، آرام به سمتش برو */
    if (state.serviceId) {
      var preselect = u.$('.svc-choice[data-service="' + state.serviceId + '"] .svc-choice__body');
      if (preselect && preselect.scrollIntoView) {
        try {
          preselect.scrollIntoView({ behavior: u.reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
        } catch (e) { /* noop */ }
      }
    }

    /* دکمه‌ی اصلی همه‌ی گام‌ها — در نوار چسبان پایین صفحه */
    u.$('#ctaBtn').addEventListener('click', function () {
      if (this.disabled) return;
      if (state.step === 0) {
        renderDays();
        renderSlots();
        updateStep2Button();
        goStep(1);
      } else if (state.step === 1) {
        renderConfirm();
        goStep(2);
      } else if (state.step === 2) {
        submit();
      }
    });

    /* --- گام ۲ --- */
    u.$('#calWrap').addEventListener('click', function (e) {
      /* ناوبری ماه */
      var nav = e.target.closest('[data-cal]');
      if (nav && !nav.disabled) {
        state.calIndex = Math.max(0, (state.calIndex || 0) + parseInt(nav.dataset.cal, 10));
        renderDays();
        return;
      }

      /* انتخاب روز */
      var cell = e.target.closest('button.cal-cell');
      if (!cell || cell.disabled) return;
      state.date = cell.dataset.date;
      state.time = null;
      renderDays();
      renderSlots();
      updateStep2Button();
      saveDraft();
    });

    u.$('#slotGrid').addEventListener('click', function (e) {
      var slot = e.target.closest('.slot');
      if (!slot || slot.disabled) return;
      u.$$('.slot', e.currentTarget).forEach(function (c) { c.classList.remove('is-selected'); });
      slot.classList.add('is-selected');
      state.time = slot.dataset.time;
      updateStep2Button();
      saveDraft();
    });

    var noteInput = u.$('#noteInput');
    noteInput.value = state.note;
    noteInput.addEventListener('input', u.debounce(function () {
      state.note = noteInput.value.trim();
      saveDraft();
    }, 400));

    u.$('#backToServiceBtn').addEventListener('click', function () { goStep(0); });

    /* --- گام ۳ --- */
    u.$('#backToTimeBtn').addEventListener('click', function () {
      renderDays();
      renderSlots();
      updateStep2Button();
      goStep(1);
    });

    /* --- پرش به مرحله‌ی درست ---
       فقط بعد از برگشت واقعی از صفحه‌ی ورود (?resume=1) به مرحله‌ی
       بعد می‌پریم. در حالت عادی همیشه از «انتخاب خدمت» شروع می‌شود. */
    var target = 0;
    if (resume && state.serviceId && state.variantId) {
      target = 1;
      renderDays();
      renderSlots();
      updateStep2Button();
      if (state.date && state.time) {
        target = 2;
        renderConfirm();
      }
    }
    goStep(target);

    /* اگر تازه از صفحه‌ی ورود برگشته و همه‌چیز آماده است، خبر بده */
    if (resume && ZZ.auth.isLoggedIn() && state.date && state.time) {
      ZZ.toast.info('وارد شدید — حالا نوبتتان را ثبت کنید');
    }
  });
})(window);
