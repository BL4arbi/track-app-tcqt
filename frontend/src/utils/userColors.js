// Validated categorical palette (light/dark), see dataviz skill reference palette.
// Fixed hue order — never re-sorted per dataset — cycled by user id order.
const PALETTE = [
  { light: '#2a78d6', dark: '#3987e5' }, // blue
  { light: '#eb6834', dark: '#d95926' }, // orange
  { light: '#1baf7a', dark: '#199e70' }, // aqua
  { light: '#eda100', dark: '#c98500' }, // yellow
  { light: '#e87ba4', dark: '#d55181' }, // magenta
  { light: '#008300', dark: '#008300' }, // green
  { light: '#4a3aa7', dark: '#9085e9' }, // violet
  { light: '#e34948', dark: '#e66767' }, // red
];

function isDarkMode() {
  const stamped = document.documentElement.getAttribute('data-theme');
  if (stamped === 'dark') return true;
  if (stamped === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

// Stable per-user color: users ordered by id (signup order), cycled through
// the 8-hue palette. Always pair with the person's name/initials in the UI —
// color never carries identity alone.
export function buildUserColorMap(users) {
  const dark = isDarkMode();
  const sorted = [...users].sort((a, b) => a.id - b.id);
  const map = new Map();
  sorted.forEach((u, i) => {
    const hue = PALETTE[i % PALETTE.length];
    map.set(u.id, dark ? hue.dark : hue.light);
  });
  return map;
}

export function initials(fullName) {
  return (fullName || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}
