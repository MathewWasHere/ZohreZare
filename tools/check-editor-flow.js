#!/usr/bin/env node
/* ==========================================================================
   check-editor-flow.js — تست تعاملی ویرایشگر خدمت (jsdom)
   برخلاف check-admin-panel.js که فقط رشته‌ی HTML را می‌بیند، اینجا یک
   DOM واقعی ساخته می‌شود و کل جریان انسانی اجرا می‌شود:
     کلیک روی خدمت → باز شدن ویرایشگر → تایپ (عنوان زنده + نقطه‌ی
     ذخیره‌نشده) → گارد خروج از تب → ذخیره → ادغام کش → جابه‌جایی و
     حذف سطر → بازنویسی‌نشدن فرم توسط رفرش.
   به jsdom نیاز دارد؛ اگر نصب نبود بی‌صدا رد می‌شود (اختیاری است).
   اجرا:  node tools/check-editor-flow.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let JSDOM;
try {
  JSDOM = require('jsdom').JSDOM;
} catch (e) {
  console.log('⟳ jsdom نصب نیست؛ تست تعاملی ویرایشگر رد شد. (npm ci در tools/ آن را می‌آورد)');
  process.exit(0);
}

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const { VirtualConsole } = require('jsdom');
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => {
  /* «Not implemented: navigation» و امثال آن — نویز محیط است، نه خطای برنامه */
  if (!/not implemented/i.test(String(e && e.message))) console.error(e);
});

const dom = new JSDOM('<!DOCTYPE html><html lang="fa"><head></head><body><main id="app"></main><div id="adminRoot"></div></body></html>', {
  url: 'http://localhost/panel/admin/index.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole: vc
});
const win = dom.window;
win.scrollTo = () => {};

const ctx = dom.getInternalVMContext();

const scripts = [
  'assets/js/core/config.js',
  'assets/js/core/utils.js',
  'assets/js/core/store.js',
  'assets/js/core/api.js',
  'assets/js/data/services.js',
  'assets/js/data/auth.js',
  'assets/js/data/appointments.js',
  'assets/js/ui/icons.js'
];
for (const f of scripts) vm.runInContext(read(f), ctx, { filename: f });

const ZZ = win.ZZ;
ZZ.shell = () => {};
const toasts = [];
ZZ.toast = { ok: (m) => toasts.push(['ok', m]), error: (m) => toasts.push(['error', m]), info: (m) => toasts.push(['info', m]) };
const dialogs = [];
ZZ.dialog = {
  confirm: (o) => { dialogs.push({ kind: 'confirm', title: o.title }); return Promise.resolve(dialogAnswer); },
  open: (o) => { dialogs.push({ kind: 'open', title: o.title }); return Promise.resolve(false); }
};
let dialogAnswer = false;

vm.runInContext(read('assets/js/pages/admin.js'), ctx, { filename: 'assets/js/pages/admin.js' });

const $ = (sel) => win.document.querySelector(sel);
const $$ = (sel, root) => Array.from((root || win.document).querySelectorAll(sel));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function ok(cond, name) {
  console.log((cond ? '✓ ' : '✗ ') + name);
  if (!cond) failures++;
}

(async function main() {
  /* ورود مدیر */
  await ZZ.auth.requestCode('09178399055');
  await ZZ.auth.verifyCode('1234');

  /* شبیه‌سازی سرور برای ذخیره (قبل از رندر تا دکمه فعال باشد) */
  let savedPayload = null;
  ZZ.appointments.admin.updateService = function (id, payload) {
    savedPayload = { id, payload };
    return Promise.resolve({});
  };

  /* تب خدمات */
  win.location.hash = 'services';
  win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true }));
  await sleep(50);

  ok($$('.svc-item').length === ZZ.services.getAll().length, 'فهرست خدمات: همه‌ی خدمت‌ها رندر شدند');
  ok($$('.svc-item__view').length > 0, 'لینک «مشاهده‌ی صفحه» هست');

  /* باز کردن ویرایشگر */
  $('.svc-item__main[data-edit="svc_lash_ext"]').click();
  await sleep(20);
  ok($('.svc-edit[data-svc="svc_lash_ext"]') != null, 'ویرایشگر با کلیک باز شد');
  ok($$('.svc-group').length === 3, 'سه گروه همیشه‌باز');
  ok($('[data-s="active"]').checked === true, 'کلید «نمایش در سایت» روشن است');
  ok($$('[data-f="is_active"]').length === 0, 'چک‌باکس بی‌اثر گزینه‌ها نیست');

  /* تایپ = dirty + عنوان زنده */
  const title = $('[data-s="title"]');
  title.value = 'بن‌مژه ویژه';
  title.dispatchEvent(new win.Event('input', { bubbles: true }));
  ok($('#svcEditTitle').textContent === 'بن‌مژه ویژه', 'عنوان زنده در نوار به‌روز شد');
  ok($('[data-save].is-dirty') != null, 'دکمه‌ی ذخیره نقطه‌ی «ذخیره‌نشده» گرفت');

  /* گارد خروج از تب */
  dialogAnswer = false; /* لغو */
  $('[data-tab="appointments"]').click();
  await sleep(20);
  ok(dialogs.some((d) => d.kind === 'confirm' && /ذخیره نشده/.test(d.title)), 'گارد تغییرات: تأییدیه باز شد');
  ok($('.svc-edit') != null, 'با لغوِ تأییدیه، ویرایشگر باز ماند');

  /* کلید فعال/غیرفعال هم dirty می‌کند */
  dialogs.length = 0;
  const active = $('[data-s="active"]');
  active.checked = false;
  active.dispatchEvent(new win.Event('input', { bubbles: true }));

  /* ذخیره */
  $$('[data-save]')[0].click();
  await sleep(20);
  ok(savedPayload != null, 'ذخیره به سرور فرستاده شد');
  ok(savedPayload && savedPayload.payload.title === 'بن‌مژه ویژه', 'payload عنوان تازه دارد');
  ok(savedPayload && savedPayload.payload.active === false, 'payload کلید active=false دارد');
  ok(savedPayload && savedPayload.payload.variants.length === 4, 'payload چهار گزینه دارد');
  ok(savedPayload && !('is_active' in savedPayload.payload.variants[0]), 'گزینه‌ها is_active ندارند');
  ok(savedPayload && savedPayload.payload.good_for.length > 0, 'payload تگ‌های good_for دارد');
  ok(toasts.some((t) => t[0] === 'ok'), 'توست «ذخیره شد»');
  ok($('.svc-edit[data-svc="svc_lash_ext"]') != null, 'بعد از ذخیره در ویرایشگر ماند (بدون پرش)');
  ok($('[data-save].is-dirty') == null, 'نقطه‌ی ذخیره‌نشده پاک شد');

  /* ادغام کش: برگشت به فهرست → عنوان و وضعیت تازه */
  $('[data-back]').click();
  await sleep(20);
  ok($('.svc-edit') == null, 'بازگشت به فهرست');
  ok($('.svc-item__main[data-edit="svc_lash_ext"] .svc-item__name').textContent === 'بن‌مژه ویژه', 'کش محلی با عنوان تازه ادغام شد');
  ok($('.svc-item.is-off') != null && $('.svc-item.is-off .badge') != null, 'نشان «غیرفعال» بعد از خاموش‌کردن کلید');

  /* باز دوباره: کلید باید خاموش باشد (از کش) */
  $('.svc-item__main[data-edit="svc_lash_ext"]').click();
  await sleep(20);
  ok($('[data-s="active"]').checked === false, 'وضعیت کلید از کش خوانده شد');

  /* جابه‌جایی سطر */
  const wrap = $('[data-list-wrap="includes"]');
  const rowsBefore = $$('.svc-row [data-list]', wrap).map((i) => i.value);
  wrap.querySelector('.svc-row:nth-child(2) [data-row-up]').click();
  const rowsAfter = $$('.svc-row [data-list]', wrap).map((i) => i.value);
  ok(rowsBefore[1] === rowsAfter[0] && rowsBefore[0] === rowsAfter[1], 'دکمه‌ی ↑ سطر دوم را بالا برد');
  ok($('[data-save].is-dirty') != null, 'جابه‌جایی هم تغییر ذخیره‌نشده ثبت کرد');

  /* حذف سطر */
  const countBefore = $$('.svc-row', wrap).length;
  wrap.querySelector('.svc-row [data-del-row]').click();
  ok($$('.svc-row', wrap).length === countBefore - 1, 'حذف سطر کار می‌کند');

  /* رندر مجدد با dirty نباید فرم را بازنویسی کند (safeRender) */
  const noteField = $('[data-f="note"]');
  noteField.value = 'یادداشت تست';
  noteField.dispatchEvent(new win.Event('input', { bubbles: true }));
  win.dispatchEvent(new win.Event('zz:refresh'));
  await sleep(20);
  ok($('[data-f="note"]').value === 'یادداشت تست', 'zz:refresh با ویرایشگر dirty فرم را بازنویسی نکرد');

  console.log(failures ? '\n✗ ' + failures + ' خطا' : '\nهمه‌ی جریان‌های ویرایشگر خدمت ✓');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('خطا:', e); process.exit(1); });
