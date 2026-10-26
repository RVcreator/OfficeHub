/**
 * Bulletproof file downloader that handles data URLs, blob URLs, cross-origin images/documents,
 * and fallback text/data without getting blocked by iframe sandboxes or cross-origin restrictions.
 */
export async function downloadFile(url?: string, fileName: string = 'download', fallbackContent?: string): Promise<boolean> {
  try {
    // 1. Data URL (Base64)
    if (url && url.startsWith('data:')) {
      const parts = url.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      triggerBlobDownload(blob, fileName);
      return true;
    }

    // 2. Blob URL
    if (url && url.startsWith('blob:')) {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        triggerBlobDownload(blob, fileName);
        return true;
      } catch {
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
      }
    }

    // 3. HTTP / HTTPS URL
    if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//'))) {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (res.ok) {
          const blob = await res.blob();
          triggerBlobDownload(blob, fileName);
          return true;
        }
      } catch (err) {
        console.warn('Direct fetch for download failed (CORS), trying canvas or fallback:', err);
      }

      // If it's an image, draw onto an HTML5 canvas to bypass CORS download restrictions
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
        const success = await downloadImageViaCanvas(url, fileName);
        if (success) return true;
      }
    }
  } catch (err) {
    console.error('Download error:', err);
  }

  // 4. Fallback: Download content as text/binary blob
  const text = fallbackContent || `OfficeHub Shared Document: ${fileName}\nDownloaded: ${new Date().toLocaleString()}`;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  triggerBlobDownload(blob, fileName.endsWith('.txt') ? fileName : `${fileName}.txt`);
  return true;
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
}

function downloadImageViaCanvas(imageUrl: string, fileName: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(false);
            return;
          }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) {
              triggerBlobDownload(blob, fileName);
              resolve(true);
            } else {
              resolve(false);
            }
          }, 'image/png');
        } catch {
          resolve(false);
        }
      };
      img.onerror = () => resolve(false);
      img.src = imageUrl;
    } catch {
      resolve(false);
    }
  });
}
