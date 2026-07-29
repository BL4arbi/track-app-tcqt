function pad(n) {
  return String(n).padStart(2, '0');
}

export function toDateKey(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

// ISO-8601 week number for the week containing this date.
export function isoWeekNumber(year, month, day) {
  const date = new Date(Date.UTC(year, month, day));
  // ISO weeks start Monday; shift so day 0 = Monday, then snap to that week's Thursday.
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((date - firstThursday) / (7 * 24 * 60 * 60 * 1000));
}

// Monday-first month grid: array of weeks, each an array of
// { dateKey, day, inMonth, isToday }.
export function buildMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // JS getDay(): 0=Sunday..6=Saturday. Convert to Monday-first offset.
  const startOffset = (firstOfMonth.getDay() + 6) % 7;

  const today = new Date();
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const cells = [];
  for (let i = 0; i < startOffset; i++) {
    const day = new Date(year, month, 1 - (startOffset - i));
    cells.push({
      dateKey: toDateKey(day.getFullYear(), day.getMonth(), day.getDate()),
      day: day.getDate(),
      inMonth: false,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = toDateKey(year, month, d);
    cells.push({ dateKey, day: d, inMonth: true, isToday: dateKey === todayKey });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const [y, m, d] = last.dateKey.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    cells.push({
      dateKey: toDateKey(next.getFullYear(), next.getMonth(), next.getDate()),
      day: next.getDate(),
      inMonth: false,
    });
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    const [y, m, d] = week[0].dateKey.split('-').map(Number);
    week.weekNumber = isoWeekNumber(y, m - 1, d);
    weeks.push(week);
  }
  return weeks;
}

export const MONTH_NAMES_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export const WEEKDAY_NAMES_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
