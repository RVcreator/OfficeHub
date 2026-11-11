import type {ChatMessage} from '../types';
/** A timed-out write may have committed. Confirm by its stable ID, never resend automatically. */
export async function confirmChatSave(
 message:ChatMessage,
 write:(signal:AbortSignal)=>PromiseLike<{data:any;error:any}>,
 lookup:()=>PromiseLike<{data:any;error:any}>,
 timeoutMs=15_000,
){
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 let result:{data:any;error:any};
 try{
  result=await Promise.race([Promise.resolve(write(controller.signal)),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Save confirmation timed out'));},timeoutMs);})]);
 }catch(error){result={data:null,error};}finally{clearTimeout(timer);}
 if(!result.error&&result.data)return result.data;
 // The duplicate ID path also covers a retry after an interrupted response.
 const confirmed=await lookup().then(r=>r.error?null:r.data,()=>null);
 if(confirmed&&confirmed.id===message.id&&confirmed.sender_id===message.senderId&&confirmed.conversation_id===message.conversationId&&confirmed.text===message.text)return confirmed;
 const code=String(result.error?.code||'');
 if(code==='42501')throw new Error('This conversation could not confirm your permission to send. Your draft is kept. Reconnect and try again, or ask its owner to check your membership.');
 if(code==='23503')throw new Error('The conversation or member record is no longer available. Your draft is kept. Refresh the conversation before retrying.');
 throw new Error('Message delivery could not be confirmed. Your draft is kept. Check your connection and try again; retrying this draft will not create a second copy.');
}
