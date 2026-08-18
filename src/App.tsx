import { useState, useEffect, useCallback, useRef } from 'react';
import { player } from './player';
import { 
  pickMusicFolder, 
  scanMusicFolder, 
  loadLibraryFromDB, 
  deleteTrack,
  getLibraryState,
  onLibraryEvent
} from './library';
import type { Track, Playlist, RepeatMode, LibraryEvent, PlayerEvent } from './types';
import './App.css';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function App() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentPlaylist, setCurrentPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [isShuffled, setIsShuffled] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(true);
  const progressRef = useRef<HTMLInputElement>(null);
  const volumeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadLibraryFromDB().then(() => {
      const state = getLibraryState();
      setPlaylists(state.playlists);
      if (state.playlists.length > 0) {
        const firstPlaylist = state.playlists[0];
        setCurrentPlaylist(firstPlaylist);
        setTracks(firstPlaylist.tracks);
      }
    });

    const unsubscribeLibrary = onLibraryEvent((event: LibraryEvent) => {
      switch (event.type) {
        case 'scanstart':
          setIsScanning(true);
          setScanProgress(0);
          break;
        case 'scanprogress':
          if (event.payload && typeof event.payload === 'object' && 'current' in event.payload) {
            setScanProgress((event.payload as { current: number }).current);
          }
          break;
        case 'scancomplete':
          setIsScanning(false);
          setScanProgress(100);
          const newState = getLibraryState();
          setPlaylists(newState.playlists);
          if (newState.playlists.length > 0 && !currentPlaylist) {
            const first = newState.playlists[0];
            setCurrentPlaylist(first);
            setTracks(first.tracks);
          }
          break;
        case 'trackadded':
          break;
        case 'error':
          setError('An error occurred while scanning');
          break;
      }
    });

    const unsubscribePlayer = player.on((event: PlayerEvent) => {
      switch (event.type) {
        case 'play':
          setIsPlaying(true);
          break;
        case 'pause':
          setIsPlaying(false);
          break;
        case 'trackchange':
          setCurrentTrack(event.payload as Track);
          setCurrentTime(0);
          break;
        case 'timeupdate':
          setCurrentTime(player.getCurrentTime());
          setDuration(player.getDuration());
          break;
        case 'volumechange':
          setVolume(player.getVolume());
          break;
        case 'repeatmodechange':
          setRepeatMode(player.getRepeatMode());
          break;
        case 'shufflechange':
          setIsShuffled(player.getIsShuffled());
          break;
        case 'error':
          setError('Playback error');
          break;
      }
    });

    player.resumeLastTrack(tracks).then(resumed => {
      if (resumed) {
        setTracks(player.getQueue());
      }
    });

    return () => {
      unsubscribeLibrary();
      unsubscribePlayer();
    };
  }, [currentPlaylist]);

  useEffect(() => {
    if (currentPlaylist) {
      player.setQueue(currentPlaylist.tracks);
      setTracks(currentPlaylist.tracks);
    }
  }, [currentPlaylist]);

  const handlePickFolder = useCallback(async () => {
    const handle = await pickMusicFolder();
    if (handle) {
      setShowFolderPicker(false);
      await scanMusicFolder(handle);
    }
  }, []);

  const handlePlaylistSelect = useCallback((playlist: Playlist) => {
    setCurrentPlaylist(playlist);
    setShowPlaylist(false);
  }, []);

  const handleTrackClick = useCallback((track: Track, index: number) => {
    player.playTrack(track, index);
  }, []);

  const handleDeleteTrack = useCallback(async (trackId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('이 파일을 삭제하시겠습니까?')) {
      await deleteTrack(trackId);
      const newState = getLibraryState();
      setPlaylists(newState.playlists);
      if (currentPlaylist) {
        const updated = newState.playlists.find(p => p.id === currentPlaylist.id);
        if (updated) setCurrentPlaylist(updated);
      }
    }
  }, [currentPlaylist]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    player.seek(time);
  }, []);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    player.setVolume(vol);
  }, []);

  const togglePlayPause = useCallback(() => {
    player.togglePlayPause();
  }, []);

  const handleNext = useCallback(() => {
    player.playNext();
  }, []);

  const handlePrev = useCallback(() => {
    player.playPrevious();
  }, []);

  const toggleRepeat = useCallback(() => {
    const modes: RepeatMode[] = ['off', 'file', 'folder'];
    const currentIndex = modes.indexOf(repeatMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    player.setRepeatMode(nextMode);
  }, [repeatMode]);

  const toggleShuffle = useCallback(() => {
    player.setShuffled(!isShuffled);
  }, [isShuffled]);

  const togglePlaylist = useCallback(() => {
    setShowPlaylist(!showPlaylist);
  }, [showPlaylist]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const repeatIcons = {
    off: '↻',
    file: '↻1',
    folder: '↻',
  };

  const repeatLabels = {
    off: '반복 없음',
    file: '한 곡 반복',
    folder: '폴더 반복',
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🎵 iCloud Music Player</h1>
        <div className="header-actions">
          <button 
            className={`btn ${showPlaylist ? 'active' : ''}`}
            onClick={togglePlaylist}
            aria-label="플레이리스트 토글"
          >
            📋
          </button>
          <button 
            className="btn primary"
            onClick={() => setShowFolderPicker(true)}
            disabled={isScanning}
          >
            {isScanning ? `스캔 중... ${scanProgress}%` : '📁 폴더 선택'}
          </button>
        </div>
      </header>

      {showPlaylist && (
        <aside className="playlist-sidebar">
          <div className="playlist-header">
            <h2>플레이리스트</h2>
            <button className="btn close-btn" onClick={togglePlaylist}>✕</button>
          </div>
          {playlists.length === 0 ? (
            <div className="empty-state">
              <p>📁 폴더 선택 버튼을 눌러 iCloud Drive 음악 폴더를 선택하세요</p>
            </div>
          ) : (
            <ul className="playlist-list">
              {playlists.map(playlist => (
                <li 
                  key={playlist.id} 
                  className={`playlist-item ${currentPlaylist?.id === playlist.id ? 'active' : ''}`}
                  onClick={() => handlePlaylistSelect(playlist)}
                >
                  <span className="playlist-name">{playlist.name}</span>
                  <span className="playlist-count">{playlist.tracks.length}곡</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}

      <main className="main-content">
        {currentPlaylist && tracks.length > 0 && (
          <div className="track-list">
            <div className="track-list-header">
              <h2>{currentPlaylist.name}</h2>
              <span className="track-count">{tracks.length}곡</span>
            </div>
            <ul className="tracks">
              {tracks.map((track, index) => (
                <li 
                  key={track.id} 
                  className={`track-item ${currentTrack?.id === track.id ? 'playing' : ''}`}
                  onClick={() => handleTrackClick(track, index)}
                >
                  <div className="track-info">
                    <span className="track-number">{index + 1}</span>
                    <div className="track-details">
                      <span className="track-title">{track.metadata?.title || track.name}</span>
                      <span className="track-artist">{track.metadata?.artist || '알 수 없는 아티스트'}</span>
                    </div>
                  </div>
                  <div className="track-meta">
                    <span className="track-duration">
                      {track.metadata?.duration ? formatTime(track.metadata.duration) : '--:--'}
                    </span>
                    <span className="track-size">{formatFileSize(track.size)}</span>
                    <button 
                      className="btn delete-btn"
                      onClick={(e) => handleDeleteTrack(track.id, e)}
                      aria-label="삭제"
                    >
                      🗑️
                    </button>
                  </div>
                  {currentTrack?.id === track.id && (
                    <span className="playing-indicator">♪</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(!currentPlaylist || tracks.length === 0) && !isScanning && (
          <div className="empty-state">
            <p>📁 폴더 선택 버튼을 눌러 iCloud Drive 음악 폴더를 선택하세요</p>
          </div>
        )}

        {isScanning && (
          <div className="scanning-overlay">
            <div className="scanning-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${scanProgress}%` }}
                ></div>
              </div>
              <p>음악 파일 스캔 중... {scanProgress}%</p>
            </div>
          </div>
        )}
      </main>

      <footer className="player-bar">
        {currentTrack && (
          <div className="now-playing">
            <div className="track-artwork">
              {currentTrack.metadata?.coverArt ? (
                <img src={currentTrack.metadata.coverArt} alt="Album art" />
              ) : (
                <span className="artwork-placeholder">🎵</span>
              )}
            </div>
            <div className="track-info">
              <span className="track-title">{currentTrack.metadata?.title || currentTrack.name}</span>
              <span className="track-artist">{currentTrack.metadata?.artist || '알 수 없는 아티스트'}</span>
            </div>
          </div>
        )}

        <div className="player-controls">
          <div className="progress-container">
            <span className="time current">{formatTime(currentTime)}</span>
            <input
              ref={progressRef}
              type="range"
              min="0"
              max="100"
              value={progress}
              onChange={handleSeek}
              className="progress-bar"
              aria-label="재생 위치"
            />
            <span className="time total">{formatTime(duration)}</span>
          </div>
          <div className="control-buttons">
            <button className="btn control-btn" onClick={toggleShuffle} aria-label={isShuffled ? '셔플 끄기' : '셔플 켜기'}>
              🔀
            </button>
            <button className="btn control-btn" onClick={handlePrev} aria-label="이전 곡">
              ⏮️
            </button>
            <button 
              className="btn control-btn play-btn" 
              onClick={togglePlayPause}
              aria-label={isPlaying ? '일시정지' : '재생'}
            >
              {isPlaying ? '⏸️' : '▶️'}
            </button>
            <button className="btn control-btn" onClick={handleNext} aria-label="다음 곡">
              ⏭️
            </button>
            <button 
              className={`btn control-btn ${repeatMode !== 'off' ? 'active' : ''}`}
              onClick={toggleRepeat}
              aria-label={`반복 모드: ${repeatLabels[repeatMode]}`}
            >
              {repeatIcons[repeatMode]}
            </button>
          </div>
          <div className="volume-container">
            <span className="volume-icon">🔊</span>
            <input
              ref={volumeRef}
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={handleVolumeChange}
              className="volume-slider"
              aria-label="볼륨"
            />
          </div>
        </div>
      </footer>

      {error && (
        <div className="toast error" role="alert">
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {showFolderPicker && (
        <div className="modal-overlay" onClick={() => setShowFolderPicker(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>음악 폴더 선택</h2>
            <p>iCloud Drive에서 음악 파일이 있는 폴더를 선택하세요.</p>
            <p className="hint">💡 iPhone의 "파일" 앱 {" > "} "iCloud Drive" 폴더를 선택하면 됩니다.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowFolderPicker(false)}>취소</button>
              <button className="btn primary" onClick={handlePickFolder}>폴더 선택</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;