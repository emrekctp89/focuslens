let activeTabId = null;
let activeDomain = null;
let lastTickTime = null;
let activeTimer = null; 

const TICK_INTERVAL_MS = 1000; // 1 saniyede bir
const DAILY_RESET_HOUR = 0;

console.log("✅ FocusLens background aktif. (v1.7 - Katlamalı Alarm)");

// --- Olay Dinleyicileri (Değişiklik yok) ---
chrome.tabs.onActivated.addListener((activeInfo) => {
  activeTabId = activeInfo.tabId;
  handleTabActivation();
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === activeTabId && changeInfo.status === "complete" && tab.active) {
    handleTabActivation();
  }
});
if (chrome.idle && chrome.idle.onStateChanged) {
  chrome.idle.onStateChanged.addListener((state) => {
    if (state === "active") handleTabActivation();
    else stopActiveTimer();
  });
}
chrome.runtime.onSuspend.addListener(() => stopActiveTimer());
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("dailyReset", { periodInMinutes: 60 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "dailyReset") dailyReset();
});

// --- Ana Mantık (Değişiklik yok) ---
async function handleTabActivation() {
  stopActiveTimer(); 
  try {
    const tab = await chrome.tabs.get(activeTabId);
    if (!tab || !tab.url || !tab.url.startsWith("http")) return;
    if (chrome.idle) {
      const idleState = await chrome.idle.queryState(15);
      if (idleState !== "active") return;
    }
    activeDomain = new URL(tab.url).hostname;
    startActiveTimer();
  } catch (err) {
    console.warn("FocusLens (handleTabActivation) hata:", err.message);
  }
}
function startActiveTimer() {
  if (activeTimer) return; 
  lastTickTime = Date.now();
  activeTimer = setInterval(async () => {
    if (!activeDomain) return;
    const now = Date.now();
    const elapsed = (now - lastTickTime) / 1000;
    lastTickTime = now;
    await saveTick(activeDomain, elapsed);
  }, TICK_INTERVAL_MS);
}
function stopActiveTimer() {
  if (activeTimer) {
    clearInterval(activeTimer);
    activeTimer = null;
  }
  if (activeDomain && lastTickTime) {
    const elapsed = (Date.now() - lastTickTime) / 1000;
    if (elapsed > 0.5) saveTick(activeDomain, elapsed);
  }
  activeDomain = null;
  lastTickTime = null;
}

// --- saveTick (Büyük Değişiklik) ---
// 'notifiedToday' kaldırıldı, 'escalationTargets' eklendi
async function saveTick(domain, elapsed) {
  const { timeData, limits, escalationTargets } = await chrome.storage.local.get([
    "timeData",
    "limits",
    "escalationTargets", // notifiedToday yerine
  ]);

  const newTimeData = timeData || {};
  const newLimits = limits || {};
  const newTargets = escalationTargets || {};

  // 1. Süreyi kaydet
  newTimeData[domain] = (newTimeData[domain] || 0) + elapsed;
  await chrome.storage.local.set({ timeData: newTimeData });

  // *** YENİ EKLEME (Asenkron .catch ile) ***
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, {
      action: "updateTime",
      time: newTimeData[domain] // Sadece o domain'in süresi
    })
    .catch(e => {
      // "Receiving end does not exist" hatasını yoksay.
      // Bu, sekme yüklenirken veya bir chrome:// sayfası
      // aktifken beklenen bir durumdur.
    });
  }
  // *** Ekleme Bitti ***

  // 2. Limit kontrolü
  const matchedLimitKey = Object.keys(newLimits).find((key) =>
    domain.includes(key)
  );

  // Eşleşen bir limit varsa (örn: 'youtube.com')
  if (matchedLimitKey) {
    const baseLimitSeconds = newLimits[matchedLimitKey] * 60;
    
    // Mevcut hedefi al (eğer yoksa, temel limiti kullan)
    const currentTargetSeconds = newTargets[matchedLimitKey] || baseLimitSeconds;

    // O limite ait toplam süreyi hesapla
    let totalTimeForLimit = 0;
    for (const [domainKey, timeValue] of Object.entries(newTimeData)) {
      if (domainKey.includes(matchedLimitKey)) {
        totalTimeForLimit += timeValue;
      }
    }
    
    // 3. Hedefi aştık mı?
    if (totalTimeForLimit >= currentTargetSeconds) {
      // Bildirim gönder
      sendEscalatingNotification(matchedLimitKey, currentTargetSeconds);
      
      // Yeni hedefi (x2) belirle ve kaydet
      newTargets[matchedLimitKey] = currentTargetSeconds * 2;
      await chrome.storage.local.set({ escalationTargets: newTargets });
    }
  }
}

// --- Yeni Bildirim Fonksiyonu ---
function sendEscalatingNotification(limitKey, secondsReached) {
  const minutesReached = Math.round(secondsReached / 60);
  
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "FocusLens Alarmı ⏰",
    message: `${limitKey} için ${minutesReached} dakikalık hedefe ulaştın. (Sıradaki hedef: ${minutesReached * 2} dk)`,
    priority: 2,
  });
}

// --- dailyReset (Güncellendi) ---
function dailyReset() {
  const now = new Date();
  if (now.getHours() === DAILY_RESET_HOUR) {
    chrome.storage.local.set({
      timeData: {},
      escalationTargets: {}, // notifiedToday yerine bunu sıfırla
      lastReset: Date.now(),
    });
    console.log("🕛 FocusLens: Günlük veriler ve katlama hedefleri sıfırlandı.");
  }
}