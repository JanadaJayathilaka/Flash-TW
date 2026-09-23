const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');

const localScriptPath = path.join(__dirname, 'start_all.sh');
let scriptContent = fs.readFileSync(localScriptPath, 'utf8');

// Ensure UNIX line endings (LF instead of CRLF) for IBM i PASE shell
scriptContent = scriptContent.replace(/\r\n/g, '\n');

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected to PUB400 over SSH.');
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP error:', err);
      conn.end();
      return;
    }

    const stream = sftp.createWriteStream('/home/MEEGODA1/akila/start_all.sh');
    stream.on('close', () => {
      console.log('✅ Successfully uploaded /home/MEEGODA1/akila/start_all.sh to PUB400!');
      
      // Make executable and display contents
      conn.exec('chmod +x /home/MEEGODA1/akila/start_all.sh && cat /home/MEEGODA1/akila/start_all.sh', (err2, str) => {
        str.on('data', d => process.stdout.write(d.toString()));
        str.on('close', () => {
          // Launch start_all.sh in background on PUB400
          console.log('\n🚀 Starting PUB400 services via ./start_all.sh...');
          conn.exec('cd /home/MEEGODA1/akila && nohup ./start_all.sh > start_all.log 2>&1 &', (err3, str2) => {
            str2.on('close', () => {
              console.log('✅ start_all.sh is now running in the background on PUB400!');
              conn.end();
            });
          });
        });
      });
    });

    stream.write(scriptContent);
    stream.end();
  });
}).on('error', err => {
  console.error('Connection error:', err);
}).connect({
  host: 'pub400.com',
  port: 2222,
  username: 'MEEGODA1',
  password: 'akila2001'
});
