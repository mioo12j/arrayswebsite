# Free Web Hosting Guide — ARRAYS INGENIERIA ERP

This is a **full-stack** app, so it can't go on Netlify/Cloudflare Pages alone.
The free stack below actually runs everything:

| Part      | Free host                          | Why |
| --------- | ---------------------------------- | --- |
| Database  | **Neon** (neon.tech)               | Free serverless PostgreSQL |
| Backend   | **Render** (render.com)            | Runs a real Node container (needed for OCR + PDF child process) |
| Frontend  | **Cloudflare Pages** or **Netlify**| Free static hosting for the React build |

> Don't try to put the backend on Cloudflare Workers / Netlify Functions — it
> uses `child_process`, tesseract OCR and the filesystem, which those don't support.

---

## 0. Push the code to GitHub

```powershell
cd C:\Users\siddh\Downloads\epc
git init
git add .
git commit -m "Solar EPC ERP"
# create an empty repo on github.com, then:
git remote add origin https://github.com/<you>/<repo>.git
git branch -M main
git push -u origin main
```

---

## 1. Database — Neon (free)

1. Sign up at **neon.tech** → New Project.
2. Copy the **connection string** (looks like
   `postgresql://user:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require`).
3. Load the schema + seed from your PC (one time), pointing at Neon:

   ```powershell
   cd server
   $env:DATABASE_URL="postgresql://...sslmode=require"
   node src/db/migrate.js
   node src/db/seed.js
   ```

   (The app reads `DATABASE_URL` and connects over SSL automatically.)

---

## 2. Backend — Render (free)

1. Sign up at **render.com** → **New → Web Service** → connect your GitHub repo.
2. Settings:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
   - **Instance Type:** Free
3. **Environment variables** (Render → Environment):
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = your Neon string
   - `JWT_SECRET` = any long random string
   - `CLIENT_ORIGIN` = your frontend URL (fill in after step 3; you can use `*`
     temporarily, then lock it to the real URL)
4. Deploy. Your API will be at `https://<name>.onrender.com`.
   Test: open `https://<name>.onrender.com/api/health` → should show `{"status":"ok"}`.

> A `render.yaml` is included — you can instead use **New → Blueprint** and just
> fill in the 3 secret env vars.

---

## 3. Frontend — Cloudflare Pages (or Netlify)

### Cloudflare Pages
1. **pages.dev** → Create project → connect repo.
2. Build settings:
   - **Root directory / Build root:** `client`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. **Environment variable:**
   - `VITE_API_URL` = `https://<your-render-name>.onrender.com/api`
4. Deploy → you get `https://<project>.pages.dev`.

### Netlify (alternative)
- Base directory: `client` · Build: `npm run build` · Publish: `client/dist`
- Env var `VITE_API_URL` = `https://<render>.onrender.com/api`
- (The included `client/public/_redirects` handles SPA routing.)

### Final step
Go back to Render → set `CLIENT_ORIGIN` to your exact Pages/Netlify URL
(e.g. `https://ingenieria-erp.pages.dev`) and redeploy. Done.

Login: `admin@ingenieria.com` / `Admin@123` (change it immediately).

---

## Important free-tier caveats

1. **Render free sleeps** after ~15 min idle. The first request then takes
   ~30–60s to wake up (and OCR is slow on the first call while it loads models).
2. **File uploads are NOT persistent on Render free** — the container's disk is
   wiped on every redeploy/restart. Payment-proof images, statement PDFs and
   vault files will disappear. The *extracted data* (in Postgres) stays; only the
   original files are lost. For permanent file storage you'd add **Cloudflare R2**
   or **Supabase Storage** (small code change to `document.service.js`).
   For a demo/internal tool this is usually fine.
3. **OCR/Tesseract** downloads a language model on first image upload (needs
   internet — Render has it). PDF text extraction works without it.
4. Keep `JWT_SECRET` secret and change the default admin password.

---

## TL;DR

Neon (DB) → Render (`server/`, set `DATABASE_URL`+`JWT_SECRET`+`CLIENT_ORIGIN`) →
Cloudflare Pages (`client/`, set `VITE_API_URL`). All free.
