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
  destination: 'channel' | 'group' | 'custom' | null;
  targetUrlMasked?: string;
  startedAt?: string | null;
  uptimeSeconds: number;
  reconnectCount: number;
  pid?: number | null;
  hasChannelSecret: boolean;
  hasGroupSecret: boolean;
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

