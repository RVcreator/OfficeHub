import {supabase} from './supabaseClient';
import {functionError} from './functionError';
export async function openMicrosoftAttachmentUrl(attachmentUrl:string):Promise<string>{
 const {data,error}=await supabase.functions.invoke('sharepoint-document-action',{body:{action:'open_attachment',attachmentUrl},timeout:120000});
 if(error||data?.success!==true)throw new Error(await functionError(error,data,'SharePoint could not open the attachment. Please retry.'));
 try{const u=new URL(data.webUrl);if(u.protocol==='https:'&&u.hostname==='wipahstz.sharepoint.com'&&!u.username&&!u.password&&!u.port)return u.href;}catch{}
 throw new Error('Microsoft did not return a valid document link.');
}
