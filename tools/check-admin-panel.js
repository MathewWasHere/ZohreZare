#!/usr/bin/env node
/* ==========================================================================
   check-admin-panel.js — تست دود پنل مدیریت
   ماژول‌های واقعی سایت را در Node بار می‌کند (با DOM ساختگی مینیمال)
   و رندر پنل را برای هر سه بخش بررسی می‌کند: پوسته (dock/سایدبار)،
   کارت‌های نوبت، تقویم شمسی و بازه‌های روز.

   اجرا:  node tools/check-admin-panel.js
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

  /* DOM ساختگی — فقط آنچه پنل واقعاً لازم دارد */
  const docListeners = {};
  const root = {
    innerHTML: '',
    addEventListener() {},
    classList: { add() {}, remove() {}, toggle() {} }
  };

  const doc = {
    addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
    removeEventListener() {},
    querySelector(sel) { return sel === '#adminRoot' ? root : null; },
    querySelectorAll() { return []; },
    createElement() {
      return { className: '', innerHTML: '', appendChild() {}, remove() {},
               setAttribute() {}, addEventListener() {} };
    },
    body: { classList: { add() {}, remove() {} }, appendChild() {}, contains: () => false },
    contains: () => false,
    activeElement: null,
    visibilityState: 'visible',
    documentElement: { lang: 'fa' }
  };

  const winListeners = {};
  const win = {
    localStorage,
    document: doc,
    navigator: { userAgent: 'node' },
    location: { href: '', search: '', hash: '' },
    history: { replaceState() {} },
    addEventListener(type, fn) { (winListeners[type] = winListeners[type] || []).push(fn); },
    dispatchEvent(ev) {
      (winListeners[ev.type] || []).forEach((fn) => fn(ev));
    },
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

  return { win, root, docListeners };
}

function load(win, ...files) {
  const ctx = vm.createContext(win);
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  return win.ZZ;
}

/**
 * ساخت یک «صفحه‌ی» تازه: ورود مدیر، اجرای seed اختیاری روی داده‌ها،
 * و بعد روشن‌کردن DOMContentLoaded تا پنل رندر شود.
 */
function boot(url, seed) {
  const env = makeWindow();
  /* url می‌تواند '#days' یا '?tab=days&filter=cancelled' باشد */
  if (url && url[0] === '?') env.win.location.search = url;
  else env.win.location.hash = url || '';

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

  /* پوسته و پیام — خارج از تست دود */
  ZZ.shell = function () {};
  ZZ.toast = { ok() {}, error() {}, info() {} };

  /* ثبت‌کننده‌ی گفت‌وگوها — مطمئن می‌شویم dialog به‌جای بومی‌ها آمده */
  const dialogs = [];
  ZZ.dialog = {
    confirm(o) { dialogs.push({ kind: 'confirm', o }); return Promise.resolve(true); },
    open(o) { dialogs.push({ kind: 'open', o }); return Promise.resolve(false); }
  };

  load(env.win, 'assets/js/pages/admin.js');

  /* ورود مدیر (شماره‌ی تعریف‌شده در config) */
  return ZZ.auth.requestCode('09178399055')
    .then(() => ZZ.auth.verifyCode('1234'))
    .then(() => {
      if (seed) seed(ZZ);
      (env.docListeners['DOMContentLoaded'] || []).forEach((fn) => fn({}));
      return { env, ZZ, dialogs };
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

/* شماره‌ی روز هفته‌ی فارسی: شنبه=۰ … جمعه=۶ */
function pWeek(d) { return (d.getDay() + 1) % 7; }

/** اولین روز/ساعت‌های واقعاً آزاد برای یک خدمت */
function openSlots(ZZ, serviceId, n) {
  const out = [];
  for (const d of ZZ.appointments.getDays(20)) {
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

/* ---------------- تست‌ها ---------------- */

async function main() {
  /* ============ ۱) پوسته بدون داده ============ */
  {
    const { env, ZZ } = await boot('');
    const html = () => env.root.innerHTML;

    check('پوسته: dock موبایل و سایدبار دسکتاپ هر دو رندر می‌شوند', () =>
      (html().includes('admin-dock') && html().includes('admin-side')) || 'dock/side نیست');

    check('پوسته: شش دکمه‌ی tab (۳ سایدبار + ۳ dock) با aria-selected', () => {
      const n = count(html(), 'role="tab"');
      return n === 6 || 'role=tab باید ۶ باشد ولی ' + n + ' بود';
    });

    check('پوسته: پنل فعال «نوبت‌ها» است و بقیه hidden', () =>
      (html().includes('id="panel-appointments"') &&
       !/<section class="admin-panel" id="panel-appointments"[^>]*hidden/.test(html()) &&
       /id="panel-days"[^>]*hidden/.test(html()) &&
       /id="panel-services"[^>]*hidden/.test(html())) || 'وضعیت hidden پنل‌ها درست نیست');

    check('پوسته: کارت‌های آمار کلیک‌پذیر با data-goto', () =>
      (html().includes('data-goto="appointments:pending"') &&
       html().includes('data-goto="days:today"') &&
       html().includes('data-goto="appointments:upcoming"')) || 'data-goto ندارد');

    check('پوسته: جست‌وجو با آیکون و aria-label', () =>
      (html().includes('id="searchInput"') &&
       html().includes('aria-label="جست‌وجو در نوبت‌ها"')) || 'search نیست');

    check('پوسته: حالت خالی نوبت‌ها با راهنمای فارسی', () =>
      html().includes('نوبتی پیدا نشد') || 'حالت خالی نیست');

    check('پوسته: هیچ prompt/confirm بومی در کد پنل نمانده', () => {
      let src = fs.readFileSync(path.join(ROOT, 'assets/js/pages/admin.js'), 'utf8');
      src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      /* ZZ.dialog.confirm مجاز است؛ فراخوانیِ خالی confirm() نه */
      return !/(^|[^.\w])(prompt|confirm|alert)\s*\(/.test(src) ||
        'هنوز prompt/confirm/alert بومی هست';
    });

    check('پوسته: فیلترها با aria-pressed و فیلتر پیش‌فرض «در انتظار»', () =>
      (html().includes('data-filter="pending" aria-pressed="true"') &&
       count(html(), 'class="fchip') === 5) || 'فیلترها درست نیست');
  }

  /* ============ ۲) نوبت‌ها با داده ============ */
  {
    const makeAppt = (ZZ, id, over) => {
      const svc = ZZ.services.getAll()[0];
      const slots = openSlots(ZZ, svc.id, 1);
      return Object.assign({
        id, userId: ZZ.auth.currentUser().id,
        serviceId: svc.id, variantId: svc.variants[0].id,
        date: slots[0].date, time: slots[0].time,
        durationMin: svc.variants[0].durationMin, price: svc.variants[0].price,
        status: 'pending', note: '', deposit: null,
        createdAt: Date.now()
      }, over || {});
    };

    /* --- دو درخواست در انتظار --- */
    const seedPending = (ZZ) => {
      ZZ.store.set('appointments', [
        makeAppt(ZZ, 'apt1', { note: 'تست', createdAt: Date.now() - 1000 }),
        makeAppt(ZZ, 'apt2')
      ]);
    };

    {
      const { env, ZZ } = await boot('', seedPending);
      const html = () => env.root.innerHTML;

      check('نوبت‌ها: کارت درخواستِ در انتظار با دکمه‌های تماس/تأیید/رد', () =>
        (html().includes('data-approve="apt1"') &&
         html().includes('data-reject="apt1"') &&
         html().includes('href="tel:+98')) || 'دکمه‌های عملیات نیست');

      check('نوبت‌ها: شمارنده‌ی در انتظار روی dock و فیلتر', () =>
        (html().includes('count-badge') && html().includes('count-dot')) || 'شمارنده نیست');

      check('نوبت‌ها: بعد از رد، درخواست از صف در انتظار می‌رود و شمارنده کم می‌شود', () => {
        ZZ.appointments.admin.reject('apt2', 'ظرفیت این روز تکمیل است');
        env.win.dispatchEvent({ type: 'zz:refresh' });
        const gone = !html().includes('data-approve="apt2"');
        const one = /count-badge[^>]*>۱</.test(html()) || /count-dot[^>]*>۱</.test(html());
        return (gone && one) || 'رد از صف حذف نشد یا شمارنده به‌روز نشد';
      });
    }

    /* --- درخواست ردشده با دلیل (فیلتر لغو/رد شده) --- */
    {
      const seedRejected = (ZZ) => {
        ZZ.store.set('appointments', [
          makeAppt(ZZ, 'aptR', {
            status: 'rejected',
            rejectReason: 'ظرفیت این روز تکمیل است',
            decidedAt: Date.now(), decidedBy: 'admin'
          })
        ]);
      };
      const { env } = await boot('?filter=cancelled', seedRejected);
      const h = env.root.innerHTML;

      check('نوبت‌ها: دلیل رد روی کارت نمایش داده می‌شود', () =>
        (h.includes('admin-appt--rejected') &&
         h.includes('ظرفیت این روز تکمیل است')) || 'دلیل رد نمایش داده نشد');

      check('نوبت‌ها: فیلتر از پارامتر آدرس خوانده می‌شود (لینک مستقیم)', () =>
        h.includes('data-filter="cancelled" aria-pressed="true"') || 'فیلتر cancelled فعال نیست');
    }

    /* --- نوبت تأییدشده با بیعانه (فیلتر تأییدشده) --- */
    {
      const seedConfirmed = (ZZ) => {
        ZZ.store.set('appointments', [
          makeAppt(ZZ, 'apt1', {
            status: 'confirmed',
            decidedAt: Date.now(), decidedBy: 'admin',
            deposit: { amount: 500000, method: 'card', ref: '1234', paidAt: Date.now() }
          })
        ]);
      };
      const { env } = await boot('?filter=upcoming', seedConfirmed);
      const h = env.root.innerHTML;

      check('نوبت‌ها: بیعانه‌ی ثبت‌شده روی کارت دیده می‌شود', () =>
        h.includes('dep-chip') || 'بیعانه نمایش داده نشد');

      check('نوبت‌ها: نوبت قطعی دکمه‌ی لغو دارد (بدون محدودیت ۲۴ ساعته)', () =>
        h.includes('data-cancel="apt1"') || 'دکمه‌ی لغو نیست');
    }
  }

  /* ============ ۳) تقویم روزها ============ */
  {
    const seed = (ZZ) => {
      const user = ZZ.auth.currentUser();
      const svc = ZZ.services.getAll()[0];
      /* نوبت امروز ساعت ۱۰ (گذشته هم باشد، برای برنامه‌ی روز دیده می‌شود) */
      ZZ.store.set('appointments', [{
        id: 'aptT', userId: user.id,
        serviceId: svc.id, variantId: svc.variants[0].id,
        date: ZZ.u.dateKey(new Date()), time: '10:00',
        durationMin: 90, price: svc.variants[0].price,
        status: 'confirmed', note: '', deposit: null,
        createdAt: Date.now()
      }]);
    };

    const { env, ZZ } = await boot('#days', seed);
    const html = () => env.root.innerHTML;

    check('روزها: تقویم ماهانه با ناوبری ماه رندر می‌شود', () =>
      (html().includes('cal-card') && html().includes('data-cal="1"') &&
       html().includes('data-cal="-1"')) || 'تقویم/ناوبری نیست');

    check('روزها: سرِ هفته‌ی هفت‌ستونه (شنبه تا جمعه)', () => {
      const m = html().match(/cal-grid--head[\s\S]*?<\/div>/);
      return (!!m && ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']
        .every((w) => m[0].includes('>' + w + '<'))) || 'روزهای هفته درست نیست';
    });

    check('روزها: خانه‌های ماه اول کامل است (روزها + خالی‌های ابتدای ماه)', () => {
      const days = ZZ.appointments.getDays(60);
      const lead = pWeek(days[0].date);
      /* تعداد روزهای ماهِ شمسیِ اول */
      const fmt = new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric', month: 'numeric' });
      const keyOf = (d) => {
        const p = fmt.formatToParts(d);
        return p.find((x) => x.type === 'year').value + '-' + p.find((x) => x.type === 'month').value;
      };
      const k0 = keyOf(days[0].date);
      const inFirst = days.filter((d) => keyOf(d.date) === k0).length;
      const btns = count(html(), 'data-day=');
      const blanks = count(html(), 'cal-cell--blank');
      return (btns === inFirst && blanks === lead) ||
        'انتظار ' + inFirst + ' روز و ' + lead + ' خالی؛ بود ' + btns + ' و ' + blanks;
    });

    check('روزها: امروز به‌صورت پیش‌فرض انتخاب است', () => {
      const todayKey = ZZ.u.dateKey(new Date());
      return (html().includes('data-day="' + todayKey + '"') &&
              html().includes('is-selected')) || 'امروز انتخاب نشده';
    });

    check('روزها: بازه‌ی رزروشده‌ی امروز با لینک تماس', () => {
      const m = html().match(/<a class="admin-slot is-booked"[^>]*href="tel:\+98[^"]*"/);
      return !!m || 'لینک tel روی بازه‌ی رزروشده نیست';
    });

    check('روزها: دکمه‌ی تعطیل/باز کردن روز', () =>
      html().includes('data-toggle-day') || 'دکمه‌ی تعطیل نیست');

    check('روزها: تعطیل کردن روز در تقویم علامت می‌خورد', () => {
      const days = ZZ.appointments.getDays(60).filter((d) => !d.closed);
      const target = days.find((d) => d.key !== ZZ.u.dateKey(new Date()));
      ZZ.appointments.admin.toggleDay(target.key);
      env.win.dispatchEvent({ type: 'zz:refresh' });
      const re = new RegExp('data-day="' + target.key + '"[^>]*is-closed|is-closed[^>]*data-day="' + target.key + '"');
      const ok = re.test(html());
      ZZ.appointments.admin.toggleDay(target.key); // برگرداندن
      return ok || 'خانه‌ی تعطیل علامت نخورد';
    });

    check('روزها: راهنمای فارسی پایین بازه‌ها هست', () =>
      html().includes('admin-hint') || 'راهنما نیست');
  }

  /* ============ ۴) خدمات ============ */
  {
    const { env } = await boot('#services');
    const h = env.root.innerHTML;
    check('خدمات: در حالت محلی، حالت خالی به‌جای خطا', () =>
      h.includes('svc-editor') || h.includes('empty') || 'تب خدمات رندر نشد');
  }

  console.log('');
  if (failures.length) {
    console.log('✗ ' + failures.length + ' تست رد شد:');
    failures.forEach((f) => console.log('  • ' + f));
    process.exit(1);
  }
  console.log('همه‌ی ' + passed + ' تست پنل مدیریت قبول شدند.');
}

main().catch((e) => {
  console.error('خطای اجرای تست:', e);
  process.exit(1);
});
