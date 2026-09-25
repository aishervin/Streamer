import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  LogOut,
  ListMusic,
  ExternalLink,
  ShieldCheck,
  Play,
  RefreshCw,
  Sparkles
} from 'lucide-react';

const YouTubeIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);
import {
  initAuth,
  googleSignIn,
  googleSignOut,
  getCachedAccessToken
} from '../services/googleAuth.ts';

interface YouTubePlaylist {
  id: string;
  title: string;
  itemCount: number;
  thumbnail: string;
  description: string;
}

interface YouTubeChannel {
  title: string;
  customUrl?: string;
  subscriberCount?: string;
  videoCount?: string;
  avatar: string;
}

interface YouTubeAuthCardProps {
  onSelectPlaylist?: (playlistId: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export function YouTubeAuthCard({ onSelectPlaylist, showToast }: YouTubeAuthCardProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);

  const [channel, setChannel] = useState<YouTubeChannel | null>(null);
  const [playlists, setPlaylists] = useState<YouTubePlaylist[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, currentToken) => {
        setUser(currentUser);
        setToken(currentToken);
        fetchYouTubeData(currentToken);
      },
      () => {
        setUser(null);
        setToken(null);
        setChannel(null);
        setPlaylists([]);
      }
    );

    const existingToken = getCachedAccessToken();
    if (existingToken) {
      setToken(existingToken);
      fetchYouTubeData(existingToken);
    }

    return () => {
      unsubscribe();
    };
  }, []);

  const fetchYouTubeData = async (accessToken: string) => {
    setIsLoadingData(true);
    try {
      // 1. Fetch Channel Info
      const channelRes = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (channelRes.ok) {
        const cData = await channelRes.json();
        const item = cData.items?.[0];
        if (item) {
          setChannel({
            title: item.snippet?.title || 'YouTube Channel',
            customUrl: item.snippet?.customUrl,
            subscriberCount: item.statistics?.subscriberCount,
            videoCount: item.statistics?.videoCount,
            avatar: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
          });
        }
      }

      // 2. Fetch User's Playlists
      const plRes = await fetch(
        'https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=25',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (plRes.ok) {
        const plData = await plRes.json();
        const list: YouTubePlaylist[] = (plData.items || []).map((it: any) => ({
          id: it.id,
          title: it.snippet?.title || 'بدون عنوان',
          itemCount: it.contentDetails?.itemCount || 0,
          thumbnail: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url || '',
          description: it.snippet?.description || '',
        }));
        setPlaylists(list);
      }
    } catch (err: any) {
      console.error('Failed to fetch YouTube data:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      const { user: signedInUser, accessToken } = await googleSignIn();
      setUser(signedInUser);
      setToken(accessToken);
      if (showToast) showToast(`خوش آمدید، ${signedInUser.displayName || 'کاربر گرامی'}!`, 'success');
      await fetchYouTubeData(accessToken);
    } catch (err: any) {
      if (showToast) showToast(err.message || 'خطا در ورود به حساب گوگل', 'error');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await googleSignOut();
      setUser(null);
      setToken(null);
      setChannel(null);
      setPlaylists([]);
      if (showToast) showToast('با موفقیت از حساب گوگل خارج شدید', 'info');
    } catch (err: any) {
      if (showToast) showToast(err.message || 'خطا در خروج', 'error');
    }
  };

  const handleCopyToken = () => {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    if (showToast) showToast('توکن OAuth یوتیوب در کلیپ‌بورد کپی شد', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-red-600 to-amber-600 flex items-center justify-center text-white shadow-lg shadow-red-600/20">
            <YouTubeIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <span>ورود با حساب گوگل و یوتیوب (Google OAuth)</span>
              {user ? (
                <span className="flex items-center gap-1 text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-3 h-3" /> متصل شد
                </span>
              ) : (
                <span className="text-[11px] font-medium bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700">
                  نیازمند ورود
                </span>
              )}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              ورود با اکانت گوگل بدون نیاز به تایپ رمز عبور + دریافت مستقیم توکن دسترسی یوتیوب
            </p>
          </div>
        </div>

        {/* User Status / Action Button */}
        <div>
          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5 bg-zinc-800/60 border border-zinc-700/80 px-3 py-1.5 rounded-xl">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Google Avatar'}
                    className="w-7 h-7 rounded-full border border-zinc-600 object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-bold">
                    {(user.displayName || user.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div className="text-right">
                  <div className="text-xs font-semibold text-zinc-200">
                    {user.displayName || 'کاربر یوتیوب'}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono">
                    {user.email}
                  </div>
                </div>
              </div>

              <button
                onClick={handleSignOut}
                title="خروج از حساب"
                className="p-2 rounded-xl bg-zinc-800 hover:bg-red-950/60 hover:text-red-400 text-zinc-400 border border-zinc-700 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="gsi-material-button inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-medium text-xs shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <div className="w-4 h-4 flex-shrink-0">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
              </div>
              <span className="font-semibold">
                {isSigningIn ? 'در حال باز کردن حساب گوگل...' : 'ورود با حساب گوگل (Sign in with Google)'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {!user ? (
        <div className="bg-zinc-950/60 border border-dashed border-zinc-800 rounded-xl p-8 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-red-600/10 border border-red-500/20 flex items-center justify-center text-red-400">
            <Key className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-sm font-semibold text-zinc-200">
              هنوز با حساب گوگل خود وارد نشده‌اید
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              با زدن دکمه <b>ورود با حساب گوگل</b>، پنجره امن گوگل باز شده و اکانت خود را انتخاب می‌کنید. بلافاصله توکن رسمی دسترسی یوتیوب به همراه پلی‌لیست‌های شخصی‌تان در این صفحه نمایش داده خواهد شد.
            </p>
          </div>
          <button
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-lg shadow-red-600/20 transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {isSigningIn ? 'در حال ارتباط با گوگل...' : 'همین حالا با اکانت گوگل وارد شوید'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Token Display Box */}
          <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                <Key className="w-4 h-4 text-amber-400" />
                <span>توکن دسترسی یوتیوب (OAuth Access Token)</span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded">
                  Bearer Token
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowToken(!showToken)}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer"
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showToken ? 'مخفی‌سازی' : 'نمایش کامل توکن'}</span>
                </button>
                <button
                  onClick={handleCopyToken}
                  className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-[11px] flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'کپی شد!' : 'کپی توکن'}</span>
                </button>
              </div>
            </div>

            <div className="relative font-mono text-[11px] p-3 rounded-lg bg-zinc-900 border border-zinc-800/80 break-all select-all text-zinc-300">
              {showToken ? (
                token
              ) : (
                <span>
                  {token?.substring(0, 16)}••••••••••••••••••••••••••••••••••••••••••
                  {token?.substring(token.length - 8)}
                </span>
              )}
            </div>

            <p className="text-[11px] text-zinc-500 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
              این توکن به صورت استاندارد در حافظه برنامه کش شده و می‌توانید از آن برای واکشی ویدیوها و درخواست‌های API با احراز هویت استفاده کنید.
            </p>
          </div>

          {/* YouTube Channel Stats (if available) */}
          {channel && (
            <div className="bg-zinc-950/50 border border-zinc-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {channel.avatar && (
                  <img
                    src={channel.avatar}
                    alt={channel.title}
                    className="w-12 h-12 rounded-xl object-cover border border-zinc-700"
                  />
                )}
                <div>
                  <h4 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                    <span>{channel.title}</span>
                    {channel.customUrl && (
                      <span className="text-xs text-red-400 font-mono">
                        {channel.customUrl}
                      </span>
                    )}
                  </h4>
                  <div className="flex items-center gap-4 text-xs text-zinc-400 mt-1">
                    {channel.subscriberCount && (
                      <span>👥 {Number(channel.subscriberCount).toLocaleString('fa-IR')} مشترک</span>
                    )}
                    {channel.videoCount && (
                      <span>🎬 {Number(channel.videoCount).toLocaleString('fa-IR')} ویدیو</span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => token && fetchYouTubeData(token)}
                disabled={isLoadingData}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`} />
                <span>بروزرسانی داده‌ها</span>
              </button>
            </div>
          )}

          {/* User's YouTube Playlists */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-zinc-200 flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-red-400" />
                <span>پلی‌لیست‌های شخصی شما در یوتیوب ({playlists.length})</span>
              </h3>
              {isLoadingData && (
                <span className="text-xs text-zinc-400 flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin" /> در حال دریافت پلی‌لیست‌ها...
                </span>
              )}
            </div>

            {playlists.length === 0 && !isLoadingData ? (
              <div className="text-center py-6 text-xs text-zinc-500 bg-zinc-950/40 rounded-xl border border-zinc-800/60">
                پلی‌لیستی در این اکانت یافت نشد یا دسترسی عمومی ندارد.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                {playlists.map(pl => (
                  <div
                    key={pl.id}
                    className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 hover:border-red-500/40 transition flex items-center gap-3 group"
                  >
                    {pl.thumbnail ? (
                      <img
                        src={pl.thumbnail}
                        alt={pl.title}
                        className="w-16 h-12 rounded-lg object-cover bg-zinc-900 border border-zinc-800 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-12 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0 text-zinc-500">
                        <YouTubeIcon className="w-5 h-5" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-zinc-200 truncate group-hover:text-red-400 transition">
                        {pl.title}
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-2 font-mono">
                        <span>{pl.itemCount} ویدیو</span>
                        <span>•</span>
                        <span className="truncate">{pl.id}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {onSelectPlaylist && (
                        <button
                          onClick={() => {
                            onSelectPlaylist(pl.id);
                            if (showToast) showToast(`پلی‌لیست «${pl.title}» انتخاب شد`, 'success');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-500 text-white text-[11px] font-medium flex items-center gap-1 transition active:scale-95 cursor-pointer shadow-sm shadow-red-600/20"
                          title="انتخاب جهت استریم"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>استریم</span>
                        </button>
                      )}
                      <a
                        href={`https://www.youtube.com/playlist?list=${pl.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition"
                        title="مشاهده در یوتیوب"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
