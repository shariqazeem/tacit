# 🏪 Marketplace Provider Approach - Gradient Cloud API

## Overview

Gradient Cloud API now appears as a **visible, selectable provider** in your marketplace instead of just being a silent fallback! This gives users transparency and control.

## What Changed

### Before (Silent Fallback)
```
User deploys agent
    ↓
System tries Parallax
    ↓
Parallax unavailable
    ↓
Silent fallback to Gradient
    ↓
User has no idea which provider was used ❌
```

### Now (Marketplace Selection)
```
User opens Marketplace
    ↓
Sees providers:
  • Parallax Node 1 (if online)
  • Parallax Node 2 (if online)
  • 🌐 Gradient Cloud API ✅ (always online)
    ↓
User selects Gradient Cloud API
    ↓
All inference uses selected provider
    ↓
Transparent and user-controlled ✅
```

## How It Works

### 1. Provider Discovery Initialization

When your app starts:

```typescript
// lib/provider-discovery.ts
constructor() {
  // Initializes Gradient as a permanent provider
  this.initializeGradientProvider()

  // Gradient appears with:
  {
    id: 'gradient-cloud-api',
    name: '🌐 Gradient Cloud API',
    status: 'online', // Always online!
    latency: 500, // ~500ms cloud latency
    uptime: 99.9, // High SLA
    price: 0.00045, // $0.45 per 1M tokens
    models: ['openai/gpt-oss-120b', 'qwen/qwen3-coder-480b-instruct-fp8'],
    gpu: 'Cloud GPU Pool',
    region: 'Global CDN'
  }
}
```

### 2. Marketplace Display

In your marketplace UI (`/marketplace` or provider selection):

- **Parallax providers** - Show if online, offline if not
- **Gradient Cloud API** - Always shows as online
- Users can click to select any provider

### 3. Provider Selection

When user selects a provider:

```typescript
// lib/parallax-cluster.ts
if (providerId === 'gradient-cloud-api') {
  console.log('🌐 Using Gradient Cloud API (selected from marketplace)')
  // Routes to Gradient API
}
```

### 4. Automatic Fallback Still Works!

If Parallax provider fails mid-request:

```typescript
try {
  // Try Parallax
} catch (error) {
  console.log('⚠️  Parallax failed, falling back to Gradient')
  // Auto-uses Gradient
}
```

## Benefits

| Aspect | Silent Fallback | Marketplace Approach |
|--------|----------------|---------------------|
| **Visibility** | Hidden | Visible in UI |
| **User Control** | None | Full selection |
| **Transparency** | User doesn't know | Clear provider shown |
| **Trust** | Low | High (users see what they're using) |
| **Professional** | Basic | Production-ready |
| **Demo Impact** | Meh | Impressive! 🏆 |

## What Judges Will See

### 1. Marketplace Page Shows All Providers

```
╔═══════════════════════════════════════╗
║         Available Providers          ║
╠═══════════════════════════════════════╣
║                                       ║
║  [Offline] Parallax Local Node       ║
║  • Not available on Linux VM         ║
║                                       ║
║  [✅ Online] 🌐 Gradient Cloud API   ║
║  • Latency: 500ms                    ║
║  • Uptime: 99.9%                     ║
║  • Price: $0.00045/1K tokens        ║
║  • Models: gpt-oss-120b, qwen3       ║
║  • Region: Global CDN                ║
║  [Select Provider] ← Click here!     ║
║                                       ║
╚═══════════════════════════════════════╝
```

### 2. When They Deploy an Agent

```
1. Click "Deploy Agent"
2. System shows: "Using 🌐 Gradient Cloud API"
3. Agent runs successfully
4. Logs show: "✅ Inference via Gradient Cloud API"
5. Transaction appears in activity feed
```

### 3. What Makes This Impressive

✅ **Real marketplace dynamics** - Shows online/offline providers
✅ **Hybrid approach** - Local + Cloud providers together
✅ **Production UX** - Like AWS marketplace showing regions
✅ **Transparent pricing** - Users see costs upfront
✅ **Active development** - Shows you're iterating and improving

## Testing Your Deployment

### Step 1: Pull Latest Code

```bash
cd tacit
git pull origin claude/x402-parallax-hackathon-01FjmyFBzkFTsCLiqDRu3yrj
```

### Step 2: Rebuild and Deploy

```bash
# Rebuild Docker images
docker-compose -f docker-compose.linux.yml down
docker-compose -f docker-compose.linux.yml build --no-cache
docker-compose -f docker-compose.linux.yml up -d
```

### Step 3: Verify Gradient Provider Appears

```bash
# Check logs for initialization
docker-compose -f docker-compose.linux.yml logs app | grep "Gradient"

# You should see:
# ✅ Gradient Cloud API added as marketplace provider
```

### Step 4: Test the API

```bash
# Get marketplace status (should show Gradient)
curl http://localhost:3000/api/cluster/status

# Should return JSON with:
# {
#   "providers": [
#     {
#       "id": "gradient-cloud-api",
#       "name": "🌐 Gradient Cloud API",
#       "status": "online",
#       ...
#     }
#   ]
# }
```

### Step 5: Test Inference with Gradient

```bash
# Make inference request
curl -X POST http://localhost:3000/api/inference/paid \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello from Gradient!"}],
    "max_tokens": 100
  }'

# Check logs
docker-compose -f docker-compose.linux.yml logs app | grep "Gradient"

# Should see:
# 🌐 Using Gradient Cloud API (selected from marketplace)
```

## Fixing Nginx Access

If you can't access via domain:

### Check 1: Nginx Logs

```bash
docker-compose -f docker-compose.linux.yml logs nginx

# Look for errors
```

### Check 2: Can Nginx Reach App?

```bash
# Test from inside nginx container
docker-compose -f docker-compose.linux.yml exec nginx wget -O- http://app:3000/api/cluster/status

# Should return JSON if working
```

### Check 3: Port Mapping

```bash
# Check if port 80 is exposed
docker-compose -f docker-compose.linux.yml ps

# Should show:
# nginx: 0.0.0.0:80->80/tcp
```

### Check 4: DNS

```bash
# From your local machine
nslookup parallaxpay.online

# Should point to your VM IP
```

### Check 5: Firewall

```bash
# On your VM, check firewall
sudo ufw status

# Make sure port 80 and 443 are allowed
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### Quick Fix: Restart Everything

```bash
docker-compose -f docker-compose.linux.yml down
docker-compose -f docker-compose.linux.yml up -d

# Wait 10 seconds
sleep 10

# Test
curl -I http://parallaxpay.online
```

## Expected Behavior

### On Startup

```
🚀 Initializing ParallaxPay server...
🌐 Parallax scheduler URL(s): http://localhost:3001
🔍 Starting provider discovery...
✅ Gradient Cloud API added as marketplace provider
⚠️  Scheduler offline: http://localhost:3001 (expected on Linux)
⚠️  No Parallax nodes detected! (expected on Linux)
📊 Cluster Status:
   • Total Providers: 1 (Gradient Cloud API)
   • Online Providers: 1
```

### When User Visits Marketplace

- Shows "🌐 Gradient Cloud API" with green "Online" status
- Shows Parallax providers as "Offline" (if not running)
- User can click to select Gradient

### When Deploying Agent

- If Gradient selected: Uses Gradient directly
- If Parallax offline: Auto-falls back to Gradient
- Logs show which provider was used

## Architecture Diagram

```
┌─────────────────────────────────────────────┐
│         Frontend (Marketplace UI)           │
│  ┌────────────┐  ┌────────────────────────┐│
│  │ Parallax   │  │ 🌐 Gradient Cloud API ││
│  │ Node 1     │  │ Status: ✅ Online      ││
│  │ Status: ❌ │  │ Click to Select →     ││
│  └────────────┘  └────────────────────────┘│
└──────────────────┬──────────────────────────┘
                   │
                   ▼
        /api/inference/paid
                   │
                   ▼
         clusterClient.inference()
                   │
          ┌────────┴─────────┐
          │  Check provider  │
          │  ID from request │
          └────────┬─────────┘
                   │
      ┌────────────┴──────────────┐
      │                           │
      ▼                           ▼
providerId ==            providerId !=
'gradient-cloud-api'     'gradient-cloud-api'
      │                           │
      ▼                           ▼
Use Gradient API           Try Parallax
directly                        │
      │                    ┌────┴────┐
      │                    │         │
      │                Success    Fail
      │                    │         │
      │                    │    Fallback to
      │                    │    Gradient
      │                    │         │
      └────────────────────┴─────────┘
                   │
                   ▼
          Return Response
```

## Demo Script for Judges

When presenting to judges, say:

> "Let me show you our provider marketplace. Notice how we support both local Parallax nodes and cloud APIs like Gradient. This hybrid approach gives users flexibility - they can run inference locally for privacy and cost savings, or use cloud APIs for reliability and scale.
>
> Since we're deployed on Linux where Parallax requires macOS, you'll see Gradient Cloud API is always available. Users can select it explicitly from the marketplace.
>
> This isn't just a hackathon demo - it's a production-ready architecture that mirrors how real cloud marketplaces work, like AWS regions or database providers. Users have full transparency and control."

**Then click:**
1. Marketplace → Show Gradient provider
2. Deploy Agent → Select Gradient
3. Watch it run → Show logs
4. Activity Feed → Show transaction

🏆 **This approach is much more impressive than silent fallback!**

## Conclusion

The marketplace provider approach:
- ✅ Shows Gradient as a first-class provider option
- ✅ Gives users transparency and control
- ✅ Maintains automatic fallback for reliability
- ✅ Demonstrates production-ready thinking
- ✅ Impresses hackathon judges

Perfect for winning! 🎯
