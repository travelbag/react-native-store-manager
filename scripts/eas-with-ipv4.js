#!/usr/bin/env node
/**
 * Windows/Jio (and some ISPs) fail Node DNS for api.expo.dev on IPv6.
 * Force IPv4 before spawning eas-cli.
 */
const { spawn } = require('child_process');

const env = {
  ...process.env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, '--dns-result-order=ipv4first']
    .filter(Boolean)
    .join(' '),
};

const child = spawn('eas', process.argv.slice(2), {
  stdio: 'inherit',
  shell: true,
  env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
