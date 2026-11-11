import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  Play,
  Square,
  Terminal,
  Clock,
  RotateCcw,
  Activity,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Trash2,
  CheckCircle2,
  Copy,
  Info
} from 'lucide-react';
import { StreamStatus, LogEntry } from '../types.ts';

interface StreamControlProps {
  status: StreamStatus;
  logs: LogEntry[];
  onStartStream: (destination: 'channel' | 'group' | 'school' | 'custom', customUrl?: string) => Promise<void>;
  onStopStream: () => Promise<void>;
  onClearLogs: () => void;
  playlistCount: number;
}

export const StreamControl: React.FC<StreamControlProps> = ({
  status,
  logs,
  onStartStream,
  onStopStream,
  onClearLogs,
  playlistCount,
}) => {
  const [destination, setDestination] = useState<'channel' | 'group' | 'school' | 'custom'>('channel');
  const [customUrl, setCustomUrl] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'stream' | 'error'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await onStartStream(destination, customUrl);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    try {
      await onStopStream();
    } finally {
      setIsStopping(false);
    }
  };

  const formatUptime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const filteredLogs = logs.filter(log => {
    if (filterType === 'all') return true;
    if (filterType === 'stream') return log.type === 'stream';
    if (filterType === 'error') return log.type === 'error' || log.type === 'warn';
    return true;
  });

  return (
    <div id="stream-control-panel" className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-6 shadow-lg flex flex-col gap-6">
      {/* Header with Live Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div
            className={`p-3 rounded-xl border ${
              status.isStreaming
                ? 'bg-red-500/10 text-red-400 border-red-500/30 animate-pulse'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}
          >
            <Radio className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-zinc-100">Live Broadcast Engine</h2>
              {status.isStreaming ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  On Air
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                  Idle
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Continuous FFmpeg RTMPS pipeline with auto-reconnect
            </p>
          </div>
        </div>

        {/* Live Metrics */}
        {status.isStreaming && (
          <div className="flex items-center gap-4 bg-zinc-950/60 border border-zinc-800 px-4 py-2 rounded-xl">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <div>
                <p className="text-[10px] text-zinc-500 font-medium uppercase">Uptime</p>
                <p className="text-xs font-mono font-semibold text-zinc-200">
                  {formatUptime(status.uptimeSeconds)}
                </p>
              </div>
            </div>

            <div className="h-6 w-px bg-zinc-800" />

            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-400" />
              <div>
                <p className="text-[10px] text-zinc-500 font-medium uppercase">Reconnects</p>
                <p className="text-xs font-mono font-semibold text-zinc-200">
                  {status.reconnectCount}
                </p>
              </div>
            </div>

            {status.pid && (
              <>
                <div className="h-6 w-px bg-zinc-800" />
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <div>
                    <p className="text-[10px] text-zinc-500 font-medium uppercase">PID</p>
                    <p className="text-xs font-mono font-semibold text-zinc-200">{status.pid}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Destination Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Telegram Channel Option */}
        <label
          onClick={() => !status.isStreaming && setDestination('channel')}
          className={`relative p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
            destination === 'channel'
              ? 'border-cyan-500/80 bg-cyan-950/20 shadow-md'
              : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
          } ${status.isStreaming ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="destination"
                checked={destination === 'channel'}
                onChange={() => setDestination('channel')}
                disabled={status.isStreaming}
                className="text-cyan-500 focus:ring-0"
              />
              <span className="text-sm font-semibold text-zinc-200">Telegram Channel</span>
            </div>
            {status.hasChannelSecret ? (
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Ready (In-Source)
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                Env Not Set
              </span>
            )}
          </div>
          <p className="text-xs text-cyan-400 mt-2 font-mono truncate">
            rtmps://dc4-1.rtmp.t.me/...2410187005
          </p>
        </label>

        {/* Telegram Group Option */}
        <label
          onClick={() => !status.isStreaming && setDestination('group')}
          className={`relative p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
            destination === 'group'
              ? 'border-cyan-500/80 bg-cyan-950/20 shadow-md'
              : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
          } ${status.isStreaming ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="destination"
                checked={destination === 'group'}
                onChange={() => setDestination('group')}
                disabled={status.isStreaming}
                className="text-cyan-500 focus:ring-0"
              />
              <span className="text-sm font-semibold text-zinc-200">Telegram Group</span>
            </div>
            {status.hasGroupSecret ? (
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Ready (In-Source)
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                Env Not Set
              </span>
            )}
          </div>
          <p className="text-xs text-cyan-400 mt-2 font-mono truncate">
            rtmps://dc4-1.rtmp.t.me/...1703832793
          </p>
        </label>

        {/* Telegram School Channel Option */}
        <label
          onClick={() => !status.isStreaming && setDestination('school')}
          className={`relative p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
            destination === 'school'
              ? 'border-cyan-500/80 bg-cyan-950/20 shadow-md'
              : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
          } ${status.isStreaming ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="destination"
                checked={destination === 'school'}
                onChange={() => setDestination('school')}
                disabled={status.isStreaming}
                className="text-cyan-500 focus:ring-0"
              />
              <span className="text-sm font-semibold text-zinc-200">School Channel</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              Ready
            </span>
          </div>
          <p className="text-xs text-cyan-400 mt-2 font-mono truncate">
            rtmps://dc4-1.rtmp.t.me/...2600754983
          </p>
        </label>

        {/* Custom RTMPS Option */}
        <label
          onClick={() => !status.isStreaming && setDestination('custom')}
          className={`relative p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
            destination === 'custom'
              ? 'border-cyan-500/80 bg-cyan-950/20 shadow-md'
              : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
          } ${status.isStreaming ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="destination"
                checked={destination === 'custom'}
                onChange={() => setDestination('custom')}
                disabled={status.isStreaming}
                className="text-cyan-500 focus:ring-0"
              />
              <span className="text-sm font-semibold text-zinc-200">Custom RTMPS URL</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
              Direct input
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-2">
            Paste full rtmps:// URL directly
          </p>
        </label>
      </div>

      {/* Custom URL Input Field when Custom is selected */}
      {destination === 'custom' && !status.isStreaming && (
        <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
          <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
            Telegram Live Stream RTMPS Endpoint
          </label>
          <input
            type="text"
            id="input-custom-rtmps"
            placeholder="rtmps://dc4-1.rtmp.t.me/s/12345678:abcdefghijk..."
            value={customUrl}
            onChange={e => setCustomUrl(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 font-mono"
          />
          <p className="text-[11px] text-zinc-500 mt-1.5">
            Tip: Join your Channel/Group, tap "Live Stream" → "Stream with third-party app" and combine the Server URL with the Stream Key.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {!status.isStreaming ? (
            <button
              id="btn-start-stream"
              onClick={handleStart}
              disabled={isStarting || playlistCount === 0}
              className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
              {isStarting ? 'Initiating Pipeline...' : 'Start Live Stream'}
            </button>
          ) : (
            <button
              id="btn-stop-stream"
              onClick={handleStop}
              disabled={isStopping}
              className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-sm bg-zinc-800 hover:bg-zinc-700 text-red-400 border border-red-500/30 hover:border-red-500/50 shadow-md disabled:opacity-50 transition flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <Square className="w-4 h-4 fill-current" />
              {isStopping ? 'Terminating Process...' : 'Stop Stream'}
            </button>
          )}

          <button
            id="btn-toggle-guide"
            onClick={() => setShowGuide(!showGuide)}
            className="px-3.5 py-3 rounded-xl text-xs font-medium text-zinc-300 bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/80 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Info className="w-4 h-4 text-cyan-400" />
            <span>Setup Instructions</span>
            {showGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {playlistCount === 0 && !status.isStreaming && (
          <p className="text-xs text-amber-400 flex items-center gap-1.5 font-medium">
            <AlertCircle className="w-4 h-4" />
            Please add and optimize at least 1 music track before broadcasting.
          </p>
        )}
      </div>

      {/* Collapsible Telegram Stream Guide */}
      {showGuide && (
        <div id="telegram-guide-box" className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-5 text-xs text-zinc-300 space-y-3 leading-relaxed">
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            How to broadcast to Telegram
          </h3>
          <ol className="list-decimal list-inside space-y-2 text-zinc-400">
            <li>
              Open Telegram, navigate to your <strong className="text-zinc-200">Channel</strong> or <strong className="text-zinc-200">Group</strong>.
            </li>
            <li>
              Tap the Channel profile → <strong className="text-zinc-200">Live Stream</strong> (or video chat icon) → <strong className="text-zinc-200">Stream with...</strong>
            </li>
            <li>
              Copy the <strong className="text-zinc-200">Server URL</strong> (e.g., <code className="text-cyan-300">rtmps://dc4-1.rtmp.t.me/s/</code>) and the <strong className="text-zinc-200">Stream Key</strong>.
            </li>
            <li>
              Append your key: <code className="text-cyan-300">rtmps://dc4-1.rtmp.t.me/s/&lt;KEY&gt;</code>. Select "Custom RTMPS URL" above and paste it, or save it to your environment as <code className="text-zinc-200">CSTREAM_RTMPS_URL</code> or <code className="text-zinc-200">GSTREAM_RTMPS_URL</code>.
            </li>
            <li>
              Click <strong className="text-zinc-200">Start Live Stream</strong>. The server encodes your background image and concatenated AAC audio in a continuous loop.
            </li>
          </ol>
        </div>
      )}

      {/* Live FFmpeg Console Output */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl overflow-hidden flex flex-col shadow-inner">
        <div className="bg-zinc-900/90 px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-mono font-semibold text-zinc-200">FFmpeg Output Logs</span>
            <span className="text-[10px] text-zinc-500 font-mono">({filteredLogs.length} events)</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter buttons */}
            <div className="flex items-center bg-zinc-950 rounded-lg p-0.5 border border-zinc-800 text-[11px]">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  filterType === 'all' ? 'bg-zinc-800 text-zinc-200 font-medium' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('stream')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  filterType === 'stream' ? 'bg-zinc-800 text-cyan-300 font-medium' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Stream
              </button>
              <button
                onClick={() => setFilterType('error')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  filterType === 'error' ? 'bg-zinc-800 text-amber-300 font-medium' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Errors
              </button>
            </div>

            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-2 py-1 rounded text-[11px] font-mono cursor-pointer transition ${
                autoScroll ? 'text-cyan-400 bg-cyan-500/10' : 'text-zinc-500 bg-zinc-800'
              }`}
            >
              Auto-scroll
            </button>

            <button
              onClick={onClearLogs}
              className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
              title="Clear terminal"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div
          ref={terminalRef}
          id="ffmpeg-terminal-output"
          className="p-4 font-mono text-xs max-h-56 overflow-y-auto space-y-1 select-text bg-black/70 custom-scrollbar"
        >
          {filteredLogs.length === 0 ? (
            <p className="text-zinc-600 italic">No logs recorded yet. Live encoding updates will appear here.</p>
          ) : (
            filteredLogs.map(log => {
              let color = 'text-zinc-400';
              if (log.type === 'stream') color = 'text-cyan-400';
              if (log.type === 'warn') color = 'text-amber-400';
              if (log.type === 'error') color = 'text-red-400';

              return (
                <div key={log.id} className="leading-relaxed flex items-start gap-2">
                  <span className="text-zinc-600 select-none shrink-0">[{log.timestamp}]</span>
                  <span className={`${color} break-all`}>{log.text}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
