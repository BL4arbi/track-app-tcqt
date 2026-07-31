// Standard Levenshtein edit distance (single-character insert/delete/substitute
// count) between two strings.
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prevRow = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const currRow = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1, // deletion
        currRow[j - 1] + 1, // insertion
        prevRow[j - 1] + cost // substitution
      );
    }
    prevRow = currRow;
  }
  return prevRow[n];
}

// Accent-insensitive, case-insensitive normalization — French text ("étiré"
// vs "etire") shouldn't count as a typo just for missing an accent.
function normalize(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Finds the closest existing value to `typed` among `candidates`, for a
// "did you mean X?" hint — deliberately conservative (only suggests genuine
// near-misses, not just "somewhat similar") so it doesn't get in the way
// when someone is legitimately typing something new.
export function findClosestMatch(typed, candidates) {
  const normTyped = normalize(typed);
  if (!normTyped) return null;

  let best = null;
  let bestDist = Infinity;
  for (const candidate of candidates) {
    // Exact match on the RAW string — already correct as typed, no hint
    // needed. Deliberately NOT checked on the normalized form: a typed
    // value that only differs from a known one by accents/case (distance 0
    // after normalizing) is exactly the case this hint should catch, not
    // suppress — otherwise "Plat etire 80x30" would silently save as a
    // near-duplicate of the existing "Plat étiré 80x30" instead of getting
    // suggested a fix.
    if (candidate === typed) return null;
    const normCandidate = normalize(candidate);
    const dist = levenshteinDistance(normTyped, normCandidate);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  if (!best) return null;

  // Threshold scales with length: a 1-character typo in a long sentence
  // shouldn't need the same tolerance as a 1-character typo in a short word,
  // but an unrelated short word shouldn't match a long one just because the
  // absolute distance happens to be small relative to the long string.
  const threshold = Math.max(2, Math.ceil(Math.min(normTyped.length, best.length) * 0.3));
  return bestDist <= threshold ? best : null;
}
