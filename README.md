# Labosport Pitch Inspector

A phone-friendly web app for collecting World Rugby pitch-inspection data on site. Works offline,
stores everything on your device, optionally **syncs to Google Drive** and **live-syncs with a team via
Firebase**, autofills venues from Labosport brief PDFs, and **generates a Word report that matches the
Field Report Template exactly**, plus a PDF and CSV.

---

## Hosting on GitHub Pages (recommended)

This app is plain static files, so GitHub Pages serves it perfectly over HTTPS, and updating is just a
commit/push. **Put the *contents* of `LabosportApp` at the root of the repo** (so `index.html` is at the
top level, not inside a sub-folder).

### First-time setup
1. Create a new GitHub repo (e.g. `labosport-app`). It can be public or private (Pages works on free
   accounts for public repos; private needs a paid plan).
2. Add the contents of the `LabosportApp` folder to the repo — every file including the hidden
   **`.nojekyll`** file (it tells Pages to serve the `libs/` and `icons/` folders untouched). Commit & push.
3. In the repo: **Settings → Pages** → under *Build and deployment*, set **Source: Deploy from a branch**,
   **Branch: `main` / `/ (root)`** → Save.
4. After a minute Pages gives you a URL like `https://YOURNAME.github.io/labosport-app/`. Open it on your
   phone → browser menu → **Add to Home Screen**.

   > **Icon not the Labosport logo?** It cached an old version. Delete the home-screen shortcut, fully
   > close the tab, reopen the URL (with signal), and Add to Home Screen again.

### Updating later (the easy part)
Edit/replace files and **commit & push** — GitHub Pages redeploys automatically. The app's built-in
cache version bumps each release, so phones pick up the new version on the next reload (close and
reopen if it looks stale).

> **Switching from Netlify?** Two one-time config updates, because your web address changes:
> - **Google Drive:** in Google Cloud Console → your OAuth client → **Authorized JavaScript origins**,
>   add your new `https://YOURNAME.github.io` origin (you can remove the old Netlify one).
> - **Firebase team sync:** in Firebase → Authentication → Settings → **Authorized domains**, add
>   `YOURNAME.github.io`.
>
> The exact path (`/labosport-app/`) doesn't matter for these — Google/Firebase only check the domain
> (`YOURNAME.github.io`).

### Alternatives
- **Netlify drop:** drag the `LabosportApp` folder onto https://app.netlify.com/drop.
- **Local on a computer:** open `index.html` in a browser. (Offline "install" and service-worker
  caching only work over a real `https://` link, not a local file — but data entry still works.)

---

## What it does now

- **Two-part inspection per pitch:** venue audit (questionnaire, Appendices A–H) + on-site testing.
- **Real data entry** for all tests at the right number of positions:
  traction, Clegg, NDVI and soil moisture (12 each); shear (6); turf cover, weed, height,
  infiltration, soil properties (3 each). Priority tests are flagged. Averages and max variance
  update live as you type.
- **Brief autofill:** tap *Upload pitch brief (PDF)* and pick a Labosport brief — it reads the
  venue details, World Rugby notes, and every parameter comment, and fills them in.
- **Multiple pitches per venue**, risk rating per parameter, overall assessment, and photo capture.
- **Benchmark workflow:** pick a benchmark pitch, record why, and compare the others.
- **Saves automatically** on your device, and works with no internet once loaded.
- **Reports (per pitch), from the venue screen → "Report & export":**
  - **Word (.docx)** — your actual `Field_Report_Template.docx`, filled with the collected data.
    Open it in Word and, if you want a pixel-identical PDF, use *Save As → PDF*.
  - **PDF** — opens a print-ready report built from the same data; choose *Save as PDF*.
    (Allow pop-ups the first time.)
  - **CSV** — per venue, plus a full JSON backup under the Data tab.

The Word report fills in automatically: header, overall assessment, risk table, results summary, all
audit appendices, **and the photo grid** — the first six photos you capture become Overview, Close up,
and Photo 3–6, with your notes printed underneath.

The two Charlotte venues (Mecklenburg County Sportsplex and Ramblewood Soccer Complex) are already
loaded from their briefs so you can start immediately.

---

## Google Drive sync (two-way, optional)

When set up, the app keeps a folder **“Labosport Pitch Inspector”** in your Google Drive containing
one file, `labosport_data.json`. It pushes your changes up automatically and pulls the latest when
you open the app — so you can collect on your phone and continue on a laptop. If both changed, the
**most recently edited** copy wins.

It uses the `drive.file` scope, which means **the app can only see its own folder/file — never the
rest of your Drive.**

### One-time setup (~10 minutes)

You need a free Google "OAuth Client ID." Do this **after** the app is deployed (so it has a web
address). The Client ID is **not a secret** — it's safe to paste into the app.

1. **Get your app's address.** Deploy to GitHub Pages (above) and copy the origin — just the domain,
   e.g. `https://YOURNAME.github.io` (no trailing slash, no `/repo` path).
2. Open **https://console.cloud.google.com** and create a project (top bar → New Project → name it
   "Labosport" → Create, then select it).
3. **Enable the Drive API:** APIs & Services → Library → search **Google Drive API** → **Enable**.
4. **OAuth consent screen** (APIs & Services → OAuth consent screen):
   - User type **External** → Create. Fill App name ("Labosport Pitch Inspector"), your email for
     support and developer contact → Save and continue.
   - Skip the Scopes step (Save and continue).
   - On the summary, click **Publish app** → Confirm. *(The `drive.file` scope is non-sensitive, so
     publishing is instant — no Google review. Publishing avoids the 7-day token expiry that
     "Testing" mode has.)*
5. **Create the Client ID:** APIs & Services → Credentials → **Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Under **Authorized JavaScript origins**, click Add URI and paste your app URL from step 1
     (e.g. `https://YOURNAME.github.io`). Add `http://localhost:8000` too if you'll test locally.
   - Leave redirect URIs blank → **Create**.
   - Copy the **Client ID** (ends in `.apps.googleusercontent.com`).
6. In the app: **Data tab → Google Drive sync**, paste the Client ID, tap **Connect Google Drive**,
   and approve the Google prompt. You're synced.

### Using it on a second device
Open the same app URL, go to Data → Google Drive sync, paste the **same Client ID**, tap **Connect**.
It pulls your data down. From then on both devices stay in sync.

### Notes
- A sign-in session lasts about an hour; the app refreshes it silently while you're signed in to
  Google. Occasionally you may need to tap **Connect** or **Sync now** again.
- Turn auto-sync **Off** in Settings if you'd rather only sync with the **Sync now** button.
- Sync needs internet. Offline, everything still saves on the device and syncs next time you're online.

## Team sync (Firebase) — live shared data

Turn this on and every authorised tester shares the **same live venue data** — measurements, audit
answers, risk ratings, notes, and test positions all sync in real time, with offline support. It runs
alongside everything else (local storage, Drive). **Photos are not part of the live team sync** (they're
large) — they stay on each device; share finished photos/reports via **Publish to Drive**.

Per-venue conflicts use last-edit-wins, and each venue records who last changed it.

### One-time setup (owner)

1. In the **Firebase console** (https://console.firebase.google.com) create a project (or use an existing one).
2. **Firestore Database** → *Create database* → Production mode → pick a location.
3. **Build → Authentication** → *Get started* → **Sign-in method** → enable **Google**.
   Also enable **Email/Password** here if any teammate doesn't have / want a Google account — they can
   then sign in with their own email + a password (set on first use). The email allowlist works the same
   either way.
4. **Authentication → Settings → Authorized domains** → *Add domain* → your app's address (your
   GitHub Pages domain, e.g. `YOURNAME.github.io`). Required for sign-in to work.
5. **Project settings (gear) → General → Your apps** → add a **Web app** (`</>`). Copy the
   `firebaseConfig` object it shows.
6. **Firestore → Rules** → paste rules that allow only your team (edit the email list), then *Publish*:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       function allowed() {
         return request.auth != null && request.auth.token.email in [
           'you@example.com',
           'teammate1@example.com',
           'teammate2@example.com'
         ];
       }
       match /venues/{id} {
         allow read, write: if allowed();
       }
     }
   }
   ```

7. In the app: **Data tab → Team sync (Firebase)** → paste the config → **Connect team sync** → sign in
   with Google. You're live.

### Bake the config in (so nobody pastes it)
Open **`firebase-config.js`** in the repo and fill in the values from step 5, then commit & push. After
that the config is built into the app — **no teammate ever pastes anything**. The web config is
public/not-secret, so it's safe to commit; your data is protected by the security rules (email allowlist).

### For each teammate
- Add their Google email to the `allowed()` list in the Firestore rules (step 6) and Publish.
- They open the same app URL and tap **“Join team sync — sign in with Google”** on the home screen
  (once per device). After that it syncs automatically in the background — everyone sees the same venues
  update live.

### Notes
- The Firebase config is **not a secret** (it's public in every web app); the security rules are what
  protect your data, so keep the email allowlist tight.
- Sign-in uses a popup on desktop and may redirect on mobile — both end up signed in.
- Free Firebase (Spark) tier is plenty for a small team.

## Important notes

- **Back up regularly.** Data lives in this browser's storage. Turning on **Google Drive sync** keeps
  an off-device copy automatically; if you don't use sync, use **Data → Export backup (JSON)** before
  clearing your browser, switching phones, or after a big day of testing.
- **Photos** are stored on the device and kept small. Lots of high-res photos can fill browser
  storage; if you see a "storage full" warning, export a backup and/or remove some photos.
  (A larger photo store is on the list for a future update.)
- **Offline brief autofill:** the PDF engine downloads the first time you're online and is then
  cached for offline use. If you've never opened the app online, autofill won't work until you do.

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell |
| `app.js` | All app logic, screens, storage, export |
| `briefParser.js` | Reads Labosport brief PDFs (verified against the Charlotte briefs) |
| `gdrive.js` | Two-way Google Drive sync + per-venue folder publish |
| `firebase.js` | Live team sync (Firebase Auth + Firestore) |
| `styles.css` | Labosport-branded styling |
| `manifest.webmanifest`, `sw.js` | Make it installable + offline |
| `icons/` | App icons and logo |
