"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function PushSetup() {
  const [state, setState] = useState<
    "idle" | "unsupported" | "enabled" | "working"
  >("idle");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && (await reg.pushManager.getSubscription());
      if (sub) setState("enabled");
    })();
  }, []);

  async function enable() {
    setState("working");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState("idle");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID),
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      setState("enabled");
    } catch {
      setState("idle");
    }
  }

  if (state === "unsupported") return null;

  if (state === "enabled") {
    return (
      <button
        onClick={() => fetch("/api/push/test", { method: "POST" })}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <BellRing className="h-4 w-4" />
        Test alert
      </button>
    );
  }

  return (
    <button
      onClick={enable}
      disabled={state === "working"}
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium text-primary transition-colors hover:border-primary/40 disabled:opacity-50"
    >
      <Bell className="h-4 w-4" />
      {state === "working" ? "Enabling…" : "Enable alerts"}
    </button>
  );
}
