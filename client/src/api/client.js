import axios from 'axios';
import { chooseDownloadLanguage, isTranslatableDownload, withLang } from '../lib/langPrompt.js';

const baseURL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({ baseURL });

// Attach the JWT (and the active GST branch context) on every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('epc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const branch = localStorage.getItem('gst_branch');
  if (branch && branch !== 'all') config.headers['x-gst-branch'] = branch;
  return config;
});

// Global 401 handling -> bounce to login.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !location.pathname.startsWith('/login')) {
      localStorage.removeItem('epc_token');
      localStorage.removeItem('epc_user');
      location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const apiError = (err) =>
  err?.response?.data?.error || err?.message || 'Something went wrong';

// The current signed-in user (read from localStorage; no React needed).
export function currentUser() {
  try { return JSON.parse(localStorage.getItem('epc_user') || 'null'); } catch { return null; }
}

// Admin is a strict view-only account — it cannot export or download anything.
// Returns true (and shows a toast) when the action must be blocked.
export function blockExportForAdmin() {
  if (currentUser()?.role === 'admin') {
    window.dispatchEvent(new CustomEvent('app:toast', {
      detail: { message: 'The Admin account is view-only — exporting and downloading are disabled.', type: 'error' },
    }));
    return true;
  }
  return false;
}

/**
 * Downloads a file from an authenticated API endpoint (sends the JWT header,
 * which a plain <a href> navigation cannot). Triggers a browser save dialog.
 */
export async function download(path) {
  if (blockExportForAdmin()) return;
  if (isTranslatableDownload(path)) {
    const lang = await chooseDownloadLanguage(); // English / हिन्दी popup
    if (lang === null) return;                    // user cancelled
    path = withLang(path, lang);
  }
  const { data, headers } = await api.get(path, { responseType: 'blob' });
  const disposition = headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : 'report';
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
