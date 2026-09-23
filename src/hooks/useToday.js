import { useEffect, useState } from 'react';
import { dateKey, TIME_ZONE } from '../lib/domain';
export function useToday(timezone = TIME_ZONE) {
  const [today, setToday] = useState(() => dateKey(new Date(), timezone));
  useEffect(() => {
    const update = () => setToday(dateKey(new Date(), timezone));
    const timer = setInterval(update, 15000);
    const initial = setTimeout(update, 0);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      clearTimeout(initial);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [timezone]);
  return today;
}
