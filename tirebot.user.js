// ==UserScript==
// @name         TireBot Kavir Tire
// @namespace    tirebot
// @version      1.2
// @description  Kavir Tire auto-buy helper (Modern Light UI)
// @match        *://kavirtire.ir/*
// @match        *://*.kavirtire.ir/*
// @run-at       document-idle
// @noframes
// @grant        GM_info
// ==/UserScript==

(function () {
  if (window.__tirebotLoaded) return;
  window.__tirebotLoaded = true;

  // نوار عیب‌یابی پایین صفحه
  const dbg = document.createElement("div");
  dbg.id = "tirebot-dbg";
  dbg.style.cssText =
    "position:fixed;bottom:8px;left:8px;right:8px;z-index:2147483647;background:#10b981;color:#fff;" +
    "font:12px/1.5 Tahoma,monospace;padding:6px 12px;border-radius:10px;direction:ltr;text-align:left;" +
    "white-space:pre-wrap;word-break:break-all;max-height:35vh;overflow:auto;box-shadow:0 4px 12px rgba(0,0,0,0.15)";
  dbg.textContent = "TireBot v1.2: script started";
  (document.documentElement || document.body).appendChild(dbg);
  const dbgErrs = [];
  const showErr = (e, where) => {
    const msg = where + ": " + ((e && (e.stack || e.message)) || e);
    if (dbgErrs.includes(msg) || dbgErrs.length >= 3) return;
    dbgErrs.push(msg);
    dbg.style.background = "#ef4444";
    dbg.textContent = "TireBot ERROR\n" + dbgErrs.join("\n---\n");
  };
  setTimeout(() => { if (!dbgErrs.length) dbg.remove(); }, 4000);

// ======================= تنظیمات =======================
const CONFIG = {
  rims: ["13", "14", "15", "16", "17", "18", "19", "20"],
  defaultRims: ["15"],
  startTime: "08:00:00",
  refreshSelector: "#refresh-availability",
  keepAliveSec: 60,
  retryMs: 800,
  maxMinutesAfterStart: 60,
  fastMinutes: 5,
  slowRetryMs: 2500,
  testDelaySec: 15,
  clockSyncSamples: 8,

  // --- مرحله ۱: افزودن به سبد ---
  addToCart: {
    selector: "",
    texts: ["افزودن به سبد", "اضافه به سبد", "اضافه کردن به سبد"],
  },

  // --- مرحله ۲: صفحه‌ی «تایید و پرداخت» ---
  gateways: ["صادرات", "اقتصاد نوین", "رفاه کارگران"],
  defaultGateway: "صادرات",
  continueTexts: [
    "مشاهده سبد خرید", "مشاهده سبد", "تکمیل خرید", "ادامه فرآیند خرید",
    "تسویه حساب", "ثبت سفارش", "ثبت و ادامه", "تایید و ادامه", "مرحله بعد",
    "تایید", "تأیید", "بله", "ثبت", "ادامه",
  ],
  finalTexts: [
    "پرداخت و ثبت نهایی", "تایید و پرداخت", "ثبت و پرداخت", "ادامه و پرداخت", "پرداخت آنلاین", "رفتن به درگاه", "اتصال به درگاه",
  ],
  avoidTexts: ["افزودن", "اضافه", "ادامه خرید", "بازگشت", "حذف", "انصراف", "ویرایش", "پروفایل", "برگشت"],
  avoidContainers: "header, footer, nav, .steps, #tirebot-bar",
  unavailableTexts: ["ناموجود", "نا موجود", "اتمام موجودی", "موجود نیست", "تمام شد"],
  preferTexts: ["انتخاب", "افزودن", "اضافه", "خرید", "سفارش", "ثبت", "رزرو"],
  cardPriceMarker: "ریال",
  autoSelectFirstAddress: false,
  checkoutTimeoutSec: 60,
  addFailSec: 15,
  payRetryMs: 700,
  payWaitMs: 6000,
  rotateGateways: true,
  refreshSec: 10,
};
// =======================================================

(async function () {
  const SK = "tirebot_state";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const textOf = (el) => norm(el.innerText || el.value || "");
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const isDisabled = (el) =>
    el.disabled || el.getAttribute("aria-disabled") === "true" || el.classList.contains("disabled");
  const clickables = () =>
    document.querySelectorAll("button, a, input[type=submit], input[type=button], [role=button]");

  const load = () => { try { return JSON.parse(sessionStorage.getItem(SK) || "null"); } catch (e) { return null; } };
  const save = () => sessionStorage.setItem(SK, JSON.stringify(st));

  function computeTarget() {
    const [h, m, s] = CONFIG.startTime.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, s || 0, 0);
    return d.getTime();
  }

  let st = load() || { stage: "armed", mode: "real", targetMs: computeTarget() };
  save();

  // ---------------- رینگ و تنظیمات ذخیره‌شده ----------------
  const LS_RIMS = "tirebot_rims", LS_MIN = "tirebot_minutes";
  const LS_COLLAPSED = "tirebot_collapsed", LS_POS = "tirebot_pos";
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  function getRims() {
    try {
      const a = JSON.parse(lsGet(LS_RIMS) || "null");
      if (Array.isArray(a)) return a.map(String);
    } catch (e) {}
    return [...CONFIG.defaultRims];
  }
  const setRims = (a) => lsSet(LS_RIMS, JSON.stringify(a));
  function getMinutes() {
    const v = parseInt(lsGet(LS_MIN) || "", 10);
    return v > 0 ? v : CONFIG.maxMinutesAfterStart;
  }
  function rimOf(folded) {
    let m = folded.match(/\d{3}\/\d{2}(?:Z?R|-|\/)(\d{2})(?!\d)/);
    if (m) return m[1];
    m = folded.match(/\(R(\d{2})\)/);
    return m ? m[1] : null;
  }
  const rimNote = () => {
    const r = getRims();
    return r.length ? "رینگ: " + r.join("، ") : "⚠️ رینگی انتخاب نشده";
  };

  const LS_GW = "tirebot_gateway";
  function getGateway() {
    const g = lsGet(LS_GW);
    return CONFIG.gateways.includes(g) ? g : CONFIG.defaultGateway;
  }

  const LS_ROT = "tirebot_rotate", LS_PAYMS = "tirebot_payms", LS_RFON = "tirebot_refresh_on", LS_RFSEC = "tirebot_refresh_sec";
  const getRotate = () => { const v = lsGet(LS_ROT); return v === null ? CONFIG.rotateGateways : v === "1"; };
  const getPayMs = () => { const v = parseInt(lsGet(LS_PAYMS) || "", 10); return v >= 200 ? v : CONFIG.payRetryMs; };
  const getRefreshOn = () => lsGet(LS_RFON) === "1";
  const getRefreshSec = () => { const v = parseFloat(lsGet(LS_RFSEC) || ""); return v >= 2 ? v : CONFIG.refreshSec; };

  function looksLoggedOut() {
    return (
      /login|signin|sign-in|auth/i.test(location.pathname) ||
      [...document.querySelectorAll("input[type=password]")].some(isVisible)
    );
  }

  // در صفحه لاگین به صورت پیش‌فرض پنل جمع می‌شود تا جلوی کد ملی را نگیرد
  let isCollapsed = looksLoggedOut() ? true : lsGet(LS_COLLAPSED) === "1";
  let isBottom = lsGet(LS_POS) === "bottom";

  // ---------------- رابط کاربری مدرن، روشن و دلباز ----------------
  const bar = document.createElement("div");
  bar.id = "tirebot-bar";

  function applyBarPosition() {
    bar.style.cssText =
      "position:fixed;left:8px;right:8px;z-index:2147483647;" +
      (isBottom ? "bottom:8px;top:auto;" : "top:8px;bottom:auto;") +
      "background:rgba(255, 255, 255, 0.96);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);" +
      "color:#1e293b;font:13.5px/1.6 Tahoma,sans-serif;padding:10px 12px;direction:rtl;" +
      "display:flex;flex-direction:column;gap:8px;max-height:48vh;overflow:auto;" +
      "box-sizing:border-box;border-radius:16px;border:1px solid #e2e8f0;" +
      "box-shadow:0 8px 24px rgba(15, 23, 42, 0.12);transition:all 0.2s ease";
    updateBodySpacing();
  }

  // هدر همیشه‌فعال (نمایش وضعیت + دکمه جمع/باز کردن + تغییر مکان + توقف/ریست)
  const headerRow = document.createElement("div");
  headerRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap";

  const label = document.createElement("div");
  label.style.cssText = "font-weight:bold;color:#0f172a;font-size:13.5px;flex:1;min-width:160px";

  const headerActions = document.createElement("div");
  headerActions.style.cssText = "display:flex;align-items:center;gap:6px;flex-shrink:0";

  headerRow.append(label, headerActions);

  // بخش قابل جمع شدن (تنظیمات رینگ، درگاه و تست)
  const detailsWrap = document.createElement("div");
  const sizeBox = document.createElement("div");
  const gwBox = document.createElement("div");
  const optBox = document.createElement("div");
  const btnBox = document.createElement("div");
  [sizeBox, gwBox, optBox, btnBox].forEach(
    (b) => (b.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center")
  );
  detailsWrap.append(sizeBox, gwBox, optBox, btnBox);

  function syncCollapseUI() {
    detailsWrap.style.display = isCollapsed ? "none" : "flex";
    detailsWrap.style.flexDirection = "column";
    detailsWrap.style.gap = "8px";
    detailsWrap.style.paddingTop = "6px";
    detailsWrap.style.borderTop = "1px solid #f1f5f9";
    updateBodySpacing();
  }

  // تنظیم فاصله بالای صفحه تا هیچ دکمه‌ای از سایت زیر پنل نرود
  function updateBodySpacing() {
    requestAnimationFrame(() => {
      if (!document.body) return;
      const h = bar.offsetHeight || 0;
      if (!isBottom) {
        document.body.style.paddingTop = (h + 18) + "px";
        document.body.style.paddingBottom = "";
      } else {
        document.body.style.paddingBottom = (h + 18) + "px";
        document.body.style.paddingTop = "";
      }
    });
  }

  bar.append(headerRow, detailsWrap);
  document.documentElement.appendChild(bar);
  applyBarPosition();
  syncCollapseUI();

  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => updateBodySpacing()).observe(bar);
  }

  const setLabel = (t) => (label.textContent = t);

  function mkBtn(text, fn, active, variant = "default") {
    const b = document.createElement("button");
    b.textContent = text;
    let bg = "#f1f5f9", color = "#334155", border = "#cbd5e1", shadow = "none";

    if (active) {
      bg = "#10b981";
      color = "#ffffff";
      border = "#059669";
      shadow = "0 2px 6px rgba(16, 185, 129, 0.25)";
    } else if (variant === "danger") {
      bg = "#fee2e2";
      color = "#dc2626";
      border = "#fca5a5";
    } else if (variant === "primary") {
      bg = "#e0f2fe";
      color = "#0284c7";
      border = "#bae6fd";
    } else if (variant === "ghost") {
      bg = "#f8fafc";
      color = "#475569";
      border = "#e2e8f0";
    }

    b.style.cssText =
      "cursor:pointer;padding:5px 11px;font:12.5px Tahoma,sans-serif;min-height:32px;border-radius:10px;" +
      `border:1px solid ${border};background:${bg};color:${color};box-shadow:${shadow};` +
      "transition:all 0.15s ease;display:inline-flex;align-items:center;justify-content:center";
    b.addEventListener("click", fn);
    return b;
  }

  function setMinutesPrompt() {
    const v = prompt("بعد از ساعت شروع، ربات چند دقیقه کار کنه؟ (مثلاً 120)", String(getMinutes()));
    if (v === null) return;
    const n = parseInt(foldKey(v), 10);
    if (n >= 1 && n <= 720) { lsSet(LS_MIN, String(n)); renderButtons(); }
  }

  function setRefreshPrompt() {
    const v = prompt("هر چند ثانیه یک بار صفحه رفرش بشه؟ (حداقل 2)", String(getRefreshSec()));
    if (v === null) return;
    const n = parseFloat(foldKey(v));
    if (n >= 2 && n <= 3600) { lsSet(LS_RFSEC, String(n)); renderButtons(); }
  }
  function setPayMsPrompt() {
    const v = prompt("فاصله‌ی تلاش‌های پرداخت چند ثانیه باشه؟ (0.3 تا 10)", String(getPayMs() / 1000));
    if (v === null) return;
    const n = parseFloat(foldKey(v));
    if (n >= 0.3 && n <= 10) { lsSet(LS_PAYMS, String(Math.round(n * 1000))); renderButtons(); }
  }

  function renderButtons() {
    headerActions.innerHTML = "";
    sizeBox.innerHTML = "";
    gwBox.innerHTML = "";
    optBox.innerHTML = "";
    btnBox.innerHTML = "";

    const running = st.stage === "armed" || st.stage === "checkout";

    // دکمه‌های هدر (همیشه در دسترس حتی در حالت جمع‌شده)
    headerActions.append(
      mkBtn(
        isCollapsed ? "🔽 تنظیمات" : "🔼 جمع کردن",
        () => {
          isCollapsed = !isCollapsed;
          lsSet(LS_COLLAPSED, isCollapsed ? "1" : "0");
          syncCollapseUI();
          renderButtons();
        },
        false,
        "primary"
      ),
      mkBtn(
        isBottom ? "⬆️ بالا" : "⬇️ پایین",
        () => {
          isBottom = !isBottom;
          lsSet(LS_POS, isBottom ? "bottom" : "top");
          applyBarPosition();
          renderButtons();
        },
        false,
        "ghost"
      ),
      running
        ? mkBtn("⏹ توقف", () => finish("stopped", "ربات متوقف شد."), false, "danger")
        : mkBtn("🔄 شروع مجدد", resetBot, true)
    );

    if (running) {
      const chosen = new Set(getRims());
      const tag = document.createElement("span");
      tag.textContent = "رینگ:";
      tag.style.cssText = "align-self:center;color:#64748b;font-size:12.5px;font-weight:bold;margin-left:2px";
      sizeBox.append(tag);
      CONFIG.rims.forEach((r) =>
        sizeBox.append(
          mkBtn(r, () => {
            const cur = new Set(getRims());
            if (cur.has(r)) cur.delete(r); else cur.add(r);
            setRims([...cur].sort());
            renderButtons();
          }, chosen.has(r))
        )
      );
      const allOn = CONFIG.rims.every((r) => chosen.has(r));
      sizeBox.append(
        mkBtn("همه", () => { setRims(allOn ? [...CONFIG.defaultRims] : [...CONFIG.rims]); renderButtons(); }, allOn),
        mkBtn(`⏱ مدت: ${getMinutes()} دقیقه`, setMinutesPrompt)
      );
    }

    if (running) {
      const gsel = getGateway();
      const gtag = document.createElement("span");
      gtag.textContent = "درگاه:";
      gtag.style.cssText = "align-self:center;color:#64748b;font-size:12.5px;font-weight:bold;margin-left:2px";
      gwBox.append(gtag);
      CONFIG.gateways.forEach((g) =>
        gwBox.append(
          mkBtn(g, () => {
            lsSet(LS_GW, g);
            st.gwBase = CONFIG.gateways.indexOf(g);
            st.attempt = 0;
            save();
            renderButtons();
          }, gsel === g)
        )
      );
    }

    if (running) {
      optBox.append(
        mkBtn(
          getRotate() ? "🔁 چرخش درگاه: روشن" : "🔁 چرخش درگاه: خاموش",
          () => { lsSet(LS_ROT, getRotate() ? "0" : "1"); renderButtons(); },
          getRotate()
        ),
        mkBtn(`⚡ تلاش پرداخت: ${(getPayMs() / 1000).toFixed(1)} ثانیه`, setPayMsPrompt),
        mkBtn(
          getRefreshOn() ? "🔃 رفرش صفحه: روشن" : "🔃 رفرش صفحه: خاموش",
          () => { lsSet(LS_RFON, getRefreshOn() ? "0" : "1"); renderButtons(); },
          getRefreshOn()
        ),
        mkBtn(`⏱ هر ${getRefreshSec()} ثانیه`, setRefreshPrompt)
      );
    }

    btnBox.append(mkBtn("📋 کپی اطلاعات صفحه", collectInfo, false, "ghost"));
    if (running && st.mode === "real") {
      btnBox.append(
        mkBtn("🧪 تست بدون کلیک", () => startTest("test-dry"), false, "primary"),
        mkBtn("🧪 تست کامل", () => {
          if (confirm("تست کامل واقعاً محصول رو انتخاب می‌کنه و تا درگاه پیش می‌ره (پرداخت نمی‌شه). ادامه؟"))
            startTest("test-real");
        }, false, "primary")
      );
    }
    updateBodySpacing();
  }

  function beep() {
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      o.connect(ctx.destination);
      o.frequency.value = 880;
      o.start();
      setTimeout(() => o.stop(), 700);
    } catch (e) {}
  }

  function alertUser() {
    beep();
    try { navigator.vibrate && navigator.vibrate([400, 150, 400, 150, 400]); } catch (e) {}
    document.title = "🔔 " + document.title.replace(/^🔔 /, "");
    let n = 0;
    const f = setInterval(() => {
      bar.style.background = n++ % 2 ? "rgba(255, 255, 255, 0.96)" : "#fee2e2";
      if (n > 20) { clearInterval(f); bar.style.background = "rgba(255, 255, 255, 0.96)"; }
    }, 300);
  }

  let timer = null;
  function finish(stage, msg, alert) {
    st.stage = stage;
    save();
    if (timer) clearInterval(timer);
    setLabel(msg);
    renderButtons();
    if (alert) alertUser();
  }

  function resetBot() {
    if (timer) clearInterval(timer);
    st = { stage: "armed", mode: "real", targetMs: computeTarget(), offset: st.offset, offsetAt: st.offsetAt, synced: st.synced };
    save();
    gwTries = 0; gwLastTry = 0; gwWarn = false;
    captchaAlerted = false; loginAlerted = false; lastBtn = null;
    renderButtons();
    setLabel("ربات دوباره آماده شد.");
    timer = setInterval(tick, 50);
  }

  // ---------------- ساعت سایت ----------------
  async function fetchServerDate() {
    const url = location.origin + "/?tirebot=" + Math.random();
    for (const method of ["HEAD", "GET"]) {
      try {
        const res = await fetch(url, { method, cache: "no-store", credentials: "omit" });
        const d = res.headers.get("date");
        const age = parseInt(res.headers.get("age") || "0", 10);
        if (d && !(age > 0)) return new Date(d).getTime();
      } catch (e) {}
    }
    return null;
  }

  async function syncClock() {
    let lo = -Infinity, hi = Infinity;
    for (let i = 0; i < CONFIG.clockSyncSamples; i++) {
      const t0 = Date.now();
      const D = await fetchServerDate();
      const t1 = Date.now();
      if (D !== null) {
        const mid = (t0 + t1) / 2;
        lo = Math.max(lo, D - mid);
        hi = Math.min(hi, D + 1000 - mid);
      }
      await sleep(120 + Math.random() * 180);
    }
    if (lo === -Infinity) return null;
    return (lo + hi) / 2;
  }

  async function ensureOffset() {
    if (typeof st.offset === "number" && Date.now() - st.offsetAt < 10 * 60 * 1000) return;
    setLabel("⏱ در حال هماهنگ‌سازی ساعت با سایت...");
    const off = await syncClock();
    st.offset = off === null ? 0 : off;
    st.synced = off !== null;
    st.offsetAt = Date.now();
    save();
  }

  const serverNow = () => Date.now() + (st.offset || 0);
  const offsetNote = () =>
    st.synced ? `ساعت سایت (اختلاف ${(st.offset / 1000).toFixed(2)}ث)` : "⚠️ ساعت دستگاه";

  // ---------------- پیدا کردن دکمه‌ها ----------------
  const foldKey = (x) =>
    norm(x)
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[\s\u200c\u200f\u200e]+/g, "")
      .toUpperCase();
  const inAvoid = (el) => !!el.closest(CONFIG.avoidContainers);
  const BUTTON_LIKE =
    "button, a, input[type=submit], input[type=button], [role=button], .btn, [onclick], [class*='btn'], [class*='button']";
  const isUnavailableText = (el) => {
    const t = foldKey(textOf(el));
    return CONFIG.unavailableTexts.some((u) => t.includes(foldKey(u)));
  };

  function scanCards(rimSet) {
    const rims = rimSet || new Set(getRims());
    if (!rims.size) return [];
    const mark = foldKey(CONFIG.cardPriceMarker || "");
    const priceCount = (q) => (mark ? foldKey(q.textContent).split(mark).length - 1 : 0);

    const leaves = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode;
      const pe = n.parentElement;
      if (!pe || n.nodeValue.length > 200 || pe.closest("#tirebot-bar")) continue;
      const rim = rimOf(foldKey(n.nodeValue));
      if (rim && rims.has(rim)) leaves.push(pe);
    }

    const res = [];
    const seen = new Set();
    for (const leaf of leaves) {
      let p = leaf, root = null, btn = null, avail = false;
      for (let i = 0; i < 6 && p.parentElement; i++) {
        const q = p.parentElement;
        if (priceCount(q) > 1) break;
        p = q;
        root = q;
        const okEl = (el) => isVisible(el) && !inAvoid(el) && textOf(el);
        let cands = [...q.querySelectorAll(BUTTON_LIKE)].filter(okEl);
        if (!cands.length) {
          cands = [...q.querySelectorAll("*")].filter((el) => okEl(el) && getComputedStyle(el).cursor === "pointer");
        }
        if (cands.length) {
          let ok = cands.filter((el) => !isDisabled(el) && !isUnavailableText(el));
          ok = ok.filter((el) => !ok.some((o) => o !== el && el.contains(o)));
          btn = ok.find((el) => CONFIG.preferTexts.some((t) => textOf(el).includes(t))) || ok[0] || null;
          avail = !!btn;
          break;
        }
      }
      if (!root || seen.has(root)) continue;
      seen.add(root);
      res.push({ root, btn, avail, size: norm(leaf.textContent).slice(0, 14) });
    }
    return res;
  }

  function findAdd() {
    const c = CONFIG.addToCart;
    if (c.selector) {
      const el = document.querySelector(c.selector);
      return el && !isDisabled(el) && isVisible(el) ? el : null;
    }
    const r = scanCards().find((x) => x.avail);
    return r ? r.btn : null;
  }

  function visibleButtonTexts() {
    return [...clickables()].filter((e) => isVisible(e) && !isDisabled(e) && !e.closest("#tirebot-bar")).map(textOf)
      .filter((t) => t && t.length < 30).slice(0, 8).join(" | ");
  }

  // ---------------- جمع‌آوری اطلاعات صفحه ----------------
  function cssPath(el) {
    if (el.id) return "#" + CSS.escape(el.id);
    const parts = [];
    for (let i = 0; i < 4 && el && el.nodeType === 1 && el !== document.body; i++, el = el.parentElement) {
      let part = el.tagName.toLowerCase();
      const cls = [...el.classList].slice(0, 2).map((c) => "." + CSS.escape(c)).join("");
      part += cls;
      const sib = el.parentElement && [...el.parentElement.children].filter((c) => c.tagName === el.tagName);
      if (sib && sib.length > 1) part += `:nth-of-type(${sib.indexOf(el) + 1})`;
      parts.unshift(part);
      if (el.id) break;
    }
    return parts.join(" > ");
  }

  const mask = (t) => (t || "").replace(/[0-9۰-۹٠-٩]{5,}/g, "•••").replace(/[A-Za-z0-9]{12,}/g, "•••");

  function collectInfo() {
    const els = [...clickables()].filter((el) => isVisible(el) && !el.closest("#tirebot-bar")).slice(0, 40).map((el) => {
      let card = "";
      let p = el.parentElement;
      for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
        const t = norm(p.innerText);
        if (t.length > 20) {
          card = /نام|کدملی|کد ملی|موبایل|تلفن|ایمیل|آدرس|شاسی|موتور/.test(t) ? "(اطلاعات شخصی حذف شد)" : mask(t).slice(0, 100);
          break;
        }
      }
      return {
        text: textOf(el).slice(0, 40),
        tag: el.tagName.toLowerCase(),
        selector: cssPath(el),
        disabled: isDisabled(el),
        card,
      };
    });
    const slim = (h) =>
      h
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/\s+/g, " ")
        .replace(/\swire:[\w.:-]+="[^"]*"/g, "")
        .replace(/\s(?:src|srcset|style|data-[\w-]+)="[^"]*"/g, "")
        .slice(0, 1200);
    const flag = (h, k) => {
      const m = h.match(new RegExp("&quot;" + k + "&quot;:(true|false)"));
      return m ? m[1] === "true" : null;
    };
    const cards = scanCards(new Set(CONFIG.rims)).slice(0, 8).map((c) => ({
      avail: c.avail,
      state: { available: flag(c.root.outerHTML, "available"), exhausted: flag(c.root.outerHTML, "exhausted") },
      picked: c.btn ? textOf(c.btn) : null,
      text: norm(c.root.innerText).slice(0, 120),
      html: slim(c.root.outerHTML),
    }));
    const inputs = [...document.querySelectorAll("input, select, textarea")]
      .filter(isVisible).slice(0, 20)
      .map((i) => ({ type: i.type || i.tagName.toLowerCase(), name: i.name || "", id: i.id || "", placeholder: i.placeholder || "", checked: !!i.checked, selector: cssPath(i) }));
    const info = {
      url: location.href,
      title: document.title,
      botStage: st.stage,
      siteStock: readStock(),
      cards,
      buttons: els,
      inputs,
      stockHint: mask((norm(document.body.innerText).match(/موجودی[^.]{0,40}/) || [""])[0]),
    };
    const txt = JSON.stringify(info, null, 1);
    navigator.clipboard.writeText(txt).then(
      () => setLabel("📋 اطلاعات کپی شد؛ توی چت Paste کن (Ctrl+V)."),
      () => prompt("این متن رو کپی کن:", txt)
    );
  }

  // ---------------- تست ----------------
  function startTest(mode) {
    st = {
      stage: "armed", mode,
      targetMs: serverNow() + CONFIG.testDelaySec * 1000,
      offset: st.offset, offsetAt: st.offsetAt, synced: st.synced,
    };
    save();
    renderButtons();
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 50);
  }

  // ---------------- منطق اصلی ----------------
  let lastTry = Date.now();
  let testPhase = 0;
  let stockTxt = "";
  let cardsTxt = "";
  let prevStock = null;
  const pageLoadedAt = Date.now();
  let lastKeepAlive = Date.now();
  let loginAlerted = false;
  let lastBtn = null, lastClickAt = 0, captchaAlerted = false;
  let gwTries = 0, gwLastTry = 0, gwWarn = false;
  const modeTag = () => (st.mode === "real" ? "" : st.mode === "test-dry" ? "🧪[تست بدون کلیک] " : "🧪[تست کامل] ");

  const LS_RFCLICK = "tirebot_lastrefreshclick";
  function clickRefresh(rf) {
    if (st.rfBroken) return;
    try { sessionStorage.setItem(LS_RFCLICK, String(Date.now())); } catch (e) {}
    rf.click();
  }

  // ---------- انتخاب درگاه در صفحه‌ی پرداخت ----------
  function findGatewayOption(name) {
    const target = foldKey(name);
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode;
      if (n.nodeValue.length > 40 || foldKey(n.nodeValue) !== target) continue;
      const inner = n.parentElement;
      if (!inner || inner.closest("#tirebot-bar") || inAvoid(inner) || !isVisible(inner)) continue;
      let outer = inner;
      while (
        outer.parentElement && outer.parentElement !== document.body &&
        foldKey(outer.parentElement.textContent) === target
      ) outer = outer.parentElement;
      const lab = outer.closest("label");
      const input = outer.querySelector("input[type=radio], input[type=checkbox]") || (lab && lab.querySelector("input"));
      return { inner, outer, targets: [inner, outer, input || outer.parentElement || outer] };
    }
    return null;
  }

  function gwSelected(outer) {
    const input = outer.querySelector("input[type=radio], input[type=checkbox]");
    if (input && input.checked) return true;
    for (const el of [outer, outer.parentElement]) {
      if (!el) continue;
      if (/(^|[\s_-])(active|selected|checked|chosen)([\s_-]|$)/i.test(el.className || "")) return true;
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      if (m && m.length >= 3 && (m.length < 4 || Number(m[3]) > 0)) {
        const [r, g, b] = m.map(Number);
        if (g > r + 15 && g > b + 15) return true;
      }
    }
    return false;
  }

  function onAddFound(btn) {
    if (st.mode === "test-dry") {
      btn.style.outline = "4px solid #ef4444";
      btn.scrollIntoView({ block: "center" });
      finish("done", `🧪 تست موفق: دکمه پیدا شد (کلیک نشد) ← «${textOf(btn)}»`, true);
      return;
    }
    st.stage = "checkout";
    st.stageStart = Date.now();
    st.attempt = 0; st.lastConfirmAt = 0; st.gwBase = null; st.reachedGateway = false;
    save();
    setLabel(modeTag() + "🛒 افزودن به سبد زده شد، رفتن به صفحه‌ی پرداخت...");
    renderButtons();
    btn.click();
  }

  function detectPayError() {
    const out = { limit: false, soldout: false };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode;
      if (n.nodeValue.length > 200) continue;
      const pe = n.parentElement;
      if (!pe || pe.closest("#tirebot-bar") || !isVisible(pe)) continue;
      const f = foldKey(n.nodeValue);
      if (/تعداددفعات.*حدمجاز|حدمجاز.*پرداخت/.test(f)) out.limit = true;
      if (/موجودی.*اتمام|اتمام.*موجودی|موجودیمحصول.*تمام/.test(f)) out.soldout = true;
    }
    return out;
  }

  function findFinalBtn() {
    const els = [...clickables()].filter((el) => !isDisabled(el) && isVisible(el) && !inAvoid(el));
    for (const t of CONFIG.finalTexts) {
      for (const el of els) {
        const x = textOf(el);
        if (!x || CONFIG.avoidTexts.some((a) => x.includes(a))) continue;
        if (x === t || x.startsWith(t)) return el;
      }
    }
    return null;
  }

  const refreshDue = () =>
    getRefreshOn() && st.mode === "real" &&
    Date.now() - (st.lastReloadAt || pageLoadedAt) >= getRefreshSec() * 1000;
  function doReload() {
    st.lastReloadAt = Date.now();
    save();
    try { sessionStorage.removeItem(LS_RFCLICK); } catch (e) {}
    location.reload();
  }
  const rfNote = () => {
    if (!getRefreshOn()) return "";
    const left = Math.ceil(((st.lastReloadAt || pageLoadedAt) + getRefreshSec() * 1000 - Date.now()) / 1000);
    return ` | 🔃 رفرش بعدی ${Math.max(0, left)}ث`;
  };

  function checkoutStep() {
    const path = location.pathname;
    const onPay = /\/payment/i.test(path);
    const onGate = /\/gateway/i.test(path);

    if (onGate) {
      if (!st.reachedGateway) { st.reachedGateway = true; save(); alertUser(); }
      setLabel("💳 در حال انتقال به درگاه بانک... پرداخت با خودته.");
      return;
    }

    const err = onPay ? detectPayError() : { limit: false, soldout: false };

    if (err.soldout) {
      finish("stopped", "⛔ پیغام «موجودی محصول به اتمام رسیده» دریافت شد؛ ربات متوقف شد.", true);
      return;
    }

    if (!onPay) {
      if (st.reachedGateway) { setLabel("✔️ از صفحه‌ی پرداخت رد شدی؛ ادامه با خودته."); return; }
      const waited = Date.now() - st.stageStart;
      if (/products/i.test(path) && waited > CONFIG.addFailSec * 1000) {
        st.stage = "armed";
        save();
        setLabel("افزودن به سبد جواب نداد؛ دوباره زیر نظر می‌گیرم...");
        return;
      }
      if (waited > CONFIG.checkoutTimeoutSec * 1000) {
        finish("done", "⚠️ به صفحه‌ی پرداخت نرسیدم؛ از همین‌جا خودت ادامه بده. دکمه‌ها: " + visibleButtonTexts(), true);
        return;
      }
      setLabel(modeTag() + "🛒 منتظر باز شدن صفحه‌ی پرداخت...");
      return;
    }

    if (st.reachedGateway) {
      if (!err.limit) { setLabel("💳 قبلاً به درگاه رفتی؛ اگر پرداخت نشد، دوباره از همین‌جا تلاش کن."); return; }
      st.reachedGateway = false;
      save();
    }

    const now = Date.now();
    const first = !st.lastConfirmAt;
    const since = now - (st.lastConfirmAt || 0);
    const attemptNo = st.attempt || 0;

    if (!first && refreshDue() && (err.limit || since >= CONFIG.payWaitMs)) {
      if (since >= 1500) { doReload(); return; }
      setLabel(modeTag() + "🔃 آماده‌ی رفرش...");
      return;
    }

    let shouldAttempt = first;
    if (!first) {
      if (err.limit && since >= getPayMs()) shouldAttempt = true;
      else if (since >= CONFIG.payWaitMs) shouldAttempt = true;
    }
    if (!shouldAttempt) {
      setLabel(`${modeTag()}⏳ تلاش ${attemptNo} انجام شد؛ منتظر پاسخ سایت${err.limit ? " (خطای تعداد دفعات)" : ""}...${rfNote()}`);
      return;
    }

    const gws = CONFIG.gateways;
    if (st.gwBase === null || st.gwBase === undefined || st.gwBase < 0) st.gwBase = Math.max(0, gws.indexOf(getGateway()));
    const tgt = getRotate() ? gws[(st.gwBase + attemptNo) % gws.length] : getGateway();

    const gw = findGatewayOption(tgt);
    if (!gw) {
      setLabel(modeTag() + `⏳ منتظر نمایش درگاه «${tgt}» در صفحه‌ی پرداخت...`);
      return;
    }
    if (!gwSelected(gw.outer)) {
      if (gwTries < 3) {
        if (now - gwLastTry > 250) {
          gwLastTry = now;
          gw.targets[gwTries].click();
          gwTries++;
          setLabel(modeTag() + `انتخاب درگاه «${tgt}»...`);
        }
        return;
      }
      if (now - gwLastTry < 250) return;
      gwWarn = true;
    }

    const btn = findFinalBtn();
    if (!btn) {
      const waited = now - st.stageStart;
      setLabel(modeTag() + (waited > 8000
        ? "دکمه‌ی «تایید و پرداخت» فعال نیست/پیدا نشد. دکمه‌های صفحه: " + visibleButtonTexts()
        : "منتظر فعال شدن دکمه‌ی «تایید و پرداخت»..."));
      return;
    }

    st.attempt = attemptNo + 1;
    st.lastConfirmAt = now;
    save();
    gwTries = 0;
    const warn = gwWarn ? " (انتخاب درگاه تایید نشد)" : "";
    gwWarn = false;
    setLabel(`${modeTag()}💳 تلاش ${st.attempt}: «${textOf(btn)}» با درگاه ${tgt}${warn}${rfNote()}`);
    btn.click();
  }

  function cardsNote() {
    return scanCards()
      .slice(0, 5)
      .map((c) => {
        const t = foldKey(c.root.textContent);
        const why = CONFIG.unavailableTexts.find((u) => t.includes(foldKey(u)));
        return `${c.size}: ${c.avail ? "موجود ✅" : why || "؟"}`;
      })
      .join(" · ");
  }

  function readStock() {
    const m = foldKey(document.body.innerText || "").match(/موجودیباقیمانده[:：]?(\d+)/);
    return m ? m[1] : null;
  }

  const fmt = (ms) => {
    const t = Math.ceil(ms / 1000);
    if (t <= 120) return t + " ثانیه";
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  function tick() {
    try { tickInner(); } catch (e) { showErr(e, "tick"); }
  }
  function tickInner() {
    if ((st.stage === "armed" || st.stage === "checkout") && looksLoggedOut()) {
      if (!isCollapsed) {
        isCollapsed = true;
        syncCollapseUI();
        renderButtons();
      }
      setLabel("⚠️ وارد حساب شو؛ بعد از ورود ربات خودکار ادامه می‌ده.");
      if (!loginAlerted) { loginAlerted = true; alertUser(); }
      return;
    }
    if (st.stage === "checkout") return checkoutStep();
    if (st.stage !== "armed") return;

    const now = serverNow();
    const diff = st.targetMs - now;

    if (diff > 0) {
      const nextDay = new Date(st.targetMs).toDateString() !== new Date().toDateString() ? " (فردا)" : "";
      setLabel(`${modeTag()}⏳ ${fmt(diff)} تا شروع${nextDay} | ${rimNote()} | ${offsetNote()}`);
      if (
        CONFIG.keepAliveSec > 0 && diff > 3000 &&
        Date.now() - lastKeepAlive > CONFIG.keepAliveSec * 1000
      ) {
        lastKeepAlive = Date.now();
        const rf0 = CONFIG.refreshSelector && document.querySelector(CONFIG.refreshSelector);
        if (rf0 && !isDisabled(rf0)) clickRefresh(rf0);
      }
      return;
    }

    const winMs = (st.mode === "real" ? getMinutes() : 2) * 60000;
    if (now > st.targetMs + winMs) {
      if (st.mode === "real") {
        let next = computeTarget();
        if (next <= now) next += 86400000;
        st.targetMs = next;
        save();
        lastKeepAlive = Date.now();
        return;
      }
      finish("stopped", "🧪 تست تموم شد، دکمه پیدا نشد.", true);
      return;
    }

    const btn = findAdd();
    if (btn) return onAddFound(btn);

    if (st.mode === "test-dry") {
      if (!testPhase) {
        testPhase = Date.now();
        const rf = CONFIG.refreshSelector && document.querySelector(CONFIG.refreshSelector);
        if (rf) clickRefresh(rf);
        setLabel("🧪 در حال بررسی کارت‌ها...");
        return;
      }
      if (Date.now() - testPhase < 1500) return;
      const cards = scanCards();
      cards.forEach((c) => (c.root.style.outline = "3px solid #f59e0b"));
      finish(
        "done",
        cards.length
          ? `🧪 ${cards.length} کارت با رینگ انتخابی پیدا شد (کادر نارنجی). وضعیت: ` +
              cards.map((c) => (c.avail ? "موجود" : "ناموجود")).join("، ")
          : "🧪 کارتی با رینگ انتخابی پیدا نشد؛ رینگ یا ساختار صفحه رو چک کن.",
        true
      );
      return;
    }

    const stk = (stockTxt ? " | موجودی کل سایت: " + stockTxt : "") + (cardsTxt ? " | " + cardsTxt : "");
    const endAt = new Date(st.targetMs + winMs).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
    const rfWarn = st.rfBroken ? " | ⚠️ دکمه‌ی بروزرسانی صفحه رو لود می‌کرد؛ دیگه نمی‌زنمش، خودت دستی بروزرسانی کن" : "";
    setLabel(modeTag() + `🔄 ${rimNote()} | هنوز موجود نشده؛ تا ساعت ${endAt} تلاش می‌کنم${stk}${rfWarn}${rfNote()}`);
    if (refreshDue()) { doReload(); return; }
    const pace = now - st.targetMs > CONFIG.fastMinutes * 60000 ? CONFIG.slowRetryMs : CONFIG.retryMs;
    if (Date.now() - lastTry > pace) {
      lastTry = Date.now();
      cardsTxt = cardsNote();
      const sv = readStock();
      if (sv !== null) {
        if (prevStock !== null && Number(sv) > Number(prevStock)) alertUser();
        prevStock = sv;
        stockTxt = sv;
      }
      const rf = CONFIG.refreshSelector && document.querySelector(CONFIG.refreshSelector);
      if (rf && !isDisabled(rf)) clickRefresh(rf);
    }
  }

  // ---------------- شروع ----------------
  renderButtons();
  if (st.stage === "done" || st.stage === "stopped") {
    setLabel(st.stage === "done" ? (st.final ? "💳 رسیدی به درگاه؛ پرداخت با خودته (کار ربات تمام شد)." : "✔️ کار ربات تمام شد.") : "ربات متوقف است.");
    return;
  }
  const lastRf = parseInt(sessionStorage.getItem(LS_RFCLICK) || "0", 10);
  if (st.stage === "armed" && !st.rfBroken && lastRf && Date.now() - lastRf < 6000) {
    st.rfBroken = true;
    save();
    alertUser();
  }
  if (st.stage === "armed" && Date.now() < st.targetMs) await ensureOffset();
  async function keepAwake() {
    try { if (navigator.wakeLock) await navigator.wakeLock.request("screen"); } catch (e) {}
  }
  keepAwake();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") keepAwake();
  });
  timer = setInterval(tick, 50);
})().catch((e) => showErr(e, "main"));
})();
