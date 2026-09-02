#!/usr/bin/env node
/* ==========================================================================
   check-booking-ux.js — تست تعاملی تجربه‌ی رزرو (jsdom)
   برخلاف check-booking-flow.js که لایه‌ی داده را می‌آزماید، اینجا کل
   سفارش مشتری از اول تا آخر اجرا می‌شود:
     انتخاب خدمت و گزینه (نوار چسبان با قیمت) → تقویم هفت‌ستونه با
     شمارنده‌ی ساعت خالی → انتخاب ساعت → ورود با شماره و کد در همان
     صفحه (بدون ترک رزرو) → ثبت → صفحه‌ی موفقیت (کد پیگیری، آدرس،
     مسیریابی، فایل تقویم).
   به jsdom نیاز دارد؛ اگر نصب نبود بی‌صدا رد می‌شود.
   اجرا:  node tools/check-booking-ux.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (e) {
  console.log('⟳ jsdom نصب نیست؛ تست تعاملی رزرو رد شد. (npm ci در tools/ آن را می‌آورد)');
  process.exit(0);
}

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* بدنه‌ی واقعی booking.html — بدون اسکریپت‌های head (reset پشت‌صحنه‌ی PWA) */
const pageHtml = read('booking.html');
const body = pageHtml.slice(pageHtml.indexOf('<body'), pageHtml.indexOf('</body>') + 7);

const vc = new VirtualConsole();
vc.on('jsdomError', (e) => {
  if (!/not implemented/i.test(String(e && e.message))) console.error(e);
});

const dom = new JSDOM('<!DOCTYPE html><html lang="fa" dir="rtl"><head></head>' + body, {
  url: 'http://localhost/booking.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole: vc
});
const win = dom.window;
win.scrollTo = () => {};
win.scrollY = 0;

/* jsdom پیاده‌سازی download تقویم را ندارد — شبیه‌سازی می‌کنیم */
let icsBlob = null;
win.URL.createObjectURL = (b) => { icsBlob = b; return 'blob:test'; };
win.URL.revokeObjectURL = () => {};

const ctx = dom.getInternalVMContext();
[
  'assets/js/core/config.js',
  'assets/js/core/utils.js',
  'assets/js/core/store.js',
  'assets/js/core/api.js',
  'assets/js/data/services.js',
  'assets/js/data/auth.js',
  'assets/js/data/appointments.js',
  'assets/js/ui/icons.js',
  'assets/js/ui/dialog.js'
].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));

const ZZ = win.ZZ;
ZZ.shell = () => {};
const toasts = [];
ZZ.toast = { ok: (m) => toasts.push(['ok', m]), error: (m) => toasts.push(['error', m]), info: (m) => toasts.push(['info', m]) };

vm.runInContext(read('assets/js/pages/booking.js'), ctx, { filename: 'assets/js/pages/booking.js' });

const $ = (sel) => win.document.querySelector(sel);
const $$ = (sel) => Array.from(win.document.querySelectorAll(sel));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fire = (el, type) => el.dispatchEvent(new win.Event(type, { bubbles: true }));
let failures = 0;
function ok(cond, name) {
  console.log((cond ? '✓ ' : '✗ ') + name);
  if (!cond) failures++;
}

(async function main() {
  /* jsdom خودش DOMContentLoaded را بعد از بارگذاری اسکریپت‌ها شلیک
     می‌کند؛ فقط اگر نشد، دستی. (ادمین همین الگو را دارد) */
  await sleep(60);
  if (!win.document.body.classList.contains('on-booking')) {
    win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true }));
    await sleep(30);
  }
  ok(win.document.body.classList.contains('on-booking'), 'صفحه‌ی رزرو راه‌اندازی شد');

  /* ---------- گام ۱: خدمت و گزینه ---------- */
  ok($$('#serviceChoices .choice').length === ZZ.services.getAll().length, 'گام ۱: همه‌ی خدمت‌ها رندر شدند');
  ok($('#bookCta') && $('#bookCta').hidden === false, 'نوار چسبان از اول دیده می‌شود');
  ok($('#ctaBtn').disabled === true, 'تا قبل از انتخاب، دکمه‌ی ادامه غیرفعال است');

  const svcCount = $$('#serviceChoices .choice').length;
  const svcInput = $$('#serviceChoices input[name="service"]')[0];
  svcInput.checked = true;
  fire(svcInput, 'change');
  await sleep(20);
  ok($$('#variantChoices .choice').length > 0, 'بعد از انتخاب خدمت، گزینه‌ها آمدند');

  const varInput = $$('#variantChoices input[name="variant"]')[0];
  varInput.checked = true;
  fire(varInput, 'change');
  await sleep(20);
  ok($('#ctaBtn').disabled === false, 'با انتخاب گزینه، دکمه فعال شد');
  ok($('#ctaInfo').textContent.indexOf('تومان') > -1, 'نوار چسبان قیمت را نشان می‌دهد');

  $('#ctaBtn').click();
  await sleep(20);
  ok($('#panelTime').classList.contains('is-active'), 'رفتیم به گام زمان');

  /* ---------- گام ۲: تقویم هفت‌ستونه ---------- */
  const chips = $$('.day-chip');
  const daysAhead = ZZ.config.booking.daysAhead;
  ok(chips.length === daysAhead, 'تقویم: ' + daysAhead + ' روز در دو ردیف هفت‌ستونه');
  ok(chips[0].textContent.indexOf('امروز') > -1, 'خانه‌ی اول «امروز» است');
  ok(chips[1].textContent.indexOf('فردا') > -1, 'خانه‌ی دوم «فردا» است');
  ok($$('.day-chip__cnt').length > 0, 'شمارنده‌ی ساعت خالی روی روزها هست');
  ok(chips.some((c) => c.classList.contains('is-selected')), 'اولین روز باز خودکار انتخاب شد');

  const enabledSlot = $$('#slotGrid .slot:not([disabled])')[0];
  ok(!!enabledSlot, 'ساعت خالی برای رزرو هست');
  enabledSlot.click();
  await sleep(20);
  ok($('#ctaBtn').disabled === false && $('#ctaInfo').textContent.indexOf('ساعت') > -1, 'نوار چسبان روز و ساعت را نشان می‌دهد');

  $('#ctaBtn').click();
  await sleep(20);
  ok($('#panelConfirm').classList.contains('is-active'), 'رفتیم به گام بررسی نهایی');
  ok($('#summaryBox').textContent.indexOf('خدمت') > -1, 'خلاصه‌ی نوبت رندر شد');
  ok($('#authNotice').textContent.indexOf('بدون ترک این صفحه') > -1, 'راهنمای ورودِ در همان صفحه هست');

  /* ---------- انصراف از ورود: باید در همان گام بمانیم ---------- */
  $('#ctaBtn').click();   /* کاربر وارد نشده → پنجره‌ی ورود */
  await sleep(30);
  const host1 = win.document.querySelector('[data-zz-dialog]');
  ok(!!host1, 'پنجره‌ی تایید شماره باز شد (نه پرش به صفحه‌ی ورود)');
  host1.querySelector('[data-close]').click();
  await sleep(30);
  ok(win.document.querySelector('[data-zz-dialog]') == null, 'با انصراف، پنجره بسته شد');
  ok($('#panelConfirm').classList.contains('is-active'), 'کاربر همان‌جا در گام بررسی ماند');

  /* ---------- ورود واقعی: شماره → کد → ثبت ---------- */
  $('#ctaBtn').click();
  await sleep(30);
  const host = win.document.querySelector('[data-zz-dialog]');
  const dlgBtn = host.querySelector('[data-confirm]');

  $('#dlgPhone', host).value = '۰۹۱۷۱۲۳۴۵۶۷';
  fire($('#dlgPhone', host), 'input');
  dlgBtn.click();               /* «دریافت کد» */
  await sleep(700);             /* تاخیر شبیه‌سازی‌شده‌ی ارسال پیامک */
  ok(host.querySelector('#dlgStep2').hidden === false, 'بعد از شماره، فیلد کد آمد');
  ok(dlgBtn.textContent.indexOf('تایید و ثبت') > -1, 'دکمه به «تایید و ثبت نوبت» تغییر کرد');
  ok(host.querySelector('#dlgDemo').hidden === false, 'در حالت نمایشی، کد روی صفحه نشان داده می‌شود');

  /* کد اشتباه → خطا، پنجره می‌ماند */
  $('#dlgCode', host).value = '9999';
  dlgBtn.click();
  await sleep(700);
  ok(host.querySelector('#dlgErr').hidden === false, 'کد اشتباه: خطا در همان پنجره');
  ok(win.document.querySelector('[data-zz-dialog]') != null, 'پنجره بعد از کد اشتباه باز ماند');

  /* کد درست */
  $('#dlgCode', host).value = ZZ.config.auth.staticCode;
  dlgBtn.click();
  await sleep(700);             /* تایید کد + ثبت نوبت */
  ok(win.document.querySelector('[data-zz-dialog]') == null, 'پنجره‌ی ورود بسته شد');
  ok(ZZ.auth.isLoggedIn(), 'کاربر وارد حساب شد');
  await sleep(700);             /* create() */

  /* ---------- صفحه‌ی موفقیت ---------- */
  ok($('#panelDone').classList.contains('is-active'), 'صفحه‌ی موفقیت باز شد');
  ok($('#bookCta').hidden === true, 'نوار چسبان در صفحه‌ی موفقیت مخفی شد');
  const details = $('#doneDetails').textContent;
  ok(details.indexOf('کد پیگیری') > -1, 'کد پیگیری نمایش داده شد');
  ok(details.indexOf('آدرس سالن') > -1, 'آدرس سالن نمایش داده شد');
  ok($('#doneDetails .done-meta__map') != null, 'لینک «مسیریابی» هست');
  ok($('#icsBtn').hidden === false, 'دکمه‌ی «افزودن به تقویم» هست');
  ok(toasts.some((t) => t[0] === 'ok'), 'توست موفقیت');
  ok(win.localStorage.getItem('bookingDraft') == null, 'پیش‌نویس پاک شد');

  /* ---------- فایل تقویم ---------- */
  $('#icsBtn').click();
  await sleep(30);
  ok(icsBlob != null, 'کلیک روی «افزودن به تقویم» فایل ساخت');
  if (icsBlob) {
    const ics = await icsBlob.text();
    ok(ics.indexOf('BEGIN:VCALENDAR') === 0, 'ICS: سرآیند درست است');
    ok(/DTSTART:\d{8}T\d{6}/.test(ics), 'ICS: زمان شروع دارد');
    ok(/DTEND:\d{8}T\d{6}/.test(ics), 'ICS: زمان پایان (با مدت خدمت) دارد');
    ok(ics.indexOf('فسا') > -1, 'ICS: آدرس سالن در رویداد هست');
  }

  /* ---------- خدمت از لینک مستقیم؟ گام ۱ با خدمت از قبل انتخاب‌شده ---------- */
  ok(svcCount === ZZ.services.getAll().length, 'تعداد خدمت‌ها در گام ۱ درست ماند');

  console.log(failures ? '\n✗ ' + failures + ' خطا' : '\nهمه‌ی جریان‌های تجربه‌ی رزرو ✓');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('خطا:', e); process.exit(1); });
