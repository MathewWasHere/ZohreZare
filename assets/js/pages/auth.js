/* ==========================================================================
   auth.js (صفحه) — جریان ورود/ثبت‌نام با کد یک‌بارمصرف
   گام ۱ شماره → گام ۲ کد → گام ۳ خوش‌آمد و نام
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = global.ZZ;
  var u = ZZ.u;
  var cfg = ZZ.config.auth;

  var state = {
    phone: '',
    isNewUser: false,
    timer: null,
    secondsLeft: 0
  };

  /**
   * آدرس بازگشت بعد از ورود.
   * اگر مقصد مشخصی در ?next= نبود، کاربر را به پنل مناسب نقشش
   * می‌فرستیم: مدیر → panel/admin ، کاربر عادی → panel
   */
  function nextUrl() {
    var n = u.param('next');
    var fallback = ZZ.auth.isAdmin()
      ? ZZ.config.admin.panelPath      // panel/admin/index.html
      : 'panel/index.html';

    if (!n) return fallback;
    /* فقط آدرس داخلی مجاز است — جلوگیری از open redirect */
    if (/^https?:|^\/\//i.test(n)) return fallback;

    /* اگر مدیر است و مقصد پنل عادی بود، به پنل مدیریت ببر */
    if (ZZ.auth.isAdmin() && n.indexOf('panel/index.html') === 0) {
      return ZZ.config.admin.panelPath;
    }
    return n;
  }

  function showStep(id) {
    u.$$('.auth-step').forEach(function (s) { s.classList.remove('is-active'); });
    var el = u.$('#' + id);
    if (el) el.classList.add('is-active');
    global.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setError(fieldId, errId, msg) {
    var field = u.$('#' + fieldId);
    var err = u.$('#' + errId);
    if (msg) {
      field.classList.add('has-error');
      err.textContent = msg;
    } else {
      field.classList.remove('has-error');
      err.textContent = '';
    }
  }

  /* ---------------- شمارنده‌ی ارسال دوباره ---------------- */
  function startTimer() {
    var timerText = u.$('#timerText');
    var resendBtn = u.$('#resendBtn');
    state.secondsLeft = cfg.resendSeconds;
    resendBtn.disabled = true;

    function tick() {
      if (state.secondsLeft <= 0) {
        clearInterval(state.timer);
        state.timer = null;
        timerText.textContent = 'کد را دریافت نکردید؟';
        resendBtn.disabled = false;
        return;
      }
      var m = Math.floor(state.secondsLeft / 60);
      var s = state.secondsLeft % 60;
      timerText.textContent = 'ارسال دوباره تا ' +
        u.toFa(m) + ':' + u.toFa(String(s).padStart(2, '0')) + ' دیگر';
      state.secondsLeft--;
    }

    clearInterval(state.timer);
    tick();
    state.timer = setInterval(tick, 1000);
  }

  /* ---------------- کادرهای OTP ---------------- */
  function otpInputs() { return u.$$('#otpBox input'); }

  function otpValue() {
    return otpInputs().map(function (i) { return u.toEn(i.value).replace(/\D/g, ''); }).join('');
  }

  function clearOtp(focus) {
    otpInputs().forEach(function (i) { i.value = ''; i.classList.remove('is-filled'); });
    if (focus) otpInputs()[0].focus();
  }

  function fillOtp(code) {
    var ins = otpInputs();
    String(code).split('').slice(0, ins.length).forEach(function (c, i) {
      ins[i].value = c;
      ins[i].classList.add('is-filled');
    });
  }

  function initOtp() {
    var ins = otpInputs();

    ins.forEach(function (input, idx) {
      input.addEventListener('input', function () {
        var v = u.toEn(input.value).replace(/\D/g, '');

        /* اگر کاربر کل کد را در یک کادر پیست کرد */
        if (v.length > 1) {
          v.split('').slice(0, ins.length - idx).forEach(function (c, k) {
            ins[idx + k].value = c;
            ins[idx + k].classList.add('is-filled');
          });
          var last = Math.min(idx + v.length, ins.length - 1);
          ins[last].focus();
          maybeAutoSubmit();
          return;
        }

        input.value = v;
        input.classList.toggle('is-filled', !!v);
        setError('codeField', 'codeError', '');

        if (v && idx < ins.length - 1) ins[idx + 1].focus();
        maybeAutoSubmit();
      });

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !input.value && idx > 0) {
          ins[idx - 1].focus();
          ins[idx - 1].value = '';
          ins[idx - 1].classList.remove('is-filled');
          e.preventDefault();
        }
        if (e.key === 'ArrowLeft' && idx < ins.length - 1) ins[idx + 1].focus();
        if (e.key === 'ArrowRight' && idx > 0) ins[idx - 1].focus();
      });

      input.addEventListener('focus', function () { input.select(); });
    });

    /* پیست در هر جای فرم */
    u.$('#otpBox').addEventListener('paste', function (e) {
      var text = (e.clipboardData || global.clipboardData).getData('text');
      var digits = u.toEn(text).replace(/\D/g, '').slice(0, ins.length);
      if (!digits) return;
      e.preventDefault();
      clearOtp();
      fillOtp(digits);
      ins[Math.min(digits.length, ins.length) - 1].focus();
      maybeAutoSubmit();
    });
  }

  function maybeAutoSubmit() {
    if (otpValue().length === cfg.codeLength) {
      setTimeout(function () { u.$('#codeForm').requestSubmit(); }, 180);
    }
  }

  /* ---------------- درخواست کد ---------------- */
  function requestCode(phoneRaw, btn) {
    btn.classList.add('is-loading');

    return ZZ.auth.requestCode(phoneRaw)
      .then(function (res) {
        btn.classList.remove('is-loading');
        state.phone = res.phone;
        state.isNewUser = res.isNewUser;

        u.$('#phoneEcho').textContent = u.prettyPhone(res.phone);

        /* نمایش کد در حالت نمایشی */
        var demo = u.$('#demoCode');
        if (res.code) {
          demo.hidden = false;
          demo.innerHTML = ZZ.icon('info') +
            '<span>نسخه‌ی نمایشی — کد شما:</span><strong class="ltr">' + u.esc(res.code) + '</strong>';
        } else {
          demo.hidden = true;
        }

        clearOtp();
        showStep('stepCode');
        startTimer();
        setTimeout(function () { otpInputs()[0].focus(); }, 320);
        ZZ.toast.ok('کد تایید ارسال شد');
      })
      .catch(function (err) {
        btn.classList.remove('is-loading');
        setError('phoneField', 'phoneError', err.message);
        ZZ.toast.error(err.message);
      });
  }

  /* ---------------- راه‌اندازی ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    ZZ.shell({ active: 'account' });

    /* اگر از قبل وارد شده، مستقیم برو */
    if (ZZ.auth.isLoggedIn()) {
      global.location.replace(nextUrl());
      return;
    }

    u.$('#doneIcon').innerHTML = ZZ.icon('checkCircle', null, 38);
    u.$('#phoneIcon').innerHTML = ZZ.icon('phone', null, 26);

    /* ---- گام ۱ ---- */
    var phoneInput = u.$('#phoneInput');

    phoneInput.addEventListener('input', function () {
      /* فقط رقم، با نمایش گروه‌بندی‌شده */
      var digits = u.toEn(phoneInput.value).replace(/\D/g, '').slice(0, 11);
      var body = digits.indexOf('0') === 0 ? digits.slice(1) : digits;
      body = body.slice(0, 10);
      var out = body.replace(/^(\d{3})(\d{0,3})(\d{0,4}).*$/, function (_, a, b, c) {
        return [a, b, c].filter(Boolean).join(' ');
      });
      phoneInput.value = out;
      setError('phoneField', 'phoneError', '');
    });

    u.$('#phoneForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var val = u.toEn(phoneInput.value).replace(/\D/g, '');
      if (val && val.indexOf('0') !== 0) val = '0' + val;

      if (!u.isValidPhone(val)) {
        setError('phoneField', 'phoneError', 'شماره‌ی موبایل باید ۱۱ رقم و با ۰۹ شروع شود.');
        phoneInput.focus();
        return;
      }
      requestCode(val, u.$('#sendBtn'));
    });

    /* ---- گام ۲ ---- */
    initOtp();

    u.$('#backBtn').addEventListener('click', function () {
      clearInterval(state.timer);
      ZZ.auth.clearPending();
      setError('codeField', 'codeError', '');
      showStep('stepPhone');
      setTimeout(function () { phoneInput.focus(); }, 300);
    });

    u.$('#resendBtn').addEventListener('click', function () {
      if (!state.phone) return;
      requestCode(state.phone, u.$('#verifyBtn'));
    });

    u.$('#codeForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var code = otpValue();
      var btn = u.$('#verifyBtn');

      if (code.length < cfg.codeLength) {
        setError('codeField', 'codeError', 'کد ' + u.toFa(cfg.codeLength) + ' رقمی را کامل وارد کنید.');
        return;
      }

      btn.classList.add('is-loading');
      ZZ.auth.verifyCode(code)
        .then(function (res) {
          btn.classList.remove('is-loading');
          clearInterval(state.timer);

          u.$('#doneTitle').textContent = res.isNewUser ? 'حسابتان ساخته شد' : 'خوش برگشتید';
          u.$('#doneText').textContent = res.isNewUser
            ? 'از این به بعد فقط با همین شماره وارد می‌شوید. حالا می‌توانید نوبت رزرو کنید.'
            : 'وارد حسابتان شدید. نوبت‌های قبلی‌تان در صفحه‌ی حساب کاربری در دسترس است.';

          u.$('#nameInput').value = res.user.name || '';

          showStep('stepDone');
          ZZ.toast.ok(res.isNewUser ? 'ثبت‌نام با موفقیت انجام شد' : 'با موفقیت وارد شدید');
        })
        .catch(function (err) {
          btn.classList.remove('is-loading');
          setError('codeField', 'codeError', err.message);
          clearOtp(true);
          ZZ.toast.error(err.message);
        });
    });

    /* ---- گام ۳: نام و تاریخ تولد ---- */
    buildBirthSelects();

    u.$('#nameForm').addEventListener('submit', function (e) {
      e.preventDefault();

      var name = u.$('#nameInput').value.trim();
      var patch = {};
      if (name) patch.name = name;

      /* تاریخ تولد اختیاری است، ولی اگر پر شد باید کامل و درست باشد */
      var d = parseInt(u.$('#birthDay').value, 10);
      var m = parseInt(u.$('#birthMonth').value, 10);
      var y = parseInt(u.$('#birthYear').value, 10);
      var any = d || m || y;

      if (any) {
        if (!(d && m && y)) {
          setError('birthField', 'birthError', 'تاریخ تولد را کامل انتخاب کنید یا هر سه را خالی بگذارید.');
          return;
        }
        var check = u.validBirth(y, m, d);
        if (!check.ok) {
          setError('birthField', 'birthError', check.msg);
          return;
        }
        patch.birth = { y: y, m: m, d: d };
      }

      setError('birthField', 'birthError', '');

      /* در حالت بک‌اند، updateProfile یک Promise برمی‌گرداند؛
         باید منتظرش بمانیم وگرنه قبل از ذخیره شدن، صفحه عوض
         می‌شود و اطلاعات از دست می‌رود. */
      var btn = u.$('#continueBtn');
      var go = function () { global.location.href = nextUrl(); };

      if (!Object.keys(patch).length) return go();

      btn.classList.add('is-loading');
      var result = ZZ.auth.updateProfile(patch);

      if (result && typeof result.then === 'function') {
        result.then(go).catch(function (err) {
          btn.classList.remove('is-loading');
          setError('birthField', 'birthError', err.message || 'ذخیره نشد.');
        });
      } else {
        go();
      }
    });
  });

  /* ---------------- سلکت‌های تاریخ تولد ---------------- */
  function buildBirthSelects() {
    var daySel = u.$('#birthDay');
    var monSel = u.$('#birthMonth');
    var yearSel = u.$('#birthYear');
    if (!daySel || !monSel || !yearSel) return;

    var cy = u.jCurrentYear();

    /* ماه */
    monSel.innerHTML = '<option value="">ماه</option>' +
      u.jMonths.map(function (name, i) {
        return '<option value="' + (i + 1) + '">' + name + '</option>';
      }).join('');

    /* سال: از ۵ سال پیش تا ۱۰۰ سال قبل */
    var years = ['<option value="">سال</option>'];
    for (var y = cy - 5; y >= cy - 100; y--) {
      years.push('<option value="' + y + '">' + u.toFa(y) + '</option>');
    }
    yearSel.innerHTML = years.join('');

    /* روز — تعداد بر اساس ماه و سال به‌روز می‌شود */
    function fillDays() {
      var m = parseInt(monSel.value, 10);
      var y = parseInt(yearSel.value, 10) || (cy - 25);
      var max = m ? u.jMonthDays(y, m) : 31;
      var prev = parseInt(daySel.value, 10);

      var opts = ['<option value="">روز</option>'];
      for (var d = 1; d <= max; d++) {
        opts.push('<option value="' + d + '">' + u.toFa(d) + '</option>');
      }
      daySel.innerHTML = opts.join('');

      /* اگر روز قبلی هنوز معتبر است، نگهش دار */
      if (prev && prev <= max) daySel.value = String(prev);
    }

    fillDays();
    monSel.addEventListener('change', function () {
      fillDays();
      setError('birthField', 'birthError', '');
    });
    yearSel.addEventListener('change', function () {
      fillDays();
      setError('birthField', 'birthError', '');
    });
    daySel.addEventListener('change', function () {
      setError('birthField', 'birthError', '');
    });
  }
})(window);
