import React, { useState, useEffect } from 'react';
import { UserAvatar } from './UserAvatar';
import { ConfirmDialog } from './ConfirmDialog';
import {
  X,
  ShieldCheck,
  Zap,
  RefreshCw,
  Database,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  KeyRound,
  User,
  Eye,
  EyeOff,
  Cloud,
  Check,
  Lock,
  Star,
  Award,
  MessageSquare,
  Archive,
  Palmtree,
  CalendarDays,
  Plane,
  Clock
} from 'lucide-react';
import { usePortalStore } from '../services/store';
import { Department } from '../types';
import { getUserRatingSummary } from '../utils/staffRatings';
import { PersonalArchivePanel } from './PersonalArchivePanel';

export type SettingsTabType = 'profile' | 'ratings' | 'archive' | 'integrations' | 'admin';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTabType;
  onSelectTask?: (taskId: string) => void;
  onSelectMeeting?: (meetingId: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'profile',
  onSelectTask,
  onSelectMeeting
}) => {
  const { actions, currentUser, departments, tasks, staff } = usePortalStore(['currentUser', 'departments', 'tasks', 'staff']);
  const ratingSummary = getUserRatingSummary(currentUser.id, tasks, currentUser);

  const [activeTab, setActiveTab] = useState<SettingsTabType>(initialTab);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Profile state
  const [profileData, setProfileData] = useState({
    name: currentUser.name,
    email: currentUser.email,
    role: currentUser.role,
    organisation: currentUser.organisation || 'WIPAHS',
    department: currentUser.department,
    phone: currentUser.phone,
    avatar: currentUser.avatar,
    birthday: currentUser.birthday || ''
  });

  // Out of Office / Leave state
  const [isOutOfOffice, setIsOutOfOffice] = useState(currentUser.outOfOffice || currentUser.status === 'Out of Office');
  const [leaveType, setLeaveType] = useState(currentUser.leaveType || 'Annual Leave');
  const [leaveStartDate, setLeaveStartDate] = useState(currentUser.leaveStartDate || '');
  const [leaveEndDate, setLeaveEndDate] = useState(currentUser.leaveEndDate || '');
  const [outOfOfficeMessage, setOutOfOfficeMessage] = useState(currentUser.outOfOfficeMessage || '');
  const [backupContactName, setBackupContactName] = useState(currentUser.backupContactName || '');

  const [profileSaved, setProfileSaved] = useState(false);

  // Sync state if currentUser changes
  useEffect(() => {
    if (isOpen) {
      setProfileData({
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role,
        organisation: currentUser.organisation || 'WIPAHS',
        department: currentUser.department,
        phone: currentUser.phone,
        avatar: currentUser.avatar,
        birthday: currentUser.birthday || ''
      });
      setIsOutOfOffice(currentUser.outOfOffice || currentUser.status === 'Out of Office');
      setLeaveType(currentUser.leaveType || 'Annual Leave');
      setLeaveStartDate(currentUser.leaveStartDate || '');
      setLeaveEndDate(currentUser.leaveEndDate || '');
      setOutOfOfficeMessage(currentUser.outOfOfficeMessage || '');
      setBackupContactName(currentUser.backupContactName || '');
    }
  }, [isOpen, currentUser]);

  // Integrations state
  const [tenantId, setTenantId] = useState('wipahs-org-tenant-id');
  const [sharePointUrl, setSharePointUrl] = useState('https://wipahs.sharepoint.com/sites/operations');
  const [supabaseProject, setSupabaseProject] = useState('wxjjrfhahxqhbixaviwm');
  const [integrationSaved, setIntegrationSaved] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const formattedMsg = outOfOfficeMessage.trim() || (isOutOfOffice ? `On ${leaveType}${leaveEndDate ? ` until ${leaveEndDate}` : ''}` : '');

    try {
    await actions.updateCurrentUserProfile({
      name: profileData.name.trim(),
      email: profileData.email.trim(),
      role: profileData.role.trim(),
      organisation: profileData.organisation.trim(),
      department: profileData.department,
      phone: profileData.phone.trim(),
      avatar: profileData.avatar,
      birthday: profileData.birthday.trim() || undefined,
      outOfOffice: isOutOfOffice,
      status: isOutOfOffice ? 'Out of Office' : (currentUser.status === 'Out of Office' ? 'Offline' : currentUser.status),
      leaveType: isOutOfOffice ? leaveType : undefined,
      leaveStartDate: isOutOfOffice ? leaveStartDate : undefined,
      leaveEndDate: isOutOfOffice ? leaveEndDate : undefined,
      outOfOfficeMessage: isOutOfOffice ? formattedMsg : undefined,
      backupContactName: isOutOfOffice ? backupContactName.trim() : undefined
    });

    if (!isOutOfOffice) {
      actions.syncLivePresence();
    }

    if (isOutOfOffice) {
      actions.logAudit('out_of_office_set', `${profileData.name} declared Out of Office (${leaveType})`, 'amber');
    }

    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
    } catch (error) {
      setProfileSaved(false);
      window.alert(error instanceof Error ? error.message : 'Profile could not be saved. Please try again.');
    }
  };

  const handleSaveIntegrations = (e: React.FormEvent) => {
    e.preventDefault();
    actions.logAudit('settings_updated', 'Updated Microsoft 365 and cloud integration endpoints', 'green');
    setIntegrationSaved(true);
    setTimeout(() => setIntegrationSaved(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const rawDataUrl = reader.result as string;
      if (!rawDataUrl) return;

      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 256;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const compressed = canvas.toDataURL('image/jpeg', 0.82);
            setProfileData((prev) => ({ ...prev, avatar: compressed }));
            return;
          }
        } catch {
          // Fall back to original data URL if canvas compression fails
        }
        setProfileData((prev) => ({ ...prev, avatar: rawDataUrl }));
      };
      img.onerror = () => {
        setProfileData((prev) => ({ ...prev, avatar: rawDataUrl }));
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleResetData = () => {
    setShowResetConfirm(true);
  };

  return (
    <div 
      className="oh-dialog fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl max-w-6xl w-full p-0 shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in duration-150 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (Sticky) */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/90 shrink-0 z-20">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-md bg-[#00ad1d]/10 text-[#008f18]">
              <Sliders className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">Settings & Account Center</h2>
              <p className="text-xs text-slate-500">Security credentials, personal profile, and portal governance</p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close settings"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection (Sticky) */}
        <div className="oh-tabs flex items-center border-b border-slate-200 bg-white px-4 text-xs overflow-x-auto shrink-0 z-10" tabIndex={0} aria-label="Settings sections">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 py-3 px-4 font-semibold border-b-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'profile'
                ? 'border-[#00ad1d] text-[#008f18]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className="w-4 h-4" />
            <span>My Profile</span>
          </button>

          <button
            onClick={() => setActiveTab('ratings')}
            className={`flex items-center gap-2 py-3 px-4 font-semibold border-b-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'ratings'
                ? 'border-[#00ad1d] text-[#008f18]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Star className="w-4 h-4 text-amber-500" />
            <span>Performance Ratings</span>
            {ratingSummary.totalRatingsCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-200">
                ★ {ratingSummary.averageRating.toFixed(1)}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('archive')}
            className={`flex items-center gap-2 py-3 px-4 font-semibold border-b-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'archive'
                ? 'border-[#00ad1d] text-[#008f18]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Archive className="w-4 h-4" />
            <span>Personal Archive</span>
          </button>

          {(() => {
            const dept = (currentUser.department || '').toLowerCase();
            const role = (currentUser.role || '').toLowerCase();
            const appMetaRole = (currentUser.app_metadata?.role || '').toLowerCase();
            const appMetaDept = (currentUser.app_metadata?.department || '').toLowerCase();

            const hasAdminRights = 
              role.includes('admin') ||
              appMetaRole.includes('admin') ||
              dept.includes('it') ||
              dept.includes('executive') ||
              appMetaDept.includes('it') ||
              appMetaDept.includes('executive');

            if (!hasAdminRights) return null;
            return (
              <>
                <button
                  onClick={() => setActiveTab('integrations')}
                  className={`flex items-center gap-2 py-3 px-4 font-semibold border-b-2 whitespace-nowrap transition cursor-pointer ${
                    activeTab === 'integrations'
                      ? 'border-[#00ad1d] text-[#008f18]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Cloud className="w-4 h-4" />
                  <span>Microsoft 365 & Cloud</span>
                </button>

                <button
                  onClick={() => setActiveTab('admin')}
                  className={`flex items-center gap-2 py-3 px-4 font-semibold border-b-2 whitespace-nowrap transition cursor-pointer ${
                    activeTab === 'admin'
                      ? 'border-[#00ad1d] text-[#008f18]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>System Maintenance</span>
                </button>
              </>
            );
          })()}
        </div>

        {/* Modal Body */}
        <div className={`p-5 sm:p-6 min-h-0 flex-1 text-xs ${activeTab==='archive' ? 'oh-settings-archive-body overflow-hidden flex flex-col' : 'overflow-y-auto'}`}>
          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-5 w-full max-w-3xl mx-auto">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Credential & Password Policy</p>
                  <p className="text-blue-700 mt-0.5">Password issuance, updates, and resets can only be performed and issued by a System Administrator.</p>
                </div>
              </div>

              {profileSaved && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Your profile details have been saved successfully!</span>
                </div>
              )}

              {/* Profile Card Banner */}
              <div className="flex items-center justify-between p-5 bg-gradient-to-r from-slate-50 via-slate-50 to-[#00ad1d]/5 rounded-xl border border-slate-200 shadow-2xs flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    <UserAvatar name={profileData.name} avatar={profileData.avatar} className="w-16 h-16" />
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="font-bold text-slate-900 text-base">
                      {currentUser.name}
                    </h3>
                    <p className="text-slate-600 font-semibold text-xs">
                      {currentUser.role}
                    </p>
                    <p className="text-[#008f18] text-xs font-bold">
                      {currentUser.organisation || 'WIPAHS'} • {currentUser.department}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-[#00ad1d]/10 text-[#008f18] font-bold text-xs rounded-full border border-[#00ad1d]/20 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#008f18]" />
                    <span>Active Profile</span>
                  </span>
                </div>
              </div>

              {/* Task Performance Rating Overview */}
              <div className="p-5 bg-gradient-to-br from-amber-50/80 via-white to-amber-50/40 rounded-xl border border-amber-200/80 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-400 text-white flex items-center justify-center shadow-2xs">
                      <Award className="w-4 h-4 fill-white" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">Task Performance Ratings</h4>
                      <p className="text-[11px] text-slate-500">Evaluations received upon task completion</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-amber-900 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-200">
                    {ratingSummary.totalRatingsCount} {ratingSummary.totalRatingsCount === 1 ? 'task evaluated' : 'tasks evaluated'}
                  </span>
                </div>

                {ratingSummary.totalRatingsCount > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                    <div className="md:col-span-5 flex flex-col items-center justify-center bg-white p-4 rounded-xl border border-amber-100 text-center space-y-2">
                      <span className="text-4xl font-black text-slate-900">
                        {ratingSummary.averageRating.toFixed(1)}
                      </span>
                      <div className="flex items-center gap-1 my-1 text-amber-400">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-4 h-4 ${
                              star <= Math.round(ratingSummary.averageRating)
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-200'
                            } stroke-[1.5]`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-slate-500 font-medium">Average Performance Score</span>

                      <div className="w-full pt-3 border-t border-slate-100 space-y-1">
                        {([5, 4, 3, 2, 1] as const).map((starNum) => {
                          const count = ratingSummary.distribution[starNum];
                          const pct = ratingSummary.totalRatingsCount > 0 ? Math.round((count / ratingSummary.totalRatingsCount) * 100) : 0;
                          return (
                            <div key={starNum} className="flex items-center gap-1.5 text-[10px]">
                              <span className="w-8 text-slate-600 font-semibold flex items-center gap-0.5 justify-end">
                                <span>{starNum}</span>
                                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400 stroke-none" />
                              </span>
                              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="w-8 text-right text-slate-400 font-mono">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="md:col-span-7 space-y-2">
                      <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
                        <span>Recent Evaluations (Anonymous)</span>
                      </p>

                      {ratingSummary.recentRatings.length > 0 ? (
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {ratingSummary.recentRatings.map((r, i) => (
                            <div key={i} className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1 shadow-2xs">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-amber-800 flex items-center gap-0.5">
                                  <span>★</span> {r.stars}.0 / 5
                                </span>
                                <span className="text-slate-400 font-medium">
                                  {new Date(r.ratedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-semibold text-slate-900">Task: {r.taskTitle}</p>
                                {r.isDepartment && (
                                  <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 text-[10px] font-bold border border-purple-200">
                                    {r.departmentName ? `${r.departmentName} Dept` : 'Department Rating'}
                                  </span>
                                )}
                              </div>
                              {r.comment && <p className="italic text-slate-600 bg-amber-50/60 p-2 rounded border border-amber-100">"{r.comment}"</p>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic p-3 bg-white rounded-lg border border-dashed border-amber-200 text-center">
                          No evaluation comments recorded.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic p-4 bg-white rounded-lg border border-dashed border-amber-200 text-center">
                    No task performance ratings received yet. Ratings will aggregate here when organizers evaluate your completed tasks.
                  </p>
                )}
              </div>

              {/* Personal Details Form Section */}
              <div className="space-y-4 p-5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <h4 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
                  Personal & Role Details
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={profileData.name}
                      onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                      className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Email Address</label>
                    <input
                      type="email"
                      readOnly
                      required
                      value={profileData.email}
                      onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                      className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Job Title / Role</label>
                    <input
                      type="text"
                      required
                      value={profileData.role}
                      onChange={(e) => setProfileData({ ...profileData, role: e.target.value })}
                      className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Organisation</label>
                    <select
                      value={profileData.organisation}
                      onChange={(e) => setProfileData({ ...profileData, organisation: e.target.value })}
                      className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                    >
                      <option value="WIPAHS">WIPAHS</option>
                      <option value="HO">HO</option>
                      <option value="HOP">HOP</option>
                      <option value="WEC">WEC</option>
                      <option value="MEDEWELL">MEDEWELL</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Department</label>
                    <select
                      value={profileData.department}
                      onChange={(e) => setProfileData({ ...profileData, department: e.target.value })}
                      className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.name}>
                          {d.name} {d.organisation ? `(${d.organisation})` : ''}
                        </option>
                      ))}
                      {!departments.some((d) => d.name.toLowerCase() === profileData.department.toLowerCase()) && (
                        <option value={profileData.department}>{profileData.department}</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Phone / Extension</label>
                    <input
                      type="text"
                      value={profileData.phone}
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Birthday</label>
                    <input
                      type="date"
                      value={profileData.birthday}
                      onChange={(e) => setProfileData({ ...profileData, birthday: e.target.value })}
                      className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Avatar Image Upload</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="w-full px-3 py-1.5 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                    />
                  </div>
                </div>
              </div>

              {/* Out of Office & Leave Declaration Section */}
              <div className="space-y-4 p-5 bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30 rounded-xl border border-amber-200 shadow-2xs">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-amber-200/70">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-2xs">
                      <Palmtree className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">Out of Office & Leave Declaration</h4>
                      <p className="text-[11px] text-slate-500">
                        Declare planned leave, field missions, or absence so team members and leadership are notified in the Staff Directory and User Management.
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isOutOfOffice}
                      onChange={(e) => setIsOutOfOffice(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                    <span className="ml-2 font-bold text-xs text-slate-700">
                      {isOutOfOffice ? 'On Leave (Out of Office)' : 'In Office (Available)'}
                    </span>
                  </label>
                </div>

                {isOutOfOffice ? (
                  <div className="space-y-4 pt-1 animate-in fade-in duration-150">
                    <div className="p-3 bg-amber-100/70 rounded-lg border border-amber-300 text-amber-950 flex items-center justify-between text-xs font-semibold">
                      <div className="flex items-center gap-2">
                        <Plane className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>
                          Status is set to <strong>Out of Office</strong>. Your profile will display a leave badge in the User Administration and Staff Directory.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsOutOfOffice(false)}
                        className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 rounded font-bold text-[11px] shadow-2xs transition cursor-pointer"
                      >
                        Return to Office Now
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          Leave / Absence Category <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={leaveType}
                          onChange={(e) => setLeaveType(e.target.value)}
                          className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs bg-white font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
                        >
                          <option value="Annual Leave">Annual Leave / Vacation</option>
                          <option value="Sick / Medical Leave">Sick / Medical Leave</option>
                          <option value="Official Travel / Field Mission">Official Travel / Field Mission</option>
                          <option value="Maternity / Paternity Leave">Maternity / Paternity Leave</option>
                          <option value="Emergency / Personal Leave">Emergency / Personal Leave</option>
                          <option value="Study Leave">Study / Academic Leave</option>
                          <option value="Hajj / Pilgrimage Leave">Hajj / Pilgrimage Leave</option>
                          <option value="Other">Other Special Leave</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          Backup / Relief Contact Person (Optional)
                        </label>
                        <select
                          value={backupContactName}
                          onChange={(e) => setBackupContactName(e.target.value)}
                          className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                        >
                          <option value="">-- No Backup Assigned --</option>
                          {staff.filter(s => s.id !== currentUser.id).map(s => (
                            <option key={s.id} value={s.name}>
                              {s.name} ({s.role} • {s.department})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">Leave Start Date</label>
                        <input
                          type="date"
                          value={leaveStartDate}
                          onChange={(e) => setLeaveStartDate(e.target.value)}
                          className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>

                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          Expected Return Date <span className="text-amber-700 font-normal">(Until)</span>
                        </label>
                        <input
                          type="date"
                          value={leaveEndDate}
                          onChange={(e) => setLeaveEndDate(e.target.value)}
                          className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="font-semibold text-slate-700 block mb-1">
                          Out of Office Auto-Response / Public Status Note
                        </label>
                        <input
                          type="text"
                          value={outOfOfficeMessage}
                          onChange={(e) => setOutOfOfficeMessage(e.target.value)}
                          placeholder={`e.g. Currently on ${leaveType}${leaveEndDate ? ` until ${leaveEndDate}` : ''}. For urgent matters, please contact ${backupContactName || 'our department'}.`}
                          className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    Toggle the switch above when you are scheduled for annual leave, medical absence, or official duty travel to alert other team members across the portal.
                  </p>
                )}
              </div>

              {/* Footer Buttons */}
              <div className="pt-2 flex items-center justify-end border-t border-slate-200 mt-4">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#00ad1d] hover:bg-[#009218] text-white font-bold rounded-lg text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Profile Changes</span>
                </button>
              </div>
            </form>
          )}

          {/* 2.2 PERFORMANCE RATINGS TAB (Dedicated, clean ratings view without archive popup) */}
          {activeTab === 'ratings' && (
            <div className="space-y-5 w-full max-w-4xl mx-auto animate-in fade-in duration-150">
              {/* Task Performance Rating Overview Banner */}
              <div className="p-6 bg-gradient-to-br from-amber-50/90 via-white to-amber-50/40 rounded-xl border border-amber-200/90 shadow-xs space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-400 text-white flex items-center justify-center shadow-xs">
                      <Award className="w-5 h-5 fill-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-slate-900">Task Performance Ratings & Evaluations</h3>
                      <p className="text-xs text-slate-500">Verified evaluations submitted by task organizers upon completing assignments</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-amber-900 bg-amber-100 px-3 py-1.5 rounded-full border border-amber-200">
                    {ratingSummary.totalRatingsCount} {ratingSummary.totalRatingsCount === 1 ? 'task evaluated' : 'tasks evaluated'}
                  </span>
                </div>

                {ratingSummary.totalRatingsCount > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                    <div className="md:col-span-5 flex flex-col items-center justify-center bg-white p-5 rounded-xl border border-amber-100 text-center space-y-2 shadow-2xs">
                      <span className="text-5xl font-black text-slate-900 tracking-tight">
                        {ratingSummary.averageRating.toFixed(1)}
                      </span>
                      <div className="flex items-center gap-1 my-1 text-amber-400">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-5 h-5 ${
                              star <= Math.round(ratingSummary.averageRating)
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-200'
                            } stroke-[1.5]`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-slate-600 font-semibold">Average Performance Rating</span>

                      <div className="w-full pt-4 border-t border-slate-100 space-y-1.5">
                        {([5, 4, 3, 2, 1] as const).map((starNum) => {
                          const count = ratingSummary.distribution[starNum];
                          const pct = ratingSummary.totalRatingsCount > 0 ? Math.round((count / ratingSummary.totalRatingsCount) * 100) : 0;
                          return (
                            <div key={starNum} className="flex items-center gap-2 text-xs">
                              <span className="w-10 text-slate-600 font-semibold flex items-center gap-0.5 justify-end">
                                <span>{starNum}</span>
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400 stroke-none" />
                              </span>
                              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="w-10 text-right text-slate-400 font-mono text-[11px]">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="md:col-span-7 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <MessageSquare className="w-4 h-4 text-amber-600" />
                          <span>Evaluation History & Feedback</span>
                        </p>
                        <span className="text-[11px] text-slate-400">Aggregated anonymously</span>
                      </div>

                      {ratingSummary.recentRatings.length > 0 ? (
                        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                          {ratingSummary.recentRatings.map((r, i) => (
                            <div key={i} className="p-3.5 bg-white rounded-lg border border-slate-200 text-xs space-y-1.5 shadow-2xs">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-amber-800 flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  <span>★</span> {r.stars}.0 / 5 Stars
                                </span>
                                <span className="text-slate-400 font-medium">
                                  {new Date(r.ratedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-semibold text-slate-900">Task: {r.taskTitle}</p>
                                {r.isDepartment && (
                                  <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 text-[10px] font-bold border border-purple-200">
                                    {r.departmentName ? `${r.departmentName} Dept` : 'Department Rating'}
                                  </span>
                                )}
                              </div>
                              {r.comment && <p className="italic text-slate-600 bg-amber-50/60 p-2.5 rounded border border-amber-100 text-xs leading-relaxed">"{r.comment}"</p>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic p-6 bg-white rounded-lg border border-dashed border-amber-200 text-center">
                          No evaluation comments recorded.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 bg-white rounded-xl border border-dashed border-amber-200 text-center space-y-2">
                    <Star className="w-10 h-10 mx-auto text-amber-300 stroke-[1.5]" />
                    <p className="font-bold text-slate-800 text-sm">No Task Performance Ratings Yet</p>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      When task assigners and department organizers evaluate completed tasks assigned to you, ratings from 1 to 5 stars will aggregate here.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2.5 PERSONAL ARCHIVE TAB */}
          {activeTab === 'archive' && (
            <PersonalArchivePanel
              className="h-full min-h-0"
              onSelectTask={onSelectTask}
              onSelectMeeting={onSelectMeeting}
            />
          )}

          {/* 3. INTEGRATIONS TAB */}
          {activeTab === 'integrations' && (
            <form onSubmit={handleSaveIntegrations} className="space-y-5 w-full max-w-3xl mx-auto">
              {integrationSaved && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Integration configuration updated!</span>
                </div>
              )}

              <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Microsoft 365 Tenant Domain / ID
                  </label>
                  <input
                    type="text"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Used for MS Teams meeting context links and Azure AD SSO.
                  </span>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    SharePoint Online Root Site URL
                  </label>
                  <input
                    type="text"
                    value={sharePointUrl}
                    onChange={(e) => setSharePointUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Document library target for WIPAHS operations and department binders.
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#00ad1d] hover:bg-[#009218] text-white font-bold rounded-lg text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Integrations</span>
                </button>
              </div>
            </form>
          )}

          {/* 4. ADMIN TAB */}
          {activeTab === 'admin' && (
            <div className="space-y-5 w-full max-w-3xl mx-auto">
              <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                  <Database className="w-4 h-4 text-purple-600" />
                  <span>Data Store Status</span>
                </div>
                <p className="text-slate-600 text-xs leading-relaxed">
                  All operational records, user accounts, and department permissions are synchronized locally with instant cloud-ready fallback.
                </p>
              </div>

              <div className="p-5 border border-rose-200 bg-rose-50/50 rounded-xl space-y-3 shadow-2xs">
                <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Administrative Emergency Data Reset</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Reset the portal back to authentic WIPAHS baseline data. This resets all added tasks, notices, staff members, and custom role permissions.
                </p>
                <button
                  type="button"
                  onClick={handleResetData}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-2xs transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset All Portal Data to Defaults</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Reset All Portal Data"
        message="Reset all tasks, notices, meetings, users, departments, and roles to standard default WIPAHS sample data? This action cannot be undone."
        confirmText="Reset Defaults"
        isDestructive={true}
        onConfirm={() => {
          setShowResetConfirm(false);
          actions.resetAllData();
          onClose();
        }}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
};
