// ============================================================================
//  Software self-update (code only — never touches the local database).
//
//  Each install is a git clone tracking a release branch (default: main). The
//  commit SHA is the "version reference". getStatus() compares the local HEAD
//  with the latest SHA on the remote branch; if they differ, an update is
//  available. apply() (see system.routes) backs up first, then launches a
//  DETACHED updater script that pulls the new code, reinstalls, rebuilds, runs
//  the (idempotent) migrations and restarts the server — your data is preserved
//  and upgraded in place, never overwritten.
// ============================================================================
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
// server/src/services/updateService.js  ->  repo root is three levels up.
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const RELEASE_BRANCH = process.env.UPDATE_BRANCH || 'main';

async function git(args, timeout = 20000) {
  const { stdout } = await execFileP('git', args, { cwd: REPO_ROOT, timeout, windowsHide: true });
  return stdout.trim();
}

// Read-only: what version am I on, and is a newer one published?
export async function getStatus() {
  let current, branch;
  try {
    current = await git(['rev-parse', 'HEAD']);
    branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '');
  } catch (e) {
    return { ok: false, gitAvailable: false, message: 'Git or the code repository is not available on this machine, so automatic updates are off.', error: e.message };
  }
  let latest = '';
  try {
    const out = await git(['ls-remote', 'origin', '-h', `refs/heads/${RELEASE_BRANCH}`]);
    latest = (out.split(/\s+/)[0] || '').trim();
  } catch {
    return { ok: true, gitAvailable: true, online: false, current, currentShort: current.slice(0, 7), branch, trackedBranch: RELEASE_BRANCH, behind: false, message: 'Could not reach GitHub — check the internet connection, then try again.' };
  }
  const behind = !!latest && latest !== current;
  return {
    ok: true, gitAvailable: true, online: true,
    current, currentShort: current.slice(0, 7),
    latest, latestShort: latest.slice(0, 7),
    branch, trackedBranch: RELEASE_BRANCH, behind,
  };
}

// Launch the detached updater. It outlives this process so it can restart it.
export function startSelfUpdate() {
  const script = path.join(REPO_ROOT, 'server', 'scripts', 'self-update.mjs');
  const child = spawn(process.execPath, [script, String(process.pid)], {
    cwd: REPO_ROOT, detached: true, stdio: 'ignore', windowsHide: true,
    env: { ...process.env },
  });
  child.unref();
  return true;
}
