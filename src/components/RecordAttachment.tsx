import React from 'react';
import {PrivateChatAttachment} from './PrivateChatAttachment';
import {isMicrosoftFileLink,recordFilePath} from '../services/recordAttachments';
import type {MessageAttachment} from '../types';
export function RecordAttachment({attachment}:{attachment:Omit<MessageAttachment,'id'>&{id?:string}}){
 const file={...attachment,id:attachment.id||attachment.name};
 if(recordFilePath(file.url))return <PrivateChatAttachment attachment={file}/>;
 if(isMicrosoftFileLink(file.url))return <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-xs underline">{file.name} — Open in Microsoft 365</a>;
 return <div className="text-xs rounded border border-amber-200 p-2"><strong>{file.name}</strong><p>Original file unavailable. Please ask the sender to attach it again.</p></div>;
}
