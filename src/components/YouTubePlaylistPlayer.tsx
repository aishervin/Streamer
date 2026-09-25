import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize2,
  Sliders,
  Settings,
  Check,
  RefreshCw,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Search,
  Trash2,
  Repeat,
  Shuffle,
  Info,
  ListMusic,
  Sparkles,
  ArrowRight,
  Radio,
  Tv,
  Clock,
  Send,
  Square,
  AlertCircle
} from 'lucide-react';
import { YouTubePlaylistData, YouTubePlaylistItem, StreamStatus } from '../types';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YouTubePlaylistPlayerProps {
  streamStatus: StreamStatus;
  onRefreshStatus?: () => void;
}

const YouTubeIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

interface QualityOption {
  id: string;
  label: string;
  desc: string;
  badge: string;
  iconColor: string;
}

const QUALITY_OPTIONS: QualityOption[] = [
  { id: 'hd1080', label: '1080p Full HD', desc: 'بالاترین کیفیت و بیشترین وضوح و شارپنس تصویر', badge: '۱۰۸۰p', iconColor: 'text-purple-400' },
  { id: 'hd720', label: '720p HD', desc: 'کیفیت عالی اچ‌دی و مصرف بهینه اینترنت', badge: '۷۲۰p', iconColor: 'text-blue-400' },
  { id: 'large', label: '480p SD', desc: 'کیفیت استاندارد بدون لگ، مناسب اکثر اتصالات', badge: '۴۸۰p', iconColor: 'text-emerald-400' },
  { id: 'medium', label: '360p Data Saver', desc: 'کیفیت مناسب و روان برای کاهش مصرف بسته', badge: '۳۶۰p', iconColor: 'text-amber-400' },
  { id: 'small', label: '240p Low Data', desc: 'کیفیت سبک جهت پخش بدون قطعی در نت ضعیف', badge: '۲۴۰p', iconColor: 'text-orange-400' },
  { id: 'tiny', label: '144p Ultra Low', desc: 'حداقل مصرف دیتا برای شنیدن صدا در نت بسیار کند', badge: '۱۴۴p', iconColor: 'text-zinc-400' },
  { id: 'auto', label: 'کیفیت خودکار (Auto)', desc: 'تطبیق اتوماتیک رزولوشن با پهنای باند لحظه‌ای', badge: 'Auto', iconColor: 'text-cyan-400' },
];

interface PresetPlaylist {
  id: string;
  title: string;
  titleFa: string;
  category: string;
  author: string;
  description: string;
  thumbnailUrl: string;
  badge?: string;
}

const DEFAULT_PRESETS: PresetPlaylist[] = [
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

export const YouTubePlaylistPlayer: React.FC<YouTubePlaylistPlayerProps> = ({
  streamStatus,
  onRefreshStatus,
}) => {
  // Input and active playlist
  const [inputUrl, setInputUrl] = useState<string>('');
  const [currentPlaylistId, setCurrentPlaylistId] = useState<string>('PLDIoUOhQQPlXr63I_vwF9GD8sAKh77dWU');
  const [currentType, setCurrentType] = useState<'playlist' | 'video'>('playlist');
  const [activeVideoId, setActiveVideoId] = useState<string>('');
  const [playlistData, setPlaylistData] = useState<YouTubePlaylistData | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Player controls state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPlayerReady, setIsPlayerReady] = useState<boolean>(false);
  const [selectedQuality, setSelectedQuality] = useState<string>('hd720');
  const [activeQuality, setActiveQuality] = useState<string>('hd720');
  const [showQualityMenu, setShowQualityMenu] = useState<boolean>(false);
  const [showQualityInfo, setShowQualityInfo] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [isShuffling, setIsShuffling] = useState<boolean>(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [currentTrackTitle, setCurrentTrackTitle] = useState<string>('');
  const [currentTrackAuthor, setCurrentTrackAuthor] = useState<string>('');
  const [showTracklistDrawer, setShowTracklistDrawer] = useState<boolean>(true);
  const [trackSearchQuery, setTrackSearchQuery] = useState<string>('');

  // Saved playlists in localStorage
  const [savedPlaylists, setSavedPlaylists] = useState<{ id: string; title: string; count: number }[]>(() => {
    try {
      const saved = localStorage.getItem('yt_saved_playlists');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Telegram Relay state for YouTube stream
  const [relayQuality, setRelayQuality] = useState<'480p' | '720p' | '1080p'>('720p');
  const [destination, setDestination] = useState<'channel' | 'group' | 'custom'>('channel');
  const [customRtmp, setCustomRtmp] = useState<string>('');
  const [isRelaying, setIsRelaying] = useState<boolean>(false);
  const [relayMessage, setRelayMessage] = useState<string | null>(null);

  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Save to localStorage when savedPlaylists changes
  useEffect(() => {
    try {
      localStorage.setItem('yt_saved_playlists', JSON.stringify(savedPlaylists));
    } catch {
      // ignore
    }
  }, [savedPlaylists]);

  // Load YouTube Iframe API Script
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // Fetch playlist metadata from server
  const fetchPlaylistDetails = useCallback(async (query: string) => {
    setIsLoadingMetadata(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/youtube/info?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (res.ok && data.id) {
        setPlaylistData(data);
        setCurrentType(data.type);
        setCurrentPlaylistId(data.id);
        if (data.items && data.items.length > 0) {
          setCurrentTrackTitle(data.items[0].title);
          setCurrentTrackAuthor(data.items[0].author);
          setActiveVideoId(data.items[0].id);
        }
      } else {
        setErrorMessage(data.error || 'پلی‌لیست یافت نشد. شناسه یا لینک را بررسی کنید.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'خطا در ارتباط با سرور جهت دریافت جزئیات پلی‌لیست');
    } finally {
      setIsLoadingMetadata(false);
    }
  }, []);

  // Initialize or update YouTube Player
  const initPlayer = useCallback((playlistId: string, type: 'playlist' | 'video', initialVideoId?: string) => {
    if (!window.YT || !window.YT.Player) {
      setTimeout(() => initPlayer(playlistId, type, initialVideoId), 250);
      return;
    }

    const container = playerContainerRef.current;
    if (!container) return;

    const vId = initialVideoId || activeVideoId;

    // If player already exists and healthy, reuse loadVideoById or loadPlaylist
    if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
      try {
        if (vId) {
          playerRef.current.loadVideoById({
            videoId: vId,
            suggestedQuality: selectedQuality === 'auto' ? 'default' : selectedQuality,
          });
          playerRef.current.playVideo();
          setIsPlaying(true);
          return;
        } else if (type === 'playlist') {
          playerRef.current.loadPlaylist({
            list: playlistId,
            listType: 'playlist',
            index: 0,
            suggestedQuality: selectedQuality === 'auto' ? 'default' : selectedQuality,
          });
          playerRef.current.playVideo();
          setIsPlaying(true);
          return;
        }
      } catch (e) {
        console.warn('Failed to reuse player, recreating...', e);
      }
    }

    // Clean container and create fresh target div
    container.innerHTML = '<div id="yt-player-target" style="width:100%;height:100%"></div>';

    const playerVarsConfig: any = {
      autoplay: 1,
      controls: 1,
      rel: 0,
      modestbranding: 1,
      enablejsapi: 1,
      fs: 1,
      playsinline: 1,
      origin: window.location.origin,
    };

    if (type === 'playlist') {
      playerVarsConfig.list = playlistId;
      playerVarsConfig.listType = 'playlist';
    }

    const playerConfig: any = {
      width: '100%',
      height: '100%',
      playerVars: playerVarsConfig,
      events: {
        onReady: (event: any) => {
          setIsPlayerReady(true);
          try {
            event.target.setVolume(volume);
            if (isMuted) event.target.mute();
            else event.target.unMute();
            if (selectedQuality !== 'auto') {
              event.target.setPlaybackQuality(selectedQuality);
            }
            event.target.setLoop(isLooping);
            event.target.playVideo();
          } catch (e) {
            console.warn('onReady playVideo error:', e);
          }
        },
        onStateChange: (event: any) => {
          // 1 = PLAYING, 2 = PAUSED, 0 = ENDED, 3 = BUFFERING
          if (event.data === 1) {
            setIsPlaying(true);
            try {
              const videoData = event.target.getVideoData();
              if (videoData) {
                if (videoData.title) setCurrentTrackTitle(videoData.title);
                if (videoData.author) setCurrentTrackAuthor(videoData.author);
                if (videoData.video_id) setActiveVideoId(videoData.video_id);
              }
              const idx = event.target.getPlaylistIndex();
              if (typeof idx === 'number' && idx >= 0) {
                setCurrentTrackIndex(idx);
              }
              const q = event.target.getPlaybackQuality();
              if (q) setActiveQuality(q);
            } catch {
              // ignore
            }
          } else if (event.data === 2) {
            setIsPlaying(false);
          } else if (event.data === 0) {
            if (isLooping) {
              try { event.target.nextVideo(); } catch {}
            }
          }
        },
        onPlaybackQualityChange: (event: any) => {
          if (event.data) {
            setActiveQuality(event.data);
          }
        },
        onError: (event: any) => {
          console.warn('YouTube Player error event:', event.data);
          if (event.data === 150 || event.data === 101) {
            setErrorMessage('این ویدیو به دلیل محدودیت کپی‌رایت سازنده در وب‌سایت‌های خارجی مسدود است؛ در حال انتقال به ویدیوی بعدی...');
            setTimeout(() => {
              if (playerRef.current && typeof playerRef.current.nextVideo === 'function') {
                playerRef.current.nextVideo();
              }
            }, 1200);
          }
        },
      },
    };

    if (vId) {
      playerConfig.videoId = vId;
    }

    try {
      playerRef.current = new window.YT.Player('yt-player-target', playerConfig);
    } catch (createErr) {
      console.error('Failed to create YT.Player instance:', createErr);
    }
  }, [activeVideoId, selectedQuality, isLooping, volume, isMuted]);

  // Initial load
  useEffect(() => {
    fetchPlaylistDetails(currentPlaylistId);
    const timer = setTimeout(() => {
      initPlayer(currentPlaylistId, currentType);
    }, 500);

    return () => clearTimeout(timer);
  }, [fetchPlaylistDetails, initPlayer, currentPlaylistId, currentType]);

  // Handle Quality Selection
  const handleQualityChange = (qualityId: string) => {
    setSelectedQuality(qualityId);
    setShowQualityMenu(false);

    if (playerRef.current) {
      try {
        const targetQ = qualityId === 'auto' ? 'default' : qualityId;
        if (typeof playerRef.current.setPlaybackQuality === 'function') {
          playerRef.current.setPlaybackQuality(targetQ);
        }
        if (typeof playerRef.current.setPlaybackQualityRange === 'function') {
          playerRef.current.setPlaybackQualityRange(targetQ, targetQ);
        }
        // Force cue with quality if needed
        setActiveQuality(qualityId);
      } catch (err) {
        console.warn('Failed to set quality:', err);
      }
    }
  };

  // Play / Pause toggle
  const togglePlayPause = () => {
    if (!playerRef.current) {
      const vId = activeVideoId || playlistData?.items?.[currentTrackIndex]?.id || playlistData?.items?.[0]?.id;
      initPlayer(currentPlaylistId, currentType, vId);
      return;
    }
    try {
      if (isPlaying) {
        if (typeof playerRef.current.pauseVideo === 'function') {
          playerRef.current.pauseVideo();
        }
        setIsPlaying(false);
      } else {
        if (typeof playerRef.current.playVideo === 'function') {
          playerRef.current.playVideo();
        }
        setIsPlaying(true);
      }
    } catch (e) {
      console.warn('Play/pause toggle error:', e);
    }
  };

  // Next Video
  const handleNextVideo = () => {
    if (!playerRef.current) return;
    try {
      if (typeof playerRef.current.nextVideo === 'function') {
        playerRef.current.nextVideo();
        setIsPlaying(true);
      }
    } catch {
      // ignore
    }
  };

  // Previous Video
  const handlePrevVideo = () => {
    if (!playerRef.current) return;
    try {
      if (typeof playerRef.current.previousVideo === 'function') {
        playerRef.current.previousVideo();
        setIsPlaying(true);
      }
    } catch {
      // ignore
    }
  };

  // Play specific track by item & index
  const handlePlayTrack = (item: { id: string; title: string; author: string }, index: number) => {
    setCurrentTrackIndex(index);
    if (item.title) setCurrentTrackTitle(item.title);
    if (item.author) setCurrentTrackAuthor(item.author);
    if (item.id) setActiveVideoId(item.id);
    setIsPlaying(true);
    setErrorMessage(null);

    if (playerRef.current) {
      try {
        if (item.id && typeof playerRef.current.loadVideoById === 'function') {
          playerRef.current.loadVideoById({
            videoId: item.id,
            suggestedQuality: selectedQuality === 'auto' ? 'default' : selectedQuality,
          });
          playerRef.current.playVideo();
          return;
        } else if (typeof playerRef.current.playVideoAt === 'function') {
          playerRef.current.playVideoAt(index);
          playerRef.current.playVideo();
          return;
        }
      } catch (err) {
        console.warn('loadVideoById failed, reinitializing player:', err);
      }
    }

    initPlayer(currentPlaylistId, currentType, item.id);
  };

  // Volume Change
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (newVol > 0 && isMuted) {
      setIsMuted(false);
      playerRef.current?.unMute();
    }
    playerRef.current?.setVolume(newVol);
  };

  // Toggle Mute
  const toggleMute = () => {
    if (!playerRef.current) return;
    if (isMuted) {
      playerRef.current.unMute();
      playerRef.current.setVolume(volume || 50);
      setIsMuted(false);
    } else {
      playerRef.current.mute();
      setIsMuted(true);
    }
  };

  // Toggle Speed
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    playerRef.current?.setPlaybackRate(speed);
  };

  // Toggle Loop
  const toggleLoop = () => {
    const next = !isLooping;
    setIsLooping(next);
    playerRef.current?.setLoop(next);
  };

  // Toggle Shuffle
  const toggleShuffle = () => {
    const next = !isShuffling;
    setIsShuffling(next);
    playerRef.current?.setShuffle(next);
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!wrapperRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapperRef.current.requestFullscreen();
    }
  };

  // Handle URL Form Submit
  const handleLoadUrl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = inputUrl.trim();
    if (!query) return;

    await fetchPlaylistDetails(query);
    // Determine type and load
    const listMatch = query.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    const isPlaylist = Boolean(listMatch) || query.startsWith('PL') || query.startsWith('RD');
    const newId = listMatch ? listMatch[1] : query;
    initPlayer(newId, isPlaylist ? 'playlist' : 'video');
  };

  // Bookmark current playlist
  const handleBookmarkPlaylist = () => {
    if (!playlistData) return;
    const exists = savedPlaylists.some(p => p.id === playlistData.id);
    if (exists) {
      setSavedPlaylists(prev => prev.filter(p => p.id !== playlistData.id));
    } else {
      setSavedPlaylists(prev => [
        {
          id: playlistData.id,
          title: playlistData.title,
          count: playlistData.itemCount,
        },
        ...prev,
      ]);
    }
  };

  // Start Telegram Live Broadcast (streams the user playlist with background)
  const handleStartRelay = async () => {
    setIsRelaying(true);
    setRelayMessage(null);
    try {
      const res = await fetch('/api/stream/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          customUrl: destination === 'custom' ? customRtmp : undefined,
          sourceType: 'playlist',
          quality: relayQuality,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRelayMessage('استریم پلی‌لیست صوتی شما به صورت ۲۴/۷ روی تلگرام آغاز شد.');
        if (onRefreshStatus) onRefreshStatus();
      } else {
        setRelayMessage(data.error || 'خطا در برقراری استریم تلگرام');
      }
    } catch (err: any) {
      setRelayMessage(err.message || 'خطا در ارسال درخواست استریم');
    } finally {
      setIsRelaying(false);
    }
  };

  // Stop Telegram Live Relay
  const handleStopRelay = async () => {
    setIsRelaying(true);
    setRelayMessage(null);
    try {
      const res = await fetch('/api/stream/stop', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setRelayMessage('استریم و پخش زنده تلگرام با موفقیت متوقف شد.');
        if (onRefreshStatus) onRefreshStatus();
      } else {
        setRelayMessage(data.error || 'خطا در توقف استریم');
      }
    } catch (err: any) {
      setRelayMessage(err.message || 'خطا در متوقف کردن استریم');
    } finally {
      setIsRelaying(false);
    }
  };

  // Reset Stream Completely
  const handleResetRelay = async () => {
    setIsRelaying(true);
    setRelayMessage(null);
    try {
      await fetch('/api/stream/stop', { method: 'POST' });
      setRelayMessage('استریم با موفقیت ریست شد و کلیه پروسه‌های فعال متوقف شدند.');
      if (onRefreshStatus) onRefreshStatus();
    } catch (err: any) {
      setRelayMessage(err.message || 'خطا در ریست استریم');
    } finally {
      setIsRelaying(false);
    }
  };

  // Filtered tracks in drawer
  const filteredItems = (playlistData?.items || []).filter(item => {
    if (!trackSearchQuery.trim()) return true;
    const q = trackSearchQuery.toLowerCase();
    return item.title.toLowerCase().includes(q) || item.author.toLowerCase().includes(q);
  });

  const activeQualityInfo = QUALITY_OPTIONS.find(q => q.id === selectedQuality) || QUALITY_OPTIONS[1];

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-950/40 via-zinc-900 to-zinc-900 border border-red-500/20 p-5 shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center text-white shadow-lg shadow-red-600/30">
              <YouTubeIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  پخش‌کننده حرفه‌ای پلی‌لیست‌های یوتیوب
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-red-400" />
                  کیفیت قابل تنظیم
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
                  ۱۰۸۰p / ۷۲۰p / ۴۸۰p / ۳۶۰p
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
                پلی‌لیست دلخواه خود را اضافه کنید، کیفیت ویدیو را آزادانه انتخاب کنید، بین ترک‌ها جابه‌جا شوید و بدون وقفه از گوش دادن لذت ببرید.
              </p>
            </div>
          </div>

          {/* Quick Quality Indicator Pill */}
          <div className="flex items-center gap-2 bg-zinc-950/80 px-3.5 py-2 rounded-xl border border-zinc-800">
            <Sliders className="w-4 h-4 text-red-400" />
            <div className="text-right">
              <div className="text-[10px] text-zinc-400">کیفیت فعال:</div>
              <div className="text-xs font-bold text-red-300 font-mono flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {activeQualityInfo.label}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Input URL Bar */}
      <div className="bg-zinc-900/90 rounded-2xl border border-zinc-800 p-4 shadow-xl">
        <form onSubmit={handleLoadUrl} className="flex flex-col sm:flex-row items-stretch gap-2.5">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-zinc-400">
              <YouTubeIcon className="w-4 h-4 text-red-500" />
            </div>
            <input
              type="text"
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              placeholder="لینک پلی‌لیست یا ویدیوی یوتیوب را وارد کنید (مثال: https://www.youtube.com/playlist?list=...)"
              className="w-full pl-24 pr-10 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700/80 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition dir-ltr font-mono"
            />
            {inputUrl && (
              <button
                type="button"
                onClick={() => setInputUrl('')}
                className="absolute inset-y-0 left-2 px-2 flex items-center text-xs text-zinc-400 hover:text-zinc-200"
              >
                پاک کردن
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isLoadingMetadata || !inputUrl.trim()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 transition cursor-pointer"
            >
              {isLoadingMetadata ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>در حال دریافت...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>بارگذاری و پخش</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleBookmarkPlaylist}
              title="ذخیره در لیست‌های من"
              disabled={!playlistData}
              className={`p-2.5 rounded-xl border transition ${
                playlistData && savedPlaylists.some(p => p.id === playlistData.id)
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
              }`}
            >
              {playlistData && savedPlaylists.some(p => p.id === playlistData.id) ? (
                <BookmarkCheck className="w-4 h-4" />
              ) : (
                <Bookmark className="w-4 h-4" />
              )}
            </button>
          </div>
        </form>

        {errorMessage && (
          <div className="mt-3 p-3 rounded-xl bg-red-950/70 border border-red-500/30 flex items-center gap-2 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Curated Presets Pills */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
          <span className="flex items-center gap-1.5 font-semibold text-zinc-300">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            پلی‌لیست‌های گلچین و پرطرفدار (یک‌کلیک برای پخش):
          </span>
          {savedPlaylists.length > 0 && (
            <span className="text-[11px] text-zinc-400">
              {savedPlaylists.length} پلی‌لیست شخصی ذخیره شده
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {DEFAULT_PRESETS.map(preset => {
            const isSelected = currentPlaylistId === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => {
                  setCurrentPlaylistId(preset.id);
                  setCurrentType('playlist');
                  fetchPlaylistDetails(preset.id);
                  initPlayer(preset.id, 'playlist');
                }}
                className={`p-3 rounded-xl border text-right transition flex flex-col justify-between gap-2 text-xs cursor-pointer ${
                  isSelected
                    ? 'bg-red-950/40 border-red-500/50 shadow-md shadow-red-950/50 text-white'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    isSelected ? 'bg-red-500/30 text-red-200' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {preset.badge || 'پلی‌لیست'}
                  </span>
                  <YouTubeIcon className={`w-3.5 h-3.5 ${isSelected ? 'text-red-400' : 'text-zinc-500'}`} />
                </div>
                <div>
                  <div className="font-bold text-xs line-clamp-1">{preset.titleFa}</div>
                  <div className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">{preset.category}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Video & Playlist Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Cols: Video Player & Control Bar */}
        <div className="lg:col-span-2 space-y-4">
          {/* Video Container */}
          <div
            ref={wrapperRef}
            className="relative rounded-2xl overflow-hidden bg-black border border-zinc-800 shadow-2xl group aspect-video"
          >
            {/* The slot where YouTube Iframe attaches */}
            <div ref={playerContainerRef} className="w-full h-full">
              <div id="yt-player-target" className="w-full h-full" />
            </div>

            {/* Centered Play Button Overlay if not playing */}
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <button
                  type="button"
                  onClick={togglePlayPause}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-red-600/90 hover:bg-red-500 text-white flex items-center justify-center shadow-2xl transition-all duration-200 hover:scale-110 pointer-events-auto cursor-pointer border-2 border-white/20"
                  title="شروع پخش ویدیو"
                >
                  <Play className="w-8 h-8 sm:w-9 sm:h-9 fill-current ml-1" />
                </button>
              </div>
            )}

            {/* Overlaid Quality Badge (Top Left) */}
            <div className="absolute top-3 left-3 z-10 pointer-events-auto">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowQualityMenu(prev => !prev)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-950/85 backdrop-blur-md border border-zinc-700/80 hover:border-red-500/60 text-xs font-mono font-bold text-zinc-200 flex items-center gap-2 shadow-lg transition cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-red-400" />
                  <span>{activeQualityInfo.badge}</span>
                  <span className="text-[10px] text-zinc-400">کیفیت</span>
                </button>

                {/* Quality Switcher Dropdown */}
                {showQualityMenu && (
                  <div className="absolute left-0 mt-2 w-72 rounded-xl bg-zinc-900/95 backdrop-blur-md border border-zinc-700 shadow-2xl p-2 z-50 space-y-1">
                    <div className="px-2.5 py-1.5 text-[11px] font-bold text-zinc-400 border-b border-zinc-800 flex items-center justify-between">
                      <span>انتخاب کیفیت پخش (رزولوشن)</span>
                      <button
                        onClick={() => setShowQualityInfo(prev => !prev)}
                        className="text-red-400 hover:text-red-300"
                        title="راهنما"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="max-h-64 overflow-y-auto space-y-1 py-1">
                      {QUALITY_OPTIONS.map(opt => {
                        const isChosen = selectedQuality === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleQualityChange(opt.id)}
                            className={`w-full text-right px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition cursor-pointer ${
                              isChosen
                                ? 'bg-red-600/20 text-white border border-red-500/30'
                                : 'text-zinc-300 hover:bg-zinc-800/80'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {isChosen ? (
                                <Check className="w-3.5 h-3.5 text-red-400 shrink-0" />
                              ) : (
                                <span className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <div>
                                <div className="font-bold text-xs flex items-center gap-1.5">
                                  <span>{opt.label}</span>
                                  <span className={`text-[9px] px-1 rounded font-mono ${opt.iconColor} bg-zinc-800`}>
                                    {opt.badge}
                                  </span>
                                </div>
                                <div className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                                  {opt.desc}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Track Info Badge (Top Right) */}
            <div className="absolute top-3 right-3 z-10 pointer-events-none">
              <div className="px-3 py-1.5 rounded-lg bg-zinc-950/80 backdrop-blur-md border border-zinc-800 text-[11px] font-mono text-zinc-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span>
                  قطعه {currentTrackIndex + 1} از {playlistData?.itemCount || 1}
                </span>
              </div>
            </div>
          </div>

          {/* Quality Explainer Box (if toggled) */}
          {showQualityInfo && (
            <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-red-400">
                <Info className="w-4 h-4" />
                <span>نحوه عملکرد تغییر کیفیت در پلیر یوتیوب (DASH Streaming):</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                یوتیوب با استفاده از استریم تطبیقی DASH ویدیوها را به چانک‌های کوچک چندثانیه‌ای تقسیم می‌کند. با تغییر کیفیت به ۱۰۸۰p، ۷۲۰p یا کیفیت‌های سبک‌تر، سگمنت‌های بعدی به صورت خودکار با وضوح و بیت‌ریت انتخابی شما بافر می‌شوند تا مصرف اینترنت کاهش یافته یا بالاترین کیفیت حاصل شود.
              </p>
            </div>
          )}

          {/* Player Controls Bar */}
          <div className="bg-zinc-900/90 rounded-2xl border border-zinc-800 p-4 space-y-3 shadow-xl">
            {/* Playing Title & Artist */}
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white line-clamp-1">
                  {currentTrackTitle || playlistData?.title || 'پلی‌لیست یوتیوب'}
                </div>
                <div className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">
                  {currentTrackAuthor || playlistData?.author || 'YouTube Music'}
                </div>
              </div>

              {/* Quality Button */}
              <button
                type="button"
                onClick={() => setShowQualityMenu(prev => !prev)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700 text-xs font-bold text-zinc-200 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5 text-red-400" />
                <span>کیفیت: {activeQualityInfo.badge}</span>
              </button>
            </div>

            {/* Buttons Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/80">
              {/* Playback Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevVideo}
                  title="آهنگ قبلی"
                  className="p-2.5 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition cursor-pointer"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={togglePlayPause}
                  title={isPlaying ? 'توقف' : 'پخش'}
                  className="p-3 rounded-xl bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-600/25 transition cursor-pointer"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleNextVideo}
                  title="آهنگ بعدی"
                  className="p-2.5 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                {/* Loop */}
                <button
                  type="button"
                  onClick={toggleLoop}
                  title={isLooping ? 'تکرار پلی‌لیست فعال' : 'تکرار غیرفعال'}
                  className={`p-2.5 rounded-xl border transition cursor-pointer ${
                    isLooping
                      ? 'bg-red-500/20 text-red-300 border-red-500/30'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <Repeat className="w-4 h-4" />
                </button>

                {/* Shuffle */}
                <button
                  type="button"
                  onClick={toggleShuffle}
                  title={isShuffling ? 'پخش تصادفی فعال' : 'پخش تصادفی غیرفعال'}
                  className={`p-2.5 rounded-xl border transition cursor-pointer ${
                    isShuffling
                      ? 'bg-red-500/20 text-red-300 border-red-500/30'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <Shuffle className="w-4 h-4" />
                </button>
              </div>

              {/* Volume & Speed Controls */}
              <div className="flex items-center gap-3">
                {/* Speed buttons */}
                <div className="flex items-center bg-zinc-950 p-0.5 rounded-xl border border-zinc-800 text-[10px] font-mono">
                  {[0.75, 1, 1.25, 1.5].map(rate => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => handleSpeedChange(rate)}
                      className={`px-2 py-1 rounded-lg transition cursor-pointer ${
                        playbackSpeed === rate
                          ? 'bg-red-600 text-white font-bold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>

                {/* Volume Slider */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="p-1.5 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-4 h-4 text-red-400" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={isMuted ? 0 : volume}
                    onChange={e => handleVolumeChange(Number(e.target.value))}
                    className="w-16 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-500"
                  />
                </div>

                {/* Fullscreen */}
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  title="تمام صفحه"
                  className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Playlist Track Drawer & Live Relay to Telegram */}
        <div className="space-y-4">
          {/* Playlist Tracklist Box */}
          <div className="bg-zinc-900/90 rounded-2xl border border-zinc-800 shadow-xl overflow-hidden flex flex-col h-[460px]">
            {/* Header */}
            <div className="p-3.5 border-b border-zinc-800 bg-zinc-900/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-red-400" />
                <span className="text-xs font-bold text-white">ترک‌های پلی‌لیست</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 font-mono">
                  {playlistData?.itemCount || 0}
                </span>
              </div>
              <button
                type="button"
                onClick={() => fetchPlaylistDetails(currentPlaylistId)}
                title="بروزرسانی لیست"
                className="p-1.5 text-zinc-400 hover:text-zinc-200 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMetadata ? 'animate-spin text-red-400' : ''}`} />
              </button>
            </div>

            {/* Search Filter */}
            <div className="p-2 border-b border-zinc-800/80 bg-zinc-950/40">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  value={trackSearchQuery}
                  onChange={e => setTrackSearchQuery(e.target.value)}
                  placeholder="جستجو در آهنگ‌های این پلی‌لیست..."
                  className="w-full pl-3 pr-8 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            {/* Track Items List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {filteredItems.length > 0 ? (
                filteredItems.map((item, idx) => {
                  const isCurrent = currentTrackIndex === idx;
                  return (
                    <button
                      key={item.id + idx}
                      type="button"
                      onClick={() => handlePlayTrack(item, idx)}
                      className={`w-full p-2 rounded-xl text-right transition flex items-center gap-2.5 cursor-pointer ${
                        isCurrent
                          ? 'bg-red-600/20 border border-red-500/40 text-white'
                          : 'bg-zinc-950/40 hover:bg-zinc-800/60 border border-zinc-800/60 text-zinc-300'
                      }`}
                    >
                      {/* Index / Status */}
                      <span className="w-5 text-center text-[10px] font-mono font-bold text-zinc-500 shrink-0">
                        {isCurrent ? (
                          <span className="w-2 h-2 rounded-full bg-red-500 inline-block animate-ping" />
                        ) : (
                          idx + 1
                        )}
                      </span>

                      {/* Thumbnail */}
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        className="w-12 h-8 rounded object-cover shrink-0 bg-zinc-800"
                        loading="lazy"
                        onError={(e: any) => {
                          e.target.src = 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg';
                        }}
                      />

                      {/* Title & Author */}
                      <div className="min-w-0 flex-1 text-right">
                        <div className="text-xs font-semibold line-clamp-1">{item.title}</div>
                        <div className="text-[10px] text-zinc-400 line-clamp-1">{item.author}</div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="text-center py-12 text-zinc-500 text-xs">
                  {isLoadingMetadata
                    ? 'در حال خواندن لیست قطعات پلی‌لیست...'
                    : 'ترکی یافت نشد یا پلی‌لیست از نوع داینامیک است.'}
                </div>
              )}
            </div>
          </div>

          {/* Telegram Live Broadcast Relay Box */}
          <div className="bg-zinc-900/90 rounded-2xl border border-zinc-800 p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-white">استریم زنده تلگرام (پلی‌لیست صوتی + کاور)</span>
              </div>
              {streamStatus.isStreaming ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse">
                  در حال پخش زنده
                </span>
              ) : (
                <span className="text-[10px] text-zinc-500 font-mono">آماده استریم</span>
              )}
            </div>

            <p className="text-[11px] text-zinc-400">
              استریم مداوم آهنگ‌های بهینه‌شده به همراه تصویر ثابت کاور به کانال یا گروه تلگرام شما.
            </p>

            <div className="grid grid-cols-3 gap-1.5">
              {(['480p', '720p', '1080p'] as const).map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setRelayQuality(q)}
                  className={`py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                    relayQuality === q
                      ? 'bg-cyan-500 text-zinc-950 shadow-md'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={destination}
                onChange={e => setDestination(e.target.value as any)}
                className="flex-1 py-2 px-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none"
              >
                <option value="channel">کانال تلگرام (CSTREAM_RTMPS_URL)</option>
                <option value="group">گروه تلگرام (GSTREAM_RTMPS_URL)</option>
                <option value="custom">آدرس RTMP دلخواه</option>
              </select>

              {streamStatus.isStreaming ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleStopRelay}
                    disabled={isRelaying}
                    className="flex-1 py-2 px-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/30 transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isRelaying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5 fill-current" />}
                    <span>توقف پخش زنده</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetRelay}
                    disabled={isRelaying}
                    title="ریست کامل پروسه‌های استریم"
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleStartRelay}
                    disabled={isRelaying}
                    className="flex-1 py-2 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-zinc-950 text-xs font-bold shadow-lg shadow-cyan-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isRelaying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>شروع استریم به تلگرام</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetRelay}
                    disabled={isRelaying}
                    title="ریست سرور استریم"
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {destination === 'custom' && (
              <input
                type="text"
                value={customRtmp}
                onChange={e => setCustomRtmp(e.target.value)}
                placeholder="rtmps://dc4-1.rtmp.t.me/s/..."
                className="w-full py-1.5 px-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-mono dir-ltr"
              />
            )}

            {relayMessage && (
              <div className="p-2 rounded-lg bg-zinc-950 text-[11px] text-cyan-300 border border-cyan-500/30">
                {relayMessage}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
