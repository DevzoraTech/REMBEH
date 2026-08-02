const DEVICE_ID_KEY = "rembeh.device.installation_id";

function readStoredDeviceId() {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const created =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return `web-${Date.now()}`;
  }
}

function guessDeviceName() {
  if (typeof navigator === "undefined") return "Web browser";
  const ua = navigator.userAgent;
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android device";
  return "Web browser";
}

export function resolveWebDeviceIdentity() {
  return {
    deviceId: readStoredDeviceId(),
    deviceName: guessDeviceName(),
    deviceType: "Web App",
    platform: "WEB",
  };
}
