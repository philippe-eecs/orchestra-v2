#!/bin/bash
# Deploy script for Orchestra V2
# Usage: ./scripts/deploy.sh

set -e

VM_HOST="root@159.65.109.198"
REPO_PATH="/root/orchestra-repo"
HUB_PATH="$REPO_PATH/hub"

echo "=== Orchestra V2 Deployment ==="

# 1. Build frontend locally
echo "Building frontend..."
cd "$(dirname "$0")/../desktop"
npm run build

# 2. Commit and push changes (if any)
cd "$(dirname "$0")/.."
if [[ -n $(git status --porcelain) ]]; then
    echo "Uncommitted changes detected. Please commit first."
    exit 1
fi

echo "Pushing to origin..."
git push origin main

# 3. Pull changes on VM
echo "Pulling changes on VM..."
ssh $VM_HOST "cd $REPO_PATH && git pull origin main"

# 4. Copy built frontend to VM (not in git)
echo "Copying built frontend..."
scp -r desktop/dist $VM_HOST:$HUB_PATH/

# 5. Restart the hub service
echo "Restarting hub service..."
ssh $VM_HOST "pkill -f 'uvicorn app.main' || true"
sleep 1

# Start in background and detach properly
ssh $VM_HOST "cd $HUB_PATH && nohup venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 > /root/hub.log 2>&1 &" &
sleep 3

# 6. Verify deployment
echo "Verifying deployment..."
HEALTH=$(ssh $VM_HOST "curl -s http://localhost:8000/health")
echo "Health check: $HEALTH"

if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo ""
    echo "=== Deployment successful! ==="
    echo "Access the app at: http://localhost:8000"
    echo "(After running: ssh -L 8000:localhost:8000 $VM_HOST)"
else
    echo "Deployment may have failed. Check /root/hub.log on the VM."
    exit 1
fi
