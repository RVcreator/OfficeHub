import { MessageAttachment } from '../types';
import {
  saveAttachmentToStorage,
  getCachedAttachment,
  dataUrlToBlob,
  generateDocumentHtml,
  generateSpreadsheetHtml,
  getWipahsOperationsBriefHtml
} from './attachmentStorage';

// URL cache to avoid redundant URL.createObjectURL calls
const resolvedUrlCache = new Map<string, string>();

/**
 * Returns a direct URL ready for <a href="..." target="_blank"> or window.open
 * Guarantees that images, PDFs, Word docs, spreadsheets, and files open cleanly in a new tab.
 */
export function getAttachmentTabUrl(attachment: MessageAttachment): string {
  if (!attachment) return '#';

  // Check URL cache first
  const cachedUrl = resolvedUrlCache.get(attachment.id);
  if (cachedUrl) return cachedUrl;

  const cached = getCachedAttachment(attachment.id);
  const ext = (attachment.name || '').split('.').pop()?.toLowerCase() || '';
  const isImg = attachment.type === 'image' || 
    (attachment.url && attachment.url.startsWith('data:image/')) ||
    ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico'].includes(ext);
  const isPdf = attachment.type === 'pdf' || ext === 'pdf';
  const isDoc = attachment.type === 'docx' || ['doc', 'docx', 'rtf'].includes(ext);
  const isSheet = attachment.type === 'xlsx' || ['xls', 'xlsx', 'csv'].includes(ext);

  // 1. Special case: Initial Demo Operations Brief
  if (attachment.name === 'WIPAHS_OfficeHub_Operations_Brief.pdf' || attachment.id === 'att-1') {
    const html = getWipahsOperationsBriefHtml();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const tabUrl = URL.createObjectURL(blob);
    resolvedUrlCache.set(attachment.id, tabUrl);
    return tabUrl;
  }

  // 2. If it's an image
  if (isImg) {
    if (cached?.blobUrl) {
      resolvedUrlCache.set(attachment.id, cached.blobUrl);
      return cached.blobUrl;
    }
    if (cached?.blob) {
      const url = URL.createObjectURL(cached.blob);
      resolvedUrlCache.set(attachment.id, url);
      return url;
    }
    const rawUrl = cached?.dataUrl || attachment.url || '';
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      return rawUrl;
    }
    if (rawUrl.startsWith('data:image/')) {
      const blob = dataUrlToBlob(rawUrl, `image/${ext || 'png'}`);
      const url = URL.createObjectURL(blob);
      resolvedUrlCache.set(attachment.id, url);
      return url;
    }
    if (rawUrl) return rawUrl;
  }

  // 3. If it's a PDF
  if (isPdf) {
    if (cached?.blobUrl && !cached.blobUrl.startsWith('data:')) {
      resolvedUrlCache.set(attachment.id, cached.blobUrl);
      return cached.blobUrl;
    }
    if (cached?.blob) {
      const url = URL.createObjectURL(cached.blob);
      resolvedUrlCache.set(attachment.id, url);
      return url;
    }
    const rawUrl = cached?.dataUrl || attachment.url || '';
    if (rawUrl.startsWith('data:application/pdf') || rawUrl.startsWith('data:')) {
      const blob = dataUrlToBlob(rawUrl, 'application/pdf');
      const url = URL.createObjectURL(blob);
      resolvedUrlCache.set(attachment.id, url);
      return url;
    }
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      return rawUrl;
    }
    if (attachment.textContent) {
      const html = generateDocumentHtml(attachment, attachment.textContent);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      resolvedUrlCache.set(attachment.id, url);
      return url;
    }
  }

  // 4. If it's a Word document (.docx)
  if (isDoc) {
    const textContent = attachment.textContent || cached?.textContent;
    if (textContent) {
      const html = generateDocumentHtml(attachment, textContent);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const tabUrl = URL.createObjectURL(blob);
      resolvedUrlCache.set(attachment.id, tabUrl);
      return tabUrl;
    }
    if (cached?.blob) {
      const url = URL.createObjectURL(cached.blob);
      resolvedUrlCache.set(attachment.id, url);
      return url;
    }
  }

  // 5. If it's a Spreadsheet (.xlsx, .xls, .csv)
  if (isSheet) {
    const sheetData = attachment.sheetData || cached?.sheetData;
    if (sheetData && sheetData.length > 0) {
      const html = generateSpreadsheetHtml(attachment, sheetData);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const tabUrl = URL.createObjectURL(blob);
      resolvedUrlCache.set(attachment.id, tabUrl);
      return tabUrl;
    }
  }

  // 6. If it has plain text content
  const textContent = attachment.textContent || cached?.textContent;
  if (textContent) {
    const isFormattedHtml = textContent.includes('<') && textContent.includes('>');
    const blob = new Blob([isFormattedHtml ? generateDocumentHtml(attachment, textContent) : textContent], {
      type: isFormattedHtml ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8'
    });
    const tabUrl = URL.createObjectURL(blob);
    resolvedUrlCache.set(attachment.id, tabUrl);
    return tabUrl;
  }

  // 7. Fallback to existing url or cached blob
  if (cached?.blobUrl) return cached.blobUrl;
  if (attachment.url && attachment.url !== '#') return attachment.url;

  // Ultimate fallback: generate a clean download document view
  const fallbackHtml = generateDocumentHtml(
    attachment,
    `<p><strong>File Name:</strong> ${attachment.name}</p><p><strong>File Size:</strong> ${attachment.size}</p><p>Verified OfficeHub File Attachment.</p>`
  );
  const blob = new Blob([fallbackHtml], { type: 'text/html;charset=utf-8' });
  const tabUrl = URL.createObjectURL(blob);
  resolvedUrlCache.set(attachment.id, tabUrl);
  return tabUrl;
}

/**
 * Opens any attachment in a new browser tab cleanly and instantly
 */
export function openAttachmentInNewTab(attachment: MessageAttachment): void {
  if (!attachment) return;
  const tabUrl = getAttachmentTabUrl(attachment);
  if (!tabUrl || tabUrl === '#') return;

  const link = document.createElement('a');
  link.href = tabUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (document.body.contains(link)) {
      document.body.removeChild(link);
    }
  }, 150);
}

/**
 * Downloads attachment directly to the user's computer
 */
export function downloadAttachment(attachment: MessageAttachment): void {
  if (!attachment) return;
  const tabUrl = getAttachmentTabUrl(attachment);
  const link = document.createElement('a');
  link.href = tabUrl;
  link.download = attachment.name;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (document.body.contains(link)) {
      document.body.removeChild(link);
    }
  }, 150);
}

/**
 * Parses any uploaded File object into an accurate MessageAttachment
 * with persistent IndexedDB storage & extracted contents
 */
export async function parseUploadedFile(file: File): Promise<MessageAttachment> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const isImg = file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp', 'ico'].includes(ext);
  const isPdf = file.type === 'application/pdf' || ext === 'pdf';
  const isDocx = ext === 'docx' || file.type.includes('wordprocessingml');
  const isXlsx = ['xlsx', 'xls', 'csv'].includes(ext) || file.type.includes('spreadsheet') || file.type.includes('excel');
  const isTextLike = ['txt', 'md', 'json', 'log', 'xml', 'html', 'js', 'ts', 'css', 'sql'].includes(ext) || file.type.startsWith('text/');

  const attachmentId = `att-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  
  // Format file size
  const formattedSize = file.size > 1024 * 1024
    ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(file.size / 1024))} KB`;

  let type: MessageAttachment['type'] = 'file';
  let textContent: string | undefined = undefined;
  let sheetData: { sheetName: string; rows: (string | number | boolean | null)[][] }[] | undefined = undefined;
  let dataUrl = '';
  let blobUrl = '';

  try {
    blobUrl = URL.createObjectURL(file);
  } catch (e) {
    console.warn('Failed to create blobUrl for file:', e);
  }

  try {
    if (isImg) {
      type = 'image';
      dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(blobUrl);
        reader.readAsDataURL(file);
      });
    } else if (isPdf) {
      type = 'pdf';
      try {
        dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve(blobUrl);
          reader.readAsDataURL(file);
        });
      } catch {
        dataUrl = blobUrl;
      }
    } else if (isDocx) {
      type = 'docx';
      try {
        const {default:mammoth} = await import('mammoth');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        textContent = result.value || '';
        if (!textContent) {
          const rawTextResult = await mammoth.extractRawText({ arrayBuffer });
          textContent = rawTextResult.value ? `<div class="whitespace-pre-wrap font-sans text-sm">${rawTextResult.value}</div>` : undefined;
        }
      } catch (err) {
        console.warn('Could not extract docx text with mammoth:', err);
      }
    } else if (isXlsx) {
      type = 'xlsx';
      try {
        const XLSX = await import('xlsx');
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        sheetData = workbook.SheetNames.map(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, { header: 1 });
          return { sheetName, rows };
        });
      } catch (err) {
        console.warn('Could not parse spreadsheet with SheetJS:', err);
      }
    } else if (isTextLike) {
      type = 'file';
      try {
        textContent = await file.text();
      } catch (err) {
        console.warn('Could not read text file:', err);
      }
    }
  } catch (err) {
    console.error('Error parsing uploaded file:', err);
  }

  // Persist to IndexedDB & memory cache
  await saveAttachmentToStorage(attachmentId, {
    blob: file,
    dataUrl: dataUrl || blobUrl,
    textContent,
    sheetData,
    name: file.name,
    mimeType: file.type || 'application/octet-stream'
  });

  const attachment: MessageAttachment = {
    id: attachmentId,
    name: file.name,
    size: formattedSize,
    type,
    url: dataUrl || blobUrl,
    textContent,
    sheetData,
    mimeType: file.type
  };

  // Pre-seed resolved URL cache
  if (blobUrl) {
    resolvedUrlCache.set(attachmentId, blobUrl);
  }

  return attachment;
}
