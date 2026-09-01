#!/usr/bin/env node
/* ==========================================================================
   check-jalali.js — درستی تقویم شمسی سرور

   سرور تاریخ شمسی را خودش می‌سازد (api/lib/jalali.php) چون افزونه‌ی
   intl روی هاست‌های اشتراکی همیشه نصب نیست. ولی مرورگر همان تاریخ را
   با Intl می‌سازد. اگر این دو یکی نباشند، کاربر روی تقویم «۴ مرداد»
   می‌بیند و در پیامک یا صفحه‌ی حساب «۵ مرداد» — بدترین نوع باگ،
   چون بی‌سر‌و‌صداست.

   این ابزار الگوریتم PHP را از روی خود فایل می‌خواند، به JS ترجمه
   می‌کند و خروجی‌اش را روز‌به‌روز با Intl مقایسه می‌کند.

   اجرا:  node tools/check-jalali.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'api', 'lib', 'jalali.php'), 'utf8');

/* ------------------------------------------------------------------
   ترجمه‌ی تابع fromGregorian از PHP به JS

   به‌جای بازنویسی دستی (که می‌تواند با اصل فرق کند و تست را بی‌معنا
   کند)، بدنه‌ی همان تابع را از فایل PHP بیرون می‌کشیم و با چند
   جایگزینی نحوی اجرا می‌کنیم. این‌طور واقعاً همان کدی تست می‌شود که
   روی سرور اجرا خواهد شد.
   ------------------------------------------------------------------ */

function extractBody(fnName) {
  const start = SRC.indexOf('function ' + fnName);
  if (start < 0) throw new Error('تابع ' + fnName + ' در jalali.php پیدا نشد');

  const open = SRC.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    if (SRC[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return SRC.slice(open + 1, end);
}

function toJs(body) {
  return body
    /* کامنت‌های فارسی را نگه می‌داریم؛ نحوشان در JS هم معتبر است */
    .replace(/\$(\w+)/g, '$1')            // $days → days
    .replace(/\(int\)\s*\(/g, 'Math.trunc(')
    .replace(/\(int\)\s*/g, 'Math.trunc')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/return \[([^\]]+)\];/g, 'return [$1];')
    /* اعلان متغیرها: PHP نیازی ندارد، JS دارد */
    ;
}

/** ساخت تابع اجرایی از بدنه‌ی PHP */
function build(fnName, args) {
  const js = toJs(extractBody(fnName));
  /* همه‌ی متغیرهای بدون اعلان را global موقت می‌کنیم */
  const names = [...new Set((js.match(/\b([a-z]\w*)\s*(?:=|\+=|-=|%=)/g) || [])
    .map((s) => s.replace(/\s*(?:=|\+=|-=|%=)\s*$/, '').trim()))]
    .filter((n) => !args.includes(n) && !['Math', 'return'].includes(n));

  const preamble = names.length ? 'let ' + names.join(', ') + ';\n' : '';
  // eslint-disable-next-line no-new-func
  return new Function(...args, preamble + js);
}

let fromGregorian;
let toGregorian;
try {
  fromGregorian = build('fromGregorian', ['gy', 'gm', 'gd']);
  toGregorian = build('toGregorian', ['jy', 'jm', 'jd']);
} catch (e) {
  console.log('✗ ترجمه‌ی الگوریتم از PHP ناموفق بود: ' + e.message);
  process.exit(1);
}

/* ------------------------------------------------------------------
   مرجع: Intl — همان چیزی که مرورگر کاربر نشان می‌دهد
   ------------------------------------------------------------------ */

const fmt = new Intl.DateTimeFormat('en-u-ca-persian', {
  year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC'
});

function intlJalali(d) {
  const parts = fmt.formatToParts(d);
  const get = (t) => parseInt(parts.find((p) => p.type === t).value, 10);
  return [get('year'), get('month'), get('day')];
}

/* ------------------------------------------------------------------
   تست‌ها
   ------------------------------------------------------------------ */

let checked = 0;
let bad = 0;
const samples = [];

/* ۱) هر روز از ۲۰۲۴ تا ۲۰۲۹ — بازه‌ای که سایت واقعاً در آن کار می‌کند */
const start = Date.UTC(2024, 0, 1);
const end = Date.UTC(2029, 11, 31);

for (let t = start; t <= end; t += 86400000) {
  const d = new Date(t);
  const mine = fromGregorian(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  const ref = intlJalali(d);
  checked++;

  if (mine[0] !== ref[0] || mine[1] !== ref[1] || mine[2] !== ref[2]) {
    bad++;
    if (samples.length < 5) {
      samples.push(
        d.toISOString().slice(0, 10) +
        '  ما: ' + mine.join('/') + '   Intl: ' + ref.join('/')
      );
    }
  }
}

console.log('  • ' + checked.toLocaleString('en-US') +
            ' روز با Intl مقایسه شد (۲۰۲۴ تا ۲۰۲۹)');

if (bad) {
  console.log('  ✗ ' + bad + ' روز اختلاف دارد:');
  samples.forEach((s) => console.log('      ' + s));
} else {
  console.log('  • تبدیل میلادی → شمسی کاملاً منطبق است');
}

/* ۲) رفت و برگشت: شمسی → میلادی → شمسی */
let rtBad = 0;
let rtChecked = 0;
for (let t = start; t <= end; t += 86400000 * 7) {
  const d = new Date(t);
  const j = fromGregorian(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  const g = toGregorian(j[0], j[1], j[2]);
  rtChecked++;
  if (g[0] !== d.getUTCFullYear() || g[1] !== d.getUTCMonth() + 1 ||
      g[2] !== d.getUTCDate()) {
    rtBad++;
    if (rtBad <= 3) {
      console.log('  ✗ رفت‌وبرگشت خراب: ' + d.toISOString().slice(0, 10) +
                  ' → ' + j.join('/') + ' → ' + g.join('/'));
    }
  }
}
if (!rtBad) {
  console.log('  • رفت‌وبرگشت شمسی↔میلادی روی ' + rtChecked + ' تاریخ سالم است');
}

/* ۳) نام روزهای هفته: اندیس date('w') باید درست نگاشت شود */
const WEEK_PHP = (SRC.match(/const WEEKDAYS = \[([\s\S]*?)\];/) || [])[1] || '';
const weekdays = (WEEK_PHP.match(/'([^']+)'/g) || []).map((s) => s.replace(/'/g, ''));
const EXPECTED_WEEK = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

let weekBad = 0;
EXPECTED_WEEK.forEach((name, i) => {
  if (weekdays[i] !== name) {
    weekBad++;
    console.log('  ✗ روز هفته‌ی اندیس ' + i + ': «' + weekdays[i] +
                '» باید «' + name + '» باشد');
  }
});
if (!weekBad) {
  console.log('  • نگاشت روزهای هفته درست است (۰ = یکشنبه)');
}

/* ۴) ماه‌ها */
const MON_PHP = (SRC.match(/const MONTHS = \[([\s\S]*?)\];/) || [])[1] || '';
const months = (MON_PHP.match(/'([^']+)'/g) || []).map((s) => s.replace(/'/g, ''));
const EXPECTED_MON = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
                      'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
let monBad = 0;
EXPECTED_MON.forEach((name, i) => {
  if (months[i] !== name) {
    monBad++;
    console.log('  ✗ ماه ' + (i + 1) + ': «' + months[i] + '» باید «' + name + '» باشد');
  }
});
if (!monBad) console.log('  • نام ۱۲ ماه شمسی درست است');

/* ۵) کبیسه: تعداد روزهای اسفند با Intl بخواند */
let leapBad = 0;
for (let jy = 1400; jy <= 1420; jy++) {
  /* اگر ۳۰ اسفند وجود داشته باشد، سال کبیسه است */
  const g = toGregorian(jy, 12, 30);
  const back = fromGregorian(g[0], g[1], g[2]);
  const isLeapByRoundTrip = back[1] === 12 && back[2] === 30;

  const r = jy % 33;
  const isLeapByRule = [1, 5, 9, 13, 17, 22, 26, 30].includes(r);

  if (isLeapByRoundTrip !== isLeapByRule) {
    leapBad++;
    console.log('  ✗ سال ' + jy + ': قاعده‌ی کبیسه با تقویم نمی‌خواند');
  }
}
if (!leapBad) console.log('  • قاعده‌ی سال کبیسه برای ۱۴۰۰ تا ۱۴۲۰ درست است');

/* ---------------- نتیجه ---------------- */

const total = bad + rtBad + weekBad + monBad + leapBad;
console.log('');
if (total) {
  console.log(total + ' مشکل در تقویم شمسی سرور ✗');
  process.exit(1);
}
console.log('تقویم شمسی سرور با مرورگر یکی است ✓');
process.exit(0);
