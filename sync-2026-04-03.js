// ============================================================
// Daily Homeschool Sync — April 3, 2026 (10 AM run)
// Paste this entire script into the dashboard browser console
// to update localStorage. Open the dashboard first, then
// open DevTools (F12 → Console) and paste.
// ============================================================

(function() {
  const now = new Date('2026-04-03T10:00:00');
  const syncDate = '2026-04-03';
  const existing = JSON.parse(localStorage.getItem('hs-platform-stats') || '{}');

  const updated = {
    ...existing,
    lastSync: now.toISOString(),
    syncDate: syncDate,

    lichess: {
      ...(existing.lichess || {}),
      classical:     1126,
      blitz:         780,
      puzzleRating:  1198,
      puzzlesSolved: 974,
      gamesPlayed:   425,
      gamesWon:      227,
    },

    lichessYesterday: {
      date:          '2026-04-02',
      gamesPlayed:   8,
      gamesWon:      1,
      puzzlesSolved: 27,
      puzzlesWon:    20,
      puzzleRatingBefore: 1144,
      puzzleRatingAfter:  1183,
      ratingChange:  +39,
    },

    // Today (Apr 3) activity
    lichessToday: {
      date:          '2026-04-03',
      gamesPlayed:   2,
      gamesWon:      0,
      puzzlesSolved: 1,
      puzzleRatingBefore: 1183,
      puzzleRatingAfter:  1198,
    },

    chessKid: {
      ...(existing.chessKid || {}),
      username:         'NewSoreNight',
      level:            39,
      rating:           645,
      stars:            2,
      gamesPlayed:      20,
      puzzlesSolved:    30,
      lessonsCompleted: 30,
      lastSyncDate:     syncDate,
    },

    beastAcademy: {
      ...(existing.beastAcademy || {}),
      currentBook:      'BA3',
      currentChapter:   'Area',
      chaptersComplete: 11,
      totalChapters:    12,
      lastSyncDate:     syncDate,
    },

    ixl: {
      ...(existing.ixl || {}),
      skillsMastered:   18,
      lastSkill:        null,
      questionsLast30d: 449,
      timeLast30d:      '4h 11min',
      skillsProgressed: 23,
    },

    vocabularyStars: existing.vocabularyStars || {},  // skipped — access denied
  };

  localStorage.setItem('hs-platform-stats', JSON.stringify(updated));

  // BA activity for April (day 2 = 47 min; day 3 = nothing yet this morning)
  const baMinKey = 'hs-ba-activity-2026-4';
  const existingMins = JSON.parse(localStorage.getItem(baMinKey) || '{}');
  const baActivity = { ...existingMins, '2': 47 };
  localStorage.setItem(baMinKey, JSON.stringify(baActivity));

  // cfg override
  const cfg = JSON.parse(localStorage.getItem('hs-cfg-override') || '{}');
  cfg.baChaptersDone  = 11;
  cfg.baChaptersTotal = 12;
  cfg.baCurrentBook   = 'BA3';
  localStorage.setItem('hs-cfg-override', JSON.stringify(cfg));

  // Login failures log
  const failLog = JSON.parse(localStorage.getItem('hs-login-failures') || '[]');
  failLog.push({
    date: now.toISOString(),
    failures: [
      { platform: 'VocabularyStars', reason: 'Student account has no access to gameplay report — skip per Shell' },
    ]
  });
  const weekAgo = Date.now() - 7*24*60*60*1000;
  localStorage.setItem('hs-login-failures', JSON.stringify(
    failLog.filter(e => new Date(e.date).getTime() > weekAgo)
  ));

  console.log('✅ Sync written. Summary:');
  console.log('  Lichess: classical=1126, puzzle=1198, 974 puzzles, 425 games');
  console.log('  ChessKid: Lv39, rating=645, 2 stars, 20 games, 30 puzzles, 30 lessons');
  console.log('  Beast Academy: BA3, ch 12 Area in progress (11/12 done), Apr-2 = 47 min');
  console.log('  IXL: 18 skills mastered, 449 questions, 4h11min (last 30d)');
  console.log('  VocabularyStars: skipped (no report access on student account)');

  // ── Refresh dashboard views if running inside the dashboard page ──
  if (typeof render === 'function') {
    console.log('🔄 Refreshing Sarah\'s dashboard...');
    render();
  }
  if (typeof renderReportsProgress === 'function') {
    console.log('🔄 Refreshing My Reports tab...');
    renderReportsProgress();
  }
  if (typeof renderParentView === 'function') {
    console.log('🔄 Refreshing Parent dashboard...');
    renderParentView();
  }
  console.log('✅ All views refreshed.');
})();
