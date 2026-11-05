export interface QuranAyah {
  arabicText: string;
  translation: string;
  surahNameEnglish: string;
  surahNameArabic?: string;
  surahNumber: number;
  ayahNumber: number;
  edition: string;
  citation: string;
}

// One shared civil day for OfficeHub, regardless of the visitor's timezone.
export function getAyahDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function getDailyAyahNumber(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid ayah date');
  // Avalanche the date hash: consecutive dates must not select consecutive verses.
  let hash = 2166136261;
  for (const char of `officehub-ayah-v3:${day}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13; hash = Math.imul(hash, 0xc2b2ae35); hash ^= hash >>> 16;
  return (hash >>> 0) % 6236 + 1;
}

type DailyCache = { number: number; ayah: QuranAyah };
const memory = new Map<string, DailyCache>();
const pending = new Map<string, Promise<QuranAyah>>();
const keyFor = (day: string) => `wipahs_ayah_v3_${day}`;
function validCache(value: any, number: number): value is DailyCache {
  const a = value?.ayah;
  return value?.number === number && a &&
    ['arabicText', 'translation', 'surahNameEnglish', 'citation'].every(k => typeof a[k] === 'string' && a[k].trim()) &&
    a.edition === "Ali Quli Qarai's Translation" && Number.isInteger(a.surahNumber) && a.surahNumber >= 1 && a.surahNumber <= 114 &&
    Number.isInteger(a.ayahNumber) && a.ayahNumber >= 1;
}
function remember(day: string, value: DailyCache): void {
  memory.set(day, value);
  if (memory.size > 8) memory.delete(memory.keys().next().value!);
}

/** Cached selected verse only. Never substitute an unrelated fallback verse. */
export function getAyahOfTheDaySnapshot(day = getAyahDay()): QuranAyah | null {
  const number = getDailyAyahNumber(day);
  const saved = memory.get(day);
  if (saved) return saved.ayah;
  try {
    const value = JSON.parse(localStorage.getItem(keyFor(day)) || 'null');
    if (validCache(value, number)) { remember(day, value); return value.ayah; }
  } catch { /* Storage may be unavailable in private browsing. */ }
  return null;
}

export async function fetchAyahOfTheDay(day = getAyahDay()): Promise<QuranAyah> {
  const cached = getAyahOfTheDaySnapshot(day);
  if (cached) return cached;
  const inFlight = pending.get(day);
  if (inFlight) return inFlight;
  const number = getDailyAyahNumber(day);
  const request = (async () => {
    const response = await fetch(`https://api.alquran.cloud/v1/ayah/${number}/editions/quran-uthmani,en.qarai`, { signal: AbortSignal.timeout(3500) });
    if (!response.ok) throw new Error('Daily ayah is temporarily unavailable');
    const json = await response.json();
    const arabic = json?.data?.find((d: any) => d?.edition?.identifier === 'quran-uthmani');
    const english = json?.data?.find((d: any) => d?.edition?.identifier === 'en.qarai');
    if (json?.code !== 200 || arabic?.number !== number || english?.number !== number ||
        arabic?.surah?.number !== english?.surah?.number || arabic?.numberInSurah !== english?.numberInSurah) {
      throw new Error('Daily ayah response did not match the selected verse');
    }
    const ayah: QuranAyah = {
      arabicText: arabic.text, translation: english.text,
      surahNameEnglish: arabic.surah.englishName, surahNameArabic: arabic.surah.name,
      surahNumber: arabic.surah.number, ayahNumber: arabic.numberInSurah,
      edition: "Ali Quli Qarai's Translation",
      citation: `Surah ${arabic.surah.englishName} ${arabic.surah.number}:${arabic.numberInSurah}`,
    };
    const value = { number, ayah };
    if (!validCache(value, number)) throw new Error('Daily ayah response was incomplete');
    remember(day, value);
    // A failed write must not discard a correctly fetched verse.
    try { localStorage.setItem(keyFor(day), JSON.stringify(value)); } catch {}
    return ayah;
  })();
  pending.set(day, request);
  try { return await request; } finally { pending.delete(day); }
}