import type {SharePointDocument, StaffUser} from '../types';
export function canUserViewDocument(doc: SharePointDocument, currentUser: StaffUser): boolean {
  if (!currentUser) return false;

  // Admins and Directors have visibility into all organizational documents
  if (currentUser.role?.toLowerCase().includes('admin') || currentUser.role?.toLowerCase().includes('director')) {
    return true;
  }

  const currentId = (currentUser.id || '').trim().toLowerCase();
  const currentEmail = (currentUser.email || '').trim().toLowerCase();
  const currentName = (currentUser.name || '').trim().toLowerCase();
  const userDept = (currentUser.department || '').trim().toLowerCase();

  const isUserMatch = (idOrEmailOrName?: string) => {
    if (!idOrEmailOrName) return false;
    const a = idOrEmailOrName.trim().toLowerCase();
    return a === currentId || a === currentEmail || (currentName && a === currentName);
  };

  const isUserAllowed = (allowedList?: string[]) => {
    if (!Array.isArray(allowedList) || allowedList.length === 0) return false;
    return allowedList.some(isUserMatch);
  };

  // 1. Everyone: Visible to all staff members
  if (doc.visibility === 'Everyone') {
    return true;
  }

  // 2. Specific People: Only explicitly allowed users or creator
  if (doc.visibility === 'Specific People') {
    const allowed = isUserAllowed(doc.allowedUserIds);
    const isCreator = Boolean(doc.createdById && isUserMatch(doc.createdById));
    if (!doc.allowedUserIds || doc.allowedUserIds.length === 0) {
      return isCreator;
    }
    return allowed || isCreator;
  }

  // 3. Department: Only users in the document's targetDepartment or creator
  if (doc.visibility === 'Department') {
    const isCreator = Boolean(doc.createdById && isUserMatch(doc.createdById));
    if (doc.targetDepartment) {
      const targetDept = (doc.targetDepartment || '').trim().toLowerCase();
      if (userDept !== targetDept && !isCreator) return false;
    }
    return true;
  }

  // 4. Default fallback
  if (Array.isArray(doc.allowedUserIds) && doc.allowedUserIds.length > 0) {
    return isUserAllowed(doc.allowedUserIds) || Boolean(doc.createdById && isUserMatch(doc.createdById));
  }

  return true;
}

export function canUserEditDocument(doc: SharePointDocument, currentUser: StaffUser): boolean {
  if (!currentUser) return false;

  // Admins and Directors have editing privileges on all documents
  if (currentUser.role?.toLowerCase().includes('admin') || currentUser.role?.toLowerCase().includes('director')) {
    return true;
  }

  const currentId = (currentUser.id || '').trim().toLowerCase();
  const currentEmail = (currentUser.email || '').trim().toLowerCase();
  const isMatch = (idOrEmail?: string) => {
    if (!idOrEmail) return false;
    const a = idOrEmail.trim().toLowerCase();
    return a === currentId || a === currentEmail;
  };

  const isCreator = Boolean(doc.createdById && isMatch(doc.createdById));
  if (Array.isArray(doc.editableUserIds) && doc.editableUserIds.length > 0) {
    return doc.editableUserIds.some(isMatch) || isCreator;
  }

  return isCreator;
}

export function getDocumentSharePointUrl(doc: SharePointDocument): string {
  const siteUrl = 'https://wipahstz.sharepoint.com/sites/OfficeHub';
  const candidateUrl = (doc.sharePointWebUrl || doc.webUrl || '').trim();
  if (
    candidateUrl &&
    candidateUrl.startsWith('http') &&
    candidateUrl !== siteUrl &&
    !candidateUrl.endsWith('/OfficeHub') &&
    !candidateUrl.endsWith('/OfficeHub/')
  ) {
    return candidateUrl;
  }
  const folder = doc.folder || 'General';
  const name = doc.name || 'Document';
  return `${siteUrl}/Shared Documents/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`;
}

