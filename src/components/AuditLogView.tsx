import React, { useState, useEffect } from 'react';
import {
  ScrollText,
  Search,
  Filter,
  RefreshCw,
  Download,
  Calendar,
  User,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { usePortalStore, setTableData } from '../services/store';

export const AuditLogView: React.FC = () => {
  const { auditLogs, actions } = usePortalStore();

  useEffect(() => {
    if (auditLogs.length === 0) {
      actions.getAuditLogs().then(data => setTableData('auditLogs', data));
    }
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBadge, setSelectedBadge] = useState<string>('All');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = log.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          log.eventType.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          log.targetName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBadge = selectedBadge === 'All' || log.badgeColor === selectedBadge;
    return matchesSearch && matchesBadge;
  });

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      actions.logAudit('audit_trail_sync', 'Audit trail synced with cloud ledger', 'emerald');
    }, 400);
  };

  const getBadgeStyle = (color: string) => {
    switch (color) {
      case 'teal':
        return 'bg-teal-50 text-teal-700 border border-teal-200';
      case 'emerald':
      case 'green':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'purple':
        return 'bg-purple-50 text-purple-700 border border-purple-200';
      case 'amber':
        return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'blue':
      default:
        return 'bg-blue-50 text-blue-700 border border-blue-200';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-md bg-[#00ad1d]/10 text-[#008f18]">
              <ScrollText className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">System Audit Log</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time immutable activity trail capturing document edits, Teams notifications, approval actions, and meetings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Sync Trail</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search audit trail by actor, event, target..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d]"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={selectedBadge}
            onChange={(e) => setSelectedBadge(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
          >
            <option value="All">All Categories</option>
            <option value="emerald">Operations & Tasks (Emerald)</option>
            <option value="teal">Documents & Edits (Teal)</option>
            <option value="purple">Meetings & Decisions (Purple)</option>
            <option value="amber">Approvals & Notices (Amber)</option>
            <option value="blue">Access & System (Blue)</option>
          </select>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Action / Event</th>
                <th className="py-3 px-4">Target Resource</th>
                <th className="py-3 px-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    No matching audit records found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, index) => (
                  <tr key={`${log.id}-${index}`} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-semibold text-slate-900">{log.actorName}</p>
                        <p className="text-[10px] text-slate-400">{log.actorEmail}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${getBadgeStyle(log.badgeColor)}`}>
                        {log.eventType.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700 max-w-xs truncate">
                      {log.targetName}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-500 text-[11px]">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
