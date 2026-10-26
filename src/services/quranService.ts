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

const LOCAL_AYAH_DATASET: QuranAyah[] = [
  {
    arabicText: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ',
    translation: 'Allah—there is no god except Him—is the Living One, the All-sustainer. Neither drowsiness befalls Him nor sleep.',
    surahNameEnglish: 'Al-Baqarah',
    surahNameArabic: 'البقرة',
    surahNumber: 2,
    ayahNumber: 255,
    edition: "Ali Quli Qarai's Translation",
    citation: 'Surah Al-Baqarah 2:255',
  },
  {
    arabicText: 'وَاعْتَصِمُوا بِحَبْلِ اللَّهِ جَمِيعًا وَلَا تَفَرَّقُوا',
    translation: 'Hold fast, all together, to Allah’s cord, and do not be divided.',
    surahNameEnglish: 'Aal-i-Imran',
    surahNameArabic: 'آل عمران',
    surahNumber: 3,
    ayahNumber: 103,
    edition: "Ali Quli Qarai's Translation",
    citation: 'Surah Aal-i-Imran 3:103',
  },
  {
    arabicText: 'لَّا إِلَٰهَ إِلَّا أَنتَ سُبْحَانَكَ إِنِّي كُنتُ مِنَ الظَّالِمِينَ',
    translation: 'There is no god except You! Immaculate are You! Indeed I have been among the wrongdoers.',
    surahNameEnglish: 'Al-Anbiya',
    surahNameArabic: 'الأنبياء',
    surahNumber: 21,
    ayahNumber: 87,
    edition: "Ali Quli Qarai's Translation",
    citation: 'Surah Al-Anbiya 21:87',
  },
  {
    arabicText: 'فَإِنَّ مَعَ الْعُسْرِ يُسْرًا • إِنَّ مَعَ الْعُسْرِ يُسْرًا',
    translation: 'Indeed ease accompanies hardship. Indeed ease accompanies hardship.',
    surahNameEnglish: 'Al-Inshirah',
    surahNameArabic: 'الشرح',
    surahNumber: 94,
    ayahNumber: 5,
    edition: "Ali Quli Qarai's Translation",
    citation: 'Surah Al-Inshirah 94:5-6',
  },
  {
    arabicText: 'إِنَّ اللَّهَ وَمَلَائِكَتَهُ يُصَلُّونَ عَلَى النَّبِيِّ ۚ يَا أَيُّهَا الَّذِينَ آمَنُوا صَلُّوا عَلَيْهِ وَسَلِّمُوا تَسْلِيمًا',
    translation: 'Indeed Allah and His angels bless the Prophet. O you who have faith! Invoke blessings on him and invoke Peace upon him in a worthy manner.',
    surahNameEnglish: 'Al-Ahzab',
    surahNameArabic: 'الأحزاب',
    surahNumber: 33,
    ayahNumber: 56,
    edition: "Ali Quli Qarai's Translation",
    citation: 'Surah Al-Ahzab 33:56',
  },
  {
    arabicText: 'لَوْ أَنزَلْنَا هَٰذَا الْقُرْآنَ عَلَىٰ جَبَلٍ لَّرَأَيْتَهُ خَاشِعًا مُّتَصَدِّعًا مِّنْ خَشْيَةِ اللَّهِ',
    translation: 'Had We sent down this Quran upon a mountain, you would have seen it humbled and split asunder out of the fear of Allah.',
    surahNameEnglish: 'Al-Hashr',
    surahNameArabic: 'الحشر',
    surahNumber: 59,
    ayahNumber: 21,
    edition: "Ali Quli Qarai's Translation",
    citation: 'Surah Al-Hashr 59:21',
  },
  {
    arabicText: 'لَقَدْ جَاءَكُمْ رَسُولٌ مِّنْ أَنفُسِكُمْ عَزِيزٌ عَلَيْهِ مَا عَنِتُّمْ حَرِيصٌ عَلَيْكُم بِالْمُؤْمِنِينَ رَءُوفٌ رَّحِيمٌ',
    translation: 'There has certainly come to you an Apostle from among yourselves, to whom your tribulations are grievous, who is full of concern for you, and compassionate and merciful to the faithful.',
    surahNameEnglish: 'Al-Tawbah',
    surahNameArabic: 'التوبة',
    surahNumber: 9,
    ayahNumber: 128,
    edition: "Ali Quli Qarai's Translation",
    citation: 'Surah Al-Tawbah 9:128',
  },
  {
    arabicText: 'رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ وَاجْعَلْنَا لِلْمُتَّقِينَ إِمَامًا',
    translation: 'Our Lord! Grant us comfort in our spouses and offspring, and make us leaders of the Godwary.',
    surahNameEnglish: 'Al-Furqan',
    surahNameArabic: 'الفرقان',
    surahNumber: 25,
    ayahNumber: 74,
    edition: "Ali Quli Qarai's Translation",
    citation: 'Surah Al-Furqan 25:74',
  },
  {
    arabicText: 'أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ',
    translation: 'Look! The hearts find rest in the remembrance of Allah!',
    surahNameEnglish: 'Al-Rad',
    surahNameArabic: 'الرعد',
    surahNumber: 13,
    ayahNumber: 28,
    edition: "Ali Quli Qarai's Translation",
    citation: 'Surah Al-Rad 13:28',
  },
  {
    arabicText: 'لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ',
    translation: 'If you are grateful, I will surely enhance you in blessing.',
    surahNameEnglish: 'Ibrahim',
    surahNameArabic: 'إبراهيم',
    surahNumber: 14,
    ayahNumber: 7,
    edition: "Ali Quli Qarai's Translation",
    citation: 'Surah Ibrahim 14:7',
  },
  {
    arabicText: 'فَاذْكُرُونِي أَذْكُرْكُمْ وَاشْكُرُوا لِي وَلَا تَكْفُرُونِ',
    translation: 'So remember Me that I may remember you, and thank Me, and do not be ungrateful to Me.',
    surahNameEnglish: 'Al-Baqarah',
    surahNameArabic: 'البقرة',
    surahNumber: 2,
    ayahNumber: 152,
    edition: "Ali Quli Qarai's Translation",
    citation: 'Surah Al-Baqarah 2:152',
  },
  {
    arabicText: 'وَإِذَا سَأَلَكَ عِبَادِي عَنِّي فَإِنِّي قَرِيبٌ ۖ أُجِيبُ دَعْوَةَ الدَّاعِ إِذَا دَعَانِ',
    translation: 'When My servants ask you about Me, tell them that I am indeed nearmost. I answer the supplicant’s call when he calls Me.',
    surahNameEnglish: 'Al-Baqarah',
    surahNameArabic: 'البقرة',
    surahNumber: 2,
    ayahNumber: 186,
    edition: "Ali Quli Qarai's Translation",
    citation: 'Surah Al-Baqarah 2:186',
  },
];

function getDeterministicIndexForDate(dateStr: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash << 5) - hash + dateStr.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % max;
}

export async function fetchAyahOfTheDay(customDate?: string): Promise<QuranAyah> {
  const todayStr = customDate || new Date().toISOString().split('T')[0];
  const cacheKey = `wipahs_ayah_v2_${todayStr}`;

  // Check local cache
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.arabicText && parsed.translation) {
        return parsed;
      }
    }
  } catch {
    // ignore storage error
  }

  // Pick deterministic index for fallback
  const fallbackIndex = getDeterministicIndexForDate(todayStr, LOCAL_AYAH_DATASET.length);
  const fallbackAyah = LOCAL_AYAH_DATASET[fallbackIndex];

  // Try live fetch from Al Quran Cloud API with Ali Quli Qarai translation (en.qarai)
  try {
    // Use a deterministic ayah number out of total 6236 ayahs or target key surahs
    const ayahNumberForToday = (getDeterministicIndexForDate(todayStr, 6236) % 6236) + 1;
    const response = await fetch(
      `https://api.alquran.cloud/v1/ayah/${ayahNumberForToday}/editions/quran-uthmani,en.qarai`,
      { signal: AbortSignal.timeout(3500) }
    );

    if (response.ok) {
      const json = await response.json();
      if (json && json.code === 200 && Array.isArray(json.data) && json.data.length >= 2) {
        const arabicData = json.data.find((d: any) => d.edition.identifier === 'quran-uthmani') || json.data[0];
        const EnglishData = json.data.find((d: any) => d.edition.identifier === 'en.qarai') || json.data[1];

        const fetchedAyah: QuranAyah = {
          arabicText: arabicData.text,
          translation: EnglishData.text,
          surahNameEnglish: arabicData.surah.englishName,
          surahNameArabic: arabicData.surah.name,
          surahNumber: arabicData.surah.number,
          ayahNumber: arabicData.numberInSurah,
          edition: "Ali Quli Qarai's Translation",
          citation: `Surah ${arabicData.surah.englishName} ${arabicData.surah.number}:${arabicData.numberInSurah}`,
        };

        localStorage.setItem(cacheKey, JSON.stringify(fetchedAyah));
        return fetchedAyah;
      }
    }
  } catch (err) {
    console.warn('Al Quran Cloud API fetch fallback to Shia Qarai dataset:', err);
  }

  // Fallback to verified local dataset with Ali Quli Qarai translation
  try {
    localStorage.setItem(cacheKey, JSON.stringify(fallbackAyah));
  } catch {}

  return fallbackAyah;
}
