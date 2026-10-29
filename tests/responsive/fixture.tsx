// Synthetic layout fixtures only; never used by the production entry point.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {portalStore, setTableData} from '../../src/services/store';
import {supabase} from '../../src/services/supabaseClient';
import {Header} from '../../src/components/Header';
import {Sidebar} from '../../src/components/Sidebar';
import {DashboardView} from '../../src/components/DashboardView';
import {TasksView} from '../../src/components/TasksView';
import {MeetingsTeamsView} from '../../src/components/MeetingsTeamsView';
import {SharePointView} from '../../src/components/SharePointView';
import {ProjectsView} from '../../src/components/ProjectsView';
import {MessagesView} from '../../src/components/MessagesView';
import {SettingsModal} from '../../src/components/SettingsModal';
import {QuickActionModal} from '../../src/components/QuickActionModal';
import {StaffDirectoryView} from '../../src/components/StaffDirectoryView';
import {NoticesView} from '../../src/components/NoticesView';
import {ApprovalsView} from '../../src/components/ApprovalsView';
import {DepartmentsView} from '../../src/components/DepartmentsView';
import {RolesPermissionsView} from '../../src/components/RolesPermissionsView';
import {MyDayView} from '../../src/components/MyDayView';
import {AnalyticsView} from '../../src/components/AnalyticsView';
import {UsersView} from '../../src/components/UsersView';
import {CreateProjectModal} from '../../src/components/CreateProjectModal';
import {ProjectModal} from '../../src/components/ProjectModal';
const user:any={id:'layout-user',name:'Amina Example',email:'layout@example.invalid',organisation:'WIPAHS',department:'Logistics and Operations',role:'Super Admin',status:'Online',avatar:'',tasksCount:3,activityScore:85,lastActive:'Just now',phone:''};
const tasks:any[]=Array.from({length:4},(_,i)=>({id:`layout-${i}`,title:i===0?'Prepare the quarterly community programme and detailed implementation schedule':'Coordinate departmental planning and review',description:'A deliberately long description to check wrapping and readable spacing.',department:user.department,organisation:'WIPAHS',status:'To Do',priority:'High',assignedToId:user.id,assignedToName:user.name,assignedById:user.id,assignedByName:user.name,assignmentType:'personal',dueDate:'2026-10-30',createdAt:'2026-10-28T09:00:00Z',subtasks:[],attachments:[],updates:[]}));
const data:any={Staff:[user],Tasks:tasks,Notices:[],Meetings:[],Approvals:[],SharePointDocs:[],FolderList:['General','Finance and operational planning documents'],Projects:[],AuditLogs:[],Departments:[],Conversations:[],Messages:[],Notifications:[],Decisions:[]};
if(new URLSearchParams(location.search).has('deletion-test')){
 data.Staff.push({...user,id:'10000000-0000-4000-8000-000000000002',name:'Deletion Fixture',email:'delete-fixture@example.invalid',role:'Staff Member'});
 (supabase.auth as any).getSession=async()=>({data:{session:{access_token:'fixture-token'}},error:null});
 let calls=0;Object.defineProperty(supabase,'functions',{configurable:true,value:{invoke:async(name:string,options:any)=>{
  if(name!=='admin-delete-user'||options.body.confirmEmail!=='delete-fixture@example.invalid')throw Error('Unexpected fixture request');
  return ++calls===1?{data:{error:'Fixture deletion blocked'},error:null}:{data:{success:true,userId:options.body.userId,deletedEmail:options.body.confirmEmail,emailReleased:true},error:null};
 }}});
}
data.Projects=[{id:'project-layout',name:'Community services and infrastructure improvement programme',description:'Sample project for layout checks only.',department:user.department,leadId:user.id,leadName:user.name,status:'On Track',progress:35,startDate:'2026-10-01',targetDate:'2026-12-01',membersCount:3,sharePointFolderUrl:'',activeTasksCount:4,overdueTasksCount:0,milestones:[],budgetBreakdown:[],impactMetrics:[],expenses:[]}];
data.Meetings=[{id:'meeting-layout',title:'Programme coordination and departmental planning review',department:user.department,date:'2026-10-28',startTime:'10:00',endTime:'11:00',organizerId:user.id,organizerName:user.name,attendees:[],agenda:['Review progress'],meetingType:'Microsoft Teams',status:'Scheduled'}];
data.SharePointDocs=[{id:'doc-layout',name:'Community programme operational planning and implementation guidelines.docx',folder:'General',fileType:'docx',size:'25 KB',uploadedBy:user.name,uploadedById:user.id,uploadedAt:'2026-10-28',lastModified:'2026-10-28',visibility:'Everyone',allowedUserIds:[],editableUserIds:[],url:'#',syncStatus:'Synced'}];
for(const [name,rows] of Object.entries(data)) (portalStore as any)[`get${name}`]=async()=>rows;
for(const name of ['initRealtime','markAllNotificationsAsRead']) (portalStore as any)[name]=async()=>{};
setTableData('currentUser',user);setTableData('tasks',tasks);setTableData('staff',data.Staff);setTableData('loading',false);
setTableData('projects',data.Projects);setTableData('sharePointDocs',data.SharePointDocs);
function Fixture(){
 const params=new URLSearchParams(location.search);const [tab,setTab]=useState(params.get('view')||'dashboard');const [nav,setNav]=useState(false);const [modal,setModal]=useState(params.get('modal')||'');
 const open=()=>setModal('quick');const noop=()=>{};
 return <div className="min-h-screen bg-[#f1f5f9] text-[#19232d] flex flex-col font-sans"><Header isNavigationOpen={nav} onToggleMobileMenu={()=>setNav(!nav)} onOpenQuickAction={open} onOpenSettings={()=>setModal('settings')}/><div className="flex-1 flex min-w-0"><Sidebar currentTab={tab as any} onSelectTab={t=>{setTab(t);setNav(false)}} onOpenQuickAction={open} onOpenSettings={()=>setModal('settings')} isSidebarVisible={nav} onCloseSidebar={()=>setNav(false)}/><main className="oh-main flex-1 min-w-0 p-3 sm:p-5 xl:p-6">
 {tab==='dashboard'?<DashboardView onSelectTab={t=>setTab(t)} onOpenQuickAction={open} onOpenTeamsMeetingModal={open}/>:tab.startsWith('tasks')?<TasksView onOpenNewTaskModal={open}/>:tab==='calendar'||tab==='meetings'?<MeetingsTeamsView initialMode={tab==='calendar'?'calendar':'list'} onOpenScheduleModal={open}/>:tab==='documents'?<SharePointView onOpenUploadModal={open}/>:tab==='projects'?<ProjectsView onOpenNewProjectModal={open}/>:tab==='messages'?<MessagesView/>:null}
 {tab==='staff'&&<StaffDirectoryView onAssignTaskToUser={open}/>}{tab==='notices'&&<NoticesView onOpenNewNoticeModal={open}/>}{tab==='approvals'&&<ApprovalsView/>}{tab==='departments'&&<DepartmentsView onSelectDepartmentTasks={noop}/>}{tab==='roles-permissions'&&<RolesPermissionsView/>}{tab==='my-day'&&<MyDayView onSelectTab={t=>setTab(t)} onOpenQuickAction={open}/>}{tab==='analytics'&&<AnalyticsView/>}{tab==='users'&&<UsersView onAssignTaskToUser={open}/>}
 </main></div><QuickActionModal isOpen={modal==='quick'} onClose={()=>setModal('')}/><SettingsModal isOpen={modal==='settings'} onClose={()=>setModal('')}/><CreateProjectModal isOpen={modal==='create-project'} onClose={()=>setModal('')}/><ProjectModal isOpen={modal==='project'} project={data.Projects[0]} onClose={()=>setModal('')}/></div>
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
