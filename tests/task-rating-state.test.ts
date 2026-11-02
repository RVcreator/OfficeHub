import {test} from 'node:test';import assert from 'node:assert/strict';
import {hasSavedTaskRating,requiresTaskRating} from '../src/utils/taskRatingState';import {mapTaskRow} from '../src/services/supabaseMappers';
const done={status:'Done',pendingRating:true,createdById:'creator',assignedToId:'assignee',assignmentType:'specific_people'} as const;
test('saved rating suppresses pending UI even if a legacy flag remains true',()=>{
 const rated={...done,rating:{stars:4} as any};assert.equal(hasSavedTaskRating(rated),true);assert.equal(requiresTaskRating(rated,'creator'),false);
 assert.equal(mapTaskRow({id:'rated',status:'Done',pending_rating:true,created_by_id:'creator',assigned_to_id:'assignee',rating:{stars:4}}).pendingRating,false);
 assert.equal(requiresTaskRating(done,'creator'),true);assert.equal(requiresTaskRating({...done,status:'In Progress'},'creator'),false);
 assert.equal(requiresTaskRating({...done,assignmentType:'personal',createdById:'creator',assignedToId:'creator'},'creator'),false);
 for(const stars of [0,6,4.5,'5',null,undefined])assert.equal(hasSavedTaskRating({rating:{stars} as any}),false);
});
test('rating-pinned and regular sections form one complete partition with a matching badge',()=>{
 const rows=[{...done,id:'rated',rating:{stars:5} as any},{...done,id:'pending'},{...done,id:'open',status:'To Do'}];
 const pinned=rows.filter(t=>requiresTaskRating(t,'creator')),regular=rows.filter(t=>!requiresTaskRating(t,'creator'));
 assert.deepEqual(pinned.map(t=>t.id),['pending']);assert.deepEqual(regular.map(t=>t.id),['rated','open']);assert.equal(new Set([...pinned,...regular].map(t=>t.id)).size,rows.length);
});
