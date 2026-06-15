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
  Each audit section shows a green **✓** only once **every** question in it is answered — a partial
  section stays unmarked (or keeps its "brief" tag if it was autofilled).
- **Real data entry** for all tests at the right number of positions:
  Clegg, surface traction, NDVI and **both soil-moisture depths** (25 each, on an even 5×5 grid);
  root-zone shear strength (12); turf cover, weed, height, infiltration, soil properties (3 each).
  Priority tests are flagged. Averages and max variance update live as you type.
- **Two soil-moisture depths:** moisture is collected twice — **38 mm (1.5 in)** and **76 mm (3 in)** —
  each as its own test with its own pitch map, average, variance, and report row.
- **Rugby pitch diagram for test maps:** position maps are drawn on a proper rugby field (try lines,
  22 m and 10 m lines, halfway line, 5 m/15 m dashed lines, shaded in-goal zones, goal posts). Dots are
  draggable, with Randomize/Reset.
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

It also adds **Appendix K — Soil profile / thatch photos** at the end, with the soil photos grouped by
observation position and each labeled with its thatch reading (e.g. "Position P1 · 10 mm thatch"). The
appendix only appears when soil photos exist — pitches without them get no blank page, and in a combined
multi-pitch report each pitch gets its own Appendix K only if it has soil photos.

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
alongside everything else (local storage, Drive). **Photos sync too** — the photo bytes go through
Firebase Storage, which needs a one-time setup (see **`STORAGE_SETUP.md`**); until that's done photos
stay on the device that took them and nothing is lost.

Venues merge **field-by-field**: a measurement, audit answer, or photo entered on either device is
kept, and the two copies are folded together so edits on one device never wipe edits on the other.
Only a true conflict — the exact same field changed on both devices — falls back to last-edit-wins,
and each venue records who last changed it.

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
| `js/app.js` | All app logic, screens, storage, export |
| `js/briefParser.js` | Reads Labosport brief PDFs (verified against the Charlotte briefs) |
| `js/seedImages.js` | Built-in seed/venue images |
| `js/gdrive.js` | Two-way Google Drive sync + per-venue folder publish |
| `js/firebase.js` | Live team sync (Firebase Auth + Firestore) |
| `js/firebase-config.js` | Your baked-in Firebase web config |
| `js/mergeDocx.js` | Merges per-pitch reports into one combined .docx |
| `css/styles.css` | Labosport-branded styling |
| `libs/` | Vendored offline libraries (PizZip, docxtemplater, image module) |
| `assets/` | Reference images (rugby pitch diagram, position-test examples) |
| `report_template.docx` | The official Field Report Template the Word export fills in |
| `manifest.webmanifest`, `sw.js` | Make it installable + offline (must stay at the repo root) |
| `icons/` | App icons and logo |

> **Folder layout note:** the source files are organized into `js/`, `css/`, `assets/`, `libs/`, and
> `icons/`. `index.html`, `report_template.docx`, `manifest.webmanifest`, `sw.js`, and `.nojekyll` stay
> at the repo root — `sw.js` and the manifest must be there for the service worker scope and PWA install
> to work.

---

## Recent updates

**Testing & data**
- Soil moisture is now collected at **two depths — 38 mm (1.5 in) and 76 mm (3 in)** — each a separate
  test with its own pitch map, average, variance, and report row.
- **Clegg, surface traction, NDVI and both moisture depths moved to 25 positions** (even 5×5 grid).
- **Root-zone shear strength moved from 6 to 12 positions** (same layout as the others); previously
  collected shear data is migrated automatically to the 12-slot layout, keeping your first six readings.
- Position maps are now drawn on a **proper rugby pitch diagram** instead of a plain rectangle.

**Audit**
- An audit section shows its green **✓ only when every question is answered** — partial sections stay
  unmarked.

**Reports**
- The Word report now includes **Appendix K — Soil profile / thatch photos**, grouped by observation
  position and labeled with each position's thatch reading. It's conditional: no soil photos → no
  appendix and no blank page (per pitch in combined reports).

**Project structure**
- Source files reorganized into `js/`, `css/`, and `assets/` folders (see the table above).
