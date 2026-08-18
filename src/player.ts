import type { 
  Track, 
  RepeatMode, 
  PlayerEvent, 
  PlayerEventType 
} from './types';
import { savePlaybackState, getSavedPlaybackState } from './library';

type PlayerListener = (event: PlayerEvent) => void;

export class AudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private currentTrack: Track | null = null;
  private queue: Track[] = [];
  private currentIndex: number = -1;
  private repeatMode: RepeatMode = 'off';
  private isShuffled: boolean = false;
  private volume: number = 1;
  private listeners: Set<PlayerListener> = new Set();
  private positionSaveInterval: number | null = null;
  private savedPosition: number = 0;
  private isUserSeeking: boolean = false;
  private shuffledIndices: number[] = [];

  constructor() {
    this.initAudio();
    this.restoreState();
  }

  private initAudio(): void {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.volume = this.volume;
    
    this.audio.addEventListener('play', () => this.emit('play'));
    this.audio.addEventListener('pause', () => this.emit('pause'));
    this.audio.addEventListener('ended', () => this.handleEnded());
    this.audio.addEventListener('timeupdate', () => this.handleTimeUpdate());
    this.audio.addEventListener('loadedmetadata', () => this.emit('timeupdate'));
    this.audio.addEventListener('volumechange', () => this.emit('volumechange'));
    this.audio.addEventListener('error', (e) => this.emit('error', e));
  }

  private async restoreState(): Promise<void> {
    const saved = await getSavedPlaybackState();
    if (saved) {
      this.repeatMode = saved.repeatMode;
      this.isShuffled = saved.isShuffled;
      this.volume = saved.volume;
      if (this.audio) {
        this.audio.volume = this.volume;
      }
      this.emit('repeatmodechange', this.repeatMode);
      this.emit('shufflechange', this.isShuffled);
      this.emit('volumechange', this.volume);
    }
  }

  on(listener: PlayerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(type: PlayerEventType, payload?: unknown): void {
    const event: PlayerEvent = { type, payload };
    this.listeners.forEach(listener => listener(event));
  }

  setQueue(tracks: Track[], startIndex: number = 0): void {
    this.queue = [...tracks];
    this.currentIndex = Math.max(0, Math.min(startIndex, this.queue.length - 1));
    this.buildShuffledIndices();
    this.saveState();
  }

  private buildShuffledIndices(): void {
    this.shuffledIndices = this.queue.map((_, i) => i);
    if (this.isShuffled) {
      for (let i = this.shuffledIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.shuffledIndices[i], this.shuffledIndices[j]] = [this.shuffledIndices[j], this.shuffledIndices[i]];
      }
    }
  }

  setShuffled(shuffled: boolean): void {
    this.isShuffled = shuffled;
    this.buildShuffledIndices();
    this.emit('shufflechange', this.isShuffled);
    this.saveState();
  }

  setRepeatMode(mode: RepeatMode): void {
    this.repeatMode = mode;
    this.emit('repeatmodechange', this.repeatMode);
    this.saveState();
  }

  getRepeatMode(): RepeatMode {
    return this.repeatMode;
  }

  getIsShuffled(): boolean {
    return this.isShuffled;
  }

  async playTrack(track: Track, index?: number): Promise<void> {
    if (index !== undefined) {
      this.currentIndex = index;
    }
    
    this.currentTrack = track;
    
    if (this.audio) {
      this.stopPositionSaving();
      
      const url = await this.createTrackUrl(track);
      if (url) {
        this.audio.src = url;
        this.audio.load();
        
        if (this.savedPosition > 0 && track.id === this.getCurrentTrack()?.id) {
          this.audio.currentTime = this.savedPosition;
          this.savedPosition = 0;
        }
        
        try {
          await this.audio.play();
        } catch (error) {
          console.error('Playback failed:', error);
          this.emit('error', error);
        }
      }
      
      this.startPositionSaving();
      this.emit('trackchange', track);
      this.saveState();
    }
  }

  private async createTrackUrl(track: Track): Promise<string | null> {
    if (track.fileHandle) {
      try {
        const file = await track.fileHandle.getFile();
        return URL.createObjectURL(file);
      } catch (error) {
        console.error('Failed to create track URL from fileHandle:', error);
      }
    }
    if (track.file) {
      try {
        return URL.createObjectURL(track.file);
      } catch (error) {
        console.error('Failed to create track URL from file:', error);
      }
    }
    return null;
  }

  private handleEnded(): void {
    this.stopPositionSaving();
    
    if (this.repeatMode === 'file') {
      this.restartCurrentTrack();
      return;
    }
    
    this.playNext();
  }

  private async restartCurrentTrack(): Promise<void> {
    if (this.audio && this.currentTrack) {
      this.audio.currentTime = 0;
      try {
        await this.audio.play();
      } catch (error) {
        this.emit('error', error);
      }
    }
  }

  playNext(): void {
    if (this.queue.length === 0) return;
    
    let nextIndex: number;
    
    if (this.isShuffled) {
      const currentShuffledPos = this.shuffledIndices.indexOf(this.currentIndex);
      nextIndex = this.shuffledIndices[(currentShuffledPos + 1) % this.shuffledIndices.length];
    } else {
      nextIndex = (this.currentIndex + 1) % this.queue.length;
    }
    
    if (nextIndex === this.currentIndex && this.repeatMode === 'off') {
      this.pause();
      return;
    }
    
    this.currentIndex = nextIndex;
    const nextTrack = this.queue[this.currentIndex];
    if (nextTrack) {
      this.playTrack(nextTrack);
    }
  }

  playPrevious(): void {
    if (this.queue.length === 0) return;
    
    let prevIndex: number;
    
    if (this.isShuffled) {
      const currentShuffledPos = this.shuffledIndices.indexOf(this.currentIndex);
      prevIndex = this.shuffledIndices[(currentShuffledPos - 1 + this.shuffledIndices.length) % this.shuffledIndices.length];
    } else {
      prevIndex = (this.currentIndex - 1 + this.queue.length) % this.queue.length;
    }
    
    this.currentIndex = prevIndex;
    const prevTrack = this.queue[this.currentIndex];
    if (prevTrack) {
      this.playTrack(prevTrack);
    }
  }

  play(): void {
    if (this.audio) {
      this.audio.play().catch(error => this.emit('error', error));
      this.startPositionSaving();
    }
  }

  pause(): void {
    if (this.audio) {
      this.audio.pause();
      this.stopPositionSaving();
    }
  }

  togglePlayPause(): void {
    if (this.audio?.paused) {
      this.play();
    } else {
      this.pause();
    }
  }

  seek(time: number): void {
    if (this.audio) {
      this.isUserSeeking = true;
      this.audio.currentTime = Math.max(0, Math.min(time, this.audio.duration || 0));
      this.isUserSeeking = false;
      this.saveState();
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.audio) {
      this.audio.volume = this.volume;
    }
    this.emit('volumechange', this.volume);
    this.saveState();
  }

  getVolume(): number {
    return this.volume;
  }

  getCurrentTrack(): Track | null {
    return this.currentTrack;
  }

  getCurrentTime(): number {
    return this.audio?.currentTime || 0;
  }

  getDuration(): number {
    return this.audio?.duration || 0;
  }

  getProgress(): number {
    const duration = this.getDuration();
    return duration > 0 ? this.getCurrentTime() / duration : 0;
  }

  isPlaying(): boolean {
    return this.audio ? !this.audio.paused : false;
  }

  getQueue(): Track[] {
    return [...this.queue];
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  private handleTimeUpdate(): void {
    if (!this.isUserSeeking && this.audio) {
      this.emit('timeupdate');
      this.savedPosition = this.audio.currentTime;
    }
  }

  private startPositionSaving(): void {
    this.stopPositionSaving();
    this.positionSaveInterval = window.setInterval(() => {
      this.saveState();
    }, 5000);
  }

  private stopPositionSaving(): void {
    if (this.positionSaveInterval !== null) {
      clearInterval(this.positionSaveInterval);
      this.positionSaveInterval = null;
    }
  }

  private async saveState(): Promise<void> {
    if (!this.currentTrack) return;
    
    await savePlaybackState({
      trackId: this.currentTrack.id,
      currentTime: this.getCurrentTime(),
      repeatMode: this.repeatMode,
      isShuffled: this.isShuffled,
      queue: this.queue.map(t => t.id),
      currentIndex: this.currentIndex,
      volume: this.volume,
    });
  }

  async resumeLastTrack(allTracks: Track[]): Promise<boolean> {
    const saved = await getSavedPlaybackState();
    if (!saved) return false;
    
    const track = allTracks.find(t => t.id === saved.trackId);
    if (!track) return false;
    
    this.repeatMode = saved.repeatMode;
    this.isShuffled = saved.isShuffled;
    this.volume = saved.volume;
    this.queue = saved.queue.map(id => allTracks.find(t => t.id === id)).filter((t): t is Track => t !== undefined);
    this.currentIndex = saved.currentIndex;
    this.buildShuffledIndices();
    
    if (this.audio) {
      this.audio.volume = this.volume;
    }
    
    this.emit('repeatmodechange', this.repeatMode);
    this.emit('shufflechange', this.isShuffled);
    this.emit('volumechange', this.volume);
    
    await this.playTrack(track, saved.currentIndex);
    
    if (this.audio) {
      this.audio.currentTime = saved.currentTime;
    }
    
    return true;
  }

  destroy(): void {
    this.stopPositionSaving();
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio.remove();
      this.audio = null;
    }
    this.listeners.clear();
  }
}

export const player = new AudioPlayer();