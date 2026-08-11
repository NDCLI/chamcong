import { useState, useEffect } from 'react';
import { WEEKDAYS } from '../constants';

const getCurrentTimeString = () => {
  const now = new Date();
  const wd = WEEKDAYS[now.getDay()];
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${wd} ${d}/${m} ${h}:${min}:${s}`;
};

export const Clock = () => {
  const [currentTime, setCurrentTime] = useState<string>(getCurrentTimeString());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(getCurrentTimeString());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="led-ticker" aria-label="Ngày và giờ hiện tại">
      <span>{currentTime}</span>
    </div>
  );
};
