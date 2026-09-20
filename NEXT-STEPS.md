# Next Steps — Zohre Zare Website

Everything below is what **you** need to do. The code side is already done and
committed on this branch. Tasks are ordered: do them top to bottom.

---

## 1. Review the new content (before anything goes live)

- [ ] **Open the site preview and click through the six service pages.**
      Check the wording matches what your mom sent — especially the parts I
      rewrote to fit the site's structure (hero tagline, benefits, "before you
      book" notes).

- [ ] **Read the two lines I changed on purpose** (I did not keep her exact
      words here — tell me if you want them back):
      - Dark lips / lip tint: her text said *"a session usually needs 2 sessions
        (main + touch-up) after 3 months"*. I made the 2-session version a
        **paid package** option as well as the single session, so a customer can
        pick. Confirm this is how she prices it.
      - Ben Mozhe: her text claimed *"lasts over 5 years with no fading"*. I
        kept it, but it is a very strong promise compared to the rest of the
        site. Consider softening it.

- [ ] **Drug dosage was removed** as you asked. The lip care list now says
      "start the antiviral medicine as prescribed by a doctor" with no
      milligram / interval. Nothing else medical was published.

---

## 2. Prices (they are placeholders right now)

- [ ] **Prices and durations are temporary numbers** — they exist only so the
      cards and the booking form have something to show. Nothing needs a code
      change to fix them.

- [ ] **Enter the real prices from the admin panel:**
      `Panel → Services & Content tab → open a service → "Options & prices"`.
      Save, and the website + booking form pick it up immediately.

- [ ] **Decide about touch-ups.** Right now each service has a "touch-up"
      option with its own price. If touch-ups are **free**, set the price to 0
      or delete that option — otherwise customers will be charged for something
      that used to be included.

- [ ] Until real prices are entered, the site tells customers the price shown is
      temporary and the final amount is confirmed during the consultation.
      That wording is automatic and does not need to be removed — but if you
      want it gone once prices are final, tell me.

---

## 3. Database update (one click, on the host)

- [ ] **Run the installer once** to add the new columns (tagline, benefits,
      before-care, contraindications, SMS name) and to load the six new
      services:

      1. Open `https://zohrezare.ir/api/install.php`
      2. Copy the key it gives you, then open
         `https://zohrezare.ir/api/install.php?key=...&run`
      3. You should see every line green.

      Existing appointments are **not** touched. The old four services are
      **deactivated, not deleted** — that is deliberate: every appointment
      points to its service, and deleting the row would blank out the service
      name in past bookings and their SMS.

- [ ] **Check with the self-test:** open `https://zohrezare.ir/api/selftest.php`.
      - If it says the new columns are missing, the installer did not run —
        run it again.
      - If the service count is not 6, the import did not finish.

- [ ] **Delete `api/install.php` from the host afterwards** (the page itself
      tells you this too). It is a setup tool, not something to leave online.

---

## 4. SMS patterns (this is the only SMS work left)

- [ ] **Send this file to whoever manages the SMS panel:**
      `docs/sms-approval-request.md`
      It contains every template text exactly as it must be typed, ready to
      copy-paste. There is also a plain-text version for the panel:
      `docs/sms-panel-texts.txt`

- [ ] **Only ONE pattern actually needs approval.** Service names are not
      hard-coded in the messages — the site inserts `{service}` at send time —
      so the new services do **not** need new patterns. The only changed
      pattern is **"New appointment request" (admin alert)**, which gained one
      line: the chosen option (`{option}`). That is so the salon knows whether
      it is a classic eyeliner or a smoky one, since durations and prices
      differ.

- [ ] **While the new pattern is waiting for approval:** keep the old one in
      `api/config.php`. The site works fine without the option line — it just
      sends slightly less detail to the salon.

- [ ] **After approval, put the texts into `api/config.php`** on the host
      (section 6 of the SMS file has the exact block to paste).

- [ ] **Test the SMS:** open `api/sms-test.php` (all five templates should read
      "ready"), then make a test booking and confirm the message arrives. Then
      approve one appointment and reject another from the panel to test both.

- [ ] **Watch the balance:** a full booking costs about 5 SMS parts, so with the
      current 115 credits you have roughly 23 bookings left. Worth topping up.

---

## 5. Deploy the site

- [ ] **Upload the package:** `zohrezare-cpanel.zip` (in the repo root, already
      built and checked). Extract it into `public_html`, replacing the old
      files. Do **not** delete `api/config.php` on the host — it is not in the
      zip on purpose (it holds the DB password and SMS credentials).

- [ ] **Hard-refresh once in the browser** (Ctrl+Shift+R). The service worker
      cache version was bumped, so old cached pages are dropped automatically —
      but a hard refresh makes it instant.

- [ ] **Check these three pages after upload:** `index.html`, `services.html`,
      and one service page (e.g. `service.html?s=ben-mozhe`).

---

## 6. Optional / nice to have

- [ ] **Cron job for the reminder SMS.** The reminder pattern is approved but
      nothing sends it yet, because that needs a scheduled job in cPanel. Ask
      if you want me to set this up.

- [ ] **Approve the three new photos.** I generated placeholder images for
      Ben Mozhe, Dark Lips and Microblading so the cards do not look broken.
      Real photos of her work would be much better — drop them in
      `assets/img/` and tell me the file names, I will swap them in.

- [ ] **Old portfolio filter labels were updated** ("مژه و اکستنشن" instead of
      "بنمژه") because the word "بن مژه" now means something different on the
      site. Check that the gallery categories still make sense to you.

---

## What was already done (for reference, no action needed)

| Area | Change |
|---|---|
| Catalog | 4 services replaced by 6 new ones (Ben Mozhe, Permanent Liner, Dark Lips, Lip Shading/Tint, Microblading, Lash & Brow Lift) |
| Service pages | Added hero tagline, benefits, "before you book" notes, before-care, after-care, and a contraindications list (PMU services only) |
| Shared care blocks | Lip / brow / eye / lift aftercare + the contraindication list live in one file (`service-care.js`), not copied into each service |
| SMS | Service name now read from a short editable field (`sms_name`) so long titles do not double SMS cost; new `{variant}` variable added |
| Admin panel | Fixed a bug that prevented the service editor from saving at all (string IDs vs numbers) |
| Database | `schema.sql` regenerated with new columns and auto-deactivation of removed services |
| Tooling | New `tools/check-catalog.js` check (missing images, icons, duplicate IDs, bad prices) wired into the deploy build |
| QA | All project tests pass: 29 booking-flow tests, PHP syntax, SQL structure, front/back API contract, mobile layout, catalog check |
