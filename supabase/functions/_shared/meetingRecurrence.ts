/** OfficeHub recurrence uses the meeting's EAT date and clock, without an end date. */
export function graphRecurrence(recurrence:string|undefined,start:string){
 if(!recurrence||recurrence==='None')return null;
 if(!['Daily','Weekly','Monthly'].includes(recurrence))throw new Error('Unsupported recurrence');
 const eat=new Date(Date.parse(start)+10800000);
 if(!Number.isFinite(eat.getTime()))throw new Error('Invalid recurring meeting start');
 const pattern=recurrence==='Daily'?{type:'daily',interval:1}:recurrence==='Weekly'?{type:'weekly',interval:1,daysOfWeek:[['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][eat.getUTCDay()]],firstDayOfWeek:'monday'}:{type:'absoluteMonthly',interval:1,dayOfMonth:eat.getUTCDate()};
 return {pattern,range:{type:'noEnd',startDate:eat.toISOString().slice(0,10),recurrenceTimeZone:'E. Africa Standard Time'}};
}
export function sameRecurrence(actual:any,expected:ReturnType<typeof graphRecurrence>):boolean {
 if(!expected)return !actual;
 if(!actual||actual.pattern?.type!==expected.pattern.type||actual.pattern.interval!==1||actual.range?.type!=='noEnd'||actual.range.startDate!==expected.range.startDate)return false;
 if(expected.pattern.type==='weekly')return JSON.stringify(actual.pattern.daysOfWeek?.map((v:string)=>v.toLowerCase()).sort())===JSON.stringify(expected.pattern.daysOfWeek);
 if(expected.pattern.type==='absoluteMonthly')return actual.pattern.dayOfMonth===expected.pattern.dayOfMonth;
 return true;
}
