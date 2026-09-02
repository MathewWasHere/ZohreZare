#!/usr/bin/env node
/* ==========================================================================
   check-account-page.js — تست دود صفحه‌ی حساب کاربری (panel/index.html)

   ماژول‌های واقعی را در Node با DOM ساختگی مینیمال بالا می‌آورد، کاربر
   را وارد می‌کند و رندر کارت پروفایل را بررسی می‌کند: کادرِ اطلاعات،
   ردیف‌های برچسب‌دار (نام/شماره/تولد/عضویت)، دکمه‌ها و رفتار پیوند
   «ثبت تاریخ تولد».

   اجرا:  node tools/check-account-page.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* ---------------- محیط ساختگی مرورگر ---------------- */

function makeWindow() {
  const mem = new Map();
  const localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear()
  };

  const rootListeners = {};
  const root = {
    innerHTML: '',
    addEventListener(type, fn) { (rootListeners[type] = rootListeners[type] || []).push(fn); }
  };

  const docListeners = {};
  const doc = {
    addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
    removeEventListener() {},
    querySelector(sel) { return sel === '#accountRoot' ? root : null; },
    querySelectorAll() { return []; },
    createElement() {
      return { className: '', innerHTML: '', appendChild() {}, remove() {}, setAttribute() {} };
    },
    body: { classList: { add() {}, remove() {} }, appendChild() {}, contains: () => false },
    contains: () => false,
    activeElement: null,
    documentElement: { lang: 'fa' }
  };

  const winListeners = {};
  const win = {
    localStorage,
    document: doc,
    navigator: { userAgent: 'node' },
    location: { href: '', search: '', hash: '' },
    addEventListener(type, fn) { (winListeners[type] = winListeners[type] || []).push(fn); },
    dispatchEvent(ev) { (winListeners[ev.type] || []).forEach((fn) => fn(ev)); },
    scrollTo() {},
    setTimeout,
    clearTimeout,
    CustomEvent: function (type) { this.type = type; },
    URLSearchParams,
    Intl,
    Date,
    Math,
    JSON,
    console
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;

  return { win, root, rootListeners, docListeners };
}

function load(win, ...files) {
  const ctx = vm.createContext(win);
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  return win.ZZ;
}

/** ورود کاربر، نام/تولد/عضویت مشخص، نوبت آینده + گذشته، رندر صفحه */
async function boot(seed) {
  const env = makeWindow();

  const ZZ = load(
    env.win,
    'assets/js/core/config.js',
    'assets/js/core/utils.js',
    'assets/js/core/store.js',
    'assets/js/data/services.js',
    'assets/js/data/auth.js',
    'assets/js/data/appointments.js',
    'assets/js/ui/icons.js'
  );

  ZZ.shell = function () {};
  ZZ.toast = { ok() {}, error() {}, info() {} };
  ZZ.dialog = {
    confirm(o) { return Promise.resolve(true); },
    open(o) { return Promise.resolve(false); }
  };

  load(env.win, 'assets/js/pages/account.js');

  return ZZ.auth.requestCode('09171112233')
    .then(() => ZZ.auth.verifyCode('1234'))
    .then(() => {
      /* پروفایل کامل: نام، تولد، تاریخ عضویت */
      const uid = ZZ.auth.currentUser().id;
      const users = ZZ.store.get('users', {}) || {};
      users[uid] = Object.assign({}, users[uid], {
        name: 'مریم تستی',
        birth: { y: 1375, m: 5, d: 12 },
        createdAt: Date.UTC(2024, 4, 20)
      });
      ZZ.store.set('users', users);

      if (seed) seed(ZZ, uid);

      (env.docListeners['DOMContentLoaded'] || []).forEach((fn) => fn({}));
      return { env, ZZ };
    });
}

/* ---------------- ابزار تست ---------------- */

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    const r = fn();
    if (r === true) {
      passed++;
      console.log('✓ ' + name);
    } else {
      failures.push(name + ' — ' + (r || 'نتیجه درست نبود'));
      console.log('✗ ' + name + '  →  ' + r);
    }
  } catch (e) {
    failures.push(name + ' — ' + e.message);
    console.log('✗ ' + name + '  →  ' + e.message);
  }
}

function count(hay, needle) {
  return hay.split(needle).length - 1;
}

function dayKey(offsetDays) {
  const t = new Date(Date.now() + offsetDays * 86400000);
  return t.getFullYear() + '-' +
    String(t.getMonth() + 1).padStart(2, '0') + '-' +
    String(t.getDate()).padStart(2, '0');
}

/* ---------------- تست‌ها ---------------- */

async function main() {
  /* ============ ۱) کارت پروفایل با اطلاعات کامل ============ */
  {
    const seed = (ZZ, uid) => {
      const svc = ZZ.services.getAll()[0];
      const base = {
        userId: uid, serviceId: svc.id, variantId: svc.variants[0].id,
        durationMin: svc.variants[0].durationMin, price: svc.variants[0].price,
        note: '', deposit: null, createdAt: Date.now()
      };
      ZZ.store.set('appointments', [
        Object.assign({}, base, { id: 'up1', date: dayKey(1), time: '12:00', status: 'confirmed' }),
        Object.assign({}, base, { id: 'pa1', date: dayKey(-10), time: '10:00', status: 'done' })
      ]);
    };

    const { env, ZZ } = await boot(seed);
    const html = () => env.root.innerHTML;

    check('پروفایل: اطلاعات در کارت (کادر) است، نه بی‌کادر', () =>
      (html().includes('class="account-head"') &&
       html().includes('class="account-info"')) || 'کارت پروفایل نیست');

    check('پروفایل: چهار ردیف برچسب‌دار (نام/شماره/تولد/عضویت)', () => {
      const rows = count(html(), 'account-info__row');
      const labels = ['<dt>نام</dt>', '<dt>شماره موبایل</dt>', '<dt>تاریخ تولد</dt>', '<dt>عضویت از</dt>'];
      return (rows === 4 && labels.every((l) => html().includes(l))) ||
        ('ردیف‌ها: ' + rows + ' — برچسب‌ها: ' + labels.filter((l) => html().includes(l)).length + '/۴');
    });

    check('پروفایل: نام کاربر با h1 در ردیف خودش', () =>
      (html().includes('account-info__name') &&
       html().includes('مریم تستی')) || 'نام نیست');

    check('پروفایل: شماره موبایل با فرمت خوانا و راست‌به‌چپ‌سازی', () =>
      (html().includes('۰۹۱۷') && html().includes('phone-dot') &&
       /class="ltr"/.test(html())) || 'شماره درست نیست');

    check('پروفایل: تاریخ تولد «۱۲ مرداد ۱۳۷۵» با آیکون کیک', () =>
      (html().includes('۱۲ مرداد ۱۳۷۵') && html().includes('birth-ico')) || 'تولد نیست');

    check('پروفایل: تاریخ عضویت با رقم فارسی', () =>
      /عضویت از<\/dt><dd>.*?[۰-۹]/.test(html()) || 'عضویت از نیست');

    check('پروفایل: دکمه‌های «ویرایش نام» و «خروج» در نوار کارت', () =>
      (html().includes('id="editNameBtn"') && html().includes('id="logoutBtn"') &&
       html().includes('account-head__btns')) || 'دکمه‌ها نیست');

    check('پروفایل: نشان «پروفایل» و خط‌چین جداکننده‌ی نوار', () =>
      (html().includes('profile-box--lg') &&
       html().includes('account-head__bar')) || 'نوار کارت نیست');

    check('آمار: سه کارت کوچک (پیش رو/انجام‌شده/مجموع)', () =>
      (html().includes('نوبت پیش رو') && html().includes('جلسه‌ی انجام‌شده') &&
       html().includes('مجموع نوبت‌ها') && count(html(), 'class="mini-stat"') === 3) ||
      'mini-stats نیست');

    check('نوبت‌ها: کارت نوبت آینده با دکمه‌ی رزرو جدید', () =>
      (html().includes('data-id="up1"') && html().includes('رزرو نوبت جدید')) || 'نوبت آینده نیست');

    check('تاریخچه: نوبت گذشته دیده می‌شود', () =>
      html().includes('data-id="pa1"') || 'تاریخچه نیست');

    check('تب اطلاعات حساب: فرم با فیلد نام و سه سلکت تولد و شماره‌ی قفل', () =>
      (html().includes('id="profileForm"') && html().includes('id="nameField"') &&
       html().includes('id="birthDay"') && html().includes('id="birthMonth"') &&
       html().includes('id="birthYear"') && html().includes('id="phoneField" disabled') ||
       /id="phoneField"[^>]*disabled/.test(html())) || 'فرم پروفایل نیست');

    /* ---- پیوند «ثبت تاریخ تولد» → تب اطلاعات حساب ---- */
    check('کلیک روی پیوند تولد → تب «اطلاعات حساب» باز می‌شود', () => {
      /* فراخوانی مستقیم شنونده‌ی کلیکِ root با رویداد ساختگی */
      let tabClicked = null;
      env.root.querySelector = (sel) =>
        (sel === '[data-tab="profile"]' ? { click: () => { tabClicked = 'profile'; } } : null);
      (env.rootListeners['click'] || []).forEach((fn) => fn({
        target: {
          closest: (s) => (s === '[data-goto-tab]' ? { dataset: { gotoTab: 'profile' } } : null)
        }
      }));
      return tabClicked === 'profile' || 'تب پروفایل کلیک نشد';
    });
  }

  /* ============ ۲) کاربر بدون تاریخ تولد ============ */
  {
    const seed = (ZZ, uid) => {
      const users = ZZ.store.get('users', {});
      users[uid].birth = null;
      ZZ.store.set('users', users);
    };

    const { env } = await boot(seed);
    const html = () => env.root.innerHTML;

    check('بدون تولد: ردیف تولد پیوندِ ثبت دارد (عضویت از سر جای خودش)', () =>
      (html().includes('data-goto-tab="profile"') &&
       html().includes('برای هدیه‌ی روز تولد، ثبتش کنید') &&
       count(html(), 'account-info__row') === 4) || 'پیوند ثبت تولد نیست');

    check('بدون تولد: عضویت از هنوز هست', () =>
      html().includes('<dt>عضویت از</dt>') || 'عضویت از نیست');
  }

  /* ---------------- نتیجه ---------------- */
  console.log('');
  if (failures.length) {
    console.log('✗ ' + failures.length + ' تست شکست خورد:');
    failures.forEach((f) => console.log('  • ' + f));
    process.exit(1);
  }
  console.log('همه‌ی ' + passed + ' تست صفحه‌ی حساب کاربری قبول شدند.');
}

main().catch((e) => { console.error(e); process.exit(1); });
