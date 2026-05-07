# Backend Deployment

**Server:** `api.festivalapp.flowersdev.click`
**Host:** AWS Lightsail — Ubuntu 22.04, $3.50/month
**Static IP:** `3.18.0.237`
**SSH key:** `~/Downloads/LightsailKey.pem`

---

## Deploy changes

Run from `backend/`:

```bash
./scripts/deploy.sh 3.18.0.237 ~/Downloads/LightsailKey.pem
```

This builds TypeScript locally, syncs the output to the server, installs production dependencies, and restarts the app. Takes about 30 seconds.

---

## Check logs

```bash
ssh -i ~/Downloads/LightsailKey.pem ubuntu@3.18.0.237 pm2 logs sonic-temple
```

Add `--lines 100` to see more history.

---

## Check app status

```bash
ssh -i ~/Downloads/LightsailKey.pem ubuntu@3.18.0.237 pm2 status
```

---

## Restart the app manually

```bash
ssh -i ~/Downloads/LightsailKey.pem ubuntu@3.18.0.237 pm2 restart sonic-temple
```

---

## SSH into the server

```bash
ssh -i ~/Downloads/LightsailKey.pem ubuntu@3.18.0.237
```

---

## Edit environment variables

Environment variables live in `/home/ubuntu/app/.env` on the server. To update:

```bash
ssh -i ~/Downloads/LightsailKey.pem ubuntu@3.18.0.237
nano /home/ubuntu/app/.env
pm2 restart sonic-temple
```

Current variables:
- `SETLIST_API_KEY` — Setlist.fm API key
- `PORT` — 3001 (nginx proxies 443 → 3001, do not change)
- `LOG_LEVEL` — `info`

---

## First-time server setup

Only needed when provisioning a new Lightsail instance. See `setup-server.sh` and the AWS console steps in the conversation history.

---

## SSL certificate

Issued by Let's Encrypt via certbot. Expires 2026-08-05 but **auto-renews** — no action needed. To check renewal status on the server:

```bash
sudo systemctl status certbot.timer
```
