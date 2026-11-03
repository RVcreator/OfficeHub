import {useEffect,useState} from 'react';import type {Meeting} from '../types';
import {getMeetingScheduledTimestamp,TWO_DAYS_MS} from './archiveUtils';import {meetingResponseDeadline} from './meetingLifecycle';
/** Refresh at end/archive boundaries, with a minute fallback and focus recovery. */
export function useMeetingClock(meetings:readonly Meeting[]):number{
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{
  // A sleeping/throttled tab or a clock jump can deliver an old timer late.
  if(Math.abs(Date.now()-now)>1000){setNow(Date.now());return;}
  const refresh=()=>setNow(Date.now());let delay=60_000;
  for(const m of meetings){const end=meetingResponseDeadline(m),archive=getMeetingScheduledTimestamp(m);for(const boundary of [end,archive===null?null:archive+TWO_DAYS_MS])if(boundary!==null&&boundary>now)delay=Math.min(delay,boundary-now+5);}
  const timer=setTimeout(refresh,Math.max(5,delay));window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{clearTimeout(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[meetings,now]);return now;
}
