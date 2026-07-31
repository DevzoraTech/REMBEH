# Firebase / FCM push notifications

REMBEH uses **two** Firebase projects:

| Project ID | Apps | Used for |
|---|---|---|
| `rembeh-web` | Web (`REMBEH Web`) | Browser push (incl. when tab/app closed) |
| `rembeh-mobile` | Android + iOS | Flutter closed-app / background push |

FlutterFire options live in `apps/mobile/lib/firebase_options.dart`  
(Android `google-services.json`, iOS `GoogleService-Info.plist`).

## One-time console setup

### 1) Web Push certificates (VAPID)

1. Open [Firebase Console → rembeh-web → Project settings → Cloud Messaging](https://console.firebase.google.com/project/rembeh-web/settings/cloudmessaging)
2. Under **Web Push certificates**, generate a key pair
3. Copy the **Key pair** into env:

```bash
# apps/web + server (optional echo)
NEXT_PUBLIC_FIREBASE_VAPID_KEY=<vapid-key-pair>
FIREBASE_WEB_VAPID_KEY=<vapid-key-pair>
```

### 2) Service accounts (server send)

Create a service account JSON for **each** project (or reuse one if you later consolidate):

1. [rembeh-web service accounts](https://console.firebase.google.com/project/rembeh-web/settings/serviceaccounts/adminsdk) → Generate new private key  
2. [rembeh-mobile service accounts](https://console.firebase.google.com/project/rembeh-mobile/settings/serviceaccounts/adminsdk) → Generate new private key  

Either put the **entire JSON as a single-line string**, or (preferred locally) point at the downloaded files:

```bash
FIREBASE_WEB_SERVICE_ACCOUNT_PATH=../../apps/web/rembeh-web-firebase-adminsdk-fbsvc-XXXX.json
FIREBASE_MOBILE_SERVICE_ACCOUNT_PATH=../../apps/mobile/rembeh-mobile-firebase-adminsdk-fbsvc-XXXX.json
# or:
FIREBASE_WEB_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
FIREBASE_MOBILE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

These `*firebase-adminsdk*.json` files are gitignored — do not commit them.

### 3) iOS APNs (required for real iPhone push)

1. Apple Developer → Keys → Apple Push Notifications service (APNs)
2. Upload the `.p8` key in Firebase → rembeh-mobile → Project settings → Cloud Messaging → Apple app configuration
3. Enable **Push Notifications** capability on the iOS Runner target in Xcode

## Client behaviour

- **Web**: after login, asks for notification permission, registers SW `/firebase-messaging-sw.js`, POSTs token to `/notifications/push/tokens` with `projectKey=WEB`
- **Mobile**: after login / session restore, requests permission, POSTs FCM token with `projectKey=MOBILE`
- **API**: `POST /notifications/push/test` sends a test notification to the current user

## Re-run FlutterFire

```bash
cd apps/mobile
flutterfire configure \
  --project=rembeh-mobile \
  --platforms=android,ios \
  --android-package-name=com.antikra.rembeh.rembeh_mobile \
  --ios-bundle-id=com.antikra.rembeh.rembehMobile \
  --yes --overwrite-firebase-options
```
