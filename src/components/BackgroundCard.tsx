import React, { useRef, useState } from 'react';
import { Image as ImageIcon, Upload, RefreshCw, Loader2, Sparkles } from 'lucide-react';

interface BackgroundCardProps {
  hasBackground: boolean;
  onUploadBackground: (file: File) => Promise<void>;
  onGenerateBackground: () => Promise<void>;
}

export const BackgroundCard: React.FC<BackgroundCardProps> = ({
  hasBackground,
  onUploadBackground,
  onGenerateBackground,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageTimestamp, setImageTimestamp] = useState(Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await onUploadBackground(e.target.files[0]);
      setImageTimestamp(Date.now());
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await onGenerateBackground();
      setImageTimestamp(Date.now());
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div id="background-card-panel" className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-6 flex flex-col shadow-lg">
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Broadcast Canvas</h2>
            <p className="text-xs text-zinc-400">assets/background.jpg (640×360 @ 2fps)</p>
          </div>
        </div>

        <button
          id="btn-generate-bg"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          title="Reset to default black 640x360"
        >
          {isGenerating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
          )}
          Reset Default
        </button>
      </div>

      <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-zinc-800 flex items-center justify-center group mb-4">
        {hasBackground ? (
          <img
            src={`/api/background?t=${imageTimestamp}`}
            alt="Stream background preview"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-center p-4">
            <ImageIcon className="w-8 h-8 text-zinc-600 mx-auto mb-1" />
            <p className="text-xs text-zinc-500">No background image found</p>
          </div>
        )}

        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
          <button
            id="btn-upload-bg-overlay"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-zinc-900 shadow-md flex items-center gap-1.5 cursor-pointer hover:bg-zinc-200 transition"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload New Image
          </button>
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>Video Bitrate: ~80 kbps</span>
        <span className="text-zinc-500">Still image profile</span>
      </div>
    </div>
  );
};
