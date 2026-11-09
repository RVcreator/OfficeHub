import type {ChatConversation,StaffUser} from '../types';
import {formatStaffDisplayName} from './staffHierarchy';

/** A shared DM title is not viewer-specific. Resolve the other member by ID. */
export function chatIdentity(conversation:ChatConversation,currentUserId:string,staff:StaffUser[]){
  if(conversation.type==='group')return {title:conversation.name,partner:null};
  const otherId=conversation.participantIds.find(id=>id!==currentUserId);
  const partner=staff.find(member=>member.id===otherId)||null;
  return {title:partner?formatStaffDisplayName(partner):'Direct message',partner};
}
