<?php
/* ==========================================================================
   sms.php — درایور پنل پیامکی نیازپرداز

   مستندات: https://niazpardaz-sms.com/webservice
   وب‌سرویس REST:  http://in.payamak-service.ir/api/v2/RestWebApi

   ── نکته‌ی مهم درباره‌ی «پترن» ────────────────────────────────────────
   نیازپرداز متد جداگانه‌ای برای ارسال با پترن ندارد (برخلاف کاوه‌نگار
   یا SMS.ir). مدلش این است:

       ۱. متن الگو را یک بار در پنل ثبت و تأیید می‌کنید
       ۲. بعد متنِ کاملِ ساخته‌شده را با همان متد معمولی می‌فرستید
       ۳. سامانه متن را با الگوهای تأییدشده‌ی شما تطبیق می‌دهد

   اگر متن با هیچ الگویی نخواند، کد ۱۸ («مغایرت متن با قالب») برمی‌گردد.
   پس متن قالب در config باید کاراکتر‌به‌کاراکتر همان چیزی باشد که در
   پنل تأیید شده است.
   ──────────────────────────────────────────────────────────────────────

   احراز هویت: مستندات REST نام کاربری و رمز عبور می‌خواهد، ولی کدهای
   خطای ۲۵ و ۷- مربوط به ApiKey هستند و SDK رسمی فقط با کلید کار می‌کند.
   پس کلید در همان جای رمز عبور فرستاده می‌شود. اگر حساب شما این را
   نپذیرفت، در config مقدار auth_mode را روی 'password' بگذارید و رمز
   پنل را در api_key بنویسید — رفتار کد یکی است، فقط برای وضوح جداست.
   ========================================================================== */

declare(strict_types=1);

final class Sms
{
    /** @var array<string,mixed> */
    private array $cfg;

    /** @param array<string,mixed> $cfg بخش sms از config */
    public function __construct(array $cfg)
    {
        $this->cfg = $cfg;
    }

    /* ------------------------------------------------------------------
       جدول کد خطاهای نیازپرداز
       ------------------------------------------------------------------ */

    /** @var array<int,string> */
    private const RESULT = [
        -20 => 'به علت وارد کردن رمز اشتباه، پنل مسدود شده است.',
        -7  => 'کلید API معتبر نیست.',
        -6  => 'آی‌پی سرور موقتاً بلاک شده است.',
        -2  => 'کاربر پنل غیرفعال است.',
        -1  => 'نام کاربری یا رمز عبور درست نیست.',
        0   => 'ارسال با موفقیت انجام شد.',
        1   => 'نام کاربری یا کلمه‌ی عبور نامعتبر است.',
        2   => 'کاربر مسدود شده است.',
        3   => 'شماره‌ی فرستنده نامعتبر است.',
        4   => 'محدودیت در ارسال روزانه.',
        5   => 'تعداد گیرندگان حداکثر ۱۰۰ شماره است.',
        6   => 'خط فرستنده غیرفعال است.',
        7   => 'متن پیامک شامل کلمات فیلترشده است.',
        8   => 'اعتبار پنل پیامکی کافی نیست.',
        9   => 'سامانه‌ی پیامک در حال به‌روزرسانی است.',
        10  => 'وب‌سرویس پنل پیامکی غیرفعال است.',
        11  => 'این متد پیاده‌سازی نشده است.',
        12  => 'تعداد پیام‌ها و شماره‌ها باید یکسان باشد.',
        13  => 'تعداد پیام‌ها حداکثر ۱۰۰ پیام است.',
        14  => 'تعرفه‌ای برای این کاربر تعریف نشده است.',
        15  => 'ارسال تکراری همین متن به همین شماره در بازه‌ی کوتاه.',
        16  => 'شماره در لیست سیاه است و خط تبلیغاتی به آن ارسال نمی‌کند.',
        17  => 'متن پیامک خالی است.',
        18  => 'متن پیامک با الگوی تأییدشده نمی‌خواند.',
        19  => 'تاریخ انقضای پنل پیامکی گذشته است.',
        20  => 'وضعیت کاربر فعال نیست.',
        21  => 'یکی از پارامترهای ورودی معتبر نیست.',
        22  => 'آی‌پی موقتاً بلاک شده است.',
        23  => 'خطای موقت سامانه. چند دقیقه بعد دوباره تلاش کنید.',
        24  => 'درخواست کاملاً تکراری در چند ثانیه‌ی اخیر.',
        25  => 'کلید API نامعتبر است.',
        26  => 'خطا در ساخت فایل صوتی.',
    ];

    public static function describe(int $code): string
    {
        return self::RESULT[$code] ?? ('کد نتیجه‌ی ناشناخته: ' . $code);
    }

    /** آیا این کد یعنی موفقیت؟ */
    public static function isOk(int $code): bool
    {
        return $code === 0;
    }

    /* ------------------------------------------------------------------
       ساخت متن از روی قالب
       ------------------------------------------------------------------ */

    /**
     * متن یک قالب را با مقادیر داده‌شده می‌سازد.
     *
     * @param array<string,string|int> $vars
     * @return string|null اگر قالب تعریف نشده باشد null — یعنی این نوع
     *                     پیامک هنوز الگوی تأییدشده ندارد و نباید فرستاده شود
     */
    public function render(string $key, array $vars = []): ?string
    {
        $tpl = $this->cfg['templates'][$key] ?? null;
        if (!is_string($tpl) || $tpl === '') {
            return null;
        }
        foreach ($vars as $k => $v) {
            $tpl = str_replace('{' . $k . '}', (string) $v, $tpl);
        }
        return $tpl;
    }

    /* ------------------------------------------------------------------
       ارسال
       ------------------------------------------------------------------ */

    /**
     * ارسال یک پیامک.
     *
     * @return array{ok:bool, code:int, message:string, id:int|null, skipped?:bool}
     */
    public function send(string $to, string $text): array
    {
        $to = self::normalizePhone($to);
        if ($to === null) {
            return ['ok' => false, 'code' => 21, 'message' => 'شماره‌ی گیرنده معتبر نیست.', 'id' => null];
        }
        if (trim($text) === '') {
            return ['ok' => false, 'code' => 17, 'message' => self::describe(17), 'id' => null];
        }

        /* حالت خاموش — برای توسعه و تست بدون خرج کردن اعتبار */
        if (empty($this->cfg['enabled'])) {
            error_log('[sms:disabled] to=' . $to . ' text=' . $text);
            return [
                'ok' => true, 'code' => 0, 'id' => null, 'skipped' => true,
                'message' => 'ارسال پیامک خاموش است؛ متن فقط در لاگ ثبت شد.',
            ];
        }

        $res = $this->call('SendSms', [
            'fromNumber'     => (string) ($this->cfg['from'] ?? ''),
            'toNumbers'      => $to,
            'messageContent' => $text,
            'isFlash'        => false,
        ]);

        if (isset($res['error'])) {
            return ['ok' => false, 'code' => -100, 'message' => $res['error'], 'id' => null];
        }

        $code = (int) ($res['ResultCode'] ?? -100);
        return [
            'ok'      => self::isOk($code),
            'code'    => $code,
            'message' => self::describe($code),
            'id'      => isset($res['SmsId']) ? (int) $res['SmsId']
                       : (isset($res['BatchSmsId']) ? (int) $res['BatchSmsId'] : null),
        ];
    }

    /** ارسال کد یک‌بارمصرف با قالب تأییدشده */
    public function sendOtp(string $to, string $code): array
    {
        $text = $this->render('otp', ['code' => $code]);
        if ($text === null) {
            return ['ok' => false, 'code' => 17, 'id' => null,
                    'message' => 'قالب پیامک کد تأیید در تنظیمات خالی است.'];
        }
        return $this->send($to, $text);
    }

    /* ------------------------------------------------------------------
       گزارش‌ها — برای صفحه‌ی تشخیص و هشدار کمبود اعتبار
       ------------------------------------------------------------------ */

    /** @return array{ok:bool, credit:float|null, message:string} */
    public function credit(): array
    {
        $res = $this->call('GetCredit', []);
        if (isset($res['error'])) {
            return ['ok' => false, 'credit' => null, 'message' => $res['error']];
        }
        $code = (int) ($res['ResultCode'] ?? -100);
        return [
            'ok'      => self::isOk($code),
            'credit'  => isset($res['Credit']) ? (float) $res['Credit'] : null,
            'message' => self::describe($code),
        ];
    }

    /** @return array{ok:bool, senders:array<int,string>, message:string} */
    public function senders(): array
    {
        $res = $this->call('GetSenderNumbers', []);
        if (isset($res['error'])) {
            return ['ok' => false, 'senders' => [], 'message' => $res['error']];
        }
        $code = (int) ($res['ResultCode'] ?? -100);
        return [
            'ok'      => self::isOk($code),
            'senders' => array_map('strval', (array) ($res['Senders'] ?? [])),
            'message' => self::describe($code),
        ];
    }

    /** بررسی اینکه متن کلمه‌ی فیلترشده ندارد */
    public function checkContent(string $text): array
    {
        $res = $this->call('CheckSmsContent', ['message' => $text]);
        if (isset($res['error'])) {
            return ['ok' => false, 'valid' => null, 'message' => $res['error']];
        }
        $code = (int) ($res['ResultCode'] ?? -100);
        return [
            'ok'      => self::isOk($code),
            'valid'   => isset($res['IsValid']) ? (bool) $res['IsValid'] : null,
            'message' => self::describe($code),
        ];
    }

    /* ------------------------------------------------------------------
       لایه‌ی HTTP
       ------------------------------------------------------------------ */

    /**
     * فراخوانی یک متد وب‌سرویس.
     *
     * @param array<string,mixed> $params
     * @return array<string,mixed>  در صورت خطای شبکه کلید error دارد
     */
    private function call(string $method, array $params): array
    {
        $base = rtrim((string) ($this->cfg['base_url'] ?? ''), '/');
        $url  = $base . '/' . $method;

        /* کلید API در همان جای رمز عبور می‌نشیند — توضیحش بالای فایل */
        $body = array_merge([
            'userName' => (string) ($this->cfg['username'] ?? ''),
            'password' => (string) ($this->cfg['api_key'] ?? ''),
        ], $params);

        $json = json_encode($body, JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            return ['error' => 'ساخت درخواست JSON ناموفق بود.'];
        }

        if (!function_exists('curl_init')) {
            return ['error' => 'افزونه‌ی cURL روی این هاست فعال نیست.'];
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $json,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json; charset=utf-8',
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT        => (int) ($this->cfg['timeout'] ?? 15),
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_FOLLOWLOCATION => true,
        ]);

        $raw  = curl_exec($ch);
        $err  = curl_error($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($raw === false || $err !== '') {
            return ['error' => 'ارتباط با سامانه‌ی پیامک برقرار نشد: ' . $err];
        }
        if ($http < 200 || $http >= 300) {
            return ['error' => 'سامانه‌ی پیامک کد ' . $http . ' برگرداند.'];
        }

        $data = json_decode((string) $raw, true);
        if (!is_array($data)) {
            return ['error' => 'پاسخ سامانه‌ی پیامک قابل خواندن نبود: ' . mb_substr((string) $raw, 0, 200)];
        }

        /* بعضی متدها کلیدها را با حرف کوچک برمی‌گردانند */
        $out = [];
        foreach ($data as $k => $v) {
            $out[ucfirst((string) $k)] = $v;
        }
        return $out;
    }

    /* ------------------------------------------------------------------
       کمکی
       ------------------------------------------------------------------ */

    /**
     * شماره را به شکل 09xxxxxxxxx در می‌آورد.
     * ارقام فارسی و عربی، +98، 0098 و 98 را هم می‌پذیرد.
     */
    public static function normalizePhone(string $raw): ?string
    {
        $fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
        $ar = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
        $en = ['0','1','2','3','4','5','6','7','8','9'];
        $s  = str_replace($fa, $en, $raw);
        $s  = str_replace($ar, $en, $s);
        $s  = preg_replace('/\D+/', '', $s) ?? '';

        /* عمداً از str_starts_with استفاده نشده: آن تابع PHP 8 است و
           خیلی از هاست‌های اشتراکی هنوز روی 7.4 هستند. */
        if (strncmp($s, '0098', 4) === 0) {
            $s = '0' . substr($s, 4);
        } elseif (strncmp($s, '98', 2) === 0 && strlen($s) === 12) {
            $s = '0' . substr($s, 2);
        } elseif (strlen($s) === 10 && $s[0] === '9') {
            $s = '0' . $s;
        }

        return preg_match('/^09\d{9}$/', $s) === 1 ? $s : null;
    }
}
