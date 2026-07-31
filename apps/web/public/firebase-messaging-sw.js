/* eslint-disable no-undef */
// Firebase Cloud Messaging service worker — delivers pushes when the tab is closed.
importScripts(
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js",
);

firebase.initializeApp({
  apiKey: "AIzaSyB69EaN5m3CWK1VtF-3zMey-lVDuSfJ6GY",
  authDomain: "rembeh-web.firebaseapp.com",
  projectId: "rembeh-web",
  storageBucket: "rembeh-web.firebasestorage.app",
  messagingSenderId: "110942121490",
  appId: "1:110942121490:web:80fddd27aafd357a62b2cb",
});

const messaging = firebase.messaging();

function absoluteHref(href) {
  if (!href) return self.location.origin + "/owner";
  if (/^https?:\/\//i.test(href)) return href;
  return self.location.origin + (href.startsWith("/") ? href : "/" + href);
}

messaging.onBackgroundMessage((payload) => {
  const title =
    payload.notification?.title || payload.data?.title || "REMBEH";
  const body =
    payload.notification?.body || payload.data?.body || "New notification";
  const href = absoluteHref(payload.data?.href || "/owner");

  // Always show — some browsers skip auto-display depending on payload shape.
  return self.registration.showNotification(title, {
    body,
    icon: self.location.origin + "/rembeh-icon.png",
    badge: self.location.origin + "/rembeh-icon.png",
    data: { href },
    requireInteraction: true,
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = absoluteHref(event.notification?.data?.href || "/owner");
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(href);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(href);
        }
        return undefined;
      }),
  );
});
