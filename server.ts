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

// Multer storage for raw music and video files
const musicUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, MUSIC_DIR),
    filename: (_req, file, cb) => {
      // Preserve original name, sanitize characters
      const sanitized = file.originalname.replace(/[^a-zA-Z0-9._\-\s]/g, '_');
      cb(null, sanitized);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB (supports full videos from mobile)
});

// Multer storage for background image
const backgroundUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ASSETS_DIR),
    filename: (_req, _file, cb) => cb(null, 'background.jpg'),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Media file extensions (Audio & Video supported)
const AUDIO_EXTS = new Set([
  '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.flac',
  '.mp4', '.mkv', '.webm', '.avi', '.mov'
]);

// Streaming state
export interface LiveTvChannel {
  id: string;
  name: string;
  nameFa: string;
  category: string;
  streamUrl: string;
  description: string;
  quality: string;
  badge?: string;
}

const LIVE_TV_CHANNELS: LiveTvChannel[] = [
  {
    id: 'pmc',
    name: 'PMC Music HD',
    nameFa: 'شبکه موسیقی پی‌ام‌سی',
    category: 'Persian Pop / Music Video',
    streamUrl: 'https://pmcrohls.wns.live/hls/stream.m3u8',
    description: 'پخش زنده ۲۴ ساعته برترین موزیک ویدیوهای فارسی و روز جهان با کیفیت فول اچ‌دی',
    quality: '1080p HD',
    badge: 'محبوب‌ترین',
  },
  {
    id: 'radiojavan',
    name: 'Radio Javan TV',
    nameFa: 'رادیو جوان تی‌وی',
    category: 'Persian Pop & HipHop',
    streamUrl: 'https://rjtvhls.wns.live/hls/stream.m3u8',
    description: 'شبکه رسمی تصویری رادیو جوان؛ ویدیوکلیپ‌های انحصاری پاپ، رپ و برنامه‌های سرگرمی',
    quality: '1080p HD',
    badge: 'اختصاصی',
  },
  {
    id: 'deluxe',
    name: 'Deluxe Music TV',
    nameFa: 'دلوکس موزیک اروپا',
    category: 'European Pop / Electronic',
    streamUrl: 'https://sdn-global-live-streaming-packager-cache.3qsdn.com/13456/13456_264_live.m3u8',
    description: 'معروف‌ترین شبکه تلویزیونی موسیقی بدون توقف آلمان و اروپا با صدای دالبی و تصویر شفاف',
    quality: '720p HD',
    badge: 'بین‌المللی',
  },
  {
    id: 'avafamily',
    name: 'AVA Family / Music',
    nameFa: 'شبکه آوا فمیلی',
    category: 'Entertainment / Music',
    streamUrl: 'https://familyhls.avatv.live/hls/stream.m3u8',
    description: 'پخش زنده برنامه‌های تفریحی، سریال‌ها و موسیقی فارسی',
    quality: '720p HD',
  },
];

interface StreamState {
  isStreaming: boolean;
  destination: 'channel' | 'group' | 'custom' | null;
  sourceType: 'playlist' | 'live_tv' | 'youtube';
  channelName?: string;
  liveStreamUrl?: string;
  quality?: '480p' | '720p' | '1080p';
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
  sourceType: 'playlist',
  quality: '480p',
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
      sourceType: streamState.sourceType,
      channelName: streamState.channelName,
      liveStreamUrl: streamState.liveStreamUrl,
      quality: streamState.quality,
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

// 1.1 TV Channels
app.get('/api/tv/channels', (_req, res) => {
  res.json({ channels: LIVE_TV_CHANNELS });
});

// 1.2 YouTube Presets & Info Endpoints
const YOUTUBE_PRESETS = [
  {
    id: 'PLDIoUOhQQPlXr63I_vwF9GD8sAKh77dWU',
    title: 'Top Hits & Trending Music 2026',
    titleFa: 'آهنگ‌های ترند و برتر سال ۲۰۲۶',
    category: 'Pop & Dance Hits',
    author: 'Top Hits Official',
    description: 'مجموعه پرشنونده‌ترین موزیک‌های روز جهان با کیفیت تصویر و صدای استودیویی',
    thumbnailUrl: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg',
    badge: 'بین‌المللی',
  },
  {
    id: 'PL15B1E77BB5708555',
    title: 'Most Viewed Songs of All Time',
    titleFa: 'پرطرفدارترین ترانه‌های تاریخ یوتیوب',
    category: 'All-Time Legends',
    author: 'Global Charts',
    description: 'محبوب‌ترین ویدیوکلیپ‌ها با میلیاردها بازدید (Despacito, Shape of You, See You Again...)',
    thumbnailUrl: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg',
    badge: 'میلیاردی',
  },
  {
    id: 'PLRBp0Fe2GpgnZOm5rCopMAOYhZCPoUyO5',
    title: 'NCS - Electronic & Bass Live',
    titleFa: 'موزیک‌های الکترونیک و بیس‌دار NCS',
    category: 'Electronic & Bass',
    author: 'NoCopyrightSounds',
    description: 'ترک‌های پرانرژی الکترونیک، گیمینگ، Trap و House بدون کپی‌رایت با کیفیت بالا',
    thumbnailUrl: 'https://i.ytimg.com/vi/yJg-Y5byMMw/hqdefault.jpg',
    badge: 'الکترونیک',
  },
  {
    id: 'PLOHoVaTp8R7dfrJW5pumS0iD_dhlXKv17',
    title: 'K-POP & Global Hits 2026',
    titleFa: 'موزیک‌های پاپ و دنس ترند ۲۰۲۶',
    category: 'Dance & Beats',
    author: 'Music Universe',
    description: 'پلی‌لیست پرانرژی بهترین آهنگ‌های ریتمیک، کلاب و رقص جهانی',
    thumbnailUrl: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    badge: 'انرژیک',
  },
];

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function extractYouTubeId(input: string): { type: 'playlist' | 'video'; id: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Extract from query list param: e.g. ?list=PL... or &list=PL...
  const listMatch = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (listMatch) {
    return { type: 'playlist', id: listMatch[1] };
  }

  // Direct playlist ID prefix
  if (/^(PL|RD|UU|FL|LL|OLAK5uy_)[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { type: 'playlist', id: trimmed };
  }

  // YouTube video URL
  const videoMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|(?:embed|v)\/))([a-zA-Z0-9_-]{11})/);
  if (videoMatch) {
    return { type: 'video', id: videoMatch[1] };
  }

  // 11-char direct video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return { type: 'video', id: trimmed };
  }

  return null;
}

app.get('/api/youtube/presets', (_req, res) => {
  res.json({ presets: YOUTUBE_PRESETS });
});

app.get('/api/youtube/info', async (req, res) => {
  try {
    const query = typeof req.query.query === 'string' ? req.query.query : '';
    if (!query) {
      return res.status(400).json({ error: 'YouTube URL or ID is required' });
    }

    const parsed = extractYouTubeId(query);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid YouTube playlist URL or ID format' });
    }

    if (parsed.type === 'playlist') {
      const apiKey = process.env.YOUTUBE_API_KEY || 'AIzaSyA0YYJqszisDD-mKBGNvnVgXMqE_GvD61g';

      // 1. Try official YouTube Data API v3
      if (apiKey) {
        try {
          const [plRes, itemsRes] = await Promise.all([
            fetch(`https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${parsed.id}&key=${apiKey}`),
            fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${parsed.id}&key=${apiKey}`),
          ]);

          const [plData, itemsData]: [any, any] = await Promise.all([plRes.json(), itemsRes.json()]);

          if (itemsData.items && itemsData.items.length > 0) {
            const playlistTitle = plData.items?.[0]?.snippet?.title || 'YouTube Playlist';
            const authorName = plData.items?.[0]?.snippet?.channelTitle || 'YouTube Creator';

            const items = itemsData.items.map((it: any) => ({
              id: it.snippet?.resourceId?.videoId,
              title: it.snippet?.title || 'Untitled Video',
              author: it.snippet?.videoOwnerChannelTitle || it.snippet?.channelTitle || authorName,
              thumbnailUrl: it.snippet?.thumbnails?.high?.url || it.snippet?.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${it.snippet?.resourceId?.videoId}/hqdefault.jpg`,
              url: `https://www.youtube.com/watch?v=${it.snippet?.resourceId?.videoId}`,
            })).filter((i: any) => i.id);

            return res.json({
              type: 'playlist',
              id: parsed.id,
              title: playlistTitle,
              author: authorName,
              itemCount: items.length,
              items,
            });
          }
        } catch (apiErr: any) {
          console.warn(`YouTube Data API fetch failed for ${parsed.id}:`, apiErr.message);
        }
      }

      // 2. Fallback to RSS feed
      try {
        const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(parsed.id)}`;
        const rssRes = await fetch(feedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });

        if (rssRes.ok) {
          const xml = await rssRes.text();
          const titleMatch = xml.match(/<title>([^<]+)<\/title>/);
          const authorMatch = xml.match(/<author>\s*<name>([^<]+)<\/name>/);
          const playlistTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]) : 'YouTube Playlist';
          const authorName = authorMatch ? decodeHtmlEntities(authorMatch[1]) : 'YouTube Creator';

          const entries = xml.split('<entry>').slice(1);
          const items = entries.map(entry => {
            const vIdMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
            const vTitleMatch = entry.match(/<title>([^<]+)<\/title>/);
            const vAuthorMatch = entry.match(/<author>\s*<name>([^<]+)<\/name>/);
            const vThumbMatch = entry.match(/<media:thumbnail[^>]+url="([^"]+)"/);

            const vId = vIdMatch ? vIdMatch[1] : '';
            return {
              id: vId,
              title: vTitleMatch ? decodeHtmlEntities(vTitleMatch[1]) : 'Untitled Video',
              author: vAuthorMatch ? decodeHtmlEntities(vAuthorMatch[1]) : authorName,
              thumbnailUrl: vThumbMatch ? vThumbMatch[1] : `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
              url: `https://www.youtube.com/watch?v=${vId}`,
            };
          }).filter(item => item.id.length > 0);

          return res.json({
            type: 'playlist',
            id: parsed.id,
            title: playlistTitle,
            author: authorName,
            itemCount: items.length,
            items,
          });
        }
      } catch (feedErr: any) {
        console.warn(`RSS feed fetch failed for ${parsed.id}:`, feedErr.message);
      }

      // Fallback for playlists without public RSS (e.g. dynamic mixes)
      return res.json({
        type: 'playlist',
        id: parsed.id,
        title: 'YouTube Playlist',
        author: 'YouTube',
        itemCount: 0,
        items: [],
      });
    } else {
      // Single video info via oEmbed
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(parsed.id)}&format=json`;
        const oRes = await fetch(oembedUrl);
        if (oRes.ok) {
          const data = await oRes.json();
          const item = {
            id: parsed.id,
            title: data.title || 'YouTube Video',
            author: data.author_name || 'YouTube Channel',
            thumbnailUrl: data.thumbnail_url || `https://i.ytimg.com/vi/${parsed.id}/hqdefault.jpg`,
            url: `https://www.youtube.com/watch?v=${parsed.id}`,
          };
          return res.json({
            type: 'video',
            id: parsed.id,
            title: item.title,
            author: item.author,
            itemCount: 1,
            items: [item],
          });
        }
      } catch (oErr: any) {
        console.warn(`oEmbed fetch failed for ${parsed.id}:`, oErr.message);
      }

      return res.json({
        type: 'video',
        id: parsed.id,
        title: 'YouTube Video',
        author: 'YouTube Channel',
        itemCount: 1,
        items: [{
          id: parsed.id,
          title: 'YouTube Video',
          author: 'YouTube Channel',
          thumbnailUrl: `https://i.ytimg.com/vi/${parsed.id}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${parsed.id}`,
        }],
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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

// 5.1 Direct Download from URL (works directly with direct MP4/Audio links from phone or bots)
app.post('/api/download-url', async (req, res) => {
  const { url, filename: customFilename } = req.body || {};
  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'Valid URL starting with http/https is required' });
  }

  try {
    appendLog(`[Downloader] Starting direct download from: ${url}`, 'info');
    let basename = `download_${Date.now()}.mp4`;
    try {
      const parsed = new URL(url);
      const extracted = path.basename(parsed.pathname);
      if (extracted && extracted.length > 3) basename = extracted;
    } catch {}

    const safeName = (customFilename || basename).replace(/[^a-zA-Z0-9._\-]/g, '_');
    const targetPath = path.join(MUSIC_DIR, safeName);

    const proc = spawn('curl', ['-L', '-f', '-s', '-o', targetPath, url]);
    proc.on('close', code => {
      if (code === 0 && fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1000) {
        const sizeMb = (fs.statSync(targetPath).size / (1024 * 1024)).toFixed(1);
        appendLog(`[Downloader] Successfully downloaded: ${safeName} (${sizeMb} MB) into music/`, 'info');
        res.json({ success: true, filename: safeName, sizeMb });
      } else {
        try { fs.unlinkSync(targetPath); } catch {}
        appendLog(`[Downloader] Failed to download from: ${url}`, 'error');
        res.status(500).json({ error: 'Could not download media file from the provided URL' });
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5.2 Fetch YouTube Playlist Items using official YouTube Data API v3
app.post('/api/youtube/playlist', async (req, res) => {
  const { playlistUrl, maxResults = 25 } = req.body || {};
  const apiKey = process.env.YOUTUBE_API_KEY || 'AIzaSyA0YYJqszisDD-mKBGNvnVgXMqE_GvD61g';
  if (!playlistUrl) {
    return res.status(400).json({ error: 'playlistUrl is required' });
  }

  let playlistId = playlistUrl;
  const match = playlistUrl.match(/list=([a-zA-Z0-9_-]+)/);
  if (match) playlistId = match[1];

  try {
    const apiRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=${maxResults}&playlistId=${playlistId}&key=${apiKey}`
    );
    const data: any = await apiRes.json();
    if (!apiRes.ok) {
      return res.status(apiRes.status).json({ error: data.error?.message || 'YouTube API error' });
    }

    const items = (data.items || []).map((it: any) => ({
      id: it.snippet?.resourceId?.videoId,
      title: it.snippet?.title,
      channel: it.snippet?.videoOwnerChannelTitle || it.snippet?.channelTitle,
      thumbnail: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url,
      publishedAt: it.snippet?.publishedAt,
    }));

    res.json({
      success: true,
      playlistId,
      total: items.length,
      items,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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

  const {
    destination = 'channel',
    customUrl,
    sourceType = 'playlist',
    liveStreamUrl,
    channelName,
    quality = '480p',
  } = req.body || {};

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

  if (sourceType === 'live_tv') {
    if (!liveStreamUrl || !liveStreamUrl.startsWith('http')) {
      return res.status(400).json({ error: 'Invalid live stream URL provided for TV relay.' });
    }
  } else {
    // Ensure playlist has items
    if (!fs.existsSync(PLAYLIST_FILE) || fs.readFileSync(PLAYLIST_FILE, 'utf-8').trim().length === 0) {
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
  }

  const abortController = new AbortController();
  streamState.isStreaming = true;
  streamState.destination = destination;
  streamState.sourceType = sourceType;
  streamState.channelName = channelName || (sourceType === 'live_tv' ? 'Live TV' : undefined);
  streamState.liveStreamUrl = liveStreamUrl;
  streamState.quality = quality;
  streamState.rawTargetUrl = targetUrl;
  // Mask secret key portion in UI
  const masked = targetUrl.replace(/(\/s\/)[^/?#]+/g, '$1******');
  streamState.targetUrlMasked = masked;
  streamState.startedAt = new Date();
  streamState.reconnectCount = 0;
  streamState.abortController = abortController;

  const sourceDesc = sourceType === 'live_tv' ? `Live TV [${streamState.channelName} (${streamState.quality})]` : 'Local Playlist';
  appendLog(`Starting Telegram stream (${sourceDesc}) to [${destination}] destination (${masked})...`, 'stream');

  // Spawn streaming loop
  runStreamLoop(targetUrl, abortController);

  res.json({
    success: true,
    destination,
    sourceType,
    channelName: streamState.channelName,
    quality: streamState.quality,
    maskedUrl: masked,
  });
});

// Streaming process runner with auto-reconnect matching GitHub Actions workflow
function runStreamLoop(targetUrl: string, abortController: AbortController) {
  if (abortController.signal.aborted) return;

  let args: string[] = [];

  if (streamState.sourceType === 'live_tv' && streamState.liveStreamUrl) {
    const q = streamState.quality || '480p';
    let scaleFilter = 'scale=-2:480';
    let vBitrate = '500k';
    let maxBitrate = '600k';
    let bufSize = '1000k';

    if (q === '720p') {
      scaleFilter = 'scale=-2:720';
      vBitrate = '950k';
      maxBitrate = '1100k';
      bufSize = '1800k';
    } else if (q === '1080p') {
      scaleFilter = 'scale=-2:1080';
      vBitrate = '1800k';
      maxBitrate = '2200k';
      bufSize = '3600k';
    }

    // Relay live TV stream (e.g. PMC, Radio Javan) directly to Telegram Live with anti-lag settings
    args = [
      '-hide_banner',
      '-loglevel', 'info',
      '-re',
      '-i', streamState.liveStreamUrl,
      '-vf', scaleFilter,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-pix_fmt', 'yuv420p',
      '-r', '25',
      '-g', '50',
      '-keyint_min', '50',
      '-b:v', vBitrate,
      '-maxrate', maxBitrate,
      '-bufsize', bufSize,
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      '-f', 'flv',
      '-flvflags', 'no_duration_filesize',
      targetUrl,
    ];
  } else {
    // Local Playlist + Background image with optimized smooth Telegram keyframes
    args = [
      '-hide_banner',
      '-loglevel', 'info',
      '-re',
      '-loop', '1',
      '-framerate', '10',
      '-i', 'assets/background.jpg',
      '-stream_loop', '-1',
      '-f', 'concat',
      '-safe', '0',
      '-i', 'playlist.txt',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'stillimage',
      '-pix_fmt', 'yuv420p',
      '-r', '10',
      '-g', '20',
      '-keyint_min', '20',
      '-b:v', '250k',
      '-maxrate', '300k',
      '-bufsize', '600k',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-ar', '44100',
      '-ac', '2',
      '-f', 'flv',
      '-flvflags', 'no_duration_filesize',
      targetUrl,
    ];
  }

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

    if (abortController.signal.aborted || !streamState.isStreaming) {
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

// 13. Stop Streaming (guaranteed force-stop and cleanup)
app.post('/api/stream/stop', (_req, res) => {
  appendLog('Stopping all stream processes and cleaning up...', 'warn');

  streamState.isStreaming = false;

  if (streamState.abortController) {
    try {
      streamState.abortController.abort();
    } catch {}
  }

  if (streamState.process && streamState.process.pid) {
    try {
      streamState.process.kill('SIGKILL');
    } catch {}
  }

  // Force kill any remaining ffmpeg process
  try {
    spawn('pkill', ['-9', '-f', 'ffmpeg']);
  } catch {}

  streamState.process = null;
  streamState.pid = null;
  streamState.startedAt = null;

  res.json({ success: true, message: 'All stream processes stopped' });
});

// 13.1 Reset Streaming Engine
app.post('/api/stream/reset', (_req, res) => {
  appendLog('Forced reset of all streaming services...', 'warn');
  streamState.isStreaming = false;
  if (streamState.abortController) {
    try {
      streamState.abortController.abort();
    } catch {}
  }
  if (streamState.process && streamState.process.pid) {
    try {
      streamState.process.kill('SIGKILL');
    } catch {}
  }
  try {
    spawn('pkill', ['-9', '-f', 'ffmpeg']);
  } catch {}
  streamState.process = null;
  streamState.pid = null;
  streamState.startedAt = null;
  streamState.reconnectCount = 0;
  res.json({ success: true, message: 'Streaming engine reset successfully' });
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

// ----------------------------------------------------
// GitHub Actions Integration (aishervin/Streamer)
// ----------------------------------------------------
const GITHUB_REPO = 'aishervin/Streamer';
const GITHUB_TOKEN = process.env.GITHUB_PAT || '';

async function githubFetch(endpoint: string, options: RequestInit = {}) {
  const url = `https://api.github.com${endpoint}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'DevStudio-Streamer',
      ...(options.headers || {}),
    },
  });
}

// 16. Get GitHub Actions Workflow Runs
app.get('/api/github/runs', async (_req, res) => {
  try {
    const ghRes = await githubFetch(`/repos/${GITHUB_REPO}/actions/runs?per_page=8`);
    if (!ghRes.ok) {
      const errText = await ghRes.text();
      return res.status(ghRes.status).json({ error: errText });
    }
    const data = await ghRes.json();
    const runs = (data.workflow_runs || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      conclusion: r.conclusion,
      html_url: r.html_url,
      created_at: r.created_at,
      updated_at: r.updated_at,
      event: r.event,
    }));
    res.json({ runs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 17. Dispatch GitHub Actions Stream Workflow
app.post('/api/github/dispatch-stream', async (req, res) => {
  try {
    const { destination = 'channel', customUrl = '' } = req.body || {};
    appendLog(`[GitHub Actions] Dispatching workflow "stream.yml" (destination: ${destination}) on ${GITHUB_REPO}...`, 'info');

    const ghRes = await githubFetch(`/repos/${GITHUB_REPO}/actions/workflows/stream.yml/dispatches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          destination,
          custom_rtmps_url: customUrl || '',
        },
      }),
    });

    if (ghRes.status === 204) {
      appendLog(`[GitHub Actions] Successfully triggered "Stream to Telegram" workflow on GitHub Actions!`, 'stream');
      res.json({ success: true, message: 'Workflow dispatched successfully on GitHub Actions' });
    } else {
      const err = await ghRes.text();
      appendLog(`[GitHub Actions] Failed to dispatch workflow: ${err}`, 'error');
      res.status(ghRes.status).json({ error: err });
    }
  } catch (err: any) {
    appendLog(`[GitHub Actions] Dispatch error: ${err.message}`, 'error');
    res.status(500).json({ error: err.message });
  }
});

// 17.1 Dispatch YouTube Stream Workflow on GitHub Actions
app.post('/api/github/dispatch-youtube-stream', async (req, res) => {
  try {
    const {
      playlistUrl = 'https://www.youtube.com/playlist?list=PLDIoUOhQQPlXr63I_vwF9GD8sAKh77dWU',
      destination = 'channel',
      customUrl = '',
      quality = '720p',
      maxVideos = '20',
    } = req.body || {};

    appendLog(`[GitHub Actions] Dispatching "youtube_stream.yml" on ${GITHUB_REPO} for ${playlistUrl} (${destination}, ${quality})...`, 'info');

    const ghRes = await githubFetch(`/repos/${GITHUB_REPO}/actions/workflows/youtube_stream.yml/dispatches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          playlist_url: playlistUrl,
          destination,
          custom_rtmps_url: customUrl || '',
          quality,
          max_videos: String(maxVideos),
        },
      }),
    });

    if (ghRes.status === 204) {
      appendLog(`[GitHub Actions] Successfully launched YouTube Playlist Video Streamer on GitHub Actions!`, 'stream');
      res.json({ success: true, message: 'YouTube stream workflow launched successfully on GitHub Actions' });
    } else {
      const err = await ghRes.text();
      appendLog(`[GitHub Actions] Failed to dispatch youtube_stream.yml: ${err}`, 'error');
      res.status(ghRes.status).json({ error: err });
    }
  } catch (err: any) {
    appendLog(`[GitHub Actions] Dispatch error: ${err.message}`, 'error');
    res.status(500).json({ error: err.message });
  }
});

// 18. Dispatch GitHub Actions Optimize Workflow
app.post('/api/github/dispatch-optimize', async (_req, res) => {
  try {
    appendLog(`[GitHub Actions] Dispatching workflow "optimize.yml" on ${GITHUB_REPO}...`, 'info');

    const ghRes = await githubFetch(`/repos/${GITHUB_REPO}/actions/workflows/optimize.yml/dispatches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main' }),
    });

    if (ghRes.status === 204) {
      appendLog(`[GitHub Actions] Successfully triggered "Optimize Music" workflow on GitHub Actions!`, 'stream');
      res.json({ success: true, message: 'Optimize workflow dispatched successfully on GitHub Actions' });
    } else {
      const err = await ghRes.text();
      appendLog(`[GitHub Actions] Failed to dispatch optimize: ${err}`, 'error');
      res.status(ghRes.status).json({ error: err });
    }
  } catch (err: any) {
    appendLog(`[GitHub Actions] Dispatch error: ${err.message}`, 'error');
    res.status(500).json({ error: err.message });
  }
});

// 19. Cancel a running GitHub Workflow
app.post('/api/github/cancel/:runId', async (req, res) => {
  try {
    const { runId } = req.params;
    appendLog(`[GitHub Actions] Canceling workflow run #${runId}...`, 'warn');

    const ghRes = await githubFetch(`/repos/${GITHUB_REPO}/actions/runs/${runId}/cancel`, {
      method: 'POST',
    });

    if (ghRes.status === 202) {
      appendLog(`[GitHub Actions] Cancel request accepted for run #${runId}`, 'info');
      res.json({ success: true });
    } else {
      const err = await ghRes.text();
      res.status(ghRes.status).json({ error: err });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 20. Update GitHub Secret (e.g. YOUTUBE_COOKIES)
app.post('/api/github/set-cookie', async (req, res) => {
  try {
    const { cookieContent } = req.body || {};
    if (!cookieContent || typeof cookieContent !== 'string') {
      return res.status(400).json({ error: 'cookieContent is required' });
    }

    // 1. Get repo public key for secret encryption
    const keyRes = await githubFetch(`/repos/${GITHUB_REPO}/actions/secrets/public-key`);
    if (!keyRes.ok) {
      const err = await keyRes.text();
      return res.status(keyRes.status).json({ error: `Failed to get public key: ${err}` });
    }
    const { key_id, key } = await keyRes.json();

    // 2. Encrypt cookie content with libsodium
    const sodium = (await import('libsodium-wrappers')).default;
    await sodium.ready;
    const binkey = sodium.from_base64(key, sodium.base64_variants.ORIGINAL);
    const binsec = sodium.from_string(cookieContent.trim());
    const encBytes = sodium.crypto_box_seal(binsec, binkey);
    const encrypted_value = sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);

    // 3. Put secret YOUTUBE_COOKIES
    const putRes = await githubFetch(`/repos/${GITHUB_REPO}/actions/secrets/YOUTUBE_COOKIES`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        encrypted_value,
        key_id,
      }),
    });

    if (putRes.ok || putRes.status === 201 || putRes.status === 204) {
      appendLog('[GitHub Actions] YOUTUBE_COOKIES secret successfully saved and encrypted on GitHub!', 'info');
      res.json({ success: true, message: 'YouTube Cookies successfully saved to GitHub Secrets!' });
    } else {
      const err = await putRes.text();
      res.status(putRes.status).json({ error: `Failed to set secret: ${err}` });
    }
  } catch (err: any) {
    appendLog(`[GitHub Actions] Secret encryption error: ${err.message}`, 'error');
    res.status(500).json({ error: err.message });
  }
});

// 21. Update GitHub Secret YOUTUBE_OAUTH_TOKEN
app.post('/api/github/set-oauth-token', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'token is required' });
    }

    // 1. Get repo public key for secret encryption
    const keyRes = await githubFetch(`/repos/${GITHUB_REPO}/actions/secrets/public-key`);
    if (!keyRes.ok) {
      const err = await keyRes.text();
      return res.status(keyRes.status).json({ error: `Failed to get public key: ${err}` });
    }
    const { key_id, key } = await keyRes.json();

    // 2. Encrypt token with libsodium
    const sodium = (await import('libsodium-wrappers')).default;
    await sodium.ready;
    const binkey = sodium.from_base64(key, sodium.base64_variants.ORIGINAL);
    const binsec = sodium.from_string(token.trim());
    const encBytes = sodium.crypto_box_seal(binsec, binkey);
    const encrypted_value = sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);

    // 3. Put secret YOUTUBE_OAUTH_TOKEN
    const putRes = await githubFetch(`/repos/${GITHUB_REPO}/actions/secrets/YOUTUBE_OAUTH_TOKEN`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        encrypted_value,
        key_id,
      }),
    });

    if (putRes.ok || putRes.status === 201 || putRes.status === 204) {
      appendLog('[GitHub Actions] YOUTUBE_OAUTH_TOKEN successfully encrypted and saved to GitHub Secrets!', 'info');
      res.json({ success: true, message: 'توکن دسترسی یوتیوب با موفقیت در سکرت‌های گیت‌هاب ذخیره شد!' });
    } else {
      const err = await putRes.text();
      res.status(putRes.status).json({ error: `Failed to set secret: ${err}` });
    }
  } catch (err: any) {
    appendLog(`[GitHub Actions] Secret encryption error: ${err.message}`, 'error');
    res.status(500).json({ error: err.message });
  }
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
