// ============================================================================
//  Detached self-updater. Launched by updateService.startSelfUpdate() and runs
//  independently of the server so it can restart it.
//
//  Flow:  fetch -> reset to origin/<branch> -> npm install -> build -> migrate
//         -> stop old server -> start new server.
//  Safety: the server takes a backup BEFORE launching this; the local database
//  is never wiped (migrations are idempotent). If anything fails, it rolls the
//  code back to the previous commit and leaves the old version running.
//  Everything is written to server/update.log.
// ============================================================================
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'); // server/scripts -> repo root
const SERVER = path.join(REPO, 'server');
const CLIENT = path.join(REPO, 'client');
const LOG = path.join(SERVER, 'update.log');
const BRANCH = process.env.UPDATE_BRANCH || 'main';
const serverPid = process.argv[2];

const log = (m) => { try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${m}\n`); } catch { /* ignore */ } };
const run = (cmd, cwd) => {
  log(`$ ${cmd}   (cwd=${path.basename(cwd)})`);
  const out = execSync(cmd, { cwd, stdio: 'pipe', env: process.env }).toString();
  if (out.trim()) log(out.trim().split('\n').slice(-12).join('\n'));
  return out;
};

let oldSha = '';
try {
  log('=== self-update start ===');
  oldSha = run('git rev-parse HEAD', REPO).trim();
  log(`current ${oldSha.slice(0, 7)} -> updating to origin/${BRANCH}`);

  run(`git fetch origin ${BRANCH}`, REPO);
  run(`git reset --hard origin/${BRANCH}`, REPO);
  run('npm install --no-audit --no-fund', SERVER);
  run('npm install --no-audit --no-fund', CLIENT);
  run('npm run build', CLIENT);
  run('npm run migrate', SERVER);          // idempotent — data preserved & upgraded
  const newSha = run('git rev-parse HEAD', REPO).trim();
  log(`build + migrate OK — now on ${newSha.slice(0, 7)}. Restarting server...`);

  // Stop the old server (detached, so this updater survives), then relaunch.
  if (serverPid) {
    try {
      if (process.platform === 'win32') execSync(`taskkill /PID ${serverPid} /T /F`, { stdio: 'pipe' });
      else process.kill(Number(serverPid), 'SIGTERM');
      log(`stopped old server (pid ${serverPid})`);
    } catch (e) { log(`could not stop old server: ${e.message}`); }
  }
  // Give the OS a moment to release the port.
  execSync(process.platform === 'win32' ? 'ping -n 5 127.0.0.1 >NUL' : 'sleep 4', { stdio: 'ignore' });

  const child = spawn('npm', ['start'], { cwd: SERVER, detached: true, stdio: 'ignore', shell: true, windowsHide: true, env: process.env });
  child.unref();
  log('relaunched server (npm start). === self-update done ===');
  process.exit(0);
} catch (err) {
  log(`UPDATE FAILED: ${err.stack || err.message}`);
  // Roll the code back so the machine stays on the last working version.
  try {
    if (oldSha) { run(`git reset --hard ${oldSha}`, REPO); run('npm run build', CLIENT); log(`rolled back to ${oldSha.slice(0, 7)}`); }
  } catch (re) { log(`ROLLBACK FAILED: ${re.message}`); }
  log('The current (old) version is still running. === self-update aborted ===');
  process.exit(1);
}
