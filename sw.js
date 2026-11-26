self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "Anda menerima pesan baru." };
  }

  const title = typeof payload.title === "string" && payload.title
    ? payload.title
    : "WhatsApp";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "Anda menerima pesan baru.",
    icon: "./assets/icons/whatsapp-inbox.svg",
    badge: "./assets/icons/whatsapp-inbox.svg",
    tag: typeof payload.tag === "string" ? payload.tag : "whatsapp-" + Date.now(),
    renotify: true,
    silent: false,
    vibrate: [120, 60, 120],
    data: { url: typeof payload.url === "string" ? payload.url : "./" },
  };

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    const appIsVisible = windows.some(
      (client) => client.visibilityState === "visible" && client.focused,
    );
    if (!appIsVisible) {
      await self.registration.showNotification(title, options);
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.registration.scope);

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        if (client.url !== target.href && "navigate" in client) {
          await client.navigate(target.href);
        }
        return client.focus();
      }
    }
    return self.clients.openWindow(target.href);
  })());
});
