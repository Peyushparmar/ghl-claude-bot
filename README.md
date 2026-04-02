# GHL Claude Bot — AI SMS Appointment Setter

Direct integration between GoHighLevel and Claude API.
No Make.com, no Zapier, no monthly platform fees.

Prospect replies to your SMS → This server catches it → Claude writes a smart reply → Sends it back through GHL automatically.

---

## What You Need

1. **Anthropic API Key** — Sign up at https://console.anthropic.com
2. **GHL API Key** — Found in GHL Settings → Business Profile → API
3. **A hosting platform** — Railway, Render, or any VPS (see options below)

---

## Deployment Option 1: Railway (Easiest — 5 minutes)

Railway is the fastest way to get this live.

1. Go to https://railway.app and sign up (free tier gives you $5/month free)
2. Click **"New Project"** → **"Deploy from GitHub Repo"**
   - Or click **"Deploy from Template"** → **"Empty Node.js"**
3. Upload/push these files to a GitHub repo and connect it
4. In Railway, go to your project → **Variables** tab → Add these:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   GHL_API_KEY=your-ghl-key-here
   BOOKING_LINK=https://your-booking-link.com
   YOUR_NAME=Your Name
   ```
5. Railway will auto-deploy and give you a URL like: `https://your-app.up.railway.app`
6. Your webhook URL is: `https://your-app.up.railway.app/webhook/ghl`

**Cost: Free up to $5/month usage, then $5-7/month.**

---

## Deployment Option 2: Render (Also Easy)

1. Go to https://render.com and sign up
2. Click **"New Web Service"**
3. Connect your GitHub repo with these files
4. Set **Build Command**: `npm install`
5. Set **Start Command**: `npm start`
6. Add environment variables (same as above)
7. Deploy — your URL will be: `https://your-app.onrender.com`
8. Webhook URL: `https://your-app.onrender.com/webhook/ghl`

**Cost: Free tier available (spins down after inactivity — first response may be slow). Paid starts at $7/month for always-on.**

---

## Deployment Option 3: VPS (Cheapest Long-Term)

For a $4-6/month VPS on DigitalOcean, Hetzner, or Vultr:

```bash
# SSH into your server
ssh root@your-server-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone or upload your files
mkdir ghl-claude-bot
cd ghl-claude-bot
# Upload server.js, package.json, .env

# Install dependencies
npm install

# Create your .env file
cp .env.example .env
nano .env  # Fill in your keys

# Install PM2 to keep it running 24/7
npm install -g pm2
pm2 start server.js --name ghl-bot
pm2 save
pm2 startup

# Install Nginx for HTTPS (needed for GHL webhooks)
sudo apt install nginx certbot python3-certbot-nginx
# Point your domain to the server, then:
sudo certbot --nginx -d yourdomain.com
```

Your webhook URL will be: `https://yourdomain.com/webhook/ghl`

**Cost: $4-7/month total.**

---

## Setting Up the GHL Workflow

Once your server is deployed and you have your webhook URL:

1. Go to GHL → **Automation** → **Workflows**
2. Create a new workflow
3. **Trigger**: "Customer Replied" → Filter: SMS only
4. **Action**: Webhook (POST)
5. **URL**: Your webhook URL (e.g., `https://your-app.up.railway.app/webhook/ghl`)
6. **Body** — Send these fields:
   ```json
   {
     "contactId": "{{contact.id}}",
     "contactName": "{{contact.first_name}}",
     "message": "{{message.body}}"
   }
   ```
7. Save and turn ON the workflow

---

## Testing

### Test without GHL (using curl or Postman):

```bash
curl -X POST https://your-app-url.com/test \
  -H "Content-Type: application/json" \
  -d '{"name": "John", "message": "How much does it cost?"}'
```

You should get back a JSON response with Claude's reply.

### Test with GHL:

1. Send a test SMS to your GHL number from a personal phone
2. Watch the server logs for the incoming webhook
3. You should receive an AI-generated reply within 5-10 seconds

---

## Features Built In

- **Conversation memory** — Remembers last 10 messages per contact (48-hour window)
- **Random reply delay** — Waits 2-8 seconds before replying so it feels human
- **Stop word detection** — Automatically stops replying if prospect says "stop", "unsubscribe", etc.
- **Auto-cleanup** — Old conversations are cleared after 48 hours to save memory
- **Health check** — Visit your base URL to confirm the server is running

---

## Customization

### Change the AI personality:
Edit the `getSystemPrompt()` function in `server.js`. This is where all the conversation rules and responses live.

### Change the reply delay:
Find the `setTimeout` line in the webhook handler. Default is 2-8 seconds random delay.

### Add more stop words:
Find the `stopWords` array and add any words you want to trigger an auto-stop.

---

## Estimated Costs

| Item | Monthly Cost |
|------|-------------|
| Hosting (Railway/Render/VPS) | $5-7 |
| Claude API (Sonnet) | $5-15 depending on volume |
| **Total** | **$10-22/month** |

Compare this to Make.com ($9-29/month) + you still pay for Claude API on top.
This is the cheapest possible setup.
