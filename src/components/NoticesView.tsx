import React, { useState, useMemo, useEffect } from 'react';
import {
  BellRing,
  Plus,
  Pin,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Download,
  Share2,
  Send,
  Search,
  Filter,
  Trash2,
  Building2,
  Users,
  Paperclip,
  Eye,
  ExternalLink,
  X,
  FileSpreadsheet
} from 'lucide-react';
import { Notice, MessageAttachment } from '../types';
import { usePortalStore } from '../services/store';
import {
  formatStaffDisplayName,
  formatStaffDisplayOrgDept,
  FIXED_ORGANISATION_ORDER,
  sortOrganisations
} from '../utils/staffHierarchy';
import {
  openAttachmentInNewTab,
  downloadAttachment,
  getAttachmentTabUrl
} from '../utils/fileParser';

export const NoticesView: React.FC<{
  onOpenNewNoticeModal: () => void;
  selectedNoticeId?: string | null;
}> = ({ onOpenNewNoticeModal, selectedNoticeId }) => {
  const { notices, currentUser, staff, actions } = usePortalStore();

  const [organisationFilter, setOrganisationFilter] = useState<string>('All');
  const [departmentFilter, setDepartmentFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedNoticeId, setHighlightedNoticeId] = useState<string | null>(null);
  const [selectedDocumentForPreview, setSelectedDocumentForPreview] = useState<{
    noticeTitle: string;
    attachment: MessageAttachment;
  } | null>(null);

  useEffect(() => {
    if (selectedNoticeId) {
      setOrganisationFilter('All');
      setDepartmentFilter('All');
      setSearchQuery('');
      setHighlightedNoticeId(selectedNoticeId);

      setTimeout(() => {
        const el = document.getElementById(`notice-${selectedNoticeId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);

      const timer = setTimeout(() => {
        setHighlightedNoticeId(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [selectedNoticeId]);

  const availableOrganisations = useMemo(() => {
    const raw = Array.from(new Set(staff.map(s => s.organisation || 'WIPAHS')));
    return sortOrganisations(raw);
  }, [staff]);

  const availableDepartments = useMemo(() => {
    const relevantStaff = organisationFilter === 'All'
      ? staff
      : staff.filter(s => (s.organisation || 'WIPAHS') === organisationFilter);
    return Array.from(new Set(relevantStaff.map(s => s.department || 'General'))).sort();
  }, [staff, organisationFilter]);

  const filteredNotices = notices.filter(n => {
    const noticeOrg = n.organisation || n.targetOrganisation;
    const noticeDept = n.department || n.targetDepartment;

    if (organisationFilter !== 'All') {
      const matchOrg = n.targetOrganisations && n.targetOrganisations.length > 0
        ? n.targetOrganisations.includes(organisationFilter)
        : (noticeOrg ? noticeOrg.includes(organisationFilter) : true);
      if (!matchOrg && noticeOrg) return false;
    }
    if (departmentFilter !== 'All') {
      const matchDept = n.targetDepartments && n.targetDepartments.length > 0
        ? n.targetDepartments.includes(departmentFilter)
        : (noticeDept === 'All Departments' || (noticeDept ? noticeDept.includes(departmentFilter) : true));
      if (!matchDept && noticeDept && noticeDept !== 'All Departments') return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const orgsMatch = n.targetOrganisations?.some(o => o.toLowerCase().includes(q));
      const deptsMatch = n.targetDepartments?.some(d => d.toLowerCase().includes(q));
      return (
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.authorName.toLowerCase().includes(q) ||
        (noticeOrg || '').toLowerCase().includes(q) ||
        (noticeDept || '').toLowerCase().includes(q) ||
        Boolean(orgsMatch) ||
        Boolean(deptsMatch)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-md border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#19232d]">Official Notices & Circulars</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-semibold border border-amber-200">
              {filteredNotices.length} circulars
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Targeted announcements, executive memos, and inter-organizational directives with automatic Microsoft Teams broadcast.
          </p>
        </div>

        <button
          onClick={onOpenNewNoticeModal}
          className="px-3.5 py-2 rounded-md bg-[#00ad1d] hover:bg-[#009218] text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition self-start md:self-auto"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Post Circular</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-md border border-slate-200 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-600">Organisation:</span>
            <select
              value={organisationFilter}
              onChange={(e) => {
                setOrganisationFilter(e.target.value);
                setDepartmentFilter('All');
              }}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-slate-700 font-medium text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
            >
              <option value="All">All Organisations</option>
              {availableOrganisations.map(org => (
                <option key={org} value={org}>{org}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-600">Department:</span>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
            >
              <option value="All">All Departments</option>
              {availableDepartments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search circulars..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
          />
        </div>
      </div>

      {/* Notices List */}
      <div className="space-y-3">
        {filteredNotices.length === 0 ? (
          <div className="bg-white rounded-md border border-slate-200 p-10 text-center text-slate-400 text-xs">
            <BellRing className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="font-medium text-slate-700">No circulars found for the selected criteria</p>
          </div>
        ) : (
          filteredNotices.map((notice) => {
            const isAcknowledged = notice.acknowledgedBy.includes(currentUser.id) || notice.acknowledgedBy.includes(currentUser.name);
            const author = staff.find(s => s.id === notice.authorId || s.name === notice.authorName);
            const orgsText = notice.targetOrganisations && notice.targetOrganisations.length > 0
              ? notice.targetOrganisations.join(', ')
              : notice.targetOrganisation || notice.organisation;
            const deptsText = notice.targetDepartments && notice.targetDepartments.length > 0
              ? notice.targetDepartments.join(', ')
              : (notice.targetDepartment && notice.targetDepartment !== 'All Departments' ? notice.targetDepartment : '');
            const targetScope = orgsText
              ? `${orgsText}${deptsText ? ` • ${deptsText}` : ''}`
              : (notice.department || 'All Departments');

            return (
              <div
                key={notice.id}
                id={`notice-${notice.id}`}
                className={`bg-white rounded-md border p-4 shadow-2xs transition-all duration-300 ${
                  highlightedNoticeId === notice.id
                    ? 'ring-2 ring-emerald-500 shadow-md bg-emerald-50/30 border-emerald-400'
                    : notice.priority === 'Urgent'
                    ? 'border-amber-400 bg-amber-50/20'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {notice.pinned && (
                      <span className="p-1 rounded bg-amber-100 text-amber-800" title="Pinned Notice">
                        <Pin className="w-3 h-3 fill-amber-700" />
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        notice.priority === 'Urgent'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {notice.priority}
                    </span>

                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                      Target: {targetScope}
                    </span>
                  </div>

                  <span className="text-xs text-slate-400">{notice.date || 'Recent'}</span>
                </div>

                <h3 className="font-bold text-base text-slate-900 mt-2">{notice.title}</h3>
                <p className="text-xs text-slate-700 mt-1.5 leading-relaxed whitespace-pre-line">{notice.content}</p>

                {/* Attached Circular Documents */}
                {notice.attachments && notice.attachments.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                    <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-amber-600" />
                      <span>Attached Circular Documents ({notice.attachments.length}):</span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {notice.attachments.map((attItem, idx) => {
                        const att: MessageAttachment = {
                          id: (attItem as any).id || `att-${notice.id}-${idx}`,
                          name: attItem.name,
                          size: attItem.size || 'Attachment',
                          type: attItem.type || 'file',
                          url: attItem.url || '#',
                          textContent: (attItem as any).textContent,
                          sheetData: (attItem as any).sheetData
                        };

                        return (
                          <div
                            key={att.id}
                            className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg text-xs transition shadow-2xs"
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <div className="p-1.5 bg-amber-100 text-amber-800 rounded shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 truncate" title={att.name}>{att.name}</p>
                                <p className="text-[10px] text-slate-500">{att.size} • {att.type.toUpperCase()}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setSelectedDocumentForPreview({ noticeTitle: notice.title, attachment: att })}
                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold text-[11px] flex items-center gap-1 transition shadow-2xs"
                              >
                                <Eye className="w-3 h-3" />
                                <span>View</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openAttachmentInNewTab(att)}
                                className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded transition"
                                title="Open in new tab"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                  {/* Author Information Formatted as Name — Designation and Organisation • Department */}
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="text-slate-400">Issued by:</span>
                    {author ? (
                      <div className="inline-flex items-center gap-1.5">
                        <span className="font-semibold text-slate-900">{formatStaffDisplayName(author)}</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-[#008f18] font-medium">{formatStaffDisplayOrgDept(author)}</span>
                      </div>
                    ) : (
                      <span className="font-medium text-slate-800">
                        {notice.authorName} — {notice.authorRole}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => actions.acknowledgeNotice(notice.id)}
                      className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition ${
                        isAcknowledged
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{isAcknowledged ? 'Acknowledged' : 'Acknowledge Receipt'}</span>
                    </button>

                    {notice.authorId === currentUser.id && (
                      <button
                        onClick={() => actions.deleteNotice(notice.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        title="Delete circular"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Circular Document Viewer Modal */}
      {selectedDocumentForPreview && (
        <div
          className="oh-dialog fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedDocumentForPreview(null)}
        >
          <div
            className="bg-white rounded-lg max-w-3xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-amber-100 text-amber-800 rounded-lg shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded">
                    Circular Document Viewer
                  </span>
                  <h2 className="text-base font-bold text-slate-900 truncate mt-1">
                    {selectedDocumentForPreview.attachment.name}
                  </h2>
                  <p className="text-xs text-slate-500 truncate">
                    Circular: <span className="font-semibold text-slate-700">{selectedDocumentForPreview.noticeTitle}</span> • {selectedDocumentForPreview.attachment.size}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => openAttachmentInNewTab(selectedDocumentForPreview.attachment)}
                  className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Full Page</span>
                </button>
                <button
                  onClick={() => downloadAttachment(selectedDocumentForPreview.attachment)}
                  className="px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-2xs transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  onClick={() => setSelectedDocumentForPreview(null)}
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content Preview Area */}
            <div className="flex-1 overflow-y-auto bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4 min-h-[300px]">
              {selectedDocumentForPreview.attachment.sheetData && selectedDocumentForPreview.attachment.sheetData.length > 0 ? (
                /* Spreadsheet Preview Table */
                <div className="space-y-4">
                  {selectedDocumentForPreview.attachment.sheetData.map((sheet, sIdx) => (
                    <div key={sIdx} className="bg-white border border-slate-200 rounded p-3 overflow-x-auto shadow-2xs">
                      <h4 className="font-bold text-xs text-slate-800 mb-2">{sheet.sheetName}</h4>
                      <table className="w-full text-left border-collapse text-xs">
                        <tbody>
                          {sheet.rows.map((row, rIdx) => (
                            <tr key={rIdx} className={rIdx === 0 ? 'bg-slate-100 font-bold border-b border-slate-200' : 'border-b border-slate-100'}>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="p-2 border-r border-slate-100 last:border-r-0 whitespace-nowrap">
                                  {cell !== null && cell !== undefined ? String(cell) : ''}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ) : selectedDocumentForPreview.attachment.textContent ? (
                /* Text / Extracted Document Content */
                <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-2xs font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-800">
                  {selectedDocumentForPreview.attachment.textContent}
                </div>
              ) : selectedDocumentForPreview.attachment.type === 'image' || (selectedDocumentForPreview.attachment.url && selectedDocumentForPreview.attachment.url.startsWith('data:image/')) ? (
                /* Image Preview */
                <div className="flex items-center justify-center bg-slate-900/10 rounded-lg p-4">
                  {getAttachmentTabUrl(selectedDocumentForPreview.attachment) ? (
                    <img
                      src={getAttachmentTabUrl(selectedDocumentForPreview.attachment)}
                      alt={selectedDocumentForPreview.attachment.name}
                      className="max-h-[60vh] object-contain rounded shadow-md"
                    />
                  ) : (
                    <p className="text-slate-400 italic text-xs">Image unavailable</p>
                  )}
                </div>
              ) : (
                /* Interactive Document Preview Frame / Fallback */
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3 bg-white border border-slate-200 rounded-lg shadow-2xs">
                  <div className="p-4 bg-amber-50 text-amber-700 rounded-full">
                    <FileText className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{selectedDocumentForPreview.attachment.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedDocumentForPreview.attachment.size} • Official WIPAHS Operations Document
                    </p>
                  </div>
                  <p className="text-xs text-slate-600 max-w-md leading-relaxed">
                    This attached document is stored securely in the OfficeHub library. You can view it directly in full page or download it to your device.
                  </p>
                  <div className="pt-2 flex items-center gap-2">
                    <button
                      onClick={() => openAttachmentInNewTab(selectedDocumentForPreview.attachment)}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-semibold text-xs flex items-center gap-2 transition shadow-2xs"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Launch Interactive Viewer</span>
                    </button>
                    <button
                      onClick={() => downloadAttachment(selectedDocumentForPreview.attachment)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-semibold text-xs flex items-center gap-2 transition"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download File</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500 shrink-0">
              <span>WIPAHS OfficeHub Secure Document Portal</span>
              <button
                onClick={() => setSelectedDocumentForPreview(null)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold transition"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
