// ─────────────────────────────────────────────────────────────────────────────
//  Notion Sync Script  —  reads notion-sync-queue.json, pushes to Notion DBs
//  Run via GitHub Actions (notion-sync.yml) with NOTION_TOKEN env var
// ─────────────────────────────────────────────────────────────────────────────

const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

// ── Database IDs ──────────────────────────────────────────────────────────────
const DB = {
  activityLog:    '3b959280-4d96-4681-873f-8fe9c3399ee5',
  vocabTracker:   '3fadc4dd-9254-4ad3-9e04-f4ff219fe94f',
  scienceRoadmap: '67cc1ab9-71a6-46cc-8993-87d1c7a89192',
};

async function main() {
  const token = process.env.NOTION_TOKEN;
  if (!token) { console.error('❌ NOTION_TOKEN env var not set'); process.exit(1); }

  const queuePath = path.join(process.cwd(), 'notion-sync-queue.json');
  if (!fs.existsSync(queuePath)) { console.log('ℹ️  No queue file found — nothing to sync'); return; }

  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  if (!queue.syncDate || queue.cleared) { console.log('ℹ️  Queue is empty or already cleared'); return; }

  const notion = new Client({ auth: token });
  let synced = 0;

  // ── 1. Activity Log ─────────────────────────────────────────────────────────
  if (queue.activities && queue.activities.length > 0) {
    console.log(`📋 Syncing ${queue.activities.length} activity entries…`);

    // Avoid duplicates: check if entries for today already exist
    const existing = await notion.databases.query({
      database_id: DB.activityLog,
      filter: { property: 'Date', date: { equals: queue.syncDate } },
    });
    const existingNames = new Set(
      existing.results.map(p => p.properties?.Activity?.title?.[0]?.plain_text || '')
    );

    for (const act of queue.activities) {
      if (existingNames.has(act.activity)) {
        console.log(`  ⏩ Skipped (already exists): ${act.activity}`);
        continue;
      }
      await notion.pages.create({
        parent: { database_id: DB.activityLog },
        properties: {
          'Activity':        { title: [{ text: { content: act.activity } }] },
          'Subject':         { select: { name: act.subject } },
          'Type':            { select: { name: act.type || 'Planned' } },
          'Date':            { date:   { start: act.date } },
          'Duration (min)':  { number: act.duration || 0 },
          'Week':            { rich_text: [{ text: { content: act.week || '' } }] },
        },
      });
      console.log(`  ✅ Added: ${act.activity} (${act.subject}, ${act.duration}min)`);
      synced++;
    }
  }

  // ── 2. Vocabulary Sprint Tracker ────────────────────────────────────────────
  if (queue.vocab && queue.vocab.date) {
    console.log(`📖 Syncing vocab entry for ${queue.vocab.date}…`);
    const v = queue.vocab;
    const dateLabel = new Date(v.date).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });

    // Check if today's entry already exists
    const existingVocab = await notion.databases.query({
      database_id: DB.vocabTracker,
      filter: { property: 'Date', title: { equals: dateLabel } },
    });

    if (existingVocab.results.length > 0) {
      // Update existing
      await notion.pages.update({
        page_id: existingVocab.results[0].id,
        properties: {
          'New words today':  { number: v.newWordsToday   || 0 },
          'Running total':    { number: v.runningTotal    || 0 },
          'Words remaining':  { number: v.wordsRemaining  || 0 },
          'vocab.com session':{ checkbox: !!v.vocabComSession },
          'Revision done':    { checkbox: !!v.revisionDone },
        },
      });
      console.log(`  🔄 Updated vocab entry: ${dateLabel}`);
    } else {
      // Create new
      await notion.pages.create({
        parent: { database_id: DB.vocabTracker },
        properties: {
          'Date':             { title:    [{ text: { content: dateLabel } }] },
          'New words today':  { number:   v.newWordsToday   || 0 },
          'Running total':    { number:   v.runningTotal    || 0 },
          'Words remaining':  { number:   v.wordsRemaining  || 0 },
          'vocab.com session':{ checkbox: !!v.vocabComSession },
          'Revision done':    { checkbox: !!v.revisionDone },
        },
      });
      console.log(`  ✅ Created vocab entry: ${dateLabel}`);
    }
    synced++;
  }

  // ── 3. Science Chapter Roadmap — increment sessions ─────────────────────────
  if (queue.scienceSession && queue.scienceSession.chapterInProgress) {
    console.log(`🔬 Incrementing science session count for: ${queue.scienceSession.chapterInProgress}…`);
    const chapterName = queue.scienceSession.chapterInProgress;

    // Search for the chapter by name
    const sciResults = await notion.databases.query({
      database_id: DB.scienceRoadmap,
      filter: { property: 'Chapter', title: { contains: chapterName.split('—')[0].trim() } },
    });

    if (sciResults.results.length > 0) {
      const page = sciResults.results[0];
      const currentSessions = page.properties?.['Sessions taught']?.number || 0;
      await notion.pages.update({
        page_id: page.id,
        properties: {
          'Sessions taught': { number: currentSessions + queue.scienceSession.increment },
          'Status': { select: { name: 'In progress' } },
        },
      });
      console.log(`  ✅ Sessions: ${currentSessions} → ${currentSessions + 1}`);
      synced++;
    } else {
      console.log(`  ⚠️  Chapter not found in Science Roadmap: "${chapterName}"`);
    }
  }

  console.log(`\n✨ Notion sync complete — ${synced} records pushed for ${queue.syncDate}`);
}

main().catch(err => {
  console.error('❌ Sync failed:', err.message);
  process.exit(1);
});
