#!/bin/bash
# Deploy StockInsight Pro to Google Cloud Run

set -e

# Configuration
PROJECT_ID="your-gcp-project-id"  # Replace with your GCP project ID
SERVICE_NAME="stockinsight-pro"
REGION="us-central1"  # Change to your preferred region
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo "╔════════════════════════════════════════════════════╗"
echo "║  StockInsight Pro - Google Cloud Run Deployment   ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Please install it from:"
    echo "   https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo "❌ Not authenticated. Running: gcloud auth login"
    gcloud auth login
fi

# Set the project
echo "📋 Setting GCP project to: $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Enable required APIs (first time only)
echo "🔧 Enabling required APIs..."
gcloud services enable cloudbuild.googleapis.com run.googleapis.com containerregistry.googleapis.com

# Build the container image
echo "🏗️  Building Docker image..."
gcloud builds submit --tag $IMAGE_NAME

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 60s \
  --max-instances 10 \
  --min-instances 0 \
  --port 8080

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format="value(status.url)")

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Service URL: $SERVICE_URL"
echo "📊 Dashboard API: $SERVICE_URL/api/dashboard"
echo "🏥 Health Check: $SERVICE_URL/api/health"
echo ""
echo "💡 Next steps:"
echo "   1. Test the API: curl $SERVICE_URL/api/health"
echo "   2. Update your frontend api.js to use: $SERVICE_URL"
echo "   3. Redeploy your Firebase frontend"
echo ""
