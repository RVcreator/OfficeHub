// Microsoft owns file state. Never infer an item identity from a filename or URL.
export class DocumentActionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function graphDocumentRequest(fetcher: typeof fetch, token: string, path: string, init: RequestInit = {}) {
  try {
    return await fetcher(`https://graph.microsoft.com/v1.0/${path}`, { ...init,
      signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  } catch { throw new DocumentActionError(504, 'Microsoft did not respond. The document has been kept; retry to reconcile.'); }
}
export async function inspectMicrosoftFile(fetcher: typeof fetch, token: string, drive: string, item: string) {
  const base = `drives/${encodeURIComponent(drive)}`;
  const driveResponse = await graphDocumentRequest(fetcher, token, `${base}?$select=id`);
  if (!driveResponse.ok) throw new DocumentActionError(502, 'Microsoft drive access could not be verified. The document has been kept.');
  if ((await driveResponse.json()).id !== drive) throw new DocumentActionError(409, 'Microsoft drive identity could not be verified.');
  const response = await graphDocumentRequest(fetcher, token, `${base}/items/${encodeURIComponent(item)}?$select=id,name,eTag,file,folder,parentReference,webUrl,lastModifiedDateTime,size,deleted`);
  if (response.status === 404) return null;
  if (!response.ok) throw new DocumentActionError(response.status === 429 ? 429 : 502, `Microsoft could not confirm this file (${response.status}). Retry later; the document has been kept.`);
  const file = await response.json();
  if (file.id !== item || !file.file || file.folder || file.deleted || (file.parentReference?.driveId && file.parentReference.driveId !== drive))
    throw new DocumentActionError(409, 'Microsoft file identity could not be verified. No deletion was performed.');
  return file;
}
export async function recycleMicrosoftFile(fetcher: typeof fetch, token: string, drive: string, item: string) {
  if (!item) throw new DocumentActionError(409, 'This older record has no confirmed Microsoft file ID. An administrator must reconcile it in SharePoint.');
  const file = await inspectMicrosoftFile(fetcher, token, drive, item);
  if (!file) return; // Idempotent retry after Microsoft succeeded but OfficeHub did not.
  if (!file.eTag) throw new DocumentActionError(409, 'Microsoft did not return a file version. Retry after checking SharePoint.');
  const response = await graphDocumentRequest(fetcher, token, `drives/${encodeURIComponent(drive)}/items/${encodeURIComponent(item)}`, {
    method: 'DELETE', headers: { 'If-Match': file.eTag } });
  if (response.status !== 204 && response.status !== 404)
    throw new DocumentActionError(response.status === 429 ? 429 : 409, `Microsoft did not confirm deletion (${response.status}). The document has been kept; refresh and retry.`);
}
export async function deleteConfirmedDocument(deps: { prepare: () => Promise<void>; recycle: () => Promise<void>; finish: () => Promise<void> }) {
  await deps.prepare();
  await deps.recycle();
  await deps.finish(); // Do not tell the app to remove the record until both systems confirm.
}
export function folderSegment(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200 || /[\\/"*:<>?|#%]/.test(value) || value.trim() === '.' || value.includes('..') || /[. ]$/.test(value))
    throw new DocumentActionError(400, 'Use a single folder name without slashes or special characters.');
  return value.trim();
}
export async function createMicrosoftFolder(fetcher: typeof fetch, token: string, drive: string, input: unknown) {
  const name = folderSegment(input), base = `drives/${encodeURIComponent(drive)}`;
  let response = await graphDocumentRequest(fetcher, token, `${base}/root/children`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }) });
  if (response.status === 409) response = await graphDocumentRequest(fetcher, token, `${base}/root:/${encodeURIComponent(name)}?$select=id,name,folder`);
  if (!response.ok) throw new DocumentActionError(502, 'Microsoft could not create or verify the folder.');
  const folder = await response.json();
  if (!folder.id || !folder.folder || folder.name !== name) throw new DocumentActionError(409, 'A different Microsoft item already uses this folder name.');
  return folder;
}
