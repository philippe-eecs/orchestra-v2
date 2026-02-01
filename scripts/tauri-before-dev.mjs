import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';

const port = 1420;
const hosts = ['127.0.0.1', '::1'];

function tryConnect(host, portToCheck) {
  return new Promise((resolve) => {
    const socket = net.connect({
      host,
      port: portToCheck,
      family: host.includes(':') ? 6 : 4,
    });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function isPortOpen(portToCheck) {
  const results = await Promise.all(hosts.map((h) => tryConnect(h, portToCheck)));
  return results.some(Boolean);
}

function tryHttpGet(hostname, portToCheck) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname,
        family: hostname.includes(':') ? 6 : 4,
        port: portToCheck,
        path: '/@vite/client',
        timeout: 800,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function looksLikeViteDevServer(portToCheck) {
  const results = await Promise.all(hosts.map((h) => tryHttpGet(h, portToCheck)));
  return results.some(Boolean);
}

const portInUse = await isPortOpen(port);
if (portInUse) {
  const isVite = await looksLikeViteDevServer(port);
  if (isVite) {
    // If a dev server is already running (common when switching terminals),
    // don't fail `tauri dev` by trying to start a second one.
    console.log(
      `[tauri-before-dev] Port ${port} already in use by Vite; skipping dev server start.`,
    );
    process.exit(0);
  }

  console.error(
    `[tauri-before-dev] Port ${port} is already in use by a non-Vite process. Stop it and retry.`,
  );
  process.exit(1);
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npmCmd, ['run', 'dev'], {
  stdio: 'inherit',
  env: process.env,
});

const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
