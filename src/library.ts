import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import * as mm from 'music-metadata';
import type { 
  Track, 
  Playlist, 
  TrackMetadata, 
  LibraryState, 
  LibraryEvent
} from './types';
import { isSupportedAudioFile, generateId } from './types';

const DB_NAME = 'music-player-db';
const DB_VERSION = 1;

interface MusicPlayerDB extends DBSchema {
  tracks: {
    key: string;
    value: Track;
    indexes: { 'by-playlist': string; 'by-folder': string };
  };
  playlists: {
    key: string;
    value: Playlist;
  };
  playbackState: {
    key: string;
    value: {
      trackId: string;
      currentTime: number;
      timestamp: number;
      repeatMode: 'off' | 'file' | 'folder';
      isShuffled: boolean;
      queue: string[];
      currentIndex: number;
      volume: number;
    };
  };
  settings: {
    key: string;
    value: { key: string; folderHandle: FileSystemDirectoryHandle; permissionGranted: boolean };
  };
}

let dbPromise: Promise<IDBPDatabase<MusicPlayerDB>> | null = null;

function getDB(): Promise<IDBPDatabase<MusicPlayerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MusicPlayerDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('tracks')) {
          const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
          trackStore.createIndex('by-playlist', 'playlistId');
          trackStore.createIndex('by-folder', 'folderPath');
        }
        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('playbackState')) {
          db.createObjectStore('playbackState', { keyPath: 'trackId' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

type LibraryListener = (event: LibraryEvent) => void;
const libraryListeners: Set<LibraryListener> = new Set();

export function onLibraryEvent(listener: LibraryListener): () => void {
  libraryListeners.add(listener);
  return () => libraryListeners.delete(listener);
}

function emitLibraryEvent(event: LibraryEvent): void {
  libraryListeners.forEach(listener => listener(event));
}

let currentLibraryState: LibraryState = {
  playlists: [],
  tracks: new Map(),
  lastScannedFolder: null,
  scanProgress: 0,
  isScanning: false,
};

export function getLibraryState(): LibraryState {
  return { ...currentLibraryState, tracks: new Map(currentLibraryState.tracks) };
}

async function parseMetadata(file: File): Promise<TrackMetadata | undefined> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const metadata = await mm.parseBuffer(new Uint8Array(arrayBuffer), { 
      mimeType: file.type || undefined,
      size: file.size 
    });
    
    const common = metadata.common;
    let coverArt: string | undefined;
    
    if (metadata.common.picture && metadata.common.picture.length > 0) {
      const pic = metadata.common.picture[0];
      const blob = new Blob([pic.data as any], { type: pic.format });
      coverArt = URL.createObjectURL(blob);
    }
    
    return {
      title: common.title,
      artist: common.artist,
      album: common.album,
      duration: metadata.format.duration,
      trackNumber: common.track?.no ?? undefined,
      year: common.year,
      genre: common.genre,
      coverArt,
    };
  } catch (error) {
    console.warn('Failed to parse metadata:', error);
    return undefined;
  }
}

async function scanDirectory(
  dirHandle: FileSystemDirectoryHandle,
  folderPath: string,
  _playlistId: string,
  onProgress?: (current: number, total: number) => void
): Promise<Track[]> {
  const tracks: Track[] = [];
  let fileCount = 0;
  let processedCount = 0;
  
  async function countFiles(handle: FileSystemDirectoryHandle): Promise<number> {
    let count = 0;
    for await (const [, entry] of handle.entries()) {
      if (entry.kind === 'file' && isSupportedAudioFile(entry.name)) {
        count++;
      } else if (entry.kind === 'directory') {
        count += await countFiles(entry);
      }
    }
    return count;
  }
  
  fileCount = await countFiles(dirHandle);
  
  async function scanRecursive(currentHandle: FileSystemDirectoryHandle, currentPath: string): Promise<void> {
    for await (const [name, entry] of currentHandle.entries()) {
      const fullPath = `${currentPath}/${name}`;
      
      if (entry.kind === 'file' && isSupportedAudioFile(name)) {
        try {
          const file = await entry.getFile();
          const fileHandle = entry as FileSystemFileHandle;
          const metadata = await parseMetadata(file);
          
          const track: Track = {
            id: generateId(),
            name: metadata?.title || name,
            path: fullPath,
            relativePath: fullPath.replace(`${folderPath}/`, ''),
            size: file.size,
            lastModified: file.lastModified,
            metadata,
            fileHandle,
          };
          
          tracks.push(track);
        } catch (error) {
          console.warn(`Failed to process file ${name}:`, error);
        }
        processedCount++;
        onProgress?.(processedCount, fileCount);
      } else if (entry.kind === 'directory') {
        await scanRecursive(entry, fullPath);
      }
    }
  }
  
  await scanRecursive(dirHandle, folderPath);
  return tracks;
}

export async function pickMusicFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
    });
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      throw new Error('Permission denied for folder access');
    }
    return handle;
  } catch (error) {
    if ((error as DOMException).name !== 'AbortError') {
      console.error('Failed to pick folder:', error);
      emitLibraryEvent({ type: 'error', payload: error instanceof Error ? error.message : String(error) });
    }
    return null;
  }
}

export async function scanMusicFolder(folderHandle: FileSystemDirectoryHandle): Promise<Playlist> {
  try {
    const db = await getDB();
    const playlistName = folderHandle.name;
    const playlistId = generateId();
    const folderPath = playlistName;
    
    currentLibraryState.isScanning = true;
    currentLibraryState.scanProgress = 0;
    emitLibraryEvent({ type: 'scanstart' });
    
    const tracks = await scanDirectory(folderHandle, folderPath, playlistId, (current, total) => {
      currentLibraryState.scanProgress = total > 0 ? Math.round((current / total) * 100) : 0;
      emitLibraryEvent({ type: 'scanprogress', payload: { current, total } });
    });
  
  const playlist: Playlist = {
    id: playlistId,
    name: playlistName,
    tracks,
    folderPath,
    folderHandle,
  };
  
  const tx = db.transaction(['tracks', 'playlists'], 'readwrite');
  for (const track of tracks) {
    const trackWithPlaylist = { ...track, playlistId };
    await tx.objectStore('tracks').put(trackWithPlaylist);
    currentLibraryState.tracks.set(track.id, trackWithPlaylist);
    emitLibraryEvent({ type: 'trackadded', payload: trackWithPlaylist });
  }
  await tx.objectStore('playlists').put(playlist);
  currentLibraryState.playlists.push(playlist);
  currentLibraryState.lastScannedFolder = folderPath;
  
  await tx.done;
  
  await db.put('settings', { key: 'folderHandle', folderHandle, permissionGranted: true });
  
  currentLibraryState.isScanning = false;
  currentLibraryState.scanProgress = 100;
  emitLibraryEvent({ type: 'scancomplete', payload: playlist });
  
  return playlist;
  } catch (error) {
    currentLibraryState.isScanning = false;
    console.error('Scan failed:', error);
    emitLibraryEvent({ type: 'error', payload: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function loadLibraryFromDB(): Promise<void> {
  const db = await getDB();
  
  const playlists = await db.getAll('playlists');
  currentLibraryState.playlists = playlists;
  
  const tracks = await db.getAll('tracks');
  currentLibraryState.tracks.clear();
  for (const track of tracks) {
    currentLibraryState.tracks.set(track.id, track);
  }
  
  if (playlists.length > 0) {
    const settings = await db.get('settings', 'folderHandle');
    if (settings?.folderHandle) {
      currentLibraryState.lastScannedFolder = settings.folderHandle.name;
    }
  }
}

export async function deleteTrack(trackId: string): Promise<boolean> {
  const db = await getDB();
  const track = await db.get('tracks', trackId);
  
  if (!track || !track.fileHandle) {
    return false;
  }
  
  try {
    const dirHandle = track.fileHandle as any;
    const parent = await dirHandle.getParent?.();
    if (parent) {
      await parent.removeEntry(dirHandle.name);
    }
    await db.delete('tracks', trackId);
    currentLibraryState.tracks.delete(trackId);
    
    const playlist = currentLibraryState.playlists.find(p => 
      p.tracks.some(t => t.id === trackId)
    );
    if (playlist) {
      playlist.tracks = playlist.tracks.filter(t => t.id !== trackId);
      await db.put('playlists', playlist);
    }
    
    return true;
  } catch (error) {
    console.error('Failed to delete track:', error);
    emitLibraryEvent({ type: 'error', payload: error });
    return false;
  }
}

export async function getTrackFile(trackId: string): Promise<File | null> {
  const db = await getDB();
  const track = await db.get('tracks', trackId);
  
  if (!track?.fileHandle) {
    return null;
  }
  
  try {
    return await track.fileHandle.getFile();
  } catch (error) {
    console.error('Failed to get track file:', error);
    return null;
  }
}

export async function getTrackUrl(trackId: string): Promise<string | null> {
  const file = await getTrackFile(trackId);
  if (!file) return null;
  return URL.createObjectURL(file);
}

export async function getSavedPlaybackState(): Promise<{
  trackId: string;
  currentTime: number;
  repeatMode: 'off' | 'file' | 'folder';
  isShuffled: boolean;
  queue: string[];
  currentIndex: number;
  volume: number;
} | null> {
  const db = await getDB();
  const states = await db.getAll('playbackState');
  if (states.length === 0) return null;
  
  const latest = states.reduce((a, b) => a.timestamp > b.timestamp ? a : b);
  return latest;
}

export async function savePlaybackState(state: {
  trackId: string;
  currentTime: number;
  repeatMode: 'off' | 'file' | 'folder';
  isShuffled: boolean;
  queue: string[];
  currentIndex: number;
  volume: number;
}): Promise<void> {
  const db = await getDB();
  await db.put('playbackState', {
    ...state,
    timestamp: Date.now(),
  });
}

export async function clearPlaybackState(): Promise<void> {
  const db = await getDB();
  await db.clear('playbackState');
}