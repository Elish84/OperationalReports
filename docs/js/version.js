export const LOCAL_VERSION = "v7.0.1";

const VERSION_URL = "https://raw.githubusercontent.com/Elish84/OperationalReports/operational-report-v7/docs/version.json";

export function loadVersionLabel() {
  const el = document.getElementById("appVersion");
  if (el) el.textContent = LOCAL_VERSION;
}

export async function checkForUpdates() {
  try {
    const resp = await fetch(`${VERSION_URL}?t=${Date.now()}`); // bust cache
    if (!resp.ok) return;
    const { version: remoteVersion } = await resp.json();

    if (remoteVersion !== LOCAL_VERSION) {
      showUpdateBanner(remoteVersion);
    } else {
      loadVersionLabel();
    }
  } catch (e) {
    console.warn("[update] תקלה בבדיקה:", e);
    loadVersionLabel();
  }
}

function showUpdateBanner(newVer) {
  const banner = document.createElement("div");
  banner.className = "update-modal";
  banner.innerHTML = `
    <strong>גרסה חדשה זמינה: ${newVer}</strong>
    <div style="margin-top: 10px; display: flex; gap: 10px;">
      <button id="updateRefresh">רענן עכשיו</button>
      <button id="updateDismiss">לא עכשיו</button>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById("updateRefresh").onclick = () => {
    // רענון מלא (ה‑Service Worker יקבל קבצים חדשים)
    window.location.reload(true);
  };
  document.getElementById("updateDismiss").onclick = () => banner.remove();
}
