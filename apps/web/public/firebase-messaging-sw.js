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

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || "REMBEH";
  const body =
    payload.notification?.body || payload.data?.body || "New notification";
  const href = payload.data?.href || "/";

  self.registration.showNotification(title, {
    body,
    icon: "/rembeh-icon.png",
    badge: "/rembeh-icon.png",
    data: { href },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification?.data?.href || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
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
