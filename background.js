let activeTabId = null;
let activeDomain = null;
let lastTickTime = null;
let activeTimer = null;

const TICK_INTERVAL_MS = 1000; // 1 saniye
const DAILY_RESET_HOUR = 0;

console.log("✅ FocusLens Background aktif (v2.3 – Çok Modlu Alarm Sistemi).");

// ----------------------
// 🔹 Olay Dinleyicileri
// ----------------------
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

// ----------------------
// 🔹 Sekme Yönetimi
// ----------------------
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

// ----------------------
// 💾 Zaman Kaydı + Alarm Kontrolü
// ----------------------
async function saveTick(domain, elapsed) {
  const { timeData, limits, alarmModes } = await chrome.storage.local.get([
    "timeData",
    "limits",
    "alarmModes",
  ]);

  const newTimeData = timeData || {};
  const newLimits = limits || {};
  const newModes = alarmModes || {};

  // Süreyi ekle
  newTimeData[domain] = (newTimeData[domain] || 0) + elapsed;
  await chrome.storage.local.set({ timeData: newTimeData });

  // Aktif sekmeye süre mesajı gönder
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, {
      action: "updateTime",
      time: newTimeData[domain],
    }).catch(() => {});
  }

  // Mod kontrolü
  const matchedKey = Object.keys(newLimits).find((key) => domain.includes(key));
  if (!matchedKey) return;

  const limitMinutes = newLimits[matchedKey];
  const limitSeconds = limitMinutes * 60;
  const mode = newModes[matchedKey] || "escalating";

  const totalTime = Object.entries(newTimeData)
    .filter(([d]) => d.includes(matchedKey))
    .reduce((acc, [, val]) => acc + val, 0);

  handleAlarmBehavior(mode, matchedKey, totalTime, limitSeconds);
}

// ----------------------
// ⚙️ ALARM BEHAVIOR ENGINE
// ----------------------
async function handleAlarmBehavior(mode, domain, total, limitSeconds) {
  const { escalationTargets } = await chrome.storage.local.get("escalationTargets");
  const newTargets = escalationTargets || {};

  switch (mode) {
    case "escalating": {
      const target = newTargets[domain] || limitSeconds;
      if (total >= target) {
        sendNotification("Katlamalı Alarm", `${domain} için hedefe ulaşıldı (${target / 60} dk).`);
        newTargets[domain] = target * 2;
        await chrome.storage.local.set({ escalationTargets: newTargets });
      }
      break;
    }

    case "fixed": {
      if (Math.floor(total) === limitSeconds) {
        sendNotification("Kişisel Limit", `${domain} için ${limitSeconds / 60} dk limitine ulaştın.`);
      }
      break;
    }

    case "daily": {
      const { timeData } = await chrome.storage.local.get("timeData");
      const totalDaily = Object.values(timeData || {}).reduce((a, b) => a + b, 0);
      if (totalDaily >= limitSeconds) {
        sendNotification("Günlük Limit Aşıldı", `Bugün toplam ${Math.round(totalDaily / 60)} dk aktif oldun.`);
      }
      break;
    }

    case "strict": {
      if (total >= limitSeconds) {
        sendNotification("Odak Bloğu Başladı", `${domain} engelleniyor (30 dk).`);
        blockDomainTemporarily(domain, 30);
      }
      break;
    }

    case "smart": {
      const { history } = await chrome.storage.local.get("history");
      if (history && Object.keys(history).length > 8) {
        const keys = Object.keys(history).sort().slice(-8);
        const avgPrev = keys.slice(0, 4)
          .reduce((acc, d) => acc + Object.values(history[d] || {}).reduce((a, b) => a + b, 0), 0) / 4;
        const avgNow = keys.slice(4)
          .reduce((acc, d) => acc + Object.values(history[d] || {}).reduce((a, b) => a + b, 0), 0) / 4;
        const diff = ((avgNow - avgPrev) / avgPrev) * 100;
        if (diff > 30)
          sendNotification("Akıllı Trend Uyarısı", `${domain} süren %${diff.toFixed(1)} arttı!`);
      }
      break;
    }

    case "silent": {
      // Sessiz mod → bildirim yok, sadece Dashboard’da gösterilir
      console.log(`🔕 Sessiz mod aktif: ${domain} (${Math.round(total / 60)} dk)`);
      break;
    }

    default:
      break;
  }
}

// ----------------------
// ⛔ Odak Bloğu (Geçici Engelleme)
// ----------------------
function blockDomainTemporarily(domain, minutes) {
  const endTime = Date.now() + minutes * 60000;
  chrome.storage.local.set({ [`block_${domain}`]: endTime });

  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (Date.now() < endTime) {
        return { redirectUrl: chrome.runtime.getURL("blocked.html") };
      }
    },
    { urls: [`*://*.${domain}/*`], types: ["main_frame"] },
    ["blocking"]
  );

  setTimeout(() => {
    chrome.webRequest.onBeforeRequest.removeListener(() => {});
    console.log(`✅ ${domain} için engel kaldırıldı.`);
  }, minutes * 60000);
}

// ----------------------
// 🔔 Bildirim Sistemi
// ----------------------
function sendNotification(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: `FocusLens - ${title}`,
    message,
    priority: 2,
  });
}

// ----------------------
// 🔁 Günlük Sıfırlama
// ----------------------
function dailyReset() {
  const now = new Date();
  if (now.getHours() === DAILY_RESET_HOUR) {
    chrome.storage.local.set({
      timeData: {},
      escalationTargets: {},
      lastReset: Date.now(),
    });
    console.log("🕛 Günlük veriler sıfırlandı.");
  }
}

//------------------------------------------------------------
// 🧠 AKTİVİTE GÜNLÜĞÜ (Focus Activity Log)
//------------------------------------------------------------

async function logActivity(eventType, message) {
  const { activityLog } = await chrome.storage.local.get("activityLog");
  const logs = activityLog || [];

  const newEntry = {
    timestamp: new Date().toLocaleString(),
    eventType,   // örn: "LIMIT_REACHED", "FOCUS_BLOCK", "TREND_ALERT"
    message,
  };

  logs.push(newEntry);

  // Sadece son 50 kaydı sakla (gereksiz şişmeyi önler)
  const trimmed = logs.slice(-50);

  await chrome.storage.local.set({ activityLog: trimmed });
}

async function handleAlarmTrigger(domain, limitInfo, totalSeconds) {
  const { type, minutes } = limitInfo;
  const limitInSeconds = minutes * 60;
  
  switch (type) {
    case "escalating":
      await sendNotification(domain, `⏰ Katlamalı Alarm!`, 
        `${domain} için ${minutes} dakikalık limiti aştın! Yeni hedef: ${minutes * 2} dk.`);
      await logActivity(domain, type, totalSeconds, "Limit aşıldı ve katlandı.");
      await updateEscalation(domain, limitInSeconds);
      break;

    case "fixed":
      await sendNotification(domain, `📏 Kişisel Limit Aşıldı!`, 
        `${domain} için ${minutes} dakikalık sınırı geçtin. Daha dikkatli ol. 🧘`);
      await logActivity(domain, type, totalSeconds, "Sabit limit aşıldı (limit değişmez).");
      break;

    case "daily":
      await sendNotification(domain, `📅 Günlük Limit!`, 
        `${domain} için günlük ${minutes} dk limit doldu. Yarın sıfırlanacak.`);
      await logActivity(domain, type, totalSeconds, "Günlük limit doldu.");
      break;

    case "strict":
      await sendNotification(domain, `🚫 Odak Bloğu!`, 
        `${domain} şu an engellendi. Dikkatini odakta tut!`);
      await blockDomainTemporarily(domain);
      await logActivity(domain, type, totalSeconds, "Odak bloğu tetiklendi.");
      break;

    case "smart":
      await sendNotification(domain, `🤖 Akıllı Trend Alarmı`, 
        `Odak süren trende göre fazla yükseldi (%+12). Kısa mola ver!`);
      await logActivity(domain, type, totalSeconds, "Trend bazlı uyarı gönderildi.");
      break;

    case "silent":
      await logActivity(domain, type, totalSeconds, "Sessiz modda limit aşıldı (bildirim yok).");
      break;
  }
}

async function sendNotification(domain, title, message) {
  return new Promise((resolve) => {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title,
      message,
      priority: 2,
    }, resolve);
  });
}

async function logActivity(domain, type, seconds, note = "") {
  const today = new Date().toISOString().split("T")[0];
  const { logs } = await chrome.storage.local.get("logs");
  const updated = logs || {};

  if (!updated[today]) updated[today] = [];
  updated[today].push({
    time: new Date().toLocaleTimeString(),
    domain,
    type,
    seconds,
    note,
  });

  await chrome.storage.local.set({ logs: updated });
}

async function blockDomainTemporarily(domain) {
  // 10 dakika boyunca bu siteye erişimi engelle
  const until = Date.now() + 10 * 60 * 1000;
  const { blockedSites } = await chrome.storage.local.get("blockedSites");
  const updated = blockedSites || {};
  updated[domain] = until;
  await chrome.storage.local.set({ blockedSites: updated });
}
