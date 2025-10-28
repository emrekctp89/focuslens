let usageChartInstance = null;

document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ Dashboard başlatıldı");

  // 🎨 Tema Uygulama Fonksiyonu
  function applyTheme(theme) {
    document.body.classList.remove(
      "theme-gradient",
      "theme-minimal",
      "theme-nature",
      "theme-vibrant",
      "theme-serene"
    );
    document.body.classList.add(`theme-${theme}`);
    console.log("🎨 Tema değişti:", theme);
  }

  // 🎨 Tema Yükleme + Dinleme
  const themeSelect = document.getElementById("themeSelect");
  if (themeSelect) {
    chrome.storage.local.get("theme", (res) => {
      const theme = res.theme || "gradient";
      themeSelect.value = theme;
      applyTheme(theme);
    });

    themeSelect.addEventListener("change", (e) => {
      const newTheme = e.target.value;
      chrome.storage.local.set({ theme: newTheme });
      applyTheme(newTheme);
    });
  } else {
    console.warn("⚠️ themeSelect bulunamadı — HTML tarafını kontrol et.");
  }

  // 🔹 Diğer dashboard kodları
  renderDashboard();
  renderInsights();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.timeData) {
      console.log("Dashboard: Veri değişti, grafik güncelleniyor...");
      renderDashboard();
      renderInsights();
    }
  });

  document.getElementById("resetData")?.addEventListener("click", () => {
    chrome.storage.local.set(
      {
        timeData: {},
        escalationTargets: {},
        lastReset: Date.now(),
      },
      () => location.reload()
    );
  });
});


// 🕐 Saniyeyi “X sa Y dk Z sn” formatına çeviren fonksiyon
function formatTime(totalSeconds) {
  totalSeconds = Math.floor(totalSeconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  let parts = [];
  if (h > 0) parts.push(h + " sa");
  if (m > 0) parts.push(m + " dk");
  if (s > 0 || parts.length === 0) {
    if (parts.length === 0) return s + " sn";
    if (s > 0) parts.push(s + " sn");
  }
  return parts.join(" ");
}

// 📊 Grafiği çizen fonksiyon
function renderDashboard() {
  if (typeof Chart === "undefined") {
    console.error("❌ Chart.js yüklenemedi!");
    return;
  }

  chrome.storage.local.get(["timeData", "lastReset"], (res) => {
    const data = res.timeData || {};
    const lastReset = res.lastReset
      ? new Date(res.lastReset).toLocaleString()
      : "Henüz sıfırlanmadı";

    let p = document.getElementById("lastResetText");
    if (!p) {
      p = document.createElement("p");
      p.id = "lastResetText";
      document.body.appendChild(p);
    }
    p.textContent = `Son sıfırlama: ${lastReset}`;

    let noDataP = document.getElementById("noDataText");
    if (Object.keys(data).length === 0) {
      if (!noDataP) {
        noDataP = document.createElement("p");
        noDataP.id = "noDataText";
        document.body.appendChild(noDataP);
      }
      noDataP.textContent = "Henüz veri yok. Birkaç site gez, sonra geri dön! 🙂";
      if (usageChartInstance) usageChartInstance.destroy();
      return;
    } else if (noDataP) noDataP.remove();

    if (usageChartInstance) usageChartInstance.destroy();

    const ctx = document.getElementById("usageChart").getContext("2d");
    usageChartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: Object.keys(data),
        datasets: [
          {
            label: "Süre (Saniye)",
            data: Object.values(data).map((v) => Math.round(v)),
            backgroundColor: "rgba(54, 162, 235, 0.6)",
            borderColor: "rgba(54, 162, 235, 1)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                let label = "Geçirilen Süre: ";
                if (context.parsed.y !== null) label += formatTime(context.parsed.y);
                return label;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (value) => formatTime(value) },
          },
        },
      },
    });
  });
}

// 🧠 Focus Insight Mode (Trend + Yorum + Etiket Güncellemesi)
async function renderInsights() {
  const res = await chrome.storage.local.get(["history", "timeData"]);
  const history = res.history || {};
  const todayData = res.timeData || {};

  const container = document.getElementById("insightContent");
  if (!container) return;

  const allDates = Object.keys(history).sort();
  if (allDates.length === 0) {
    container.innerHTML = "<p>Henüz geçmiş verisi yok. Günlük kullanım oluşturulunca trendler hesaplanacak.</p>";
    return;
  }

  const last14 = allDates.slice(-14);
  const week1 = last14.slice(0, 7);
  const week2 = last14.slice(-7);

  const sumWeek = (dates) =>
    dates.reduce((sum, d) => {
      const total = Object.values(history[d] || {}).reduce((a, b) => a + b, 0);
      return sum + total / 60;
    }, 0);

  const totalWeek1 = week1.length ? sumWeek(week1) : 0;
  const totalWeek2 = sumWeek(week2) + Object.values(todayData).reduce((a, b) => a + b, 0) / 60;

  const avgWeek1 = totalWeek1 / (week1.length || 1);
  const avgWeek2 = totalWeek2 / (week2.length || 1);

  const diff = avgWeek1 ? ((avgWeek2 - avgWeek1) / avgWeek1) * 100 : 0;
  const diffAbs = Math.abs(diff).toFixed(1);

  const allSites = {};
  [...week1, ...week2].forEach((d) => {
    Object.entries(history[d] || {}).forEach(([site, sec]) => {
      allSites[site] = (allSites[site] || 0) + sec;
    });
  });
  Object.entries(todayData).forEach(([site, sec]) => {
    allSites[site] = (allSites[site] || 0) + sec;
  });
  const [topSite, topTime] =
    Object.entries(allSites).sort((a, b) => b[1] - a[1])[0] || ["-", 0];

  let trendText = "";
  if (diff > 10)
    trendText = `🔼 Odak süren geçen haftaya göre <b>%${diffAbs}</b> arttı. Müthiş ilerleme! 🚀`;
  else if (diff < -10)
    trendText = `🔽 Odak süren geçen haftaya göre <b>%${diffAbs}</b> azaldı. Dikkat dağıtıcıları gözden geçir. 🧘`;
  else
    trendText = `⚖️ Odak süren geçen haftaya göre dengeli (%${diffAbs} fark).`;

  const focusScore =
    avgWeek2 > 180
      ? "Odak seviyen yüksek, bu ritmi koru 🔥"
      : avgWeek2 > 60
      ? "Fena değil, biraz daha istikrarlı olabilirsin ⚖️"
      : "Odak süren düşük, zaman yönetimini gözden geçir 🧩";

  container.innerHTML = `
    <ul>
      <li>📅 Son 7 günlük ortalama: <b>${avgWeek2.toFixed(1)} dk</b></li>
      <li>📆 Önceki hafta ortalaması: <b>${avgWeek1.toFixed(1)} dk</b></li>
      <li>${trendText}</li>
      <li>🥇 En çok zaman harcadığın site: <b>${topSite}</b> (${Math.round(topTime / 60)} dk)</li>
    </ul>
    <p class="focus-comment">${focusScore}</p>
  `;

  //------------------------------------------------------------
// 📜 AKTİVİTE GÜNLÜĞÜ GÖRÜNTÜLEME
//------------------------------------------------------------
chrome.storage.local.get("activityLog", (res) => {
  const logs = res.activityLog || [];
  if (logs.length === 0) return;

  const logHTML = logs
    .slice()
    .reverse()
    .map(
      (entry) =>
        `<li><b>${entry.timestamp}</b> — ${entry.message}</li>`
    )
    .join("");

  const logSection = document.createElement("div");
  logSection.className = "insight-section";
  logSection.innerHTML = `
    <h3>🧭 Alarm Aktivite Günlüğü</h3>
    <ul>${logHTML}</ul>
  `;

  document.getElementById("insightContainer").appendChild(logSection);
});


  // 🎨 Dinamik trend etiketi güncellemesi
  const trendTag = document.getElementById("trendTag");
  if (trendTag) {
    let emoji = "⚖️";
    let color = "#facc15"; // Sarı (denge)
    if (diff > 5) { emoji = "📈"; color = "#16a34a"; } // Yeşil
    if (diff < -5) { emoji = "📉"; color = "#dc2626"; } // Kırmızı
    trendTag.textContent = `${emoji} Haftalık Trend: ${diffAbs}%`;
    trendTag.style.color = color;
  }
}

//------------------------------------------------------------
// 🧾 GEÇMİŞ AKTİVİTELER GÖRÜNTÜLEME
//------------------------------------------------------------
async function renderLogs() {
  const container = document.getElementById("logContainer");
  if (!container) return;

  const { logs } = await chrome.storage.local.get("logs");
  if (!logs || Object.keys(logs).length === 0) {
    container.innerHTML = "<p>Henüz kayıtlı aktivite yok.</p>";
    return;
  }

  let html = "";
  const sortedDays = Object.keys(logs).sort((a, b) => b.localeCompare(a)); // yeni günler üstte

  for (const day of sortedDays) {
    html += `<h3 style="margin-top:15px;">📅 ${day}</h3>`;
    html += `
      <table class="log-table">
        <tr>
          <th>Saat</th>
          <th>Site</th>
          <th>Tür</th>
          <th>Süre</th>
          <th>Not</th>
        </tr>
    `;

    for (const item of logs[day]) {
      html += `
        <tr>
          <td>${item.time}</td>
          <td>${item.domain}</td>
          <td class="log-type ${item.type}">${item.type}</td>
          <td>${formatTime(item.seconds)}</td>
          <td>${item.note || "-"}</td>
        </tr>
      `;
    }
    html += `</table>`;
  }

  container.innerHTML = html;
}

document.addEventListener("DOMContentLoaded", renderLogs);

//------------------------------------------------------------
// 📘 Alarm Türleri Bilgilendirme Accordion
//------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const header = document.getElementById("infoHeader");
  const content = document.getElementById("infoContent");
  const icon = document.getElementById("accordionIcon");

  if (header && content && icon) {
    header.addEventListener("click", () => {
      const isOpen = content.classList.toggle("open");
      icon.textContent = isOpen ? "▲" : "▼";
    });
  }
});

//------------------------------------------------------------
// 🔗 Wiki Modal Kontrolleri
//------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const wikiLink = document.querySelector(".wiki-link a");
  const modal = document.getElementById("wikiModal");
  const closeBtn = document.getElementById("closeWiki");
  const goBtn = document.getElementById("goWiki");

  if (!wikiLink || !modal) return;

  wikiLink.addEventListener("click", (e) => {
    e.preventDefault();
    modal.classList.add("active");
  });

  closeBtn.addEventListener("click", () => {
    modal.classList.remove("active");
  });

  goBtn.addEventListener("click", () => {
    modal.classList.remove("active");
    chrome.tabs.create({
      url: "https://github.com/emrekctp89/ai-kesif-platformu/wiki/FocusLens",
    });
  });

  // ESC tuşuyla kapatma
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") modal.classList.remove("active");
  });
});


// Not: Yukarıdaki kod, dashboard/dashboard.js dosyasına aittir.