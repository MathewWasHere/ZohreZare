#!/usr/bin/env node
/* ==========================================================================
   check-booking-flow.js — تست جریان تأیید رزرو

   ماژول‌های واقعی سایت را در Node بار می‌کند (با یک localStorage ساختگی)
   و کل چرخه‌ی «درخواست → تأیید/رد → بیعانه» را می‌آزماید.

   چرا اینجا و نه در مرورگر؟ چون این منطق قلب رزرو است و یک اشتباه در
   آن یعنی دو نفر روی یک ساعت. باید در هر بیلد بررسی شود.

   اجرا:  node tools/check-booking-flow.js
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

  const win = {
    localStorage,
    document: { addEventListener() {}, documentElement: { lang: 'fa' } },
    navigator: { userAgent: 'node' },
    location: { href: '', search: '' },
    addEventListener() {},
    setTimeout,
    clearTimeout,
    Intl,
    Date,
    Math,
    JSON,
    console
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;
  return win;
}

function load(win, ...files) {
  const ctx = vm.createContext(win);
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  return win.ZZ;
}

function boot() {
  const win = makeWindow();
  const ZZ = load(
    win,
    'assets/js/core/config.js',
    'assets/js/core/utils.js',
    'assets/js/core/store.js',
    'assets/js/data/services.js',
    'assets/js/data/auth.js',
    'assets/js/data/appointments.js'
  );
  return { win, ZZ };
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

/** یک روز باز در آینده با حداقل دو ساعت آزاد پیدا کن */
function openSlot(ZZ, serviceId) {
  const days = ZZ.appointments.getDays(14);
  for (const d of days) {
    if (d.closed) continue;
    const slots = ZZ.appointments.getSlots(d.key, serviceId);
    const free = slots.filter((s) => s.available);
    if (free.length >= 2) return { date: d.key, times: free.map((s) => s.time) };
  }
  return null;
}

/** n ساعتِ آزاد، در صورت لزوم از چند روز مختلف */
function freeSlots(ZZ, serviceId, n) {
  const out = [];
  for (const d of ZZ.appointments.getDays(14)) {
    if (d.closed) continue;
    for (const s of ZZ.appointments.getSlots(d.key, serviceId)) {
      if (s.available) {
        out.push({ date: d.key, time: s.time });
        if (out.length >= n) return out;
      }
    }
  }
  return out;
}

/** ورود ساختگی: کاربر را مستقیم در استور می‌نشانیم */
function login(ZZ, phone, name) {
  return ZZ.auth.requestCode(phone)
    .then(() => ZZ.auth.verifyCode(ZZ.config.auth.staticCode))
    .then((r) => {
      /* updateProfile در نسخه‌ی محلی هم‌گام است و Promise نمی‌دهد */
      if (name) ZZ.auth.updateProfile({ name });
      return r.user;
    });
}

/* ---------------- سناریوها ---------------- */

async function main() {
  const { ZZ } = boot();
  const A = ZZ.appointments;
  const svc = ZZ.services.getAll()[0];

  console.log('\n— جریان تأیید رزرو —\n');

  check('جریان تأیید در تنظیمات روشن است', () =>
    ZZ.config.approval.enabled === true || 'approval.enabled خاموش است');

  const user = await login(ZZ, '09120000001', 'مشتری آزمایشی');
  check('ورود کاربر آزمایشی', () => !!user.id || 'کاربر ساخته نشد');

  const spot = openSlot(ZZ, svc.id);
  check('حداقل یک روز با دو ساعت آزاد وجود دارد', () => !!spot || 'ساعت آزاد پیدا نشد');
  if (!spot) return finish();

  /* --- ۱) رزرو تازه باید pending باشد --- */
  const appt = await A.create({
    serviceId: svc.id,
    variantId: svc.variants[0].id,
    date: spot.date,
    time: spot.times[0],
    note: 'تست'
  });
  check('رزرو تازه با وضعیت «در انتظار تأیید» ثبت می‌شود', () =>
    appt.status === 'pending' || 'وضعیت شد: ' + appt.status);
  check('رزرو تازه بیعانه ندارد', () => appt.deposit === null || 'deposit خالی نبود');

  /* --- ۲) ساعتِ pending باید برای بقیه قفل باشد --- */
  check('ساعتِ در انتظار تأیید برای بقیه قفل می‌شود', () => {
    const s = A.getSlots(spot.date, svc.id).filter((x) => x.time === appt.time)[0];
    return (s && !s.available) || 'ساعت هنوز آزاد است';
  });
  check('دلیل قفل بودن «در انتظار تأیید» است', () => {
    const s = A.getSlots(spot.date, svc.id).filter((x) => x.time === appt.time)[0];
    return s.reason === 'در انتظار تأیید' || 'دلیل شد: ' + s.reason;
  });

  /* --- ۳) کاربر دیگری نباید بتواند همان ساعت را بگیرد --- */
  await login(ZZ, '09120000002', 'مشتری دوم');
  let clash = null;
  try {
    await A.create({
      serviceId: svc.id, variantId: svc.variants[0].id,
      date: spot.date, time: spot.times[0]
    });
  } catch (e) { clash = e.message; }
  check('کاربر دوم نمی‌تواند همان ساعت را رزرو کند', () =>
    (clash && /در دسترس نیست/.test(clash)) || 'خطا نداد: ' + clash);

  /* --- ۴) سقف درخواست‌های باز --- */
  await login(ZZ, '09120000001');
  const max = ZZ.config.approval.maxOpenRequests;
  /* یکی از سقف قبلاً مصرف شده؛ چند تای دیگر می‌گیریم تا حتماً رد شود */
  const more = freeSlots(ZZ, svc.id, max + 1);
  let limitErr = null;
  let created = 1;
  for (const sl of more) {
    try {
      await A.create({
        serviceId: svc.id, variantId: svc.variants[0].id,
        date: sl.date, time: sl.time
      });
      created++;
    } catch (e) { limitErr = e.message; break; }
  }
  check('سقف درخواست‌های باز رعایت می‌شود', () =>
    (limitErr && /در انتظار تأیید دارید/.test(limitErr)) ||
    'به سقف نخورد (max=' + max + '، ساخته شد=' + created + ') — ' + limitErr);
  check('تعداد درخواست‌های باز از سقف بیشتر نمی‌شود', () =>
    created <= max || 'تعداد شد: ' + created);

  /* --- ۵) تأیید توسط مدیر --- */
  const ok = A.admin.approve(appt.id);
  check('مدیر می‌تواند درخواست را تأیید کند', () =>
    (ok && ok.status === 'confirmed') || 'وضعیت شد: ' + (ok && ok.status));
  check('تأیید دوباره‌ی همان درخواست بی‌اثر است', () =>
    A.admin.approve(appt.id) === null || 'دوباره تأیید شد');
  check('ساعت بعد از تأیید همچنان قفل است', () => {
    const s = A.getSlots(spot.date, svc.id).filter((x) => x.time === appt.time)[0];
    return (s && !s.available && s.reason === 'رزرو شده') || 'وضعیت ساعت درست نیست';
  });

  /* --- ۶) ثبت بیعانه --- */
  const withDep = A.admin.setDeposit(appt.id, { amount: '۵۰۰۰۰۰', method: 'card', ref: '1234' });
  check('بیعانه با عدد فارسی هم درست ثبت می‌شود', () =>
    (withDep.deposit && withDep.deposit.amount === 500000) ||
    'مبلغ شد: ' + (withDep.deposit && withDep.deposit.amount));
  check('روش و کد پیگیری بیعانه ذخیره می‌شود', () =>
    (withDep.deposit.method === 'card' && withDep.deposit.ref === '1234') || 'ناقص ذخیره شد');
  check('برچسب بیعانه برای نمایش ساخته می‌شود', () => {
    const l = A.depositLabel(withDep);
    return (l && l.amount === 500000 && l.method === 'کارت به کارت') || 'برچسب درست نیست';
  });
  check('مبلغ نامعتبر بیعانه رد می‌شود', () => {
    try { A.admin.setDeposit(appt.id, { amount: 'abc' }); return 'خطا نداد'; }
    catch (e) { return /مبلغ/.test(e.message) || 'پیام خطا نامناسب: ' + e.message; }
  });
  check('حذف بیعانه کار می‌کند', () =>
    A.admin.clearDeposit(appt.id).deposit === null || 'حذف نشد');

  /* --- ۷) رد درخواست، ساعت را آزاد می‌کند --- */
  await login(ZZ, '09120000003', 'مشتری سوم');
  const spot2 = openSlot(ZZ, svc.id);
  const req2 = await A.create({
    serviceId: svc.id, variantId: svc.variants[0].id,
    date: spot2.date, time: spot2.times[0]
  });
  const rejected = A.admin.reject(req2.id, 'در این ساعت امکان پذیرش نبود');
  check('مدیر می‌تواند درخواست را رد کند', () =>
    (rejected && rejected.status === 'rejected') || 'وضعیت شد: ' + (rejected && rejected.status));
  check('دلیل رد ذخیره می‌شود', () =>
    rejected.rejectReason === 'در این ساعت امکان پذیرش نبود' || 'دلیل ذخیره نشد');
  check('ساعت بعد از رد شدن دوباره آزاد می‌شود', () => {
    const s = A.getSlots(spot2.date, svc.id).filter((x) => x.time === req2.time)[0];
    return (s && s.available) || 'ساعت آزاد نشد';
  });

  /* --- ۸) لغو توسط مشتری --- */
  const spot3 = openSlot(ZZ, svc.id);
  const req3 = await A.create({
    serviceId: svc.id, variantId: svc.variants[0].id,
    date: spot3.date, time: spot3.times[0]
  });
  let cancelled = null;
  try { cancelled = await A.cancel(req3.id); } catch (e) { cancelled = e.message; }
  check('مشتری می‌تواند درخواست تأییدنشده را هر وقت لغو کند', () =>
    (cancelled && cancelled.status === 'cancelled') || 'نتیجه: ' + cancelled);

  /* --- ۹) غیبت و پیشنهاد بیعانه --- */
  A.admin.markNoShow(appt.id);
  check('غیبت ثبت می‌شود', () =>
    A.getById(appt.id).status === 'no_show' || 'ثبت نشد');
  check('بعد از غیبت، سیستم بیعانه پیشنهاد می‌دهد', () => {
    const h = A.admin.userHistory(user.id);
    return (h.noShow === 1 && h.suggestDeposit === true) ||
           'سابقه: ' + JSON.stringify(h);
  });
  check('مراجعه‌کننده‌ی بدون سابقه «جدید» شناخته می‌شود', () =>
    A.admin.userHistory('nobody').isNew === true || 'isNew غلط است');

  /* --- ۱۰) برچسب‌ها و آمار --- */
  check('هر وضعیت برچسب فارسی دارد', () => {
    const want = {
      pending: 'در انتظار تأیید', rejected: 'رد شده',
      cancelled: 'لغو شده', no_show: 'غیبت', done: 'انجام شده'
    };
    for (const k of Object.keys(want)) {
      const got = A.statusLabel({ status: k, date: '2099-01-01', time: '10:00' }).text;
      if (got !== want[k]) return k + ' → ' + got;
    }
    return true;
  });
  check('آمار پنل شمارش در انتظار و بیعانه دارد', () => {
    const st = A.admin.stats();
    return (typeof st.pending === 'number' && typeof st.deposits === 'number') ||
           'کلیدها نیستند: ' + JSON.stringify(Object.keys(st));
  });
  check('فیلتر «در انتظار تأیید» فقط همان‌ها را می‌دهد', () => {
    const rows = A.admin.listAll({ status: 'pending' });
    return rows.every((r) => r.appt.status === 'pending') || 'وضعیت‌های دیگر هم آمدند';
  });
  check('فیلتر «لغو / رد شده» هر دو را می‌دهد', () => {
    const rows = A.admin.listAll({ status: 'cancelled' });
    const kinds = new Set(rows.map((r) => r.appt.status));
    return (kinds.has('cancelled') && kinds.has('rejected')) ||
           'فقط: ' + [...kinds].join(', ');
  });

  finish();
}

function finish() {
  console.log('');
  if (failures.length) {
    console.log('✗ ' + failures.length + ' تست رد شد (از ' + (passed + failures.length) + ')');
    process.exit(1);
  }
  console.log('همه‌ی ' + passed + ' تست جریان رزرو قبول شدند.');
}

main().catch((e) => {
  console.error('خطای غیرمنتظره:', e);
  process.exit(1);
});
