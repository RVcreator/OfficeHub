-- =========================================================================
-- WIPAHS OfficeHub Complete Supabase Migration
-- Execution Order: Extensions -> Tables -> Functions -> Policies -> Triggers
-- Fully Idempotent: Can be safely executed multiple times in Supabase SQL Editor
-- =========================================================================

-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- =========================================================================
-- 1. TABLES CREATION (All base tables first to avoid relation dependency errors)
-- =========================================================================

-- A. PROFILES (StaffUser) - references auth.users with cascade delete
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  email text not null unique,
  role text not null default 'Staff Member',
  organisation text not null default 'WIPAHS',
  department text not null default 'General',
  status text not null default 'Offline',
  avatar text,
  phone text,
  activity_score integer default 85,
  tasks_count integer default 0,
  last_active text default 'Just now',
  teams_handle text,
  birthday text,
  bio text,
  location text,
  average_rating numeric(3,2) default 0.00,
  total_ratings_count integer default 0,
  out_of_office boolean default false,
  out_of_office_message text,
  leave_type text,
  leave_start_date text,
  leave_end_date text,
  backup_contact_id uuid references public.profiles(id) on delete set null,
  must_change_password boolean default false,
  temporary_password text,
  app_metadata jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

-- B. DEPARTMENTS (DepartmentInfo)
create table if not exists public.departments (
  id text primary key,
  name text not null,
  description text,
  head_id uuid references public.profiles(id) on delete set null,
  head_name text,
  member_count integer default 0,
  colour text default 'emerald',
  created_at timestamptz default timezone('utc'::text, now()) not null
);

-- C. SHAREPOINT DOCUMENTS (Metadata only)
create table if not exists public.sharepoint_documents (
  id text primary key,
  name text not null,
  folder text not null default 'General',
  graph_drive_item_id text,
  web_url text,
  modified_at text,
  modified_by text,
  version text default '1.0',
  visibility text default 'Department',
  target_department text,
  allowed_user_ids text[] default '{}',
  editable_user_ids text[] default '{}',
  synced_with_sharepoint boolean default true,
  content_summary text,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

-- D. PROJECTS & PROJECT SUB-ENTITIES
create table if not exists public.projects (
  id text primary key,
  title text not null,
  description text,
  department text not null default 'General',
  leader_id uuid references public.profiles(id) on delete set null,
  leader_name text,
  status text not null default 'Active',
  progress integer default 0,
  budget numeric(12,2) default 0.00,
  spent numeric(12,2) default 0.00,
  start_date text,
  target_date text,
  priority text default 'Medium',
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create table if not exists public.project_milestones (
  id text primary key,
  project_id text references public.projects(id) on delete cascade,
  title text not null,
  due_date text,
  completed boolean default false,
  assignee text
);

create table if not exists public.project_budget_categories (
  id text primary key,
  project_id text references public.projects(id) on delete cascade,
  category text not null,
  allocated numeric(12,2) default 0,
  spent numeric(12,2) default 0
);

create table if not exists public.project_impact_metrics (
  id text primary key,
  project_id text references public.projects(id) on delete cascade,
  metric_name text not null,
  current_value numeric(12,2) default 0,
  target_value numeric(12,2) default 0,
  unit text
);

create table if not exists public.project_activity_log (
  id text primary key,
  project_id text references public.projects(id) on delete cascade,
  action text not null,
  author text,
  timestamp text
);

create table if not exists public.project_members (
  project_id text references public.projects(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (project_id, user_id)
);

-- E. TASKS & TASK SUB-ENTITIES
create table if not exists public.tasks (
  id text primary key,
  title text not null,
  description text,
  status text not null default 'To Do',
  priority text not null default 'Normal',
  department text not null default 'General',
  organisation text not null default 'WIPAHS',
  assigned_to_id uuid references public.profiles(id) on delete set null,
  assigned_to_name text,
  assigned_to_avatar text,
  assigned_to_ids text[] default '{}',
  created_by_id uuid references public.profiles(id) on delete set null,
  created_by_name text,
  due_date text,
  project_id text references public.projects(id) on delete set null,
  sharepoint_doc_id text references public.sharepoint_documents(id) on delete set null,
  pending_rating boolean default false,
  rating jsonb,
  completed_at text,
  cancelled_at text,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create table if not exists public.task_assignees (
  task_id text references public.tasks(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (task_id, user_id)
);

create table if not exists public.task_subtasks (
  id text primary key,
  task_id text references public.tasks(id) on delete cascade,
  title text not null,
  completed boolean default false
);

create table if not exists public.task_ratings (
  id text primary key,
  task_id text references public.tasks(id) on delete cascade,
  rated_user_id uuid references public.profiles(id) on delete cascade,
  rated_by_id uuid references public.profiles(id) on delete set null,
  rating integer not null,
  comment text,
  rated_at text
);

-- F. NOTICES & TARGETS
create table if not exists public.notices (
  id text primary key,
  title text not null,
  content text not null,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  author_role text not null,
  author_avatar text,
  department text not null default 'General',
  organisation text not null default 'WIPAHS',
  priority text not null default 'Normal',
  created_at text not null,
  pinned boolean default false,
  expires_at text
);

create table if not exists public.notice_targets (
  notice_id text references public.notices(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  primary key (notice_id, target_type, target_id)
);

create table if not exists public.notice_acknowledgements (
  notice_id text references public.notices(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  acknowledged_at text not null,
  primary key (notice_id, user_id)
);

-- G. MEETINGS & ATTENDEES
create table if not exists public.meetings (
  id text primary key,
  title text not null,
  department text not null default 'General',
  date text not null,
  time text,
  start_time text not null,
  end_time text not null,
  duration_minutes integer,
  description text,
  organizer_id uuid references public.profiles(id) on delete set null,
  organizer_name text not null,
  agenda text[] default '{}',
  meeting_type text not null default 'Microsoft Teams',
  teams_join_url text,
  teams_meeting_id text,
  teams_passcode text,
  minutes text,
  status text not null default 'Scheduled',
  recurrence text default 'None',
  chair_id uuid references public.profiles(id) on delete set null,
  chair_name text,
  chair_email text,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create table if not exists public.meeting_attendees (
  meeting_id text references public.meetings(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  email text not null,
  status text not null default 'Pending',
  avatar text,
  proposed_date text,
  proposed_time text,
  proposed_end_time text,
  proposal_note text,
  note text,
  comment text,
  responded_at text,
  primary key (meeting_id, user_id)
);

-- H. MESSAGING & CONVERSATIONS
create table if not exists public.conversations (
  id text primary key,
  title text,
  type text not null default 'direct',
  last_message text,
  last_message_time text,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create table if not exists public.conversation_participants (
  conversation_id text references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id text primary key,
  conversation_id text references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_name text not null,
  sender_avatar text,
  text text not null,
  timestamp text not null,
  reply_to_id text,
  reactions jsonb default '[]'::jsonb
);

create table if not exists public.message_attachments (
  id text primary key,
  message_id text references public.messages(id) on delete cascade,
  name text not null,
  size text,
  type text,
  url text,
  text_content text
);

-- I. NOTIFICATIONS & COMMS
create table if not exists public.notifications (
  id text primary key,
  title text not null,
  message text not null,
  type text not null default 'general',
  meeting_id text,
  target_user_id text not null,
  created_at text not null,
  read boolean default false,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  actor_avatar text,
  priority text default 'Normal',
  pushed_to_microsoft_teams boolean default true,
  email_triggered boolean default false,
  email_recipients text[] default '{}',
  email_sent_at text,
  email_subject text,
  metadata jsonb default '{}'::jsonb
);

create table if not exists public.dispatched_emails (
  id text primary key,
  notification_id text references public.notifications(id) on delete cascade,
  recipient_email text not null,
  recipient_name text not null,
  subject text not null,
  body_html text not null,
  body_text text not null,
  sent_at text not null,
  status text not null default 'Sent'
);

create table if not exists public.teams_notification_rules (
  id text primary key,
  title text not null,
  event_type text not null,
  department text not null default 'All',
  teams_webhook_url text not null,
  enabled boolean default true,
  created_at text not null
);

-- J. GOVERNANCE
create table if not exists public.decisions (
  id text primary key,
  title text not null,
  context text not null,
  decision text not null,
  department text not null default 'General',
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  date text not null,
  status text not null default 'Active',
  tags text[] default '{}'
);

create table if not exists public.approvals (
  id text primary key,
  title text not null,
  description text not null,
  type text not null default 'Budget',
  amount numeric(12,2),
  department text not null default 'General',
  requested_by_id uuid references public.profiles(id) on delete set null,
  requested_by_name text not null,
  requested_date text not null,
  status text not null default 'Pending',
  approved_by text,
  approved_date text,
  notes text,
  urgency text not null default 'Normal'
);

create table if not exists public.audit_log (
  id text primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  actor_email text not null,
  event_type text not null,
  target_name text not null,
  timestamp text not null,
  badge_color text not null default 'blue'
);

create table if not exists public.role_permissions (
  role_id text primary key,
  role_name text not null,
  description text,
  permissions jsonb not null default '{}'::jsonb
);

-- =========================================================================
-- 2. HELPER FUNCTIONS (Includes Admin/Manager roles and IT/Executive departments)
-- =========================================================================

create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (
        role ILIKE '%Admin%'
        or role ILIKE '%Manager%'
        or role ILIKE '%Director%'
        or department ILIKE '%IT%'
        or department ILIKE '%Executive%'
      )
  );
end;
$$ language plpgsql security definer;

create or replace function public.current_department()
returns text as $$
declare
  dept text;
begin
  select department into dept from public.profiles where id = auth.uid();
  return coalesce(dept, 'General');
end;
$$ language plpgsql security definer;

-- =========================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

-- Profiles
alter table public.profiles enable row level security;
drop policy if exists "Profiles viewable by everyone in organisation or admins" on public.profiles;
create policy "Profiles viewable by everyone in organisation or admins" on public.profiles for select using (true);

drop policy if exists "Profiles updatable by self or admin" on public.profiles;
create policy "Profiles updatable by self or admin" on public.profiles for update using (id = auth.uid() or public.is_admin());

drop policy if exists "Profiles insertable by admin" on public.profiles;
create policy "Profiles insertable by admin" on public.profiles for insert with check (public.is_admin() or id = auth.uid());

drop policy if exists "Profiles deletable by admin" on public.profiles;
create policy "Profiles deletable by admin" on public.profiles for delete using (public.is_admin());

-- Departments
alter table public.departments enable row level security;
drop policy if exists "Departments viewable by all authenticated" on public.departments;
create policy "Departments viewable by all authenticated" on public.departments for select using (auth.role() = 'authenticated');

drop policy if exists "Departments manageable by admin" on public.departments;
create policy "Departments manageable by admin" on public.departments for all using (public.is_admin());

-- SharePoint Documents
alter table public.sharepoint_documents enable row level security;
drop policy if exists "Documents viewable by visibility rules or admin" on public.sharepoint_documents;
create policy "Documents viewable by visibility rules or admin" on public.sharepoint_documents for select using (
  public.is_admin() or visibility = 'All' or (visibility = 'Department' and target_department = public.current_department()) or (visibility = 'Restricted' and (auth.uid()::text = ANY(allowed_user_ids) or auth.uid()::text = ANY(editable_user_ids)))
);

drop policy if exists "Documents manageable by admin or editors" on public.sharepoint_documents;
create policy "Documents manageable by admin or editors" on public.sharepoint_documents for all using (
  public.is_admin() or auth.uid()::text = ANY(editable_user_ids)
);

-- Projects & Sub-entities
alter table public.projects enable row level security;
drop policy if exists "Projects viewable by department or admin" on public.projects;
create policy "Projects viewable by department or admin" on public.projects for select using (public.is_admin() or department = public.current_department() or status = 'Active');

drop policy if exists "Projects manageable by admin" on public.projects;
create policy "Projects manageable by admin" on public.projects for all using (public.is_admin());

alter table public.project_milestones enable row level security;
drop policy if exists "Milestones viewable by project viewers" on public.project_milestones;
create policy "Milestones viewable by project viewers" on public.project_milestones for select using (true);

drop policy if exists "Milestones manageable by admin" on public.project_milestones;
create policy "Milestones manageable by admin" on public.project_milestones for all using (public.is_admin());

alter table public.project_budget_categories enable row level security;
drop policy if exists "Budget categories viewable" on public.project_budget_categories;
create policy "Budget categories viewable" on public.project_budget_categories for select using (true);

drop policy if exists "Budget categories manageable by admin" on public.project_budget_categories;
create policy "Budget categories manageable by admin" on public.project_budget_categories for all using (public.is_admin());

alter table public.project_impact_metrics enable row level security;
drop policy if exists "Impact metrics viewable" on public.project_impact_metrics;
create policy "Impact metrics viewable" on public.project_impact_metrics for select using (true);

drop policy if exists "Impact metrics manageable by admin" on public.project_impact_metrics;
create policy "Impact metrics manageable by admin" on public.project_impact_metrics for all using (public.is_admin());

alter table public.project_activity_log enable row level security;
drop policy if exists "Activity log viewable" on public.project_activity_log;
create policy "Activity log viewable" on public.project_activity_log for select using (true);

drop policy if exists "Activity log manageable by admin" on public.project_activity_log;
create policy "Activity log manageable by admin" on public.project_activity_log for all using (public.is_admin());

alter table public.project_members enable row level security;
drop policy if exists "Project members viewable" on public.project_members;
create policy "Project members viewable" on public.project_members for select using (true);

drop policy if exists "Project members manageable by admin" on public.project_members;
create policy "Project members manageable by admin" on public.project_members for all using (public.is_admin());

-- Tasks & Sub-entities
alter table public.tasks enable row level security;
drop policy if exists "Tasks viewable by assignee, creator, department or admin" on public.tasks;
create policy "Tasks viewable by assignee, creator, department or admin" on public.tasks for select using (
  public.is_admin() or assigned_to_id = auth.uid() or created_by_id = auth.uid() or auth.uid()::text = ANY(assigned_to_ids) or department = public.current_department()
);

drop policy if exists "Tasks insertable by authenticated" on public.tasks;
create policy "Tasks insertable by authenticated" on public.tasks for insert with check (auth.role() = 'authenticated');

drop policy if exists "Tasks updatable by assignee, creator or admin" on public.tasks;
create policy "Tasks updatable by assignee, creator or admin" on public.tasks for update using (
  public.is_admin() or assigned_to_id = auth.uid() or created_by_id = auth.uid() or auth.uid()::text = ANY(assigned_to_ids)
);

drop policy if exists "Tasks deletable by creator or admin" on public.tasks;
create policy "Tasks deletable by creator or admin" on public.tasks for delete using (public.is_admin() or created_by_id = auth.uid());

alter table public.task_assignees enable row level security;
drop policy if exists "Task assignees viewable" on public.task_assignees;
create policy "Task assignees viewable" on public.task_assignees for select using (true);

drop policy if exists "Task assignees manageable by admin" on public.task_assignees;
create policy "Task assignees manageable by admin" on public.task_assignees for all using (public.is_admin());

alter table public.task_subtasks enable row level security;
drop policy if exists "Subtasks viewable" on public.task_subtasks;
create policy "Subtasks viewable" on public.task_subtasks for select using (true);

drop policy if exists "Subtasks manageable by task participants" on public.task_subtasks;
create policy "Subtasks manageable by task participants" on public.task_subtasks for all using (auth.role() = 'authenticated');

alter table public.task_ratings enable row level security;
drop policy if exists "Task ratings viewable" on public.task_ratings;
create policy "Task ratings viewable" on public.task_ratings for select using (true);

drop policy if exists "Task ratings manageable" on public.task_ratings;
create policy "Task ratings manageable" on public.task_ratings for all using (auth.role() = 'authenticated');

-- Notices & Targets
alter table public.notices enable row level security;
drop policy if exists "Notices viewable by department or admin" on public.notices;
create policy "Notices viewable by department or admin" on public.notices for select using (public.is_admin() or department = public.current_department() or department = 'All Departments');

drop policy if exists "Notices manageable by admin or author" on public.notices;
create policy "Notices manageable by admin or author" on public.notices for all using (public.is_admin() or author_id = auth.uid());

alter table public.notice_targets enable row level security;
drop policy if exists "Notice targets viewable" on public.notice_targets;
create policy "Notice targets viewable" on public.notice_targets for select using (true);

drop policy if exists "Notice targets manageable by admin" on public.notice_targets;
create policy "Notice targets manageable by admin" on public.notice_targets for all using (public.is_admin());

alter table public.notice_acknowledgements enable row level security;
drop policy if exists "Acknowledgements viewable" on public.notice_acknowledgements;
create policy "Acknowledgements viewable" on public.notice_acknowledgements for select using (true);

drop policy if exists "Acknowledgements insertable by self" on public.notice_acknowledgements;
create policy "Acknowledgements insertable by self" on public.notice_acknowledgements for insert with check (user_id = auth.uid());

-- Meetings & Attendees
alter table public.meetings enable row level security;
drop policy if exists "Meetings viewable by organizer, attendee or department" on public.meetings;
create policy "Meetings viewable by organizer, attendee or department" on public.meetings for select using (
  public.is_admin() or organizer_id = auth.uid() or department = public.current_department() or exists (select 1 from public.meeting_attendees where meeting_id = id and user_id = auth.uid())
);

drop policy if exists "Meetings manageable by organizer or admin" on public.meetings;
create policy "Meetings manageable by organizer or admin" on public.meetings for all using (public.is_admin() or organizer_id = auth.uid());

alter table public.meeting_attendees enable row level security;
drop policy if exists "Meeting attendees viewable" on public.meeting_attendees;
create policy "Meeting attendees viewable" on public.meeting_attendees for select using (true);

drop policy if exists "Meeting attendees updatable by self" on public.meeting_attendees;
create policy "Meeting attendees updatable by self" on public.meeting_attendees for update using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Meeting attendees insertable by organizer or admin" on public.meeting_attendees;
create policy "Meeting attendees insertable by organizer or admin" on public.meeting_attendees for insert with check (auth.role() = 'authenticated');

-- Messaging & Conversations
alter table public.conversations enable row level security;
drop policy if exists "Conversations viewable by participant" on public.conversations;
create policy "Conversations viewable by participant" on public.conversations for select using (
  public.is_admin() or exists (select 1 from public.conversation_participants where conversation_id = id and user_id = auth.uid())
);

drop policy if exists "Conversations manageable by authenticated" on public.conversations;
create policy "Conversations manageable by authenticated" on public.conversations for all using (auth.role() = 'authenticated');

alter table public.conversation_participants enable row level security;
drop policy if exists "Conversation participants viewable" on public.conversation_participants;
create policy "Conversation participants viewable" on public.conversation_participants for select using (true);

drop policy if exists "Conversation participants insertable" on public.conversation_participants;
create policy "Conversation participants insertable" on public.conversation_participants for insert with check (auth.role() = 'authenticated');

alter table public.messages enable row level security;
drop policy if exists "Messages viewable by conversation participants" on public.messages;
create policy "Messages viewable by conversation participants" on public.messages for select using (
  public.is_admin() or exists (select 1 from public.conversation_participants where conversation_id = messages.conversation_id and user_id = auth.uid())
);

drop policy if exists "Messages insertable by sender" on public.messages;
create policy "Messages insertable by sender" on public.messages for insert with check (sender_id = auth.uid() or auth.role() = 'authenticated');

alter table public.message_attachments enable row level security;
drop policy if exists "Message attachments viewable" on public.message_attachments;
create policy "Message attachments viewable" on public.message_attachments for select using (true);

drop policy if exists "Message attachments insertable" on public.message_attachments;
create policy "Message attachments insertable" on public.message_attachments for insert with check (auth.role() = 'authenticated');

-- Notifications & Comms
alter table public.notifications enable row level security;
drop policy if exists "Notifications viewable by target user or admin" on public.notifications;
create policy "Notifications viewable by target user or admin" on public.notifications for select using (
  public.is_admin() or target_user_id = 'all' or target_user_id = auth.uid()::text or actor_id = auth.uid()
);

drop policy if exists "Notifications manageable" on public.notifications;
create policy "Notifications manageable" on public.notifications for all using (auth.role() = 'authenticated');

alter table public.dispatched_emails enable row level security;
drop policy if exists "Dispatched emails viewable by admin or recipient" on public.dispatched_emails;
create policy "Dispatched emails viewable by admin or recipient" on public.dispatched_emails for select using (public.is_admin() or recipient_email = auth.email());

drop policy if exists "Dispatched emails insertable" on public.dispatched_emails;
create policy "Dispatched emails insertable" on public.dispatched_emails for insert with check (auth.role() = 'authenticated');

alter table public.teams_notification_rules enable row level security;
drop policy if exists "Teams rules viewable" on public.teams_notification_rules;
create policy "Teams rules viewable" on public.teams_notification_rules for select using (auth.role() = 'authenticated');

drop policy if exists "Teams rules manageable by admin" on public.teams_notification_rules;
create policy "Teams rules manageable by admin" on public.teams_notification_rules for all using (public.is_admin());

-- Governance
alter table public.decisions enable row level security;
drop policy if exists "Decisions viewable" on public.decisions;
create policy "Decisions viewable" on public.decisions for select using (auth.role() = 'authenticated');

drop policy if exists "Decisions manageable by admin" on public.decisions;
create policy "Decisions manageable by admin" on public.decisions for all using (public.is_admin() or author_id = auth.uid());

alter table public.approvals enable row level security;
drop policy if exists "Approvals viewable" on public.approvals;
create policy "Approvals viewable" on public.approvals for select using (auth.role() = 'authenticated');

drop policy if exists "Approvals manageable" on public.approvals;
create policy "Approvals manageable" on public.approvals for all using (auth.role() = 'authenticated');

alter table public.audit_log enable row level security;
drop policy if exists "Audit log viewable by admin or self" on public.audit_log;
create policy "Audit log viewable by admin or self" on public.audit_log for select using (public.is_admin() or actor_id = auth.uid());

drop policy if exists "Audit log insertable" on public.audit_log;
create policy "Audit log insertable" on public.audit_log for insert with check (auth.role() = 'authenticated');

alter table public.role_permissions enable row level security;
drop policy if exists "Role permissions viewable" on public.role_permissions;
create policy "Role permissions viewable" on public.role_permissions for select using (auth.role() = 'authenticated');

drop policy if exists "Role permissions manageable by admin" on public.role_permissions;
create policy "Role permissions manageable by admin" on public.role_permissions for all using (public.is_admin());

-- =========================================================================
-- 4. TRIGGERS (Safe minimal defaults on user creation in auth.users)
-- =========================================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, role, department, organisation, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'Staff Member'),
    coalesce(new.raw_user_meta_data->>'department', 'General'),
    coalesce(new.raw_user_meta_data->>'organisation', 'WIPAHS'),
    'Offline'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
