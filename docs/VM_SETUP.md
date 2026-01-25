# Orchestra V2 - VM Setup Guide

Complete guide for provisioning and deploying the Orchestra hub to a cloud VM.

## Prerequisites

- DigitalOcean account (or any VPS provider)
- SSH key pair
- Domain name (optional, for HTTPS)

## 1. Create Droplet

### DigitalOcean Console

1. Create Droplet
2. **Image**: Ubuntu 22.04 LTS
3. **Size**: Basic $12/mo (2GB RAM, 1 vCPU, 50GB SSD)
4. **Region**: Choose closest to you
5. **Authentication**: SSH keys (recommended)
6. **Hostname**: `orchestra-hub`

### Using doctl CLI

```bash
doctl compute droplet create orchestra-hub \
  --image ubuntu-22-04-x64 \
  --size s-1vcpu-2gb \
  --region nyc1 \
  --ssh-keys YOUR_SSH_KEY_ID
```

## 2. Initial Server Setup

### Connect and Create User

```bash
ssh root@YOUR_DROPLET_IP

# Create non-root user
adduser orchestra
usermod -aG sudo orchestra

# Copy SSH keys to new user
mkdir -p /home/orchestra/.ssh
cp ~/.ssh/authorized_keys /home/orchestra/.ssh/
chown -R orchestra:orchestra /home/orchestra/.ssh
chmod 700 /home/orchestra/.ssh
chmod 600 /home/orchestra/.ssh/authorized_keys

# Disable root SSH login (optional but recommended)
# Edit /etc/ssh/sshd_config and set: PermitRootLogin no
# Then: systemctl restart sshd
```

### Configure Firewall

The security model uses SSH key authentication for all private services:

| Port | Access | Purpose |
|------|--------|---------|
| 22 | SSH keys | Admin access, tunnels |
| 80, 443 | Public | Websites (future) |
| 8000-8009 | SSH tunnel only | Private services |

```bash
ufw default deny incoming
ufw default allow outgoing

# SSH - requires key authentication
ufw allow OpenSSH

# Public web ports (for future public websites)
ufw allow 80/tcp
ufw allow 443/tcp

# Private ports: localhost only (accessed via SSH tunnel)
ufw allow from 127.0.0.1 to any port 8000:8009 proto tcp

ufw enable
ufw status
```

**Result:** Private services (Hub on 8000, Executor on 8001) require SSH tunnel access. No IP whitelisting needed - your SSH key is the authentication.

### Install System Dependencies

```bash
apt update && apt upgrade -y
apt install -y python3.11 python3.11-venv python3-pip tmux git htop
```

## 3. Install AI CLI Tools

Orchestra agents require Claude, Codex, and Gemini CLI tools.

### Claude CLI

```bash
# Install via npm
npm install -g @anthropic-ai/claude-code

# Or via curl
curl -fsSL https://claude.ai/install.sh | sh

# Configure API key
export ANTHROPIC_API_KEY="your-key-here"
echo 'export ANTHROPIC_API_KEY="your-key-here"' >> ~/.bashrc
```

### Codex CLI

```bash
# Install OpenAI Codex CLI
npm install -g @openai/codex

# Configure API key
export OPENAI_API_KEY="your-key-here"
echo 'export OPENAI_API_KEY="your-key-here"' >> ~/.bashrc
```

### Gemini CLI

```bash
# Install Google Gemini CLI
npm install -g @anthropic-ai/gemini-cli

# Or via pip
pip install google-generativeai

# Configure API key
export GOOGLE_API_KEY="your-key-here"
echo 'export GOOGLE_API_KEY="your-key-here"' >> ~/.bashrc
```

### Verify Installation

```bash
source ~/.bashrc
claude --version
codex --version
gemini --version
```

## 4. Deploy Hub Service

### Clone Repository

```bash
su - orchestra
cd ~
git clone https://github.com/YOUR_USERNAME/claude-command.git orchestra
cd orchestra/hub
```

### Setup Python Environment

```bash
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Test Run

```bash
# Quick test
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Verify health endpoint
curl http://localhost:8000/health
# Should return: {"status":"ok","version":"2.0.0"}
```

## 5. Configure as Systemd Service

### Create Service File

```bash
sudo nano /etc/systemd/system/orchestra.service
```

Paste the following (also available at `hub/orchestra.service`):

```ini
[Unit]
Description=Orchestra Hub Service
After=network.target

[Service]
Type=simple
User=orchestra
Group=orchestra
WorkingDirectory=/home/orchestra/orchestra/hub
Environment="PATH=/home/orchestra/orchestra/hub/venv/bin:/usr/local/bin:/usr/bin:/bin"
Environment="ANTHROPIC_API_KEY=your-key-here"
Environment="OPENAI_API_KEY=your-key-here"
Environment="GOOGLE_API_KEY=your-key-here"
ExecStart=/home/orchestra/orchestra/hub/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable orchestra
sudo systemctl start orchestra
sudo systemctl status orchestra
```

### View Logs

```bash
sudo journalctl -u orchestra -f
```

## 6. Connect from Frontend

### SSH Tunnel (Required)

The hub runs on private ports (8000-8009) accessible only via SSH tunnel:

```bash
# Open tunnel (keep this terminal open)
ssh -L 8000:localhost:8000 -L 8001:localhost:8001 root@YOUR_DROPLET_IP

# Or use a background tunnel
ssh -f -N -L 8000:localhost:8000 -L 8001:localhost:8001 root@YOUR_DROPLET_IP
```

Then in the desktop app:
1. Open Orchestra
2. Click hub connection indicator
3. Connect to: `http://localhost:8000`

**Tip:** Add to `~/.ssh/config` for convenience:
```
Host orchestra
    HostName YOUR_DROPLET_IP
    User root
    LocalForward 8000 localhost:8000
    LocalForward 8001 localhost:8001
```
Then just run `ssh orchestra` to open the tunnel.

### Option: Nginx Reverse Proxy (Public Access)

For production with SSL:

```bash
sudo apt install nginx certbot python3-certbot-nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/orchestra
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/orchestra /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com
```

## 7. Maintenance

### Update Code

```bash
ssh orchestra@YOUR_DROPLET_IP
cd ~/orchestra
git pull origin main
cd hub
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart orchestra
```

### Database Backup

```bash
# Backup SQLite database
cp ~/orchestra/hub/orchestra.db ~/backups/orchestra-$(date +%Y%m%d).db
```

### Monitor Resources

```bash
htop
df -h
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs
sudo journalctl -u orchestra -n 50

# Check syntax
python -c "from app.main import app"
```

### Can't Connect from Frontend

1. Check firewall: `sudo ufw status`
2. Check service: `sudo systemctl status orchestra`
3. Test locally on VM: `curl http://localhost:8000/health`
4. Test remotely: `curl http://YOUR_IP:8000/health`

### Database Issues

```bash
# Reset database
rm orchestra.db
sudo systemctl restart orchestra
# Tables will be recreated on startup
```

## Quick Reference

| Command | Description |
|---------|-------------|
| `sudo systemctl start orchestra` | Start hub |
| `sudo systemctl stop orchestra` | Stop hub |
| `sudo systemctl restart orchestra` | Restart hub |
| `sudo systemctl status orchestra` | Check status |
| `sudo journalctl -u orchestra -f` | Follow logs |
| `source venv/bin/activate` | Activate venv |
