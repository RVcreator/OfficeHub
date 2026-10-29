// Isolated browser fixture. This module never contacts Supabase.
const id='10000000-0000-4000-8000-000000000001';
export const server={user:{id,email:'fixture@example.invalid',app_metadata:{must_change_password:true,password_changed_at:null as string|null}}, signedIn:false, deleted:false, rejectCompletion:false, checks:0, completions:0};
let authListener:any;let profileListener:any;
const session=()=>server.signedIn?{user:server.user,access_token:'fixture-only-token'}:null;
const emit=(event:string)=>authListener?.(event,session());
export const reset=()=>{server.user={...server.user,app_metadata:{must_change_password:true,password_changed_at:null}};profileListener?.({new:{must_change_password:false}});};
export const signal=()=>profileListener?.({new:{must_change_password:true}});
export const deleteAccount=()=>{server.deleted=true;signal();};
export function createClient(){return {
 auth:{
 onAuthStateChange:(fn:any)=>{authListener=fn;queueMicrotask(()=>emit('INITIAL_SESSION'));return {data:{subscription:{unsubscribe(){authListener=undefined;}}}};},
 signInWithPassword:async()=>{server.signedIn=true;emit('SIGNED_IN');return {data:{user:{...server.user,app_metadata:{must_change_password:false}},session:session()},error:null};},
 getUser:async()=>{server.checks++;return server.deleted?{data:{user:null},error:{status:401,message:'Account deleted'}}:{data:{user:server.signedIn?structuredClone(server.user):null},error:null};},
 getSession:async()=>({data:{session:session()},error:null}),
 refreshSession:async()=>{emit('TOKEN_REFRESHED');return {data:{session:session()},error:null};},
 signOut:async()=>{server.signedIn=false;emit('SIGNED_OUT');return {error:null};},
 },
 functions:{invoke:async(name:string)=>{
 if(name!=='officehub-complete-password')throw Error('Unexpected function');
 if(server.rejectCompletion)return {data:null,error:{message:'Fixture rejects completion'}};
 server.completions++;server.user={...server.user,app_metadata:{must_change_password:false,password_changed_at:'fixture-server-time'}};
 return {data:{success:true,userId:id,app_metadata:server.user.app_metadata},error:null};
 }},
 channel:()=>{const channel={on:(_event:any,_filter:any,fn:any)=>{profileListener=fn;return channel;},subscribe:()=>channel};return channel;},
 removeChannel:async()=>{},
};}
