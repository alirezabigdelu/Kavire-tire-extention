const t = document.getElementById("t");
const msg = document.getElementById("msg");
chrome.storage.local.get(["startTime"], (o) => { if (o.startTime) t.value = o.startTime; });
document.getElementById("s").addEventListener("click", () => {
  if (!t.value) { msg.style.color = "#dc2626"; msg.textContent = "ساعت معتبر وارد کنید."; return; }
  const v = t.value.length === 5 ? t.value + ":00" : t.value;
  chrome.storage.local.set({ startTime: v }, () => {
    msg.style.color = "#059669";
    msg.textContent = "ذخیره شد: " + v;
  });
});
