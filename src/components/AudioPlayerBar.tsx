import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, X, Disc } from 'lucide-react';

interface AudioPlayerBarProps {
  currentTrack: { folder: string; filename: string } | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onClose: () => void;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  currentTrack,
  isPlaying,
  onTogglePlay,
  onClose,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    const audio = audioRef.current;
    audio.src = `/api/audio/${currentTrack.folder}/${encodeURIComponent(currentTrack.filename)}`;
    if (isPlaying) {
      audio.play().catch(() => {});
    }
  }, [currentTrack]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  if (!currentTrack) return null;

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (!duration && audioRef.current.duration) {
        setDuration(audioRef.current.duration);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      id="audio-player-bar"
      className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800 px-6 py-3 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4"
    >
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => onTogglePlay()}
      />

      {/* Track Info */}
      <div className="flex items-center gap-3 min-w-0 max-w-sm">
        <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
          <Disc className={`w-5 h-5 ${isPlaying ? 'animate-spin' : ''}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-zinc-100 truncate">{currentTrack.filename}</p>
          <p className="text-[10px] text-zinc-400">
            Source: <span className="font-mono text-cyan-400">{currentTrack.folder}/</span>
          </p>
        </div>
      </div>

      {/* Center Controls & Scrubber */}
      <div className="flex flex-col items-center gap-1.5 w-full max-w-md">
        <div className="flex items-center gap-4">
          <button
            id="player-play-btn"
            onClick={onTogglePlay}
            className="p-2 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black shadow-md transition cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>
        </div>

        <div className="w-full flex items-center gap-2 text-[11px] font-mono text-zinc-400">
          <span className="w-8 text-right">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <span className="w-8">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Volume & Dismiss */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={e => {
              setVolume(parseFloat(e.target.value));
              if (isMuted) setIsMuted(false);
            }}
            className="w-20 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition cursor-pointer"
          title="Close player"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
