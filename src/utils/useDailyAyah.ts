import { useEffect, useState } from 'react';
import { fetchAyahOfTheDay, getAyahDay, getAyahOfTheDaySnapshot } from '../services/quranService';

export function useDailyAyah() {
  const [day, setDay] = useState(getAyahDay);
  const [result, setResult] = useState(() => ({ day, ayah: getAyahOfTheDaySnapshot(day), error: false }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const check = () => setDay(getAyahDay());
    const timer = window.setInterval(check, 30_000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  useEffect(() => {
    let current = true;
    setResult({ day, ayah: getAyahOfTheDaySnapshot(day), error: false });
    fetchAyahOfTheDay(day).then(ayah => {
      if (current) setResult({ day, ayah, error: false });
    }).catch(() => {
      if (current) setResult({ day, ayah: null, error: true });
    });
    return () => { current = false; };
  }, [day, attempt]);
  return { ayah: result.day === day ? result.ayah : null, error: result.day === day && result.error, retry: () => setAttempt(value => value + 1) };
}
