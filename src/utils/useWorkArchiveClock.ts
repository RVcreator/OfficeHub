import {useEffect,useState} from 'react';
import type {Approval,Decision,Notice} from '../types';
import {workArchiveDeadline} from './workArchive';
const empty:never[]=[];
export function useWorkArchiveClock(approvals:Approval[]=empty,decisions:Decision[]=empty,notices:Notice[]=empty,userId=''){
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{
  if(Math.abs(Date.now()-now)>1000){setNow(Date.now());return;}
  const deadlines=[...approvals.map(a=>a.archiveReadyAt),...decisions.map(d=>d.archiveReadyAt),...notices.map(n=>n.acknowledgedAtBy?.[userId])].map(workArchiveDeadline);
  const delay=Math.min(60000,...deadlines.filter((t):t is number=>t!==null&&t>now).map(t=>t-now+5));
  const refresh=()=>setNow(Date.now());const timer=setTimeout(refresh,Math.max(5,delay));
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{clearTimeout(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[approvals,decisions,notices,userId,now]);
 return now;
}
