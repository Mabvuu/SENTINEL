const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
let configured = process.argv[2];
if (!configured) {
  let ip;
  if (process.platform === 'darwin') {
    try {
      const route = execFileSync('/sbin/route', ['-n', 'get', 'default'], {encoding:'utf8'});
      const iface = route.match(/interface:\s*(\S+)/)?.[1];
      if (iface) ip = execFileSync('/usr/sbin/ipconfig', ['getifaddr', iface], {encoding:'utf8'}).trim();
    } catch {}
  }
  if (!ip) {
    ip = Object.values(os.networkInterfaces()).flat().find(x => x && x.family === 'IPv4' && !x.internal)?.address;
  }
  if (!ip) throw new Error('Connect the Mac and phone to the same Wi-Fi, then retry.');
  configured = `http://${ip}:8000`;
}
const url = new URL(configured);
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
  throw new Error('Use the backend HTTP(S) address only, without credentials or query parameters.');
}
const file = '.env.local';
let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
if (content) fs.copyFileSync(file, `${file}.backup-${Date.now()}`);
content = content.split('\n').filter(line => !/^\s*EXPO_PUBLIC_API_URL\s*=/.test(line)).join('\n').trimEnd();
fs.writeFileSync(file, content + '\nEXPO_PUBLIC_API_URL=' + url.origin + '\n', {mode:0o600});
console.log('Phone backend configured: ' + url.origin);
console.log('Open this on the phone to check the connection: ' + url.origin + '/api/health/');
console.log('The backend must listen on 0.0.0.0:8000 and allow host ' + url.hostname + '.');
