#!/usr/bin/env node
/* ==========================================================================
   check-sql.js — بررسی api/schema.sql

   روی این ماشین MySQL نصب نیست، پس فایل را نمی‌شود واقعاً اجرا کرد.
   این ابزار چیزهایی را می‌گیرد که بیشترین احتمال خرابی دارند و اگر
   خراب باشند، ایمپورت در phpMyAdmin وسط کار می‌شکند و نصف جدول‌ها
   ساخته می‌شود:

     • نقل‌قول یا پرانتز باز‌مانده (مثلاً یک ' فرار‌نشده در متن فارسی)
     • دستوری که با کلیدواژه‌ی شناخته‌شده شروع نمی‌شود
     • JSON خرابِ داخل ستون‌های متنی
     • ستون‌هایی که کد PHP می‌خواند ولی در schema نیستند

   اجرا:  node tools/check-sql.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'api', 'schema.sql');

/* ---------------- تقسیم به دستورها ---------------- */

/**
 * فایل را به دستورهای جدا می‌شکند.
 * نقطه‌ویرگولِ داخل رشته یا کامنت نباید جداکننده حساب شود.
 */
function split(sql) {
  const out = [];
  let cur = '';
  let inStr = false;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      cur += c;
      continue;
    }

    if (!inStr && c === '-' && next === '-') {
      inLineComment = true;
      cur += c;
      continue;
    }

    if (inStr) {
      if (c === '\\') { cur += c + (next || ''); i++; continue; }
      if (c === "'") inStr = false;
      cur += c;
      continue;
    }

    if (c === "'") { inStr = true; cur += c; continue; }

    if (c === ';') { out.push(cur.trim()); cur = ''; continue; }

    cur += c;
  }

  if (cur.trim()) out.push(cur.trim());
  return out.filter((s) => stripComments(s).trim() !== '');
}

function stripComments(s) {
  return s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
}

/* ---------------- بررسی‌ها ---------------- */

const STARTS = ['CREATE', 'INSERT', 'ALTER', 'SET', 'DROP', 'UPDATE', 'DELETE'];

/** ستون‌هایی که کد PHP از هر جدول می‌خواند */
const REQUIRED = {
  users: ['id', 'phone', 'name', 'birth_y', 'birth_m', 'birth_d', 'role',
          'created_at', 'last_login_at'],
  sessions: ['token', 'user_id', 'created_at', 'expires_at', 'last_seen', 'ip', 'user_agent'],
  otp_codes: ['phone', 'code_hash', 'attempts', 'expires_at', 'used_at', 'ip', 'created_at'],
  services: ['id', 'slug', 'title', 'short_text', 'image', 'icon', 'ig_link',
             'duration_min', 'price_from', 'description', 'includes_json',
             'aftercare', 'good_for', 'faq', 'sort_order', 'active'],
  service_variants: ['service_id', 'variant_key', 'name', 'note', 'duration_min',
                     'price', 'sort_order'],
  appointments: ['id', 'user_id', 'service_id', 'variant_key', 'variant_name',
                 'date', 'time', 'duration_min', 'price', 'status', 'note',
                 'deposit_amount', 'deposit_method', 'deposit_ref', 'deposit_note',
                 'deposit_paid_at', 'reject_reason', 'decided_at', 'decided_by',
                 'cancelled_at', 'cancelled_by', 'created_at'],
  closed_days: ['date', 'reason', 'created_at'],
  blocked_slots: ['date', 'time', 'reason', 'created_at'],
  sms_log: ['phone', 'tag', 'body', 'result_code', 'message', 'batch_id', 'created_at']
};

function main() {
  if (!fs.existsSync(FILE)) {
    console.log('api/schema.sql وجود ندارد — اول node tools/make-schema.js را اجرا کنید.');
    return 1;
  }

  const sql = fs.readFileSync(FILE, 'utf8');
  const statements = split(sql);
  const problems = [];

  /* ۱) هر دستور: پرانتز و نقل‌قول متوازن، شروع معتبر */
  statements.forEach((st, i) => {
    const body = stripComments(st).trim();
    if (!body) return;

    const head = body.split(/\s+/)[0].toUpperCase();
    if (!STARTS.includes(head)) {
      problems.push('دستور ' + (i + 1) + ' با کلیدواژه‌ی ناشناخته شروع می‌شود: ' + head);
    }

    let depth = 0;
    let inStr = false;
    for (let k = 0; k < body.length; k++) {
      const c = body[k];
      if (inStr) {
        if (c === '\\') { k++; continue; }
        if (c === "'") inStr = false;
        continue;
      }
      if (c === "'") { inStr = true; continue; }
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (depth < 0) { problems.push('دستور ' + (i + 1) + ': پرانتز بسته‌ی اضافه'); break; }
    }
    if (depth !== 0) problems.push('دستور ' + (i + 1) + ': ' + depth + ' پرانتز بسته نشده');
    if (inStr) problems.push('دستور ' + (i + 1) + ': نقل‌قول بسته نشده');
  });

  /* ۲) جدول‌ها و ستون‌هایشان */
  const tables = {};
  statements.forEach((st) => {
    const m = stripComments(st).match(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+`?(\w+)`?\s*\(/i);
    if (!m) return;
    const name = m[1];
    const inner = stripComments(st).slice(stripComments(st).indexOf('(') + 1);
    const cols = [];
    inner.split('\n').forEach((line) => {
      const cm = line.trim().match(/^`?(\w+)`?\s+[A-Z]/);
      if (cm && !/^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN)$/i.test(cm[1])) {
        cols.push(cm[1]);
      }
    });
    tables[name] = cols;
  });

  Object.keys(REQUIRED).forEach((t) => {
    if (!tables[t]) {
      problems.push('جدول ' + t + ' در schema نیست');
      return;
    }
    REQUIRED[t].forEach((c) => {
      if (!tables[t].includes(c)) {
        problems.push('ستون ' + t + '.' + c + ' که PHP می‌خواند در schema نیست');
      }
    });
  });

  /* ۳) JSON داخل INSERT ها سالم باشد */
  let jsonCount = 0;
  const jsonRe = /'(\[.*?\])'/gs;
  let m;
  while ((m = jsonRe.exec(sql)) !== null) {
    const raw = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
    try {
      const v = JSON.parse(raw);
      if (!Array.isArray(v)) throw new Error('آرایه نیست');
      jsonCount++;
    } catch (e) {
      problems.push('JSON خراب در schema: ' + raw.slice(0, 60) + '… (' + e.message + ')');
    }
  }

  /* ---------------- گزارش ---------------- */
  console.log('دستورها: ' + statements.length +
              '   جدول‌ها: ' + Object.keys(tables).length +
              '   ستون JSON سالم: ' + jsonCount);

  if (problems.length) {
    problems.forEach((p) => console.log('  ✗ ' + p));
    console.log('\n' + problems.length + ' مشکل در schema.sql ✗');
    return 1;
  }

  console.log('\nschema.sql سالم است ✓');
  return 0;
}

process.exit(main());
