#!/usr/bin/env node
/**
 * Frees a TCP port before Metro starts.
 *
 * A half-exited Metro can keep the IPv4 socket while a new instance only binds
 * IPv6. Devices then reach the stale process and the dev client fails to load
 * the manifest, so the port must be empty before starting.
 */
const { execSync } = require('child_process');

const port = Number(process.argv[2] || 8081);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`[free-port] Invalid port: ${process.argv[2]}`);
  process.exit(1);
}

function run(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

function findPidsWindows() {
  const output = run(`netstat -ano -p TCP | findstr LISTENING | findstr :${port}`);
  const pids = new Set();

  output
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => {
      const columns = line.trim().split(/\s+/);
      const localAddress = columns[1] || '';
      const pid = columns[columns.length - 1];

      // Guard against matching 18081, 80810, or a remote address on the port.
      if (!localAddress.endsWith(`:${port}`)) return;
      if (/^\d+$/.test(pid) && pid !== '0') pids.add(pid);
    });

  return [...pids];
}

function findPidsUnix() {
  const output = run(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`);
  return [...new Set(output.split(/\r?\n/).filter((pid) => /^\d+$/.test(pid)))];
}

const isWindows = process.platform === 'win32';
const pids = isWindows ? findPidsWindows() : findPidsUnix();

if (pids.length === 0) {
  console.log(`[free-port] Port ${port} is free.`);
  process.exit(0);
}

pids.forEach((pid) => {
  if (Number(pid) === process.pid) return;
  run(isWindows ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`);
  console.log(`[free-port] Stopped stale listener on port ${port} (pid ${pid}).`);
});
