// ==UserScript==
// @name         TireBot Kavir Tire
// @namespace    tirebot
// @version      1.1
// @description  Kavir Tire auto-buy helper (Firefox + Tampermonkey)
// @match        *://kavirtire.ir/*
// @match        *://*.kavirtire.ir/*
// @run-at       document-idle
// @noframes
// @grant        GM_info
// ==/UserScript==

(function () {
  if (window.__tirebotLoaded) return;
  window.__tirebotLoaded = true;

  // نوار عیب‌یابی پایین صفحه: اگر اسکریپت اجرا شود چند ثانیه سبز دیده می‌شود؛ اگر خطا بدهد قرمز می‌ماند
  const dbg = document.createElement("div");
  dbg.id = "tirebot-dbg";
  dbg.style.cssText =
    "position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#0a7a0a;color:#fff;" +
    "font:12px/1.5 monospace;padding:4px 8px;direction:ltr;text-align:left;white-space:pre-wrap;" +
    "word-break:break-all;max-height:35vh;overflow:auto";
  dbg.textContent = "TireBot v1.1: script started";
  (document.documentElement || document.body).appendChild(dbg);
  const dbgErrs = [];
  const showErr = (e, where) => {
    const msg = where + ": " + ((e && (e.stack || e.message)) || e);
    if (dbgErrs.includes(msg) || dbgErrs.length >= 3) return;
    dbgErrs.push(msg);
    dbg.style.background = "#b00020";
    dbg.textContent = "TireBot ERROR\n" + dbgErrs.join("\n---\n");
  };
  setTimeout(() => { if (!dbgErrs.length) dbg.remove(); }, 6000);

// ======================= تنظیمات =======================
const CONFIG = {
  rims: ["13", "14", "15", "16", "17", "18", "19", "20"], // قطر رینگ‌هایی که دکمه‌شون بالای صفحه هست
  defaultRims: ["15"],            // رینگ‌های انتخاب‌شده در اولین اجرا (بعداً با دکمه‌ها عوض می‌شه)
  startTime: "08:00:00",        // ساعت شروع فروش (به وقت سایت)
  refreshSelector: "#refresh-availability", // دکمه‌ی «بروزرسانی موجودی» سایت؛ به‌جای رفرش کل صفحه کلیک می‌شود
  keepAliveSec: 60,             // قبل از ساعت شروع، هر چند ثانیه یک بار دکمه‌ی بروزرسانی زده شود تا سشن زنده بماند (0 = خاموش)
  retryMs: 800,                 // فاصله رفرش‌ها بعد از شروع (کمتر از 500 نکن)
  maxMinutesAfterStart: 60,     // مدت پیش‌فرض کار بعد از ساعت شروع (با دکمه‌ی ⏱ بالای صفحه عوض می‌شه)
  fastMinutes: 5,               // در این چند دقیقه‌ی اول، سریع (retryMs) بروزرسانی می‌زند
  slowRetryMs: 2500,            // بعد از آن، آرام‌تر می‌زند تا از سایت خارج نشوی
  testDelaySec: 15,             // در حالت تست، چند ثانیه بعد "شروع فروش" حساب شود
  clockSyncSamples: 8,          // تعداد نمونه برای هماهنگ‌سازی ساعت با سایت

  // --- مرحله ۱: افزودن به سبد ---
  addToCart: {
    selector: "",               // اگر سلکتور CSS دکمه رو داری اینجا بذار (دقیق‌ترین حالت)
    texts: ["افزودن به سبد", "اضافه به سبد", "اضافه کردن به سبد"],
  },

  // --- مرحله ۲: صفحه‌ی «تایید و پرداخت» (بعد از افزودن به سبد خودکار به آن می‌رود) ---
  gateways: ["صادرات", "اقتصاد نوین", "رفاه کارگران"], // درگاه‌هایی که در صفحه‌ی پرداخت هست
  defaultGateway: "صادرات",     // درگاه اولیه (از دکمه‌های بالای صفحه عوض می‌شه)
  continueTexts: [              // دکمه‌های مراحل میانی (به ترتیب اولویت)
    "مشاهده سبد خرید", "مشاهده سبد", "تکمیل خرید", "ادامه فرآیند خرید",
    "تسویه حساب", "ثبت سفارش", "ثبت و ادامه", "تایید و ادامه", "مرحله بعد",
    "تایید", "تأیید", "بله", "ثبت", "ادامه",
  ],
  finalTexts: [                 // دکمه‌های نهایی که درگاه رو باز می‌کنند
    "پرداخت و ثبت نهایی", "تایید و پرداخت", "ثبت و پرداخت", "ادامه و پرداخت", "پرداخت آنلاین", "رفتن به درگاه", "اتصال به درگاه",
  ],
  avoidTexts: ["افزودن", "اضافه", "ادامه خرید", "بازگشت", "حذف", "انصراف", "ویرایش", "پروفایل", "برگشت"], // روی این‌ها کلیک نشود
  avoidContainers: "header, footer, nav, .steps, #tirebot-bar", // دکمه‌های داخل این بخش‌ها (مثل مراحل بالای صفحه) هرگز کلیک نشوند
  unavailableTexts: ["ناموجود", "نا موجود", "اتمام موجودی", "موجود نیست", "تمام شد"], // وضعیت‌های «موجود نیست» روی کارت
  preferTexts: ["انتخاب", "افزودن", "اضافه", "خرید", "سفارش", "ثبت", "رزرو"], // اگر چند دکمه توی کارت بود، اولویت با این‌هاست
  cardPriceMarker: "ریال",        // هر کارت محصول یک قیمت دارد؛ برای تشخیص مرز کارت‌ها
  autoSelectFirstAddress: false, // اگر true باشد و هیچ آدرسی انتخاب نشده باشد، اولین آدرس را انتخاب می‌کند
  checkoutTimeoutSec: 60,       // اگر بعد از افزودن به سبد تا این مدت به صفحه‌ی پرداخت نرسید، ربات می‌ایستد
  addFailSec: 15,               // اگر بعد از کلیک افزودن، این‌قدر در صفحه‌ی محصولات ماند، دوباره زیر نظر می‌گیرد
  payRetryMs: 700,              // فاصله‌ی تلاش‌های پرداخت وقتی خطای «تعداد دفعات...» می‌آید (با دکمه‌ی ⚡ عوض می‌شه)
  payWaitMs: 6000,              // اگر بعد از کلیک تایید این‌قدر هیچ پاسخی نیامد، دوباره تلاش کن
  rotateGateways: true,         // در هر تلاش، درگاه بعدی را امتحان کن (از دکمه‌ی 🔁 عوض می‌شه)
  refreshSec: 10,               // فاصله‌ی پیش‌فرض رفرش صفحه، فقط وقتی دکمه‌ی 🔃 روشن باشد (پیش‌فرض خاموش)
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

  // ---------------- رینگ و مدت کار ----------------
  const LS_RIMS = "tirebot_rims", LS_MIN = "tirebot_minutes";
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
  // قطر رینگ را از متن می‌خواند: "185/65R15" ← "15" ، "(R15)" ← "15"
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

  // ---------------- رابط کاربری ----------------
  const bar = document.createElement("div");
  bar.id = "tirebot-bar";
  bar.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#111;color:#0f0;" +
    "font:15px/1.6 Tahoma,sans-serif;padding:8px 10px;direction:rtl;display:flex;" +
    "flex-direction:column;gap:6px;max-height:45vh;overflow:auto;box-sizing:border-box";
  const label = document.createElement("div");
  const sizeBox = document.createElement("div");
  const btnBox = document.createElement("div");
  const gwBox = document.createElement("div");
  const optBox = document.createElement("div");
  [sizeBox, gwBox, optBox, btnBox].forEach((b) => (b.style.cssText = "display:flex;flex-wrap:wrap;gap:6px"));
  bar.append(label, sizeBox, gwBox, optBox, btnBox);
  document.documentElement.appendChild(bar);
  const setLabel = (t) => (label.textContent = t);

  function mkBtn(text, fn, active) {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.cssText =
      "cursor:pointer;padding:7px 11px;font:13px Tahoma,sans-serif;min-height:34px;border-radius:6px;" +
      "border:1px solid " + (active ? "#0f0" : "#666") + ";" +
      "background:" + (active ? "#0a7a0a" : "#222") + ";color:#fff";
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
    sizeBox.innerHTML = "";
    gwBox.innerHTML = "";
    optBox.innerHTML = "";
    btnBox.innerHTML = "";
    const running = st.stage === "armed" || st.stage === "checkout";
    if (running) {
      const chosen = new Set(getRims());
      const tag = document.createElement("span");
      tag.textContent = "رینگ:";
      tag.style.cssText = "align-self:center;color:#ccc;font-size:13px";
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
      gtag.style.cssText = "align-self:center;color:#ccc;font-size:13px";
      gwBox.append(gtag);
      CONFIG.gateways.forEach((g) =>
        gwBox.append(mkBtn(g, () => { lsSet(LS_GW, g); st.gwBase = CONFIG.gateways.indexOf(g); st.attempt = 0; save(); renderButtons(); }, gsel === g))
      );
    }
    if (running) {
      optBox.append(
        mkBtn(getRotate() ? "🔁 چرخش درگاه: روشن" : "🔁 چرخش درگاه: خاموش",
          () => { lsSet(LS_ROT, getRotate() ? "0" : "1"); renderButtons(); }, getRotate()),
        mkBtn(`⚡ تلاش پرداخت: ${(getPayMs() / 1000).toFixed(1)} ثانیه`, setPayMsPrompt),
        mkBtn(getRefreshOn() ? "🔃 رفرش صفحه: روشن" : "🔃 رفرش صفحه: خاموش",
          () => { lsSet(LS_RFON, getRefreshOn() ? "0" : "1"); renderButtons(); }, getRefreshOn()),
        mkBtn(`⏱ هر ${getRefreshSec()} ثانیه`, setRefreshPrompt)
      );
    }
    btnBox.append(mkBtn("📋 کپی اطلاعات صفحه", collectInfo));
    if (running && st.mode === "real") {
      btnBox.append(
        mkBtn("🧪 تست بدون کلیک", () => startTest("test-dry")),
        mkBtn("🧪 تست کامل", () => {
          if (confirm("تست کامل واقعاً محصول رو انتخاب می‌کنه و تا درگاه پیش می‌ره (پرداخت نمی‌شه). ادامه؟"))
            startTest("test-real");
        })
      );
    }
    btnBox.append(
      running
        ? mkBtn("توقف", () => finish("stopped", "ربات متوقف شد."))
        : mkBtn("ریست", resetBot)
    );
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
      bar.style.background = n++ % 2 ? "#111" : "#b00020";
      if (n > 20) { clearInterval(f); bar.style.background = "#111"; }
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

  // ریست بدون هیچ رفرشی: فقط وضعیت ربات را پاک و دوباره آماده می‌کند
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
  // از هدر Date پاسخ سایت استفاده می‌کند. چون دقتش ثانیه است، چند نمونه می‌گیرد
  // و بازه‌ی ممکن را باریک می‌کند تا دقت حدود ۱۰۰ میلی‌ثانیه برسد.
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
    st.synced ? `ساعت سایت (اختلاف ${(st.offset / 1000).toFixed(2)}ث)` : "⚠️ ساعت سایت گرفته نشد؛ ساعت لپ‌تاپ";

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

  // کارت‌های محصولِ حاوی سایز مورد نظر را پیدا می‌کند و وضعیت هر کدام را برمی‌گرداند:
  // [{ root, btn, avail }]  ← btn فقط وقتی هست که کارت «موجود» شده باشد
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
        if (priceCount(q) > 1) break; // به ظرفِ چند کارت رسیدیم
        p = q;
        root = q;
        const okEl = (el) => isVisible(el) && !inAvoid(el) && textOf(el);
        let cands = [...q.querySelectorAll(BUTTON_LIKE)].filter(okEl);
        if (!cands.length) {
          // اگر دکمه‌ای شبیه دکمه نبود، هر چیزی که نشانگر موس را به «دست» تبدیل می‌کند
          cands = [...q.querySelectorAll("*")].filter((el) => okEl(el) && getComputedStyle(el).cursor === "pointer");
        }
        if (cands.length) {
          let ok = cands.filter((el) => !isDisabled(el) && !isUnavailableText(el));
          ok = ok.filter((el) => !ok.some((o) => o !== el && el.contains(o))); // فقط عمیق‌ترین عنصر
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

  function findCheckoutBtn() {
    const els = [...clickables()].filter((el) => !isDisabled(el) && isVisible(el) && !inAvoid(el));
    const order = [...CONFIG.finalTexts, ...CONFIG.continueTexts];
    for (const t of order) {
      for (const el of els) {
        const x = textOf(el);
        if (!x || CONFIG.avoidTexts.some((a) => x.includes(a))) continue;
        if (x === t || x.startsWith(t)) return el;
      }
    }
    return null;
  }

  function captchaBlocking() {
    const sel =
      'input[name*="captcha" i], input[id*="captcha" i], input[placeholder*="کد امنیتی"], ' +
      'input[placeholder*="کپچا"], input[autocomplete="one-time-code"]';
    return [...document.querySelectorAll(sel)].some((i) => isVisible(i) && !i.value);
  }

  function pickFirstAddress() {
    const radios = [...document.querySelectorAll("input[type=radio]")].filter(isVisible);
    const groups = {};
    radios.forEach((r) => (groups[r.name || "_"] = groups[r.name || "_"] || []).push(r));
    for (const g of Object.values(groups)) {
      if (!g.some((r) => r.checked)) g[0].click();
    }
  }

  function visibleButtonTexts() {
    return [...clickables()].filter((e) => isVisible(e) && !isDisabled(e)).map(textOf)
      .filter((t) => t && t.length < 30).slice(0, 8).join(" | ");
  }

  // ---------------- جمع‌آوری اطلاعات صفحه (برای عیب‌یابی) ----------------
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
        .replace(/\swire:[\w.:-]+="[^"]*"/g, "") // توکن‌ها و اطلاعات داخلی Livewire حذف می‌شود
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

  // کلیک روی دکمه‌ی «بروزرسانی موجودی» خود سایت. اگر معلوم شود این دکمه کل صفحه را دوباره لود می‌کند،
  // دیگر زده نمی‌شود تا هیچ‌وقت چیزی شبیه رفرش صفحه ایجاد نشود.
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
        if (g > r + 15 && g > b + 15) return true; // پس‌زمینه‌ی سبز = انتخاب‌شده
      }
    }
    return false;
  }

  function onAddFound(btn) {
    if (st.mode === "test-dry") {
      btn.style.outline = "4px solid red";
      btn.scrollIntoView({ block: "center" });
      finish("done", `🧪 تست موفق: دکمه پیدا شد (کلیک نشد) ← «${textOf(btn)}»`, true);
      return;
    }
    st.stage = "checkout";
    st.stageStart = Date.now();
    st.attempt = 0; st.lastConfirmAt = 0; st.gwBase = null; st.reachedGateway = false;
    save(); // قبل از کلیک ذخیره می‌کنیم چون ممکنه صفحه عوض بشه
    setLabel(modeTag() + "🛒 افزودن به سبد زده شد، رفتن به صفحه‌ی پرداخت...");
    renderButtons();
    btn.click();
  }

  // دو پیغامی که صفحه‌ی پرداخت ممکن است نشان دهد
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

  // رفرش صفحه (فقط وقتی کاربر دکمه‌ی 🔃 را روشن کرده باشد)
  const refreshDue = () =>
    getRefreshOn() && st.mode === "real" &&
    Date.now() - (st.lastReloadAt || pageLoadedAt) >= getRefreshSec() * 1000;
  function doReload() {
    st.lastReloadAt = Date.now();
    save();
    try { sessionStorage.removeItem(LS_RFCLICK); } catch (e) {} // رفرش از طرف خود کاربر فعال شده؛ اشتباهاً به حساب دکمه‌ی سایت نگذار
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

    // صفحه‌ی انتقال به بانک (ورود به درگاه)
    if (onGate) {
      if (!st.reachedGateway) { st.reachedGateway = true; save(); alertUser(); }
      setLabel("💳 در حال انتقال به درگاه بانک... پرداخت با خودته.");
      return;
    }

    const err = onPay ? detectPayError() : { limit: false, soldout: false };

    // پیغام «موجودی محصول به اتمام رسیده» = پایان تلاش
    if (err.soldout) {
      finish("stopped", "⛔ پیغام «موجودی محصول به اتمام رسیده» دریافت شد؛ ربات متوقف شد.", true);
      return;
    }

    // هنوز به صفحه‌ی پرداخت نرسیده‌ایم (یا از آن رد شده‌ایم)
    if (!onPay) {
      if (st.reachedGateway) { setLabel("✔️ از صفحه‌ی پرداخت رد شدی؛ ادامه با خودته."); return; }
      const waited = Date.now() - st.stageStart;
      if (/products/i.test(path) && waited > CONFIG.addFailSec * 1000) {
        st.stage = "armed"; // کلیک افزودن جواب نداد؛ دوباره زیر نظر می‌گیریم
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

    // ============ صفحه‌ی پرداخت ============
    if (st.reachedGateway) {
      if (!err.limit) { setLabel("💳 قبلاً به درگاه رفتی؛ اگر پرداخت نشد، دوباره از همین‌جا تلاش کن."); return; }
      st.reachedGateway = false; // خطای تعداد دفعات آمد؛ دوباره تلاش می‌کنیم
      save();
    }

    const now = Date.now();
    const first = !st.lastConfirmAt;
    const since = now - (st.lastConfirmAt || 0);
    const attemptNo = st.attempt || 0;

    // رفرش اختیاری: فقط بعد از رسیدن پاسخ (یا بی‌پاسخ ماندن) و با یک وقفه‌ی کوتاه تا درخواست قبلی تمام شود
    if (!first && refreshDue() && (err.limit || since >= CONFIG.payWaitMs)) {
      if (since >= 1500) { doReload(); return; }
      setLabel(modeTag() + "🔃 آماده‌ی رفرش...");
      return;
    }

    // چه موقع باید (دوباره) تلاش کنیم؟
    let shouldAttempt = first;
    if (!first) {
      if (err.limit && since >= getPayMs()) shouldAttempt = true; // خطای تعداد دفعات: تند تند تلاش کن
      else if (since >= CONFIG.payWaitMs) shouldAttempt = true;   // کلیک بی‌پاسخ ماند
    }
    if (!shouldAttempt) {
      setLabel(`${modeTag()}⏳ تلاش ${attemptNo} انجام شد؛ منتظر پاسخ سایت${err.limit ? " (خطای تعداد دفعات)" : ""}...${rfNote()}`);
      return;
    }

    // درگاهِ این تلاش (با چرخش بین سه درگاه)
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
      gwWarn = true; // نشانه‌ی انتخاب دیده نشد؛ ادامه می‌دهیم
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

  // وضعیت هر کارتِ رینگ‌های انتخابی، مثل «165/65R13: ناموجود»
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

  // عدد «موجودی باقی مانده» که سایت در پایین صفحه نشان می‌دهد
  function readStock() {
    const m = foldKey(document.body.innerText || "").match(/موجودیباقیمانده[:：]?(\d+)/);
    return m ? m[1] : null;
  }

  function looksLoggedOut() {
    return (
      /login|signin|sign-in|auth/i.test(location.pathname) ||
      [...document.querySelectorAll("input[type=password]")].some(isVisible)
    );
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
      setLabel("⚠️ از سایت خارج شدی! وارد حساب شو؛ بعد از ورود ربات ادامه می‌ده.");
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
      if (st.mode === "real") { // مدت امروز تمام شد؛ برای روز بعد آماده بمان
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

    // تست بدون کلیک: چون موجودی ممکنه صفر باشه، فقط تشخیص کارت‌ها را بررسی می‌کنیم
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
      cards.forEach((c) => (c.root.style.outline = "3px solid orange"));
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
    if (refreshDue()) { doReload(); return; } // رفرش اختیاری (فقط اگر کاربر روشنش کرده)
    const pace = now - st.targetMs > CONFIG.fastMinutes * 60000 ? CONFIG.slowRetryMs : CONFIG.retryMs;
    if (Date.now() - lastTry > pace) {
      lastTry = Date.now();
      cardsTxt = cardsNote();
      const sv = readStock();
      if (sv !== null) {
        if (prevStock !== null && Number(sv) > Number(prevStock)) alertUser(); // موجودی کل بالا رفت
        prevStock = sv;
        stockTxt = sv;
      }
      const rf = CONFIG.refreshSelector && document.querySelector(CONFIG.refreshSelector);
      if (rf && !isDisabled(rf)) clickRefresh(rf); // فقط دکمه‌ی خود سایت؛ هیچ رفرش صفحه‌ای در ربات نیست
    }
  }

  // ---------------- شروع ----------------
  renderButtons();
  if (st.stage === "done" || st.stage === "stopped") {
    setLabel(st.stage === "done" ? (st.final ? "💳 رسیدی به درگاه؛ پرداخت با خودته (کار ربات تمام شد)." : "✔️ کار ربات تمام شد.") : "ربات متوقف است.");
    return;
  }
  // اگر درست بعد از کلیکِ ربات روی «بروزرسانی»، صفحه دوباره لود شده باشد، یعنی این دکمه صفحه را رفرش می‌کند
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
