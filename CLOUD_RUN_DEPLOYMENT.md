# Google Cloud Run Deployment Guide

## Prerequisites

1. **Google Cloud Account** - Free tier includes $300 credit
2. **gcloud CLI** - [Install here](https://cloud.google.com/sdk/docs/install)
3. **Docker** (optional) - Only needed for local testing

## Step 1: Initial Setup

### 1.1 Install gcloud CLI (if not already installed)

**macOS:**
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init
```

**Or use Homebrew:**
```bash
brew install --cask google-cloud-sdk
```

### 1.2 Authenticate and Set Project

```bash
# Login to Google Cloud
gcloud auth login

# Create a new project (or use existing)
gcloud projects create stockinsight-pro --name="StockInsight Pro"

# Set the project
gcloud config set project stockinsight-pro

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

## Step 2: Update Configuration

Edit `deploy-cloudrun.sh` and update:

```bash
PROJECT_ID="stockinsight-pro"  # Your GCP project ID
SERVICE_NAME="stockinsight-pro"
REGION="us-central1"  # or us-east1, europe-west1, etc.
```

## Step 3: Deploy to Cloud Run

### Option A: Using the Deployment Script (Recommended)

```bash
# Make the script executable
chmod +x deploy-cloudrun.sh

# Run deployment
./deploy-cloudrun.sh
```

### Option B: Manual Deployment

```bash
# Set your project ID
PROJECT_ID="stockinsight-pro"
SERVICE_NAME="stockinsight-pro"
REGION="us-central1"

# Build and push image
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME

# Deploy to Cloud Run
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 60s \
  --max-instances 10 \
  --min-instances 0 \
  --port 8080
```

## Step 4: Get Your Service URL

After deployment, you'll receive a URL like:
```
https://stockinsight-pro-xxxxx-uc.a.run.app
```

Test it:
```bash
curl https://your-service-url.run.app/api/health
```

## Step 5: Update Frontend

Update `api.js` in your frontend to use the Cloud Run URL:

```javascript
// api.js
const API_BASE_URL = 'https://stockinsight-pro-xxxxx-uc.a.run.app';

export async function fetchDashboardData(forceRefresh = false) {
  const url = `${API_BASE_URL}/api/dashboard${forceRefresh ? '?force=true' : ''}`;
  // ... rest of your code
}
```

## Step 6: Redeploy Frontend to Firebase

```bash
cd /path/to/stock-insight-dashboard
firebase deploy --only hosting
```

## Cost Estimate

**Free Tier (more than enough for personal use):**
- 2 million requests/month
- 360,000 vCPU-seconds/month
- 180,000 GiB-seconds memory/month
- 1 GB network egress/month

**With 4-hour caching:**
- ~6 refreshes/day = 180 refreshes/month
- Far below free tier limits
- **Expected cost: $0/month**

## Configuration Options

### Memory and CPU
```bash
--memory 512Mi      # 256Mi, 512Mi, 1Gi, 2Gi, 4Gi
--cpu 1             # 1, 2, 4
```

### Scaling
```bash
--max-instances 10  # Max concurrent instances
--min-instances 0   # Set to 1 to avoid cold starts (may incur costs)
```

### Timeout
```bash
--timeout 60s       # Max request timeout (up to 300s)
```

## Useful Commands

### View Logs
```bash
gcloud run services logs read $SERVICE_NAME --region $REGION
```

### Update Service
```bash
# After code changes, rebuild and redeploy
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME
gcloud run deploy $SERVICE_NAME --image gcr.io/$PROJECT_ID/$SERVICE_NAME --region $REGION
```

### Delete Service (to stop charges)
```bash
gcloud run services delete $SERVICE_NAME --region $REGION
```

### Check Current Services
```bash
gcloud run services list
```

## Troubleshooting

### Issue: Cold Starts Too Slow
**Solution:** Set `--min-instances 1` (will incur small costs)

### Issue: Timeout Errors
**Solution:** Increase timeout: `--timeout 90s`

### Issue: Memory Errors
**Solution:** Increase memory: `--memory 1Gi`

### Issue: CORS Errors
**Solution:** Flask app already has CORS enabled. If issues persist, check your frontend is using the correct Cloud Run URL with https://

## Environment Variables (Optional)

If you need to add environment variables:

```bash
gcloud run deploy $SERVICE_NAME \
  --set-env-vars "VAR_NAME=value,ANOTHER_VAR=value2"
```

## Continuous Deployment (Optional)

Connect to GitHub for automatic deployments:

1. Go to [Cloud Run Console](https://console.cloud.google.com/run)
2. Click "Set up continuous deployment"
3. Connect your GitHub repository
4. Select branch and Dockerfile location
5. Auto-deploys on every push!

## Monitoring

View metrics in [Cloud Run Console](https://console.cloud.google.com/run):
- Request count
- Request latency
- Container instance count
- Memory and CPU usage

## Support

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud Run Pricing](https://cloud.google.com/run/pricing)
- [Free Tier Details](https://cloud.google.com/free)

---

## Quick Reference

```bash
# Deploy
./deploy-cloudrun.sh

# View logs
gcloud run services logs read stockinsight-pro --region us-central1 --limit 50

# Get service URL
gcloud run services describe stockinsight-pro --region us-central1 --format="value(status.url)"

# Update after changes
gcloud builds submit --tag gcr.io/stockinsight-pro/stockinsight-pro && \
gcloud run deploy stockinsight-pro --image gcr.io/stockinsight-pro/stockinsight-pro --region us-central1
```
