/* ==========================================================================
   dialog.js — پنجره‌های گفت‌وگوی یکدست (جایگزین prompt/confirm مرورگر)

   چرا؟ prompt() و confirm() بومی مرورگر:
   • با زبان طراحی سایت هماهنگ نیستند و در موبایل بد دیده می‌شوند
   • قابل دسترس‌سازی نیستند (focus trap ،aria ،...)
   • متن فارسی را در بعضی مرورگرها/صفحه‌کلیدها خراب می‌کنند
   • تماس صفحه را قفل می‌کنند و کنترلی روی رفتارشان نداریم

   رابط عمومی:
     ZZ.dialog.confirm({ title, message, confirmLabel, danger })
        → Promise<boolean>
     ZZ.dialog.open({
         title,            // متن ساده (خودش escape می‌شود)
         hint,             // HTML آزاد — فراخوان خودش escape کند
         body,             // HTML آزاد — محتوای اختصاصی پنجره
         extra,            // HTML دکمه‌های اضافه (مثل «حذف بیعانه»)
         confirmLabel, cancelLabel, danger,
         onMount(host, api),   // بعد از باز شدن — api.close(result)
         onConfirm(host)       // قبل از بستن با «تأیید»؛ false = باز بمان
       })
        → Promise<true|false|result>

   جزئیات دسترس‌پذیری:
   • role=dialog + aria-modal + aria-labelledby
   • فوکوس داخل پنجره حبس می‌شود (Tab / Shift+Tab)
   • Esc و کلیک روی پس‌زمینه = انصراف
   • در پنجره‌های مخرب (danger) فوکوس روی دکمه‌ی امن می‌نشیند
   • بعد از بستن، فوکوس به عنصرِ بازکننده برمی‌گردد
   • اسکرول صفحه زیر پنجره قفل می‌شود
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = (global.ZZ = global.ZZ || {});

  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), ' +
                  'select:not([disabled]), textarea:not([disabled]), ' +
                  '[tabindex]:not([tabindex="-1"])';

  /* پنجره‌های باز — فقط بالاترینِ پشته به کلیدها جواب می‌دهد */
  var stack = [];

  function esc(s) {
    return ZZ.u ? ZZ.u.esc(s || '') : String(s == null ? '' : s);
  }

  /**
   * ساخت و باز کردن پنجره.
   * @returns {Promise} true (تأیید) | false (انصراف) | مقدار دلخواه (api.close)
   */
  function open(opts) {
    var o = opts || {};

    return new Promise(function (resolve) {
      var prevFocus = document.activeElement;
      var uid = 'dlgTitle' + Date.now();

      var host = document.createElement('div');
      host.className = 'modal-host';
      host.setAttribute('data-zz-dialog', '');
      host.innerHTML =
        '<div class="modal-back" data-close="1"></div>' +
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="' + uid + '">' +
          '<h3 class="modal__title" id="' + uid + '">' + esc(o.title) + '</h3>' +
          (o.hint ? '<p class="modal__hint">' + o.hint + '</p>' : '') +
          (o.body ? '<div class="modal__body">' + o.body + '</div>' : '') +
          '<div class="modal__actions">' +
            (o.extra || '') +
            '<span class="modal__spacer"></span>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-close="1">' +
              esc(o.cancelLabel || 'انصراف') + '</button>' +
            '<button type="button" class="btn ' + (o.danger ? 'btn--danger' : 'btn--primary') +
              ' btn--sm" data-confirm="1">' + esc(o.confirmLabel || 'تأیید') + '</button>' +
          '</div>' +
        '</div>';

      var closed = false;
      var api = {
        host: host,
        close: function (result) { finish(result === undefined ? true : result); }
      };

      function finish(result) {
        if (closed) return;
        closed = true;

        stack.pop();
        if (!stack.length) document.body.classList.remove('is-locked');
        document.removeEventListener('keydown', onKey, true);

        if (host.parentNode) host.parentNode.removeChild(host);

        if (typeof o.onClose === 'function') { try { o.onClose(result); } catch (e) { /* noop */ } }
        resolve(result);

        /* فوکوس را به عنصری برگردان که پنجره را باز کرده بود */
        if (prevFocus && document.contains(prevFocus) && prevFocus.focus) {
          try { prevFocus.focus(); } catch (e) { /* noop */ }
        }
      }

      /* ---- کیبورد: Esc + حبس فوکوس ---- */
      function onKey(e) {
        if (stack[stack.length - 1] !== host) return;

        if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
          return;
        }
        if (e.key !== 'Tab') return;

        var items = Array.prototype.filter.call(
          host.querySelectorAll(FOCUSABLE),
          function (el) { return el.offsetParent !== null; }
        );
        if (!items.length) return;

        var first = items[0];
        var last = items[items.length - 1];
        var active = document.activeElement;

        if (e.shiftKey) {
          if (active === first || !host.contains(active)) { e.preventDefault(); last.focus(); }
        } else {
          if (active === last || !host.contains(active)) { e.preventDefault(); first.focus(); }
        }
      }

      /* ---- کلیک‌ها ---- */
      host.addEventListener('click', function (e) {
        if (e.target.closest('[data-close]')) { finish(false); return; }

        if (e.target.closest('[data-confirm]')) {
          if (typeof o.onConfirm === 'function' && o.onConfirm(host) === false) return;
          finish(true);
        }
      });

      document.body.classList.add('is-locked');
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(host);
      stack.push(host);

      /* ---- فوکوس اولیه ----
         پنجره‌های مخرب: فوکوس روی دکمه‌ی امن (انصراف) تا Enterِ
         ناخواسته کار مخرب انجام ندهد. بقیه: اولین ورودیِ داخل بدنه. */
      var target = null;
      if (o.danger) target = host.querySelector('[data-close]');
      else target = host.querySelector('.modal__body ' + FOCUSABLE) ||
                    host.querySelector('[data-confirm]');
      if (target) target.focus();

      if (typeof o.onMount === 'function') { try { o.onMount(host, api); } catch (e) { /* noop */ } }
    });
  }

  /**
   * پنجره‌ی تأیید ساده — هم‌ارز confirm() بومی.
   * @returns {Promise<boolean>}
   */
  function confirmDialog(opts) {
    var o = opts || {};
    return open({
      title: o.title || 'تأیید',
      hint: o.message ? '<span>' + esc(o.message) + '</span>' : '',
      confirmLabel: o.confirmLabel || 'بله',
      cancelLabel: o.cancelLabel,
      danger: !!o.danger
    });
  }

  ZZ.dialog = {
    open: open,
    confirm: confirmDialog
  };
})(window);
