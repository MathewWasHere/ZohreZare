#!/usr/bin/env node
/* ==========================================================================
   check-catalog.js — بررسی کاتالوگ خدمات

   روی این ماشین نمی‌شود سایت را واقعاً اجرا کرد و دید کارت‌ها درست
   درمی‌آیند یا نه. ولی بیشترِ خرابی‌های کاتالوگ از چند جای مشخص می‌آید
   و همه‌شان را همین‌جا می‌شود گرفت:

     • شناسه یا slug تکراری (آدرس صفحه قاطی می‌شود)
     • تصویر یا آیکونی که وجود ندارد (کارت با تصویر شکسته)
     • کلید بلوک مراقبتی که در service-care.js نیست (صفحه‌ی خدمت
       بدون متن مراقبت می‌ماند)
     • خدمت PMU بدون فهرست بیماری‌های ممنوعه
     • نام پیامکی بلند (هزینه‌ی پیامک را یک بخش بالا می‌برد)
     • گزینه‌های بدون قیمت یا مدت

   اجرا:  node tools/check-catalog.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'assets', 'js', 'data');

const problems = [];
const notes = [];

/* ---------------- بارگذاری همان‌طور که مرورگر می‌بیند ---------------- */

function load() {
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  for (const file of ['service-care.js', 'services.js']) {
    vm.runInContext(
      fs.readFileSync(path.join(DATA, file), 'utf8'),
      sandbox,
      { filename: file }
    );
  }
  return sandbox.window.ZZ;
}

let ZZ;
try {
  ZZ = load();
} catch (e) {
  console.error('بارگذاری خدمات ناموفق بود:', e.message);
  process.exit(1);
}

const services = ZZ.services.getAll();
const care = ZZ.care || {};

/* ---------------- آیکون‌های موجود ---------------- */

const iconSrc = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'ui', 'icons.js'), 'utf8');
const iconNames = new Set(
  (iconSrc.match(/^\s{4}([A-Za-z][A-Za-z0-9]*):\s/gm) || [])
    .map((m) => m.trim().replace(':', ''))
);

/* ---------------- بررسی ---------------- */

/** آیا این متن برای پیامک یک بخش را پر نمی‌کند؟ (۷۰ کاراکتر بخش اول) */
function smsSegments(name) {
  const n = name.length;
  if (n <= 70) return 1;
  return 1 + Math.ceil((n - 70) / 67);
}

const seenIds = new Map();
const seenSlugs = new Map();

services.forEach((s, i) => {
  const at = `خدمت ${i + 1} (${s.id || 'بی‌شناسه'})`;

  ['id', 'slug', 'title', 'short', 'image', 'icon'].forEach((f) => {
    if (!s[f] || String(s[f]).trim() === '') {
      problems.push(`${at}: فیلد ${f} خالی است.`);
    }
  });

  if (seenIds.has(s.id)) problems.push(`${at}: شناسه‌ی تکراری با «${seenIds.get(s.id)}».`);
  seenIds.set(s.id, s.title);

  if (seenSlugs.has(s.slug)) problems.push(`${at}: slug تکراری با «${seenSlugs.get(s.slug)}».`);
  seenSlugs.set(s.slug, s.title);

  /* تصویر باید واقعاً روی دیسک باشد */
  if (s.image && !fs.existsSync(path.join(ROOT, s.image))) {
    problems.push(`${at}: فایل تصویر پیدا نشد — ${s.image}`);
  }

  /* آیکون باید در icons.js باشد، وگرنه کارت بی‌آیکون می‌ماند */
  if (s.icon && iconNames.size && !iconNames.has(s.icon)) {
    problems.push(`${at}: آیکون «${s.icon}» در icons.js نیست.`);
  }

  if (!(s.durationMin > 0)) problems.push(`${at}: مدت‌زمان کل نامعتبر است.`);
  if (!(s.priceFrom > 0)) problems.push(`${at}: قیمت شروع نامعتبر است.`);

  /* گزینه‌ها */
  const vIds = new Set();
  if (!Array.isArray(s.variants) || !s.variants.length) {
    problems.push(`${at}: هیچ گزینه‌ای ندارد.`);
  } else {
    s.variants.forEach((v) => {
      if (!v.id || vIds.has(v.id)) {
        problems.push(`${at}: شناسه‌ی گزینه‌ی تکراری یا خالی «${v.id}».`);
      }
      vIds.add(v.id);
      if (!v.name || String(v.name).trim() === '') problems.push(`${at}: گزینه‌ی «${v.id}» نام ندارد.`);
      if (!(v.price > 0)) problems.push(`${at}: گزینه‌ی «${v.id}» قیمت ندارد.`);
      if (!(v.durationMin > 0)) problems.push(`${at}: گزینه‌ی «${v.id}» مدت ندارد.`);
    });

    /* قیمت روی کارت باید همان گزینه‌ی اول باشد، وگرنه عدد نمایش‌داده‌شده
       با اولین سطر جدول قیمت نمی‌خواند. */
    if (s.variants[0].price !== s.priceFrom) {
      notes.push(`${at}: «از ${s.priceFrom}» با گزینه‌ی اول (${s.variants[0].price}) یکی نیست.`);
    }
  }

  /* محتوای صفحه */
  ['description', 'includes', 'goodFor'].forEach((f) => {
    if (!Array.isArray(s[f]) || !s[f].length) problems.push(`${at}: فهرست ${f} خالی است.`);
  });

  if (Array.isArray(s.faq)) {
    s.faq.forEach((f, fi) => {
      if (!f || !f.q || !f.a) problems.push(`${at}: پرسش ${fi + 1} ناقص است (پرسش یا پاسخ خالی).`);
    });
  } else {
    problems.push(`${at}: فهرست پرسش‌های متداول نیست.`);
  }

  /* بلوک مراقبتی مشترک */
  if (!s.care) {
    notes.push(`${at}: بلوک مراقبتی (care) انتخاب نشده — صفحه بدون مراقبت می‌ماند.`);
  } else if (!care[s.care]) {
    problems.push(`${at}: بلوک مراقبتی «${s.care}» در service-care.js نیست.`);
  } else {
    const b = care[s.care];
    if (!Array.isArray(b.pre) || !b.pre.length) problems.push(`${at}: بلوک «${s.care}» مراقبت قبل ندارد.`);
    if (!Array.isArray(b.post) || !b.post.length) problems.push(`${at}: بلوک «${s.care}» مراقبت بعد ندارد.`);
  }

  /* خدمت رنگ‌دانه‌ای باید فهرست ممنوعه‌ها را داشته باشد */
  if (s.pmu) {
    if (!care.pmu || !Array.isArray(care.pmu.items) || !care.pmu.items.length) {
      problems.push(`${at}: خدمت PMU است ولی فهرست بیماری‌های ممنوعه خالی است.`);
    }
    if (care.pmu && !care.pmu.note) {
      notes.push(`${at}: جمله‌ی هشدار زیر فهرست ممنوعه‌ها خالی است.`);
    }
  }

  /* نام پیامکی: هر بخش اضافه یعنی هزینه‌ی بیشتر */
  const smsName = s.smsName || s.title || '';
  if (smsName.length > 70) {
    problems.push(`${at}: نام پیامکی ${smsName.length} کاراکتر است و پیامک را دو بخشی می‌کند.`);
  } else if (smsSegments(smsName) > 1) {
    notes.push(`${at}: نام پیامکی بلند است (${smsName.length} کاراکتر).`);
  }
  if (s.smsName && s.smsName.length > 30) {
    notes.push(`${at}: نام پیامکی «${s.smsName}» بلند است؛ کوتاه‌ترش هزینه را پایین نگه می‌دارد.`);
  }
});

/* ---------------- نتیجه ---------------- */

const variantCount = services.reduce((n, s) => n + (s.variants || []).length, 0);
console.log(`کاتالوگ: ${services.length} خدمت، ${variantCount} گزینه`);
services.forEach((s) => {
  console.log(`  • ${s.title}  (${(s.variants || []).length} گزینه` +
    `، از ${Number(s.priceFrom).toLocaleString('fa-IR')} تومان)`);
});

if (notes.length) {
  console.log('\nنکته‌ها:');
  notes.forEach((n) => console.log('   -', n));
}

if (problems.length) {
  console.log('\n!! مشکلات:');
  problems.forEach((p) => console.log('   -', p));
  process.exit(1);
}

console.log('\nکاتالوگ خدمات سالم است ✓');
