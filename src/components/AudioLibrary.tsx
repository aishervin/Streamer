import React, { useState, useRef } from 'react';
import { Upload, Music, Sparkles, Trash2, CheckCircle2, Clock, Play, Pause, Loader2, AlertCircle } from 'lucide-react';
import { TrackInfo } from '../types.ts';

interface AudioLibraryProps {
  rawTracks: TrackInfo[];
  isOptimizing: boolean;
  onOptimize: (removeOriginals: boolean) => Promise<void>;
  onUpload: (files: FileList | File[]) => Promise<void>;
  onGenerateDemo: () => Promise<void>;
  onDeleteTrack: (folder: 'raw' | 'optimized', filename: string) => Promise<void>;
  onPlayPreview: (folder: 'raw' | 'optimized', filename: string) => void;
  currentPlaying: { folder: string; filename: string; isPlaying: boolean } | null;
}

export const AudioLibrary: React.FC<AudioLibraryProps> = ({
  rawTracks,
  isOptimizing,
  onOptimize,
  onUpload,
  onGenerateDemo,
  onDeleteTrack,
  onPlayPreview,
  currentPlaying,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [removeOriginals, setRemoveOriginals] = useState(false);
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pendingCount = rawTracks.filter(t => !t.isOptimized).length;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await onUpload(e.dataTransfer.files);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await onUpload(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDemoClick = async () => {
    setIsGeneratingDemo(true);
    try {
      await onGenerateDemo();
    } finally {
      setIsGeneratingDemo(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div id="audio-library-panel" className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-6 flex flex-col h-full shadow-lg">
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Music className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              Raw Audio Library
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                music/ ({rawTracks.length})
              </span>
            </h2>
            <p className="text-xs text-zinc-400">Upload source songs before batch encoding to AAC 96k</p>
          </div>
        </div>

        <button
          id="btn-generate-demo-track"
          onClick={handleDemoClick}
          disabled={isGeneratingDemo}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 hover:border-zinc-600 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          title="Create a synthesized demo track using FFmpeg"
        >
          {isGeneratingDemo ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          )}
          Create Demo Track
        </button>
      </div>

      {/* Drag and Drop Zone */}
      <div
        id="dropzone-music"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-5 text-center transition cursor-pointer mb-5 ${
          isDragging
            ? 'border-cyan-400 bg-cyan-500/5'
            : 'border-zinc-700/80 hover:border-zinc-600 bg-zinc-950/40'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          accept=".mp3,.m4a,.aac,.ogg,.opus,.wav,.flac"
          className="hidden"
        />
        <div className="flex flex-col items-center justify-center gap-2 text-zinc-400">
          <Upload className={`w-7 h-7 ${isDragging ? 'text-cyan-400' : 'text-zinc-500'}`} />
          <p className="text-sm font-medium text-zinc-200">
            Drag & drop audio files here, or <span className="text-cyan-400 hover:underline">browse</span>
          </p>
          <p className="text-xs text-zinc-500">Supports MP3, M4A, AAC, OGG, OPUS, WAV, FLAC</p>
        </div>
      </div>

      {/* Optimize Controls */}
      <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              id="chk-remove-originals"
              checked={removeOriginals}
              onChange={e => setRemoveOriginals(e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            Remove raw file upon successful conversion (saves disk)
          </label>
        </div>

        <button
          id="btn-optimize-music"
          onClick={() => onOptimize(removeOriginals)}
          disabled={isOptimizing || rawTracks.length === 0}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-md shadow-cyan-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 cursor-pointer"
        >
          {isOptimizing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Optimizing with FFmpeg...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                Optimize {pendingCount > 0 ? `(${pendingCount} pending)` : 'All'}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Raw Tracks List */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[320px] custom-scrollbar">
        {rawTracks.length === 0 ? (
          <div className="h-36 flex flex-col items-center justify-center text-center p-4 border border-zinc-800/60 rounded-xl bg-zinc-950/20">
            <Music className="w-8 h-8 text-zinc-600 mb-2" />
            <p className="text-sm text-zinc-400 font-medium">No music files in library</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-xs">
              Upload your own audio tracks or click "Create Demo Track" above to test the streaming pipeline.
            </p>
          </div>
        ) : (
          rawTracks.map(track => {
            const isThisPlaying =
              currentPlaying?.folder === 'raw' &&
              currentPlaying?.filename === track.filename &&
              currentPlaying?.isPlaying;

            return (
              <div
                key={track.filename}
                id={`raw-track-${track.filename}`}
                className="group flex items-center justify-between p-3 rounded-lg bg-zinc-950/40 border border-zinc-800/80 hover:border-zinc-700 transition"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    id={`btn-play-raw-${track.filename}`}
                    onClick={() => onPlayPreview('raw', track.filename)}
                    className={`p-2 rounded-lg transition cursor-pointer ${
                      isThisPlaying
                        ? 'bg-cyan-500 text-black shadow-md'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                    }`}
                    title={isThisPlaying ? 'Pause' : 'Preview audio'}
                  >
                    {isThisPlaying ? (
                      <Pause className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-200 truncate">{track.filename}</p>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                      <span>{formatSize(track.size)}</span>
                      <span>•</span>
                      {track.isOptimized ? (
                        <span className="flex items-center gap-1 text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          Ready in music-optimized/
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-400 font-medium">
                          <Clock className="w-3 h-3" />
                          Needs conversion
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pl-2">
                  <button
                    id={`btn-del-raw-${track.filename}`}
                    onClick={() => onDeleteTrack('raw', track.filename)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition cursor-pointer"
                    title="Delete track"
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
