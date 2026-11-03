export interface CalendarPayload {
 version:1;id:string;title:string;description:string;location:string;start:string;end:string;
 sequence:number;method:'REQUEST'|'CANCEL'|'PUBLISH';organizerName:string;
}
const safeText=(value:string)=>String(value||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/\r/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const utc=(value:string)=>{const time=Date.parse(value);if(!Number.isFinite(time))throw new Error('Invalid calendar time');return new Date(time).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');};
function fold(line:string){let result='',size=0;for(const char of line){const bytes=new TextEncoder().encode(char).length;if(size+bytes>75){result+='\r\n ';size=1;}result+=char;size+=bytes;}return result;}
export function calendarIcs(event:CalendarPayload,recipient?:string,stamp=new Date().toISOString()){
 if(event.version!==1||!['REQUEST','CANCEL','PUBLISH'].includes(event.method)||!Number.isInteger(event.sequence)||event.sequence<0||Date.parse(event.end)<=Date.parse(event.start))throw new Error('Invalid calendar invitation');
 if(recipient&&!/^[a-z0-9._%+-]+@wipahs\.org$/i.test(recipient))throw new Error('Invalid calendar recipient');
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//WIPAHS//OfficeHub//EN','CALSCALE:GREGORIAN',`METHOD:${event.method}`,'BEGIN:VEVENT',
  `UID:officehub-${encodeURIComponent(event.id)}@wipahs.org`,`SEQUENCE:${event.sequence}`,`DTSTAMP:${utc(stamp)}`,`DTSTART:${utc(event.start)}`,`DTEND:${utc(event.end)}`,
  `SUMMARY:${safeText(event.title)}`,`DESCRIPTION:${safeText(event.description)}`,`LOCATION:${safeText(event.location)}`,
  'ORGANIZER;CN=WIPAHS OfficeHub:mailto:officehub@wipahs.org',
  ...(recipient?[`ATTENDEE;ROLE=REQ-PARTICIPANT${event.method==='REQUEST'?';PARTSTAT=NEEDS-ACTION;RSVP=TRUE':''}:mailto:${recipient.toLowerCase()}`]:[]),
  'TRANSP:OPAQUE','X-MICROSOFT-CDO-BUSYSTATUS:BUSY',`STATUS:${event.method==='CANCEL'?'CANCELLED':'CONFIRMED'}`,'END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}
export function utf8Base64(value:string){let bytes='';for(const byte of new TextEncoder().encode(value))bytes+=String.fromCharCode(byte);return btoa(bytes);}
function encodedSubject(value:string){const words:string[]=[];let word='',size=0;for(const char of value.replace(/[\r\n]/g,' ').slice(0,240)){const bytes=new TextEncoder().encode(char).length;if(size+bytes>42){words.push('=?UTF-8?B?'+utf8Base64(word)+'?=');word='';size=0;}word+=char;size+=bytes;}if(word)words.push('=?UTF-8?B?'+utf8Base64(word)+'?=');return words.join('\r\n ');}
export function calendarMime(job:{id:string;subject:string;body_text:string;recipient_email:string;calendar_payload:CalendarPayload}){
 if(!['REQUEST','CANCEL'].includes(job.calendar_payload.method))throw new Error('Invalid invitation method');
 const event=job.calendar_payload,ics=calendarIcs(event,job.recipient_email);
 const boundary='officehub-'+job.id.replace(/[^a-zA-Z0-9-]/g,'');
 const wrap=(value:string)=>utf8Base64(value).match(/.{1,76}/g)?.join('\r\n')||'';
 return utf8Base64([
  'From: WIPAHS OfficeHub <officehub@wipahs.org>',`To: <${job.recipient_email}>`,`Subject: ${encodedSubject(job.subject)}`,`Date: ${new Date().toUTCString()}`,'Content-Class: urn:content-classes:calendarmessage',
  'MIME-Version: 1.0',`Content-Type: multipart/alternative; boundary="${boundary}"`,`X-OfficeHub-Outbox-Id: ${job.id.replace(/[\r\n]/g,'')}`,'',
  `--${boundary}`,'Content-Type: text/plain; charset=utf-8','Content-Transfer-Encoding: base64','',wrap(job.body_text),'',
  `--${boundary}`,`Content-Type: text/calendar; charset=utf-8; method=${event.method}`,'Content-Transfer-Encoding: base64','Content-Disposition: inline','',wrap(ics),'',`--${boundary}--`,'',
 ].join('\r\n'));
}
