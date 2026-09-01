<?php
/* ==========================================================================
   sms-test.php — صفحه‌ی تشخیص پنل پیامکی

   این فایل را روی هاست باز کنید:
       https://zohrezare.ir/api/sms-test.php?key=<کلید_تشخیص>

   چه کاری می‌کند:
     ۱. سلامت PHP و افزونه‌های لازم را چک می‌کند
     ۲. اعتبار پنل و خط‌های فرستنده را می‌گیرد  → درست بودن نام کاربری
        و کلید API را ثابت می‌کند
     ۳. اگر شماره بدهید، یک کد تأیید واقعی می‌فرستد → درست بودن خط
        فرستنده و خواندنِ متن با الگوی تأییدشده را ثابت می‌کند

   ⚠️ بعد از تمام شدن تست این فایل را از روی هاست پاک کنید.
   ========================================================================== */

declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    http_response_code(500);
    exit('<p style="font-family:sans-serif">فایل api/config.php پیدا نشد. '
       . 'اول config.sample.php را به config.php کپی کنید و مقادیر را پر کنید.</p>');
}

/** @var array<string,mixed> $config */
$config = require $configPath;

/* --- محافظت ساده: بدون کلید درست، صفحه باز نمی‌شود --------------------
   کلید را از همان api_key می‌سازیم تا لازم نباشد چیز جدیدی تنظیم کنید. */
$guard = substr(hash('sha256', (string) ($config['sms']['api_key'] ?? '')), 0, 12);
if (($_GET['key'] ?? '') !== $guard) {
    http_response_code(403);
    exit('<p style="font-family:sans-serif;direction:rtl">دسترسی مجاز نیست. '
       . 'آدرس را با پارامتر <code>?key=…</code> باز کنید. '
       . 'کلید تشخیص شما: <code>' . htmlspecialchars($guard) . '</code></p>');
}

require __DIR__ . '/lib/sms.php';

$sms  = new Sms($config['sms']);
$rows = [];

function row(string $label, bool $ok, string $detail): array
{
    return ['label' => $label, 'ok' => $ok, 'detail' => $detail];
}

/* ---------------- ۱) محیط ---------------- */
$rows[] = row('نسخه‌ی PHP', PHP_VERSION_ID >= 80000, PHP_VERSION . ' (حداقل ۸.۰ لازم است)');
$rows[] = row('افزونه‌ی cURL', function_exists('curl_init'), function_exists('curl_init') ? 'فعال' : 'غیرفعال — بدون این نمی‌توان پیامک فرستاد');
$rows[] = row('افزونه‌ی PDO MySQL', extension_loaded('pdo_mysql'), extension_loaded('pdo_mysql') ? 'فعال' : 'غیرفعال — برای دیتابیس لازم است');
$rows[] = row('افزونه‌ی mbstring', extension_loaded('mbstring'), extension_loaded('mbstring') ? 'فعال' : 'غیرفعال');

/* ---------------- ۲) تنظیمات ---------------- */
$rows[] = row('نام کاربری پنل', !empty($config['sms']['username']), !empty($config['sms']['username']) ? 'تنظیم شده' : 'خالی است');
$rows[] = row('کلید API', !empty($config['sms']['api_key']), !empty($config['sms']['api_key']) ? 'تنظیم شده' : 'خالی است');
$rows[] = row('شماره‌ی خط فرستنده', !empty($config['sms']['from']), !empty($config['sms']['from']) ? (string) $config['sms']['from'] : 'خالی است');

/* ---------------- ۳) اتصال به سامانه ---------------- */
$credit = $sms->credit();
$rows[] = row(
    'اعتبار پنل پیامکی',
    $credit['ok'],
    $credit['ok'] ? ('باقی‌مانده: ' . $credit['credit']) : $credit['message']
);

$senders = $sms->senders();
$rows[] = row(
    'خط‌های فرستنده‌ی حساب شما',
    $senders['ok'],
    $senders['ok'] ? implode('، ', $senders['senders']) : $senders['message']
);

/* اگر خط فرستنده‌ی تنظیم‌شده در فهرست حساب نبود، هشدار بده */
if ($senders['ok'] && !empty($config['sms']['from'])) {
    $inList = in_array((string) $config['sms']['from'], $senders['senders'], true);
    $rows[] = row(
        'خط تنظیم‌شده در فهرست حساب هست؟',
        $inList,
        $inList ? 'بله' : 'نه — مقدار from در config با هیچ‌کدام از خط‌های بالا یکی نیست'
    );
}

/* ---------------- ۴) بررسی متن الگو ---------------- */
$preview = $sms->render('otp', ['code' => '1234']);
$rows[] = row(
    'متن کد تأیید',
    $preview !== null,
    $preview !== null ? $preview : 'قالب otp در config خالی است'
);

if ($preview !== null) {
    $chk = $sms->checkContent($preview);
    $rows[] = row(
        'متن کلمه‌ی فیلترشده ندارد',
        $chk['ok'] && $chk['valid'] === true,
        $chk['ok'] ? ($chk['valid'] ? 'سالم' : 'شامل کلمه‌ی فیلترشده است') : $chk['message']
    );
}

/* ---------------- ۵) ارسال واقعی ---------------- */
$sendResult = null;
$testPhone  = trim((string) ($_GET['to'] ?? ''));
if ($testPhone !== '') {
    $code = (string) random_int(1000, 9999);
    $sendResult = $sms->sendOtp($testPhone, $code);
    $sendResult['code_sent'] = $code;
}

?><!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>تشخیص پنل پیامکی</title>
<style>
  body { font-family: Tahoma, sans-serif; max-width: 760px; margin: 40px auto;
         padding: 0 16px; line-height: 1.9; color: #15100E; background: #FFFCFA; }
  h1 { font-size: 22px; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th, td { text-align: right; padding: 10px 12px; border-bottom: 1px solid #E2D0C1;
           vertical-align: top; font-size: 14px; }
  th { background: #FAF4EF; font-weight: 600; }
  .ok { color: #4C7A53; font-weight: 600; }
  .no { color: #A8443A; font-weight: 600; }
  code { background: #F0E4D9; padding: 2px 6px; border-radius: 4px; direction: ltr;
         display: inline-block; }
  .box { padding: 14px 16px; border-radius: 10px; margin: 18px 0; font-size: 14px; }
  .box--ok { background: #E9F2EA; }
  .box--no { background: #FBE9E6; }
  .box--warn { background: #FDF1DC; }
  form { margin: 20px 0; }
  input { padding: 8px 10px; border: 1px solid #D6C8BC; border-radius: 8px;
          font-family: inherit; direction: ltr; }
  button { padding: 8px 18px; border: 0; border-radius: 8px; background: #A55C44;
           color: #fff; font-family: inherit; cursor: pointer; }
</style>
</head>
<body>

<h1>تشخیص پنل پیامکی نیازپرداز</h1>

<table>
  <tr><th style="width:38%">بررسی</th><th style="width:14%">وضعیت</th><th>جزئیات</th></tr>
  <?php foreach ($rows as $r): ?>
  <tr>
    <td><?= htmlspecialchars($r['label']) ?></td>
    <td class="<?= $r['ok'] ? 'ok' : 'no' ?>"><?= $r['ok'] ? '✓ سالم' : '✗ مشکل' ?></td>
    <td><?= htmlspecialchars($r['detail']) ?></td>
  </tr>
  <?php endforeach; ?>
</table>

<h2 style="font-size:18px">ارسال پیامک آزمایشی</h2>
<p>یک شماره وارد کنید تا کد تأیید واقعی برایش فرستاده شود. این تست ثابت
می‌کند که خط فرستنده درست است و متن با الگوی تأییدشده می‌خواند.</p>

<form method="get">
  <input type="hidden" name="key" value="<?= htmlspecialchars($guard) ?>">
  <input type="text" name="to" placeholder="09123456789"
         value="<?= htmlspecialchars($testPhone) ?>" required>
  <button type="submit">ارسال کد آزمایشی</button>
</form>

<?php if ($sendResult !== null): ?>
  <div class="box <?= $sendResult['ok'] ? 'box--ok' : 'box--no' ?>">
    <strong><?= $sendResult['ok'] ? '✓ ارسال موفق' : '✗ ارسال ناموفق' ?></strong><br>
    کد نتیجه: <code><?= (int) $sendResult['code'] ?></code><br>
    پیام: <?= htmlspecialchars($sendResult['message']) ?><br>
    <?php if ($sendResult['ok']): ?>
      کد فرستاده‌شده: <code><?= htmlspecialchars((string) $sendResult['code_sent']) ?></code>
      — باید همین عدد به گوشی برسد.
    <?php endif; ?>
    <?php if ((int) $sendResult['code'] === 18): ?>
      <br><br><strong>یعنی متن با الگو نمی‌خواند.</strong> متن قالب
      <code>otp</code> در <code>api/config.php</code> باید دقیقاً همان چیزی
      باشد که در پنل تأیید شده — حتی فاصله‌ها و دو‌نقطه.
    <?php endif; ?>
  </div>
<?php endif; ?>

<div class="box box--warn">
  ⚠️ بعد از تمام شدن تست، این فایل را از روی هاست پاک کنید:
  <code>api/sms-test.php</code>
</div>

</body>
</html>
