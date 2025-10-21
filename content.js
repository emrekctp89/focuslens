let focusLensTimerDiv = null;
let isTimerEnabled = false;

// Saniyeyi "X sa Y dk Z sn" formatına çeviren fonksiyon (kısaltılmış)
function formatTime(totalSeconds) {
  totalSeconds = Math.floor(totalSeconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  let parts = [];
  if (h > 0) parts.push(h + 's');
  if (m > 0) parts.push(m + 'd');
  parts.push(s + 's'); 
  return parts.join(' ');
}

// Sayacı sayfaya ekleyen/gösteren fonksiyon
function showTimer() {
  if (!focusLensTimerDiv) {
    focusLensTimerDiv = document.createElement('div');
    focusLensTimerDiv.id = 'focuslens-timer';
    document.body.appendChild(focusLensTimerDiv);
  }
  focusLensTimerDiv.style.display = 'block';
}

// Sayacı gizleyen fonksiyon
function hideTimer() {
  if (focusLensTimerDiv) {
    focusLensTimerDiv.style.display = 'none';
  }
}

// 1. Arka plandan (background.js) gelen zaman güncelleme mesajlarını dinle
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateTime" && isTimerEnabled) {
    showTimer(); // Göster
    focusLensTimerDiv.textContent = `FocusLens: ${formatTime(request.time)}`;
  }
});

// 2. Depodaki (storage) ayar değişikliklerini dinle
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.showPageTimer) {
    isTimerEnabled = changes.showPageTimer.newValue;
    if (isTimerEnabled) {
      // Eğer sayaç zaten varsa ve veri bekliyorsa tekrar göstermeye zorlama
      // Sadece 'updateTime' mesajı geldiğinde gösterilsin.
    } else {
      hideTimer(); // Kapatıldıysa gizle
    }
  }
});

// 3. Sayfa ilk yüklendiğinde ayarı bir kez kontrol et
chrome.storage.local.get(["showPageTimer"], (res) => {
  isTimerEnabled = res.showPageTimer !== false;
});