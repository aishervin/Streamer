import express from 'express';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const WORKSPACE_DIR = process.cwd();
const MUSIC_DIR = path.join(WORKSPACE_DIR, 'music');
const MUSIC_OPTIMIZED_DIR = path.join(WORKSPACE_DIR, 'music-optimized');
const ASSETS_DIR = path.join(WORKSPACE_DIR, 'assets');
const PLAYLIST_FILE = path.join(WORKSPACE_DIR, 'playlist.txt');
const BACKGROUND_FILE = path.join(ASSETS_DIR, 'background.jpg');

// Default test RTMPS endpoints (embedded directly in source for testing)
const DEFAULT_CHANNEL_URL = 'rtmps://dc4-1.rtmp.t.me/s/2410187005:bDYSz_1uXp8kZ3BxS7tN9w';
const DEFAULT_GROUP_URL = 'rtmps://dc4-1.rtmp.t.me/s/1703832793:XfxQ4qhKFtbljMA2AApRvQ';

// Ensure base directories exist
for (const dir of [MUSIC_DIR, MUSIC_OPTIMIZED_DIR, ASSETS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Ensure background.jpg exists; if missing, generate a simple default
if (!fs.existsSync(BACKGROUND_FILE)) {
  const fallbackScript = path.join(WORKSPACE_DIR, 'scripts', 'make_background.sh');
  if (fs.existsSync(fallbackScript)) {
    try {
      const proc = spawn('bash', [fallbackScript], { stdio: 'ignore' });
      proc.on('close', () => {
        // If it created background.png, copy/link to background.jpg
        const pngFile = path.join(ASSETS_DIR, 'background.png');
        if (fs.existsSync(pngFile) && !fs.existsSync(BACKGROUND_FILE)) {
          fs.copyFileSync(pngFile, BACKGROUND_FILE);
        }
      });
    } catch {
      // ignore
    }
  }
}

// Multer storage for raw music files
const musicUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, MUSIC_DIR),
    filename: (_req, file, cb) => {
      // Preserve original name, sanitize characters
      const sanitized = file.originalname.replace(/[^a-zA-Z0-9._\-\s]/g, '_');
      cb(null, sanitized);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// Multer storage for background image
const backgroundUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ASSETS_DIR),
    filename: (_req, _file, cb) => cb(null, 'background.jpg'),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Audio file extensions
const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.flac']);

// Streaming state
interface StreamState {
  isStreaming: boolean;
  destination: 'channel' | 'group' | 'custom' | null;
  targetUrlMasked: string;
  rawTargetUrl: string;
  startedAt: Date | null;
  reconnectCount: number;
  process: ChildProcess | null;
  pid: number | null;
  abortController: AbortController | null;
}

const streamState: StreamState = {
  isStreaming: false,
  destination: null,
  targetUrlMasked: '',
  rawTargetUrl: '',
  startedAt: null,
  reconnectCount: 0,
  process: null,
  pid: null,
  abortController: null,
};

// Ring buffer for logs
interface LogEntry {
  id: string;
  timestamp: string;
  text: string;
  type: 'info' | 'warn' | 'error' | 'stream';
}
const logBuffer: LogEntry[] = [];
const MAX_LOGS = 300;

function appendLog(text: string, type: 'info' | 'warn' | 'error' | 'stream' = 'info') {
  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toLocaleTimeString(),
    text,
    type,
  };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.shift();
  }
  notifySseClients(entry);
}

// SSE Clients for real-time logs
const sseClients = new Set<express.Response>();
function notifySseClients(entry: LogEntry) {
  const data = `data: ${JSON.stringify(entry)}\n\n`;
  for (const client of sseClients) {
    client.write(data);
  }
}

// Helper to rebuild playlist.txt matching scripts/build_playlist.sh
function rebuildPlaylist(): string[] {
  if (!fs.existsSync(MUSIC_OPTIMIZED_DIR)) {
    fs.mkdirSync(MUSIC_OPTIMIZED_DIR, { recursive: true });
  }
  const files = fs.readdirSync(MUSIC_OPTIMIZED_DIR)
    .filter(f => AUDIO_EXTS.has(path.extname(f).toLowerCase()))
    .sort();

  const lines = files.map(f => {
    // Relative path as expected by scripts/build_playlist.sh: music-optimized/<file>
    const relPath = path.join('music-optimized', f);
    const escaped = relPath.replace(/'/g, "'\\''");
    return `file '${escaped}'`;
  });

  fs.writeFileSync(PLAYLIST_FILE, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf-8');
  return files;
}

// Initialize playlist if not present
if (!fs.existsSync(PLAYLIST_FILE)) {
  rebuildPlaylist();
}

// ----------------------------------------------------
// API Endpoints
// ----------------------------------------------------

// 1. Health & Status
app.get('/api/status', (_req, res) => {
  const uptimeSeconds = streamState.startedAt
    ? Math.floor((Date.now() - streamState.startedAt.getTime()) / 1000)
    : 0;

  res.json({
    status: 'ok',
    stream: {
      isStreaming: streamState.isStreaming,
      destination: streamState.destination,
      targetUrlMasked: streamState.targetUrlMasked,
      startedAt: streamState.startedAt ? streamState.startedAt.toISOString() : null,
      uptimeSeconds,
      reconnectCount: streamState.reconnectCount,
      pid: streamState.pid,
      hasChannelSecret: Boolean(process.env.CSTREAM_RTMPS_URL || DEFAULT_CHANNEL_URL),
      hasGroupSecret: Boolean(process.env.GSTREAM_RTMPS_URL || DEFAULT_GROUP_URL),
    },
    system: {
      hasBackground: fs.existsSync(BACKGROUND_FILE),
      playlistFileExists: fs.existsSync(PLAYLIST_FILE),
    },
  });
});

// 2. Library Tracks
app.get('/api/tracks', (_req, res) => {
  try {
    const rawFiles = fs.existsSync(MUSIC_DIR)
      ? fs.readdirSync(MUSIC_DIR).filter(f => !f.startsWith('.'))
      : [];
    const optimizedFiles = fs.existsSync(MUSIC_OPTIMIZED_DIR)
      ? fs.readdirSync(MUSIC_OPTIMIZED_DIR).filter(f => !f.startsWith('.'))
      : [];

    const rawTracks = rawFiles.map(f => {
      const fullPath = path.join(MUSIC_DIR, f);
      const stat = fs.statSync(fullPath);
      const baseName = path.parse(f).name;
      const isOptimized = optimizedFiles.some(opt => path.parse(opt).name === baseName);
      return {
        filename: f,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        isOptimized,
      };
    });

    const optimizedTracks = optimizedFiles.map(f => {
      const fullPath = path.join(MUSIC_OPTIMIZED_DIR, f);
      const stat = fs.statSync(fullPath);
      return {
        filename: f,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    });

    let playlistLines: string[] = [];
    if (fs.existsSync(PLAYLIST_FILE)) {
      playlistLines = fs.readFileSync(PLAYLIST_FILE, 'utf-8')
        .split('\n')
        .filter(l => l.trim().length > 0);
    }

    res.json({
      rawTracks,
      optimizedTracks,
      playlistCount: playlistLines.length,
      hasBackground: fs.existsSync(BACKGROUND_FILE),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Audio Stream endpoint with HTTP Range support for in-browser playback
app.get('/api/audio/:folder/:filename', (req, res) => {
  const { folder, filename } = req.params;
  const targetDir = folder === 'raw' ? MUSIC_DIR : MUSIC_OPTIMIZED_DIR;
  const filePath = path.join(targetDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(filename).toLowerCase();
  let contentType = 'audio/mpeg';
  if (ext === '.m4a' || ext === '.aac') contentType = 'audio/mp4';
  else if (ext === '.ogg') contentType = 'audio/ogg';
  else if (ext === '.wav') contentType = 'audio/wav';
  else if (ext === '.flac') contentType = 'audio/flac';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// 4. Background image endpoint
app.get('/api/background', (_req, res) => {
  if (fs.existsSync(BACKGROUND_FILE)) {
    res.sendFile(BACKGROUND_FILE);
  } else {
    res.status(404).send('No background image');
  }
});

// 5. Upload music files to music/
app.post('/api/upload', musicUpload.array('files', 50), (req, res) => {
  const files = (req.files as Express.Multer.File[]) || [];
  appendLog(`Uploaded ${files.length} file(s) into music/ directory`, 'info');
  res.json({
    success: true,
    count: files.length,
    filenames: files.map(f => f.filename),
  });
});

// 6. Upload custom background image
app.post('/api/upload-background', backgroundUpload.single('background'), (_req, res) => {
  appendLog('Updated assets/background.jpg with custom image', 'info');
  res.json({ success: true });
});

// 7. Generate default background image via ffmpeg
app.post('/api/generate-background', (_req, res) => {
  const tempPath = path.join(ASSETS_DIR, 'generated_bg.jpg');
  const ffmpeg = spawn('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=0x18181b:s=640x360:d=1',
    '-frames:v', '1',
    tempPath,
  ]);

  ffmpeg.on('close', code => {
    if (code === 0 && fs.existsSync(tempPath)) {
      fs.renameSync(tempPath, BACKGROUND_FILE);
      appendLog('Generated fresh 640x360 background image in assets/background.jpg', 'info');
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to generate background image' });
    }
  });
});

// 8. Generate a demo audio track (synthesized soothing chords via ffmpeg)
app.post('/api/generate-demo-track', (_req, res) => {
  const filename = `demo_lofi_${Date.now()}.mp3`;
  const targetPath = path.join(MUSIC_DIR, filename);

  // Generate a gentle 15-second melodic drone chord (A minor9: A3, C4, E4, B4)
  const filter = 'aevalsrc=0.1*sin(220*2*PI*t)+0.08*sin(261.63*2*PI*t)+0.08*sin(329.63*2*PI*t)+0.05*sin(493.88*2*PI*t):s=44100:d=15';
  const proc = spawn('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-f', 'lavfi',
    '-i', filter,
    '-c:a', 'libmp3lame',
    '-b:a', '128k',
    targetPath,
  ]);

  proc.on('close', code => {
    if (code === 0) {
      appendLog(`Generated demo audio track in music/${filename}`, 'info');
      res.json({ success: true, filename });
    } else {
      res.status(500).json({ error: 'Failed to generate demo track' });
    }
  });
});

// 9. Optimize music files (AAC 96kbps / 44.1kHz / stereo) matching .github/workflows/optimize.yml
app.post('/api/optimize', (req, res) => {
  const { removeOriginals = false } = req.body || {};

  const files = fs.readdirSync(MUSIC_DIR).filter(f => {
    return AUDIO_EXTS.has(path.extname(f).toLowerCase());
  });

  if (files.length === 0) {
    return res.status(400).json({ error: 'No audio files found in music/' });
  }

  appendLog(`Starting optimization for ${files.length} file(s)...`, 'info');

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const toRemove: string[] = [];

  const convertNext = (index: number) => {
    if (index >= files.length) {
      // Done converting
      if (removeOriginals && failed === 0 && toRemove.length > 0) {
        for (const fileToRemove of toRemove) {
          try {
            fs.unlinkSync(fileToRemove);
          } catch {
            // ignore
          }
        }
        appendLog(`Cleaned up ${toRemove.length} raw file(s) from music/`, 'info');
      }

      const playlistFiles = rebuildPlaylist();
      appendLog(`Optimization complete: ${processed} converted, ${skipped} skipped, ${failed} failed. Playlist has ${playlistFiles.length} track(s).`, 'info');

      return res.json({
        success: true,
        processed,
        skipped,
        failed,
        playlistCount: playlistFiles.length,
      });
    }

    const f = files[index];
    const rawPath = path.join(MUSIC_DIR, f);
    const baseName = path.parse(f).name;
    const outPath = path.join(MUSIC_OPTIMIZED_DIR, `${baseName}.m4a`);

    if (fs.existsSync(outPath)) {
      skipped++;
      toRemove.push(rawPath);
      return convertNext(index + 1);
    }

    appendLog(`Converting "${f}" -> "${baseName}.m4a" (AAC 96kbps 44.1kHz stereo)...`, 'info');

    // Matches optimize.yml:
    // ffmpeg -hide_banner -loglevel error -y -i "$f" -vn -map_metadata -1 -c:a aac -b:a 96k -ar 44100 -ac 2 "$out"
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', rawPath,
      '-vn',
      '-map_metadata', '-1',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-ar', '44100',
      '-ac', '2',
      outPath,
    ]);

    ffmpeg.on('close', code => {
      if (code === 0) {
        processed++;
        toRemove.push(rawPath);
      } else {
        failed++;
        appendLog(`Conversion failed for "${f}" (exit code ${code})`, 'error');
        if (fs.existsSync(outPath)) {
          try { fs.unlinkSync(outPath); } catch {}
        }
      }
      convertNext(index + 1);
    });
  };

  convertNext(0);
});

// 10. Delete a track
app.delete('/api/track/:folder/:filename', (req, res) => {
  const { folder, filename } = req.params;
  const targetDir = folder === 'raw' ? MUSIC_DIR : MUSIC_OPTIMIZED_DIR;
  const filePath = path.join(targetDir, filename);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      if (folder === 'optimized') {
        rebuildPlaylist();
      }
      appendLog(`Deleted ${filename} from ${folder}`, 'info');
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// 11. Rebuild / Refresh Playlist
app.post('/api/playlist/rebuild', (_req, res) => {
  const files = rebuildPlaylist();
  appendLog(`Rebuilt playlist.txt with ${files.length} track(s)`, 'info');
  res.json({ success: true, count: files.length, files });
});

// 12. Start Streaming
app.post('/api/stream/start', (req, res) => {
  if (streamState.isStreaming) {
    return res.status(400).json({ error: 'Stream is already running' });
  }

  const { destination = 'channel', customUrl } = req.body || {};

  let targetUrl = '';
  if (destination === 'channel') {
    targetUrl = process.env.CSTREAM_RTMPS_URL || DEFAULT_CHANNEL_URL;
  } else if (destination === 'group') {
    targetUrl = process.env.GSTREAM_RTMPS_URL || DEFAULT_GROUP_URL;
  } else if (destination === 'custom') {
    targetUrl = customUrl || '';
  }

  if (!targetUrl || targetUrl.trim().length === 0) {
    return res.status(400).json({
      error: `Selected destination "${destination}" has no RTMPS URL configured. Please set the URL or provide a custom RTMPS address.`,
    });
  }

  // Ensure playlist has items
  if (!fs.existsSync(PLAYLIST_FILE) || fs.readFileSync(PLAYLIST_FILE, 'utf-8').trim().length === 0) {
    // Attempt auto-rebuild
    const files = rebuildPlaylist();
    if (files.length === 0) {
      return res.status(400).json({
        error: 'Playlist is empty. Please upload and optimize audio tracks in music-optimized/ first.',
      });
    }
  }

  // Ensure background image exists
  if (!fs.existsSync(BACKGROUND_FILE)) {
    return res.status(400).json({
      error: 'assets/background.jpg is missing. Please upload or generate a background image.',
    });
  }

  const abortController = new AbortController();
  streamState.isStreaming = true;
  streamState.destination = destination;
  streamState.rawTargetUrl = targetUrl;
  // Mask secret key portion in UI
  const masked = targetUrl.replace(/(\/s\/)[^/?#]+/g, '$1******');
  streamState.targetUrlMasked = masked;
  streamState.startedAt = new Date();
  streamState.reconnectCount = 0;
  streamState.abortController = abortController;

  appendLog(`Starting Telegram stream to [${destination}] destination (${masked})...`, 'stream');

  // Spawn streaming loop matching stream.yml
  runStreamLoop(targetUrl, abortController);

  res.json({
    success: true,
    destination,
    maskedUrl: masked,
  });
});

// Streaming process runner with auto-reconnect matching GitHub Actions workflow
function runStreamLoop(targetUrl: string, abortController: AbortController) {
  if (abortController.signal.aborted) return;

  // Exact FFmpeg command from .github/workflows/stream.yml:
  // ffmpeg -hide_banner -loglevel info \
  //   -loop 1 -framerate 2 -i assets/background.jpg \
  //   -re -stream_loop -1 -f concat -safe 0 -i playlist.txt \
  //   -map 0:v:0 -map 1:a:0 \
  //   -c:v libx264 -preset ultrafast -tune stillimage \
  //   -pix_fmt yuv420p -r 2 -g 4 \
  //   -b:v 80k -maxrate 80k -bufsize 160k \
  //   -c:a aac -b:a 96k -ar 44100 -ac 2 \
  //   -f flv "$TG_STREAM_URL"
  const args = [
    '-hide_banner',
    '-loglevel', 'info',
    '-loop', '1',
    '-framerate', '2',
    '-i', 'assets/background.jpg',
    '-re',
    '-stream_loop', '-1',
    '-f', 'concat',
    '-safe', '0',
    '-i', 'playlist.txt',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'stillimage',
    '-pix_fmt', 'yuv420p',
    '-r', '2',
    '-g', '4',
    '-b:v', '80k',
    '-maxrate', '80k',
    '-bufsize', '160k',
    '-c:a', 'aac',
    '-b:a', '96k',
    '-ar', '44100',
    '-ac', '2',
    '-f', 'flv',
    targetUrl,
  ];

  appendLog(`[ffmpeg] Launching RTMP encoder pipeline...`, 'stream');

  const proc = spawn('ffmpeg', args, {
    cwd: WORKSPACE_DIR,
    signal: abortController.signal,
  });

  streamState.process = proc;
  streamState.pid = proc.pid ?? null;

  proc.stdout?.on('data', data => {
    const lines = data.toString().split('\n');
    for (const l of lines) {
      if (l.trim()) appendLog(`[ffmpeg] ${l.trim()}`, 'stream');
    }
  });

  proc.stderr?.on('data', data => {
    const lines = data.toString().split('\n');
    for (const l of lines) {
      const trimmed = l.trim();
      if (!trimmed) continue;
      // Filter high-volume progress ticker to reduce log clutter or log as stream info
      if (trimmed.startsWith('frame=') || trimmed.includes('fps=') || trimmed.includes('bitrate=')) {
        appendLog(`[stream stats] ${trimmed}`, 'stream');
      } else if (trimmed.toLowerCase().includes('error') || trimmed.includes('Connection refused')) {
        appendLog(`[ffmpeg] ${trimmed}`, 'error');
      } else {
        appendLog(`[ffmpeg] ${trimmed}`, 'info');
      }
    }
  });

  proc.on('close', code => {
    streamState.process = null;
    streamState.pid = null;

    if (abortController.signal.aborted) {
      appendLog('Stream stopped by user request.', 'warn');
      return;
    }

    appendLog(`FFmpeg exited with status ${code}. Reconnecting in 5 seconds...`, 'warn');
    streamState.reconnectCount++;

    setTimeout(() => {
      if (!abortController.signal.aborted && streamState.isStreaming) {
        runStreamLoop(targetUrl, abortController);
      }
    }, 5000);
  });

  proc.on('error', err => {
    if (err.name === 'AbortError') return;
    appendLog(`FFmpeg process error: ${err.message}`, 'error');
  });
}

// 13. Stop Streaming
app.post('/api/stream/stop', (_req, res) => {
  if (!streamState.isStreaming) {
    return res.json({ success: true, message: 'Stream is not running' });
  }

  appendLog('Stopping stream process...', 'warn');

  if (streamState.abortController) {
    streamState.abortController.abort();
  }

  if (streamState.process && streamState.process.pid) {
    try {
      streamState.process.kill('SIGTERM');
      setTimeout(() => {
        if (streamState.process) {
          try { streamState.process.kill('SIGKILL'); } catch {}
        }
      }, 2000);
    } catch {}
  }

  streamState.isStreaming = false;
  streamState.process = null;
  streamState.pid = null;
  streamState.startedAt = null;

  res.json({ success: true });
});

// 14. Real-time Logs SSE
app.get('/api/stream/logs-sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial recent logs
  for (const entry of logBuffer.slice(-50)) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// 15. Recent Logs (polling fallback)
app.get('/api/stream/logs', (_req, res) => {
  res.json({ logs: logBuffer });
});

// Clean exit handlers
process.on('SIGINT', () => {
  if (streamState.process) {
    try { streamState.process.kill('SIGTERM'); } catch {}
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (streamState.process) {
    try { streamState.process.kill('SIGTERM'); } catch {}
  }
  process.exit(0);
});

// ----------------------------------------------------
// Vite / Static Serving
// ----------------------------------------------------
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Telegram Music Streamer running on http://0.0.0.0:${PORT}`);
  });
}

start();
