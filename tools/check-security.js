#!/usr/bin/env node
/* ==========================================================================
   check-security.js — تست‌های امنیتی ورود و نشست

   این مجموعه جلوی بازگشت دو حفره‌ی واقعی را می‌گیرد:

   ۱) «درِ پشتی حالت نمایشی»: وقتی سرور در دسترس نباشد، سایت به
      حالت localStorage برمی‌گردد. اگر آن حالت، ورود با کد ثابت
      (۱۲۳۴) و نقش مدیر برای شماره‌ی config را بپذیرد، هر
      بازدیدکننده‌ای در زمان قطعی سرور می‌تواند خودش را مدیر
      جا بزند. پرچم config.demo باید این رفتارها را خاموش کند.

   ۲) «نشست زامبی»: کش محلی (apiUser/session) بعد از مرگ کوکیِ
      سرور نباید کاربرِ غیرواقعی — مخصوصاً مدیر — را زنده نگه
      دارد. پاسخ ۴۰۱ از /auth/me باید کش را پاک کند؛ خطای شبکه
      نباید پاک کند (تا کاربر آفلاین بی‌دلیل بیرون نیفتد).

   اجرا:  node tools/check-security.js   (نیاز به jsdom در tools/)
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

let JSDOM;
try {
  ({ JSDOM } = require(path.join(__dirname, 'node_modules', 'jsdom')));
} catch (e) {
  console.log('⟳ jsdom نصب نیست؛ تست امنیتی رد شد. (npm ci در tools/ آن را می‌آورد)');
  process.exit(0);
}

const ROOT = path.resolve(__dirname, '..');
const PREFIX = 'zz.v1.'; // باید با config.storage.prefix یکی باشد
const ADMIN_PHONE = '09178399055';

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* یک صفحه را با اسکریپت‌های واقعی‌اش بوت می‌کند.
   fetchStub درخواست‌ها را جواب می‌دهد (شبیه‌سازی سرور/شبکه). */
function bootPage(rel, fetchStub) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://zohrezare.example/' + rel,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  win.fetch = fetchStub || (() => Promise.reject(new Error('network down')));
  win.scrollTo = () => {};

  const scripts = [...win.document.querySelectorAll('script[src]')]
    .map((s) => s.getAttribute('src'))
    .filter((s) => !/^https?:/.test(s));
  const base = path.join(ROOT, path.dirname(rel));
  for (const src of scripts) {
    const code = fs.readFileSync(path.join(base, src), 'utf8');
    try { win.eval(code); } catch (e) { /* صفحات بعدی خودشان خطا می‌دهند */ }
  }
  return win;
}

function jsonRes(obj, status) {
  const body = JSON.stringify(obj);
  return Promise.resolve({
    ok: status ? status < 400 : true,
    status: status || 200,
    text: () => Promise.resolve(body),
  });
}

(async () => {
  console.log('تست‌های امنیتی ورود و نشست\n');

  /* ---------- بخش ۱: قفل حالت نمایشی (آفلاین) ---------- */
  console.log('— حالت نمایشی خاموش (پروداکشن، سرور قطع) —');
  {
    const win = bootPage('index.html');
    const ZZ = win.ZZ;
    ok(!!ZZ && !!ZZ.auth, 'سایت بوت شد');

    const cfgSrc = fs.readFileSync(
      path.join(ROOT, 'assets/js/core/config.js'), 'utf8');
    ok(/demo:\s*true/.test(cfgSrc), 'مخزن/پیش‌نمایش: پرچم demo روشن است (برای تست)');

    /* شبیه‌سازی پرچمی که بسته‌ی پروداکشن روی آن می‌گذارد */
    ZZ.config.demo = false;

    const req = await ZZ.auth.requestCode(ADMIN_PHONE).then(
      () => 'resolved', (e) => e.message);
    ok(typeof req === 'string' && req.indexOf('سرور') > -1,
      'درخواست کد در حالت غیردمو رد شد: «' + String(req).slice(0, 40) + '…»');
    ok(ZZ.store.get('pending', null) === null, 'هیچ pending جعلی نوشته نشد');

    /* کد ثابت ۱۲۳۴ نباید پذیرفته شود — حتی با pending دستی */
    ZZ.store.set('pending', {
      phone: ADMIN_PHONE, code: '9999', attempts: 0,
      createdAt: Date.now(), expiresAt: Date.now() + 120000,
    });
    const badLogin = await ZZ.auth.verifyCode('1234').then(
      () => 'resolved', () => 'rejected');
    ok(badLogin === 'rejected', 'کد ثابت ۱۲۳۴ در حالت غیردمو پذیرفته نشد');

    /* کد واقعیِ در جریان باید کار کند — ولی نقش مدیر ندهد */
    const goodLogin = await ZZ.auth.verifyCode('9999').then(
      (r) => r, () => null);
    ok(!!goodLogin && goodLogin.user.role === 'user',
      'حتی با شماره‌ی مدیر، ورود محلی نقش user می‌دهد (نقش را فقط سرور تعیین می‌کند)');
    ok(ZZ.auth.isAdmin() === false, 'isAdmin در حالت غیردمو false است');
  }

  /* ---------- بخش ۲: حالت نمایشی روشن (پیش‌نمایش/تست) ---------- */
  console.log('\n— حالت نمایشی روشن (پیش‌نمایش و تست‌ها) —');
  {
    const win = bootPage('index.html');
    const ZZ = win.ZZ;
    ok(ZZ.config.demo === true, 'پیش‌فرض مخزن: demo روشن');

    const res = await ZZ.auth.requestCode(ADMIN_PHONE);
    ok(res && res.code === '1234', 'کد نمایشی ۱۲۳۴ برمی‌گردد (رفتار آشنای پیش‌نمایش)');

    const login = await ZZ.auth.verifyCode('1234');
    ok(login && login.user.role === 'admin', 'در دمو، شماره‌ی مدیر نقش مدیر می‌گیرد (پنل تست)');
  }

  /* ---------- بخش ۳: نشست زامبی ---------- */
  console.log('\n— نشست زامبی: کش محلی بعد از ۴۰۱ سرور —');
  {
    const admin = {
      id: 'usr_test_admin', phone: ADMIN_PHONE,
      name: '', birth: null, role: 'admin',
    };
    const seed = () => {
      const ls = (k, v) => win.localStorage.setItem(PREFIX + k, JSON.stringify(v));
      ls('apiUser', admin);
      ls('session', { userId: admin.id, phone: ADMIN_PHONE, at: Date.now() });
      ls('users', { [admin.id]: admin });
    };

    /* سرور آنلاین، ولی کوکی مرده: /auth/me → 401 */
    let win;
    win = bootPage('index.html', (url) => {
      const u = String(url);
      if (u.indexOf('/api/health') > -1) return jsonRes({ ok: true, time: '', version: '1.0' });
      if (u.indexOf('/api/auth/me') > -1)
        return jsonRes({ message: 'برای ادامه باید وارد حساب کاربری شوید.' }, 401);
      if (u.indexOf('/api/services') > -1) return jsonRes([]);
      if (u.indexOf('/api/days') > -1) return jsonRes([]);
      return jsonRes({ message: 'not found' }, 404);
    });
    seed();
    await (win.ZZ.ready || Promise.resolve());
    await sleep(150);
    ok(win.ZZ.store.get('apiUser', null) === null,
      'پاسخ ۴۰۱ کش apiUser را پاک کرد');
    ok(win.ZZ.store.get('session', null) === null,
      'پاسخ ۴۰۱ نشست محلی را پاک کرد');
    ok(win.ZZ.auth.isAdmin() === false,
      'بعد از ۴۰۱، کاربر دیگر مدیر دیده نمی‌شود (پنل باز نمی‌شود)');

    /* خطای شبکه (سرور قطع): کش باید بماند */
    win = bootPage('index.html', () => Promise.reject(new Error('network down')));
    seed();
    await (win.ZZ.ready || Promise.resolve());
    await sleep(150);
    ok(win.ZZ.store.get('apiUser', null) !== null,
      'خطای شبکه (بدون ۴۰۱) کش را نگه می‌دارد — کاربر آفلاین بیرون نمی‌افتد');
  }

  console.log();
  if (fail) {
    console.log('✗ ' + fail + ' تست امنیتی رد شد');
    process.exit(1);
  }
  console.log('همه‌ی ' + pass + ' تست امنیتی ✓');
})();
