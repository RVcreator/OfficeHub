export interface ShiaHadith {
  arabicText?: string;
  translation: string;
  speaker: string;
  collection: 'Nahj al-Balagha' | 'Al-Kafi' | 'Bihar al-Anwar' | 'Wasail al-Shia' | 'Tuhaf al-Uqul' | 'Risalat al-Huquq';
  citation: string;
}

const LOCAL_SHIA_HADITH_DATASET: ShiaHadith[] = [
  {
    speaker: 'Imam Ali (a.s.)',
    arabicText: 'يَا كُمَيْلُ، الْعِلْمُ خَيْرٌ مِنَ الْمَالِ: الْعِلْمُ يَحْرُسُكَ وَأَنْتَ تَحْرُسُ الْمَالِ',
    translation: 'O Kumayl! Knowledge is better than wealth: Knowledge guards you, while you have to guard wealth.',
    collection: 'Nahj al-Balagha',
    citation: 'Nahj al-Balagha, Saying 147',
  },
  {
    speaker: 'Imam al-Sadiq (a.s.)',
    arabicText: 'دِعَامَةُ الْإِنْسَانِ الْعَقْلُ ، وَمِنَ الْعَقْلِ الْفِطْنَةُ وَالْفَهْمُ وَالْحِفْظُ وَالْعِلْمُ',
    translation: 'The pillar of man is intellect, and from intellect come discernment, comprehension, memory, and knowledge.',
    collection: 'Al-Kafi',
    citation: 'Al-Kafi, Vol. 1, Book of Intellect, Hadith 12',
  },
  {
    speaker: 'Imam Ali (a.s.)',
    arabicText: 'احْيِ قَلْبَكَ بِالْمَوْعِظَةِ، وَأَمِتْهُ بِالزَّهَادَةِ، وَقَوِّهِ بِالْيَقِينِ وَوَنِّرْهُ بِالْحِكْمَةِ',
    translation: 'Enliven your heart with exhortation, tame it with asceticism, strengthen it with conviction, and illuminate it with wisdom.',
    collection: 'Nahj al-Balagha',
    citation: 'Nahj al-Balagha, Letter 31',
  },
  {
    speaker: 'Prophet Muhammad (s.a.w.)',
    arabicText: 'مَنْ أَصْبَحَ لَا يَهْتَمُّ بِأُمُورِ الْمُسْلِمِينَ فَلَيْسَ بِمُسْلِمٍ',
    translation: 'One who begins their morning without concerning themselves with the affairs of fellow Muslims is not a true Muslim.',
    collection: 'Wasail al-Shia',
    citation: 'Wasail al-Shia, Vol. 15, p. 253',
  },
  {
    speaker: 'Imam al-Baqir (a.s.)',
    arabicText: 'إِنَّمَا يَدَاقُّ اللَّهُ الْعِبَادَ فِي الْحِسَابِ يَوْمَ الْقِيَامَةِ عَلَى قَدْرِ مَا آتَاهُمْ مِنَ الْعُقُولِ فِي الدُّنْيَا',
    translation: 'Allah will scrutinize the accounts of His servants on Resurrection Day in accordance with the degree of intellect He bestowed upon them in the world.',
    collection: 'Al-Kafi',
    citation: 'Al-Kafi, Vol. 2, Book of Faith & Disbelief, Hadith 3',
  },
  {
    speaker: 'Imam al-Hasan (a.s.)',
    arabicText: 'أَحْسَنُ الْحَسَنِ الْخُلُقُ الْحَسَنُ',
    translation: 'The finest of all good virtues is noble, gentle character.',
    collection: 'Bihar al-Anwar',
    citation: 'Bihar al-Anwar, Vol. 75, p. 364',
  },
  {
    speaker: 'Imam al-Rida (a.s.)',
    arabicText: 'التَّوَدُّدُ إِلَى النَّاسِ نِصْفُ الْعَقْلِ',
    translation: 'Expressing genuine friendliness and goodwill towards people is half of wisdom.',
    collection: 'Tuhaf al-Uqul',
    citation: 'Tuhaf al-Uqul, p. 224',
  },
  {
    speaker: 'Imam Ali (a.s.)',
    arabicText: 'عَجِبْتُ لِلْمُتَكَبِّرِ الَّذِي كَانَ بِالأَمْسِ نُطْفَةً وَيَكُونُ غَداً جِيفَةً',
    translation: 'I wonder at the arrogant person who was a humble drop yesterday and will be dust tomorrow.',
    collection: 'Nahj al-Balagha',
    citation: 'Nahj al-Balagha, Saying 224',
  },
  {
    speaker: 'Imam al-Sadiq (a.s.)',
    arabicText: 'كُونُوا دُعَاةً لِلنَّاسِ بِغَيْرِ أَلْسِنَتِكُمْ لِيَرَوْا مِنْكُمُ الْوَرَعَ وَالاجْتِهَادَ وَالصَّلاةَ وَالْخَيْرَ',
    translation: 'Be ambassadors of faith to people through your actions rather than your tongues, so that they see piety, diligence, prayer, and goodness in you.',
    collection: 'Al-Kafi',
    citation: 'Al-Kafi, Vol. 2, p. 103',
  },
  {
    speaker: 'Imam al-Sajjad (a.s.)',
    arabicText: 'أَمَّا حَقُّ سَائِسِكَ بِالْعِلْمِ فَالْتَّعْظِيمُ لَهُ وَالتَّوقِيرُ لِمَجْلِسِهِ وَحُسْنُ الاسْتِمَاعِ إِلَيْهِ',
    translation: 'The right of the teacher who guides you in knowledge is that you honor them, respect their gathering, and listen attentively to them.',
    collection: 'Risalat al-Huquq',
    citation: 'Risalat al-Huquq (Treatise on Rights), Right 17',
  },
  {
    speaker: 'Imam al-Kadhim (a.s.)',
    arabicText: 'لَيْسَ مِنَّا مَنْ لَمْ يُحَاسِبْ نَفْسَهُ فِي كُلِّ يَوْمٍ',
    translation: 'He is not truly of our followers who does not call himself to account every single day.',
    collection: 'Bihar al-Anwar',
    citation: 'Bihar al-Anwar, Vol. 78, p. 370',
  },
  {
    speaker: 'Imam Ali (a.s.)',
    arabicText: 'كُنْ فِي الْفِتْنَةِ كَابْنِ اللَّبُونِ، لَا ظَهْرٌ فَيُرْكَبَ، وَلَا ضَرْعٌ فَيُحْلَبَ',
    translation: 'During times of temptation and strife, remain composed like a young camel—having no back to be ridden and no milk to be taken.',
    collection: 'Nahj al-Balagha',
    citation: 'Nahj al-Balagha, Saying 150',
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

export async function fetchHadithOfTheDay(customDate?: string): Promise<ShiaHadith> {
  const todayStr = customDate || new Date().toISOString().split('T')[0];
  const cacheKey = `wipahs_hadith_v2_${todayStr}`;

  // Check local storage cache first
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.translation && parsed.citation) {
        return parsed;
      }
    }
  } catch {
    // ignore storage error
  }

  // Pick deterministic item from verified Shia Hadith dataset
  const index = getDeterministicIndexForDate(todayStr, LOCAL_SHIA_HADITH_DATASET.length);
  const selectedHadith = LOCAL_SHIA_HADITH_DATASET[index];

  // Store in cache
  try {
    localStorage.setItem(cacheKey, JSON.stringify(selectedHadith));
  } catch {}

  return selectedHadith;
}
