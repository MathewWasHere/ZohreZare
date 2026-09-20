/*
   ==========================================================================
   schema.sql — ساختار پایگاه داده‌ی سایت زهره زارع
   
   روش اجرا:
     cPanel → phpMyAdmin → دیتابیس را انتخاب کنید → زبانه‌ی Import
     → همین فایل را انتخاب کنید → Go
   
   این فایل را می‌شود چند بار اجرا کرد؛ جدول‌های موجود دست‌نخورده
   می‌مانند و خدمات دوباره‌نویسی می‌شوند.
   
   تولید خودکار با tools/make-schema.js — دستی ویرایشش نکنید.
   ==========================================================================
*/

SET NAMES utf8mb4;

/*
   ---------------- کاربران ----------------
   تاریخ تولد شمسی ذخیره می‌شود (نه میلادی) چون کاربر همان را
   وارد می‌کند و تبدیل رفت‌وبرگشتی فقط جای خطا می‌سازد.
*/
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(32)  NOT NULL,
  phone         CHAR(11)     NOT NULL,
  name          VARCHAR(80)  NOT NULL DEFAULT '',
  birth_y       SMALLINT     NULL,
  birth_m       TINYINT      NULL,
  birth_d       TINYINT      NULL,
  role          ENUM('user','admin') NOT NULL DEFAULT 'user',
  created_at    DATETIME     NOT NULL,
  last_login_at DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_phone (phone),
  KEY idx_users_birthday (birth_m, birth_d)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*
   ---------------- نشست‌های ورود ----------------
   توکن خام هرگز ذخیره نمی‌شود؛ فقط هش SHA-256 آن. اگر کسی به
   دیتابیس دسترسی پیدا کند نمی‌تواند با آن وارد حساب کسی شود.
*/
CREATE TABLE IF NOT EXISTS sessions (
  token      CHAR(64)     NOT NULL,
  user_id    VARCHAR(32)  NOT NULL,
  created_at DATETIME     NOT NULL,
  expires_at DATETIME     NOT NULL,
  last_seen  DATETIME     NULL,
  ip         VARCHAR(45)  NULL,
  user_agent VARCHAR(200) NULL,
  PRIMARY KEY (token),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_exp (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*
   ---------------- کدهای یک‌بارمصرف ----------------
   code_hash هش کد است، نه خود کد.
*/
CREATE TABLE IF NOT EXISTS otp_codes (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone      CHAR(11)     NOT NULL,
  code_hash  CHAR(64)     NOT NULL,
  attempts   TINYINT      NOT NULL DEFAULT 0,
  expires_at DATETIME     NOT NULL,
  used_at    DATETIME     NULL,
  ip         VARCHAR(45)  NULL,
  created_at DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_otp_phone (phone, created_at),
  KEY idx_otp_ip (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*
   ---------------- خدمات ----------------
   ستون‌های JSON فهرست‌های متنی صفحه‌ی خدمت‌اند (پاراگراف‌ها،
   مراقبت‌ها، پرسش‌ها). چون هیچ‌وقت جداگانه جست‌وجو نمی‌شوند،
   جدول جدا برایشان فقط پیچیدگی اضافه می‌کرد.
*/
CREATE TABLE IF NOT EXISTS services (
  id            VARCHAR(40)  NOT NULL,
  slug          VARCHAR(60)  NOT NULL,
  title         VARCHAR(120) NOT NULL,
  sms_name      VARCHAR(80)  NOT NULL DEFAULT '',
  tagline       VARCHAR(160) NOT NULL DEFAULT '',
  short_text    VARCHAR(300) NOT NULL DEFAULT '',
  image         VARCHAR(200) NOT NULL DEFAULT '',
  icon          VARCHAR(40)  NOT NULL DEFAULT '',
  ig_link       VARCHAR(200) NULL,
  duration_min  SMALLINT     NOT NULL DEFAULT 60,
  price_from    INT          NOT NULL DEFAULT 0,
  description   MEDIUMTEXT   NULL,
  benefits      MEDIUMTEXT   NULL,
  includes_json MEDIUMTEXT   NULL,
  before_reserve MEDIUMTEXT  NULL,
  care_label    VARCHAR(160) NOT NULL DEFAULT '',
  precare       MEDIUMTEXT   NULL,
  aftercare     MEDIUMTEXT   NULL,
  contraindications MEDIUMTEXT NULL,
  contraindications_note VARCHAR(400) NULL,
  good_for      MEDIUMTEXT   NULL,
  faq           MEDIUMTEXT   NULL,
  sort_order    SMALLINT     NOT NULL DEFAULT 0,
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uk_services_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_variants (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_id   VARCHAR(40)  NOT NULL,
  variant_key  VARCHAR(40)  NOT NULL,
  name         VARCHAR(120) NOT NULL,
  note         VARCHAR(300) NOT NULL DEFAULT '',
  duration_min SMALLINT     NOT NULL DEFAULT 60,
  price        INT          NOT NULL DEFAULT 0,
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_variant (service_id, variant_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*
   ---------------- نوبت‌ها ----------------
   چرخه‌ی وضعیت (بدون درگاه پرداخت):
   
     مشتری ساعت را می‌گیرد
            ↓
     pending ──(مدیر تماس می‌گیرد و تأیید می‌کند)──→ confirmed ──→ done
        │                                               │
        │                                               └──→ no_show
        ├──(مدیر رد می‌کند)──→ rejected
        └──(مشتری منصرف می‌شود)──→ cancelled
   
   بیعانه یک رکورد ساده روی همین ردیف است، نه تراکنش بانکی. مدیر
   حین تماس مبلغ را می‌گیرد و ثبتش می‌کند. هر وقت درگاه پرداخت
   اضافه شد، فقط یک مقدار جدید به deposit_method اضافه می‌شود.
*/
CREATE TABLE IF NOT EXISTS appointments (
  id              VARCHAR(32)  NOT NULL,
  user_id         VARCHAR(32)  NOT NULL,
  service_id      VARCHAR(40)  NOT NULL,
  variant_key     VARCHAR(40)  NOT NULL,
  variant_name    VARCHAR(120) NOT NULL,
  `date`          DATE         NOT NULL,
  `time`          CHAR(5)      NOT NULL,
  duration_min    SMALLINT     NOT NULL DEFAULT 60,
  price           INT          NOT NULL DEFAULT 0,
  status          ENUM('pending','confirmed','rejected','cancelled','done','no_show')
                  NOT NULL DEFAULT 'pending',
  note            VARCHAR(400) NOT NULL DEFAULT '',
  deposit_amount  INT          NULL,
  deposit_method  VARCHAR(20)  NULL,
  deposit_ref     VARCHAR(40)  NULL,
  deposit_note    VARCHAR(200) NULL,
  deposit_paid_at DATETIME     NULL,
  reject_reason   VARCHAR(200) NULL,
  decided_at      DATETIME     NULL,
  decided_by      VARCHAR(20)  NULL,
  cancelled_at    DATETIME     NULL,
  cancelled_by    VARCHAR(20)  NULL,
  created_at      DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_appt_user (user_id),
  KEY idx_appt_day (`date`, `time`),
  KEY idx_appt_status (status, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/* ---------------- بستن روز و ساعت توسط مدیر ---------------- */
CREATE TABLE IF NOT EXISTS closed_days (
  `date`     DATE         NOT NULL,
  reason     VARCHAR(120) NOT NULL DEFAULT '',
  created_at DATETIME     NOT NULL,
  PRIMARY KEY (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blocked_slots (
  `date`     DATE         NOT NULL,
  `time`     CHAR(5)      NOT NULL,
  reason     VARCHAR(120) NOT NULL DEFAULT '',
  created_at DATETIME     NOT NULL,
  PRIMARY KEY (`date`, `time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*
   ---------------- گزارش پیامک ----------------
   متن کد تأیید عمداً ذخیره نمی‌شود.
*/
CREATE TABLE IF NOT EXISTS sms_log (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone       CHAR(11)     NOT NULL,
  tag         VARCHAR(20)  NOT NULL DEFAULT '',
  body        VARCHAR(400) NULL,
  result_code INT          NOT NULL DEFAULT 0,
  message     VARCHAR(200) NULL,
  batch_id    BIGINT       NULL,
  created_at  DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_sms_phone (phone, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*
   ==========================================================================
   کاتالوگ خدمات
   برگرفته از assets/js/data/services.js تا نسخه‌ی سرور و نسخه‌ی
   استاتیک سایت هرگز از هم جدا نیفتند.
   ==========================================================================
*/

/* بن مژه */
INSERT INTO services
  (id, slug, title, sms_name, tagline, short_text, image, icon, ig_link,
   duration_min, price_from, description, benefits, includes_json,
   before_reserve, care_label, precare, aftercare, contraindications,
   contraindications_note, good_for, faq, sort_order, active)
VALUES (
  'svc_ben_mozhe', 'ben-mozhe', 'بن مژه', 'بن مژه',
  'رازِ نگاه‌های نافذ، بی‌نیاز از خط‌چشم روزانه',
  'میکروپیگمنتیشن دقیق بین ریشه‌ی مژه‌ها؛ خطی طبیعی و همیشگی که چشم‌ها را درشت‌تر و پرتر نشان می‌دهد.',
  'assets/img/service-ben-mozhe.jpg', 'lash', NULL,
  120, 2500000,
  '["اگر از خط‌چشم زدن هر روز صبح خسته شده‌اید — همان خطی که تا ظهر پخش می‌شود — بن مژه دقیقاً همان چیزی است که دنبالش بودید. بن مژه یک تکنیک تخصصی میکروپیگمنتیشن است که دقیقاً بین ریشه‌ی مژه‌ها اجرا می‌شود و یک خط‌چشم طبیعی و همیشگی به چشم‌ها می‌دهد؛ انگار همیشه چشم‌ها آرایش‌شده و درشت به نظر می‌رسند، حتی صبح که از خواب بیدار می‌شوید.","از آنجا که رنگ‌دانه بین تارهای مژه می‌نشیند و نه بالای آن‌ها، نتیجه نه خط تیز و مصنوعی است و نه شبیه تاتو؛ فقط مژه‌ها پرپشت‌تر و چشم‌ها بازتر دیده می‌شوند. کار با طراحی و مشاوره شروع می‌شود و رنگ بر اساس رنگ پوست و رنگ چشم شما انتخاب می‌شود.","تمام ابزارها قبل از هر جلسه استریل می‌شوند و کار با بی‌حسی موضعی انجام می‌شود؛ بیشتر مراجعان آن را شبیه قلقلک یا خارش سبک توصیف می‌کنند."]',
  '["چشم‌ها را درشت‌تر، نافذتر و پرجذبه‌تر می‌کند","مژه‌ها را پرپشت‌تر و متراکم‌تر نشان می‌دهد، انگار مژه‌ی مصنوعی زده‌اید","دیگر نیازی به خط‌چشم روزانه ندارید؛ حتی زیر دوش و در استخر هم خط چشم سر جای خودش است","برای مژه‌های کم‌پشت و کم‌رنگ، تفاوتش چشمگیر است","نتیجه‌ای کاملاً طبیعی، نه مصنوعی و اغراق‌شده"]',
  '["مشاوره و طراحی متناسب با فرم چشم و رنگ پوست","بی‌حسی موضعی","اجرای میکروپیگمنتیشن بین ریشه‌ی مژه‌ها با ابزار استریل","یک جلسه ترمیم بعد از یک ماه","آموزش مراقبت خانگی و پماد توصیه‌شده"]',
  '["کل پروسه بدون درد است؛ فقط حس قلقلک و خارش سبک دارد.","تا یکی دو روز ممکن است تورم خفیفی داشته باشید که کاملاً طبیعی است و خودش برطرف می‌شود.","ماندگاری بن مژه بالای ۵ سال است و افت رنگ یا کدر شدن ندارد.","در صورت نیاز، یک ترمیم بعد از یک ماه انجام می‌شود تا نتیجه کامل و یکدست شود."]',
  'بن مژه و خط چشم دائم',
  '["در روز کار، بدون آرایش چشم و صورت سر جلسه بیایید.","تا ۲۴ ساعت قبل از نوبت از لنز تماسی استفاده نکنید؛ عینک را همراه داشته باشید.","حداقل ۲۴ ساعت قبل از نوبت، الکل مصرف نکنید.","از یک هفته قبل، مصرف داروهای رقیق‌کننده‌ی خون (مثل آسپرین) و مکمل‌هایی مثل امگا۳ را با تأیید پزشک محدود کنید.","اگر سابقه‌ی تبخال چشمی، التهاب یا عفونت فعال چشم، یا حساسیت پوستی در ناحیه‌ی پلک دارید، قبل از نوبت اطلاع دهید.","اگر تحت درمان دارویی خاص یا بیماری زمینه‌ای هستید، حتماً قبل از نوبت با ما هماهنگ کنید.","ترجیحاً با معده‌ی پر سر جلسه بیایید، نه ناشتا."]',
  '["تا ۲۴ ساعت اول ناحیه را خیس نکنید و در معرض بخار قرار ندهید.","تا ۷ روز از لنز تماسی استفاده نکنید و از عینک استفاده کنید.","از مالیدن یا خاراندن چشم خودداری کنید.","از ریمل، خط چشم و آرایش‌پاک‌کن روغنی روی ناحیه تا یک هفته استفاده نکنید.","پوسته‌ریزی خفیف طبیعی است؛ پوسته‌ها را نکنید و بگذارید خودشان بریزند.","تا ۲ هفته از استخر، سونا و آفتاب مستقیم دوری کنید.","پماد یا سرم توصیه‌شده را طبق دستور استفاده کنید.","رنگ نهایی حدود ۴ هفته بعد، پس از بهبودی کامل، مشخص می‌شود."]',
  '["بارداری و شیردهی","دیابت کنترل‌نشده","بیماری‌های قلبی-عروقی شدید و اخیر (سکته یا جراحی قلب اخیر)","فشار خون بالای کنترل‌نشده","اختلالات انعقاد خون یا مصرف داروهای رقیق‌کننده‌ی خون بدون تأیید پزشک","هپاتیت، HIV و سایر بیماری‌های واگیر خونی","صرع (اپی‌لپسی) کنترل‌نشده","سرطان و شیمی‌درمانی یا رادیوتراپی فعال یا اخیر","بیماری‌های خودایمنی فعال (مثل لوپوس، ویتیلیگو یا پسوریازیس فعال در ناحیه)","کلوئید یا سابقه‌ی جای زخم برجسته","عفونت پوستی، اگزما یا آکنه‌ی فعال در ناحیه‌ی مورد نظر","تبخال فعال در ناحیه‌ی لب","آلرژی شناخته‌شده به رنگدانه، لیدوکائین یا بی‌حسی موضعی","مصرف ایزوترتینوئین (آکوتان) طی ۶ ماه اخیر","جراحی زیبایی اخیر در ناحیه (کمتر از ۶ ماه)","بوتاکس یا فیلر اخیر در ناحیه (کمتر از ۲ تا ۴ هفته)","داروهای سرکوب‌کننده‌ی سیستم ایمنی","مصرف الکل یا مواد در روز انجام کار","سن زیر ۱۸ سال (بدون رضایت والدین طبق قوانین)","بیماری‌های روانی که مانع همکاری یا تصمیم‌گیری آگاهانه شوند"]',
  'در صورت هرگونه بیماری زمینه‌ای یا مصرف دارو، حتماً قبل از رزرو با ما هماهنگ کنید. بعضی از موارد بالا بسته به شدت و نظر پزشک قابل انجام هستند و در جلسه‌ی مشاوره بررسی می‌شوند.',
  '["مژه‌های کم‌پشت یا کم‌رنگ","کسانی که وقت یا حوصله‌ی خط‌چشم روزانه را ندارند","نگاهی طبیعی و همیشگی، بدون آرایش"]',
  '[{"q":"تفاوت بن مژه با خط چشم دائم چیست؟","a":"بن مژه دقیقاً بین ریشه‌ی مژه‌ها اجرا می‌شود و خط بسیار نازک و طبیعی است؛ خط چشم دائم روی خط مژه و با ضخامت و استایل دلخواه اجرا می‌شود. اگر نگاه نامحسوس می‌خواهید بن مژه، و اگر خط مشخص‌تر می‌خواهید خط چشم دائم مناسب‌تر است."},{"q":"دردناک است؟","a":"با بی‌حسی موضعی، بیشتر مراجعان آن را بدون درد و شبیه قلقلک سبک توصیف می‌کنند."},{"q":"چه زمانی رنگ نهایی مشخص می‌شود؟","a":"حدود یک ماه بعد و پس از بهبودی کامل. در روزهای اول رنگ کمی پررنگ‌تر دیده می‌شود که طبیعی است."}]',
  0, 1
)
ON DUPLICATE KEY UPDATE
  slug = VALUES(slug), title = VALUES(title), sms_name = VALUES(sms_name),
  tagline = VALUES(tagline),
  short_text = VALUES(short_text),
  image = VALUES(image), icon = VALUES(icon), duration_min = VALUES(duration_min),
  price_from = VALUES(price_from), description = VALUES(description),
  benefits = VALUES(benefits),
  includes_json = VALUES(includes_json), before_reserve = VALUES(before_reserve),
  care_label = VALUES(care_label), precare = VALUES(precare),
  aftercare = VALUES(aftercare),
  contraindications = VALUES(contraindications),
  contraindications_note = VALUES(contraindications_note),
  good_for = VALUES(good_for), faq = VALUES(faq), sort_order = VALUES(sort_order);

INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_ben_mozhe', 'ben_classic', 'بن مژه — کلاسیک', 'خط نازک بین تارهای مژه؛ طبیعی‌ترین حالت', 120, 2500000, 0)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);
INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_ben_mozhe', 'ben_intense', 'بن مژه — پررنگ', 'ضخامت بیشتر برای نگاه پررنگ‌تر', 135, 2900000, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);
INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_ben_mozhe', 'ben_wing', 'بن مژه با دم‌چشمی ظریف', 'امتداد ملایم در گوشه‌ی چشم', 150, 3200000, 2)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);
INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_ben_mozhe', 'ben_touchup', 'ترمیم (بعد از یک ماه)', 'جلسه‌ی تثبیت رنگ بعد از بهبودی کامل', 90, 1200000, 3)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);

/* خط چشم دائم */
INSERT INTO services
  (id, slug, title, sms_name, tagline, short_text, image, icon, ig_link,
   duration_min, price_from, description, benefits, includes_json,
   before_reserve, care_label, precare, aftercare, contraindications,
   contraindications_note, good_for, faq, sort_order, active)
VALUES (
  'svc_permanent_liner', 'permanent-liner', 'خط چشم دائم', 'خط چشم دائم',
  'نگاهی همیشه آماده، بدون نیاز به آرایش روزانه',
  'خط چشمی قرینه، ضدآب و ماندگار؛ با طراحی متناسب با فرم چشم و در استایل‌های مختلف.',
  'assets/img/service-permanent-liner.jpg', 'liner', NULL,
  150, 3200000,
  '["دیگر لازم نیست هر روز صبح وقت بگذارید تا خط‌چشم‌تان را کامل و قرینه بکشید. خط چشم دائم یک تکنیک تخصصی میکروپیگمنتیشن است که با دقت روی خط مژه‌ها اجرا می‌شود و یک خط‌چشم زیبا، قرینه و ماندگار به شما می‌دهد؛ چه صبح از خواب بیدار شوید، چه شب بیرون بروید، نگاهتان همیشه آماده و جذاب است.","کار با طراحی روی صورت شروع می‌شود: قبل از اجرا، فرم پیشنهادی و ضخامت خط را با شما هماهنگ می‌کنیم و تا زمانی که کاملاً راضی نباشید، کار شروع نمی‌شود. رنگ‌های مورد استفاده استاندارد و قابل جذب هستند و کار با بی‌حسی موضعی انجام می‌شود."]',
  '["خط‌چشمی کاملاً قرینه و متناسب با فرم چشم‌ها","چشم‌ها درشت‌تر، براق‌تر و پرجذبه‌تر دیده می‌شوند","صرفه‌جویی در وقت؛ دیگر نیازی به خط‌چشم زدن روزانه نیست","ضدآب و مقاوم در برابر عرق، اشک و شنا","قابل اجرا در استایل‌های مختلف؛ کلاسیک، اسموکی یا با دم‌چشمی ظریف"]',
  '["مشاوره و طراحی فرم روی صورت پیش از اجرا","تست حساسیت رنگ و بی‌حسی موضعی","اجرای خط چشم با ابزار استریل","یک جلسه ترمیم بعد از یک ماه","آموزش مراقبت خانگی و پماد توصیه‌شده"]',
  '["انجام کار تقریباً بدون درد است؛ فقط حس گزگز یا خارش خفیف دارد.","ممکن است تا یکی دو روز کمی قرمزی یا تورم سبک داشته باشید که طبیعی است.","ماندگاری‌اش بین ۲ تا ۵ سال است، بسته به نوع پوست و مراقبت.","برای حفظ شفافیت رنگ، بعد از حدود یک ماه یک جلسه ترمیم لازم است."]',
  'بن مژه و خط چشم دائم',
  '["در روز کار، بدون آرایش چشم و صورت سر جلسه بیایید.","تا ۲۴ ساعت قبل از نوبت از لنز تماسی استفاده نکنید؛ عینک را همراه داشته باشید.","حداقل ۲۴ ساعت قبل از نوبت، الکل مصرف نکنید.","از یک هفته قبل، مصرف داروهای رقیق‌کننده‌ی خون (مثل آسپرین) و مکمل‌هایی مثل امگا۳ را با تأیید پزشک محدود کنید.","اگر سابقه‌ی تبخال چشمی، التهاب یا عفونت فعال چشم، یا حساسیت پوستی در ناحیه‌ی پلک دارید، قبل از نوبت اطلاع دهید.","اگر تحت درمان دارویی خاص یا بیماری زمینه‌ای هستید، حتماً قبل از نوبت با ما هماهنگ کنید.","ترجیحاً با معده‌ی پر سر جلسه بیایید، نه ناشتا."]',
  '["تا ۲۴ ساعت اول ناحیه را خیس نکنید و در معرض بخار قرار ندهید.","تا ۷ روز از لنز تماسی استفاده نکنید و از عینک استفاده کنید.","از مالیدن یا خاراندن چشم خودداری کنید.","از ریمل، خط چشم و آرایش‌پاک‌کن روغنی روی ناحیه تا یک هفته استفاده نکنید.","پوسته‌ریزی خفیف طبیعی است؛ پوسته‌ها را نکنید و بگذارید خودشان بریزند.","تا ۲ هفته از استخر، سونا و آفتاب مستقیم دوری کنید.","پماد یا سرم توصیه‌شده را طبق دستور استفاده کنید.","رنگ نهایی حدود ۴ هفته بعد، پس از بهبودی کامل، مشخص می‌شود."]',
  '["بارداری و شیردهی","دیابت کنترل‌نشده","بیماری‌های قلبی-عروقی شدید و اخیر (سکته یا جراحی قلب اخیر)","فشار خون بالای کنترل‌نشده","اختلالات انعقاد خون یا مصرف داروهای رقیق‌کننده‌ی خون بدون تأیید پزشک","هپاتیت، HIV و سایر بیماری‌های واگیر خونی","صرع (اپی‌لپسی) کنترل‌نشده","سرطان و شیمی‌درمانی یا رادیوتراپی فعال یا اخیر","بیماری‌های خودایمنی فعال (مثل لوپوس، ویتیلیگو یا پسوریازیس فعال در ناحیه)","کلوئید یا سابقه‌ی جای زخم برجسته","عفونت پوستی، اگزما یا آکنه‌ی فعال در ناحیه‌ی مورد نظر","تبخال فعال در ناحیه‌ی لب","آلرژی شناخته‌شده به رنگدانه، لیدوکائین یا بی‌حسی موضعی","مصرف ایزوترتینوئین (آکوتان) طی ۶ ماه اخیر","جراحی زیبایی اخیر در ناحیه (کمتر از ۶ ماه)","بوتاکس یا فیلر اخیر در ناحیه (کمتر از ۲ تا ۴ هفته)","داروهای سرکوب‌کننده‌ی سیستم ایمنی","مصرف الکل یا مواد در روز انجام کار","سن زیر ۱۸ سال (بدون رضایت والدین طبق قوانین)","بیماری‌های روانی که مانع همکاری یا تصمیم‌گیری آگاهانه شوند"]',
  'در صورت هرگونه بیماری زمینه‌ای یا مصرف دارو، حتماً قبل از رزرو با ما هماهنگ کنید. بعضی از موارد بالا بسته به شدت و نظر پزشک قابل انجام هستند و در جلسه‌ی مشاوره بررسی می‌شوند.',
  '["کسانی که وقت آرایش روزانه ندارند","خط چشم نامتقارن یا پخش‌شونده","ورزش، شنا و سفر بدون نگرانی از خط چشم"]',
  '[{"q":"چقدر ماندگار است؟","a":"بسته به نوع پوست و مراقبت، بین ۲ تا ۵ سال. جلسه‌ی ترمیم بعد از یک ماه، رنگ را یکدست و شفاف می‌کند."},{"q":"دردناک است؟","a":"با بی‌حسی موضعی، بیشتر مراجعان آن را قابل تحمل و شبیه گزگز خفیف توصیف می‌کنند."},{"q":"چه زمانی رنگ نهایی مشخص می‌شود؟","a":"حدود ۴ هفته بعد و پس از بهبودی کامل؛ در روزهای اول رنگ تیره‌تر به نظر می‌رسد که طبیعی است."}]',
  1, 1
)
ON DUPLICATE KEY UPDATE
  slug = VALUES(slug), title = VALUES(title), sms_name = VALUES(sms_name),
  tagline = VALUES(tagline),
  short_text = VALUES(short_text),
  image = VALUES(image), icon = VALUES(icon), duration_min = VALUES(duration_min),
  price_from = VALUES(price_from), description = VALUES(description),
  benefits = VALUES(benefits),
  includes_json = VALUES(includes_json), before_reserve = VALUES(before_reserve),
  care_label = VALUES(care_label), precare = VALUES(precare),
  aftercare = VALUES(aftercare),
  contraindications = VALUES(contraindications),
  contraindications_note = VALUES(contraindications_note),
  good_for = VALUES(good_for), faq = VALUES(faq), sort_order = VALUES(sort_order);

INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_permanent_liner', 'liner_classic', 'خط چشم کلاسیک', 'خط مشخص با ضخامت دلخواه', 150, 3200000, 0)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);
INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_permanent_liner', 'liner_smoky', 'خط چشم اسموکی', 'محو و پنبه‌ای روی خط مژه', 165, 3600000, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);
INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_permanent_liner', 'liner_wing', 'خط چشم با دم‌چشمی ظریف', 'امتداد ملایم در گوشه‌ی چشم', 165, 3500000, 2)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);
INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_permanent_liner', 'liner_touchup', 'ترمیم (بعد از یک ماه)', 'جلسه‌ی تثبیت رنگ بعد از بهبودی کامل', 90, 1500000, 3)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);

/* دارک لیپس */
INSERT INTO services
  (id, slug, title, sms_name, tagline, short_text, image, icon, ig_link,
   duration_min, price_from, description, benefits, includes_json,
   before_reserve, care_label, precare, aftercare, contraindications,
   contraindications_note, good_for, faq, sort_order, active)
VALUES (
  'svc_dark_lips', 'dark-lips', 'دارک لیپس', 'دارک لیپس',
  'وداع با تیرگی لب‌ها، سلام به لب‌های صورتی و شفاف',
  'میکروپیگمنتیشن تخصصی برای پوشاندن تیرگی و کبودی لب و بازگرداندن رنگ طبیعی و یکدست.',
  'assets/img/service-dark-lips.jpg', 'lip', NULL,
  180, 4200000,
  '["تیرگی لب یکی از دغدغه‌های خیلی از خانم‌هاست که با آرایش هم به‌طور کامل پوشش داده نمی‌شود. دارک لیپس یک تکنیک تخصصی میکروپیگمنتیشن است که با پوشاندن رنگدانه‌های تیره‌ی لب و جایگزینی آن‌ها با رنگ‌های طبیعی و روشن، به لب‌ها رنگی صورتی، شفاف و سالم می‌دهد؛ بدون نیاز به رژلب.","رنگ نهایی بر اساس رنگ پوست و تیرگی لب شما انتخاب می‌شود. کار با بی‌حسی موضعی انجام می‌شود و در بیشتر موارد برای رسیدن به نتیجه‌ی ایده‌آل، دو جلسه لازم است: یک جلسه‌ی اصلی و یک ترمیم بعد از حدود ۳ ماه. رنگ واقعی لب هم بعد از التیام کامل، حدود ۴ تا ۵ روز، خودش را نشان می‌دهد."]',
  '["از بین بردن تیرگی و کبودی طبیعی یا اکتسابی لب","رنگ لب طبیعی، یکدست و شفاف حتی بدون آرایش","افزایش اعتمادبه‌نفس در لبخند و عکس‌گرفتن","ماندگاری بالا و نتیجه‌ای که هر روز تازه به نظر می‌رسد"]',
  '["مشاوره و انتخاب رنگ متناسب با پوست و میزان تیرگی لب","تست حساسیت رنگ پیش از شروع","بی‌حسی موضعی در چند مرحله","اجرای میکروپیگمنتیشن با ابزار استریل","آموزش مراقبت خانگی و برنامه‌ی دارویی در صورت نیاز"]',
  '["کار تقریباً بدون درد است؛ بی‌حسی موضعی هم استفاده می‌شود.","طبیعی است که تا چند روز لب کمی متورم یا خشک باشد.","رنگ نهایی معمولاً بعد از التیام کامل (حدود ۴ تا ۵ روز) مشخص می‌شود.","برای رسیدن به نتیجه‌ی ایده‌آل معمولاً ۲ جلسه (اصلی + ترمیم) لازم است که ترمیم بعد از گذشت ۳ ماه انجام می‌شود."]',
  'دارک لیپس و شیدینگ و تینت دائمی لب',
  '["از ۴۸ ساعت قبل، از هرگونه لایه‌بردار یا اسکراب لب خودداری کنید.","اگر سابقه‌ی تبخال (هرپس) دارید، حتماً قبل از نوبت اطلاع دهید تا داروی پیشگیری تجویز شود.","داروی پیشگیری را طبق تجویز پزشک از چند روز قبل از نوبت شروع کنید و تا ۳ روز بعد از کار ادامه دهید.","از یک هفته قبل، مصرف داروهای رقیق‌کننده‌ی خون (مثل آسپرین) و مکمل‌هایی مثل امگا۳ را در صورت امکان و با تأیید پزشک محدود کنید.","حداقل ۲۴ ساعت قبل از نوبت، الکل مصرف نکنید.","در روز کار، از رژلب یا محصولات آرایشی روی لب استفاده نکنید.","لب‌ها را با مرطوب‌کننده یا بالم بدون رنگ، آماده و نرم نگه دارید.","ترجیحاً با معده‌ی پر سر جلسه بیایید، نه ناشتا.","اگر تحت درمان دارویی خاص یا بیماری زمینه‌ای هستید، حتماً قبل از نوبت با ما هماهنگ کنید."]',
  '["تا ۲ الی ۳ روز، هیچ نوع شوینده (صابون، ژل شست‌وشو و…) نباید به لب‌ها برسد.","در چند روز اول با یک پد پنبه‌ای مرطوب‌شده با آب جوشیده‌ی ولرم و به‌صورت ضربه‌ای (نه مالشی) روی لب بزنید؛ این کار لنف اضافه را خارج می‌کند و در همان حال رطوبت خوبی به لب می‌رساند.","در صورت تورم لب، کمپرس یخ را داخل پارچه‌ی تمیز بپیچید و کوتاه و متناوب روی لب بگذارید؛ یخ را مستقیم با پوست تماس ندهید.","به‌هیچ‌وجه از هیچ نوع پمادی بعد از کار استفاده نکنید.","لب‌ها را خشک نگه دارید؛ از خیس‌کاری زیاد یا لیسیدن مکرر لب پرهیز کنید.","تا بهبودی کامل، از رژلب، مداد لب و سایر محصولات آرایشی روی لب استفاده نکنید.","در چند روز اول از خوردن غذاهای خیلی داغ، تند یا شور خودداری کنید تا لب کمتر تحریک شود.","پوسته‌ریزی طبیعی است؛ پوسته‌ها را نکنید و بگذارید خودشان بریزند، وگرنه رنگ‌دهی یکنواخت نمی‌شود.","تا التیام کامل، از قرارگیری مستقیم در معرض آفتاب، سونا و استخر خودداری کنید.","از خمیردندان‌های سفیدکننده (مثل تری‌دی وایت) در این دوره استفاده نکنید.","اگر تبخال زدید، داروی تجویزشده را طبق برنامه تا ۳ روز بعد از کار ادامه دهید و در صورت نیاز با پزشک تماس بگیرید."]',
  '["بارداری و شیردهی","دیابت کنترل‌نشده","بیماری‌های قلبی-عروقی شدید و اخیر (سکته یا جراحی قلب اخیر)","فشار خون بالای کنترل‌نشده","اختلالات انعقاد خون یا مصرف داروهای رقیق‌کننده‌ی خون بدون تأیید پزشک","هپاتیت، HIV و سایر بیماری‌های واگیر خونی","صرع (اپی‌لپسی) کنترل‌نشده","سرطان و شیمی‌درمانی یا رادیوتراپی فعال یا اخیر","بیماری‌های خودایمنی فعال (مثل لوپوس، ویتیلیگو یا پسوریازیس فعال در ناحیه)","کلوئید یا سابقه‌ی جای زخم برجسته","عفونت پوستی، اگزما یا آکنه‌ی فعال در ناحیه‌ی مورد نظر","تبخال فعال در ناحیه‌ی لب","آلرژی شناخته‌شده به رنگدانه، لیدوکائین یا بی‌حسی موضعی","مصرف ایزوترتینوئین (آکوتان) طی ۶ ماه اخیر","جراحی زیبایی اخیر در ناحیه (کمتر از ۶ ماه)","بوتاکس یا فیلر اخیر در ناحیه (کمتر از ۲ تا ۴ هفته)","داروهای سرکوب‌کننده‌ی سیستم ایمنی","مصرف الکل یا مواد در روز انجام کار","سن زیر ۱۸ سال (بدون رضایت والدین طبق قوانین)","بیماری‌های روانی که مانع همکاری یا تصمیم‌گیری آگاهانه شوند"]',
  'در صورت هرگونه بیماری زمینه‌ای یا مصرف دارو، حتماً قبل از رزرو با ما هماهنگ کنید. بعضی از موارد بالا بسته به شدت و نظر پزشک قابل انجام هستند و در جلسه‌ی مشاوره بررسی می‌شوند.',
  '["لب‌های تیره یا کبود","لب‌هایی که با رژلب هم یکدست پوشش داده نمی‌شوند","کسانی که رنگ طبیعی و همیشگی لب می‌خواهند"]',
  '[{"q":"چرا دو جلسه لازم است؟","a":"دارک لیپس اول تیرگی را متعادل می‌کند و رنگ طبیعی را برمی‌گرداند؛ جلسه‌ی ترمیم بعد از حدود ۳ ماه، رنگ را یکدست و کامل می‌کند. در بعضی لب‌ها که تیرگی کم است، یک جلسه هم کافی است."},{"q":"خیلی درد دارد؟","a":"با بی‌حسی موضعی که در چند مرحله تکرار می‌شود، بیشتر مراجعان آن را قابل تحمل توصیف می‌کنند."},{"q":"اگر سابقه‌ی تبخال داشته باشم چه؟","a":"حتماً از قبل به ما بگویید تا داروی پیشگیری تجویز شود؛ کار روی لب می‌تواند تبخال را فعال کند."}]',
  2, 1
)
ON DUPLICATE KEY UPDATE
  slug = VALUES(slug), title = VALUES(title), sms_name = VALUES(sms_name),
  tagline = VALUES(tagline),
  short_text = VALUES(short_text),
  image = VALUES(image), icon = VALUES(icon), duration_min = VALUES(duration_min),
  price_from = VALUES(price_from), description = VALUES(description),
  benefits = VALUES(benefits),
  includes_json = VALUES(includes_json), before_reserve = VALUES(before_reserve),
  care_label = VALUES(care_label), precare = VALUES(precare),
  aftercare = VALUES(aftercare),
  contraindications = VALUES(contraindications),
  contraindications_note = VALUES(contraindications_note),
  good_for = VALUES(good_for), faq = VALUES(faq), sort_order = VALUES(sort_order);

INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_dark_lips', 'dark_main', 'دارک لیپس — جلسه‌ی اصلی', 'پوشاندن تیرگی و متعادل‌سازی رنگ لب', 180, 4200000, 0)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);
INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_dark_lips', 'dark_package', 'پکیج دو جلسه‌ای (اصلی + ترمیم)', 'ترمیم بعد از ۳ ماه؛ نتیجه‌ی نهایی و یکدست', 360, 7000000, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);
INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_dark_lips', 'dark_touchup', 'ترمیم تک‌جلسه', 'برای لب‌هایی که قبلاً کار کرده‌اند', 90, 2200000, 2)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);

/* شیدینگ و تینت دائمی لب */
INSERT INTO services
  (id, slug, title, sms_name, tagline, short_text, image, icon, ig_link,
   duration_min, price_from, description, benefits, includes_json,
   before_reserve, care_label, precare, aftercare, contraindications,
   contraindications_note, good_for, faq, sort_order, active)
VALUES (
  'svc_lip_blush', 'lip-blush', 'شیدینگ و تینت دائمی لب', 'شیدینگ لب',
  'لب‌هایی پرحجم‌تر، رنگی‌تر و همیشه آماده',
  'رنگ‌گذاری ملایم و محو روی لب؛ رنگی طبیعی و همیشگی، بدون خط دور تیز و بدون رژلب روزانه.',
  'assets/img/service-lip-blush.jpg', 'lip', NULL,
  150, 3200000,
  '["دیگر نیازی نیست هر بار قبل از بیرون رفتن رژلب بزنید. شیدینگ و تینت دائمی لب با پاشیدن ملایم رنگ‌دانه روی لب، هم کانتور لب را زیباتر می‌کند و هم یک رنگ دلخواه و ماندگار به آن می‌دهد؛ نتیجه‌ای شبیه رژلب مات و طبیعی، ولی همیشگی.","برخلاف تتوهای قدیمی، این‌جا خبری از خط دور تیره و تیز نیست. رنگ بر اساس رنگ پوست، رنگ لب و حتی گرمی یا سردی زیرلحن پوست شما انتخاب می‌شود. کار با بی‌حسی موضعی انجام می‌شود و رنگ واقعی حدود ۴ تا ۵ روز بعد، پس از التیام، خودش را نشان می‌دهد."]',
  '["لب‌ها پرحجم‌تر و فرم‌دارتر به نظر می‌رسند","امکان انتخاب رنگ دلخواه، از صورتی طبیعی تا رنگ‌های پررنگ‌تر","پوشش نامنظمی‌ها و کم‌رنگی طبیعی لب","ماندگاری بالا و صرفه‌جویی در استفاده‌ی روزانه از رژلب"]',
  '["مشاوره و انتخاب رنگ متناسب با پوست و لب شما","تست حساسیت رنگ پیش از شروع","طراحی و اصلاح فرم لب روی صورت","بی‌حسی موضعی در چند مرحله","یک جلسه ترمیم بعد از یک ماه"]',
  '["کار تقریباً بدون درد است؛ بی‌حسی موضعی استفاده می‌شود.","تا چند روز اول ممکن است لب کمی متورم، خشک یا پوسته‌پوسته باشد که طبیعی است.","رنگ نهایی واقعی معمولاً بعد از حدود ۴ تا ۵ روز دیده می‌شود.","برای ماندگاری بهتر، یک جلسه ترمیم بعد از یک ماه توصیه می‌شود."]',
  'دارک لیپس و شیدینگ و تینت دائمی لب',
  '["از ۴۸ ساعت قبل، از هرگونه لایه‌بردار یا اسکراب لب خودداری کنید.","اگر سابقه‌ی تبخال (هرپس) دارید، حتماً قبل از نوبت اطلاع دهید تا داروی پیشگیری تجویز شود.","داروی پیشگیری را طبق تجویز پزشک از چند روز قبل از نوبت شروع کنید و تا ۳ روز بعد از کار ادامه دهید.","از یک هفته قبل، مصرف داروهای رقیق‌کننده‌ی خون (مثل آسپرین) و مکمل‌هایی مثل امگا۳ را در صورت امکان و با تأیید پزشک محدود کنید.","حداقل ۲۴ ساعت قبل از نوبت، الکل مصرف نکنید.","در روز کار، از رژلب یا محصولات آرایشی روی لب استفاده نکنید.","لب‌ها را با مرطوب‌کننده یا بالم بدون رنگ، آماده و نرم نگه دارید.","ترجیحاً با معده‌ی پر سر جلسه بیایید، نه ناشتا.","اگر تحت درمان دارویی خاص یا بیماری زمینه‌ای هستید، حتماً قبل از نوبت با ما هماهنگ کنید."]',
  '["تا ۲ الی ۳ روز، هیچ نوع شوینده (صابون، ژل شست‌وشو و…) نباید به لب‌ها برسد.","در چند روز اول با یک پد پنبه‌ای مرطوب‌شده با آب جوشیده‌ی ولرم و به‌صورت ضربه‌ای (نه مالشی) روی لب بزنید؛ این کار لنف اضافه را خارج می‌کند و در همان حال رطوبت خوبی به لب می‌رساند.","در صورت تورم لب، کمپرس یخ را داخل پارچه‌ی تمیز بپیچید و کوتاه و متناوب روی لب بگذارید؛ یخ را مستقیم با پوست تماس ندهید.","به‌هیچ‌وجه از هیچ نوع پمادی بعد از کار استفاده نکنید.","لب‌ها را خشک نگه دارید؛ از خیس‌کاری زیاد یا لیسیدن مکرر لب پرهیز کنید.","تا بهبودی کامل، از رژلب، مداد لب و سایر محصولات آرایشی روی لب استفاده نکنید.","در چند روز اول از خوردن غذاهای خیلی داغ، تند یا شور خودداری کنید تا لب کمتر تحریک شود.","پوسته‌ریزی طبیعی است؛ پوسته‌ها را نکنید و بگذارید خودشان بریزند، وگرنه رنگ‌دهی یکنواخت نمی‌شود.","تا التیام کامل، از قرارگیری مستقیم در معرض آفتاب، سونا و استخر خودداری کنید.","از خمیردندان‌های سفیدکننده (مثل تری‌دی وایت) در این دوره استفاده نکنید.","اگر تبخال زدید، داروی تجویزشده را طبق برنامه تا ۳ روز بعد از کار ادامه دهید و در صورت نیاز با پزشک تماس بگیرید."]',
  '["بارداری و شیردهی","دیابت کنترل‌نشده","بیماری‌های قلبی-عروقی شدید و اخیر (سکته یا جراحی قلب اخیر)","فشار خون بالای کنترل‌نشده","اختلالات انعقاد خون یا مصرف داروهای رقیق‌کننده‌ی خون بدون تأیید پزشک","هپاتیت، HIV و سایر بیماری‌های واگیر خونی","صرع (اپی‌لپسی) کنترل‌نشده","سرطان و شیمی‌درمانی یا رادیوتراپی فعال یا اخیر","بیماری‌های خودایمنی فعال (مثل لوپوس، ویتیلیگو یا پسوریازیس فعال در ناحیه)","کلوئید یا سابقه‌ی جای زخم برجسته","عفونت پوستی، اگزما یا آکنه‌ی فعال در ناحیه‌ی مورد نظر","تبخال فعال در ناحیه‌ی لب","آلرژی شناخته‌شده به رنگدانه، لیدوکائین یا بی‌حسی موضعی","مصرف ایزوترتینوئین (آکوتان) طی ۶ ماه اخیر","جراحی زیبایی اخیر در ناحیه (کمتر از ۶ ماه)","بوتاکس یا فیلر اخیر در ناحیه (کمتر از ۲ تا ۴ هفته)","داروهای سرکوب‌کننده‌ی سیستم ایمنی","مصرف الکل یا مواد در روز انجام کار","سن زیر ۱۸ سال (بدون رضایت والدین طبق قوانین)","بیماری‌های روانی که مانع همکاری یا تصمیم‌گیری آگاهانه شوند"]',
  'در صورت هرگونه بیماری زمینه‌ای یا مصرف دارو، حتماً قبل از رزرو با ما هماهنگ کنید. بعضی از موارد بالا بسته به شدت و نظر پزشک قابل انجام هستند و در جلسه‌ی مشاوره بررسی می‌شوند.',
  '["لب‌های کم‌رنگ یا بی‌حالت","نامتقارنی فرم لب","کسانی که رژلب دائمی و طبیعی می‌خواهند"]',
  '[{"q":"رنگ اولش خیلی تند نیست؟","a":"در چند روز اول رنگ تیره‌تر از حالت نهایی دیده می‌شود که کاملاً طبیعی است و بعد از پوسته‌ریزی ملایم می‌شود."},{"q":"چقدر ماندگار است؟","a":"معمولاً بین یک تا سه سال؛ لب به دلیل بازسازی سریع پوستش زودتر از ابرو کم‌رنگ می‌شود و جلسه‌ی ترمیم رنگ را تازه نگه می‌دارد."},{"q":"چند وقت بعد می‌توانم رژلب بزنم؟","a":"تا بهبودی کامل، از رژلب و محصولات آرایشی روی لب استفاده نکنید؛ این مدت معمولاً حدود یک هفته است."}]',
  3, 1
)
ON DUPLICATE KEY UPDATE
  slug = VALUES(slug), title = VALUES(title), sms_name = VALUES(sms_name),
  tagline = VALUES(tagline),
  short_text = VALUES(short_text),
  image = VALUES(image), icon = VALUES(icon), duration_min = VALUES(duration_min),
  price_from = VALUES(price_from), description = VALUES(description),
  benefits = VALUES(benefits),
  includes_json = VALUES(includes_json), before_reserve = VALUES(before_reserve),
  care_label = VALUES(care_label), precare = VALUES(precare),
  aftercare = VALUES(aftercare),
  contraindications = VALUES(contraindications),
  contraindications_note = VALUES(contraindications_note),
  good_for = VALUES(good_for), faq = VALUES(faq), sort_order = VALUES(sort_order);

INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_lip_blush', 'tint_shading', 'شیدینگ لب (محو و طبیعی)', 'رنگ ملایم و پخش‌شده؛ طبیعی‌ترین حالت', 150, 3200000, 0)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);
INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_lip_blush', 'tint_full', 'تینت دائمی کامل', 'پوشش یکدست کل لب با رنگ سیرتر', 180, 3900000, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);
INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_lip_blush', 'tint_custom', 'رنگ دلخواه', 'از صورتی طبیعی تا رنگ‌های پررنگ‌تر', 165, 3500000, 2)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);
INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_lip_blush', 'tint_touchup', 'ترمیم (بعد از یک ماه)', 'برای ماندگاری و یکدستی بیشتر', 90, 1500000, 3)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);

/* میکروبلیدینگ و میکروپیگمنتیشن ابرو */
INSERT INTO services
  (id, slug, title, sms_name, tagline, short_text, image, icon, ig_link,
   duration_min, price_from, description, benefits, includes_json,
   before_reserve, care_label, precare, aftercare, contraindications,
   contraindications_note, good_for, faq, sort_order, active)
VALUES (
  'svc_brows', 'microblading', 'میکروبلیدینگ و میکروپیگمنتیشن ابرو', 'میکروبلیدینگ ابرو',
  'ابروهایی طبیعی، پرپشت و همیشه مرتب',
  'تار به تار، شبیه موی طبیعی ابرو؛ فرمی متقارن و پرپشت که کسی متوجه نمی‌شود کار کرده‌اید.',
  'assets/img/service-microblading.jpg', 'brow', NULL,
  165, 3800000,
  '["دیگر لازم نیست هر روز وقت بگذارید تا ابروها را با مداد یا سایه پر کنید و فرم بدهید. میکروبلیدینگ یک تکنیک تخصصی و دقیق است که با کشیدن تار به تار و شبیه‌سازی موهای طبیعی ابرو، فرمی زیبا، متقارن و پرپشت به ابروها می‌دهد؛ نتیجه آن‌قدر طبیعی است که کسی متوجه نمی‌شود کاری انجام شده و فقط فکر می‌کنند ابروهای خودتان همین‌طور است.","کار با طراحی آغاز می‌شود: قبل از اجرا فرم پیشنهادی روی صورت رسم می‌شود و تا زمانی که کاملاً راضی نباشید، اجرا شروع نمی‌شود. رنگ بر اساس رنگ مو و پوست انتخاب می‌شود و کار با بی‌حسی موضعی انجام می‌شود. رنگ نهایی و واقعی بعد از حدود ۲ تا ۴ هفته و پس از افتادن کامل پوسته‌ها مشخص می‌شود."]',
  '["فرم و قرینگی کامل متناسب با حالت صورت","پوشش کامل جاهای خالی، کم‌پشتی یا نامنظمی ابرو","نتیجه‌ای کاملاً طبیعی و تار به تار، نه یکدست و مصنوعی","صرفه‌جویی در وقت؛ دیگر نیازی به آرایش روزانه‌ی ابرو نیست","مناسب برای ابروی کم‌پشت، نامتقارن یا آسیب‌دیده از اصلاح زیاد"]',
  '["مشاوره و طراحی فرم روی صورت پیش از اجرا","تست حساسیت رنگ و بی‌حسی موضعی","اجرای میکروبلیدینگ یا میکروپیگمنتیشن با ابزار استریل","یک جلسه ترمیم بعد از ۴ تا ۶ هفته","آموزش مراقبت خانگی و پماد توصیه‌شده"]',
  '["کار تقریباً بدون درد است؛ بی‌حسی موضعی هم استفاده می‌شود.","طبیعی است که ۲ تا ۳ روز اول رنگ کمی پررنگ‌تر از حالت نهایی به نظر برسد.","ممکن است کمی قرمزی یا تورم خفیف در همان روز اول داشته باشید.","رنگ نهایی و واقعی بعد از حدود ۲ تا ۴ هفته و پس از افتادن پوسته‌ها مشخص می‌شود.","برای نتیجه‌ی کامل، یک جلسه ترمیم بعد از ۴ تا ۶ هفته لازم است."]',
  'میکروبلیدینگ و میکروپیگمنتیشن ابرو',
  '["از ۴۸ ساعت قبل، اپیلاسیون، اصلاح یا رنگ ابرو انجام ندهید.","از یک هفته قبل، مصرف داروهای رقیق‌کننده‌ی خون (مثل آسپرین) و مکمل‌هایی مثل امگا۳ را در صورت امکان و با تأیید پزشک محدود کنید.","حداقل ۲۴ ساعت قبل از نوبت، الکل مصرف نکنید.","از یک هفته قبل، از لایه‌بردار، رتینول یا کرم‌های ضدپیری روی ناحیه‌ی ابرو استفاده نکنید.","در روز کار، از آرایش ابرو (مداد، سایه، ژل) استفاده نکنید.","اگر بوتاکس یا فیلر در ناحیه‌ی پیشانی یا ابرو انجام داده‌اید، حداقل ۲ هفته فاصله بگذارید.","اگر تحت درمان دارویی خاص یا بیماری زمینه‌ای هستید، حتماً قبل از نوبت با ما هماهنگ کنید.","ترجیحاً با معده‌ی پر سر جلسه بیایید، نه ناشتا."]',
  '["تا ۲۴ ساعت اول از تماس آب با ناحیه‌ی ابرو خودداری کنید.","از هیچ‌گونه پمادی بعد از انجام کار استفاده نکنید.","ناحیه را خشک نگه دارید؛ تا التیام کامل از تعریق شدید، ورزش سنگین، سونا و استخر خودداری کنید.","پوسته‌ریزی طبیعی است؛ پوسته‌ها را نکنید و بگذارید خودشان بریزند، وگرنه رنگ‌دهی یکنواخت نمی‌شود.","تا التیام کامل، از آرایش مستقیم روی ابرو (مداد، سایه، ژل) استفاده نکنید.","از قرارگیری مستقیم در معرض آفتاب تا التیام کامل پرهیز کنید؛ بعد از بهبودی هم روی ناحیه ضدآفتاب بزنید.","در روزهای اول، عینک آفتابی یا کلاه هنگام بیرون رفتن توصیه می‌شود.","رنگ نهایی و واقعی بعد از ۲ تا ۴ هفته و پس از افتادن کامل پوسته‌ها مشخص می‌شود."]',
  '["بارداری و شیردهی","دیابت کنترل‌نشده","بیماری‌های قلبی-عروقی شدید و اخیر (سکته یا جراحی قلب اخیر)","فشار خون بالای کنترل‌نشده","اختلالات انعقاد خون یا مصرف داروهای رقیق‌کننده‌ی خون بدون تأیید پزشک","هپاتیت، HIV و سایر بیماری‌های واگیر خونی","صرع (اپی‌لپسی) کنترل‌نشده","سرطان و شیمی‌درمانی یا رادیوتراپی فعال یا اخیر","بیماری‌های خودایمنی فعال (مثل لوپوس، ویتیلیگو یا پسوریازیس فعال در ناحیه)","کلوئید یا سابقه‌ی جای زخم برجسته","عفونت پوستی، اگزما یا آکنه‌ی فعال در ناحیه‌ی مورد نظر","تبخال فعال در ناحیه‌ی لب","آلرژی شناخته‌شده به رنگدانه، لیدوکائین یا بی‌حسی موضعی","مصرف ایزوترتینوئین (آکوتان) طی ۶ ماه اخیر","جراحی زیبایی اخیر در ناحیه (کمتر از ۶ ماه)","بوتاکس یا فیلر اخیر در ناحیه (کمتر از ۲ تا ۴ هفته)","داروهای سرکوب‌کننده‌ی سیستم ایمنی","مصرف الکل یا مواد در روز انجام کار","سن زیر ۱۸ سال (بدون رضایت والدین طبق قوانین)","بیماری‌های روانی که مانع همکاری یا تصمیم‌گیری آگاهانه شوند"]',
  'در صورت هرگونه بیماری زمینه‌ای یا مصرف دارو، حتماً قبل از رزرو با ما هماهنگ کنید. بعضی از موارد بالا بسته به شدت و نظر پزشک قابل انجام هستند و در جلسه‌ی مشاوره بررسی می‌شوند.',
  '["ابروی کم‌پشت یا نامتقارن","جاهای خالی ابرو","ابروی آسیب‌دیده از اصلاح زیاد"]',
  '[{"q":"تفاوت میکروبلیدینگ و نانوبروز چیست؟","a":"میکروبلیدینگ با تیغه‌ی دستی و نانوبروز با دستگاه انجام می‌شود؛ هر دو نتیجه‌ی تار به تار و طبیعی دارند. در جلسه‌ی مشاوره بر اساس نوع پوست شما، روش مناسب‌تر انتخاب می‌شود."},{"q":"چقدر ماندگار است؟","a":"معمولاً بین یک تا سه سال، بسته به نوع پوست و مراقبت. ترمیم دوره‌ای رنگ را تازه نگه می‌دارد."},{"q":"چه زمانی رنگ نهایی مشخص می‌شود؟","a":"حدود ۲ تا ۴ هفته بعد و پس از افتادن کامل پوسته‌ها."}]',
  4, 1
)
ON DUPLICATE KEY UPDATE
  slug = VALUES(slug), title = VALUES(title), sms_name = VALUES(sms_name),
  tagline = VALUES(tagline),
  short_text = VALUES(short_text),
  image = VALUES(image), icon = VALUES(icon), duration_min = VALUES(duration_min),
  price_from = VALUES(price_from), description = VALUES(description),
  benefits = VALUES(benefits),
  includes_json = VALUES(includes_json), before_reserve = VALUES(before_reserve),
  care_label = VALUES(care_label), precare = VALUES(precare),
  aftercare = VALUES(aftercare),
  contraindications = VALUES(contraindications),
  contraindications_note = VALUES(contraindications_note),
  good_for = VALUES(good_for), faq = VALUES(faq), sort_order = VALUES(sort_order);

INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_brows', 'brow_nano', 'نانوبروز / تار به تار', 'شبیه موی طبیعی ابرو؛ طبیعی‌ترین نتیجه', 165, 3800000, 0)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);
INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_brows', 'brow_powder', 'شیدینگ و پودری ابرو', 'پرپشت و پودری؛ مناسب پوست چرب', 150, 3400000, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);
INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_brows', 'brow_combo', 'ترکیبی (تار + پودر)', 'پرپشتی پودری با تارهای طبیعی', 180, 4200000, 2)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);
INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_brows', 'brow_touchup', 'ترمیم (۴ تا ۶ هفته)', 'جلسه‌ی تثبیت رنگ بعد از بهبودی کامل', 90, 1400000, 3)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);

/* لیفت و لمینت مژه و ابرو */
INSERT INTO services
  (id, slug, title, sms_name, tagline, short_text, image, icon, ig_link,
   duration_min, price_from, description, benefits, includes_json,
   before_reserve, care_label, precare, aftercare, contraindications,
   contraindications_note, good_for, faq, sort_order, active)
VALUES (
  'svc_lift_lam', 'lift-lamination', 'لیفت و لمینت مژه و ابرو', 'لیفت و لمینت',
  'فرم‌دهی طبیعی، بدون اکستنشن و رنگ روزانه',
  'فرم‌دهی و تقویت تارهای طبیعی؛ بدون کاشت، با نتیجه‌ای شفاف و مرتب که چند هفته می‌ماند.',
  'assets/img/service-lift-lamination.jpg', 'lift', NULL,
  75, 850000,
  '["دل‌تان می‌خواهد مژه‌ها فرفری‌تر و بلندتر به نظر برسند یا ابروها مرتب و پرپشت‌تر شوند، بدون اکستنشن و بدون آرایش روزانه؟ لیفت و لمینت دقیقاً همین کار را می‌کند. این روش با فرم‌دهی و تقویت موهای طبیعی مژه و ابرو، ظاهری مرتب، پرپشت و جذاب ایجاد می‌کند که چند هفته ماندگار است؛ انگار هر روز صبح از آرایشگاه آمده‌اید.","لیفت مژه با محلول‌های ملایم، تار مژه‌ی طبیعی شما را از ریشه فرم می‌دهد و بالا می‌آورد؛ بدون آنکه چیزی به مژه اضافه شود. لمینت ابرو هم تارهای نامنظم ابرو را در جهت دلخواه ثابت می‌کند و باعث می‌شود ابرو پرپشت‌تر و مرتب‌تر دیده شود؛ مخصوصاً برای ابروهایی که تارهای سرکش دارند.","این خدمت سبک‌ترین گزینه‌ی ماست: نه وزنی به مژه اضافه می‌شود و نه رنگ‌دانه‌ای به پوست می‌رسد. نتیجه معمولاً بین ۴ تا ۶ هفته باقی می‌ماند و برای حفظ آن، تکرار هر ۴ تا ۶ هفته توصیه می‌شود."]',
  '["مژه‌ها فرفری‌تر، بلندتر و پرپشت‌تر به نظر می‌رسند، بدون نیاز به مژه‌ی مصنوعی","ابروها مرتب، پرپشت و فرم‌گرفته می‌شوند، حتی اگر تار سرکش داشته باشند","روشی سبک و کاملاً طبیعی، برخلاف اکستنشن یا تاتو","نتیجه‌ای که چند هفته (معمولاً ۴ تا ۶ هفته) ماندگار است","بدون نیاز به ریمل یا ژل ابرو روزانه؛ صبح‌ها فقط چند دقیقه صرفه‌جویی در وقت"]',
  '["پاک‌سازی و آماده‌سازی ناحیه","فرم‌دهی با محلول ملایم و بدون آمونیاک","سرم تقویتی کراتین در پایان کار","مشاوره‌ی مراقبت خانگی"]',
  '["کاملاً بدون درد است.","ماندگاری معمولاً بین ۴ تا ۶ هفته است، بسته به سیکل رشد طبیعی مو.","برای حفظ نتیجه، تکرار هر ۴ تا ۶ هفته یک‌بار توصیه می‌شود."]',
  'لیفت و لمینت مژه و ابرو',
  '["از ۲۴ ساعت قبل، از ریمل، خط چشم یا هرگونه آرایش چشم استفاده نکنید.","در روز انجام کار از لنز تماسی استفاده نکنید یا لنزتان را همراه داشته باشید.","از یک هفته قبل، اکستنشن مژه یا هر کار حرفه‌ای دیگر روی مژه و ابرو انجام ندهید.","اگر التهاب، عفونت چشم یا حساسیت پوستی فعال دارید، نوبت را به تعویق بیندازید.","اگر کار دائمی (میکروپیگمنتیشن) یا تزریق اخیر در ناحیه‌ی ابرو داشتید، حتماً به متخصص اطلاع دهید.","ترجیحاً بدون آرایش صورت سر جلسه بیایید تا کار تمیزتر انجام شود."]',
  '["تا ۲۴ تا ۴۸ ساعت اول، از تماس آب، بخار یا رطوبت (حمام داغ، سونا، استخر) با ناحیه خودداری کنید.","در همین بازه، از خواب روی صورت یا فشار به مژه و ابرو پرهیز کنید.","ریمل، خط چشم و آرایش ابرو را حداقل تا ۲۴ ساعت اول استفاده نکنید.","از مالیدن یا کشیدن مژه‌ها و ابروها خودداری کنید تا فرم به‌هم نریزد.","در روزهای اول از حلال آرایش چشم یا محصولات روغنی قوی روی ناحیه پرهیز کنید.","برای ماندگاری بهتر، از سرم یا روغن تقویتی مخصوص مژه و ابرو (طبق توصیه‌ی متخصص) استفاده کنید.","برای حفظ نتیجه، تکرار هر ۴ تا ۶ هفته یک‌بار توصیه می‌شود."]',
  '[]',
  NULL,
  '["مژه‌های صاف رو به پایین","ابروهای نامنظم یا با تار سرکش","کسانی که کاشت یا کار دائمی نمی‌خواهند"]',
  '[{"q":"تفاوتش با اکستنشن چیست؟","a":"در لیفت چیزی به مژه اضافه نمی‌شود؛ فقط تار طبیعی خودتان فرم می‌گیرد. سبک‌تر است اما حجم اضافه نمی‌کند."},{"q":"برای مژه‌ی کوتاه هم جواب می‌دهد؟","a":"بله، اما نتیجه‌ی چشمگیرتر روی مژه‌های با طول متوسط به بالا دیده می‌شود."},{"q":"هر چند وقت باید تکرار شود؟","a":"معمولاً هر ۴ تا ۶ هفته یک‌بار."}]',
  5, 1
)
ON DUPLICATE KEY UPDATE
  slug = VALUES(slug), title = VALUES(title), sms_name = VALUES(sms_name),
  tagline = VALUES(tagline),
  short_text = VALUES(short_text),
  image = VALUES(image), icon = VALUES(icon), duration_min = VALUES(duration_min),
  price_from = VALUES(price_from), description = VALUES(description),
  benefits = VALUES(benefits),
  includes_json = VALUES(includes_json), before_reserve = VALUES(before_reserve),
  care_label = VALUES(care_label), precare = VALUES(precare),
  aftercare = VALUES(aftercare),
  contraindications = VALUES(contraindications),
  contraindications_note = VALUES(contraindications_note),
  good_for = VALUES(good_for), faq = VALUES(faq), sort_order = VALUES(sort_order);

INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_lift_lam', 'lash_lift', 'لیفت مژه', 'فر و بالا آمدن مژه‌های طبیعی', 60, 850000, 0)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);
INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_lift_lam', 'lash_tint', 'لیفت + رنگ مژه', 'برای مژه‌های روشن یا کم‌رنگ', 75, 1050000, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);
INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_lift_lam', 'brow_lam', 'لمینت ابرو', 'نظم‌دهی و پرپشت دیده شدن ابرو', 60, 900000, 2)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);
INSERT INTO service_variants
  (service_id, variant_key, name, note, duration_min, price, sort_order)
VALUES ('svc_lift_lam', 'combo', 'پکیج مژه + ابرو', 'صرفه‌جویی در وقت و هزینه', 105, 1650000, 3)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), note = VALUES(note),
  duration_min = VALUES(duration_min), price = VALUES(price),
  sort_order = VALUES(sort_order);

/*
   ==========================================================================
   خدمت‌هایی که دیگر ارائه نمی‌شوند
   
   عمداً حذف نمی‌شوند: هر نوبتِ ثبت‌شده با service_id به خدمتش
   وصل است و اگر ردیف خدمت پاک شود، اسم خدمت در تاریخچه‌ی همان
   نوبت‌ها (و در پیامک‌هایشان) خالی می‌شود. پس فقط غیرفعال
   می‌شوند تا از سایت و فرم رزرو کنار بروند ولی تاریخچه سالم
   بماند. این دستور خودکار است: هر خدمتی که در services.js نباشد
   از فهرست سایت خارج می‌شود.
   ==========================================================================
*/
UPDATE services SET active = 0 WHERE id NOT IN ('svc_ben_mozhe', 'svc_permanent_liner', 'svc_dark_lips', 'svc_lip_blush', 'svc_brows', 'svc_lift_lam');

/*
   ==========================================================================
   اختیاری — قفل ضدِ رزرو هم‌زمان
   
   کد PHP قبل از ثبت بررسی می‌کند که ساعت آزاد باشد، ولی اگر دو
   نفر در همان کسری از ثانیه ثبت کنند، هر دو بررسی موفق می‌شود و
   یک ساعت دو بار رزرو می‌شود. ستون زیر همان ساعت را برای
   نوبت‌های فعال یکتا می‌کند، پس دیتابیس دومی را رد می‌کند و PHP
   پیام «این ساعت همین الان گرفته شد» نشان می‌دهد.
   
   به MySQL 5.7+ یا MariaDB 10.2+ نیاز دارد. اگر خطا داد، سایت
   بدون این هم کار می‌کند — فقط این محافظت آخر را ندارد.
   دستور زیر را جداگانه در phpMyAdmin اجرا کنید:
   
     ALTER TABLE appointments
       ADD COLUMN slot_lock VARCHAR(20)
         GENERATED ALWAYS AS (
           CASE WHEN status IN ('pending','confirmed')
                THEN CONCAT(`date`, ' ', `time`) ELSE NULL END
         ) STORED,
       ADD UNIQUE KEY uk_appt_slot (slot_lock);
   ==========================================================================
*/