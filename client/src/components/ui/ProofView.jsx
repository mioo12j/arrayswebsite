import { useState } from 'react';
import { FileText, Loader2, Download, ExternalLink } from 'lucide-react';
import { api, apiError } from '../../api/client.js';
import { useToast } from './Toast.jsx';

// The document endpoint is auth-protected, so a plain <img src>/<a href> can't
// reach it (no Authorization header). We fetch the bytes with axios (which sends
// the JWT), turn them into a blob URL, and open/preview that. This is why stored
// proofs previously "wouldn't open".
export async function fetchDocBlobUrl(documentId) {
  const { data } = await api.get(`/documents/${documentId}/file?inline=1`, { responseType: 'blob' });
  return { url: URL.createObjectURL(data), type: data.type };
}

/**
 * A button that opens a stored proof/invoice document. Shows an inline image/PDF
 * preview in a lightbox for images & PDFs; downloads anything else.
 */
export default function ProofView({ documentId, name, label = 'View proof', className = '' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { url, type }

  if (!documentId) return null;

  const open = async () => {
    setBusy(true);
    try {
      const blob = await fetchDocBlobUrl(documentId);
      if (blob.type.startsWith('image/') || blob.type === 'application/pdf') {
        setPreview(blob);
      } else {
        // Non-previewable → trigger a download.
        const a = document.createElement('a');
        a.href = blob.url; a.download = name || 'document'; a.click();
        setTimeout(() => URL.revokeObjectURL(blob.url), 4000);
      }
    } catch (err) {
      toast.error(apiError(err) || 'Could not open the file');
    } finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" className={`btn-ghost ${className}`} onClick={open} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" size={14} /> : <FileText size={14} />} {label}
      </button>

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}>
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
              <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{name || 'Document'}</p>
              <div className="flex items-center gap-2">
                <a className="btn-ghost !py-1 !px-2 !text-xs" href={preview.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> New tab</a>
                <a className="btn-ghost !py-1 !px-2 !text-xs" href={preview.url} download={name || 'document'}><Download size={13} /> Save</a>
                <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}>Close</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-950">
              {preview.type === 'application/pdf'
                ? <iframe title={name || 'document'} src={preview.url} className="h-[75vh] w-full" />
                : <img src={preview.url} alt={name || 'document'} className="mx-auto max-h-[80vh] w-auto" />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
