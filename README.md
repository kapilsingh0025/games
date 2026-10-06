# PlayZone

Virtual-coin games (14) with Email OTP, Phone OTP and Google login, plus an admin panel.
Zero npm dependencies. Needs Node 18 or newer. Coins have no cash value.

## Run locally
1. Copy `.env.example` to `.env` and edit the values.
2. `node server.js`  (or `npm start`)
3. Open http://localhost:3000. Admin: the "Admin" tab on the same login page.

With `OTP_DEV=true` the OTP is shown on screen and printed in the server log, so you can test without email or SMS.

## Deploy
**Render / Railway / Fly.io:** create a Web Service from this folder.
Start command `node server.js`, health check path `/health`.
Add every variable from `.env.example` in the dashboard, then attach a persistent disk
and set `DATA_DIR` to its mount path (for example `/data`). Without a disk the data resets on each deploy.

**Docker:**
`docker build -t playzone .`
`docker run -d -p 3000:3000 -v playzone-data:/data --env-file .env playzone`

**VPS:** run `node server.js` under pm2 or systemd and put nginx with HTTPS (Let's Encrypt) in front.

## Before going live
- Change `ADMIN_PASSWORD` and set a long random `SESSION_SECRET`.
- Set `OTP_DEV=false`, and configure `RESEND_API_KEY` + `MAIL_FROM` (email) and Twilio (phone).
- Google login: create a Web OAuth client, add your site URL under Authorized JavaScript origins, put the ID in `GOOGLE_CLIENT_ID`.
- Serve over HTTPS only. Back up `DATA_DIR/db.json`.
