import { useState, useEffect } from "react";
import { getLocalDateKey } from "./dateUtils";

/**
 * Hook que mantém a data atual dinamicamente atualizada em tempo real.
 * Atualiza automaticamente quando a data/dia muda (ex: passagem de meia-noite),
 * a cada minuto e sempre que a janela ganha foco/visibilidade.
 */
export function useCurrentDate() {
  const [currentDate, setCurrentDate] = useState(() => new Date());

  useEffect(() => {
    let lastDateKey = getLocalDateKey(currentDate);

    const checkDateChange = () => {
      const now = new Date();
      const newDateKey = getLocalDateKey(now);

      if (newDateKey !== lastDateKey) {
        lastDateKey = newDateKey;
        setCurrentDate(now);
      } else {
        setCurrentDate((prev) => {
          if (now.getTime() - prev.getTime() >= 60_000) {
            return now;
          }
          return prev;
        });
      }
    };

    const intervalId = setInterval(checkDateChange, 15_000);

    const handleFocus = () => checkDateChange();
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, []);

  return currentDate;
}
