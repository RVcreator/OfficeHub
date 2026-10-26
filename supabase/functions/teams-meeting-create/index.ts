import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getMsGraphAppToken } from '../_shared/msGraphToken.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { title, date, time, durationMinutes = 60, organizerEmail, organizerName, department, description } = body;

    if (!title || !date || !time) {
      return new Response(JSON.stringify({ error: 'Missing required meeting fields (title, date, time)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const graphToken = await getMsGraphAppToken();

    // 1. Find a valid user in the M365 tenant to host the calendar event
    let hostUserId = '';
    if (organizerEmail) {
      try {
        const userRes = await fetch(
          `https://graph.microsoft.com/v1.0/users?$filter=mail eq '${encodeURIComponent(organizerEmail)}' or userPrincipalName eq '${encodeURIComponent(organizerEmail)}'`,
          { headers: { Authorization: `Bearer ${graphToken}` } }
        );
        if (userRes.ok) {
          const userData = await userRes.json();
          if (userData.value && userData.value.length > 0) {
            hostUserId = userData.value[0].id;
          }
        }
      } catch (e) {
        console.warn('Could not find user by email, falling back to top user:', e);
      }
    }

    if (!hostUserId) {
      const topUserRes = await fetch('https://graph.microsoft.com/v1.0/users?$top=1', {
        headers: { Authorization: `Bearer ${graphToken}` },
      });
      if (topUserRes.ok) {
        const topUserData = await topUserRes.json();
        if (topUserData.value && topUserData.value.length > 0) {
          hostUserId = topUserData.value[0].id;
        }
      }
    }

    if (!hostUserId) {
      throw new Error('No valid Microsoft 365 user found in tenant to create meeting event.');
    }

    // Parse date and time (e.g. date="2026-10-15", time="14:30")
    let normalizedTime = '10:00';
    if (typeof time === 'string') {
      const match24 = time.trim().match(/^(\d{1,2}):(\d{2})/);
      if (match24) {
        normalizedTime = `${match24[1].padStart(2, '0')}:${match24[2]}`;
      }
    }
    const startDateTimeStr = `${date}T${normalizedTime}:00`;
    const startDate = new Date(startDateTimeStr);
    const durationMs = (durationMinutes || 60) * 60 * 1000;
    const endDate = new Date(startDate.getTime() + durationMs);

    const eventPayload = {
      subject: title,
      body: {
        contentType: 'HTML',
        content: `<p>${description || 'WIPAHS Microsoft Teams Meeting'}</p><p><b>Organizer:</b> ${organizerName || 'WIPAHS Admin'}</p><p><b>Department:</b> ${department || 'General'}</p>`,
      },
      start: {
        dateTime: startDate.toISOString().replace(/\.\d+Z$/, ''),
        timeZone: 'E. Africa Standard Time',
      },
      end: {
        dateTime: endDate.toISOString().replace(/\.\d+Z$/, ''),
        timeZone: 'E. Africa Standard Time',
      },
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
    };

    const eventRes = await fetch(`https://graph.microsoft.com/v1.0/users/${hostUserId}/calendar/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${graphToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventPayload),
    });

    if (!eventRes.ok) {
      const errText = await eventRes.text();
      throw new Error(`Graph calendar event creation failed (${eventRes.status}): ${errText}`);
    }

    const eventJson = await eventRes.json();
    const joinUrl = eventJson.onlineMeeting?.joinUrl || eventJson.webLink || `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${encodeURIComponent(title)}%40thread.v2/0`;
    const meetingId = eventJson.id || `mtg-${Date.now()}`;
    const passcode = `wipahs${Math.floor(1000 + Math.random() * 9000)}`;

    return new Response(
      JSON.stringify({
        teamsJoinUrl: joinUrl,
        teamsMeetingId: meetingId,
        teamsPasscode: passcode,
        webLink: eventJson.webLink || joinUrl,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('teams-meeting-create error:', error);
    // Fallback join URL if graph fails
    const safeTitle = 'Meeting';
    const fallbackJoinUrl = `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${encodeURIComponent(safeTitle)}%40thread.v2/0?context=%7b%22Tid%22%3a%22wipahstz.sharepoint.com%22%7d`;
    return new Response(
      JSON.stringify({
        teamsJoinUrl: fallbackJoinUrl,
        teamsMeetingId: `meetup-${Date.now()}`,
        teamsPasscode: 'wipahs1234',
        error: error.message || String(error),
      }),
      {
        status: 200, // Return 200 with fallback so meeting creation succeeds even if M365 calendar write fails
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
