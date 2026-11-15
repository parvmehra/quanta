# Deployment (Render + MongoDB Atlas)

Two Render services, defined in `render.yaml` at the repository root:

- `quanta-api`: the Express and Socket.IO server (a Web Service).
- `quanta-app`: the React app (a Static Site).

The database stays on MongoDB Atlas. Quanta must run as one long-lived server, so serverless hosts are not suitable.

## Before you start

1. Code pushed to GitHub (`main`).
2. Atlas cluster with a database user. Its connection string must include the database name, for example `.../quanta?retryWrites=true&w=majority`.
3. **An email sender.** Sign-in needs an emailed code, and one-time codes are never shown on screen in production. Easiest: a Google account with 2-step verification, then an app password (Google Account, Security, App passwords). A transactional provider's SMTP details also work; set `SMTP_*` instead of the Gmail variables.

## Steps

1. **Atlas network access.** Atlas, Network Access, Add IP Address, Allow access from anywhere (`0.0.0.0/0`). Render's free plan has no fixed outgoing address. The database user's password is what protects the cluster, so keep it strong.
2. **Create the services.** Render dashboard, New, Blueprint, pick the `quanta` repository. Render reads `render.yaml` and creates both services. It asks for the values marked `sync: false`.
3. **Fill in the backend values** (`quanta-api`):

   | Variable | Value |
   |---|---|
   | `MONGO_DB_URI` | Atlas connection string |
   | `CORS_ORIGIN` | the frontend URL, for example `https://quanta-app.onrender.com` (no trailing slash) |
   | `APP_BASE_URL` | the same frontend URL (used in email links) |
   | `GMAIL_USER`, `GMAIL_APP_PASS`, `EMAIL_FROM` | your sender (leave `EMAIL_FROM` as `Quanta <you@gmail.com>`) |
   | `GEMINI_API_KEY` | optional; without it the advisor uses its rule-based summary |

   `JWT_SECRET` is generated for you. `NODE_ENV=production` turns on JSON logs and hides development-only codes.
4. **Fill in the frontend values** (`quanta-app`): `VITE_API_BASE_URL` and `VITE_SOCKET_URL`, both set to the backend URL, for example `https://quanta-api.onrender.com`. These are read when the site is built, so after changing them use Manual Deploy, Clear build cache and deploy.
5. **Deploy**, then check `https://<backend>/api/health` returns `{"status":"ok"...}`.
6. **Smoke test** in the browser: sign up, receive the email code, verify, open the dashboard, place a small paper order.

The service names in `render.yaml` decide the default URLs. If a name is taken Render adds a suffix, so copy the real URLs into `CORS_ORIGIN`, `APP_BASE_URL` and the two `VITE_` values.

## Optional

- **Google sign-in:** set the `VITE_FIREBASE_*` values on the frontend, the Firebase Admin credentials on the backend (see `backend/.env.example`), and add the frontend domain under Firebase, Authentication, Settings, Authorized domains.
- **Custom domain:** add it in each service's settings, then update `CORS_ORIGIN`, `APP_BASE_URL` and the `VITE_` values.
- **SMS:** leave Twilio unset. SMS stays simulated.

## Things to know

- **Free web services sleep after about 15 minutes without traffic.** The first request afterwards takes 30 to 60 seconds, and live-price polling and limit-order matching pause while asleep. The Starter plan keeps the server awake.
- The login rate limiter and caches live in memory and reset on every restart or redeploy.
- Do not reuse the local `JWT_SECRET`. A new secret signs everyone out, which is expected on first deploy.
- Never put secrets in `render.yaml` or commit `.env` files. Set secrets only in the Render dashboard.
- Logs are in each service's Logs tab. A failed email shows there as an error.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Browser console shows CORS errors | `CORS_ORIGIN` does not exactly match the frontend URL |
| Site calls `localhost:3001` | the `VITE_` values were not set before the build; set them and rebuild |
| "Database is not available" | `MONGO_DB_URI` wrong, or Atlas network access does not allow Render |
| Sign-in code never arrives | email variables wrong; check the API logs and the app password |
| Server fails at start about `JWT_SECRET` | the variable was removed or shortened below 32 characters |
