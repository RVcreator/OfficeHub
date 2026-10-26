import React, { useState, useEffect, Suspense, lazy } from 'react';
import { usePortalStore } from './services/store';
import { supabase } from './services/supabaseClient';
import { Header } from './components/Header';
import { Sidebar, TabId } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { MyDayView } from './components/MyDayView';
import { TasksView } from './components/TasksView';
import { SharePointView } from './components/SharePointView';
import { MeetingsTeamsView } from './components/MeetingsTeamsView';
import { NoticesView } from './components/NoticesView';
import { ProjectsView } from './components/ProjectsView';
const AuditLogView = lazy(() => import('./components/AuditLogView').then(m => ({ default: m.AuditLogView })));
const ApprovalsView = lazy(() => import('./components/ApprovalsView').then(m => ({ default: m.ApprovalsView })));
const DepartmentsView = lazy(() => import('./components/DepartmentsView').then(m => ({ default: m.DepartmentsView })));
const RolesPermissionsView = lazy(() => import('./components/RolesPermissionsView').then(m => ({ default: m.RolesPermissionsView })));
const UsersView = lazy(() => import('./components/UsersView').then(m => ({ default: m.UsersView })));
const MessagesView = lazy(() => import('./components/MessagesView').then(m => ({ default: m.MessagesView })));
const StaffDirectoryView = lazy(() => import('./components/StaffDirectoryView').then(m => ({ default: m.StaffDirectoryView })));
const TeamsNotificationsView = lazy(() => import('./components/TeamsNotificationsView').then(m => ({ default: m.TeamsNotificationsView })));
const DecisionsView = lazy(() => import('./components/DecisionsView').then(m => ({ default: m.DecisionsView })));
import { QuickActionModal } from './components/QuickActionModal';
import { ProjectModal } from './components/ProjectModal';
import { SettingsModal, SettingsTabType } from './components/SettingsModal';
import { LoginScreen } from './components/LoginScreen';
import { ForcedPasswordChangeScreen } from './components/ForcedPasswordChangeScreen';
import { Project, StaffUser, Task } from './types';

export default function App() {
  const { authSession, currentUser, tasks, staff, actions, loading } = usePortalStore();

  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
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

  // Sync Supabase Auth session & handle password recovery redirects
  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        if (!isMounted) return;
        if (session?.user) {
          const resolvedUser = await actions.syncAuthenticatedUserProfile(session.user);
          if (!isMounted) return;
          const mustChange = actions.shouldForcePasswordChange(session.user, resolvedUser, {
            isSessionRestore: true,
          });
          actions.loginUser(resolvedUser, mustChange, session.access_token);
        }
      } finally {
        if (isMounted) setAuthChecking(false);
      }
    }).catch(() => {
      if (isMounted) setAuthChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        const resolvedUser = await actions.syncAuthenticatedUserProfile(session.user);
        if (!isMounted) return;
        const mustChange = actions.shouldForcePasswordChange(session.user, resolvedUser, {
          isRecoveryEvent: true,
        });
        actions.loginUser(resolvedUser, mustChange, session.access_token);
      } else if (event === 'SIGNED_IN' && session?.user && !actions.getAuthSession().isAuthenticated) {
        const resolvedUser = await actions.syncAuthenticatedUserProfile(session.user);
        if (!isMounted) return;
        const mustChange = actions.shouldForcePasswordChange(session.user, resolvedUser, {
          isSessionRestore: true,
        });
        actions.loginUser(resolvedUser, mustChange, session.access_token);
      } else if (event === 'SIGNED_OUT') {
        actions.logoutUser();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading || authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-[#00ad1d] font-bold text-lg">Loading WIPAHS OfficeHub...</div>
      </div>
    );
  }

  // 1. Check if user is authenticated
  if (!authSession.isAuthenticated || !currentUser || currentUser.id === 'usr-default') {
    return (
      <LoginScreen
        onLoginSuccess={(user, mustChange, token) => {
          actions.loginUser(user, mustChange, token);
        }}
      />
    );
  }

  // 2. Check if logged-in user must change password on first login / password recovery
  const mustChangePassword = Boolean(authSession.mustChangePassword);

  if (mustChangePassword) {
    return (
      <ForcedPasswordChangeScreen
        user={currentUser}
        sessionToken={authSession.sessionToken}
        onPasswordChanged={(updatedUser) => {
          actions.completeForcedPasswordChange(updatedUser.temporaryPassword || 'updated');
        }}
        onSignOut={() => {
          actions.logoutUser();
        }}
      />
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
    const task = tasks.find((t: Task) => t.id === id);
    if (task && currentUser && task.createdById === currentUser.id) {
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
    <div className="min-h-screen bg-[#f1f5f9] text-[#19232d] flex flex-col font-sans">
      {/* Top Header */}
      <Header
        onOpenQuickAction={() => handleOpenQuickAction('task')}
        onOpenSettings={() => handleOpenSettingsWithTab('integrations')}
        onOpenSettingsTab={handleOpenSettingsWithTab}
        onToggleMobileMenu={() => setIsSidebarOpen(!isSidebarOpen)}
        onSearchSelect={(tab: string) => setActiveTab(tab as TabId)}
        onSelectTask={handleSelectTask}
        onSignOut={() => actions.logoutUser()}
      />

      {/* Main Body with Sidebar and Content */}
      <div className="flex-1 flex">
        {/* Authentic Sidebar */}
        <Sidebar
          currentTab={activeTab}
          onSelectTab={(tab: TabId) => {
            setActiveTab(tab);
            setSelectedTaskId(null);
            setSelectedNoticeId(null);
            setSelectedMeetingId(null);
            setSelectedApprovalId(null);
            if (window.innerWidth < 1024) setIsSidebarOpen(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenQuickAction={() => handleOpenQuickAction('task')}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isSidebarVisible={isSidebarOpen}
          onCloseSidebar={() => setIsSidebarOpen(false)}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        />

        {/* Content View */}
        <main className="flex-1 min-w-0 p-4 lg:p-6 overflow-y-auto"><Suspense fallback={<div className="p-6 text-slate-500">Loading view...</div>}>
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

            {activeTab === 'departments' && (
              <DepartmentsView onSelectDepartmentTasks={() => setActiveTab('tasks-department')} />
            )}

            {activeTab === 'users' && (
              <UsersView onAssignTaskToUser={handleAssignTaskToUser} />
            )}

            {activeTab === 'staff' && (
              <StaffDirectoryView onAssignTaskToUser={handleAssignTaskToUser} />
            )}

            {activeTab === 'roles-permissions' && (
              <RolesPermissionsView />
            )}

            {activeTab === 'audit-log' && (
              <AuditLogView />
            )}

            {activeTab === 'teams-notifications' && (
              <TeamsNotificationsView onSelectTask={handleSelectTask} />
            )}

            {activeTab === 'messages' && (
              <MessagesView />
            )}
          </Suspense>
        </main>
      </div>

      {/* Global Modals */}
      <QuickActionModal
        isOpen={isQuickActionOpen}
        initialTab={quickActionInitialTab}
        initialDate={quickActionInitialDate}
        defaultAssignee={selectedStaffAssignee}
        onSelectTask={handleSelectTask}
        onClose={() => setIsQuickActionOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        initialTab={settingsInitialTab}
        onSelectTask={handleSelectTask}
        onSelectMeeting={handleSelectMeeting}
        onClose={() => setIsSettingsOpen(false)}
      />

      <ProjectModal
        isOpen={isProjectModalOpen}
        project={selectedProject}
        initialTab={projectModalInitialTab}
        onClose={() => { setSelectedProject(undefined); setIsProjectModalOpen(false); }}
      />
    </div>
  );
}
