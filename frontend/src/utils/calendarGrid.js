function pad(n) {
  return String(n).padStart(2, '0');
}

export function toDateKey(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
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
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const MONTH_NAMES_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export const WEEKDAY_NAMES_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
