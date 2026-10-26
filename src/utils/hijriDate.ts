import { useState, useEffect } from 'react';

/**
 * Utility to fetch and format accurate Islamic (Hijri) dates from the Aladhan API
 * with authentic Shia month transliterations and local storage caching.
 */

const SHIA_HIJRI_MONTHS: Record<number, string> = {
  1: "Muharram",
  2: "Safar",
  3: "Rabi' al-Awwal",
  4: "Rabi' al-Thani",
  5: "Jumada al-Ula",
  6: "Jumada al-Akhirah",
  7: "Rajab",
  8: "Sha'ban",
  9: "Ramadan",
  10: "Shawwal",
  11: "Dhu al-Qa'dah",
  12: "Dhu al-Hijjah"
};

export async function fetchHijriDate(date: Date = new Date()): Promise<string> {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const dateStr = `${day}-${month}-${year}`; // DD-MM-YYYY format for API
  const cacheKey = `officehub_hijri_date_${year}-${month}-${day}`;

  // Check cache first
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const res = await fetch(`https://api.aladhan.com/v1/gToH/${dateStr}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.data?.hijri) {
        const hDay = parseInt(data.data.hijri.day, 10);
        const hMonthNum = parseInt(data.data.hijri.month.number, 10);
        const hYear = data.data.hijri.year;
        const monthName = SHIA_HIJRI_MONTHS[hMonthNum] || data.data.hijri.month.en;
        const formatted = `${hDay} ${monthName} ${hYear} AH`;
        localStorage.setItem(cacheKey, formatted);
        return formatted;
      }
    }
  } catch (err) {
    console.error('Failed to fetch Hijri date from Aladhan API:', err);
  }

  // Fallback if API is unreachable
  return getFallbackHijriDate(date);
}

function getFallbackHijriDate(date: Date): string {
  const gDay = date.getDate();
  const gMonth = date.getMonth();
  const gYear = date.getFullYear();

  let m = gMonth + 1;
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

  const monthName = SHIA_HIJRI_MONTHS[islamicMonth + 1] || "Muharram";
  return `${islamicDay} ${monthName} ${islamicYear} AH`;
}

export function useHijriDate(): string {
  const [hijriDate, setHijriDate] = useState<string>('');

  useEffect(() => {
    fetchHijriDate().then(setHijriDate);
  }, []);

  return hijriDate;
}
