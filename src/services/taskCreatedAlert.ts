import type { AppNotification, StaffUser, Task } from '../types';

export function taskCreatedAlert(task: Task, user: StaffUser): Omit<AppNotification, 'createdAt' | 'read'> {
  return { id: `task-created:${task.id}:${user.id}`, title: `Task created: ${task.title}`,
    message: `Your task "${task.title}" was created successfully.`, type: 'task',
    targetUserId: user.id, actorId: user.id, actorName: user.name, actorAvatar: user.avatar,
    priority: 'Normal', metadata: { taskId: task.id }, pushedToMicrosoftTeams: false };
}
