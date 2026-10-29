import {useEffect,useState} from 'react';
import {portalStore,setTableData} from '../services/store';

// Refresh on screen entry and whenever a member form opens, independently of startup.
export function useDepartmentDirectory(reloadKey='directory') {
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true;setLoading(true);setError(null);
    portalStore.getDepartments().then(rows=>{if(active)setTableData('departments',rows);})
      .catch(error=>{if(active)setError(error instanceof Error?error.message:'Departments could not load from Supabase.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[reloadKey,attempt]);
  return {loading,error,retry:()=>setAttempt(value=>value+1)};
}
