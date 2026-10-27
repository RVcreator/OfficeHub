import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPersonalTask,
  isTaskAssignedToUser,
  isTaskAssignedByMe,
  isMyPersonalOrAssignedTask,
  isTaskVisibleInAllTasks,
} from '../src/utils/taskUtils';
import type { Task } from '../src/types';

const ME = {
  id: '0a9edd24-62bd-40ff-a486-fd1c95724b8e',
  name: 'marketing',
  department: 'Marketing',
  organisation: 'WIPAHS',
};

const RIJA = {
  id: '82f2bd3b-2f09-4e4a-9438-5c26e203cf30',
  name: 'Rija Virani',
  department: 'IT',
  organisation: 'WIPAHS',
};

const OTHER = {
  id: '11111111-2222-4333-8444-555555555555',
  name: 'Finance Officer',
  department: 'Finance',
  organisation: 'WIPAHS',
};

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'Description',
    organisation: 'WIPAHS',
    department: 'Marketing',
    status: 'To Do',
    priority: 'Medium',
    assignedToId: ME.id,
    assignedToName: ME.name,
    assignedToAvatar: '',
    assignedToIds: [ME.id],
    createdById: ME.id,
    createdByName: ME.name,
    createdAt: '2026-10-22T10:00:00.000Z',
    dueDate: '2026-10-28',
    subtasks: [],
    tags: [],
    ...overrides,
  };
}

test('All Tasks includes tasks assigned by the current user to other members, departments, and organisations', () => {
  const myPersonal = makeTask('personal-mine', {
    type: 'personal',
    assignmentType: 'personal',
    createdById: ME.id,
    assignedToId: ME.id,
    assignedToIds: [ME.id],
  });

  const assignedToMe = makeTask('assigned-to-me', {
    createdById: RIJA.id,
    createdByName: RIJA.name,
    assignedToId: ME.id,
    assignedToName: ME.name,
    assignedToIds: [ME.id],
    assignmentType: 'specific_people',
  });

  const assignedByMeToRija = makeTask('assigned-by-me-person', {
    createdById: ME.id,
    createdByName: ME.name,
    assignedToId: RIJA.id,
    assignedToName: RIJA.name,
    assignedToIds: [RIJA.id],
    department: 'IT',
    assignmentType: 'specific_people',
  });

  const assignedByMeToOtherDept = makeTask('assigned-by-me-dept', {
    createdById: ME.id,
    createdByName: ME.name,
    assignedToId: 'dept-Finance',
    assignedToName: 'Finance (Department)',
    assignedToIds: [],
    assignedDepartments: ['Finance'],
    department: 'Finance',
    assignmentType: 'department',
    type: 'departmental',
  });

  const deptTaskForMe = makeTask('dept-for-me', {
    createdById: RIJA.id,
    createdByName: RIJA.name,
    assignedToId: 'dept-Marketing',
    assignedToName: 'Marketing (Department)',
    assignedToIds: [],
    assignedDepartments: ['Marketing'],
    department: 'Marketing',
    assignmentType: 'department',
    type: 'departmental',
  });

  const orgTaskForMe = makeTask('org-for-me', {
    createdById: RIJA.id,
    createdByName: RIJA.name,
    assignedToId: 'org-WIPAHS',
    assignedToName: 'WIPAHS (Whole Org)',
    assignedToIds: [],
    assignedOrganisations: ['WIPAHS'],
    organisation: 'WIPAHS',
    department: 'All Departments',
    assignmentType: 'organization',
    type: 'departmental',
  });

  const rijaPrivatePersonal = makeTask('rija-private', {
    createdById: RIJA.id,
    createdByName: RIJA.name,
    assignedToId: RIJA.id,
    assignedToName: RIJA.name,
    assignedToIds: [RIJA.id],
    department: 'IT',
    type: 'personal',
    assignmentType: 'personal',
  });

  const unrelatedOtherMemberTask = makeTask('unrelated', {
    createdById: RIJA.id,
    createdByName: RIJA.name,
    assignedToId: OTHER.id,
    assignedToName: OTHER.name,
    assignedToIds: [OTHER.id],
    department: 'Finance',
    assignmentType: 'specific_people',
  });

  const allTasks = [
    myPersonal,
    assignedToMe,
    assignedByMeToRija,
    assignedByMeToOtherDept,
    deptTaskForMe,
    orgTaskForMe,
    rijaPrivatePersonal,
    unrelatedOtherMemberTask,
  ];

  const visibleIds = allTasks
    .filter(t => isTaskVisibleInAllTasks(t, ME.id, ME.name, ME.department, ME.organisation))
    .map(t => t.id);

  assert.deepEqual(visibleIds, [
    'personal-mine',
    'assigned-to-me',
    'assigned-by-me-person',
    'assigned-by-me-dept',
    'dept-for-me',
    'org-for-me',
  ]);
});

test('Dashboard Done tasks count only personal tasks and tasks assigned to the user, excluding tasks assigned by the user to others', () => {
  const donePersonal = makeTask('done-personal', {
    status: 'Done',
    type: 'personal',
    assignmentType: 'personal',
    createdById: ME.id,
    assignedToId: ME.id,
    assignedToIds: [ME.id],
  });

  const doneAssignedToMe = makeTask('done-assigned-to-me', {
    status: 'Done',
    createdById: RIJA.id,
    createdByName: RIJA.name,
    assignedToId: ME.id,
    assignedToName: ME.name,
    assignedToIds: [ME.id],
    assignmentType: 'specific_people',
  });

  // Clean delegated task assigned by ME to Rija and completed by Rija
  const doneAssignedByMeSingle = makeTask('done-assigned-by-me-single', {
    status: 'Done',
    createdById: ME.id,
    createdByName: ME.name,
    assignedToId: RIJA.id,
    assignedToName: RIJA.name,
    assignedToIds: [RIJA.id],
    department: 'IT',
    assignmentType: 'specific_people',
    pendingRating: true,
  });

  // Real legacy row shape (e.g. tsk-1792655623291) where creator ID remained in assigned_to_ids alongside real assignee
  const doneAssignedByMeLegacyMulti = makeTask('done-assigned-by-me-legacy', {
    status: 'Done',
    createdById: ME.id,
    createdByName: ME.name,
    assignedToId: ME.id,
    assignedToName: '2 Assignees: marketing, Rija Virani',
    assignedToIds: [ME.id, RIJA.id],
    department: 'Marketing',
    assignmentType: 'specific_people',
    rating: {
      ratedUserId: '',
      raterUserId: ME.id,
      stars: 3,
      ratedAt: '2026-10-22T08:56:50.197Z',
    },
  });

  // Departmental Done task (not personal or directly assigned to user)
  const doneDepartmental = makeTask('done-dept', {
    status: 'Done',
    createdById: RIJA.id,
    createdByName: RIJA.name,
    assignedToId: 'dept-Marketing',
    assignedToName: 'Marketing (Department)',
    assignedToIds: [],
    assignedDepartments: ['Marketing'],
    department: 'Marketing',
    assignmentType: 'department',
    type: 'departmental',
  });

  // Cancelled personal task
  const cancelledPersonal = makeTask('cancelled-personal', {
    status: 'Cancelled',
    type: 'personal',
    assignmentType: 'personal',
    createdById: ME.id,
    assignedToId: ME.id,
    assignedToIds: [ME.id],
  });

  // Other user's personal Done task
  const doneOtherPersonal = makeTask('done-other-personal', {
    status: 'Done',
    type: 'personal',
    assignmentType: 'personal',
    createdById: RIJA.id,
    createdByName: RIJA.name,
    assignedToId: RIJA.id,
    assignedToName: RIJA.name,
    assignedToIds: [RIJA.id],
  });

  const tasks = [
    donePersonal,
    doneAssignedToMe,
    doneAssignedByMeSingle,
    doneAssignedByMeLegacyMulti,
    doneDepartmental,
    cancelledPersonal,
    doneOtherPersonal,
  ];

  // Exact DashboardView filtering logic
  const dashboardDoneIds = tasks
    .filter(t => t.status !== 'Cancelled' && isMyPersonalOrAssignedTask(t, ME.id, ME.name))
    .filter(t => t.status === 'Done')
    .map(t => t.id);

  assert.deepEqual(dashboardDoneIds, ['done-personal', 'done-assigned-to-me']);
  assert.equal(isTaskAssignedByMe(doneAssignedByMeLegacyMulti, ME.id), true);
  assert.equal(isPersonalTask(donePersonal, ME.id), true);
  assert.equal(isTaskAssignedToUser(doneDepartmental, ME.id, ME.name), false);
});
