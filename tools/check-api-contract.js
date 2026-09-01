#!/usr/bin/env node
/* ==========================================================================
   check-api-contract.js — تطبیق فرانت و بک‌اند

   روی این ماشین نه PHP هست و نه MySQL، پس API را نمی‌شود واقعاً صدا
   زد. ولی مهم‌ترین دسته‌ی خطا در این معماری «عدم تطابق قرارداد» است:
   فرانت آدرسی را صدا می‌زند که سرور ندارد، یا سرور کلیدی را
   نمی‌فرستد که فرانت می‌خواند. هر دو در مرورگر به یک پیام مبهم
   «خطا در ارتباط با سرور» ختم می‌شوند.

   این ابزار هر دو را ایستا مقایسه می‌کند:

     ۱. هر آدرسی که assets/js/core/api.js صدا می‌زند، در
        api/index.php مسیر داشته باشد
     ۲. هر کلید snake_case ای که backend-bridge.js می‌خواند، جایی در
        api/lib/*.php تولید شده باشد
     ۳. متد HTTP هر آدرس با only(...) همان مسیر بخواند
     ۴. وضعیت‌های نوبت در PHP و JS یکی باشند

   اجرا:  node tools/check-api-contract.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const problems = [];
const notes = [];

/* ====================================================================
   ۱) آدرس‌های فرانت → مسیرهای سرور
   ==================================================================== */

const apiJs = read('assets/js/core/api.js');
const indexPhp = read('api/index.php');

/** آدرس‌های صدا‌زده‌شده در api.js، با متدشان */
function frontendCalls() {
  const calls = [];
  /* الگو: api.post('/api/x/' + id + '/y', …)  یا  api.get('/api/x') */
  const re = /api\.(get|post|patch|del)\(\s*'([^']+)'((?:\s*\+\s*[^,)]+)*)/g;
  let m;
  while ((m = re.exec(apiJs)) !== null) {
    const method = { get: 'GET', post: 'POST', patch: 'PATCH', del: 'DELETE' }[m[1]];
    let route = m[2];
    /* هر چیزی که با + به رشته چسبیده، یک بخش متغیر است */
    const tail = m[3] || '';
    const extra = tail.match(/\+\s*'([^']*)'/g) || [];

    if (tail.trim()) {
      /* رشته‌هایی که به آدرس چسبیده‌اند: اگر اولینشان با ? شروع شود
         یعنی query string است و اصلاً بخشی از مسیر نیست. */
      const lits = extra.map((e) => e.match(/'([^']*)'/)[1]);
      const isQuery = /\?$/.test(route) ||
                      (lits.length > 0 && lits[0].charAt(0) === '?') ||
                      /\?/.test(tail);
      if (!isQuery) {
        route += '*';
        lits.forEach((lit) => { route += lit; });
      }
    }
    calls.push({ method, route });
  }

  /* check() آدرس health را مستقیم با fetch می‌زند */
  if (/url\('\/api\/health'\)/.test(apiJs)) {
    calls.push({ method: 'GET', route: '/api/health' });
  }
  return calls;
}

/** مسیرهای تعریف‌شده در index.php */
function serverRoutes() {
  const routes = [];
  const lines = indexPhp.split('\n');

  lines.forEach((line, i) => {
    let m = line.match(/\$path\s*===\s*'([^']+)'/);
    if (m) {
      routes.push({ pattern: m[1], line: i + 1, methods: methodsNear(lines, i) });
    }
    m = line.match(/match_path\(\s*'([^']+)'/);
    if (m) {
      routes.push({ pattern: m[1], line: i + 1, methods: methodsNear(lines, i) });
    }
  });
  return routes;
}

/** نزدیک‌ترین only(...) بعد از یک خط */
function methodsNear(lines, i) {
  for (let k = i; k < Math.min(i + 8, lines.length); k++) {
    const m = lines[k].match(/only\(([^)]*)\)/);
    if (m) {
      return (m[1].match(/'(\w+)'/g) || []).map((s) => s.replace(/'/g, ''));
    }
    /* GET بدون only در /auth/me */
    if (/^\s*if \(\$method === 'GET'\)/.test(lines[k])) {
      return null;   // بعداً only می‌آید
    }
  }
  return [];
}

/** آیا آدرس فرانت با الگوی سرور می‌خواند؟ */
function routeMatches(pattern, route) {
  /* route: /api/admin/appointments/*\/approve → سرور: /admin/appointments/*\/approve */
  let r = route.replace(/^\/api/, '');
  r = r.split('?')[0];
  if (r === '') r = '/';

  const p = pattern.split('/').filter(Boolean);
  const q = r.split('/').filter(Boolean);
  if (p.length !== q.length) return false;

  return p.every((seg, i) => seg === '*' || q[i] === '*' || seg === q[i]);
}

const calls = frontendCalls();
const routes = serverRoutes();

calls.forEach((c) => {
  const hit = routes.filter((r) => routeMatches(r.pattern, c.route));
  if (!hit.length) {
    problems.push('فرانت ' + c.method + ' ' + c.route + ' را صدا می‌زند ولی سرور این مسیر را ندارد');
    return;
  }
  const allowed = hit.reduce((acc, r) => acc.concat(r.methods || []), []);
  if (allowed.length && !allowed.includes(c.method)) {
    problems.push(
      'متد ناهماهنگ: فرانت ' + c.method + ' ' + c.route +
      ' می‌فرستد ولی سرور فقط ' + allowed.join('/') + ' را می‌پذیرد'
    );
  }
});

notes.push(calls.length + ' آدرس در فرانت، ' + routes.length + ' مسیر در سرور');

/* مسیرهایی که سرور دارد و فرانت صدا نمی‌زند — فقط اطلاع‌رسانی */
const unused = routes.filter(
  (r) => !calls.some((c) => routeMatches(r.pattern, c.route))
);
if (unused.length) {
  notes.push('مسیرهای بدون استفاده در فرانت: ' +
             unused.map((r) => r.pattern).join('، '));
}

/* ====================================================================
   ۲) کلیدهای JSON
   ==================================================================== */

const bridge = read('assets/js/data/backend-bridge.js');
const libSrc = fs.readdirSync(path.join(ROOT, 'api', 'lib'))
  .filter((f) => f.endsWith('.php'))
  .map((f) => read('api/lib/' + f))
  .join('\n') + indexPhp;

/** کلیدهای snake_case که پل از پاسخ سرور می‌خواند */
function bridgeKeys() {
  const keys = new Set();
  /* الگوهایی مثل a.service_id یا s.price_from یا r.dev_code */
  const re = /\b[a-z]\w*\.([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g;
  let m;
  while ((m = re.exec(bridge)) !== null) keys.add(m[1]);
  return [...keys];
}

const IGNORE_KEYS = new Set(['then_able']);

bridgeKeys().forEach((k) => {
  if (IGNORE_KEYS.has(k)) return;
  /* کلید یا در پاسخ ساخته می‌شود ('k' =>) یا از درخواست خوانده
     می‌شود (['k'] یا Http::str('k')) — هر دو قبول است. */
  const produced = new RegExp("'" + k + "'\\s*=>").test(libSrc);
  const consumed = new RegExp("\\['" + k + "'\\]|\\('" + k + "'").test(libSrc);
  if (!produced && !consumed) {
    problems.push("فرانت کلید «" + k + "» را به‌کار می‌برد ولی هیچ فایل PHP آن را نمی‌شناسد");
  }
});

notes.push(bridgeKeys().length + ' کلید snake_case بررسی شد');

/* ====================================================================
   ۳) وضعیت‌های نوبت
   ==================================================================== */

const apptJs = read('assets/js/data/appointments.js');
const schema = read('api/schema.sql');

const jsStatuses = new Set();
(apptJs.match(/status === '(\w+)'/g) || []).forEach((s) => {
  jsStatuses.add(s.match(/'(\w+)'/)[1]);
});
(apptJs.match(/case '(\w+)':/g) || []).forEach((s) => {
  jsStatuses.add(s.match(/'(\w+)'/)[1]);
});

const enumMatch = schema.match(/status\s+ENUM\(([^)]+)\)/);
const sqlStatuses = new Set(
  enumMatch ? (enumMatch[1].match(/'(\w+)'/g) || []).map((s) => s.replace(/'/g, '')) : []
);

const KNOWN = ['pending', 'confirmed', 'rejected', 'cancelled', 'done', 'no_show'];
KNOWN.forEach((st) => {
  if (!sqlStatuses.has(st)) {
    problems.push('وضعیت «' + st + '» در ENUM جدول appointments نیست');
  }
});
jsStatuses.forEach((st) => {
  if (KNOWN.includes(st) && !sqlStatuses.has(st)) {
    problems.push('وضعیت «' + st + '» در JS استفاده می‌شود ولی در دیتابیس تعریف نشده');
  }
});

notes.push('وضعیت‌های نوبت: ' + [...sqlStatuses].join('، '));

/* ====================================================================
   ۴) ساعت‌های کاری در دو طرف یکی باشند
   ==================================================================== */

const jsTimes = (apptJs.match(/BASE_TIMES = \[([^\]]+)\]/) || [])[1];
const phpTimes = (read('api/config.sample.php').match(/'times' => \[([^\]]+)\]/) || [])[1];

if (jsTimes && phpTimes) {
  const norm = (s) => (s.match(/'(\d{2}:\d{2})'/g) || []).join(',');
  if (norm(jsTimes) !== norm(phpTimes)) {
    problems.push(
      'ساعت‌های کاری یکی نیستند:\n      JS : ' + norm(jsTimes) +
      '\n      PHP: ' + norm(phpTimes)
    );
  } else {
    const slots = (norm(jsTimes).match(/,/g) || []).length + 1;
    notes.push('ساعت‌های کاری هر دو طرف یکی است (' + slots + ' بازه)');
  }
}

/* ====================================================================
   گزارش
   ==================================================================== */

notes.forEach((n) => console.log('  • ' + n));
console.log('');

if (problems.length) {
  problems.forEach((p) => console.log('  ✗ ' + p));
  console.log('\n' + problems.length + ' ناهماهنگی بین فرانت و بک‌اند ✗');
  process.exit(1);
}

console.log('قرارداد فرانت و بک‌اند هماهنگ است ✓');
process.exit(0);
