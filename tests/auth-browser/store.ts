import {useSyncExternalStore} from 'react';
import {passwordChangeRequired,retainPasswordRequirement} from '../../src/services/passwordPolicy';
let state:any={authSession:{isAuthenticated:false,userId:null,mustChangePassword:false},currentUser:null,tasks:[],staff:[],loading:false,notificationError:null};
const listeners=new Set<()=>void>();const update=(next:any)=>{state={...state,...next};listeners.forEach(fn=>fn());};
export const portalStore={
 syncAuthenticatedUserProfile:async(user:any)=>({...user,name:'Fixture Staff',role:'Staff Member',department:'Test',organisation:'Fixture',avatar:'',status:'Online'}),
 shouldForcePasswordChange:(user:any,profile:any,options:any={})=>passwordChangeRequired(user,profile,options.isRecoveryEvent),
 loginUser:(user:any,required:boolean,token:string)=>update({currentUser:user,authSession:{isAuthenticated:true,userId:user.id,mustChangePassword:retainPasswordRequirement(user.id,required,state.authSession),sessionToken:token}}),
 completeForcedPasswordChange:async(user:any)=>{if(user.app_metadata.must_change_password!==false||!user.app_metadata.password_changed_at)throw Error('Unconfirmed');update({currentUser:user,authSession:{...state.authSession,mustChangePassword:false}});},
 logoutUser:async()=>update({currentUser:null,authSession:{isAuthenticated:false,userId:null,mustChangePassword:false}}),
 requirePasswordRecovery:()=>{},logAudit:()=>{},
};
export function usePortalStore(){return {...useSyncExternalStore(fn=>{listeners.add(fn);return ()=>listeners.delete(fn);},()=>state),actions:portalStore};}
