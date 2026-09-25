import React, { useEffect, useState } from 'react';
import {
  GitBranch,
  Play,
  ExternalLink,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Square,
  Sparkles,
} from 'lucide-react';
import { WorkflowRun } from '../types';

interface GitHubActionsControlProps {
  onRefreshLogs?: () => void;
}

export const GitHubActionsControl: React.FC<GitHubActionsControlProps> = () => {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [destination, setDestination] = useState<'channel' | 'group'>('channel');
  const [ytPlaylistUrl, setYtPlaylistUrl] = useState('https://www.youtube.com/playlist?list=PLDIoUOhQQPlXr63I_vwF9GD8sAKh77dWU');
  const [ytQuality, setYtQuality] = useState('720p');
  const [ytMaxVideos, setYtMaxVideos] = useState('20');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchRuns = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/github/runs');
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
    const timer = setInterval(fetchRuns, 8000);
    return () => clearInterval(timer);
  }, []);

  const handleDispatchYouTubeStream = async () => {
    setDispatching('youtube');
    setMessage(null);
    try {
      const res = await fetch('/api/github/dispatch-youtube-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistUrl: ytPlaylistUrl,
          destination,
          quality: ytQuality,
          maxVideos: ytMaxVideos,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: 'success',
          text: `اکشن یوتیوب (youtube_stream.yml) روی سرورهای گیت‌هاب استارت شد! ویدیوها با تصویر واقعی به ${destination === 'channel' ? 'کانال' : 'گروه'} تلگرام استریم می‌شوند.`,
        });
        setTimeout(fetchRuns, 2000);
      } else {
        setMessage({ type: 'error', text: data.error || 'خطا در ارسال دستور به گیت‌هاب' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setDispatching(null);
    }
  };

  const handleDispatchStream = async () => {
    setDispatching('stream');
    setMessage(null);
    try {
      const res = await fetch('/api/github/dispatch-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: 'success',
          text: `Workflow stream.yml (${destination}) dispatched successfully on GitHub!`,
        });
        setTimeout(fetchRuns, 2000);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to dispatch workflow' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setDispatching(null);
    }
  };

  const handleDispatchOptimize = async () => {
    setDispatching('optimize');
    setMessage(null);
    try {
      const res = await fetch('/api/github/dispatch-optimize', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: 'success',
          text: 'Workflow optimize.yml dispatched successfully on GitHub!',
        });
        setTimeout(fetchRuns, 2000);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to dispatch workflow' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setDispatching(null);
    }
  };

  const handleCancelRun = async (runId: number) => {
    try {
      const res = await fetch(`/api/github/cancel/${runId}`, { method: 'POST' });
      if (res.ok) {
        setMessage({ type: 'success', text: `Cancellation sent for run #${runId}` });
        setTimeout(fetchRuns, 2000);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const getStatusBadge = (run: WorkflowRun) => {
    if (run.status === 'in_progress') {
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
          <RefreshCw className="w-3 h-3 animate-spin" /> In Progress
        </span>
      );
    }
    if (run.status === 'queued') {
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Clock className="w-3 h-3" /> Queued
        </span>
      );
    }
    if (run.conclusion === 'success') {
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3" /> Succeeded
        </span>
      );
    }
    if (run.conclusion === 'cancelled') {
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
          <Square className="w-3 h-3" /> Cancelled
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
        <XCircle className="w-3 h-3" /> {run.conclusion || run.status}
      </span>
    );
  };

  return (
    <div id="github-actions-panel" className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-6 shadow-lg flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200">
            <GitBranch className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-zinc-100">GitHub Actions Control</h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Connected
              </span>
            </div>
            <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
              <span>Repository:</span>
              <a
                href="https://github.com/aishervin/Streamer"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:underline font-mono inline-flex items-center gap-1"
              >
                aishervin/Streamer
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchRuns}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-zinc-700 flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            Refresh
          </button>
          <a
            href="https://github.com/aishervin/Streamer/actions"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-zinc-700 flex items-center gap-1.5 transition"
          >
            <span>GitHub Actions Tab</span>
            <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
          </a>
        </div>
      </div>

      {/* Notification Banner */}
      {message && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/50'
              : 'bg-red-950/40 text-red-300 border border-red-800/50'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Dispatch Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* YouTube Playlist Streamer Card */}
        <div className="p-4 rounded-xl border border-red-500/40 bg-gradient-to-b from-red-950/20 to-zinc-950/60 flex flex-col justify-between gap-3 shadow-lg shadow-red-950/20 md:col-span-2">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-bold text-white">استریم ویدیویی پلی‌لیست یوتیوب (YouTube Playlist to Telegram Live)</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-700/50">
                youtube_stream.yml
              </span>
            </div>
            <p className="text-xs text-zinc-300 mt-1">
              موتور سرور گیت‌هاب اکشنز ویدیوهای واقعی پلی‌لیست یوتیوب (تصویر + صدا با کیفیت انتخابی) را به صورت خودکار دانلود و مستقیماً روی لایو کانال/گروه تلگرام استریم می‌کند.
            </p>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-zinc-800/80">
            {/* Playlist URL input */}
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">لینک یا شناسه پلی‌لیست یوتیوب:</label>
              <input
                type="text"
                value={ytPlaylistUrl}
                onChange={e => setYtPlaylistUrl(e.target.value)}
                placeholder="https://www.youtube.com/playlist?list=..."
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Destination Radio */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-400">مقصد:</span>
                <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="radio"
                    name="gh-yt-destination"
                    checked={destination === 'channel'}
                    onChange={() => setDestination('channel')}
                    className="text-red-500 focus:ring-0"
                  />
                  کانال (Channel)
                </label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="radio"
                    name="gh-yt-destination"
                    checked={destination === 'group'}
                    onChange={() => setDestination('group')}
                    className="text-red-500 focus:ring-0"
                  />
                  گروه (Group)
                </label>
              </div>

              {/* Quality & Max Videos */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-zinc-400">کیفیت:</span>
                  <select
                    value={ytQuality}
                    onChange={e => setYtQuality(e.target.value)}
                    className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-xs text-zinc-200"
                  >
                    <option value="720p">720p HD</option>
                    <option value="480p">480p SD</option>
                    <option value="1080p">1080p FHD</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-zinc-400">حداکثر ویدیو:</span>
                  <input
                    type="number"
                    value={ytMaxVideos}
                    onChange={e => setYtMaxVideos(e.target.value)}
                    min={1}
                    max={50}
                    className="w-16 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 text-center"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleDispatchYouTubeStream}
              disabled={dispatching !== null}
              className="mt-1 w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-red-900/30 cursor-pointer disabled:opacity-50"
            >
              {dispatching === 'youtube' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>در حال فعال‌سازی در GitHub Actions...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>شروع استریم ویدیویی یوتیوب در GitHub Actions (تصویر و صدای زنده)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Stream Workflow Card */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/40 flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-200">Stream to Telegram</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                stream.yml
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Triggers the GitHub runner to broadcast the looping background and music playlist to Telegram.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800/80">
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400">Destination:</span>
              <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="radio"
                  name="gh-destination"
                  checked={destination === 'channel'}
                  onChange={() => setDestination('channel')}
                  className="text-cyan-500 focus:ring-0"
                />
                Channel
              </label>
              <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="radio"
                  name="gh-destination"
                  checked={destination === 'group'}
                  onChange={() => setDestination('group')}
                  className="text-cyan-500 focus:ring-0"
                />
                Group
              </label>
            </div>

            <button
              onClick={handleDispatchStream}
              disabled={dispatching !== null}
              className="mt-1 w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center justify-center gap-2 transition shadow disabled:opacity-50"
            >
              {dispatching === 'stream' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Dispatching to GitHub...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Dispatch stream.yml on GitHub</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Optimize Workflow Card */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/40 flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-200">Optimize Music</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                optimize.yml
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Triggers the GitHub runner to convert all files in <code className="text-zinc-300">music/</code> to AAC 96k and commit them.
            </p>
          </div>

          <div className="pt-2 border-t border-zinc-800/80">
            <button
              onClick={handleDispatchOptimize}
              disabled={dispatching !== null}
              className="w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs border border-zinc-700 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {dispatching === 'optimize' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Dispatching to GitHub...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Dispatch optimize.yml on GitHub</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Recent Workflow Runs */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
          Recent GitHub Actions Runs
        </h3>

        {runs.length === 0 ? (
          <div className="p-4 rounded-lg bg-zinc-950/30 border border-zinc-800/80 text-center text-xs text-zinc-500">
            No recent workflow runs found. Dispatch a workflow to get started!
          </div>
        ) : (
          <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950/20">
            {runs.map(run => (
              <div
                key={run.id}
                className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-zinc-800/30 transition text-xs"
              >
                <div className="flex items-center gap-2.5">
                  {getStatusBadge(run)}
                  <div>
                    <span className="font-semibold text-zinc-200">{run.name}</span>
                    <span className="text-zinc-500 ml-2 font-mono text-[11px]">
                      #{run.id}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-zinc-400">
                    {new Date(run.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>

                  {run.status === 'in_progress' && (
                    <button
                      onClick={() => handleCancelRun(run.id)}
                      className="px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-medium transition"
                    >
                      Cancel
                    </button>
                  )}

                  <a
                    href={run.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center gap-1 text-[11px]"
                  >
                    <span>Logs</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
