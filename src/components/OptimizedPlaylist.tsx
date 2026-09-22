import React from 'react';
import { ListMusic, RefreshCw, Trash2, Play, Pause, Disc, Radio, Volume2, VolumeX } from 'lucide-react';
import { TrackInfo } from '../types.ts';

interface OptimizedPlaylistProps {
  tracks: TrackInfo[];
  playlistCount: number;
  onRebuildPlaylist: () => Promise<void>;
  onDeleteTrack: (folder: 'raw' | 'optimized', filename: string) => Promise<void>;
  onPlayPreview: (folder: 'raw' | 'optimized', filename: string) => void;
  currentPlaying: { folder: string; filename: string; isPlaying: boolean } | null;
}

export const OptimizedPlaylist: React.FC<OptimizedPlaylistProps> = ({
  tracks,
  playlistCount,
  onRebuildPlaylist,
  onDeleteTrack,
  onPlayPreview,
  currentPlaying,
}) => {
  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const totalBytes = tracks.reduce((acc, t) => acc + t.size, 0);

  return (
    <div id="optimized-playlist-panel" className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-6 flex flex-col h-full shadow-lg">
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ListMusic className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              Broadcast Playlist
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-emerald-400 border border-emerald-500/30 font-medium">
                {tracks.length} track{tracks.length === 1 ? '' : 's'}
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              music-optimized/ • AAC 96k / 44.1kHz • Stream-ready
            </p>
          </div>
        </div>

        <button
          id="btn-rebuild-playlist"
          onClick={onRebuildPlaylist}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 hover:border-zinc-600 transition flex items-center gap-1.5 cursor-pointer"
          title="Regenerate playlist.txt order"
        >
          <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
          Rebuild Playlist
        </button>
      </div>

      {/* Stats ribbon */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3">
          <p className="text-xs text-zinc-400 font-medium">Playlist Status</p>
          <p className="text-sm font-semibold text-zinc-200 mt-0.5 flex items-center gap-1.5">
            <Radio className={`w-3.5 h-3.5 ${playlistCount > 0 ? 'text-emerald-400' : 'text-zinc-600'}`} />
            {playlistCount > 0 ? `${playlistCount} files queued` : 'Empty'}
          </p>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3">
          <p className="text-xs text-zinc-400 font-medium">Total Stream Cache</p>
          <p className="text-sm font-semibold text-zinc-200 mt-0.5">
            {formatSize(totalBytes)}
          </p>
        </div>
      </div>

      {/* Track Listing */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[380px] custom-scrollbar">
        {tracks.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-center p-5 border border-zinc-800/60 rounded-xl bg-zinc-950/20">
            <Disc className="w-8 h-8 text-zinc-600 mb-2 animate-spin-slow" />
            <p className="text-sm text-zinc-400 font-medium">No optimized tracks yet</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-xs">
              Audio files converted to 96kbps AAC will appear here and feed directly into Telegram Live via FFmpeg concat.
            </p>
          </div>
        ) : (
          tracks.map((track, idx) => {
            const isThisPlaying =
              currentPlaying?.folder === 'optimized' &&
              currentPlaying?.filename === track.filename &&
              currentPlaying?.isPlaying;

            return (
              <div
                key={track.filename}
                id={`optimized-track-${track.filename}`}
                className={`group flex items-center justify-between p-3 rounded-lg border transition ${
                  isThisPlaying
                    ? 'bg-emerald-950/20 border-emerald-500/40'
                    : 'bg-zinc-950/40 border-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-5 text-center text-xs font-mono text-zinc-500">
                    {idx + 1}
                  </span>

                  <button
                    id={`btn-play-opt-${track.filename}`}
                    onClick={() => onPlayPreview('optimized', track.filename)}
                    className={`p-2 rounded-lg transition cursor-pointer ${
                      isThisPlaying
                        ? 'bg-emerald-500 text-black shadow-md'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                    }`}
                    title={isThisPlaying ? 'Pause' : 'Play track'}
                  >
                    {isThisPlaying ? (
                      <Pause className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-200 truncate">{track.filename}</p>
                    <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                      <span>{formatSize(track.size)}</span>
                      <span>•</span>
                      <span className="text-emerald-400/80 font-mono">AAC 96k</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pl-2">
                  <button
                    id={`btn-del-opt-${track.filename}`}
                    onClick={() => onDeleteTrack('optimized', track.filename)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition cursor-pointer"
                    title="Remove from playlist"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
