import type {Task} from '../types';
import {isPersonalTask} from './taskUtils';
export function hasSavedTaskRating(task:Pick<Partial<Task>,'rating'>):boolean{
 const stars=task.rating?.stars;
 return typeof stars==='number'&&Number.isInteger(stars)&&stars>=1&&stars<=5;
}
export function requiresTaskRating(task:Partial<Task>,currentUserId?:string):boolean{
 return task.status==='Done'&&Boolean(task.pendingRating)&&!hasSavedTaskRating(task)&&!isPersonalTask(task,currentUserId);
}
