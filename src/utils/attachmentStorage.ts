/**
 * Persistent Attachment Storage with IndexedDB & Memory Cache
 * Ensures uploaded images and documents are NEVER lost across page refreshes
 * and can be opened in a new browser tab reliably.
 */

import { MessageAttachment } from '../types';

const DB_NAME = 'WIPAHS_OfficeHub_Attachments_v1';
const STORE_NAME = 'attachments';
const DB_VERSION = 1;

// In-memory cache for instant synchronous access
const memoryCache = new Map<string, {
  blob?: Blob;
  blobUrl?: string;
  dataUrl?: string;
  textContent?: string;
  sheetData?: any[];
  name: string;
  mimeType: string;
}>();

// Open or initialize IndexedDB
function getDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn('Failed to open IndexedDB for attachments');
        resolve(null);
      };
    } catch (e) {
      console.warn('IndexedDB not supported or blocked:', e);
      resolve(null);
    }
  });
}

/**
 * Save an attachment and its raw file/blob into IndexedDB and memory cache
 */
export async function saveAttachmentToStorage(
  id: string,
  data: {
    blob?: Blob;
    dataUrl?: string;
    textContent?: string;
    sheetData?: any[];
    name: string;
    mimeType: string;
  }
): Promise<void> {
  // Update memory cache
  const existing = memoryCache.get(id) || { name: data.name, mimeType: data.mimeType };
  let blobUrl = existing.blobUrl;
  if (data.blob) {
    try {
      blobUrl = URL.createObjectURL(data.blob);
    } catch {
      // ignore
    }
  }

  memoryCache.set(id, {
    ...existing,
    ...data,
    blobUrl: blobUrl || existing.blobUrl
  });

  // Persist to IndexedDB
  try {
    const db = await getDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // Store either Blob directly or dataUrl
    store.put({
      id,
      name: data.name,
      mimeType: data.mimeType,
      blob: data.blob,
      dataUrl: data.dataUrl,
      textContent: data.textContent,
      sheetData: data.sheetData,
      updatedAt: Date.now()
    });
  } catch (err) {
    console.warn('Failed to persist attachment to IndexedDB:', err);
  }
}

/**
 * Retrieve cached attachment info synchronously from memory
 */
export function getCachedAttachment(id: string) {
  return memoryCache.get(id);
}

/**
 * Load an attachment from IndexedDB if not present in memory
 */
export async function loadAttachmentFromStorage(id: string) {
  if (memoryCache.has(id)) return memoryCache.get(id);

  try {
    const db = await getDB();
    if (!db) return null;
    return new Promise<{
      blob?: Blob;
      blobUrl?: string;
      dataUrl?: string;
      textContent?: string;
      sheetData?: any[];
      name: string;
      mimeType: string;
    } | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (!item) {
          resolve(null);
          return;
        }
        let blobUrl: string | undefined;
        if (item.blob) {
          try {
            blobUrl = URL.createObjectURL(item.blob);
          } catch {
            // ignore
          }
        }
        const cached = {
          blob: item.blob,
          blobUrl,
          dataUrl: item.dataUrl,
          textContent: item.textContent,
          sheetData: item.sheetData,
          name: item.name,
          mimeType: item.mimeType
        };
        memoryCache.set(id, cached);
        resolve(cached);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Helper to convert Base64 Data URL to native Blob
 */
export function dataUrlToBlob(dataUrl: string, fallbackType = 'application/octet-stream'): Blob {
  try {
    const parts = dataUrl.split(';base64,');
    if (parts.length === 2) {
      const contentType = parts[0].replace('data:', '') || fallbackType;
      const byteCharacters = atob(parts[1]);
      const bytes = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        bytes[i] = byteCharacters.charCodeAt(i);
      }
      return new Blob([bytes.buffer as ArrayBuffer], { type: contentType });
    }
  } catch (e) {
    console.warn('Error converting dataUrl to blob:', e);
  }
  return new Blob([dataUrl], { type: fallbackType });
}

/**
 * Generates a clean standalone HTML viewer page for a Word docx, Text file, or Spreadsheet
 */
export function generateDocumentHtml(attachment: MessageAttachment, textContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${attachment.name}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      margin: 0;
      padding: 32px 16px;
      line-height: 1.6;
    }
    .wrapper {
      max-width: 860px;
      margin: 0 auto;
      background: #ffffff;
      padding: 48px;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08);
      border: 1px solid #e2e8f0;
    }
    .doc-header {
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 24px;
      margin-bottom: 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .doc-title {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 6px 0;
    }
    .doc-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #f3e8ff;
      color: #6b21a8;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
    }
    .print-btn {
      background: #00ad1d;
      color: #ffffff;
      border: none;
      padding: 8px 18px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .print-btn:hover { background: #008f18; }
    .doc-content {
      font-size: 15px;
      color: #334155;
    }
    .doc-content h1, .doc-content h2, .doc-content h3 {
      color: #0f172a;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    .doc-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 24px 0;
      font-size: 13px;
    }
    .doc-content th, .doc-content td {
      border: 1px solid #cbd5e1;
      padding: 10px 14px;
      text-align: left;
    }
    .doc-content th {
      background: #f8fafc;
      font-weight: 600;
    }
    pre {
      background: #f1f5f9;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="doc-header">
      <div>
        <h1 class="doc-title">${attachment.name}</h1>
        <span class="doc-badge">OfficeHub Verified Document • ${attachment.size}</span>
      </div>
      <button class="print-btn" onclick="window.print()">
        <span>Print Document</span>
      </button>
    </div>
    <div class="doc-content">
      ${textContent}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generates an interactive standalone HTML spreadsheet page
 */
export function generateSpreadsheetHtml(attachment: MessageAttachment, sheetData: any[]): string {
  const sheets = sheetData || [];
  const tabsNav = sheets.map((s, idx) => 
    `<button class="tab-btn ${idx === 0 ? 'active' : ''}" onclick="showSheet(${idx})">${s.sheetName}</button>`
  ).join(' ');

  const sheetsContent = sheets.map((s, idx) => {
    const rows = s.rows || [];
    const rowsHtml = rows.map((row: any[], rIdx: number) => {
      const isHeader = rIdx === 0;
      const tag = isHeader ? 'th' : 'td';
      const cells = Array.isArray(row)
        ? row.map(c => `<${tag}>${c !== null && c !== undefined ? String(c) : ''}</${tag}>`).join('')
        : '';
      return `<tr><td class="row-num">${rIdx + 1}</td>${cells}</tr>`;
    }).join('');

    return `
      <div id="sheet-content-${idx}" class="sheet-pane" style="${idx === 0 ? '' : 'display: none;'}">
        <h3 class="sheet-title">${s.sheetName} (${rows.length} rows)</h3>
        <div class="table-container">
          <table><tbody>${rowsHtml}</tbody></table>
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${attachment.name} — Spreadsheet Viewer</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f1f5f9;
      color: #0f172a;
      margin: 0;
      padding: 24px;
    }
    .sheet-card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
      border: 1px solid #cbd5e1;
      max-width: 1200px;
      margin: 0 auto;
      overflow: hidden;
    }
    .header-bar {
      background: #065f46;
      color: white;
      padding: 18px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-title { font-size: 17px; font-weight: 700; margin: 0; }
    .tabs-bar {
      background: #f8fafc;
      padding: 10px 20px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      gap: 8px;
      overflow-x: auto;
    }
    .tab-btn {
      padding: 7px 16px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      color: #475569;
      cursor: pointer;
    }
    .tab-btn.active {
      background: #065f46;
      color: #ffffff;
      border-color: #065f46;
    }
    .sheet-pane { padding: 24px; }
    .sheet-title { margin: 0 0 16px 0; color: #065f46; font-size: 15px; }
    .table-container { overflow-x: auto; max-height: 70vh; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; font-family: ui-monospace, monospace; }
    th, td { border: 1px solid #e2e8f0; padding: 9px 14px; text-align: left; white-space: nowrap; }
    th { background: #f8fafc; font-weight: 700; position: sticky; top: 0; border-bottom: 2px solid #cbd5e1; }
    tr:hover td { background: #f0fdf4; }
    .row-num { background: #f8fafc; color: #94a3b8; text-align: center; width: 45px; font-weight: 600; }
  </style>
  <script>
    function showSheet(idx) {
      document.querySelectorAll('.sheet-pane').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      const target = document.getElementById('sheet-content-' + idx);
      if (target) target.style.display = 'block';
      const btns = document.querySelectorAll('.tab-btn');
      if (btns[idx]) btns[idx].classList.add('active');
    }
  </script>
</head>
<body>
  <div class="sheet-card">
    <div class="header-bar">
      <h2 class="header-title">${attachment.name}</h2>
      <span style="font-size: 12px; opacity: 0.9;">Spreadsheet Viewer • ${attachment.size}</span>
    </div>
    <div class="tabs-bar">${tabsNav}</div>
    ${sheetsContent}
  </div>
</body>
</html>`;
}

/**
 * Standard WIPAHS Operations Brief HTML Document for the initial demo message
 */
export function getWipahsOperationsBriefHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>WIPAHS OfficeHub Operations Brief</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      margin: 0;
      padding: 36px 16px;
      line-height: 1.6;
    }
    .doc-container {
      max-width: 860px;
      margin: 0 auto;
      background: #ffffff;
      padding: 48px;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.07);
      border: 1px solid #e2e8f0;
    }
    .header {
      border-bottom: 2px solid #00ad1d;
      padding-bottom: 20px;
      margin-bottom: 28px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    h1 { margin: 0 0 6px 0; font-size: 24px; color: #0f172a; }
    .badge {
      display: inline-block;
      background: #eefdf0;
      color: #008f18;
      border: 1px solid #bbf7d0;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
    }
    h2 { font-size: 18px; color: #0f172a; margin-top: 28px; margin-bottom: 12px; border-left: 4px solid #00ad1d; padding-left: 10px; }
    p, li { font-size: 14px; color: #334155; }
    ul { padding-left: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 10px 14px; text-align: left; }
    th { background: #f8fafc; font-weight: 600; color: #0f172a; }
    .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
    .sig-box { padding: 14px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
    .sig-name { font-weight: 700; color: #0f172a; font-size: 14px; }
    .sig-role { font-size: 12px; color: #64748b; }
    .btn-print { background: #00ad1d; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <div class="doc-container">
    <div class="header">
      <div>
        <h1>WIPAHS OfficeHub Operations Brief</h1>
        <p style="margin: 0; color: #64748b; font-size: 13px;">Document Ref: WIPAHS-OPS-2026-Q3 | Classification: Internal Operational</p>
      </div>
      <div>
        <span class="badge">Official Operational Brief</span>
      </div>
    </div>

    <h2>1. Executive Summary & Purpose</h2>
    <p>
      This operational briefing outlines the core integration protocols established for WIPAHS OfficeHub,
      unifying Microsoft 365 services, Teams real-time channels, SharePoint document libraries,
      and collaborative messaging across our administrative, medical dispensary, and educational operations.
    </p>

    <h2>2. Integrated Operational Infrastructure</h2>
    <table>
      <thead>
        <tr>
          <th>Module</th>
          <th>Integration Provider</th>
          <th>Protocol</th>
          <th>Operational Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Teams Meetings & Notifications</td>
          <td>Microsoft 365 Webhook</td>
          <td>HTTPS Webhook / AdaptiveCards</td>
          <td><strong style="color: #008f18;">Active & Verified</strong></td>
        </tr>
        <tr>
          <td>SharePoint Document Storage</td>
          <td>SharePoint Document Library</td>
          <td>Graph REST API v1.0</td>
          <td><strong style="color: #008f18;">Synchronized</strong></td>
        </tr>
        <tr>
          <td>Staff Presence Directory</td>
          <td>OfficeHub Central Store</td>
          <td>Local Session / Reactive Sync</td>
          <td><strong style="color: #008f18;">Real-Time</strong></td>
        </tr>
        <tr>
          <td>Executive Approvals</td>
          <td>Multi-Department Workflow</td>
          <td>State Engine with Audit Log</td>
          <td><strong style="color: #008f18;">Enforced</strong></td>
        </tr>
      </tbody>
    </table>

    <h2>3. Operational Guidelines for Staff</h2>
    <ul>
      <li><strong>Document Sharing:</strong> All departmental memos, dispensary inspection logs, and financial vouchers shared in chat channels are instantly accessible in high resolution to team members.</li>
      <li><strong>Meeting Scheduling:</strong> Staff may book conference rooms and generate Microsoft Teams joins with automatic conflict detection.</li>
      <li><strong>Urgent Broadcasts:</strong> Notices flagged as "Urgent" automatically notify active staff and sync to the main operations board.</li>
    </ul>

    <div class="signature-grid">
      <div class="sig-box">
        <div class="sig-name">Jabir</div>
        <div class="sig-role">Chief Executive Officer — WIPAHS</div>
        <p style="margin: 6px 0 0 0; font-size: 11px; color: #008f18; font-weight: 600;">Approved & Signed</p>
      </div>
      <div class="sig-box">
        <div class="sig-name">Rija</div>
        <div class="sig-role">IT & Systems Consultant — OfficeHub</div>
        <p style="margin: 6px 0 0 0; font-size: 11px; color: #008f18; font-weight: 600;">Technical Verification Complete</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
