export type RepeatMode = 'off' | 'file' | 'folder';

export interface Track {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  size: number;
  lastModified: number;
  metadata?: TrackMetadata;
  fileHandle?: FileSystemFileHandle;
  file?: File;
}

export interface TrackMetadata {
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  trackNumber?: number;
  year?: number;
  genre?: string[];
  // Store cover art as base64 data URL for persistence across reloads
  // Blob URLs (URL.createObjectURL) don't survive page reload
  coverArt?: string;
  // Raw picture data for regenerating Blob URL after reload
  coverArtData?: {
    data: string; // base64 encoded
    format: string; // mime type
  };
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  folderPath: string;
  folderHandle?: FileSystemDirectoryHandle;
  isFallback?: boolean;
}

export interface PlaybackState {
  currentTrackId: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
  repeatMode: RepeatMode;
  isShuffled: boolean;
  queue: string[];
  currentIndex: number;
}

export interface LibraryState {
  playlists: Playlist[];
  tracks: Map<string, Track>;
  lastScannedFolder: string | null;
  scanProgress: number;
  isScanning: boolean;
}

export type PlayerEventType = 
  | 'play' 
  | 'pause' 
  | 'ended' 
  | 'timeupdate' 
  | 'trackchange' 
  | 'volumechange' 
  | 'repeatmodechange' 
  | 'shufflechange' 
  | 'error';

export interface PlayerEvent {
  type: PlayerEventType;
  payload?: unknown;
}

export type LibraryEventType = 
  | 'scanstart' 
  | 'scanprogress' 
  | 'scancomplete' 
  | 'trackadded' 
  | 'error';

export interface LibraryEvent {
  type: LibraryEventType;
  payload?: unknown;
}

export interface StoredPlaybackState {
  trackId: string;
  currentTime: number;
  timestamp: number;
  repeatMode: RepeatMode;
  isShuffled: boolean;
  queue: string[];
  currentIndex: number;
  volume: number;
}

export const SUPPORTED_AUDIO_EXTENSIONS = [
  '.mp3', '.m4a', '.flac', '.wav', '.aac', '.ogg', '.opus', '.webm'
] as const;

export type SupportedAudioExtension = typeof SUPPORTED_AUDIO_EXTENSIONS[number];

export function isSupportedAudioFile(name: string): boolean {
  const ext = name.toLowerCase().substring(name.lastIndexOf('.'));
  return SUPPORTED_AUDIO_EXTENSIONS.includes(ext as SupportedAudioExtension);
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}