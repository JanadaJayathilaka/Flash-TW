/**
 * Flash-TW IBM i API Manager
 * 
 * Usage:
 *   node scripts/syncIbmUrl.js --get       -> Checks current URL and updates .env
 *   node scripts/syncIbmUrl.js --restart   -> Restarts Node.js server + Tunnelmole on PUB400, gets new URL, and updates .env
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');

const isRestart = process.argv.includes('--restart');
const envPath = path.join(__dirname, '..', '.env');

console.log(isRestart ? '🔄 Requesting PUB400 to restart IBM API & Tunnelmole...' : '🔍 Checking current IBM API URL on PUB400...');

const conn = new Client();

conn.on('ready', () => {
  const cmd = isRestart 
    ? 'cd /home/MEEGODA1/akila && ./restart.sh'
    : 'cat /home/MEEGODA1/akila/tmole.url 2>/dev/null';

  conn.exec(cmd, (err, stream) => {
    if (err) {
      console.error('❌ SSH Command Error:', err.message);
      conn.end();
      return;
    }

    let output = '';
    stream.on('data', d => {
      output += d.toString();
      if (isRestart) process.stdout.write(d.toString());
    });

    stream.on('close', () => {
      conn.end();

      // Extract URL
      const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.tunnelmole\.net/);
      if (!match) {
        console.error('\n⚠️ Could not find an active Tunnelmole URL in PUB400 output.');
        if (!isRestart) {
          console.log('💡 Tip: Try running with --restart to boot up the server: npm run ibm:restart');
        }
        return;
      }

      const activeUrl = match[0].trim();
      console.log(`\n✅ Active IBM i API URL: ${activeUrl}`);

      // Update .env file
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        if (envContent.includes('IBMI_API_URL=')) {
          envContent = envContent.replace(/IBMI_API_URL=.*/, `IBMI_API_URL=${activeUrl}`);
        } else {
          envContent += `\nIBMI_API_URL=${activeUrl}\n`;
        }
        fs.writeFileSync(envPath, envContent, 'utf8');
        console.log(`📝 Updated backend/.env successfully with: IBMI_API_URL=${activeUrl}`);
        console.log('⚡ Ready! If your backend is running, restart it (npm start) to use the updated URL.\n');
      }
    });
  });
}).on('error', err => {
  console.error('❌ Could not connect to PUB400 over SSH (port 2222):', err.message);
}).connect({
  host: 'pub400.com',
  port: 2222,
  username: 'MEEGODA1',
  password: 'akila2001',
  readyTimeout: 30000
});
