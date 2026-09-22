import React, { useEffect, useState, useCallback } from 'react';
import { Radio, Music2, Sparkles, Sliders, RefreshCw, AlertTriangle, CheckCircle, Info, GitBranch, Tv } from 'lucide-react';
import { AudioLibrary } from './components/AudioLibrary.tsx';
import { OptimizedPlaylist } from './components/OptimizedPlaylist.tsx';
import { BackgroundCard } from './components/BackgroundCard.tsx';
import { StreamControl } from './components/StreamControl.tsx';
import { AudioPlayerBar } from './components/AudioPlayerBar.tsx';
import { GitHubActionsControl } from './components/GitHubActionsControl.tsx';
import { LiveTvPlayer } from './components/LiveTvPlayer.tsx';
import { TrackInfo, StreamStatus, LogEntry } from './types.ts';

export function App() {
  const [status, setStatus] = useState<StreamStatus>({
    isStreaming: false,
    destination: null,
    uptimeSeconds: 0,
    reconnectCount: 0,
    hasChannelSecret: false,
    hasGroupSecret: false,
  });

  const [rawTracks, setRawTracks] = useState<TrackInfo[]>([]);
  const [optimizedTracks, setOptimizedTracks] = useState<TrackInfo[]>([]);
  const [playlistCount, setPlaylistCount] = useState(0);
  const [hasBackground, setHasBackground] = useState(true);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [engineTab, setEngineTab] = useState<'container' | 'livetv' | 'github'>('livetv');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // In-browser audio player state
  const [playerState, setPlayerState] = useState<{
    track: { folder: string; filename: string } | null;
    isPlaying: boolean;
  }>({
    track: null,
    isPlaying: false,
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch library tracks
  const fetchTracks = useCallback(async () => {
    try {
      const res = await fetch('/api/tracks');
      if (res.ok) {
        const data = await res.json();
        setRawTracks(data.rawTracks || []);
        setOptimizedTracks(data.optimizedTracks || []);
        setPlaylistCount(data.playlistCount || 0);
        setHasBackground(Boolean(data.hasBackground));
      }
    } catch {
      // ignore network hiccups
    }
  }, []);

  // Fetch streaming & system status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        if (data.stream) {
          setStatus(data.stream);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Initial load & polling
  useEffect(() => {
    fetchTracks();
    fetchStatus();

    const interval = setInterval(() => {
      fetchStatus();
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchTracks, fetchStatus]);

  // Setup Server-Sent Events (SSE) for logs
  useEffect(() => {
    const eventSource = new EventSource('/api/stream/logs-sse');

    eventSource.onmessage = event => {
      try {
        const entry: LogEntry = JSON.parse(event.data);
        setLogs(prev => {
          if (prev.some(l => l.id === entry.id)) return prev;
          const next = [...prev, entry];
          return next.length > 300 ? next.slice(-300) : next;
        });
      } catch {
        // ignore
      }
    };

    eventSource.onerror = () => {
      // Fallback polling for logs
      fetch('/api/stream/logs')
        .then(r => r.json())
        .then(d => {
          if (d.logs) setLogs(d.logs);
        })
        .catch(() => {});
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // Audio Upload handler
  const handleUploadAudio = async (files: FileList | File[]) => {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Uploaded ${data.count} audio track(s) to music/`, 'success');
        fetchTracks();
      } else {
        showToast(data.error || 'Upload failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Generate Demo Track
  const handleGenerateDemo = async () => {
    try {
      const res = await fetch('/api/generate-demo-track', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast(`Created demo melody: ${data.filename}`, 'success');
        fetchTracks();
      } else {
        showToast(data.error || 'Failed to generate demo track', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Optimize handler
  const handleOptimize = async (removeOriginals: boolean) => {
    setIsOptimizing(true);
    try {
      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeOriginals }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(
          `Optimization complete! Converted: ${data.processed}, Skipped: ${data.skipped}`,
          'success',
        );
        fetchTracks();
      } else {
        showToast(data.error || 'Optimization failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsOptimizing(false);
    }
  };

  // Delete Track
  const handleDeleteTrack = async (folder: 'raw' | 'optimized', filename: string) => {
    try {
      const res = await fetch(`/api/track/${folder}/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast(`Removed ${filename}`, 'info');
        if (playerState.track?.filename === filename) {
          setPlayerState({ track: null, isPlaying: false });
        }
        fetchTracks();
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Rebuild Playlist
  const handleRebuildPlaylist = async () => {
    try {
      const res = await fetch('/api/playlist/rebuild', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast(`Playlist refreshed with ${data.count} track(s)`, 'success');
        fetchTracks();
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Background Image Upload
  const handleUploadBackground = async (file: File) => {
    const formData = new FormData();
    formData.append('background', file);
    try {
      const res = await fetch('/api/upload-background', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        showToast('Background canvas updated', 'success');
        setHasBackground(true);
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Generate Default Background
  const handleGenerateBackground = async () => {
    try {
      const res = await fetch('/api/generate-background', { method: 'POST' });
      if (res.ok) {
        showToast('Default 640x360 background generated', 'success');
        setHasBackground(true);
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Start Live Stream
  const handleStartStream = async (
    destination: 'channel' | 'group' | 'custom',
    customUrl?: string,
  ) => {
    try {
      const res = await fetch('/api/stream/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination, customUrl }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Streaming started to ${destination}!`, 'success');
        fetchStatus();
      } else {
        showToast(data.error || 'Failed to start stream', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Stop Stream
  const handleStopStream = async () => {
    try {
      const res = await fetch('/api/stream/stop', { method: 'POST' });
      if (res.ok) {
        showToast('Live stream terminated.', 'info');
        fetchStatus();
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Play / Pause preview in browser
  const handlePlayPreview = (folder: 'raw' | 'optimized', filename: string) => {
    if (playerState.track?.folder === folder && playerState.track?.filename === filename) {
      setPlayerState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
    } else {
      setPlayerState({
        track: { folder, filename },
        isPlaying: true,
      });
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col pb-28">
      {/* Toast Notification */}
      {toast && (
        <div
          id="toast-banner"
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-xl flex items-center gap-2.5 text-xs font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/30'
              : toast.type === 'error'
              ? 'bg-red-950/90 text-red-300 border-red-500/30'
              : 'bg-zinc-900/90 text-zinc-200 border-zinc-700'
          }`}
        >
          {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
          {toast.type === 'error' && <AlertTriangle className="w-4 h-4 text-red-400" />}
          {toast.type === 'info' && <Info className="w-4 h-4 text-cyan-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Navigation / App Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-zinc-100 tracking-tight flex items-center gap-2">
                Telegram Music Streamer
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 font-normal">
                  FFmpeg 24/7
                </span>
              </h1>
              <p className="text-xs text-zinc-400">
                Continuous AAC 96k live audio broadcast pipeline
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {status.isStreaming ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                <span>Broadcasting to {status.destination}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/80 text-zinc-400 text-xs">
                <span className="w-2 h-2 rounded-full bg-zinc-600" />
                <span>Engine Ready</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        {/* Stream Engine Selector Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/50 p-1.5 rounded-xl border border-zinc-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setEngineTab('livetv')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
                engineTab === 'livetv'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              <Tv className="w-3.5 h-3.5 text-rose-300" />
              <span>پخش زنده تصویری (PMC / رادیو جوان / IPTV)</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/30 text-rose-200 font-bold border border-rose-400/30">
                تصویری + رله
              </span>
            </button>

            <button
              onClick={() => setEngineTab('container')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
                engineTab === 'container'
                  ? 'bg-cyan-500 text-zinc-950 shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>استریم موزیک لوکال (پلی‌لیست صوتی)</span>
              {status.isStreaming && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              )}
            </button>

            <button
              onClick={() => setEngineTab('github')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
                engineTab === 'github'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>گیت‌هاب اکشنز (aishervin/Streamer)</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-mono">
                Live
              </span>
            </button>
          </div>

          <div className="text-[11px] text-zinc-400 font-mono px-3">
            {engineTab === 'livetv' ? (
              <span className="text-rose-400">● Live TV: پخش و رله بدون لگ شبکه‌های تصویری</span>
            ) : engineTab === 'container' ? (
              <span className="text-cyan-400">● Container: پخش پلی‌لیست موزیک با تصویر ثابت</span>
            ) : (
              <span className="text-indigo-400">● GitHub Actions: اجرای گردش‌کار در کلاود گیت‌هاب</span>
            )}
          </div>
        </div>

        {/* Stream Control & Live Terminal */}
        <section id="broadcast-section">
          {engineTab === 'livetv' ? (
            <LiveTvPlayer
              streamStatus={status}
              onRefreshStatus={fetchStatus}
            />
          ) : engineTab === 'container' ? (
            <StreamControl
              status={status}
              logs={logs}
              onStartStream={handleStartStream}
              onStopStream={handleStopStream}
              onClearLogs={() => setLogs([])}
              playlistCount={playlistCount}
            />
          ) : (
            <GitHubActionsControl />
          )}
        </section>

        {/* Media & Encoding Management */}
        <section id="media-pipeline-section" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Raw Music Upload & Storage */}
          <div className="lg:col-span-1">
            <AudioLibrary
              rawTracks={rawTracks}
              isOptimizing={isOptimizing}
              onOptimize={handleOptimize}
              onUpload={handleUploadAudio}
              onGenerateDemo={handleGenerateDemo}
              onDeleteTrack={handleDeleteTrack}
              onPlayPreview={handlePlayPreview}
              currentPlaying={
                playerState.track
                  ? {
                      folder: playerState.track.folder,
                      filename: playerState.track.filename,
                      isPlaying: playerState.isPlaying,
                    }
                  : null
              }
            />
          </div>

          {/* Center: Optimized Playlist (concat stream source) */}
          <div className="lg:col-span-1">
            <OptimizedPlaylist
              tracks={optimizedTracks}
              playlistCount={playlistCount}
              onRebuildPlaylist={handleRebuildPlaylist}
              onDeleteTrack={handleDeleteTrack}
              onPlayPreview={handlePlayPreview}
              currentPlaying={
                playerState.track
                  ? {
                      folder: playerState.track.folder,
                      filename: playerState.track.filename,
                      isPlaying: playerState.isPlaying,
                    }
                  : null
              }
            />
          </div>

          {/* Right: Broadcast Background Canvas & Pipeline Specs */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <BackgroundCard
              hasBackground={hasBackground}
              onUploadBackground={handleUploadBackground}
              onGenerateBackground={handleGenerateBackground}
            />

            {/* Technical Specifications Card */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 text-xs space-y-3">
              <h3 className="font-semibold text-zinc-200 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Pipeline Parameters
              </h3>
              <div className="space-y-1.5 text-zinc-400 font-mono">
                <div className="flex justify-between py-1 border-b border-zinc-800/60">
                  <span className="text-zinc-500">Audio Codec</span>
                  <span className="text-zinc-300">AAC (libfdk/aac)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-800/60">
                  <span className="text-zinc-500">Audio Bitrate</span>
                  <span className="text-zinc-300">96 kbps / 44.1 kHz</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-800/60">
                  <span className="text-zinc-500">Video Canvas</span>
                  <span className="text-zinc-300">640×360 @ 2fps (80k)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-800/60">
                  <span className="text-zinc-500">Concat Source</span>
                  <span className="text-zinc-300">playlist.txt (loop -1)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-zinc-500">Auto-Reconnect</span>
                  <span className="text-emerald-400">Enabled (5s delay)</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Floating In-Browser Audio Player Bar */}
      <AudioPlayerBar
        currentTrack={playerState.track}
        isPlaying={playerState.isPlaying}
        onTogglePlay={() => setPlayerState(prev => ({ ...prev, isPlaying: !prev.isPlaying }))}
        onClose={() => setPlayerState({ track: null, isPlaying: false })}
      />
    </div>
  );
}

export default App;
