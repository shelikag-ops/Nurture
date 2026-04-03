/**
 * generate-prayer-audio.js
 *
 * Reads prayer-stage-scripts.json and calls OpenAI TTS to produce
 * MP3 files for all 30 variations of stages 3, 4, and 5.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node generate-prayer-audio.js
 *
 * Optional flags:
 *   --stage 3          only generate stage 3
 *   --stage 4          only generate stage 4
 *   --stage 5          only generate stage 5
 *   --day 1            only generate day 1 across all selected stages
 *   --out ./audio      output directory (default: ./prayer-audio)
 *
 * Output files:
 *   stage-3-day-01.mp3 ... stage-3-day-30.mp3
 *   stage-4-day-01.mp3 ... stage-4-day-30.mp3
 *   stage-5-day-01.mp3 ... stage-5-day-30.mp3
 *
 * Total: 90 files. Each ~50–70 seconds at speed 0.85.
 * Estimated OpenAI TTS cost: ~$0.20–0.30 for all 90 files (tts-1-hd).
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ── Config ──────────────────────────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VOICE          = 'nova';       // warm, calm — alternative: 'shimmer'
const MODEL          = 'tts-1-hd';  // higher quality; use 'tts-1' for faster/cheaper
const SPEED          = 0.85;        // slightly slower than default (1.0) for meditation

// ── Args ────────────────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const stageFlag = args.includes('--stage') ? parseInt(args[args.indexOf('--stage') + 1]) : null;
const dayFlag   = args.includes('--day')   ? parseInt(args[args.indexOf('--day')   + 1]) : null;
const outDir    = args.includes('--out')   ? args[args.indexOf('--out') + 1] : './prayer-audio';

// ── Setup ───────────────────────────────────────────────────────────────────

if (!OPENAI_API_KEY) {
  console.error('ERROR: Set OPENAI_API_KEY environment variable before running.');
  console.error('  Mac/Linux:  export OPENAI_API_KEY=sk-...');
  console.error('  Windows:    set OPENAI_API_KEY=sk-...');
  process.exit(1);
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const scripts = JSON.parse(fs.readFileSync(path.join(__dirname, 'prayer-stage-scripts.json'), 'utf8'));

// ── OpenAI TTS call ─────────────────────────────────────────────────────────

function ttsRequest(text, outputPath) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      voice: VOICE,
      input: text,
      speed: SPEED,
      response_format: 'mp3',
    });

    const options = {
      hostname: 'api.openai.com',
      path:     '/v1/audio/speech',
      method:   'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let err = '';
        res.on('data', d => err += d);
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${err}`)));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        fs.writeFileSync(outputPath, Buffer.concat(chunks));
        resolve(outputPath);
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Rate limiting ───────────────────────────────────────────────────────────
// OpenAI TTS free tier: ~50 req/min. We pause 1.5s between calls.

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const stagesToRun = stageFlag
    ? [stageFlag]
    : [3, 4, 5];

  const stageKeys = { 3: 'stage3', 4: 'stage4', 5: 'stage5' };

  let total = 0, done = 0, skipped = 0;

  // Count total
  for (const stageNum of stagesToRun) {
    const key   = stageKeys[stageNum];
    const items = scripts[key];
    for (const item of items) {
      if (dayFlag && item.day !== dayFlag) continue;
      total++;
    }
  }

  console.log(`\n🎙  OpenAI TTS — Morning Prayer Audio Generator`);
  console.log(`   Voice: ${VOICE}  |  Model: ${MODEL}  |  Speed: ${SPEED}`);
  console.log(`   Output: ${path.resolve(outDir)}`);
  console.log(`   Files to generate: ${total}\n`);

  for (const stageNum of stagesToRun) {
    const key   = stageKeys[stageNum];
    const items = scripts[key];

    console.log(`── Stage ${stageNum} ────────────────────────────────`);

    for (const item of items) {
      if (dayFlag && item.day !== dayFlag) continue;

      const dayStr  = String(item.day).padStart(2, '0');
      const fname   = `stage-${stageNum}-day-${dayStr}.mp3`;
      const outPath = path.join(outDir, fname);

      // Skip if already generated
      if (fs.existsSync(outPath)) {
        console.log(`   ✓ ${fname}  (already exists, skipping)`);
        skipped++;
        continue;
      }

      process.stdout.write(`   ⏳ ${fname}  [${item.angle}] ... `);

      try {
        await ttsRequest(item.text, outPath);
        const size = (fs.statSync(outPath).size / 1024).toFixed(0);
        console.log(`done  (${size} KB)`);
        done++;
        await sleep(1500); // respect rate limit
      } catch (err) {
        console.log(`FAILED — ${err.message}`);
        // Don't abort — continue with remaining files
      }
    }

    console.log();
  }

  console.log(`── Complete ──────────────────────────────────`);
  console.log(`   Generated: ${done}  |  Skipped (existing): ${skipped}  |  Target: ${total}`);
  console.log(`   Files saved to: ${path.resolve(outDir)}\n`);

  if (done > 0) {
    console.log(`Next step: upload the contents of ${outDir}/ to your GitHub Pages`);
    console.log(`project folder alongside dashboard.html, then update`);
    console.log(`getDailyPrayerAudio(stageNum) in the dashboard to use these filenames.\n`);
  }
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
