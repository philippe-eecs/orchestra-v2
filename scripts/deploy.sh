#!/bin/bash
# Deploy script for Orchestra V3
# Usage: ./scripts/deploy.sh

set -e

VM_HOST="root@159.65.109.198"
REPO_PATH="/root/orchestra"
BACKEND_PATH="$REPO_PATH/backend"

echo "=== Orchestra V3 Deployment ==="

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# 1. Build frontend locally
echo "Building frontend..."
cd "$ROOT_DIR/frontend"
npm run build

# 2. Copy dist to backend
echo "Copying dist to backend..."
rm -rf "$ROOT_DIR/backend/dist"
cp -r dist "$ROOT_DIR/backend/"

# 3. Check for uncommitted changes
cd "$ROOT_DIR"
if [[ -n $(git status --porcelain) ]]; then
    echo "Uncommitted changes detected. Please commit first."
    exit 1
fi

echo "Pushing to origin..."
git push origin main

# 4. Pull changes on VM
echo "Pulling changes on VM..."
ssh $VM_HOST "cd $REPO_PATH && git pull origin main"

# 5. Copy built frontend to VM (dist is gitignored)
echo "Copying built frontend..."
scp -r "$ROOT_DIR/backend/dist" $VM_HOST:$BACKEND_PATH/

# 6. Restart the backend service
echo "Restarting backend service..."
ssh $VM_HOST "pkill -f 'uvicorn main:app' || true"
sleep 1

# Start in background
ssh $VM_HOST "cd $BACKEND_PATH && source venv/bin/activate && nohup uvicorn main:app --host 0.0.0.0 --port 8000 > /root/hub.log 2>&1 &" &
sleep 3

# 7. Verify deployment
echo "Verifying deployment..."
GRAPHS=$(ssh $VM_HOST "curl -s http://localhost:8000/graphs")
echo "API response: $GRAPHS"

if echo "$GRAPHS" | grep -q '\['; then
    echo ""
    echo "=== Deployment successful! ==="
    echo "Access the app at: http://localhost:8000"
    echo "(After running: ssh -L 8000:localhost:8000 $VM_HOST)"
else
    echo "Deployment may have failed. Check /root/hub.log on the VM."
    exit 1
fi
