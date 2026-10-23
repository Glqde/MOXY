// src/lib/desktopNotify.ts
// System notifications for other members' actions while the MOXY tab is in
// the background. Respects the "Push notifications" setting.

import { useUIStore } from "@/store";

export function desktopNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Asks the browser for permission; resolves true if granted. */
export async function requestDesktopPermission(): Promise<boolean> {
  if (!desktopNotificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

export function notifyDesktop(title: string, body: string, tag?: string): void {
  if (!useUIStore.getState().desktopNotifications) return;
  if (!desktopNotificationsSupported() || Notification.permission !== "granted") return;
  // While the tab is visible the in-app popup already covers it
  if (document.visibilityState === "visible") return;

  const n = new Notification(title, { body, tag });
  n.onclick = () => {
    window.focus();
    n.close();
  };
}
