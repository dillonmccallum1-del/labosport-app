# Photo sync setup (Firebase Storage)

Test values and survey answers sync through Firestore automatically. **Photos and brief
images** now sync too, but the image bytes are stored in **Firebase Storage**, which needs a
one-time setup in your Firebase project. Until these three steps are done, photos simply stay
on the device that took them (exactly like before) — no data is lost, the picture just won't
appear on the other device.

## 1. Enable Storage
Firebase console → **Build → Storage → Get started**. Accept the default bucket
(`labosport-app.firebasestorage.app`). The free (Spark) tier is plenty for field photos.

## 2. Storage security rules
Storage → **Rules** → paste this and **Publish**. Keep the email list identical to your
Firestore allowlist (add a line per teammate):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function allowed() {
      return request.auth != null && request.auth.token.email in [
        'dmccall7@vols.utk.edu'
      ];
    }
    match /media/{id} { allow read, write: if allowed(); }
    match /brief/{id} { allow read, write: if allowed(); }
  }
}
```

## 3. Allow the app's web address to download images (CORS)
The app fetches image bytes from Storage, so the bucket must allow your app's origin. Open
**Cloud Shell** in the Google Cloud console (or any machine with `gsutil`) and run:

```
cat > cors.json <<'EOF'
[
  {
    "origin": ["https://dillonmccallum1-del.github.io", "http://localhost", "http://localhost:8000"],
    "method": ["GET"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
EOF
gsutil cors set cors.json gs://labosport-app.firebasestorage.app
```

Replace the first origin with the exact address you open the app from (your GitHub Pages URL).
If you skip this step, photos upload fine but won't download on other devices — you'll see the
photo slot but no image.

## How it works
- Each photo has a stable id. The id + size sync via Firestore; the JPEG bytes go to
  `media/<id>` in Storage. Brief images go to `brief/<venueId>.json`.
- When another device receives a venue, it pulls any image bytes it doesn't already have.
- Everything degrades gracefully: if Storage is unreachable, the app keeps working and photos
  stay local.
