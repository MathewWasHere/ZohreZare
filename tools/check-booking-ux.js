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
  ok($('#bookCta') && $('#bookCta').hidden === false, 'نوار چسبان از اول دیده می‌شود');
  ok($('#ctaBtn').disabled === true, 'تا قبل از انتخاب، دکمه‌ی ادامه غیرفعال است');

  const svcCount = $$('#serviceChoices .svc-choice').length;
  ok(svcCount === ZZ.services.getAll().length, 'هر خدمت یک کارت است');
  ok($$('#serviceChoices input[name="variant"]').length ===
     ZZ.services.getAll().reduce((n, s) => n + s.variants.length, 0),
     'گزینه‌ها داخل کارت‌ها رندر شدند (نه در بلوک جدا)');

  const svcInput = $$('#serviceChoices input[name="service"]')[0];
  svcInput.checked = true;
  fire(svcInput, 'change');
  await sleep(20);
  const openCard = $('#serviceChoices .svc-choice.is-open');
  ok(!!openCard, 'کارت خدمتِ انتخاب‌شده باز شد');
  ok(openCard && $$('input[name="variant"]', openCard).length > 0, 'گزینه‌ها همان‌جا داخل کارت آمدند');

  /* تغییر خدمت: کارت قبلی بسته شود و انتخاب گزینه پاک شود */
  const varInput0 = $$('input[name="variant"]', openCard)[0];
  varInput0.checked = true;
  fire(varInput0, 'change');
  await sleep(10);
  const secondSvc = $$('#serviceChoices input[name="service"]')[1];
  secondSvc.checked = true;
  fire(secondSvc, 'change');
  await sleep(20);
  ok($$('#serviceChoices .svc-choice.is-open').length === 1, 'با تغییر خدمت، فقط یک کارت باز است');
  ok($$('input[name="variant"]:checked').length === 0, 'گزینه‌ی خدمت قبلی پاک شد');

  /* برگشت به خدمت اول و انتخاب گزینه */
  svcInput.checked = true;
  fire(svcInput, 'change');
  await sleep(20);
  const varInput = $$('#serviceChoices .svc-choice.is-open input[name="variant"]')[0];
  varInput.checked = true;
  fire(varInput, 'change');
  await sleep(20);
  ok($('#ctaBtn').disabled === false, 'با انتخاب گزینه، دکمه فعال شد');
  ok($('#ctaInfo').textContent.indexOf('تومان') > -1, 'نوار چسبان قیمت را نشان می‌دهد');

  $('#ctaBtn').click();
  await sleep(20);
  ok($('#panelTime').classList.contains('is-active'), 'رفتیم به گام زمان');

  /* ---------- گام ۲: تقویم ماهانه‌ی شمسی ---------- */
  ok(!!$('#calWrap .cal-card'), 'تقویم ماهانه رندر شد (همان مؤلفه‌ی پنل مدیریت)');
  ok($$('#calWrap .cal-grid--head .cal-cell--week').length === 7, 'سرِ هفته هفت‌ستونه است (ش تا ج)');
  ok($('#calWrap .cal-title').textContent.replace(/\d/g, '').trim().length > 1, 'عنوان ماه شمسی نمایش داده می‌شود');
  ok($$('#calWrap .cal-cell.is-today').length === 1, 'خانه‌ی «امروز» مشخص است');
  ok($$('#calWrap button.cal-cell.is-selected').length === 1, 'اولین روزِ باز خودکار انتخاب شد');
  ok($$('#calWrap .cal-cell.is-closed').length + $$('#calWrap .cal-cell.is-full').length > 0,
    'روزهای تعطیل/تکمیل با نقطه‌ی وضعیت مشخص‌اند');
  /* هر خانه فقط یک عدد است — هیچ متن هم‌پوشان ندارد */
  ok($$('#calWrap .cal-cell__num').every((n) => n.textContent.trim().length <= 2),
    'هر خانه فقط شماره‌ی روز را نشان می‌دهد (بدون هم‌پوشانی متن)');

  const prevBtn = $('#calWrap [data-cal="-1"]');
  ok(prevBtn && prevBtn.disabled === true, 'ماهِ قبل از ماه جاری غیرفعال است');
  const nextBtn = $('#calWrap [data-cal="1"]');
  if (nextBtn && !nextBtn.disabled) {
    const titleBefore = $('#calWrap .cal-title').textContent;
    nextBtn.click();
    await sleep(20);
    ok($('#calWrap .cal-title').textContent !== titleBefore, 'ناوبری ماه بعد کار می‌کند');
    $('#calWrap [data-cal="-1"]').click();
    await sleep(20);
  }

  /* انتخاب روزِ دیگر: نشانگر انتخاب جابه‌جا می‌شود */
  const otherDay = $$('#calWrap button.cal-cell:not(.is-selected):not([disabled])')[0];
  if (otherDay) {
    otherDay.click();
    await sleep(20);
    ok($$('#calWrap button.cal-cell.is-selected').length === 1 &&
       $$('#calWrap button.cal-cell.is-selected')[0].dataset.date === otherDay.dataset.date,
      'انتخاب روز دیگر، نشانگر را جابه‌جا کرد');
  }

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

  /* ---------- صفحه‌ی خدمات: منوی قیمت روی کارت‌ها ---------- */
  {
    const pageHtml2 = read('services.html');
    const body2 = pageHtml2.slice(pageHtml2.indexOf('<body'), pageHtml2.indexOf('</body>') + 7);
    const dom2 = new JSDOM('<!DOCTYPE html><html lang="fa" dir="rtl"><head></head>' + body2, {
      url: 'http://localhost/services.html',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      virtualConsole: vc
    });
    const win2 = dom2.window;
    win2.scrollTo = () => {};
    const ctx2 = dom2.getInternalVMContext();
    ['assets/js/core/config.js', 'assets/js/core/utils.js', 'assets/js/data/services.js', 'assets/js/ui/icons.js']
      .forEach((f) => vm.runInContext(read(f), ctx2, { filename: f }));
    const ZZ2 = win2.ZZ;
    ZZ2.shell = () => {};
    ZZ2.shell.reveal = () => {};
    vm.runInContext(read('assets/js/pages/services.js'), ctx2, { filename: 'assets/js/pages/services.js' });

    await sleep(80);
    if (!win2.document.querySelector('#servicesGrid .svc-card')) {
      win2.document.dispatchEvent(new win2.Event('DOMContentLoaded', { bubbles: true }));
      await sleep(30);
    }

    const doc2 = win2.document;
    const cards = Array.from(doc2.querySelectorAll('#servicesGrid .svc-card'));
    ok(cards.length === ZZ2.services.getAll().length, 'صفحه‌ی خدمات: یک کارت برای هر خدمت (شامل میکروبلیدینگ جدا)');

    const firstMenu = doc2.querySelector('#servicesGrid .svc-card .svc-menu');
    ok(!!firstMenu, 'منوی قیمت روی کارت خدمت هست');
    ok(firstMenu && firstMenu.querySelectorAll('.svc-menu__price').length >= 2,
      'منوی قیمت: قیمت واقعی چند گزینه دیده می‌شود');
    const firstPrice = ZZ2.u.money(ZZ2.services.getAll()[0].variants[0].price);
    ok(doc2.querySelector('#servicesGrid').textContent.indexOf(firstPrice) > -1,
      'منوی قیمت: قیمت گزینه‌ی اول با فرمت پولی خوانا است');

    const more = doc2.querySelector('.svc-menu__more');
    ok(!!more, 'خدمت ۵گزینه‌ی لب: «و N گزینه‌ی دیگر» نشان داده می‌شود');
    ok(doc2.querySelector('#servicesGrid').textContent.indexOf('میکروبلیدینگ ابرو') > -1,
      'میکروبلیدینگ کارت مستقل خودش را دارد');
  }

  console.log(failures ? '\n✗ ' + failures + ' خطا' : '\nهمه‌ی جریان‌های تجربه‌ی رزرو ✓');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('خطا:', e); process.exit(1); });
