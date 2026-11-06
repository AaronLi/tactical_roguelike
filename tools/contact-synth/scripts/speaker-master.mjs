// Bring a video's (or audio file's) sound up toward normal media loudness for phone and laptop speakers.
// The synth's sounds are short clicks and knocks with silence between them, normalised only to their
// peak, so they sit well under ordinary media and a small speaker barely plays them. This drops the
// sub-bass a small speaker can't play, then adds the measured gain to -18 LUFS into a peak limiter (about -2.5 dB). The video stream is copied.
//
// Usage: node scripts/speaker-master.mjs <in> <out>   (or import { speakerMaster })
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// (no compressor: it pulled the quiet tails, reverb and rings up toward the hits, which made everything sound
// like it was in an echoey room; the peaks are held by the limiter alone)
const PRE = 'highpass=f=90';

export function speakerMaster(input, output, target = -18) {
  const m = spawnSync('ffmpeg', ['-i', input, '-map', '0:a', '-af', `${PRE},ebur128`, '-f', 'null', '-'], { encoding: 'utf8' });
  const sum = m.stderr.slice(m.stderr.lastIndexOf('Summary'));
  const I = parseFloat((sum.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]);
  if (!Number.isFinite(I)) throw new Error('could not measure loudness of ' + input);
  const gain = (target - I).toFixed(1);
  const hasVideo = /Video:/.test(m.stderr);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, ...(hasVideo ? ['-map', '0:v', '-c:v', 'copy'] : []), '-map', '0:a',
    '-af', `${PRE},volume=${gain}dB,alimiter=limit=0.84:attack=0.5:release=25:level=false,aformat=channel_layouts=stereo`,
    '-ar', '48000', ...(hasVideo || /\.m4a$|\.mp4$/.test(output) ? ['-c:a', 'aac', '-b:a', '192k'] : []), output], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
  return +gain;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [i, o] = process.argv.slice(2);
  if (!o) { console.error('usage: speaker-master.mjs <in> <out>'); process.exit(1); }
  console.log(`+${speakerMaster(i, o)} dB to -18 LUFS: ${o}`);
}
