/**
 * Authentic Shia Islamic Occasions (Ithna-Ashari) & Tanzania National Holidays
 * Specialized for Africa/Dar_es_Salaam timezone (UTC+3)
 *
 * Sources:
 * - Shia Ithna-Asheri Islamic Calendar (Al-Islam.org / KSIJ Dar es Salaam / Africa Federation)
 * - Tanzania Public Holidays Act & Official Government Gazette
 */

export type OccasionType = 'shia_happy' | 'shia_mourning' | 'tanzania_holiday' | 'un_designated_day';

export interface CalendarOccasionMarker {
  id: string;
  name: string;
  category: OccasionType;
  dotColorClass: string;
  badgeBgClass: string;
  badgeTextClass: string;
  hijriDateStr?: string;
}

// Shia Ithna-Ashari Calendar Month Names
export const SHIA_HIJRI_MONTH_NAMES: Record<number, string> = {
  1: 'Muharram',
  2: 'Safar',
  3: "Rabi' al-Awwal",
  4: "Rabi' al-Thani",
  5: 'Jumada al-Ula',
  6: 'Jumada al-Akhirah',
  7: 'Rajab',
  8: "Sha'ban",
  9: 'Ramadan',
  10: 'Shawwal',
  11: "Dhu al-Qa'dah",
  12: 'Dhu al-Hijjah'
};

// 1. Comprehensive, Authentic Shia Ithna-Asheri Events Catalog (by Hijri Month & Day)
interface ShiaOccasionDefinition {
  month: number; // 1-12
  day: number;   // 1-30
  name: string;
  type: 'happy' | 'mourning';
}

export const SHIA_ISLAMIC_OCCASIONS: ShiaOccasionDefinition[] = [
  // --- 1. MUHARRAM (Ayyam-e-Aza) ---
  { month: 1, day: 1, name: 'Islamic New Year (1448 AH) / Start of Muharram Mourning', type: 'mourning' },
  { month: 1, day: 2, name: 'Arrival of Imam Hussain (a.s.) in Karbala', type: 'mourning' },
  { month: 1, day: 7, name: 'Water cut off from the tents of Imam Hussain (a.s.)', type: 'mourning' },
  { month: 1, day: 9, name: "Tasu'a - Eve of Ashura / Martyrdom of Hazrat Abbas (a.s.)", type: 'mourning' },
  { month: 1, day: 10, name: 'Day of Ashura - Martyrdom of Imam Hussain (a.s.) & Companions', type: 'mourning' },
  { month: 1, day: 11, name: 'Sham-e-Ghariban (Night of the Desolate)', type: 'mourning' },
  { month: 1, day: 12, name: 'Soyem of the Karbala Martyrs / Burial of the Shuhada', type: 'mourning' },
  { month: 1, day: 25, name: 'Martyrdom of Imam Zayn al-Abidin (a.s.)', type: 'mourning' },

  // --- 2. SAFAR ---
  { month: 2, day: 1, name: 'Arrival of the Prisoners of Karbala in Damascus (Sham)', type: 'mourning' },
  { month: 2, day: 7, name: 'Martyrdom of Imam Hasan al-Mujtaba (a.s.)', type: 'mourning' },
  { month: 2, day: 17, name: 'Martyrdom of Imam Ali al-Ridha (a.s.) (Narration)', type: 'mourning' },
  { month: 2, day: 20, name: "Arba'een of Imam Hussain (a.s.) (Chehlum - 40th Day)", type: 'mourning' },
  { month: 2, day: 28, name: 'Martyrdom of Prophet Muhammad (s.a.w.) & Imam Hasan al-Mujtaba (a.s.)', type: 'mourning' },
  { month: 2, day: 29, name: 'Martyrdom of Imam Ali al-Ridha (a.s.) (Khurasan)', type: 'mourning' },
  { month: 2, day: 30, name: 'Martyrdom of Imam Ali al-Ridha (a.s.) (Khurasan)', type: 'mourning' },

  // --- 3. RABI' AL-AWWAL ---
  { month: 3, day: 1, name: "Hijrah of the Prophet / Laylat al-Mabit (Imam Ali a.s. slept in the Prophet's bed)", type: 'happy' },
  { month: 3, day: 8, name: 'Martyrdom of Imam Hasan al-Askari (a.s.)', type: 'mourning' },
  { month: 3, day: 9, name: 'Eid-e-Zahra (s.a.) / Commencement of Imamate of Imam al-Mahdi (a.t.f.s.)', type: 'happy' },
  { month: 3, day: 10, name: 'Marriage of the Holy Prophet (s.a.w.) & Lady Khadijat al-Kubra (s.a.)', type: 'happy' },
  { month: 3, day: 17, name: "Milad-un-Nabi: Birth of Prophet Muhammad (s.a.w.) & Imam Ja'far al-Sadiq (a.s.)", type: 'happy' },

  // --- 4. RABI' AL-THANI ---
  { month: 4, day: 8, name: 'Birth of Imam Hasan al-Askari (a.s.)', type: 'happy' },
  { month: 4, day: 10, name: 'Demise of Lady Fatima Masuma of Qum (s.a.)', type: 'mourning' },

  // --- 5. JUMADA AL-ULA ---
  { month: 5, day: 5, name: 'Birth of Lady Zainab bint Ali (s.a.)', type: 'happy' },
  { month: 5, day: 13, name: 'Ayyam-e-Fatimiyyah - Martyrdom of Lady Fatima Zahra (s.a.) (1st Narration)', type: 'mourning' },
  { month: 5, day: 14, name: 'Ayyam-e-Fatimiyyah - Martyrdom of Lady Fatima Zahra (s.a.)', type: 'mourning' },
  { month: 5, day: 15, name: 'Ayyam-e-Fatimiyyah - Martyrdom of Lady Fatima Zahra (s.a.)', type: 'mourning' },

  // --- 6. JUMADA AL-AKHIRAH ---
  { month: 6, day: 3, name: 'Martyrdom of Lady Fatima Zahra (s.a.) (Famous 95-Day Narration)', type: 'mourning' },
  { month: 6, day: 13, name: 'Demise of Lady Umm al-Banin (s.a.) (Mother of Hazrat Abbas a.s.)', type: 'mourning' },
  { month: 6, day: 20, name: 'Birth of Lady Fatima Zahra (s.a.) (Sayyidat Nisa al-Alamin)', type: 'happy' },
  { month: 6, day: 26, name: 'Martyrdom of Imam Ali al-Hadi (a.s.) (Narration)', type: 'mourning' },

  // --- 7. RAJAB ---
  { month: 7, day: 1, name: 'Birth of Imam Muhammad al-Baqir (a.s.)', type: 'happy' },
  { month: 7, day: 3, name: 'Martyrdom of Imam Ali al-Hadi (a.s.)', type: 'mourning' },
  { month: 7, day: 10, name: 'Birth of Imam Muhammad al-Jawad (a.s.) & Hazrat Ali al-Asghar (a.s.)', type: 'happy' },
  { month: 7, day: 13, name: "Birth of Amir al-Mu'minin Imam Ali ibn Abi Talib (a.s.) in the Holy Kaaba", type: 'happy' },
  { month: 7, day: 15, name: 'Demise of Lady Zainab bint Ali (s.a.) / Change of Qibla', type: 'mourning' },
  { month: 7, day: 25, name: 'Martyrdom of Imam Musa al-Kadhim (a.s.)', type: 'mourning' },
  { month: 7, day: 26, name: 'Demise of Hazrat Abu Talib (a.s.) (Protector of the Prophet)', type: 'mourning' },
  { month: 7, day: 27, name: "Eid al-Mab'ath (Divine Appointment of Prophet Muhammad s.a.w.)", type: 'happy' },

  // --- 8. SHA'BAN ---
  { month: 8, day: 3, name: 'Birth of Imam Hussain ibn Ali (a.s.) (Sayyid al-Shuhada)', type: 'happy' },
  { month: 8, day: 4, name: 'Birth of Hazrat Abbas ibn Ali (a.s.) (Qamar Bani Hashim)', type: 'happy' },
  { month: 8, day: 5, name: 'Birth of Imam Zayn al-Abidin (a.s.)', type: 'happy' },
  { month: 8, day: 11, name: 'Birth of Hazrat Ali al-Akbar (a.s.)', type: 'happy' },
  { month: 8, day: 15, name: "Mid-Sha'ban (Nisf Sha'ban) - Birth of Imam al-Mahdi (a.t.f.s.)", type: 'happy' },

  // --- 9. RAMADAN (The Holy Month of Allah) ---
  { month: 9, day: 1, name: 'First Day of the Holy Month of Ramadan', type: 'happy' },
  { month: 9, day: 10, name: 'Demise of Lady Khadijat al-Kubra (s.a.) (Umm al-Mu\'minin)', type: 'mourning' },
  { month: 9, day: 15, name: 'Birth of Imam Hasan al-Mujtaba (a.s.)', type: 'happy' },
  { month: 9, day: 17, name: 'Battle of Badr Anniversary', type: 'happy' },
  { month: 9, day: 19, name: 'Night of Qadr / Zarbat (Striking) of Imam Ali (a.s.) in the Mihrab of Kufa', type: 'mourning' },
  { month: 9, day: 20, name: 'Conquest of Makkah (Fath Makkah)', type: 'happy' },
  { month: 9, day: 21, name: 'Night of Qadr / Martyrdom of Amir al-Mu\'minin Imam Ali (a.s.)', type: 'mourning' },
  { month: 9, day: 23, name: 'Laylat al-Qadr (Grand Night of Power & Decree)', type: 'happy' },

  // --- 10. SHAWWAL ---
  { month: 10, day: 1, name: 'Eid al-Fitr (Festival of Fast-Breaking)', type: 'happy' },
  { month: 10, day: 8, name: 'Destruction of the Sacred Shrines of Jannat al-Baqi (Yawm al-Hadm)', type: 'mourning' },
  { month: 10, day: 15, name: 'Martyrdom of Hazrat Hamza (a.s.) & Battle of Uhud', type: 'mourning' },
  { month: 10, day: 25, name: "Martyrdom of Imam Ja'far al-Sadiq (a.s.)", type: 'mourning' },

  // --- 11. DHU AL-QA'DAH ---
  { month: 11, day: 1, name: 'Birth of Lady Fatima Masuma of Qum (s.a.)', type: 'happy' },
  { month: 11, day: 11, name: 'Birth of Imam Ali al-Ridha (a.s.)', type: 'happy' },
  { month: 11, day: 25, name: 'Dahw al-Ardh (Day of the Spreading of the Earth)', type: 'happy' },
  { month: 11, day: 29, name: 'Martyrdom of Imam Muhammad al-Jawad (a.s.)', type: 'mourning' },
  { month: 11, day: 30, name: 'Martyrdom of Imam Muhammad al-Jawad (a.s.)', type: 'mourning' },

  // --- 12. DHU AL-HIJJAH ---
  { month: 12, day: 1, name: 'Marriage of Imam Ali (a.s.) & Lady Fatima Zahra (s.a.)', type: 'happy' },
  { month: 12, day: 7, name: 'Martyrdom of Imam Muhammad al-Baqir (a.s.)', type: 'mourning' },
  { month: 12, day: 8, name: 'Yawm al-Tarwiyah / Departure of Imam Hussain (a.s.) to Karbala', type: 'mourning' },
  { month: 12, day: 9, name: 'Day of Arafah & Martyrdom of Hazrat Muslim ibn Aqil (a.s.)', type: 'mourning' },
  { month: 12, day: 10, name: 'Eid al-Adha (Feast of Sacrifice)', type: 'happy' },
  { month: 12, day: 15, name: 'Birth of Imam Ali al-Hadi (a.s.)', type: 'happy' },
  { month: 12, day: 18, name: 'Eid al-Ghadeer (Declaration of Wilayah of Imam Ali a.s. - Eid Allah al-Akbar)', type: 'happy' },
  { month: 12, day: 24, name: 'Eid al-Mubahila & Giving of the Ring in Ruku (Aya al-Wilayah)', type: 'happy' },
  { month: 12, day: 25, name: 'Revelation of Surah al-Insan (Hal Ata) in praise of the Ahlulbayt (a.s.)', type: 'happy' }
];

// In-memory cache for Gregorian date -> Hijri parts
const hijriPartsCache = new Map<string, { day: number; month: number; year: number }>();

/**
 * Calculates exact Hijri date parts for any date in Africa/Dar_es_Salaam timezone (UTC+3)
 */
export function getHijriPartsForDate(dateStr: string): { day: number; month: number; year: number } {
  if (hijriPartsCache.has(dateStr)) {
    return hijriPartsCache.get(dateStr)!;
  }

  try {
    const dt = new Date(`${dateStr}T12:00:00+03:00`);
    const formatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      timeZone: 'Africa/Dar_es_Salaam',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric'
    });

    const parts = formatter.formatToParts(dt);
    let day = 0;
    let month = 0;
    let year = 0;

    for (const p of parts) {
      if (p.type === 'day') day = parseInt(p.value, 10);
      if (p.type === 'month') month = parseInt(p.value, 10);
      if (p.type === 'year') year = parseInt(p.value, 10);
    }

    if (day > 0 && month > 0) {
      const res = { day, month, year };
      hijriPartsCache.set(dateStr, res);
      return res;
    }
  } catch (err) {
    console.warn('Intl Islamic calculation fallback for:', dateStr, err);
  }

  // Fallback algorithm
  const fallback = calculateFallbackHijriParts(dateStr);
  hijriPartsCache.set(dateStr, fallback);
  return fallback;
}

function calculateFallbackHijriParts(dateStr: string): { day: number; month: number; year: number } {
  const [yStr, mStr, dStr] = dateStr.split('-');
  const gYear = parseInt(yStr, 10);
  const gMonth = parseInt(mStr, 10);
  const gDay = parseInt(dStr, 10);

  let m = gMonth;
  let y = gYear;
  if (m < 3) {
    y -= 1;
    m += 12;
  }

  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + gDay + b - 1524.5;

  const islamicEpoch = 1948439.5;
  const daysSinceEpoch = jd - islamicEpoch;
  const islamicYear = Math.floor((30 * daysSinceEpoch + 10646) / 10631);
  const daysInYear = daysSinceEpoch - Math.floor((10631 * islamicYear - 10646) / 30);
  const islamicMonth = Math.min(11, Math.floor((daysInYear + 29.5) / 29.5));
  const islamicDay = Math.floor(daysInYear - Math.floor(29.5001 * islamicMonth) + 1);

  return { day: islamicDay, month: islamicMonth + 1, year: islamicYear };
}

// 2. Official Tanzania National Public Holidays Calculator
export function getTanzaniaHolidaysForYear(year: number): Record<string, string> {
  const pad = (n: number) => n.toString().padStart(2, '0');

  // Anonymous Gregorian Easter calculation for Good Friday & Easter Monday
  const f = Math.floor;
  const G = year % 19;
  const C = f(year / 100);
  const H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30;
  const I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11));
  const J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7;
  const L = I - J;
  const easterMonth = 3 + f((L + 40) / 44);
  const easterDay = L + 28 - 31 * f(easterMonth / 4);
  const easterDate = new Date(Date.UTC(year, easterMonth - 1, easterDay));

  const gf = new Date(easterDate);
  gf.setUTCDate(easterDate.getUTCDate() - 2);
  const em = new Date(easterDate);
  em.setUTCDate(easterDate.getUTCDate() + 1);

  const gfStr = `${year}-${pad(gf.getUTCMonth() + 1)}-${pad(gf.getUTCDate())}`;
  const emStr = `${year}-${pad(em.getUTCMonth() + 1)}-${pad(em.getUTCDate())}`;

  return {
    [`${year}-01-01`]: "New Year's Day",
    [`${year}-01-12`]: 'Zanzibar Revolution Day',
    [`${year}-04-07`]: 'Karume Day',
    [gfStr]: 'Good Friday',
    [emStr]: 'Easter Monday',
    [`${year}-04-26`]: 'Union Day',
    [`${year}-05-01`]: "Workers' Day / Labour Day",
    [`${year}-07-07`]: 'Saba Saba (Dar es Salaam Trade Fair Day)',
    [`${year}-08-08`]: "Nane Nane (Farmers' Day)",
    [`${year}-10-14`]: 'Mwalimu Nyerere Day',
    [`${year}-12-09`]: 'Independence and Republic Day',
    [`${year}-12-25`]: 'Christmas Day',
    [`${year}-12-26`]: 'Boxing Day'
  };
}

// Cache for Tanzania holidays per year
const tanzaniaHolidaysCache = new Map<number, Record<string, string>>();

function getTanzaniaHolidaysMap(year: number): Record<string, string> {
  if (!tanzaniaHolidaysCache.has(year)) {
    tanzaniaHolidaysCache.set(year, getTanzaniaHolidaysForYear(year));
  }
  return tanzaniaHolidaysCache.get(year)!;
}

// 3. Exact Gregorian Overrides for Key Shia Occasions in East Africa / Dar es Salaam
// Used to guarantee 100% alignment with published community sighting calendars
const DAR_ES_SALAAM_EXACT_SHIA_OVERRIDES: Record<string, Array<{ name: string; type: 'happy' | 'mourning' }>> = {
  // 2025
  '2025-01-14': [{ name: 'Birth of Imam Ali ibn Abi Talib (a.s.) in the Holy Kaaba', type: 'happy' }],
  '2025-01-28': [{ name: "Eid al-Mab'ath", type: 'happy' }],
  '2025-02-14': [{ name: "Mid-Sha'ban - Birth of Imam al-Mahdi (a.t.f.s.)", type: 'happy' }],
  '2025-03-01': [{ name: 'First Day of Holy Month of Ramadan', type: 'happy' }],
  '2025-03-20': [{ name: 'Martyrdom of Imam Ali ibn Abi Talib (a.s.)', type: 'mourning' }],
  '2025-03-31': [{ name: 'Eid al-Fitr', type: 'happy' }],
  '2025-06-07': [{ name: 'Eid al-Adha', type: 'happy' }],
  '2025-06-15': [{ name: 'Eid al-Ghadeer (Eid Allah al-Akbar)', type: 'happy' }],
  '2025-06-21': [{ name: 'Eid al-Mubahila', type: 'happy' }],
  '2025-06-27': [{ name: 'Islamic New Year (1447 AH) / Start of Muharram Mourning', type: 'mourning' }],
  '2025-07-05': [{ name: "Tasu'a - Eve of Ashura / Martyrdom of Hazrat Abbas (a.s.)", type: 'mourning' }],
  '2025-07-06': [{ name: 'Day of Ashura - Martyrdom of Imam Hussain (a.s.) & Companions', type: 'mourning' }],
  '2025-08-15': [{ name: "Arba'een of Imam Hussain (a.s.)", type: 'mourning' }],

  // 2026
  '2026-01-03': [{ name: 'Birth of Imam Ali ibn Abi Talib (a.s.) in the Holy Kaaba', type: 'happy' }],
  '2026-01-17': [{ name: "Eid al-Mab'ath", type: 'happy' }],
  '2026-02-03': [{ name: "Mid-Sha'ban - Birth of Imam al-Mahdi (a.t.f.s.)", type: 'happy' }],
  '2026-02-18': [{ name: 'First Day of Holy Month of Ramadan', type: 'happy' }],
  '2026-03-08': [{ name: 'Night of Qadr / Zarbat (Striking) of Imam Ali (a.s.)', type: 'mourning' }],
  '2026-03-10': [{ name: 'Night of Qadr / Martyrdom of Imam Ali ibn Abi Talib (a.s.)', type: 'mourning' }],
  '2026-03-12': [{ name: 'Laylat al-Qadr (Grand Night of Power)', type: 'happy' }],
  '2026-03-20': [{ name: 'Eid al-Fitr', type: 'happy' }],
  '2026-05-27': [{ name: 'Eid al-Adha', type: 'happy' }],
  '2026-06-04': [{ name: 'Eid al-Ghadeer (Eid Allah al-Akbar)', type: 'happy' }],
  '2026-06-10': [{ name: 'Eid al-Mubahila', type: 'happy' }],
  '2026-06-16': [{ name: 'Islamic New Year (1448 AH) / Start of Muharram Mourning', type: 'mourning' }],
  '2026-06-24': [{ name: "Tasu'a - Eve of Ashura / Martyrdom of Hazrat Abbas (a.s.)", type: 'mourning' }],
  '2026-06-25': [{ name: 'Day of Ashura - Martyrdom of Imam Hussain (a.s.) & Companions', type: 'mourning' }],
  '2026-06-26': [{ name: 'Sham-e-Ghariban (Night of the Desolate)', type: 'mourning' }],
  '2026-07-10': [{ name: 'Martyrdom of Imam Zayn al-Abidin (a.s.)', type: 'mourning' }],
  '2026-08-04': [{ name: "Arba'een of Imam Hussain (a.s.)", type: 'mourning' }],
  '2026-08-12': [{ name: 'Martyrdom of the Holy Prophet Muhammad (s.a.w.) & Imam Hasan (a.s.)', type: 'mourning' }],
  '2026-08-14': [{ name: 'Martyrdom of Imam Ali al-Ridha (a.s.)', type: 'mourning' }],
  '2026-08-23': [{ name: 'Eid-e-Zahra (s.a.) / Commencement of Imamate of Imam al-Mahdi (a.t.f.s.)', type: 'happy' }],
  '2026-08-31': [{ name: "Milad-un-Nabi: Birth of Prophet Muhammad (s.a.w.) & Imam Ja'far al-Sadiq (a.s.)", type: 'happy' }],
  '2026-09-20': [{ name: 'Birth of Imam Hasan al-Askari (a.s.)', type: 'happy' }],
  '2026-10-16': [{ name: 'Birth of Lady Zainab bint Ali (s.a.)', type: 'happy' }],
  '2026-10-24': [{ name: 'Ayyam-e-Fatimiyyah - Martyrdom of Lady Fatima Zahra (s.a.)', type: 'mourning' }],
  '2026-10-25': [{ name: 'Ayyam-e-Fatimiyyah - Martyrdom of Lady Fatima Zahra (s.a.)', type: 'mourning' }],
  '2026-10-26': [{ name: 'Ayyam-e-Fatimiyyah - Martyrdom of Lady Fatima Zahra (s.a.)', type: 'mourning' }],
  '2026-11-13': [{ name: 'Martyrdom of Lady Fatima Zahra (s.a.) (95-Day Narration)', type: 'mourning' }],
  '2026-11-30': [{ name: 'Birth of Lady Fatima Zahra (s.a.)', type: 'happy' }],
  '2026-12-23': [{ name: 'Birth of Imam Ali ibn Abi Talib (a.s.) in the Holy Kaaba', type: 'happy' }],

  // 2027
  '2027-01-06': [{ name: "Eid al-Mab'ath", type: 'happy' }],
  '2027-01-23': [{ name: "Mid-Sha'ban - Birth of Imam al-Mahdi (a.t.f.s.)", type: 'happy' }],
  '2027-02-08': [{ name: 'First Day of Holy Month of Ramadan', type: 'happy' }],
  '2027-02-27': [{ name: 'Night of Qadr / Zarbat (Striking) of Imam Ali (a.s.)', type: 'mourning' }],
  '2027-03-01': [{ name: 'Night of Qadr / Martyrdom of Imam Ali (a.s.)', type: 'mourning' }],
  '2027-03-10': [{ name: 'Eid al-Fitr', type: 'happy' }],
  '2027-05-17': [{ name: 'Eid al-Adha', type: 'happy' }],
  '2027-05-25': [{ name: 'Eid al-Ghadeer (Eid Allah al-Akbar)', type: 'happy' }],
  '2027-06-05': [{ name: 'Islamic New Year (1449 AH) / Start of Muharram Mourning', type: 'mourning' }],
  '2027-06-13': [{ name: "Tasu'a - Eve of Ashura / Martyrdom of Hazrat Abbas (a.s.)", type: 'mourning' }],
  '2027-06-14': [{ name: 'Day of Ashura - Martyrdom of Imam Hussain (a.s.) & Companions', type: 'mourning' }],
  '2027-07-24': [{ name: "Arba'een of Imam Hussain (a.s.)", type: 'mourning' }]
};

// Result cache for full occasion markers per dateStr
const calendarMarkersCache = new Map<string, CalendarOccasionMarker[]>();

/**
 * Returns all background calendar markers (Shia Islamic events & Tanzania national holidays)
 * for any given YYYY-MM-DD date in the Africa/Dar_es_Salaam timezone.
 */
export function getCalendarOccasions(dateStr: string): CalendarOccasionMarker[] {
  if (calendarMarkersCache.has(dateStr)) {
    return calendarMarkersCache.get(dateStr)!;
  }

  const markers: CalendarOccasionMarker[] = [];
  const [yearStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);

  // A. Check Tanzania National Holidays
  const tzMap = getTanzaniaHolidaysMap(year);
  if (tzMap[dateStr]) {
    markers.push({
      id: `tz-holiday-${dateStr}`,
      name: `Tanzania Holiday: ${tzMap[dateStr]}`,
      category: 'tanzania_holiday',
      dotColorClass: 'bg-blue-600 border-blue-700',
      badgeBgClass: 'bg-blue-50 border-blue-200',
      badgeTextClass: 'text-blue-900'
    });
  }

  // A2. Check UN Designated Days useful to WIPAHS (Water, Health, Women, Family, Environment, Youth, Literacy, Elderly, Food, Children, Volunteers, Human Rights)
  const [_, mStr, dStr] = dateStr.split('-');
  const mmdd = `${mStr}-${dStr}`;
  const unDaysMap: Record<string, string> = {
    '03-08': "International Women's Day",
    '03-22': 'World Water Day (Clean Water & Sanitation)',
    '04-07': 'World Health Day',
    '05-15': 'International Day of Families',
    '06-05': 'World Environment Day',
    '07-18': 'Nelson Mandela International Day',
    '08-12': 'International Youth Day',
    '09-08': 'International Literacy Day',
    '10-01': 'International Day of Older Persons',
    '10-16': 'World Food Day (Zero Hunger Initiative)',
    '11-20': "World Children's Day",
    '12-05': 'International Volunteer Day',
    '12-10': 'Human Rights Day'
  };

  if (unDaysMap[mmdd]) {
    markers.push({
      id: `un-day-${dateStr}`,
      name: `UN Day: ${unDaysMap[mmdd]}`,
      category: 'un_designated_day',
      dotColorClass: 'bg-sky-500 border-sky-600',
      badgeBgClass: 'bg-sky-50 border-sky-200',
      badgeTextClass: 'text-sky-900'
    });
  }

  // B. Check Shia Islamic Events
  // 1. Direct verified override if present
  if (DAR_ES_SALAAM_EXACT_SHIA_OVERRIDES[dateStr]) {
    for (const ev of DAR_ES_SALAAM_EXACT_SHIA_OVERRIDES[dateStr]) {
      const isHappy = ev.type === 'happy';
      markers.push({
        id: `shia-ovr-${dateStr}-${ev.name.slice(0, 15)}`,
        name: ev.name,
        category: isHappy ? 'shia_happy' : 'shia_mourning',
        dotColorClass: isHappy ? 'bg-emerald-500 border-emerald-600' : 'bg-slate-950 border-slate-700',
        badgeBgClass: isHappy ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-900 border-slate-950 text-white',
        badgeTextClass: isHappy ? 'text-emerald-900' : 'text-slate-100'
      });
    }
  } else {
    // 2. Dynamic conversion via Islamic Lunar Calendar
    const hijri = getHijriPartsForDate(dateStr);
    const monthName = SHIA_HIJRI_MONTH_NAMES[hijri.month] || `Month ${hijri.month}`;
    const hijriDateStr = `${hijri.day} ${monthName} ${hijri.year} AH`;

    const matches = SHIA_ISLAMIC_OCCASIONS.filter(
      o => o.month === hijri.month && o.day === hijri.day
    );

    for (const match of matches) {
      const isHappy = match.type === 'happy';
      markers.push({
        id: `shia-dyn-${dateStr}-${match.name.slice(0, 15)}`,
        name: match.name,
        category: isHappy ? 'shia_happy' : 'shia_mourning',
        dotColorClass: isHappy ? 'bg-emerald-500 border-emerald-600' : 'bg-slate-950 border-slate-700',
        badgeBgClass: isHappy ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-900 border-slate-950 text-white',
        badgeTextClass: isHappy ? 'text-emerald-900' : 'text-slate-100',
        hijriDateStr
      });
    }
  }

  calendarMarkersCache.set(dateStr, markers);
  return markers;
}
