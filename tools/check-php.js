#!/usr/bin/env node
/* ==========================================================================
   check-php.js — بررسی نحوی فایل‌های PHP

   روی این ماشین PHP نصب نیست و مخازن بسته‌اند، پس `php -l` در دسترس
   نیست. به‌جایش از php-parser استفاده می‌کنیم؛ یک تحلیلگر نحوی کامل
   PHP 8 که فایل را تا سطح AST پارس می‌کند، پس خطای نحوی از دستش در
   نمی‌رود.

   علاوه بر نحو، چند اشتباه رایجِ خطرناک را هم می‌گیرد:
     • باقی ماندن کلید یا رمز واقعی داخل فایل‌های نمونه
     • فراموش کردن escape در خروجی HTML
     • استفاده از توابع خطرناک

   نصب وابستگی:  npm install --prefix tools
   اجرا:          node tools/check-php.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

/* ---------------- پیدا کردن php-parser ---------------- */

function loadParser() {
  const candidates = [
    path.join(ROOT, 'tools', 'node_modules', 'php-parser'),
    path.join(ROOT, 'node_modules', 'php-parser'),
    'php-parser'
  ];
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* بعدی را امتحان کن */ }
  }
  /* تلاش برای نصب خودکار — node_modules در snapshot ذخیره نمی‌شود،
     پس ممکن است در محیط تازه موجود نباشد. */
  try {
    console.log('php-parser پیدا نشد؛ در حال نصب…');
    execSync('npm install --silent --prefix "' + path.join(ROOT, 'tools') + '"',
             { stdio: 'ignore' });
    return require(path.join(ROOT, 'tools', 'node_modules', 'php-parser'));
  } catch (e) {
    console.error('نصب php-parser ناموفق بود. دستی نصب کنید:');
    console.error('  npm install --prefix tools');
    process.exit(2);
  }
}

const phpParser = loadParser();

/* ---------------- جمع‌آوری فایل‌ها ---------------- */

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.php')) out.push(full);
  }
  return out;
}

/* ---------------- بررسی‌های محتوایی ---------------- */

/* الگوهایی که نباید در مخزن باشند — کلید یا رمز واقعی */
const SECRET_PATTERNS = [
  { re: /'api_key'\s*=>\s*'[A-Za-z0-9]{20,}'/, msg: 'کلید API واقعی داخل فایل مانده' },
  { re: /'pass'\s*=>\s*'.{4,}'/, msg: 'رمز دیتابیس واقعی داخل فایل مانده' },
  { re: /'password'\s*=>\s*'.{4,}'/, msg: 'رمز واقعی داخل فایل مانده' }
];

const RISKY = [
  { re: /\beval\s*\(/, msg: 'استفاده از eval' },
  { re: /(?<![>:\w$])(exec|shell_exec|passthru|system|popen)\s*\(/, msg: 'اجرای دستور سیستمی' },
  { re: /\$_(GET|POST|REQUEST|COOKIE)\s*\[[^\]]+\]\s*\)?\s*;?\s*$/m, msg: null }
];

/**
 * دنبال echo کردن ورودی کاربر بدون htmlspecialchars می‌گردد.
 * ساده ولی مؤثر: خط‌هایی که مستقیم $_GET/$_POST را چاپ می‌کنند.
 */
function findUnescapedEcho(src) {
  const hits = [];
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (!/(<\?=|\becho\b|\bprint\b)/.test(line)) return;
    if (/htmlspecialchars|htmlentities|json_encode|urlencode|\(int\)|intval/.test(line)) return;
    if (/\$_(GET|POST|REQUEST|COOKIE|SERVER)\b/.test(line)) {
      hits.push({ line: i + 1, text: line.trim().slice(0, 90) });
    }
  });
  return hits;
}

/* ---------------- اجرا ---------------- */

function main() {
  const files = walk(path.join(ROOT, 'api'));
  if (!files.length) {
    console.log('هیچ فایل PHP ای پیدا نشد.');
    return 0;
  }

  let bad = 0;
  let warned = 0;

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const src = fs.readFileSync(file, 'utf8');

    /* ۱) نحو */
    let ast = null;
    try {
      const engine = new phpParser.Engine({
        parser: { extractDoc: false, suppressErrors: false, version: 803 },
        ast: { withPositions: true }
      });
      ast = engine.parseCode(src, rel);
      if (ast.errors && ast.errors.length) {
        throw new Error(ast.errors[0].message + ' (خط ' + ast.errors[0].line + ')');
      }
    } catch (e) {
      bad++;
      console.log('✗ ' + rel + '  →  خطای نحوی: ' + e.message);
      continue;
    }

    const notes = [];

    /* ۲) نشت کلید و رمز */
    const isSample = /\.sample\.php$/.test(rel);
    for (const p of SECRET_PATTERNS) {
      if (p.re.test(src)) {
        notes.push((isSample ? '✗ ' : '! ') + p.msg);
        if (isSample) bad++; else warned++;
      }
    }

    /* ۳) توابع خطرناک */
    for (const p of RISKY) {
      if (p.msg && p.re.test(src)) {
        notes.push('! ' + p.msg);
        warned++;
      }
    }

    /* ۴) چاپ ورودی کاربر بدون escape */
    for (const h of findUnescapedEcho(src)) {
      notes.push('! خط ' + h.line + ': چاپ ورودی کاربر بدون htmlspecialchars — ' + h.text);
      warned++;
    }

    const kb = Math.max(1, Math.round(src.length / 1024));
    console.log('✓ ' + rel + '  (' + ast.children.length + ' گره سطح بالا، ' + kb + 'KB)');
    notes.forEach((n) => console.log('    ' + n));
  }

  console.log('');
  if (bad) {
    console.log(bad + ' مشکل جدی در فایل‌های PHP پیدا شد ✗');
    return 1;
  }
  if (warned) {
    console.log('همه‌ی ' + files.length + ' فایل PHP سالم‌اند، با ' + warned + ' هشدار.');
    return 0;
  }
  console.log('همه‌ی ' + files.length + ' فایل PHP سالم‌اند ✓');
  return 0;
}

process.exit(main());
