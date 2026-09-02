/* ==========================================================================
   account.js — حساب کاربری و نوبت‌های رزرو شده
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = global.ZZ;
  var u = ZZ.u;
  var CUR = ZZ.config.booking.currency;

  /* این صفحه در panel/ قرار دارد، پس لینک‌ها به ریشه باید ../ بخورند */
  var B = '../';

  /* ---------------- کارت نوبت ---------------- */
  function apptHTML(a) {
    var s = ZZ.services.getById(a.serviceId);
    var v = ZZ.services.getVariant(a.serviceId, a.variantId);
    var d = u.fromKey(a.date);
    var st = ZZ.appointments.statusLabel(a);

    var isPending = a.status === 'pending';
    var isUpcoming = a.status === 'confirmed' && !u.isPast(a.date, a.time);
    /* درخواستی که هنوز تأیید نشده هر وقت خواست قابل لغو است؛
       محدودیت ۲۴ ساعته فقط برای نوبت قطعی‌شده معنا دارد. */
    var canCancel = isPending ||
      (isUpcoming && u.hoursUntil(a.date, a.time) >= ZZ.config.booking.cancelWindowHours);
    var closed = a.status === 'cancelled' || a.status === 'rejected';
    var dep = ZZ.appointments.depositLabel ? ZZ.appointments.depositLabel(a) : null;
    var respHours = (ZZ.config.approval && ZZ.config.approval.responseHours) || 6;

    return '' +
      '<article class="appt' + (closed ? ' is-cancelled' : '') +
        (isPending ? ' appt--pending' : '') + '" data-id="' + a.id + '">' +
        '<div class="appt__date">' +
          '<span class="appt__day">' + u.toFa(new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric' }).format(d)) + '</span>' +
          '<span class="appt__month">' + u.esc(new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'long' }).format(d)) + '</span>' +
        '</div>' +

        '<div class="appt__body">' +
          '<div class="appt__top">' +
            '<div>' +
              '<div class="appt__title">' + u.esc(s ? s.title : 'خدمت') + '</div>' +
              '<div class="appt__variant">' + u.esc(v ? v.name : '') + '</div>' +
            '</div>' +
            '<span class="badge ' + st.cls + '">' + st.text + '</span>' +
          '</div>' +

          '<div class="appt__meta">' +
            '<span>' + ZZ.icon('calendar') + u.faDate(d) + '</span>' +
            '<span>' + ZZ.icon('clock') + 'ساعت ' + u.toFa(a.time) + '</span>' +
            '<span>' + ZZ.icon('sparkle') + u.duration(a.durationMin) + '</span>' +
            '<span>' + ZZ.icon('tag') + u.money(a.price) + ' ' + CUR + '</span>' +
          '</div>' +

          (a.note ? '<div class="appt__note">' + ZZ.icon('edit', null, 14) + ' ' + u.esc(a.note) + '</div>' : '') +

          /* توضیح وضعیت — مهم‌ترین چیزی که مشتری بعد از ثبت
             درخواست می‌خواهد بداند: حالا چه اتفاقی می‌افتد؟ */
          (isPending
            ? '<div class="appt__state appt__state--wait">' + ZZ.icon('clock', null, 15) +
                '<span>این ساعت برای شما نگه داشته شده است. تا حدود ' +
                u.toFa(respHours) + ' ساعت آینده برای هماهنگی نهایی با شما تماس می‌گیریم.</span>' +
              '</div>'
            : '') +
          (a.status === 'rejected'
            ? '<div class="appt__state appt__state--no">' + ZZ.icon('info', null, 15) +
                '<span>' + u.esc(a.rejectReason || 'متأسفانه این درخواست پذیرفته نشد.') +
                ' می‌توانید ساعت دیگری را انتخاب کنید.</span>' +
              '</div>'
            : '') +
          (dep
            ? '<div class="appt__state appt__state--ok">' + ZZ.icon('checkCircle', null, 15) +
                '<span>بیعانه‌ی ' + u.money(dep.amount) + ' ' + CUR + ' دریافت شد' +
                (dep.method ? ' (' + u.esc(dep.method) + ')' : '') + '.' +
                ' این مبلغ از صورت‌حساب نهایی کم می‌شود.</span>' +
              '</div>'
            : '') +

          '<div class="appt__actions">' +
            (s ? '<a class="btn btn--soft btn--sm" href="' + B + 'service.html?s=' + s.slug + '">درباره‌ی این خدمت</a>' : '') +
            (canCancel
              ? '<button class="btn btn--quiet btn--sm" data-cancel="' + a.id + '">' +
                (isPending ? 'انصراف از درخواست' : 'لغو نوبت') + '</button>'
              : (isUpcoming
                  ? '<span class="badge badge--muted">برای لغو تماس بگیرید</span>'
                  : '')) +
            (!isUpcoming && !isPending && !closed && s
              ? '<a class="btn btn--ghost btn--sm" href="' + B + 'booking.html?service=' + s.id + '">رزرو دوباره</a>'
              : '') +
            (a.status === 'rejected' && s
              ? '<a class="btn btn--primary btn--sm" href="' + B + 'booking.html?service=' + s.id + '">انتخاب ساعت دیگر</a>'
              : '') +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function emptyHTML(title, text, cta) {
    return '<div class="empty">' +
             '<div class="empty__icon">' + ZZ.icon('calendar', null, 56) + '</div>' +
             '<h3>' + title + '</h3>' +
             '<p>' + text + '</p>' +
             (cta ? '<a class="btn btn--primary" href="' + B + 'booking.html" style="margin-top:var(--sp-4);">' + cta + '</a>' : '') +
           '</div>';
  }

  /* ---------------- رندر صفحه ---------------- */
  function render() {
    var root = u.$('#accountRoot');
    var user = ZZ.auth.currentUser();
    var g = ZZ.appointments.groupedForUser();

    var done = g.past.filter(function (a) { return a.status !== 'cancelled'; }).length;

    root.innerHTML = '' +
      '<div class="account-head">' +
        '<span class="profile-box profile-box--lg">پروفایل</span>' +
        '<div class="account-head__info">' +
          '<h1>' + u.esc(user.name || 'خوش آمدید') + '</h1>' +
          '<p class="ltr phone-num" style="text-align:start;">' + u.prettyPhoneHTML(user.phone) + '</p>' +
          (user.birth
            ? '<p style="font-size:var(--fs-xs);color:var(--text-muted);margin:2px 0 0;display:flex;align-items:center;gap:5px;">' +
                ZZ.icon('cake', 'birth-ico', 14) + u.formatBirth(user.birth) + '</p>'
            : '') +
        '</div>' +
        '<div style="display:flex;gap:var(--sp-2);flex-wrap:wrap;">' +
          '<button class="btn btn--ghost btn--sm" id="editNameBtn">' +
            ZZ.icon('edit', null, 16) + 'ویرایش نام</button>' +
          '<button class="btn btn--quiet btn--sm" id="logoutBtn">' +
            ZZ.icon('logout', null, 16) + 'خروج</button>' +
        '</div>' +
      '</div>' +

      '<div class="mini-stats">' +
        '<div class="mini-stat"><strong>' + u.toFa(g.upcoming.length) + '</strong><span>نوبت پیش رو</span></div>' +
        '<div class="mini-stat"><strong>' + u.toFa(done) + '</strong><span>جلسه‌ی انجام‌شده</span></div>' +
        '<div class="mini-stat"><strong>' + u.toFa(g.total) + '</strong><span>مجموع نوبت‌ها</span></div>' +
      '</div>' +

      '<div class="tabs" role="tablist">' +
        '<button class="tab is-active" data-tab="upcoming" role="tab">' +
          'نوبت‌های پیش رو' + (g.upcoming.length ? ' (' + u.toFa(g.upcoming.length) + ')' : '') + '</button>' +
        '<button class="tab" data-tab="past" role="tab">' +
          'تاریخچه' + (g.past.length ? ' (' + u.toFa(g.past.length) + ')' : '') + '</button>' +
        '<button class="tab" data-tab="profile" role="tab">اطلاعات حساب</button>' +
      '</div>' +

      /* ---- پیش رو ---- */
      '<div class="tab-panel is-active" data-panel="upcoming">' +
        (g.upcoming.length
          ? '<div class="appt-list">' + g.upcoming.map(apptHTML).join('') + '</div>' +
            '<div style="margin-top:var(--sp-5);text-align:center;">' +
              '<a class="btn btn--soft" href="' + B + 'booking.html">' + ZZ.icon('plus', null, 16) + 'رزرو نوبت جدید</a>' +
            '</div>'
          : emptyHTML('هنوز نوبتی ندارید',
              'اولین نوبتتان را رزرو کنید؛ کمتر از یک دقیقه طول می‌کشد.',
              'رزرو نوبت')) +
      '</div>' +

      /* ---- تاریخچه ---- */
      '<div class="tab-panel" data-panel="past">' +
        (g.past.length
          ? '<div class="appt-list">' + g.past.map(apptHTML).join('') + '</div>'
          : emptyHTML('تاریخچه‌ای موجود نیست', 'بعد از اولین جلسه، سابقه‌ی نوبت‌هایتان اینجا نمایش داده می‌شود.', null)) +
      '</div>' +

      /* ---- پروفایل ---- */
      '<div class="tab-panel" data-panel="profile">' +
        '<div class="card card--pad">' +
          '<form id="profileForm" novalidate>' +
            '<div class="field">' +
              '<label class="field__label" for="nameField">نام</label>' +
              '<input class="input" id="nameField" type="text" maxlength="40" ' +
                'value="' + u.esc(user.name || '') + '" placeholder="مثلاً: مریم">' +
            '</div>' +
            '<div class="field" id="birthField">' +
              '<label class="field__label" for="birthDay">تاریخ تولد</label>' +
              '<div class="birth-row">' +
                '<select class="input" id="birthDay"   aria-label="روز تولد"></select>' +
                '<select class="input" id="birthMonth" aria-label="ماه تولد"></select>' +
                '<select class="input" id="birthYear"  aria-label="سال تولد"></select>' +
              '</div>' +
              '<div class="birth-gift">' +
                '<span class="birth-gift__emoji" aria-hidden="true">' + ZZ.icon('cake', null, 22) + '</span>' +
                '<span>لطفاً تاریخ تولد خود را به‌صورت دقیق وارد کنید تا در روز تولدتان ' +
                'شامل تخفیف ویژه شوید.</span>' +
              '</div>' +
              '<div class="field__error" id="birthError" role="alert"></div>' +
            '</div>' +
            '<div class="field">' +
              '<label class="field__label" for="phoneField">شماره موبایل</label>' +
              '<input class="input ltr" id="phoneField" type="text" ' +
                'value="' + u.prettyPhone(user.phone) + '" disabled>' +
              '<div class="field__hint">شماره‌ی موبایل قابل تغییر نیست؛ چون شناسه‌ی ورود شماست.</div>' +
            '</div>' +
            '<button class="btn btn--primary" type="submit">ذخیره‌ی تغییرات</button>' +
          '</form>' +
        '</div>' +

      '</div>';

    /* سلکت‌های تاریخ تولد را پر کن — این عنصرها با هر render دوباره
       ساخته می‌شوند، پس باید هر بار پر شوند. */
    if (u.$('#profileForm')) buildBirthSelects(ZZ.auth.currentUser().birth);
  }

  /* ---------------- رویدادها ---------------- */

  /* ⚠️ مثل پنل مدیریت: #accountRoot هیچ‌وقت از DOM حذف نمی‌شود و فقط
     innerHTML آن عوض می‌شود. پس شنونده‌ها فقط یک بار وصل می‌شوند،
     وگرنه با هر render روی هم انباشته می‌شوند. */
  var bound = false;

  function bind() {
    if (bound) return;
    bound = true;

    var root = u.$('#accountRoot');

    /* تب‌ها */
    root.addEventListener('click', function (e) {
      var tab = e.target.closest('.tab');
      if (tab) {
        u.$$('.tab', root).forEach(function (t) { t.classList.remove('is-active'); });
        u.$$('.tab-panel', root).forEach(function (p) { p.classList.remove('is-active'); });
        tab.classList.add('is-active');
        var panel = u.$('[data-panel="' + tab.dataset.tab + '"]', root);
        if (panel) panel.classList.add('is-active');
        return;
      }

      /* لغو نوبت */
      var cancelBtn = e.target.closest('[data-cancel]');
      if (cancelBtn) {
        var id = cancelBtn.dataset.cancel;
        ZZ.dialog.confirm({
          title: 'لغو نوبت',
          message: 'این نوبت لغو شود؟ ساعت شما فوراً آزاد می‌شود.',
          confirmLabel: 'بله، لغو کن',
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          cancelBtn.classList.add('is-loading');
          ZZ.appointments.cancel(id)
            .then(function () {
              ZZ.toast.ok('نوبت لغو شد');
              render();
            })
            .catch(function (err) {
              cancelBtn.classList.remove('is-loading');
              ZZ.toast.error(err.message);
            });
        });
        return;
      }

      /* ویرایش نام → تب پروفایل */
      if (e.target.closest('#editNameBtn')) {
        var pTab = u.$('[data-tab="profile"]', root);
        if (pTab) pTab.click();
        setTimeout(function () {
          var f = u.$('#nameField');
          if (f) { f.focus(); f.select(); }
        }, 120);
        return;
      }

      /* خروج */
      if (e.target.closest('#logoutBtn')) {
        ZZ.dialog.confirm({
          title: 'خروج از حساب',
          message: 'از حساب کاربری خارج می‌شوید؟',
          confirmLabel: 'خروج',
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          ZZ.auth.logout();
          ZZ.toast.info('از حساب خارج شدید');
          setTimeout(function () { global.location.href = B + 'index.html'; }, 500);
        });
        return;
      }

      /* پاک کردن داده‌های نمایشی */
      if (e.target.closest('#resetBtn')) {
        ZZ.dialog.confirm({
          title: 'پاک کردن داده‌های نمایشی',
          message: 'همه‌ی داده‌های نمایشی (حساب و نوبت‌ها) پاک شوند؟',
          confirmLabel: 'بله، پاک کن',
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          ['users', 'session', 'pending', 'appointments', 'bookingDraft'].forEach(function (k) {
            ZZ.store.remove(k);
          });
          ZZ.toast.info('داده‌های نمایشی پاک شد');
          setTimeout(function () { global.location.href = B + 'index.html'; }, 600);
        });
      }
    });

    /* ذخیره‌ی پروفایل — واگذارشده روی root، چون فرم با هر render نو می‌شود */
    root.addEventListener('submit', function (e) {
      if (!e.target || e.target.id !== 'profileForm') return;
      (function () {
        e.preventDefault();

        var patch = { name: u.$('#nameField').value.trim() };

        var d = parseInt(u.$('#birthDay').value, 10);
        var m = parseInt(u.$('#birthMonth').value, 10);
        var y = parseInt(u.$('#birthYear').value, 10);
        var any = d || m || y;

        var bf = u.$('#birthField');
        var be = u.$('#birthError');

        if (any) {
          if (!(d && m && y)) {
            bf.classList.add('has-error');
            be.textContent = 'تاریخ تولد را کامل انتخاب کنید یا هر سه را خالی بگذارید.';
            return;
          }
          var check = u.validBirth(y, m, d);
          if (!check.ok) {
            bf.classList.add('has-error');
            be.textContent = check.msg;
            return;
          }
          patch.birth = { y: y, m: m, d: d };
        } else {
          patch.birth = null;
        }

        bf.classList.remove('has-error');
        be.textContent = '';

        ZZ.auth.updateProfile(patch);
        ZZ.toast.ok('اطلاعات ذخیره شد');
        render();
      })();
    });
  }

  /* ---------------- سلکت‌های تاریخ تولد ---------------- */
  function buildBirthSelects(current) {
    var daySel = u.$('#birthDay');
    var monSel = u.$('#birthMonth');
    var yearSel = u.$('#birthYear');
    if (!daySel || !monSel || !yearSel) return;

    var cy = u.jCurrentYear();
    var cur = current || {};

    monSel.innerHTML = '<option value="">ماه</option>' +
      u.jMonths.map(function (name, i) {
        var v = i + 1;
        return '<option value="' + v + '"' + (cur.m === v ? ' selected' : '') + '>' + name + '</option>';
      }).join('');

    var years = ['<option value="">سال</option>'];
    for (var y = cy - 5; y >= cy - 100; y--) {
      years.push('<option value="' + y + '"' + (cur.y === y ? ' selected' : '') + '>' + u.toFa(y) + '</option>');
    }
    yearSel.innerHTML = years.join('');

    function fillDays(keep) {
      var m = parseInt(monSel.value, 10);
      var y = parseInt(yearSel.value, 10) || (cy - 25);
      var max = m ? u.jMonthDays(y, m) : 31;
      var prev = keep || parseInt(daySel.value, 10);

      var opts = ['<option value="">روز</option>'];
      for (var d = 1; d <= max; d++) {
        opts.push('<option value="' + d + '">' + u.toFa(d) + '</option>');
      }
      daySel.innerHTML = opts.join('');
      if (prev && prev <= max) daySel.value = String(prev);
    }

    fillDays(cur.d);

    function clearErr() {
      var bf = u.$('#birthField');
      if (bf) bf.classList.remove('has-error');
      var be = u.$('#birthError');
      if (be) be.textContent = '';
    }
    monSel.addEventListener('change', function () { fillDays(); clearErr(); });
    yearSel.addEventListener('change', function () { fillDays(); clearErr(); });
    daySel.addEventListener('change', clearErr);
  }

  /* ---------------- شروع ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    ZZ.shell({ active: 'account', base: B });

    var boot = function () {
      if (!ZZ.auth.requireAuth('panel/index.html', B)) return;

      render();
      bind();   // فقط یک بار

      /* در حالت بک‌اند، نوبت‌ها از سرور می‌آیند */
      if (ZZ.isBackendMode && ZZ.isBackendMode() && ZZ.appointments.loadMine) {
        ZZ.appointments.loadMine().then(function (data) {
          ZZ.appointments.groupedForUser = function () { return data; };
          render();
        }).catch(function () { /* نسخه‌ی محلی نمایش داده می‌شود */ });
      }
    };

    if (ZZ.ready && typeof ZZ.ready.then === 'function') {
      ZZ.ready.then(boot).catch(boot);
    } else {
      boot();
    }
  });
})(window);
