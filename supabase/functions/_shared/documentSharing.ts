export type ShareRecipient = { id: string; email: string; role: 'read' | 'write' };
export type ShareSettings = { visibility: string; targetDepartment?: string; allowedUserIds: string[]; editableUserIds: string[] };
export function documentAudience(settings: ShareSettings, profiles: Array<{ id: string; department?: string }>, owner: string) {
  if (!['Everyone', 'Department', 'Specific People'].includes(settings.visibility)) throw new Error('Invalid document audience');
  if (settings.visibility === 'Department' && !settings.targetDepartment?.trim()) throw new Error('Select a department');
  const known = new Set(profiles.map(p => p.id));
  for (const id of [...settings.allowedUserIds, ...settings.editableUserIds]) if (!known.has(id)) throw new Error('Select existing staff accounts');
  const viewers = new Set(profiles.filter(p => settings.visibility === 'Everyone'
    || (settings.visibility === 'Department' && p.department?.trim().toLowerCase() === settings.targetDepartment?.trim().toLowerCase())
    || (settings.visibility === 'Specific People' && settings.allowedUserIds.includes(p.id))).map(p => p.id));
  viewers.add(owner);
  for (const id of settings.editableUserIds) if (!viewers.has(id)) throw new Error('Editors must also have viewing access');
  return Array.from(viewers).map(id => ({ id, role: id === owner || settings.editableUserIds.includes(id) ? 'write' as const : 'read' as const }));
}
export async function grantDocumentAccess(fetcher: typeof fetch, token: string, driveId: string, itemId: string, recipient: ShareRecipient): Promise<string> {
  const response = await fetcher(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/invite`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipients: [{ email: recipient.email }], requireSignIn: true,
      sendInvitation: false, retainInheritedPermissions: true, roles: [recipient.role] }) });
  const result = await response.json();
  if (response.status !== 200 || !Array.isArray(result.value) || result.value.length !== 1
    || result.value[0].error || !result.value[0].id || !result.value[0].roles?.includes(recipient.role)) {
    throw new Error(`Microsoft did not confirm ${recipient.role} access (${response.status}). No sharing notification was sent. Check the app's SharePoint permissions and tenant sharing rules.`);
  }
  return result.value[0].id;
}
