export interface TrackInfo {
  filename: string;
  size: number;
  modifiedAt: string;
  isOptimized?: boolean;
}

export interface LibraryStatus {
  rawTracks: TrackInfo[];
  optimizedTracks: TrackInfo[];
  playlistCount: number;
  hasBackground: boolean;
}

export interface StreamStatus {
  isStreaming: boolean;
  destination: 'channel' | 'group' | 'school' | 'custom' | null;
  sourceType?: 'playlist' | 'live_tv' | 'youtube';
  channelName?: string;
  liveStreamUrl?: string;
  youtubeUrl?: string;
  currentPlayingTitle?: string;
  quality?: '480p' | '720p' | '1080p';
  targetUrlMasked?: string;
  startedAt?: string | null;
  uptimeSeconds: number;
  reconnectCount: number;
  pid?: number | null;
  hasChannelSecret: boolean;
  hasGroupSecret: boolean;
}

export interface YouTubePlaylistItem {
  id: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  url: string;
  duration?: string;
}

export interface YouTubePlaylistData {
  type: 'playlist' | 'video';
  id: string;
  title: string;
  author: string;
  itemCount: number;
  items: YouTubePlaylistItem[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  text: string;
  type: 'info' | 'warn' | 'error' | 'stream';
}

export interface WorkflowRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  event: string;
}

export interface LiveTvChannel {
  id: string;
  name: string;
  nameFa: string;
  category: string;
  streamUrl: string;
  description: string;
  quality: string;
  badge?: string;
}

