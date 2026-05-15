"use client";

// ─── Platform-aware native bridge ───
// Each function lazily imports Capacitor plugins only on native platforms.
// On web, it falls back to web APIs (Web Share, browser download, etc).
// Safe to import from React components.

type NativePlatform = "ios" | "android" | "web";

let _platformCache: NativePlatform | null = null;

export async function getPlatform(): Promise<NativePlatform> {
  if (_platformCache) return _platformCache;
  if (typeof window === "undefined") return "web";
  try {
    const { Capacitor } = await import("@capacitor/core");
    _platformCache = Capacitor.getPlatform() as NativePlatform;
  } catch {
    _platformCache = "web";
  }
  return _platformCache!;
}

export async function isNative(): Promise<boolean> {
  const p = await getPlatform();
  return p === "ios" || p === "android";
}

// ─── Share ───
// Uses the native iOS share sheet on native, Web Share API on web, copy-to-clipboard otherwise.
export async function shareText(payload: { title?: string; text: string; url?: string }): Promise<void> {
  if (await isNative()) {
    const { Share } = await import("@capacitor/share");
    await Share.share(payload);
    return;
  }
  // Web fallback
  if (typeof navigator !== "undefined" && "share" in navigator) {
    try { await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share(payload); return; } catch { /* fall through */ }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(`${payload.title || ""} ${payload.text} ${payload.url || ""}`.trim());
  }
}

// ─── Local Notifications (offline-capable deadline reminders) ───
export interface LocalReminder {
  id: number; // 1..2^31-1
  title: string;
  body: string;
  fireAt: Date;
}

export async function scheduleReminder(r: LocalReminder): Promise<boolean> {
  if (!(await isNative())) return false;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") return false;
  await LocalNotifications.schedule({
    notifications: [{ id: r.id, title: r.title, body: r.body, schedule: { at: r.fireAt } }],
  });
  return true;
}

export async function cancelReminder(id: number): Promise<void> {
  if (!(await isNative())) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  await LocalNotifications.cancel({ notifications: [{ id }] });
}

// ─── Preferences (native KV; replaces localStorage on iOS for trusted persistence) ───
export async function setPref(key: string, value: string): Promise<void> {
  if (await isNative()) {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key, value });
    return;
  }
  if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
}

export async function getPref(key: string): Promise<string | null> {
  if (await isNative()) {
    const { Preferences } = await import("@capacitor/preferences");
    const r = await Preferences.get({ key });
    return r.value;
  }
  if (typeof localStorage !== "undefined") return localStorage.getItem(key);
  return null;
}

// ─── Save file (Capacitor Filesystem on native, browser download on web) ───
export async function saveFileToDevice(filename: string, contents: string, mimeType: string): Promise<void> {
  if (await isNative()) {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    await Filesystem.writeFile({
      path: filename,
      data: contents,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    return;
  }
  // Web fallback: browser download
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── App lifecycle (deep links, foregrounding) ───
export async function onAppForeground(cb: () => void): Promise<() => void> {
  if (!(await isNative())) {
    document.addEventListener("visibilitychange", cb);
    return () => document.removeEventListener("visibilitychange", cb);
  }
  const { App } = await import("@capacitor/app");
  const listener = await App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) cb();
  });
  return () => { listener.remove(); };
}

export async function onDeepLink(cb: (url: string) => void): Promise<() => void> {
  if (!(await isNative())) return () => {};
  const { App } = await import("@capacitor/app");
  const listener = await App.addListener("appUrlOpen", (event) => cb(event.url));
  return () => { listener.remove(); };
}

// ─── Haptic feedback ───
// Subtle physical confirmation for critical interactions (toggles, FAB submit, etc.).
// No-op on web (no Web Haptics support in most browsers).
export type HapticStrength = "light" | "medium" | "heavy" | "selection";

export async function haptic(strength: HapticStrength = "light"): Promise<void> {
  if (!(await isNative())) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    if (strength === "selection") {
      await Haptics.selectionStart();
      await Haptics.selectionEnd();
      return;
    }
    const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
    await Haptics.impact({ style: map[strength] });
  } catch { /* ignore */ }
}

// ─── Camera capture ───
// Returns base64 (dataUrl) of the captured photo. Used by Vault to scan
// passports, receipts, boarding passes directly into the trip.
export interface CameraResult {
  dataUrl?: string;
  format: string;
}

/**
 * Captura una foto con la cámara nativa.
 *
 * Quality knobs (mayo 2026 — pedido del user "blog tipo Polarsteps, fotos en alta"):
 *  - Default ahora es 92 (antes 80). Para journals/blog la pérdida visible de
 *    JPEG quality<90 mata el feel "fotos lindas que querés imprimir".
 *  - `highQuality: true` fuerza 100 (sin recompresión visible). Útil para
 *    journal entries que pueden ir al libro impreso.
 *  - `quality` numérico sigue siendo el override final (1-100).
 *
 * Note: el blob/dataUrl se persiste tal cual en IndexedDB / Supabase Storage.
 * No hacemos resize ni segunda pasada de compresión client-side — mantenemos
 * el original de Camera para no degradar.
 */
export async function capturePhoto(opts?: {
  source?: "camera" | "photos";
  quality?: number;
  highQuality?: boolean;
}): Promise<CameraResult | null> {
  if (!(await isNative())) return null; // web caller should use <input type=file capture>
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const quality = opts?.quality ?? (opts?.highQuality ? 100 : 92);
    const photo = await Camera.getPhoto({
      quality,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: opts?.source === "photos" ? CameraSource.Photos : CameraSource.Prompt,
    });
    return { dataUrl: photo.dataUrl, format: photo.format };
  } catch {
    return null;
  }
}

// ─── Geolocation (opt-in trip tracking) ───
// Polarsteps-style "your route today" — privacy-first: data stays on device,
// only collected when the user explicitly opts in (toggle in /settings).
export interface GeoPoint { lat: number; lng: number; ts: number; accuracy: number; }

const TRACK_KEY = "travel-os-track";
const TRACK_OPT_IN_KEY = "travel-os-track-opt-in";

export async function isTrackingEnabled(): Promise<boolean> {
  return (await getPref(TRACK_OPT_IN_KEY)) === "true";
}

export async function setTrackingEnabled(on: boolean): Promise<void> {
  await setPref(TRACK_OPT_IN_KEY, on ? "true" : "false");
}

export async function captureLocation(): Promise<GeoPoint | null> {
  if (!(await isTrackingEnabled())) return null;
  if (!(await isNative())) {
    if (typeof navigator === "undefined" || !navigator.geolocation) return null;
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, ts: Date.now(), accuracy: p.coords.accuracy }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 5_000, maximumAge: 60_000 },
      );
    });
  }
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    const perm = await Geolocation.requestPermissions();
    if (perm.location !== "granted") return null;
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 5_000, maximumAge: 60_000 });
    return { lat: p.coords.latitude, lng: p.coords.longitude, ts: Date.now(), accuracy: p.coords.accuracy };
  } catch {
    return null;
  }
}

export async function appendTrackPoint(pt: GeoPoint): Promise<void> {
  try {
    const raw = (await getPref(TRACK_KEY)) || "[]";
    const arr = JSON.parse(raw) as GeoPoint[];
    arr.push(pt);
    const trimmed = arr.length > 10_000 ? arr.slice(-10_000) : arr;
    await setPref(TRACK_KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

export async function readTrackPoints(): Promise<GeoPoint[]> {
  try {
    const raw = (await getPref(TRACK_KEY)) || "[]";
    return JSON.parse(raw) as GeoPoint[];
  } catch { return []; }
}

export async function clearTrack(): Promise<void> {
  await setPref(TRACK_KEY, "[]");
}

// ─── Push notifications (APNs / FCM) ───
// Request permission, register with the OS, and return the device token so we
// can persist it server-side and target this device. NO-OP on web (we already
// have the in-app dynamic alert engine; push is the layer above for offline pings).

export interface PushRegistration {
  token: string;
  platform: "ios" | "android";
}

export async function registerForPush(): Promise<PushRegistration | null> {
  if (!(await isNative())) return null;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return null;
    await PushNotifications.register();
    // Wait for the registration event (token).
    return new Promise<PushRegistration | null>((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => { if (!resolved) { resolved = true; resolve(null); } }, 10_000);
      PushNotifications.addListener("registration", (t) => {
        if (resolved) return;
        resolved = true; clearTimeout(timeout);
        resolve({ token: t.value, platform: "ios" });
      });
      PushNotifications.addListener("registrationError", () => {
        if (resolved) return;
        resolved = true; clearTimeout(timeout);
        resolve(null);
      });
    });
  } catch {
    return null;
  }
}

// ─── In-app review prompt ───
// On iOS we can open the App Store review sheet via deep link.
// Strategy: prompt at most once per major positive action, with cooldown.

const REVIEW_PROMPT_KEY = "travel-os-review-prompt-shown";
const REVIEW_COOLDOWN_DAYS = 90;

export async function maybeRequestReview(reason: string): Promise<boolean> {
  if (!(await isNative())) return false;
  const last = await getPref(REVIEW_PROMPT_KEY);
  if (last) {
    const lastDate = new Date(last);
    const diffDays = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < REVIEW_COOLDOWN_DAYS) return false;
  }
  try {
    // Opening via window.open in a Capacitor native context delegates to UIApplication.openURL,
    // which on itms-apps:// surfaces the App Store review sheet directly.
    if (typeof window !== "undefined") {
      window.open("itms-apps://itunes.apple.com/app/id000000000?action=write-review", "_system");
    }
    await setPref(REVIEW_PROMPT_KEY, new Date().toISOString());
    if (typeof console !== "undefined") console.log("[review] prompted:", reason);
    return true;
  } catch {
    return false;
  }
}

// ─── Status bar + splash ───
export async function configureNativeChrome(): Promise<void> {
  if (!(await isNative())) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0a0a0f" });
  } catch { /* ignore */ }
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch { /* ignore */ }
}
