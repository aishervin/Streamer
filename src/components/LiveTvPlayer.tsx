import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Tv,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Radio,
  RadioTower,
  Sparkles,
  ExternalLink,
  Send,
  Square,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Settings,
  HelpCircle,
  Gauge,
  Check,
  Info,
  Layers
} from 'lucide-react';
import { LiveTvChannel, StreamStatus } from '../types';

interface LiveTvPlayerProps {
  streamStatus: StreamStatus;
  onRefreshStatus: () => void;
  onShowLogs?: () => void;
}

const DEFAULT_CHANNELS: LiveTvChannel[] = [
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

export const LiveTvPlayer: React.FC<LiveTvPlayerProps> = ({
  streamStatus,
  onRefreshStatus,
}) => {
  const [channels] = useState<LiveTvChannel[]>(DEFAULT_CHANNELS);
  const [selectedChannel, setSelectedChannel] = useState<LiveTvChannel>(DEFAULT_CHANNELS[0]);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.8);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState<string>('');
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);

  // Player HLS levels state
  const [availableLevels, setAvailableLevels] = useState<{ index: number; height: number; bitrate: number }[]>([]);
  const [currentLevelIndex, setCurrentLevelIndex] = useState<number>(-1); // -1 = Auto
  const [showQualityMenu, setShowQualityMenu] = useState<boolean>(false);
  const [showPmcExplainer, setShowPmcExplainer] = useState<boolean>(false);

  // Telegram Relay State
  const [relayQuality, setRelayQuality] = useState<'480p' | '720p' | '1080p'>('480p');
  const [destination, setDestination] = useState<'channel' | 'group' | 'custom'>('channel');
  const [customRtmp, setCustomRtmp] = useState<string>('');
  const [isRelaying, setIsRelaying] = useState<boolean>(false);
  const [relayMessage, setRelayMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Active stream URL
  const currentStreamUrl = isCustomMode && customUrl.trim()
    ? customUrl.trim()
    : selectedChannel.streamUrl;

  // Initialize and attach HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setPlayerError(null);
    setAvailableLevels([]);
    setCurrentLevelIndex(-1);
    setShowQualityMenu(false);

    // Destroy existing Hls instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });

      hlsRef.current = hls;
      hls.loadSource(currentStreamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        if (data.levels && data.levels.length > 0) {
          const lvls = data.levels.map((lvl, idx) => ({
            index: idx,
            height: lvl.height || 0,
            bitrate: lvl.bitrate || 0,
          }));
          setAvailableLevels(lvls);
        } else {
          setAvailableLevels([]);
        }

        video.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          setIsPlaying(false);
        });
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentLevelIndex(hls.autoLevelEnabled ? -1 : data.level);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setPlayerError('خطای ارتباط شبکه یا مسدود بودن استریم');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setPlayerError('خطای رمزگشایی مدیا، تلاش مجدد...');
              hls.recoverMediaError();
              break;
            default:
              setPlayerError('امکان پخش استریم وجود ندارد');
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Safari HLS
      video.src = currentStreamUrl;
      video.addEventListener('loadedmetadata', () => {
        video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      });
    } else {
      setPlayerError('مرورگر شما از فرمت HLS (m3u8) پشتیبانی نمی‌کند.');
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentStreamUrl]);

  // Volume & Mute sync
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Change HLS player level
  const handleSelectPlayerLevel = (levelIndex: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = levelIndex;
    setCurrentLevelIndex(levelIndex);
    setShowQualityMenu(false);
  };

  // Start Relaying live TV channel to Telegram Live
  const handleStartRelay = async () => {
    setIsRelaying(true);
    setRelayMessage(null);
    try {
      const channelDisplayName = isCustomMode
        ? 'Custom TV Stream'
        : selectedChannel.name;

      const res = await fetch('/api/stream/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          customUrl: destination === 'custom' ? customRtmp : undefined,
          sourceType: 'live_tv',
          liveStreamUrl: currentStreamUrl,
          channelName: channelDisplayName,
          quality: relayQuality,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start live TV relay');
      }

      setRelayMessage(`پخش زنده ${channelDisplayName} با کیفیت ${relayQuality} روی تلگرام آغاز شد!`);
      onRefreshStatus();
    } catch (err: any) {
      setRelayMessage(`خطا: ${err.message}`);
    } finally {
      setIsRelaying(false);
    }
  };

  // Stop Streaming
  const handleStopRelay = async () => {
    setIsRelaying(true);
    setRelayMessage(null);
    try {
      const res = await fetch('/api/stream/stop', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to stop stream');
      setRelayMessage('استریم زنده با موفقیت متوقف شد.');
      onRefreshStatus();
    } catch (err: any) {
      setRelayMessage(`خطا: ${err.message}`);
    } finally {
      setIsRelaying(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl" id="live-tv-container">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4 bg-slate-900/90">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-rose-500/20">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-wide">
                پخش زنده تصویری و شبکه‌های موسیقی
              </h2>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                LIVE IPTV
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              مشاهده مستقیم PMC، رادیو جوان + امکان تبدیل خودکار به کیفیت ۴۸۰p/۷۲۰p و رله بدون لگ به لایو تلگرام
            </p>
          </div>
        </div>

        {/* Quick Relay Status Badge */}
        {streamStatus.isStreaming && (
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs text-emerald-300">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>
              استریم تلگرام فعال:{' '}
              <strong className="text-white">
                {streamStatus.channelName || streamStatus.sourceType || 'پلی‌لیست'}
              </strong>
              {streamStatus.quality && (
                <span className="mr-1.5 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 font-mono text-[10px] border border-emerald-400/30">
                  {streamStatus.quality}
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Main Grid: Player on Left, Channels & Relay Controls on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
        {/* Video Player Column */}
        <div className="lg:col-span-7 bg-black p-4 flex flex-col justify-between">
          <div
            ref={containerRef}
            className="relative w-full aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center group"
          >
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              playsInline
              onClick={togglePlay}
            />

            {/* Error Overlay */}
            {playerError && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
                <AlertCircle className="w-10 h-10 text-rose-400 mb-2" />
                <p className="text-sm font-semibold text-white mb-1">خطا در پخش استریم</p>
                <p className="text-xs text-slate-400 mb-4">{playerError}</p>
                <button
                  onClick={() => {
                    const video = videoRef.current;
                    if (video && hlsRef.current) {
                      hlsRef.current.loadSource(currentStreamUrl);
                      hlsRef.current.attachMedia(video);
                    }
                  }}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-medium flex items-center gap-2 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  تلاش مجدد
                </button>
              </div>
            )}

            {/* Live Watermark Overlay */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-2 pointer-events-none">
              <span className="bg-black/60 backdrop-blur-md text-white text-xs font-bold px-2.5 py-1 rounded-md border border-white/10 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                {isCustomMode ? 'CUSTOM STREAM' : selectedChannel.name}
              </span>
              <span className="bg-black/60 backdrop-blur-md text-slate-300 text-[11px] font-medium px-2 py-1 rounded-md border border-white/10">
                {selectedChannel.quality}
              </span>
            </div>

            {/* In-Player Quality Switcher Menu */}
            {showQualityMenu && (
              <div className="absolute bottom-14 right-3 bg-slate-900/95 border border-slate-700/80 rounded-xl p-2.5 shadow-2xl backdrop-blur-md z-30 min-w-[190px] text-xs text-right">
                <div className="text-[11px] font-bold text-slate-300 pb-1.5 mb-1.5 border-b border-slate-800 flex items-center justify-between">
                  <span>کیفیت پخش پلیر داخلی</span>
                  <Settings className="w-3.5 h-3.5 text-slate-400" />
                </div>

                {availableLevels.length > 1 ? (
                  <div className="space-y-1">
                    <button
                      onClick={() => handleSelectPlayerLevel(-1)}
                      className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-right transition ${
                        currentLevelIndex === -1
                          ? 'bg-rose-600 text-white font-bold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>خودکار (Auto)</span>
                      {currentLevelIndex === -1 && <Check className="w-3.5 h-3.5" />}
                    </button>
                    {availableLevels.map(lvl => (
                      <button
                        key={lvl.index}
                        onClick={() => handleSelectPlayerLevel(lvl.index)}
                        className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-right transition ${
                          currentLevelIndex === lvl.index
                            ? 'bg-rose-600 text-white font-bold'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span>{lvl.height}p</span>
                        {currentLevelIndex === lvl.index && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-1 space-y-1.5">
                    <div className="flex items-center justify-between text-emerald-400 font-semibold">
                      <span>۱۰۸۰p Full HD اصلی</span>
                      <Check className="w-3.5 h-3.5" />
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      سورس ماهواره‌ای WNS شبکه PMC به‌صورت تک‌کیفیت ارسال می‌شود.
                    </p>
                    <div className="pt-1 border-t border-slate-800 text-[10px] text-rose-300 font-medium">
                      💡 برای پخش روان در تلگرام، در کادر روبرو کیفیت ۴۸۰p یا ۷۲۰p را انتخاب کنید.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Controls Bar */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-between gap-3 opacity-90 group-hover:opacity-100 transition z-10">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
                  title={isPlaying ? 'توقف' : 'پخش'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
                </button>

                {/* Volume & Mute */}
                <div className="flex items-center gap-1.5 bg-white/10 px-2 py-1 rounded-lg">
                  <button
                    onClick={toggleMute}
                    className="text-white hover:text-rose-400 transition"
                    title={isMuted ? 'صدادار' : 'بی‌صدا'}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-4 h-4" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-16 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-rose-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Quality / Settings Button */}
                <button
                  onClick={() => setShowQualityMenu(!showQualityMenu)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                    showQualityMenu
                      ? 'bg-rose-600 text-white'
                      : 'bg-white/10 hover:bg-white/20 text-slate-200'
                  }`}
                  title="کیفیت و رزولوشن سورس"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>
                    {availableLevels.length > 1
                      ? currentLevelIndex === -1
                        ? 'Auto'
                        : `${availableLevels[currentLevelIndex]?.height}p`
                      : '1080p'}
                  </span>
                </button>

                <button
                  onClick={toggleFullscreen}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
                  title="تمام صفحه"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Current Channel Info */}
          <div className="mt-3 px-2 py-1.5 flex items-center justify-between text-xs text-slate-400">
            <div>
              <span className="text-white font-medium">{selectedChannel.nameFa}</span> —{' '}
              <span>{selectedChannel.description}</span>
            </div>
            <a
              href={currentStreamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-slate-200 flex items-center gap-1 shrink-0 ml-2"
              title="لینک مستقیم استریم"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              لینک m3u8
            </a>
          </div>

          {/* Why PMC is 1080p source Info Box */}
          <div className="mt-2.5 p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs">
            <button
              onClick={() => setShowPmcExplainer(!showPmcExplainer)}
              className="w-full flex items-center justify-between text-right text-slate-300 hover:text-white transition"
            >
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-semibold text-slate-200">
                  چرا شبکه PMC کیفیت متغیر ۳۶۰p یا ۴۸۰p در وب ندارد؟
                </span>
              </div>
              <span className="text-[11px] text-amber-400 font-mono">
                {showPmcExplainer ? '▲ بستن' : '▼ مشاهده دلیل و راهکار'}
              </span>
            </button>

            {showPmcExplainer && (
              <div className="mt-2.5 pt-2.5 border-t border-slate-800 space-y-2 text-slate-400 leading-relaxed">
                <p>
                  سرور آپلینک ماهواره‌ای PMC (متعلق به شبکه ماهواره‌ای WNS در آدرس{' '}
                  <code className="text-amber-300 font-mono text-[11px]">pmcrohls.wns.live</code>
                  )، این استریم را مستقیماً از ترانسپاندر ماهواره بدون انکود پلکانی (ABR Ladder) به صورت تک‌استریم با کیفیت اصلی{' '}
                  <strong className="text-white">1080p Full HD</strong> منتشر می‌کند؛ بنابراین فایل m3u8 منبع، کیفیت‌های پایین‌تر ندارد.
                </p>
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>راهکار سیستم ما برای تلگرام:</strong> سرور استریم ما مجهز به انکودر لحظه‌ای FFmpeg است.
                    هنگامی که این شبکه را به لایو تلگرام ارسال می‌کنید، می‌توانید کیفیت را روی{' '}
                    <strong className="text-white">۴۸۰p (فوق‌العاده روان و بدون لگ)</strong> یا{' '}
                    <strong className="text-white">۷۲۰p (HD متوازن)</strong> قرار دهید تا سرور ویدیو را فشرده و بدون هیچ بافری به تلگرام بفرستد!
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Channels & Telegram Relay Column */}
        <div className="lg:col-span-5 p-5 border-t lg:border-t-0 lg:border-r border-slate-800 bg-slate-900/60 flex flex-col justify-between space-y-5">
          {/* Channel Selector */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <RadioTower className="w-3.5 h-3.5 text-rose-400" />
              انتخاب شبکه تلویزیونی برای مشاهده و رله
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
              {channels.map(ch => {
                const isSelected = !isCustomMode && selectedChannel.id === ch.id;
                return (
                  <button
                    key={ch.id}
                    onClick={() => {
                      setIsCustomMode(false);
                      setSelectedChannel(ch);
                    }}
                    className={`text-right p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-rose-500/10 border-rose-500/40 text-white shadow-sm shadow-rose-500/10'
                        : 'bg-slate-800/40 hover:bg-slate-800 border-slate-700/60 text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{ch.name}</span>
                        {ch.badge && (
                          <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.2 rounded font-medium">
                            {ch.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{ch.nameFa}</p>
                    </div>

                    <div className="text-left shrink-0">
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                        {ch.quality}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom URL Input Toggle */}
            <div className="mt-3">
              <button
                onClick={() => setIsCustomMode(!isCustomMode)}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
              >
                <Sliders className="w-3.5 h-3.5" />
                {isCustomMode ? 'بازگشت به شبکه‌های پیش‌فرض' : 'افزودن لینک سفارشی شبکه (M3U8)'}
              </button>

              {isCustomMode && (
                <div className="mt-2 space-y-2">
                  <input
                    type="url"
                    placeholder="https://example.com/live/stream.m3u8"
                    value={customUrl}
                    onChange={e => setCustomUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    هر آدرس HLS / M3U8 زنده را وارد کنید تا مستقیماً پخش و آماده رله شود.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Telegram Live Relay Box */}
          <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  رله مستقیم به لایو تلگرام
                </h4>
              </div>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-medium">
                تنظیمات ضد لگ (Anti-Lag)
              </span>
            </div>

            {/* Quality Selector for Relay (Solves 1080p lag issues completely) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                  کیفیت خروجی لایو تلگرام (حل قطعی بافر و لگ):
                </span>
                <span className="text-[10px] text-cyan-400 font-mono">
                  {relayQuality === '480p'
                    ? '854×480 • 500kbps'
                    : relayQuality === '720p'
                    ? '1280×720 • 950kbps'
                    : '1920×1080 • 1800kbps'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setRelayQuality('480p')}
                  className={`py-2 px-2 rounded-xl border text-center font-medium transition flex flex-col items-center justify-center gap-0.5 ${
                    relayQuality === '480p'
                      ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-200 shadow-sm shadow-cyan-500/20'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-xs text-white">480p</span>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1 rounded">
                      پیشنهادی
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">بسیار روان و ضد لگ</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRelayQuality('720p')}
                  className={`py-2 px-2 rounded-xl border text-center font-medium transition flex flex-col items-center justify-center gap-0.5 ${
                    relayQuality === '720p'
                      ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-200 shadow-sm shadow-cyan-500/20'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="font-bold text-xs text-white">720p HD</span>
                  <span className="text-[10px] text-slate-400">کیفیت استاندارد</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRelayQuality('1080p')}
                  className={`py-2 px-2 rounded-xl border text-center font-medium transition flex flex-col items-center justify-center gap-0.5 ${
                    relayQuality === '1080p'
                      ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-200 shadow-sm shadow-cyan-500/20'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="font-bold text-xs text-white">1080p FHD</span>
                  <span className="text-[10px] text-slate-400">سورس اصلی</span>
                </button>
              </div>
            </div>

            {/* Destination Selection */}
            <div className="space-y-1 pt-1">
              <span className="text-xs text-slate-400">مقصد ارسال استریم تلگرام:</span>
              <div className="grid grid-cols-3 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setDestination('channel')}
                  className={`py-1.5 px-2 rounded-lg border text-center font-medium transition ${
                    destination === 'channel'
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  کانال تلگرام
                </button>
                <button
                  type="button"
                  onClick={() => setDestination('group')}
                  className={`py-1.5 px-2 rounded-lg border text-center font-medium transition ${
                    destination === 'group'
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  گروه تلگرام
                </button>
                <button
                  type="button"
                  onClick={() => setDestination('custom')}
                  className={`py-1.5 px-2 rounded-lg border text-center font-medium transition ${
                    destination === 'custom'
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  آدرس دلخواه
                </button>
              </div>
            </div>

            {destination === 'custom' && (
              <input
                type="text"
                placeholder="rtmps://dc4-1.rtmp.t.me/s/..."
                value={customRtmp}
                onChange={e => setCustomRtmp(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 font-mono"
              />
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex items-center gap-2">
              {streamStatus.isStreaming ? (
                <button
                  type="button"
                  disabled={isRelaying}
                  onClick={handleStopRelay}
                  className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 transition disabled:opacity-50"
                >
                  <Square className="w-3.5 h-3.5 fill-white" />
                  {isRelaying ? 'در حال توقف...' : 'توقف استریم زنده تلگرام'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isRelaying}
                  onClick={handleStartRelay}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isRelaying ? (
                    'در حال راه‌اندازی رله...'
                  ) : (
                    <span>
                      پخش زنده{' '}
                      <strong>{isCustomMode ? 'این شبکه' : selectedChannel.name}</strong> ({relayQuality}) در تلگرام
                    </span>
                  )}
                </button>
              )}
            </div>

            {relayMessage && (
              <div
                className={`p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
                  relayMessage.includes('خطا')
                    ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                    : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                }`}
              >
                {relayMessage.includes('خطا') ? (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                )}
                <span>{relayMessage}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

