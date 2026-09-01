<?php
/* ==========================================================================
   admin.php — عملیات پنل مدیریت

   قلب جریانِ بدون درگاه پرداخت این‌جاست: مدیر درخواست را می‌بیند،
   با مشتری تماس می‌گیرد، و بعد تأیید یا رد می‌کند.

   همه‌ی متدهای این کلاس فرض می‌کنند که Auth::requireAdmin() قبلاً
   در مسیریاب صدا زده شده است.
   ========================================================================== */

if (!defined('ZZ_APP')) {
    http_response_code(403);
    exit('دسترسی مستقیم مجاز نیست.');
}

final class Admin
{
    /** ستون‌های کاربر که در جدول مدیریت لازم است */
    private const USER_COLS =
        'u.phone, u.name, u.birth_y, u.birth_m, u.birth_d, u.role';

    /* ================= آمار ================= */

    public static function stats(): array
    {
        $today = date('Y-m-d');
        $now   = date('Y-m-d H:i');

        $row = Db::one(
            'SELECT
               COUNT(*) AS total,
               SUM(status = "pending") AS pending,
               SUM(status = "no_show") AS no_show,
               SUM(status IN ("cancelled","rejected")) AS cancelled,
               SUM(status = "confirmed" AND date = ?) AS today_count,
               SUM(status = "confirmed" AND CONCAT(date," ",time) >= ?) AS upcoming,
               SUM(CASE WHEN status IN ("confirmed","done")
                         AND CONCAT(date," ",time) < ? THEN price ELSE 0 END) AS revenue_done,
               SUM(COALESCE(deposit_amount, 0)) AS deposits
             FROM appointments',
            [$today, $now, $now]
        );

        return [
            'total'           => (int) ($row['total'] ?? 0),
            'pending'         => (int) ($row['pending'] ?? 0),
            'upcoming'        => (int) ($row['upcoming'] ?? 0),
            'today'           => (int) ($row['today_count'] ?? 0),
            'cancelled'       => (int) ($row['cancelled'] ?? 0),
            'no_show'         => (int) ($row['no_show'] ?? 0),
            'revenue_done'    => (int) ($row['revenue_done'] ?? 0),
            'deposits'        => (int) ($row['deposits'] ?? 0),
            'users'           => (int) Db::val('SELECT COUNT(*) FROM users'),
            'birthdays_today' => count(self::birthdays()),
        ];
    }

    /* ================= فهرست نوبت‌ها ================= */

    public static function appointments(array $q): array
    {
        $status = (string) ($q['status'] ?? 'all');
        $search = trim((string) ($q['q'] ?? ''));
        $date   = (string) ($q['date'] ?? '');
        $now    = date('Y-m-d H:i');

        $where  = [];
        $params = [];

        if ($status === 'pending') {
            $where[] = 'a.status = "pending"';
        } elseif ($status === 'upcoming') {
            $where[]  = 'a.status = "confirmed" AND CONCAT(a.date," ",a.time) >= ?';
            $params[] = $now;
        } elseif ($status === 'past') {
            $where[]  = 'CONCAT(a.date," ",a.time) < ? AND a.status NOT IN ("cancelled","rejected")';
            $params[] = $now;
        } elseif ($status === 'cancelled') {
            /* «لغو شده» در پنل شامل ردشده‌ها هم هست — از دید مدیر
               هر دو یعنی «این نوبت برگزار نمی‌شود». */
            $where[] = 'a.status IN ("cancelled","rejected")';
        }

        if ($date !== '' && Booking::isValidKey($date)) {
            $where[]  = 'a.date = ?';
            $params[] = $date;
        }

        if ($search !== '') {
            $like     = '%' . Jalali::en($search) . '%';
            $where[]  = '(u.name LIKE ? OR u.phone LIKE ? OR s.title LIKE ?)';
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }

        /* ترتیب: در انتظار → قدیمی‌ترین اول (کسی که بیشتر منتظر مانده
           باید زودتر جواب بگیرد). گذشته → جدیدترین اول. بقیه →
           نزدیک‌ترین اول. */
        if ($status === 'pending') {
            $order = 'a.created_at ASC';
        } elseif ($status === 'past') {
            $order = 'a.date DESC, a.time DESC';
        } else {
            $order = 'a.date ASC, a.time ASC';
        }

        $rows = Db::all(
            'SELECT a.*, s.title AS service_title, ' . self::USER_COLS . '
               FROM appointments a
               LEFT JOIN services s ON s.id = a.service_id
               LEFT JOIN users u ON u.id = a.user_id'
            . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
            . ' ORDER BY ' . $order . ' LIMIT 500',
            $params
        );

        /* سابقه‌ی همه‌ی کاربرانِ این فهرست را یک‌جا حساب می‌کنیم؛
           وگرنه برای هر ردیف یک پرس‌وجوی جدا لازم بود. */
        $userIds = array_values(array_unique(array_column($rows, 'user_id')));
        $history = self::historyFor($userIds);

        $out = [];
        foreach ($rows as $r) {
            $pub = Booking::publicRow($r, true);
            $pub['history'] = $history[$r['user_id']] ?? null;
            $out[] = $pub;
        }
        return $out;
    }

    /**
     * سابقه‌ی مراجعه‌کننده — به مدیر می‌گوید موقع تماس بیعانه بگیرد
     * یا نه. کسی که قبلاً غیبت کرده، ریسک بیشتری دارد.
     */
    public static function historyFor(array $userIds): array
    {
        if (!$userIds) {
            return [];
        }
        $ph  = implode(',', array_fill(0, count($userIds), '?'));
        $now = date('Y-m-d H:i');

        $rows = Db::all(
            'SELECT user_id,
                    SUM(status = "no_show") AS no_show,
                    SUM(status = "cancelled") AS cancelled,
                    SUM(status = "done"
                        OR (status = "confirmed" AND CONCAT(date," ",time) < ?)) AS done
               FROM appointments
              WHERE user_id IN (' . $ph . ')
              GROUP BY user_id',
            array_merge([$now], $userIds)
        );

        $out = [];
        foreach ($rows as $r) {
            $done      = (int) $r['done'];
            $noShow    = (int) $r['no_show'];
            $cancelled = (int) $r['cancelled'];
            $out[$r['user_id']] = [
                'done'      => $done,
                'noShow'    => $noShow,
                'cancelled' => $cancelled,
                'isNew'     => ($done + $noShow + $cancelled) === 0,
                /* پیشنهاد سیستم به مدیر — تصمیم نهایی با خودش است */
                'suggestDeposit' => $noShow > 0,
            ];
        }

        /* کسانی که هیچ نوبتی نداشتند هم باید isNew بگیرند */
        foreach ($userIds as $id) {
            if (!isset($out[$id])) {
                $out[$id] = [
                    'done' => 0, 'noShow' => 0, 'cancelled' => 0,
                    'isNew' => true, 'suggestDeposit' => false,
                ];
            }
        }

        return $out;
    }

    /* ================= تأیید و رد ================= */

    /** تأیید نهایی — نوبت قطعی می‌شود */
    public static function approve(string $id): array
    {
        $a = self::find($id);
        if ($a['status'] !== 'pending') {
            Http::fail(409, 'این درخواست قبلاً تعیین تکلیف شده است.');
        }

        Db::run(
            'UPDATE appointments
                SET status = "confirmed", decided_at = NOW(), decided_by = "admin",
                    reject_reason = NULL
              WHERE id = ? AND status = "pending"',
            [$id]
        );

        self::notify($a, 'approved');
        return Booking::publicOne($id, true);
    }

    /** رد درخواست — ساعت آزاد می‌شود */
    public static function reject(string $id, string $reason): array
    {
        $a = self::find($id);
        if ($a['status'] !== 'pending') {
            Http::fail(409, 'این درخواست قبلاً تعیین تکلیف شده است.');
        }

        Db::run(
            'UPDATE appointments
                SET status = "rejected", decided_at = NOW(), decided_by = "admin",
                    reject_reason = ?
              WHERE id = ? AND status = "pending"',
            [mb_substr($reason, 0, 200, 'UTF-8'), $id]
        );

        self::notify($a, 'rejected', ['reason' => $reason]);
        return Booking::publicOne($id, true);
    }

    /** برگرداندن نوبت تأییدشده به حالت بررسی */
    public static function revertToPending(string $id): array
    {
        $a = self::find($id);
        if ($a['status'] !== 'confirmed') {
            Http::fail(409, 'فقط نوبت تأییدشده را می‌شود به حالت بررسی برگرداند.');
        }
        Db::run(
            'UPDATE appointments SET status = "pending", decided_at = NULL, decided_by = NULL
              WHERE id = ?',
            [$id]
        );
        return Booking::publicOne($id, true);
    }

    public static function markDone(string $id): array
    {
        self::find($id);
        Db::run('UPDATE appointments SET status = "done" WHERE id = ?', [$id]);
        return Booking::publicOne($id, true);
    }

    public static function markNoShow(string $id): array
    {
        self::find($id);
        Db::run(
            'UPDATE appointments SET status = "no_show", decided_at = NOW() WHERE id = ?',
            [$id]
        );
        return Booking::publicOne($id, true);
    }

    /** لغو توسط مدیر — بدون محدودیت ۲۴ ساعته */
    public static function cancel(string $id): array
    {
        self::find($id);
        Db::run(
            'UPDATE appointments SET status = "cancelled", cancelled_at = NOW(),
                    cancelled_by = "admin" WHERE id = ?',
            [$id]
        );
        return ['ok' => true, 'id' => $id];
    }

    /* ================= بیعانه ================= */

    public static function setDeposit(string $id, array $in): array
    {
        self::find($id);

        $amount = (int) preg_replace('/\D/', '', Jalali::en((string) ($in['amount'] ?? '')));
        if ($amount <= 0) {
            Http::fail(422, 'مبلغ بیعانه را درست وارد کنید.', 'amount');
        }

        Db::run(
            'UPDATE appointments
                SET deposit_amount = ?, deposit_method = ?, deposit_ref = ?,
                    deposit_note = ?, deposit_paid_at = NOW()
              WHERE id = ?',
            [
                $amount,
                mb_substr((string) ($in['method'] ?? 'card'), 0, 20, 'UTF-8'),
                mb_substr((string) ($in['ref'] ?? ''), 0, 40, 'UTF-8'),
                mb_substr((string) ($in['note'] ?? ''), 0, 200, 'UTF-8'),
                $id,
            ]
        );

        return Booking::publicOne($id, true);
    }

    public static function clearDeposit(string $id): array
    {
        self::find($id);
        Db::run(
            'UPDATE appointments
                SET deposit_amount = NULL, deposit_method = NULL, deposit_ref = NULL,
                    deposit_note = NULL, deposit_paid_at = NULL
              WHERE id = ?',
            [$id]
        );
        return Booking::publicOne($id, true);
    }

    /* ================= تقویم ================= */

    /** بازه‌های یک روز با وضعیتشان — برای جدول مدیریت */
    public static function daySlots(string $dateKey): array
    {
        if (!Booking::isValidKey($dateKey)) {
            Http::fail(422, 'تاریخ معتبر نیست.', 'date');
        }

        $blocked = array_column(
            Db::all('SELECT time FROM blocked_slots WHERE date = ?', [$dateKey]),
            'time'
        );

        $ph   = implode(',', array_fill(0, count(Booking::holdingStatuses()), '?'));
        $rows = Db::all(
            'SELECT a.id, a.time, a.status, u.name, u.phone
               FROM appointments a LEFT JOIN users u ON u.id = a.user_id
              WHERE a.date = ? AND a.status IN (' . $ph . ')',
            array_merge([$dateKey], Booking::holdingStatuses())
        );

        $byTime = [];
        foreach ($rows as $r) {
            $byTime[$r['time']] = $r;
        }

        $out = [];
        foreach (Booking::times() as $time) {
            $a = $byTime[$time] ?? null;
            $out[] = [
                'time'           => $time,
                'booked'         => $a !== null,
                'blocked'        => in_array($time, $blocked, true),
                'appointment_id' => $a['id'] ?? null,
                'status'         => $a['status'] ?? null,
                'customer'       => $a
                    ? trim(($a['name'] ?: 'بدون نام') . ' — ' . Jalali::fa($a['phone']))
                    : null,
            ];
        }
        return $out;
    }

    /** تعطیل/باز کردن یک روز کامل */
    public static function toggleDay(string $dateKey, string $reason): array
    {
        if (!Booking::isValidKey($dateKey)) {
            Http::fail(422, 'تاریخ معتبر نیست.', 'date');
        }
        $exists = Db::val('SELECT COUNT(*) FROM closed_days WHERE date = ?', [$dateKey]) > 0;

        if ($exists) {
            Db::run('DELETE FROM closed_days WHERE date = ?', [$dateKey]);
            return ['blocked' => false, 'date' => $dateKey];
        }

        Db::run(
            'INSERT INTO closed_days (date, reason, created_at) VALUES (?, ?, NOW())',
            [$dateKey, mb_substr($reason, 0, 120, 'UTF-8')]
        );
        return ['blocked' => true, 'date' => $dateKey];
    }

    /** پر/آزاد کردن یک بازه‌ی مشخص */
    public static function toggleSlot(string $dateKey, string $time, string $reason): array
    {
        if (!Booking::isValidKey($dateKey)) {
            Http::fail(422, 'تاریخ معتبر نیست.', 'date');
        }
        if (!in_array($time, Booking::times(), true)) {
            Http::fail(422, 'این ساعت جزو ساعت‌های کاری نیست.', 'time');
        }

        $exists = Db::val(
            'SELECT COUNT(*) FROM blocked_slots WHERE date = ? AND time = ?',
            [$dateKey, $time]
        ) > 0;

        if ($exists) {
            Db::run('DELETE FROM blocked_slots WHERE date = ? AND time = ?', [$dateKey, $time]);
            return ['blocked' => false, 'date' => $dateKey, 'time' => $time];
        }

        Db::run(
            'INSERT INTO blocked_slots (date, time, reason, created_at) VALUES (?, ?, ?, NOW())',
            [$dateKey, $time, mb_substr($reason, 0, 120, 'UTF-8')]
        );
        return ['blocked' => true, 'date' => $dateKey, 'time' => $time];
    }

    /* ================= کاربران ================= */

    public static function users(array $q): array
    {
        $search = trim((string) ($q['q'] ?? ''));
        $params = [];
        $where  = '';

        if ($search !== '') {
            $like   = '%' . Jalali::en($search) . '%';
            $where  = ' WHERE u.name LIKE ? OR u.phone LIKE ?';
            $params = [$like, $like];
        }

        $rows = Db::all(
            'SELECT u.*,
                    (SELECT COUNT(*) FROM appointments a WHERE a.user_id = u.id) AS appt_count,
                    (SELECT MAX(CONCAT(a.date," ",a.time)) FROM appointments a
                      WHERE a.user_id = u.id AND a.status IN ("confirmed","done")) AS last_visit
               FROM users u' . $where . '
              ORDER BY u.created_at DESC LIMIT 500',
            $params
        );

        $out = [];
        foreach ($rows as $r) {
            $pub = Auth::publicUser($r);
            $pub['appt_count'] = (int) $r['appt_count'];
            $pub['last_visit'] = $r['last_visit'] ?: null;
            $pub['created_at'] = strtotime((string) $r['created_at']) * 1000;
            $out[] = $pub;
        }
        return $out;
    }

    /** کسانی که امروز تولدشان است */
    public static function birthdays(): array
    {
        [, $jm, $jd] = Jalali::fromGregorian(
            (int) date('Y'), (int) date('n'), (int) date('j')
        );

        $rows = Db::all(
            'SELECT * FROM users WHERE birth_m = ? AND birth_d = ?',
            [$jm, $jd]
        );

        return array_map([Auth::class, 'publicUser'], $rows);
    }

    /* ================= داخلی ================= */

    private static function find(string $id): array
    {
        $a = Db::one('SELECT * FROM appointments WHERE id = ?', [$id]);
        if (!$a) {
            Http::fail(404, 'نوبت پیدا نشد.');
        }
        return $a;
    }

    /**
     * پیامک اطلاع‌رسانی به مشتری.
     *
     * اگر قالب مربوطه در تنظیمات خالی باشد هیچ کاری نمی‌کند — و این
     * عمدی است: نیازپرداز فقط متنی را می‌فرستد که قالبش در پنل
     * تأیید شده باشد. تا وقتی مدیر قالب «تأیید نوبت» را نگرفته،
     * فرستادنش فقط خطای ۱۸ می‌دهد و اعتبار می‌سوزاند.
     *
     * شکست ارسال هرگز نباید تأیید نوبت را برگرداند؛ نوبت مهم‌تر از
     * پیامک است. پس فقط لاگ می‌شود.
     */
    private static function notify(array $appt, string $template, array $extra = []): void
    {
        Sms::notifyAppointment($appt, $template, $extra);
    }
}
