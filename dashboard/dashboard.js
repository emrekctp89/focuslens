let usageChartInstance = null; 

document.addEventListener("DOMContentLoaded", () => {
  renderDashboard();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.timeData) {
      console.log("Dashboard: Veri değişti, grafik güncelleniyor...");
      renderDashboard();
    }
  });

  document.getElementById("resetData").addEventListener("click", () => {
    chrome.storage.local.set({ 
        timeData: {}, 
        escalationTargets: {}, // Sıfırlamaya bunu da ekle
        lastReset: Date.now() 
    }, () =>
      location.reload()
    );
  });
});

// Saniyeyi "X sa Y dk Z sn" formatına çeviren fonksiyon
function formatTime(totalSeconds) {
  totalSeconds = Math.floor(totalSeconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  
  let parts = [];
  if (h > 0) parts.push(h + ' sa');
  if (m > 0) parts.push(m + ' dk');
  if (s > 0 || parts.length === 0) {
      // Eğer sadece saniye varsa veya toplam 0 ise '0 sn' göster
      if (parts.length === 0) return (s + ' sn');
      // Saniye 0 ise ve dk/sa varsa gösterme (daha temiz görünüm için)
      if (s > 0) parts.push(s + ' sn');
  }
  
  return parts.join(' ');
}

// Grafiği çizen ana fonksiyon (GÜNCELLENDİ)
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
      noDataP.textContent = "Henüz veri yok. Birkaç site gez, sonra geri dön!:)";
      if (usageChartInstance) usageChartInstance.destroy();
      return;
    } else if (noDataP) {
      noDataP.remove();
    }

    if (usageChartInstance) {
      usageChartInstance.destroy();
    }

    const ctx = document.getElementById("usageChart").getContext("2d");
    usageChartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: Object.keys(data),
        datasets: [
          {
            label: "Süre (Saniye)", // Label'ı "Saniye" olarak değiştir
            // Veriyi dakika yerine ham saniye olarak gönder
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
          // Üzerine gelince "saat/dk/sn" formatını göster
          tooltip: {
            callbacks: {
              label: function (context) {
                let label = context.dataset.label || '';
                if (label) {
                  label = 'Geçirilen Süre: '; // Tooltip başlığı
                }
                if (context.parsed.y !== null) {
                  label += formatTime(context.parsed.y);
                }
                return label;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            // Y-Eksenindeki etiketleri de "saat/dk/sn" formatına çevir
            ticks: {
              callback: function (value, index, ticks) {
                return formatTime(value);
              },
            },
          },
        },
      },
    });
  });
}