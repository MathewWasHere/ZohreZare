#!/usr/bin/env node
/* ==========================================================================
   make-schema.js — ساخت api/schema.sql

   جدول‌ها را می‌سازد و کاتالوگ خدمات را از روی
   assets/js/data/services.js پر می‌کند.

   چرا تولید خودکار و نه SQL دستی؟
   چون services.js منبع واحد حقیقت است. اگر قیمتی آن‌جا عوض شود و
   schema.sql دستی نوشته شده باشد، دو نسخه از هم جدا می‌افتند و
   نسخه‌ی استاتیک سایت با نسخه‌ی سرور فرق می‌کند.

   اجرا:  node tools/make-schema.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'api', 'schema.sql');

/* ---------------- خواندن خدمات از فایل فرانت ---------------- */

function loadServices() {
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);

  const src = fs.readFileSync(
    path.join(ROOT, 'assets', 'js', 'data', 'services.js'), 'utf8'
  );
  vm.runInContext(src, sandbox, { filename: 'services.js' });

  const svc = sandbox.window.ZZ && sandbox.window.ZZ.services;
  if (!svc || typeof svc.getAll !== 'function') {
    throw new Error('services.js بارگذاری نشد — ساختارش عوض شده؟');
  }
  return svc.getAll();
}

/* ---------------- کمکی SQL ---------------- */

/** رشته را برای MySQL امن می‌کند */
function q(value) {
  if (value === null || value === undefined) return 'NULL';
  return "'" + String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/\x00/g, '') + "'";
}

/** آرایه/شیء → ستون JSON */
function j(value) {
  return q(JSON.stringify(value || [], null, 0));
}

/* ---------------- ساخت فایل ---------------- */

function build() {
  const services = loadServices();

  const L = [];
  const p = (s) => L.push(s === undefined ? '' : s);

  p('-- ==========================================================================');
  p('-- schema.sql — ساختار پایگاه داده‌ی سایت زهره زارع');
  p('--');
  p('-- روش اجرا:');
  p('--   cPanel → phpMyAdmin → دیتابیس را انتخاب کنید → زبانه‌ی Import');
  p('--   → همین فایل را انتخاب کنید → Go');
  p('--');
  p('-- این فایل را می‌شود چند بار اجرا کرد؛ جدول‌های موجود دست‌نخورده');
  p('-- می‌مانند و خدمات دوباره‌نویسی می‌شوند.');
  p('--');
  p('-- تولید خودکار با tools/make-schema.js — دستی ویرایشش نکنید.');
  p('-- ==========================================================================');
  p();
  p('SET NAMES utf8mb4;');
  p();

  /* ---------- کاربران ---------- */
  p('-- ---------------- کاربران ----------------');
  p('-- تاریخ تولد شمسی ذخیره می‌شود (نه میلادی) چون کاربر همان را');
  p('-- وارد می‌کند و تبدیل رفت‌وبرگشتی فقط جای خطا می‌سازد.');
  p('CREATE TABLE IF NOT EXISTS users (');
  p('  id            VARCHAR(32)  NOT NULL,');
  p('  phone         CHAR(11)     NOT NULL,');
  p("  name          VARCHAR(80)  NOT NULL DEFAULT '',");
  p('  birth_y       SMALLINT     NULL,');
  p('  birth_m       TINYINT      NULL,');
  p('  birth_d       TINYINT      NULL,');
  p("  role          ENUM('user','admin') NOT NULL DEFAULT 'user',");
  p('  created_at    DATETIME     NOT NULL,');
  p('  last_login_at DATETIME     NULL,');
  p('  PRIMARY KEY (id),');
  p('  UNIQUE KEY uk_users_phone (phone),');
  p('  KEY idx_users_birthday (birth_m, birth_d)');
  p(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  p();

  /* ---------- نشست‌ها ---------- */
  p('-- ---------------- نشست‌های ورود ----------------');
  p('-- توکن خام هرگز ذخیره نمی‌شود؛ فقط هش SHA-256 آن. اگر کسی به');
  p('-- دیتابیس دسترسی پیدا کند نمی‌تواند با آن وارد حساب کسی شود.');
  p('CREATE TABLE IF NOT EXISTS sessions (');
  p('  token      CHAR(64)     NOT NULL,');
  p('  user_id    VARCHAR(32)  NOT NULL,');
  p('  created_at DATETIME     NOT NULL,');
  p('  expires_at DATETIME     NOT NULL,');
  p('  last_seen  DATETIME     NULL,');
  p('  ip         VARCHAR(45)  NULL,');
  p('  user_agent VARCHAR(200) NULL,');
  p('  PRIMARY KEY (token),');
  p('  KEY idx_sessions_user (user_id),');
  p('  KEY idx_sessions_exp (expires_at)');
  p(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  p();

  /* ---------- کدهای تأیید ---------- */
  p('-- ---------------- کدهای یک‌بارمصرف ----------------');
  p('-- code_hash هش کد است، نه خود کد.');
  p('CREATE TABLE IF NOT EXISTS otp_codes (');
  p('  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,');
  p('  phone      CHAR(11)     NOT NULL,');
  p('  code_hash  CHAR(64)     NOT NULL,');
  p('  attempts   TINYINT      NOT NULL DEFAULT 0,');
  p('  expires_at DATETIME     NOT NULL,');
  p('  used_at    DATETIME     NULL,');
  p('  ip         VARCHAR(45)  NULL,');
  p('  created_at DATETIME     NOT NULL,');
  p('  PRIMARY KEY (id),');
  p('  KEY idx_otp_phone (phone, created_at),');
  p('  KEY idx_otp_ip (ip, created_at)');
  p(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  p();

  /* ---------- خدمات ---------- */
  p('-- ---------------- خدمات ----------------');
  p('-- ستون‌های JSON فهرست‌های متنی صفحه‌ی خدمت‌اند (پاراگراف‌ها،');
  p('-- مراقبت‌ها، پرسش‌ها). چون هیچ‌وقت جداگانه جست‌وجو نمی‌شوند،');
  p('-- جدول جدا برایشان فقط پیچیدگی اضافه می‌کرد.');
  p('CREATE TABLE IF NOT EXISTS services (');
  p('  id            VARCHAR(40)  NOT NULL,');
  p('  slug          VARCHAR(60)  NOT NULL,');
  p('  title         VARCHAR(120) NOT NULL,');
  p("  short_text    VARCHAR(300) NOT NULL DEFAULT '',");
  p("  image         VARCHAR(200) NOT NULL DEFAULT '',");
  p("  icon          VARCHAR(40)  NOT NULL DEFAULT '',");
  p('  ig_link       VARCHAR(200) NULL,');
  p('  duration_min  SMALLINT     NOT NULL DEFAULT 60,');
  p('  price_from    INT          NOT NULL DEFAULT 0,');
  p('  description   MEDIUMTEXT   NULL,');
  p('  includes_json MEDIUMTEXT   NULL,');
  p('  aftercare     MEDIUMTEXT   NULL,');
  p('  good_for      MEDIUMTEXT   NULL,');
  p('  faq           MEDIUMTEXT   NULL,');
  p('  sort_order    SMALLINT     NOT NULL DEFAULT 0,');
  p('  active        TINYINT(1)   NOT NULL DEFAULT 1,');
  p('  PRIMARY KEY (id),');
  p('  UNIQUE KEY uk_services_slug (slug)');
  p(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  p();

  p('CREATE TABLE IF NOT EXISTS service_variants (');
  p('  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,');
  p('  service_id   VARCHAR(40)  NOT NULL,');
  p('  variant_key  VARCHAR(40)  NOT NULL,');
  p('  name         VARCHAR(120) NOT NULL,');
  p("  note         VARCHAR(300) NOT NULL DEFAULT '',");
  p('  duration_min SMALLINT     NOT NULL DEFAULT 60,');
  p('  price        INT          NOT NULL DEFAULT 0,');
  p('  sort_order   SMALLINT     NOT NULL DEFAULT 0,');
  p('  PRIMARY KEY (id),');
  p('  UNIQUE KEY uk_variant (service_id, variant_key)');
  p(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  p();

  /* ---------- نوبت‌ها ---------- */
  p('-- ---------------- نوبت‌ها ----------------');
  p('-- چرخه‌ی وضعیت (بدون درگاه پرداخت):');
  p('--');
  p('--   مشتری ساعت را می‌گیرد');
  p('--          ↓');
  p('--   pending ──(مدیر تماس می‌گیرد و تأیید می‌کند)──→ confirmed ──→ done');
  p('--      │                                               │');
  p('--      │                                               └──→ no_show');
  p('--      ├──(مدیر رد می‌کند)──→ rejected');
  p('--      └──(مشتری منصرف می‌شود)──→ cancelled');
  p('--');
  p('-- بیعانه یک رکورد ساده روی همین ردیف است، نه تراکنش بانکی. مدیر');
  p('-- حین تماس مبلغ را می‌گیرد و ثبتش می‌کند. هر وقت درگاه پرداخت');
  p('-- اضافه شد، فقط یک مقدار جدید به deposit_method اضافه می‌شود.');
  p('CREATE TABLE IF NOT EXISTS appointments (');
  p('  id              VARCHAR(32)  NOT NULL,');
  p('  user_id         VARCHAR(32)  NOT NULL,');
  p('  service_id      VARCHAR(40)  NOT NULL,');
  p('  variant_key     VARCHAR(40)  NOT NULL,');
  p('  variant_name    VARCHAR(120) NOT NULL,');
  p('  `date`          DATE         NOT NULL,');
  p('  `time`          CHAR(5)      NOT NULL,');
  p('  duration_min    SMALLINT     NOT NULL DEFAULT 60,');
  p('  price           INT          NOT NULL DEFAULT 0,');
  p("  status          ENUM('pending','confirmed','rejected','cancelled','done','no_show')");
  p("                  NOT NULL DEFAULT 'pending',");
  p("  note            VARCHAR(400) NOT NULL DEFAULT '',");
  p('  deposit_amount  INT          NULL,');
  p('  deposit_method  VARCHAR(20)  NULL,');
  p('  deposit_ref     VARCHAR(40)  NULL,');
  p('  deposit_note    VARCHAR(200) NULL,');
  p('  deposit_paid_at DATETIME     NULL,');
  p('  reject_reason   VARCHAR(200) NULL,');
  p('  decided_at      DATETIME     NULL,');
  p('  decided_by      VARCHAR(20)  NULL,');
  p('  cancelled_at    DATETIME     NULL,');
  p('  cancelled_by    VARCHAR(20)  NULL,');
  p('  created_at      DATETIME     NOT NULL,');
  p('  PRIMARY KEY (id),');
  p('  KEY idx_appt_user (user_id),');
  p('  KEY idx_appt_day (`date`, `time`),');
  p('  KEY idx_appt_status (status, `date`)');
  p(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  p();

  /* ---------- تعطیلی‌ها ---------- */
  p('-- ---------------- بستن روز و ساعت توسط مدیر ----------------');
  p('CREATE TABLE IF NOT EXISTS closed_days (');
  p('  `date`     DATE         NOT NULL,');
  p("  reason     VARCHAR(120) NOT NULL DEFAULT '',");
  p('  created_at DATETIME     NOT NULL,');
  p('  PRIMARY KEY (`date`)');
  p(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  p();
  p('CREATE TABLE IF NOT EXISTS blocked_slots (');
  p('  `date`     DATE         NOT NULL,');
  p('  `time`     CHAR(5)      NOT NULL,');
  p("  reason     VARCHAR(120) NOT NULL DEFAULT '',");
  p('  created_at DATETIME     NOT NULL,');
  p('  PRIMARY KEY (`date`, `time`)');
  p(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  p();

  /* ---------- لاگ پیامک ---------- */
  p('-- ---------------- گزارش پیامک ----------------');
  p('-- متن کد تأیید عمداً ذخیره نمی‌شود.');
  p('CREATE TABLE IF NOT EXISTS sms_log (');
  p('  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,');
  p('  phone       CHAR(11)     NOT NULL,');
  p("  tag         VARCHAR(20)  NOT NULL DEFAULT '',");
  p('  body        VARCHAR(400) NULL,');
  p('  result_code INT          NOT NULL DEFAULT 0,');
  p('  message     VARCHAR(200) NULL,');
  p('  batch_id    BIGINT       NULL,');
  p('  created_at  DATETIME     NOT NULL,');
  p('  PRIMARY KEY (id),');
  p('  KEY idx_sms_phone (phone, created_at)');
  p(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  p();

  /* ---------- خدمات: داده ---------- */
  p('-- ==========================================================================');
  p('-- کاتالوگ خدمات');
  p('-- برگرفته از assets/js/data/services.js تا نسخه‌ی سرور و نسخه‌ی');
  p('-- استاتیک سایت هرگز از هم جدا نیفتند.');
  p('-- ==========================================================================');
  p();

  services.forEach((s, i) => {
    p('-- ' + s.title);
    p('INSERT INTO services');
    p('  (id, slug, title, short_text, image, icon, ig_link, duration_min,');
    p('   price_from, description, includes_json, aftercare, good_for, faq,');
    p('   sort_order, active)');
    p('VALUES (');
    p('  ' + q(s.id) + ', ' + q(s.slug) + ', ' + q(s.title) + ',');
    p('  ' + q(s.short) + ',');
    p('  ' + q(s.image) + ', ' + q(s.icon) + ', ' + q(s.igLink || null) + ',');
    p('  ' + (s.durationMin | 0) + ', ' + (s.priceFrom | 0) + ',');
    p('  ' + j(s.description) + ',');
    p('  ' + j(s.includes) + ',');
    p('  ' + j(s.aftercare) + ',');
    p('  ' + j(s.goodFor) + ',');
    p('  ' + j(s.faq) + ',');
    p('  ' + i + ', 1');
    p(')');
    p('ON DUPLICATE KEY UPDATE');
    p('  slug = VALUES(slug), title = VALUES(title), short_text = VALUES(short_text),');
    p('  image = VALUES(image), icon = VALUES(icon), duration_min = VALUES(duration_min),');
    p('  price_from = VALUES(price_from), description = VALUES(description),');
    p('  includes_json = VALUES(includes_json), aftercare = VALUES(aftercare),');
    p('  good_for = VALUES(good_for), faq = VALUES(faq), sort_order = VALUES(sort_order);');
    p();

    (s.variants || []).forEach((v, vi) => {
      p('INSERT INTO service_variants');
      p('  (service_id, variant_key, name, note, duration_min, price, sort_order)');
      p('VALUES (' + q(s.id) + ', ' + q(v.id) + ', ' + q(v.name) + ', ' +
        q(v.note || '') + ', ' + (v.durationMin | 0) + ', ' + (v.price | 0) +
        ', ' + vi + ')');
      p('ON DUPLICATE KEY UPDATE');
      p('  name = VALUES(name), note = VALUES(note),');
      p('  duration_min = VALUES(duration_min), price = VALUES(price),');
      p('  sort_order = VALUES(sort_order);');
    });
    p();
  });

  p('-- ==========================================================================');
  p('-- اختیاری — قفل ضدِ رزرو هم‌زمان');
  p('--');
  p('-- کد PHP قبل از ثبت بررسی می‌کند که ساعت آزاد باشد، ولی اگر دو');
  p('-- نفر در همان کسری از ثانیه ثبت کنند، هر دو بررسی موفق می‌شود و');
  p('-- یک ساعت دو بار رزرو می‌شود. ستون زیر همان ساعت را برای');
  p('-- نوبت‌های فعال یکتا می‌کند، پس دیتابیس دومی را رد می‌کند و PHP');
  p('-- پیام «این ساعت همین الان گرفته شد» نشان می‌دهد.');
  p('--');
  p('-- به MySQL 5.7+ یا MariaDB 10.2+ نیاز دارد. اگر خطا داد، سایت');
  p('-- بدون این هم کار می‌کند — فقط این محافظت آخر را ندارد.');
  p('-- دستور زیر را جداگانه در phpMyAdmin اجرا کنید:');
  p('--');
  p('--   ALTER TABLE appointments');
  p('--     ADD COLUMN slot_lock VARCHAR(20)');
  p('--       GENERATED ALWAYS AS (');
  p("--         CASE WHEN status IN ('pending','confirmed')");
  p("--              THEN CONCAT(`date`, ' ', `time`) ELSE NULL END");
  p('--       ) STORED,');
  p('--     ADD UNIQUE KEY uk_appt_slot (slot_lock);');
  p('-- ==========================================================================');

  fs.writeFileSync(OUT, L.join('\n'), 'utf8');

  const variants = services.reduce((n, s) => n + (s.variants || []).length, 0);
  console.log('api/schema.sql ساخته شد ✓');
  console.log('  خدمات: ' + services.length + '   گزینه‌ها: ' + variants);
  console.log('  حجم: ' + Math.round(fs.statSync(OUT).size / 1024) + 'KB');
}

build();
