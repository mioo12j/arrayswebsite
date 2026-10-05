# ARRAYS INGENIERIA ERP — Install Guide (Windows)

Set this up once on each computer. After that, the operator just double-clicks
**“Start ARRAYS ERP.bat”**, and the software keeps itself up to date over the
internet (see *Software updates* at the end).

The app runs **entirely on this computer** — your data stays local and it works
offline. The only things that need internet are uploading the GST JSON on the
government portal, optional “Publish to Cloud”, and software updates.

---

## 1. Install the prerequisites

```powershell
winget install OpenJS.NodeJS.LTS          # Node.js 18+
winget install PostgreSQL.PostgreSQL.16    # PostgreSQL 14+
winget install Git.Git                     # Git (required for auto-update)
```

Close and re-open the terminal afterwards so `node`, `npm`, `psql` and `git`
are on PATH. During the PostgreSQL install you set a password for the `postgres`
user — **remember it**.

## 2. Get the code (clone the `main` branch)

```powershell
cd %USERPROFILE%\Downloads
git clone https://github.com/mioo12j/arrays.git epc
cd epc
```

> The repository is private — when git asks, sign in / paste the access token
> you were given. Cloning `main` is what makes auto-update work later.

## 3. Create the database

```powershell
& "$env:ProgramFiles\PostgreSQL\16\bin\createdb.exe" -U postgres solar_epc
```

## 4. Configure the backend

```powershell
cd server
Copy-Item .env.example .env
```

Open `server\.env` and set:
- `PGPASSWORD` = your postgres password
- `JWT_SECRET` = any long random string

Leave the rest as-is. (For the read-only cloud admin view, optionally set
`CLOUD_DATABASE_URL`.)

## 5. Install, load the database, build

```powershell
cd ..                 # back to the project root
npm run install:all   # installs server + client dependencies
npm run db:migrate    # creates/upgrades all tables (idempotent, safe to re-run)
npm run db:seed       # creates the default users
npm run build         # builds the web app the server will serve
```

## 6. Run it

Double-click **“Start ARRAYS ERP.bat”** in the project folder. It starts the
server and opens the app in a clean window. (On the very first run it will
build automatically if you skipped step 5.) Pin the shortcut to the taskbar for
everyday use.

The app opens at **http://localhost:4000**.

---

## Default logins — change them immediately

| Role (shown as)         | Login ID   | Password       | Can do                                                |
| ----------------------- | ---------- | -------------- | ----------------------------------------------------- |
| **Editor** (super-admin)| `editor`   | `editor@123`   | Everything — all setup, users, updates                |
| **Admin**               | `admin`    | `admin@123`    | View only — cannot import, export or change anything  |
| **System Manager**      | `operator` | `operator@123` | All daily work + uploads/downloads (no setup screens) |

The ID is a short word, **not** an email. These are well-known defaults —
change them on first sign-in: **top-right menu → Change Password**, and the
Editor can reset anyone from **User Management**.

---

## Software updates (automatic)

Each install tracks the `main` branch. When a newer version is published, an
**“Update available”** card appears bottom-right; the System Manager or Editor
clicks **Update now** and the app backs up, pulls the new code, rebuilds,
migrates and restarts — **your data is preserved** (only the program code
changes). If an update fails it rolls back and keeps the working version
running (`server/update.log` has the details).

> Do **not** click “Update now” on the machine where code is authored/pushed —
> only on the deployed installs.

## Notes

- Uploaded files are stored under `server/uploads/` and never leave this
  computer.
- The GST e-Invoice / e-Way-Bill flow is **offline**: build the JSON here →
  upload it on the government portal → bring the IRN/Ack/QR back (the app reads
  them straight from the signed PDF). See the in-app **Help & Guide**.
- Take a backup before closing (the app offers one at sign-out), and keep a copy
  off-site (pen-drive / another PC).
