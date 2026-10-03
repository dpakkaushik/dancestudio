/* DanceOS service worker (3 Oct 2026) — phone push notifications, and nothing
   else: no caching, no offline pages, so it can never serve a stale app.

   A push arrives encrypted to this browser's own key; the browser decrypts it
   before this runs, so `event.data` is the JSON the dispatch route sent:
   { title, body, href, tag }. Tapping it opens (or focuses) that page. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg = { title: "DanceOS", body: "", href: "/notifications", tag: undefined };
  try {
    if (event.data) msg = { ...msg, ...event.data.json() };
  } catch {
    if (event.data) msg.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(msg.title || "DanceOS", {
      body: msg.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: msg.tag,
      data: { href: msg.href || "/notifications" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/notifications";
  const target = new URL(href, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          return w.navigate(target).then(() => w.focus());
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
