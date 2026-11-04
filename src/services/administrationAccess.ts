export interface AdministrationAccess {userId:string|null;status:'idle'|'loading'|'ready'|'error';canView:boolean;canManage:boolean;automatic:boolean;}
export interface AdministrationGrant {user_id:string;can_manage:boolean;automatic:boolean;active?:boolean;granted_at:string|null;}
export const emptyAdministrationAccess=():AdministrationAccess=>({userId:null,status:'idle',canView:false,canManage:false,automatic:false});
export function canViewAdministration(access:AdministrationAccess,userId?:string|null){return !!userId&&access.userId===userId&&access.status==='ready'&&access.canView===true;}
export function canManageAdministration(access:AdministrationAccess,userId?:string|null){return canViewAdministration(access,userId)&&access.canManage===true;}
export function administrationAccessFromServer(row:any,userId:string):AdministrationAccess{
 if(!row||row.user_id!==userId||typeof row.can_view!=='boolean'||typeof row.can_manage!=='boolean')throw new Error('Administration access could not be verified.');
 return {userId,status:'ready',canView:row.can_view,canManage:row.can_view&&row.can_manage,automatic:row.automatic===true};
}
export function isAdministrationTab(tab:string){return ['departments','users','roles-permissions','audit-log'].includes(tab);}
