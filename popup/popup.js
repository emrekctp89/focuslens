document.addEventListener("DOMContentLoaded", () => {
  renderSummary();
  renderTrendSummary();

  // 🔹 Depo değiştiğinde özeti "canlı" olarak güncelle
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.timeData || changes.limits || changes.alarmModes)) {
      renderSummary();
    }
  });

  // 🔹 Limit kaydetme butonu
document.getElementById("saveLimit").addEventListener("click", () => {
  const site = document.getElementById("siteName").value.trim();
  const limit = parseInt(document.getElementById("limitMinutes").value);
  const alarmType = document.getElementById("alarmType").value;

  if (!site || !limit) return alert("Alanları doldur!");

  chrome.storage.local.get(["limits"], (res) => {
    const limits = res.limits || {};
    limits[site] = { minutes: limit, type: alarmType };
    chrome.storage.local.set({ limits }, () => {
      alert(`${site} için ${limit} dk (${alarmType}) alarm eklendi!`);
    });
  });
});


  // 🔹 Dashboard açma butonu
  document.getElementById("openDashboard").addEventListener("click", () => {
    chrome.tabs.create({ url: "../dashboard/dashboard.html" });
  });

  // 🔹 Sayaç ayarını yönet (toggleTimer)
  const timerToggle = document.getElementById("toggleTimer");
  if (timerToggle) {
    timerToggle.addEventListener("change", () => {
      chrome.storage.local.set({ showTimer: timerToggle.checked });
    });

    chrome.storage.local.get("showTimer", (res) => {
      timerToggle.checked = !!res.showTimer;
    });
  }
});

// 🧠 Haftalık Trend Özeti (Popup içinde mini özet)
function renderTrendSummary() {
  const trendBox = document.createElement("p");
  trendBox.id = "trendSummary";
  trendBox.style.marginTop = "12px";
  trendBox.style.fontSize = "14px";
  trendBox.style.color = "#94a3b8";
  document.querySelector(".settings-section").appendChild(trendBox);

  chrome.storage.local.get("history", (res) => {
    const history = res.history || {};
    const keys = Object.keys(history);
    if (keys.length < 8) {
      trendBox.textContent = "(Haftalık trend verisi yetersiz.)";
      return;
    }

    const last14 = keys.sort().slice(-14);
    const week1 = last14.slice(0, 7);
    const week2 = last14.slice(-7);

    const sum = (dates) =>
      dates.reduce((acc, d) => acc + Object.values(history[d] || {}).reduce((a, b) => a + b, 0), 0);
    const avg1 = sum(week1) / 7 / 60;
    const avg2 = sum(week2) / 7 / 60;

    const diff = ((avg2 - avg1) / avg1) * 100;
    const summary =
      diff > 5
        ? `📈 +${diff.toFixed(1)}% odak artışı`
        : diff < -5
        ? `📉 ${diff.toFixed(1)}% azalma`
        : "⚖️ Dengeli";

    trendBox.textContent = `Bu haftaki trend: ${summary}`;
  });
}

// 🕐 Saniyeyi "X sa Y dk Z sn" formatına çeviren fonksiyon
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

// 📋 Özet verisini çeken fonksiyon
function renderSummary() {
  chrome.storage.local.get(["timeData", "limits", "alarmModes"], (res) => {
    const timeData = res.timeData || {};
    const limits = res.limits || {};
    const modes = res.alarmModes || {};

    let total = Object.values(timeData).reduce((a, b) => a + b, 0);

    let summary = Object.entries(timeData)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, time]) => {
        const formattedTime = formatTime(time);
        const matchedLimitKey = Object.keys(limits).find((key) => domain.includes(key));
        const lim = matchedLimitKey ? `${limits[matchedLimitKey]} dk` : "limit yok";
        const mode = modes[matchedLimitKey] ? modeLabel(modes[matchedLimitKey]) : "Katlamalı";

        return `<b>${domain}</b> ~ ${formattedTime} / ${lim} (${mode})`;
      })
      .join("<br>");

    document.getElementById("summary").innerHTML =
      `<b>Toplam:</b> ${formatTime(total)}<br><br>` +
      (summary || "Henüz veri yok. Birkaç site gez, sonra geri dön!");
  });
}

// 🏷️ Alarm mod isimleri
function modeLabel(mode) {
  switch (mode) {
    case "escalating": return "Katlamalı";
    case "fixed": return "Kişisel Limit";
    case "daily": return "Günlük Limit";
    case "strict": return "Odak Bloğu";
    case "smart": return "Akıllı Trend";
    case "silent": return "Sessiz Mod";
    default: return "Katlamalı";
  }
}
