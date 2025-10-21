document.addEventListener("DOMContentLoaded", () => {
  renderSummary();

  // Depo değiştiğinde özeti "canlı" olarak güncelle
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.timeData || changes.limits)) {
      renderSummary();
    }
  });

  // Limit kaydetme butonu
  document.getElementById("saveLimit").addEventListener("click", () => {
    const site = document.getElementById("siteName").value.trim();
    const limit = parseInt(document.getElementById("limitMinutes").value);
    if (!site || !limit) return alert("Alanları doldur!");
    
    chrome.storage.local.get(["limits"], (res) => {
      const limits = res.limits || {};
      limits[site] = limit;
      chrome.storage.local.set({ limits }, () => {
        alert(`${site} için ${limit} dk limiti kaydedildi!`);
      });
    });
  });

  // Dashboard açma butonu
  document.getElementById("openDashboard").addEventListener("click", () => {
    chrome.tabs.create({ url: "../dashboard/dashboard.html" });
  });

  // --- YENİ EKLEME: Sayaç Ayarını Yönet ---
  const timerToggle = document.getElementById("toggleTimer");

  // 1. Ayarı depodan yükle (varsayılan: true)
  chrome.storage.local.get(["showPageTimer"], (res) => {
    // res.showPageTimer undefined ise (ilk açılış), true varsay
    timerToggle.checked = res.showPageTimer !== false;
  });

  // 2. Ayarı depoya kaydet
  timerToggle.addEventListener("change", () => {
    chrome.storage.local.set({ showPageTimer: timerToggle.checked });
  });
  // --- Bitti ---
});


// Saniyeyi "X sa Y dk Z sn" formatına çeviren fonksiyon (Değişiklik yok)
function formatTime(totalSeconds) {
  totalSeconds = Math.floor(totalSeconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  let parts = [];
  if (h > 0) parts.push(h + ' sa');
  if (m > 0) parts.push(m + ' dk');
  if (s > 0 || parts.length === 0) {
      if (parts.length === 0) return (s + ' sn');
      if (s > 0) parts.push(s + ' sn');
  }
  return parts.join(' ');
}

// Özet verisini çeken fonksiyon (Değişiklik yok)
function renderSummary() {
  chrome.storage.local.get(["timeData", "limits"], (res) => {
    const timeData = res.timeData || {};
    const limits = res.limits || {};
    let total = Object.values(timeData).reduce((a, b) => a + b, 0);

    let summary = Object.entries(timeData)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, time]) => {
        const formattedTime = formatTime(time); 
        const lim = limits[domain] ? ` / ${limits[domain]} dk limit` : "";
        const matchedLimitKey = Object.keys(limits).find(key => domain.includes(key));
        const matchedLim = matchedLimitKey ? ` / ${limits[matchedLimitKey]} dk limit` : "";
        return `${domain} ~ <b>${formattedTime}</b>${matchedLim || lim}`;
      })
      .join("<br>");
    document.getElementById("summary").innerHTML =
      `<b>Toplam:</b> ${formatTime(total)}<br><br>` +
      (summary || "Henüz veri yok. Birkaç site gez, sonra geri dön!");
  });
}