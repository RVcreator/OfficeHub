import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  Upload,
  Search,
  Filter,
  ExternalLink,
  Users,
  ShieldCheck,
  RefreshCw,
  Folder,
  FolderOpen,
  Eye,
  CheckCircle2,
  Lock,
  Unlock,
  Clock,
  Download,
  AlertCircle,
  Plus,
  Settings,
  Trash2
} from 'lucide-react';
import { SharePointDocument, StaffUser } from '../types';
import { usePortalStore } from '../services/store';
import { StaffPickerTree } from './StaffPickerTree';

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

export const SharePointView: React.FC<{ onOpenUploadModal: () => void }> = ({ onOpenUploadModal }) => {
  const { sharePointDocs, currentUser, actions, folderList, staff, departments } = usePortalStore();

  useEffect(() => {
    actions.getSharePointDocs();
    actions.getFolderList();
  }, []);

  const [selectedFolder, setSelectedFolder] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDocPreview, setActiveDocPreview] = useState<SharePointDocument | null>(null);
  const [syncingDocId, setSyncingDocId] = useState<string | null>(null);
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Permission Modal State
  const [permissionDoc, setPermissionDoc] = useState<SharePointDocument | null>(null);
  const [editVisibility, setEditVisibility] = useState<'Everyone' | 'Department' | 'Specific People'>('Specific People');
  const [editTargetDepartment, setEditTargetDepartment] = useState<string>('');
  const [editAllowedUserIds, setEditAllowedUserIds] = useState<string[]>([]);
  const [editEditableUserIds, setEditEditableUserIds] = useState<string[]>([]);
  const [permissionSavedNotice, setPermissionSavedNotice] = useState(false);

  const folders = ['All', ...folderList];

  const uniqueStaff = useMemo(() => {
    const map = new Map<string, StaffUser>();
    (staff || []).forEach(s => {
      if (s && s.id) {
        map.set(s.id, s);
      } else if (s && s.email) {
        map.set(s.email, s);
      }
    });
    return Array.from(map.values());
  }, [staff]);

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      actions.addFolder(newFolderName.trim());
      setNewFolderName('');
      setIsNewFolderModalOpen(false);
    }
  };

  const filteredDocs = sharePointDocs.filter(doc => {
    if (!canUserViewDocument(doc, currentUser)) return false;
    if (selectedFolder !== 'All' && doc.folder !== selectedFolder) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return doc.name.toLowerCase().includes(q) || (doc.contentSummary && doc.contentSummary.toLowerCase().includes(q));
    }
    return true;
  });

  const handleSyncDoc = (docId: string) => {
    setSyncingDocId(docId);
    setTimeout(() => {
      actions.syncSharePointDocument(docId);
      setSyncingDocId(null);
    }, 500);
  };

  const getFileBadgeColor = (type: SharePointDocument['fileType']) => {
    switch (type) {
      case 'docx':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'xlsx':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'pptx':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'pdf':
        return 'bg-rose-100 text-rose-800 border-rose-200';
    }
  };

  const openPermissionModal = (doc: SharePointDocument) => {
    setPermissionDoc(doc);
    setEditVisibility(doc.visibility || 'Specific People');
    setEditTargetDepartment(doc.targetDepartment || '');
    setEditAllowedUserIds(
      Array.isArray(doc.allowedUserIds) ? [...doc.allowedUserIds] : []
    );
    setEditEditableUserIds(
      Array.isArray(doc.editableUserIds) ? [...doc.editableUserIds] : []
    );
    setPermissionSavedNotice(false);
  };

  const handleSavePermissions = async () => {
    if (!permissionDoc) return;
    try {
    await actions.updateSharePointDocument(permissionDoc.id, {
      visibility: editVisibility,
      targetDepartment: (editTargetDepartment || undefined) as any,
      allowedUserIds: editAllowedUserIds,
      editableUserIds: editEditableUserIds,
    });
    setPermissionSavedNotice(true);
    setTimeout(() => {
      setPermissionDoc(null);
      setPermissionSavedNotice(false);
    }, 600);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Microsoft sharing could not be confirmed.');
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if ((actions as any).deleteSharePointDocument) {
      await (actions as any).deleteSharePointDocument(docId);
    }
    setPermissionDoc(null);
    setActiveDocPreview(null);
  };

  return (
    <div className="space-y-5">
      {/* Authentic Header */}
      <div className="bg-white border border-slate-200 rounded-md p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Document Collaboration
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200">
              SharePoint Online
            </span>
          </div>
          <h1 className="text-xl font-bold text-[#19232d]">
            SharePoint Document Library
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Centralized document repository with cloud co-authoring and strict permission controls.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              sharePointDocs.forEach(d => handleSyncDoc(d.id));
            }}
            className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync All</span>
          </button>

          <button
            onClick={onOpenUploadModal}
            className="px-3.5 py-1.5 rounded-md bg-[#00ad1d] hover:bg-[#009218] text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Upload Document</span>
          </button>

          <button
            onClick={() => setIsNewFolderModalOpen(true)}
            className="px-3.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
          >
            <Folder className="w-3.5 h-3.5" />
            <span>New Folder</span>
          </button>
        </div>
      </div>

      {/* Folders & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-md border border-slate-200 text-xs">
        {/* Folders tabs */}
        <div className="flex flex-wrap items-center gap-1">
          {folders.map(folder => (
            <button
              key={folder}
              onClick={() => setSelectedFolder(folder)}
              className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 cursor-pointer ${
                selectedFolder === folder
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {selectedFolder === folder ? (
                <FolderOpen className="w-3.5 h-3.5" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>{folder}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents or contents..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
          />
        </div>
      </div>

      {/* Documents List */}
      <div className="bg-white rounded-md border border-slate-200 overflow-hidden shadow-2xs">
        <div className="divide-y divide-slate-200">
          {filteredDocs.length === 0 ? (
            <div className="text-center py-12 px-4">
              <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">No documents found</p>
              <p className="text-xs text-slate-400 mt-1">Try selecting another folder or upload a new file.</p>
            </div>
          ) : (
            filteredDocs.map((doc) => (
              <div
                key={doc.id}
                className="p-3.5 hover:bg-slate-50/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span
                    className={`text-[10px] uppercase font-bold px-2 py-1 rounded border shrink-0 ${getFileBadgeColor(doc.fileType)}`}
                  >
                    {doc.fileType}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start gap-2">
                      <p className="text-sm font-semibold text-slate-900 break-words">{doc.name}</p>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium shrink-0">
                        {doc.visibility || 'Everyone'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
                      <span>Folder: {doc.folder}</span>
                      <span>•</span>
                      <span>v{doc.version}</span>
                      <span>•</span>
                      <span>{doc.size}</span>
                      <span>•</span>
                      <span>Updated {doc.lastModified} by {doc.lastModifiedBy}</span>
                    </div>

                    {/* Active Co-authors */}
                    {doc.activeUsers && doc.activeUsers.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 text-[11px] text-blue-700 font-medium">
                        <Users className="w-3.5 h-3.5" />
                        <span>Currently editing: {doc.activeUsers.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="oh-document-actions flex flex-wrap items-center gap-2 self-start sm:self-center shrink-0 max-w-full">
                  <button
                    onClick={() => handleDeleteDocument(doc.id)}
                    className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-medium flex items-center justify-center transition cursor-pointer"
                    title="Delete Document"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => openPermissionModal(doc)}
                    className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                    title="Change Document Permissions"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Permissions</span>
                  </button>

                  <button
                    onClick={() => setActiveDocPreview(doc)}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </button>

                  <a
                    href={getDocumentSharePointUrl(doc)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-[#0c6fae] hover:bg-[#09578a] text-white rounded text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Office 365</span>
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Document Preview Modal */}
      {activeDocPreview && (
        <div 
          className="oh-dialog fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setActiveDocPreview(null)}
        >
          <div 
            className="bg-white border border-slate-200 rounded-md shadow-xl max-w-xl w-full p-5 text-slate-800 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 mb-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">{activeDocPreview.folder}</span>
                <h3 className="text-base font-bold text-slate-900">{activeDocPreview.name}</h3>
              </div>
              <button
                onClick={() => setActiveDocPreview(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <p className="font-semibold text-slate-700 mb-1">Document Summary</p>
                <p className="text-slate-600 bg-slate-50 p-3 rounded border border-slate-200 leading-relaxed">
                  {activeDocPreview.contentSummary || 'No summary available.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                <div>File Size: {activeDocPreview.size}</div>
                <div>Version: v{activeDocPreview.version}</div>
                <div>Last Modified: {activeDocPreview.lastModified}</div>
                <div>Editor: {activeDocPreview.lastModifiedBy}</div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-blue-700 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>SharePoint Online Verified</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const docId = activeDocPreview.id;
                    setActiveDocPreview(null);
                    handleDeleteDocument(docId);
                  }}
                  className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Document</span>
                </button>
              </div>

              <a
                href={getDocumentSharePointUrl(activeDocPreview)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-[#0c6fae] hover:bg-[#09578a] text-white rounded text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Launch in Word / Excel Online</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Document Permissions Modal */}
      {permissionDoc && (
        <div 
          className="oh-dialog fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setPermissionDoc(null)}
        >
          <div 
            className="bg-white border border-slate-200 rounded-md shadow-xl max-w-lg w-full p-5 text-slate-800 space-y-4 max-h-[85vh] overflow-y-auto my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Manage Permissions</h3>
                <p className="text-xs text-slate-500 truncate">{permissionDoc.name}</p>
              </div>
              <button
                onClick={() => setPermissionDoc(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Visibility Level</label>
                <select
                  value={editVisibility}
                  onChange={(e) => setEditVisibility(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-xs"
                >
                  <option value="Everyone">Everyone</option>
                  <option value="Department">Department</option>
                  <option value="Specific People">Specific People</option>
                </select>
              </div>

              {editVisibility === 'Department' && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Target Department</label>
                  <select
                    value={editTargetDepartment}
                    onChange={(e) => setEditTargetDepartment(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-xs"
                  >
                    <option value="">-- Choose Department --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name} ({d.organisation || 'WIPAHS'})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Only staff members assigned to this department and the document creator will be able to view this file.
                  </p>
                </div>
              )}

              {editVisibility === 'Specific People' && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Allowed Users ({editAllowedUserIds.length} selected)
                  </label>
                  <StaffPickerTree
                    mode="multiple"
                    staff={uniqueStaff}
                    selectedUserIds={editAllowedUserIds}
                    onChange={setEditAllowedUserIds}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    The selected colleagues and document creator receive access through OfficeHub. Existing SharePoint site or folder permissions also apply. Remove or reduce access using SharePoint Manage access.
                  </p>
                </div>
              )}

              {editVisibility === 'Everyone' && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-md text-[11px] text-emerald-800">
                  This document is visible to all active staff across all departments and organisations.
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Editable Users</label>
                <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-2 text-xs space-y-1">
                  {uniqueStaff.map(s => (
                    <label key={s.id} className="flex items-center gap-2 py-0.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editEditableUserIds.includes(s.id)}
                        onChange={(e) => {
                          if (e.target.checked) setEditEditableUserIds([...editEditableUserIds, s.id]);
                          else setEditEditableUserIds(editEditableUserIds.filter(id => id !== s.id));
                        }}
                      />
                      <span>{s.name} ({s.department})</span>
                    </label>
                  ))}
                </div>
              </div>

              {permissionSavedNotice && (
                <div className="p-2 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded text-center font-semibold text-xs">
                  ✓ Permissions saved successfully!
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleDeleteDocument(permissionDoc.id)}
                className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete File</span>
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => setPermissionDoc(null)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePermissions}
                  className="px-3 py-1.5 bg-[#00ad1d] hover:bg-[#009218] text-white rounded text-xs font-semibold cursor-pointer"
                >
                  Save Permissions
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isNewFolderModalOpen && (
        <div className="oh-dialog fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-md shadow-xl max-w-sm w-full p-5 text-slate-800 my-auto">
            <h3 className="text-base font-bold text-slate-900 mb-4">Create New Folder</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm mb-4 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsNewFolderModalOpen(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                className="px-3 py-1.5 bg-[#00ad1d] hover:bg-[#009218] text-white rounded text-xs font-semibold cursor-pointer"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
