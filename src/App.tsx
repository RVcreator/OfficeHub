import {lazyPage} from './services/pageImport';
import {canViewAdministration,canManageAdministration,isAdministrationTab} from './services/administrationAccess';
import type {SettingsTabType} from './components/SettingsModal';
import React, { useState, useEffect, useRef, useTransition, Suspense } from 'react';
import { usePortalStore, getTaskSnapshot } from './services/store';
import { WorkspaceStatus } from './components/WorkspaceStatus';
import { supabase } from './services/supabaseClient';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createDeferredAuthHandler } from './services/deferredAuth';
import { createAuthStartupDeadline } from './services/authStartup';
import {retryAccountRead} from './services/authVerification';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { Header } from './components/Header';
import { Sidebar, TabId } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
const MyDayView = lazyPage(() => import('./components/MyDayView'),'MyDayView');
const TasksView = lazyPage(() => import('./components/TasksView'),'TasksView');
const SharePointView = lazyPage(() => import('./components/SharePointView'),'SharePointView');
const MeetingsTeamsView = lazyPage(() => import('./components/MeetingsTeamsView'),'MeetingsTeamsView');
const NoticesView = lazyPage(() => import('./components/NoticesView'),'NoticesView');
const ProjectsView = lazyPage(() => import('./components/ProjectsView'),'ProjectsView');
const AuditLogView = lazyPage(() => import('./components/AuditLogView'),'AuditLogView');
const ApprovalsView = lazyPage(() => import('./components/ApprovalsView'),'ApprovalsView');
const DepartmentsView = lazyPage(() => import('./components/DepartmentsView'),'DepartmentsView');
const RolesPermissionsView = lazyPage(() => import('./components/RolesPermissionsView'),'RolesPermissionsView');
const UsersView = lazyPage(() => import('./components/UsersView'),'UsersView');
const MessagesView = lazyPage(() => import('./components/MessagesView'),'MessagesView');
const StaffDirectoryView = lazyPage(() => import('./components/StaffDirectoryView'),'StaffDirectoryView');
const TeamsNotificationsView = lazyPage(() => import('./components/TeamsNotificationsView'),'TeamsNotificationsView');
const DecisionsView = lazyPage(() => import('./components/DecisionsView'),'DecisionsView');
const QuickActionModal = lazyPage(() => import('./components/QuickActionModal'),'QuickActionModal');
const ProjectModal = lazyPage(() => import('./components/ProjectModal'),'ProjectModal');
const SettingsModal = lazyPage(() => import('./components/SettingsModal'),'SettingsModal');
const LoginScreen = lazyPage(() => import('./components/LoginScreen'),'LoginScreen');
const ForcedPasswordChangeScreen = lazyPage(() => import('./components/ForcedPasswordChangeScreen'),'ForcedPasswordChangeScreen');
import { Project, StaffUser, Task } from './types';
import { isTaskAssignedByMe } from './utils/taskUtils';

function warmPage(tab:TabId){
 const name=tab.startsWith('tasks-')?'tasks':tab==='calendar'?'meetings':tab;
 const pages:Record<string,()=>Promise<unknown>>={
  'my-day':()=>import('./components/MyDayView'),tasks:()=>import('./components/TasksView'),
  documents:()=>import('./components/SharePointView'),meetings:()=>import('./components/MeetingsTeamsView'),
  notices:()=>import('./components/NoticesView'),projects:()=>import('./components/ProjectsView'),
  approvals:()=>import('./components/ApprovalsView'),departments:()=>import('./components/DepartmentsView'),
  'roles-permissions':()=>import('./components/RolesPermissionsView'),users:()=>import('./components/UsersView'),
  messages:()=>import('./components/MessagesView'),staff:()=>import('./components/StaffDirectoryView'),
  'teams-notifications':()=>import('./components/TeamsNotificationsView'),decisions:()=>import('./components/DecisionsView'),
  'audit-log':()=>import('./components/AuditLogView'),
 };
 void pages[name]?.().catch(()=>{});
}

export default function App() {
  const { authSession, currentUser, actions, administrationAccess } = usePortalStore(['authSession', 'currentUser','administrationAccess']);
  const [activeTab, setRenderedTab] = useState<TabId>('dashboard');
  const [isNavigating,startNavigation]=useTransition();
  const mainRef=useRef<HTMLElement>(null);
  const canViewAdmin=canViewAdministration(administrationAccess,authSession.userId);
  const canManageAdmin=canManageAdministration(administrationAccess,authSession.userId);
  const setActiveTab=(tab:TabId)=>{if(isAdministrationTab(tab)&&!canViewAdmin)return;startNavigation(()=>setRenderedTab(tab));};
  useEffect(()=>{if(isAdministrationTab(activeTab)&&!canViewAdmin)setRenderedTab('dashboard');},[activeTab,canViewAdmin]);
  useEffect(()=>{
    if(!authSession.isAuthenticated||!authSession.userId||authSession.mustChangePassword)return;
    const refresh=()=>{if(document.visibilityState!=='hidden')void actions.getAdministrationAccess();};
    refresh();const timer=window.setInterval(refresh,30000);
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[authSession.isAuthenticated,authSession.userId,authSession.mustChangePassword]);
  useEffect(()=>{mainRef.current?.scrollTo({top:0});},[activeTab]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [quickActionInitialTab, setQuickActionInitialTab] = useState<'task' | 'meeting' | 'notice' | 'sharepoint'>('task');
  const [quickActionInitialDate, setQuickActionInitialDate] = useState<string | undefined>(undefined);
  const [selectedStaffAssignee, setSelectedStaffAssignee] = useState<StaffUser | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTabType>('profile');
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | undefined>(undefined);
  const [projectModalInitialTab, setProjectModalInitialTab] = useState<'milestones' | 'budget' | 'tasks' | 'log'>('milestones');
  const [selectedNoticeId, setSelectedNoticeId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [authRetrying,setAuthRetrying]=useState(false);
  const retryAuth=useRef<()=>void>(()=>{});

  // Release Supabase's auth lock before resolving profiles or refreshing data.
  useEffect(() => {
    let passwordPolicyChannel: ReturnType<typeof supabase.channel> | undefined;
    let watchedUserId: string | undefined;
    const stopWatching = () => {
      if (passwordPolicyChannel) void supabase.removeChannel(passwordPolicyChannel);
      passwordPolicyChannel=undefined;watchedUserId=undefined;
    };
    const watchPasswordPolicy = (userId: string) => {
      if(watchedUserId===userId) return;
      stopWatching();watchedUserId=userId;
      passwordPolicyChannel=supabase.channel(`officehub-password-policy-${userId}`)
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles',filter:`id=eq.${userId}`},()=>recheck())
        .subscribe();
    };
    let startup: ReturnType<typeof createAuthStartupDeadline> | undefined;
    let sessionEventRevision=0;
    const deferred = createDeferredAuthHandler<AuthChangeEvent, Session | null>(async (event, session, isCurrent) => {
      try {
        if (event === 'SIGNED_OUT') {
          if(!isCurrent())return;
          stopWatching();
          await actions.logoutUser(false);
          if(isCurrent())setAuthError(false);
          return;
        }
        if (!session?.user) return;
        // Both are fresh server reads. Nothing is published until Auth and the
        // matching UUID/email profile pass validation. An explicit session JWT
        // avoids holding the SDK auth lock while the profile read starts.
        let account;
        try {
          account=await retryAccountRead(async()=>{
            const profileRead=actions.readAuthenticatedUserProfile(session.user.id).catch(error=>({data:null,error}));
            const result=await supabase.auth.getUser(session.access_token);
            if(result.error)throw result.error;
            if(!result.data.user)throw new Error('Account verification failed');
            const profile=await profileRead;
            if(profile.error)throw profile.error;
            return {verified:result.data,profile};
          },isCurrent);
        }catch(error:any){
        if(error?.status===401||error?.status===404){
          if(!isCurrent())return;
          // A token refresh can finish while an older token is being checked.
          const latest=await supabase.auth.getSession();
          if(!isCurrent())return;
          if(error.status===401&&latest.data.session&&latest.data.session.access_token!==session.access_token){
            deferred.handle('TOKEN_REFRESHED',latest.data.session);return;
          }
          stopWatching();await actions.logoutUser();setAuthError(false);return;
        }
        throw error;
        }
        const {verified,profile}=account;
        if (!isCurrent()) return;
        const resolvedUser = await actions.syncAuthenticatedUserProfile(verified.user,Promise.resolve(profile));
        if (!isCurrent()) return;
        const mustChange = actions.shouldForcePasswordChange(verified.user, resolvedUser, {
          isRecoveryEvent: event === 'PASSWORD_RECOVERY',
          isSessionRestore: event !== 'PASSWORD_RECOVERY',
        });
        actions.loginUser(resolvedUser, mustChange, session.access_token);
        watchPasswordPolicy(verified.user.id);
        setAuthError(false);
      } finally {
        if (isCurrent()) { startup?.complete(); setAuthChecking(false);setAuthRetrying(false); }
      }
    }, () => {
      startup?.complete();
      setAuthChecking(false);
      setAuthError(true);
      setAuthRetrying(false);
      console.warn('OfficeHub account verification is unavailable. Retry when connected.');
    },(event,session)=>session?`${session.user.id}:${session.access_token}:${event==='PASSWORD_RECOVERY'?'recovery':'account'}`:String(event));
    const armDeadline=()=>{
      startup?.dispose();startup=createAuthStartupDeadline(()=>{
        deferred.cancel();stopWatching();setAuthChecking(false);setAuthError(true);setAuthRetrying(false);
      },25_000);
    };
    armDeadline();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      sessionEventRevision++;
      // Keep recovery intent even if a later auth event replaces the queued event.
      if (event === 'PASSWORD_RECOVERY' && session?.user) actions.requirePasswordRecovery(session.user.id);
      deferred.handle(event, session);
    });
    const recheck = () => {
      if (document.visibilityState === 'hidden') return;
      const version=sessionEventRevision;
      void supabase.auth.getSession().then(({data,error}) => {
        if(version!==sessionEventRevision)return;
        if(error)throw error;
        if (data.session) deferred.handle('TOKEN_REFRESHED',data.session);
        else deferred.handle('SIGNED_OUT',null);
      }).catch(() => {});
    };
    retryAuth.current=()=>{setAuthRetrying(true);armDeadline();recheck();};
    // Realtime is a hint; the server's current Auth claims decide the gate.
    const timer=window.setInterval(recheck,30_000);
    window.addEventListener('focus',recheck);
    window.addEventListener('online',recheck);
    document.addEventListener('visibilitychange',recheck);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus',recheck);
      window.removeEventListener('online',recheck);
      document.removeEventListener('visibilitychange',recheck);
      stopWatching();
      startup?.dispose();
      deferred.dispose();
      subscription.unsubscribe();
      retryAuth.current=()=>{};
    };
  }, []);

  const verificationError=<div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center"><p>OfficeHub could not finish verifying your account. Check your connection and try again. Your saved work has not been changed.</p><button disabled={authRetrying} onClick={()=>retryAuth.current()}>{authRetrying?'Verifying…':'Try again'}</button></div>;
  if (authError && (!authSession.isAuthenticated||authSession.mustChangePassword)) return verificationError;

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-[#00ad1d] font-bold text-lg">Loading WIPAHS OfficeHub...</div>
      </div>
    );
  }

  // 1. Check if user is authenticated
  if (!authSession.isAuthenticated || !currentUser || currentUser.id === 'usr-default') {
    return (
      <Suspense fallback={<div role="status" className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">Opening sign in…</div>}><LoginScreen
        onLoginSuccess={(user, mustChange, token) => {
          actions.loginUser(user, mustChange, token);
        }}
      /></Suspense>
    );
  }

  // 2. Check if logged-in user must change password on first login / password recovery
  const mustChangePassword = Boolean(authSession.mustChangePassword);

  if (mustChangePassword) {
    return (
      <Suspense fallback={<div role="status" className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">Opening password settings…</div>}><ForcedPasswordChangeScreen
        user={currentUser}
        sessionToken={authSession.sessionToken}
        onPasswordChanged={(updatedUser) => actions.completeForcedPasswordChange(updatedUser)}
        onSignOut={() => {
          actions.logoutUser();
        }}
      /></Suspense>
    );
  }

  const handleSelectNotice = (id: string) => {
    setSelectedNoticeId(id);
    setSelectedTaskId(null);
    setSelectedMeetingId(null);
    setSelectedApprovalId(null);
    setActiveTab('notices');
  };

  const handleSelectTask = (id: string) => {
    setSelectedTaskId(id);
    setSelectedNoticeId(null);
    setSelectedMeetingId(null);
    setSelectedApprovalId(null);
    const task = getTaskSnapshot(id);
    if (task && currentUser && isTaskAssignedByMe(task, currentUser.id)) {
      setActiveTab('tasks-assigned-by-me');
    } else {
      setActiveTab('tasks-my-work');
    }
  };

  const handleSelectMeeting = (id: string) => {
    setSelectedMeetingId(id);
    setSelectedNoticeId(null);
    setSelectedTaskId(null);
    setSelectedApprovalId(null);
    setActiveTab('calendar');
  };

  const handleSelectApproval = (id: string) => {
    setSelectedApprovalId(id);
    setSelectedNoticeId(null);
    setSelectedTaskId(null);
    setSelectedMeetingId(null);
    setActiveTab('approvals');
  };

  const openProjectModal = (proj?: Project, tab: 'milestones' | 'budget' | 'tasks' | 'log' = 'milestones') => {
    setSelectedProject(proj);
    setProjectModalInitialTab(tab);
    setIsProjectModalOpen(true);
  };

  const handleOpenQuickAction = (
    tab: 'task' | 'meeting' | 'notice' | 'sharepoint' = 'task',
    assignee: StaffUser | null = null,
    date?: string
  ) => {
    setQuickActionInitialTab(tab);
    setSelectedStaffAssignee(assignee);
    setQuickActionInitialDate(date);
    setIsQuickActionOpen(true);
  };

  const handleAssignTaskToUser = (user: StaffUser) => {
    setSelectedStaffAssignee(user);
    setQuickActionInitialTab('task');
    setIsQuickActionOpen(true);
  };

  const handleOpenSettingsWithTab = (tab: SettingsTabType) => {
    setSettingsInitialTab(tab);
    setIsSettingsOpen(true);
  };

  return (
    <>
    {authError&&verificationError}
    <div inert={authError} aria-hidden={authError||undefined} style={authError?{display:'none'}:undefined} className="oh-shell h-dvh overflow-hidden bg-[#f1f5f9] text-[#19232d] flex flex-col font-sans">
      {/* Top Header */}
      <Header
        onOpenQuickAction={() => handleOpenQuickAction('task')}
        onOpenSettings={() => handleOpenSettingsWithTab('integrations')}
        onOpenSettingsTab={handleOpenSettingsWithTab}
        onToggleMobileMenu={() => setIsSidebarOpen(!isSidebarOpen)}
        isNavigationOpen={isSidebarOpen}
        onSearchSelect={(tab: string) => setActiveTab(tab as TabId)}
        onSelectTask={handleSelectTask}
        onSignOut={() => actions.logoutUser()}
      />

      {/* Main Body with Sidebar and Content */}
      <div className="flex-1 flex min-w-0 min-h-0 overflow-hidden">
        {/* Authentic Sidebar */}
        <Sidebar
          currentTab={activeTab}
          onWarmTab={warmPage}
          onSelectTab={(tab: TabId) => {
            setActiveTab(tab);
            setSelectedTaskId(null);
            setSelectedNoticeId(null);
            setSelectedMeetingId(null);
            setSelectedApprovalId(null);
            if (window.innerWidth < 1280) setIsSidebarOpen(false);
          }}
          onOpenQuickAction={() => handleOpenQuickAction('task')}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isSidebarVisible={isSidebarOpen}
          onCloseSidebar={() => setIsSidebarOpen(false)}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        />

        {/* Content View */}
        <main ref={mainRef} aria-busy={isNavigating} className="oh-main flex-1 min-w-0 min-h-0 overflow-y-auto p-3 sm:p-5 xl:p-6"><WorkspaceStatus/><Suspense fallback={<div role="status" className="p-6 text-slate-500">Loading your workspace…</div>}><AppErrorBoundary key={activeTab} onReturn={() => setActiveTab('dashboard')}>
          {/* Active View Router */}

            {activeTab === 'dashboard' && (
              <DashboardView
                onSelectTab={(tab: TabId) => {
                  setSelectedNoticeId(null);
                  setSelectedTaskId(null);
                  setSelectedMeetingId(null);
                  setSelectedApprovalId(null);
                  setActiveTab(tab);
                }}
                onOpenQuickAction={() => handleOpenQuickAction('task')}
                onOpenTeamsMeetingModal={() => handleOpenQuickAction('meeting')}
                onSelectNotice={handleSelectNotice}
                onSelectApproval={handleSelectApproval}
                onSelectMeeting={handleSelectMeeting}
              />
            )}

            {activeTab === 'my-day' && (
              <MyDayView
                onSelectTab={(tab: TabId) => {
                  setSelectedNoticeId(null);
                  setSelectedTaskId(null);
                  setSelectedMeetingId(null);
                  setSelectedApprovalId(null);
                  setActiveTab(tab);
                }}
                onOpenQuickAction={() => handleOpenQuickAction('task')}
                onSelectTask={handleSelectTask}
                onSelectMeeting={handleSelectMeeting}
              />
            )}

            {activeTab === 'tasks-my-work' && (
              <TasksView
                key="tasks-my-work"
                defaultCategory="my-work"
                selectedTaskId={selectedTaskId}
                onClearSelectedTask={() => setSelectedTaskId(null)}
                onCategoryChange={(cat) => {
                  setSelectedTaskId(null);
                  setActiveTab(
                    cat === 'my-work' ? 'tasks-my-work' :
                    cat === 'department' ? 'tasks-department' :
                    cat === 'assigned-by-me' ? 'tasks-assigned-by-me' : 'tasks-all'
                  );
                }}
                onOpenNewTaskModal={() => handleOpenQuickAction('task')}
              />
            )}

            {activeTab === 'tasks-department' && (
              <TasksView
                key="tasks-department"
                defaultCategory="department"
                selectedTaskId={selectedTaskId}
                onClearSelectedTask={() => setSelectedTaskId(null)}
                onCategoryChange={(cat) => {
                  setSelectedTaskId(null);
                  setActiveTab(
                    cat === 'my-work' ? 'tasks-my-work' :
                    cat === 'department' ? 'tasks-department' :
                    cat === 'assigned-by-me' ? 'tasks-assigned-by-me' : 'tasks-all'
                  );
                }}
                onOpenNewTaskModal={() => handleOpenQuickAction('task')}
              />
            )}

            {activeTab === 'tasks-assigned-by-me' && (
              <TasksView
                key="tasks-assigned-by-me"
                defaultCategory="assigned-by-me"
                selectedTaskId={selectedTaskId}
                onClearSelectedTask={() => setSelectedTaskId(null)}
                onCategoryChange={(cat) => {
                  setSelectedTaskId(null);
                  setActiveTab(
                    cat === 'my-work' ? 'tasks-my-work' :
                    cat === 'department' ? 'tasks-department' :
                    cat === 'assigned-by-me' ? 'tasks-assigned-by-me' : 'tasks-all'
                  );
                }}
                onOpenNewTaskModal={() => handleOpenQuickAction('task')}
              />
            )}

            {activeTab === 'tasks-all' && (
              <TasksView
                key="tasks-all"
                defaultCategory="all"
                selectedTaskId={selectedTaskId}
                onClearSelectedTask={() => setSelectedTaskId(null)}
                onCategoryChange={(cat) => {
                  setSelectedTaskId(null);
                  setActiveTab(
                    cat === 'my-work' ? 'tasks-my-work' :
                    cat === 'department' ? 'tasks-department' :
                    cat === 'assigned-by-me' ? 'tasks-assigned-by-me' : 'tasks-all'
                  );
                }}
                onOpenNewTaskModal={() => handleOpenQuickAction('task')}
              />
            )}

            {activeTab === 'meetings' && (
              <MeetingsTeamsView
                initialMode="list"
                selectedMeetingId={selectedMeetingId}
                onOpenScheduleModal={() => handleOpenQuickAction('meeting')}
                onOpenQuickAction={handleOpenQuickAction}
                onSelectTask={handleSelectTask}
                onSelectMeeting={handleSelectMeeting}
              />
            )}

            {activeTab === 'calendar' && (
              <MeetingsTeamsView
                initialMode="calendar"
                selectedMeetingId={selectedMeetingId}
                onOpenScheduleModal={() => handleOpenQuickAction('meeting')}
                onOpenQuickAction={handleOpenQuickAction}
                onSelectTask={handleSelectTask}
                onSelectMeeting={handleSelectMeeting}
              />
            )}

            {activeTab === 'projects' && (
              <ProjectsView onOpenNewProjectModal={openProjectModal} />
            )}

            {activeTab === 'approvals' && (
              <ApprovalsView selectedApprovalId={selectedApprovalId} />
            )}

            {activeTab === 'decisions' && (
              <DecisionsView />
            )}

            {activeTab === 'documents' && (
              <SharePointView onOpenUploadModal={() => handleOpenQuickAction('sharepoint')} />
            )}

            {activeTab === 'notices' && (
              <NoticesView
                selectedNoticeId={selectedNoticeId}
                onOpenNewNoticeModal={() => handleOpenQuickAction('notice')}
              />
            )}

            {canViewAdmin && activeTab === 'departments' && (
              <DepartmentsView readOnly={!canManageAdmin} onSelectDepartmentTasks={() => setActiveTab('tasks-department')} />
            )}

            {canViewAdmin && activeTab === 'users' && (
              <UsersView readOnly={!canManageAdmin} onAssignTaskToUser={handleAssignTaskToUser} />
            )}

            {activeTab === 'staff' && (
              <StaffDirectoryView onAssignTaskToUser={handleAssignTaskToUser} />
            )}

            {canViewAdmin && activeTab === 'roles-permissions' && (
              <RolesPermissionsView />
            )}

            {canViewAdmin && activeTab === 'audit-log' && (
              <AuditLogView />
            )}

            {activeTab === 'teams-notifications' && (
              <TeamsNotificationsView onSelectTask={handleSelectTask} />
            )}

            {activeTab === 'messages' && (
              <MessagesView />
            )}
          </AppErrorBoundary></Suspense>
        </main>
      </div>

      {/* Global Modals */}
      <AppErrorBoundary key={`${isQuickActionOpen}-${isSettingsOpen}-${isProjectModalOpen}`} onReturn={()=>{setIsQuickActionOpen(false);setIsSettingsOpen(false);setIsProjectModalOpen(false);}}>
      <Suspense fallback={<div role="status" className="fixed bottom-4 right-4 rounded bg-white p-3 shadow">Loading…</div>}>
      {isQuickActionOpen && <QuickActionModal
        isOpen={isQuickActionOpen}
        initialTab={quickActionInitialTab}
        initialDate={quickActionInitialDate}
        defaultAssignee={selectedStaffAssignee}
        onSelectTask={handleSelectTask}
        onClose={() => setIsQuickActionOpen(false)}
      />}

      {isSettingsOpen && <SettingsModal
        isOpen={isSettingsOpen}
        initialTab={settingsInitialTab}
        onSelectTask={handleSelectTask}
        onSelectMeeting={handleSelectMeeting}
        onClose={() => setIsSettingsOpen(false)}
      />}

      {isProjectModalOpen && <ProjectModal
        isOpen={isProjectModalOpen}
        project={selectedProject}
        initialTab={projectModalInitialTab}
        onClose={() => { setSelectedProject(undefined); setIsProjectModalOpen(false); }}
      />}
      </Suspense>
      </AppErrorBoundary>
    </div>
    </>
  );
}
