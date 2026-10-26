-- =========================================================================
-- MIGRATION: 20261022000001_fix_task_rls_and_deletion.sql
-- =========================================================================
-- 1. Rectify Tasks DELETE RLS Policy:
--    Allow creator, assignee (both direct assigned_to_id and multi-assignee assigned_to_ids),
--    or admin to delete tasks. Handle UUID and text representation comparisons safely.
-- 2. Rectify Tasks UPDATE RLS Policy:
--    Allow creator, assignee, department members, or admin to update task status & details.
-- 3. Rectify Task Assignees & Subtasks RLS:
--    Ensure task participants and admins can manage subtasks and assignees.
-- =========================================================================

-- 1. TASKS DELETE POLICY
drop policy if exists "Tasks deletable by creator or admin" on public.tasks;
drop policy if exists "Tasks deletable by creator, assignee or admin" on public.tasks;

create policy "Tasks deletable by creator, assignee or admin"
  on public.tasks
  for delete
  using (
    public.is_admin()
    or created_by_id = auth.uid()
    or created_by_id::text = auth.uid()::text
    or assigned_to_id = auth.uid()
    or assigned_to_id::text = auth.uid()::text
    or auth.uid()::text = ANY(assigned_to_ids)
  );

-- 2. TASKS UPDATE POLICY
drop policy if exists "Tasks updatable by assignee, creator or admin" on public.tasks;
drop policy if exists "Tasks updatable by assignee, creator, department or admin" on public.tasks;

create policy "Tasks updatable by assignee, creator, department or admin"
  on public.tasks
  for update
  using (
    public.is_admin()
    or created_by_id = auth.uid()
    or created_by_id::text = auth.uid()::text
    or assigned_to_id = auth.uid()
    or assigned_to_id::text = auth.uid()::text
    or auth.uid()::text = ANY(assigned_to_ids)
    or department = public.current_department()
  );

-- 3. TASK ASSIGNEES POLICY
drop policy if exists "Task assignees manageable by admin" on public.task_assignees;
drop policy if exists "Task assignees manageable by creator, assignee or admin" on public.task_assignees;

create policy "Task assignees manageable by creator, assignee or admin"
  on public.task_assignees
  for all
  using (
    public.is_admin()
    or user_id = auth.uid()
    or user_id::text = auth.uid()::text
    or exists (
      select 1 from public.tasks
      where tasks.id = task_assignees.task_id
        and (
          tasks.created_by_id = auth.uid()
          or tasks.assigned_to_id = auth.uid()
          or auth.uid()::text = ANY(tasks.assigned_to_ids)
          or tasks.created_by_id::text = auth.uid()::text
          or tasks.assigned_to_id::text = auth.uid()::text
        )
    )
  );
