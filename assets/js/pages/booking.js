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
    note: ''
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

    var top = u.$('#stepsBar').getBoundingClientRect().top + global.scrollY - 90;
    global.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  /* ---------------- گام ۱: خدمت ---------------- */
  function renderServices() {
    var box = u.$('#serviceChoices');
    box.innerHTML = ZZ.services.getAll().map(function (s) {
      return '' +
        '<label class="choice">' +
          '<input type="radio" name="service" value="' + s.id + '"' +
            (state.serviceId === s.id ? ' checked' : '') + '>' +
          '<span class="choice__box">' +
            '<span style="flex-shrink:0;width:40px;height:40px;display:grid;place-items:center;' +
                  'border-radius:50%;background:var(--blush-100);color:var(--rose-500);">' +
              ZZ.icon(s.icon, null, 20) + '</span>' +
            '<span style="flex:1;min-width:0;">' +
              '<span class="choice__title">' + u.esc(s.title) + '</span><br>' +
              '<span class="choice__meta">' + u.esc(s.short) + '</span>' +
            '</span>' +
          '</span>' +
        '</label>';
    }).join('');

    box.addEventListener('change', function (e) {
      if (e.target.name !== 'service') return;
      state.serviceId = e.target.value;
      state.variantId = null;
      state.date = null;
      state.time = null;
      renderVariants();
      updateStep1Button();
      saveDraft();
    });
  }

  function renderVariants() {
    var wrap = u.$('#variantWrap');
    var box = u.$('#variantChoices');
    var s = ZZ.services.getById(state.serviceId);

    if (!s) { wrap.hidden = true; box.innerHTML = ''; return; }
    wrap.hidden = false;

    box.innerHTML = s.variants.map(function (v) {
      return '' +
        '<label class="choice">' +
          '<input type="radio" name="variant" value="' + v.id + '"' +
            (state.variantId === v.id ? ' checked' : '') + '>' +
          '<span class="choice__box">' +
            '<span style="flex:1;min-width:0;">' +
              '<span class="choice__title">' + u.esc(v.name) + '</span><br>' +
              '<span class="choice__meta">' + u.esc(v.note || '') + '</span>' +
            '</span>' +
            '<span style="flex-shrink:0;text-align:left;">' +
              '<span style="display:block;font-weight:500;color:var(--rose-600);white-space:nowrap;">' +
                u.money(v.price) + ' ' + CUR + '</span>' +
              '<span style="display:block;font-size:var(--fs-xs);color:var(--text-muted);white-space:nowrap;">' +
                u.duration(v.durationMin) + '</span>' +
            '</span>' +
          '</span>' +
        '</label>';
    }).join('');
  }

  function updateStep1Button() {
    u.$('#toDateBtn').disabled = !(state.serviceId && state.variantId);
  }

  /* ---------------- گام ۲: روز و ساعت ---------------- */
  function renderDays() {
    var strip = u.$('#dayStrip');
    var days = ZZ.appointments.getDays();

    strip.innerHTML = days.map(function (d) {
      var open = !d.closed && ZZ.appointments.hasOpenSlot(d.key, state.serviceId);
      var sel = state.date === d.key;
      return '<button type="button" class="day-chip' + (sel ? ' is-selected' : '') + '" ' +
               'data-date="' + d.key + '"' + (open ? '' : ' disabled') + '>' +
               '<span class="day-chip__day">' + u.esc(d.label) + '</span>' +
               '<span class="day-chip__date">' + u.esc(d.closed ? 'تعطیل' : d.short) + '</span>' +
             '</button>';
    }).join('');

    /* اگر روزی انتخاب نشده، اولین روز باز را بردار */
    if (!state.date) {
      var first = days.filter(function (d) {
        return !d.closed && ZZ.appointments.hasOpenSlot(d.key, state.serviceId);
      })[0];
      if (first) {
        state.date = first.key;
        var btn = strip.querySelector('[data-date="' + first.key + '"]');
        if (btn) btn.classList.add('is-selected');
      }
    }
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

  function updateStep2Button() {
    u.$('#toConfirmBtn').disabled = !(state.date && state.time);
  }

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
    var btn = u.$('#confirmBtn');

    if (ZZ.auth.isLoggedIn()) {
      var user = ZZ.auth.currentUser();
      notice.innerHTML = '<div class="note note--ok">' + ZZ.icon('checkCircle') +
        '<span>به‌عنوان <strong class="ltr phone-num">' + u.prettyPhoneHTML(user.phone) + '</strong> وارد شده‌اید.</span></div>';
      btn.textContent = (ZZ.config.approval && ZZ.config.approval.enabled)
        ? 'ثبت درخواست نوبت'
        : 'ثبت نهایی نوبت';
    } else {
      notice.innerHTML = '<div class="note note--info">' + ZZ.icon('info') +
        '<span>برای ثبت نوبت باید وارد حساب کاربری شوید. با زدن دکمه‌ی زیر، ' +
        'شماره‌تان را وارد می‌کنید و بعد از تایید کد، به همین‌جا برمی‌گردید.</span></div>';
      btn.textContent = (ZZ.config.approval && ZZ.config.approval.enabled)
        ? 'ورود و ثبت درخواست'
        : 'ورود و ثبت نوبت';
    }
  }

  /* ---------------- ثبت نهایی ---------------- */
  function submit() {
    var btn = u.$('#confirmBtn');

    /* اگر وارد نشده: پیش‌نویس را نگه دار و به صفحه‌ی ورود برو */
    if (!ZZ.auth.isLoggedIn()) {
      saveDraft();
      global.location.href = 'auth.html?next=' + encodeURIComponent('booking.html?resume=1');
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
  document.addEventListener('DOMContentLoaded', function () {
    ZZ.shell({ active: 'booking' });

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
    renderVariants();
    updateStep1Button();

    u.$('#variantChoices').addEventListener('change', function (e) {
      if (e.target.name !== 'variant') return;
      state.variantId = e.target.value;
      updateStep1Button();
      saveDraft();
    });

    u.$('#toDateBtn').addEventListener('click', function () {
      renderDays();
      renderSlots();
      updateStep2Button();
      goStep(1);
    });

    /* --- گام ۲ --- */
    u.$('#dayStrip').addEventListener('click', function (e) {
      var chip = e.target.closest('.day-chip');
      if (!chip || chip.disabled) return;
      u.$$('.day-chip', e.currentTarget).forEach(function (c) { c.classList.remove('is-selected'); });
      chip.classList.add('is-selected');
      state.date = chip.dataset.date;
      state.time = null;
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

    u.$('#toConfirmBtn').addEventListener('click', function () {
      renderConfirm();
      goStep(2);
    });

    /* --- گام ۳ --- */
    u.$('#backToTimeBtn').addEventListener('click', function () {
      renderDays();
      renderSlots();
      updateStep2Button();
      goStep(1);
    });
    u.$('#confirmBtn').addEventListener('click', submit);

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
