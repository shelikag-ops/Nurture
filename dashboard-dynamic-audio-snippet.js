/**
 * dashboard-dynamic-audio-snippet.js
 *
 * Drop this function into dashboard.html (near the other prayer functions).
 * It returns the correct MP3 filename for stages 3, 4, 5 based on
 * the day of the year, cycling through the 30-day library.
 *
 * Usage in PRAYER_STAGES array:
 *   { ..., audioSrc: getDailyAudio(3), ... }   // Stage 3
 *   { ..., audioSrc: getDailyAudio(4), ... }   // Stage 4
 *   { ..., audioSrc: getDailyAudio(5), ... }   // Stage 5
 */

function getDailyAudio(stageNum) {
  // Day of year, 1–365 (or 366 in a leap year)
  const now     = new Date();
  const start   = new Date(now.getFullYear(), 0, 0);
  const diff    = now - start;
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24)); // 1–366

  // Cycle through 30 scripts (1-indexed)
  const day = ((dayOfYear - 1) % 30) + 1;
  const dayStr = String(day).padStart(2, '0');

  return `stage-${stageNum}-day-${dayStr}.mp3`;
}


/**
 * Updated PRAYER_STAGES array (stages 3–5 portion only).
 * Replace the existing stage 3, 4, 5 entries in your dashboard with these.
 *
 * Note: getDailyAudio() is called once when startPrayer() runs,
 * so today's file is selected at the moment she opens the modal.
 */

const PRAYER_STAGES_DYNAMIC_PORTION = [
  {
    label: 'Stage 3 of 5 — Gratitude for People',
    title: 'Thank the people around you',
    audioSrc: getDailyAudio(3),
    placeholder: 'I am grateful for… because they…',
    saveKey: 'gratitudePerson',
    hasInput: true,
  },
  {
    label: 'Stage 4 of 5 — Gratitude for Life',
    title: 'Three things you\'re grateful for today',
    audioSrc: getDailyAudio(4),
    placeholder: '1.\n2.\n3.',
    saveKey: 'gratitude3Things',
    hasInput: true,
  },
  {
    label: 'Stage 5 of 5 — Today\'s Sankalpa',
    title: 'Set your intention for the day',
    audioSrc: getDailyAudio(5),
    placeholder: 'Today I will…',
    saveKey: 'sankalpa',
    hasInput: true,
    isLast: true,
  },
];
