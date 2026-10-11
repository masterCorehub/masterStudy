export function rollingAgendaDays(today) {
  return [-2, -1, 0, 1, 2].map(offset => {
    const date = new Date(today);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return { offset, date, dayIndex: date.getDay() };
  });
}
