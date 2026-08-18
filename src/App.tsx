import { useState, useEffect, useCallback, useRef } from 'react';
import { player } from './player';
import { 
  pickMusicFolder, 
  pickMusicFolderFallback,
  scanMusicFolder, 
  scanMusicFolderFromFiles,
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

function App() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentPlaylist, setCurrentPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showPlaylistSheet, setShowPlaylistSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [isShuffled, setIsShuffled] = useState(false);
  const progressRef = useRef<HTMLInputElement>(null);
  const volumeRef = useRef<HTMLInputElement>(null);
  const playerBarRef = useRef<HTMLDivElement>(null);

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
          setError('스캔 중 오류가 발생했습니다');
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
          const errorMsg = event.payload instanceof Error ? event.payload.message : '재생 오류가 발생했습니다';
          setError(errorMsg);
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
    const hasFileSystemAccess = 'showDirectoryPicker' in window && window.isSecureContext;
    
    if (hasFileSystemAccess) {
      const handle = await pickMusicFolder();
      if (handle) {
        setShowFolderPicker(false);
        await scanMusicFolder(handle);
      }
    } else {
      const files = await pickMusicFolderFallback();
      if (files && files.length > 0) {
        setShowFolderPicker(false);
        const folderName = 'iCloud Music';
        await scanMusicFolderFromFiles(files, folderName);
      }
    }
  }, []);

  const handlePlaylistSelect = useCallback((playlist: Playlist) => {
    setCurrentPlaylist(playlist);
    setShowPlaylistSheet(false);
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

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const repeatLabels = {
    off: '반복 안 함',
    file: '한 곡 반복',
    folder: '전체 반복',
  };

  return (
    <div className="app">
      {/* Background blur layer for sheet */}
      {showPlaylistSheet && (
        <div 
          className="sheet-backdrop" 
          onClick={() => setShowPlaylistSheet(false)}
          aria-hidden="true"
        />
      )}

      {/* Header */}
      <header className="header">
        <div className="header-left">
          <h1 className="header-title">Music</h1>
        </div>
        <div className="header-right">
          <button 
            className={`icon-btn ${showPlaylistSheet ? 'active' : ''}`}
            onClick={() => setShowPlaylistSheet(true)}
            aria-label="플레이리스트"
            aria-expanded={showPlaylistSheet}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </button>
          <button 
            className="icon-btn primary"
            onClick={() => setShowFolderPicker(true)}
            disabled={isScanning}
            aria-label="음악 폴더 추가"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
        </div>
      </header>

      {/* Playlist Sheet */}
      <aside className={`playlist-sheet ${showPlaylistSheet ? 'open' : ''}`} role="dialog" aria-label="플레이리스트">
        <div className="sheet-handle" aria-hidden="true"></div>
        <div className="sheet-content">
          <div className="sheet-header">
            <h2 className="sheet-title">플레이리스트</h2>
            <button className="icon-btn" onClick={() => setShowPlaylistSheet(false)} aria-label="닫기">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          {playlists.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <p className="empty-title">음악이 없습니다</p>
              <p className="empty-desc">iCloud Drive에서 음악 폴더를 선택해 보세요</p>
              <button className="btn primary" onClick={() => { setShowPlaylistSheet(false); setShowFolderPicker(true); }}>
                폴더 선택
              </button>
            </div>
          ) : (
            <ul className="playlist-list" role="listbox">
              {playlists.map(playlist => (
                <li 
                  key={playlist.id} 
                  className={`playlist-item ${currentPlaylist?.id === playlist.id ? 'active' : ''}`}
                  onClick={() => handlePlaylistSelect(playlist)}
                  role="option"
                  aria-selected={currentPlaylist?.id === playlist.id}
                >
                  <div className="playlist-item-content">
                    <div className="playlist-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                      </svg>
                    </div>
                    <div className="playlist-info">
                      <span className="playlist-name">{playlist.name}</span>
                      <span className="playlist-count">{playlist.tracks.length}곡</span>
                    </div>
                  </div>
                  {currentPlaylist?.id === playlist.id && (
                    <svg className="checkmark" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {currentPlaylist && tracks.length > 0 && !currentPlaylist.isFallback && (
          <div className="track-list">
            <div className="track-list-header">
              <div>
                <h2 className="track-list-title">{currentPlaylist.name}</h2>
                <p className="track-list-subtitle">{tracks.length}곡</p>
              </div>
            </div>
            <ul className="tracks" role="listbox">
              {tracks.map((track, index) => (
                <li 
                  key={track.id} 
                  className={`track-item ${currentTrack?.id === track.id ? 'playing' : ''}`}
                  onClick={() => handleTrackClick(track, index)}
                  role="option"
                  aria-selected={currentTrack?.id === track.id}
                >
                  <div className="track-artwork-small">
                    {track.metadata?.coverArt ? (
                      <img src={track.metadata.coverArt} alt="" loading="lazy" />
                    ) : (
                      <div className="artwork-placeholder-small">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polygon points="10 8 16 12 10 16 10 8"></polygon>
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="track-info">
                    <span className="track-title">{track.metadata?.title || track.name}</span>
                    <span className="track-artist">{track.metadata?.artist || '알 수 없는 아티스트'}</span>
                  </div>
                  <div className="track-meta">
                    <span className="track-duration">
                      {track.metadata?.duration ? formatTime(track.metadata.duration) : '--:--'}
                    </span>
                    <button 
                      className="icon-btn delete-btn"
                      onClick={(e) => handleDeleteTrack(track.id, e)}
                      aria-label="삭제"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                  {currentTrack?.id === track.id && (
                    <div className="playing-indicator" aria-hidden="true">
                      <span className="eq-bar"></span>
                      <span className="eq-bar"></span>
                      <span className="eq-bar"></span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(!currentPlaylist || tracks.length === 0 || currentPlaylist.isFallback) && !isScanning && (
          <div className="empty-state full-screen">
            <div className="empty-icon">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
              </svg>
            </div>
            {currentPlaylist?.isFallback ? (
              <>
                <p className="empty-title">파일을 다시 선택해주세요</p>
                <p className="empty-desc">앱을 다시 열면 파일 접근 권한이 초기화됩니다.<br/>폴더 선택 버튼을 눌러 음악 파일을 다시 선택하세요.</p>
              </>
            ) : (
              <>
                <p className="empty-title">음악을 추가해 보세요</p>
                <p className="empty-desc">iCloud Drive의 음악 폴더를 선택하면<br/>자동으로 라이브러리가 생성됩니다</p>
              </>
            )}
            <button className="btn primary" onClick={() => setShowFolderPicker(true)}>
              <svg className="btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              {currentPlaylist?.isFallback ? '다시 선택' : '폴더 선택'}
            </button>
          </div>
        )}

        {isScanning && (
          <div className="scanning-overlay">
            <div className="scanning-card">
              <div className="scanning-spinner" aria-hidden="true"></div>
              <p className="scanning-title">음악 파일 스캔 중</p>
              <div className="scanning-progress-bar">
                <div 
                  className="scanning-progress-fill" 
                  style={{ width: `${scanProgress}%` }}
                  role="progressbar"
                  aria-valuenow={scanProgress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                ></div>
              </div>
              <p className="scanning-percent">{scanProgress}%</p>
            </div>
          </div>
        )}
      </main>

      {/* Mini Player Bar */}
      <footer className="player-bar" ref={playerBarRef} role="region" aria-label="재생 컨트롤">
        {currentTrack && (
          <div className="now-playing">
            <div className="track-artwork">
              {currentTrack.metadata?.coverArt ? (
                <img src={currentTrack.metadata.coverArt} alt="" loading="lazy" />
              ) : (
                <div className="artwork-placeholder">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polygon points="10 8 16 12 10 16 10 8"></polygon>
                  </svg>
                </div>
              )}
              {isPlaying && <div className="artwork-ring" aria-hidden="true"></div>}
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
            <div className="progress-wrapper">
              <input
                ref={progressRef}
                type="range"
                min="0"
                max="100"
                value={progress}
                onChange={handleSeek}
                className="progress-bar"
                aria-label="재생 위치"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
              />
              <div className="progress-fill" style={{ width: `${progress}%` }} aria-hidden="true"></div>
              <div className="progress-thumb" style={{ left: `${progress}%` }} aria-hidden="true"></div>
            </div>
            <span className="time total">{formatTime(duration)}</span>
          </div>
          <div className="control-buttons">
            <button 
              className={`icon-btn control-btn ${isShuffled ? 'active' : ''}`}
              onClick={toggleShuffle}
              aria-label={isShuffled ? '셔플 끄기' : '셔플 켜기'}
              aria-pressed={isShuffled}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 3 21 3 21 8"></polyline>
                <line x1="4" y1="20" x2="21" y2="3"></line>
                <polyline points="21 16 21 21 16 21"></polyline>
                <line x1="15" y1="15" x2="21" y2="21"></line>
                <line x1="4" y1="4" x2="21" y2="21"></line>
              </svg>
            </button>
            <button 
              className="icon-btn control-btn"
              onClick={handlePrev}
              aria-label="이전 곡"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="19 20 9 12 19 4 19 20"></polygon>
                <line x1="5" y1="19" x2="5" y2="5"></line>
              </svg>
            </button>
            <button 
              className="icon-btn control-btn play-btn"
              onClick={togglePlayPause}
              aria-label={isPlaying ? '일시정지' : '재생'}
            >
              {isPlaying ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16"></rect>
                  <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              )}
            </button>
            <button 
              className="icon-btn control-btn"
              onClick={handleNext}
              aria-label="다음 곡"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 4 15 12 5 20 5 4"></polygon>
                <line x1="19" y1="5" x2="19" y2="19"></line>
              </svg>
            </button>
            <button 
              className={`icon-btn control-btn ${repeatMode !== 'off' ? 'active' : ''}`}
              onClick={toggleRepeat}
              aria-label={`반복 모드: ${repeatLabels[repeatMode]}`}
              aria-pressed={repeatMode !== 'off'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9"></polyline>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                <polyline points="7 23 3 19 7 15"></polyline>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                {repeatMode === 'file' && (
                  <text x="12" y="12" fontSize="8" fill="currentColor" textAnchor="middle" dominantBaseline="middle">1</text>
                )}
              </svg>
            </button>
          </div>
          <div className="volume-container">
            <button 
              className="icon-btn volume-btn"
              onClick={() => player.setVolume(volume > 0 ? 0 : 1)}
              aria-label={volume > 0 ? '음소거' : '음소거 해제'}
              aria-pressed={volume === 0}
            >
              {volume === 0 ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <line x1="23" y1="9" x2="17" y2="15"></line>
                  <line x1="17" y1="9" x2="23" y2="15"></line>
                </svg>
              ) : volume < 0.5 ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
              )}
            </button>
            <div className="volume-wrapper">
              <input
                ref={volumeRef}
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                className="volume-slider"
                aria-label="볼륨"
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={volume}
              />
              <div className="volume-fill" style={{ width: `${volume * 100}%` }} aria-hidden="true"></div>
              <div className="volume-thumb" style={{ left: `${volume * 100}%` }} aria-hidden="true"></div>
            </div>
          </div>
        </div>
      </footer>

      {/* Toast */}
      {error && (
        <div className="toast" role="alert" aria-live="polite">
          <span>{error}</span>
          <button className="toast-close" onClick={() => setError(null)} aria-label="닫기">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      )}

      {/* Folder Picker Modal */}
      {showFolderPicker && (
        <div className="modal-overlay" onClick={() => setShowFolderPicker(false)} role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" aria-hidden="true"></div>
            <h2 id="modal-title" className="modal-title">음악 폴더 선택</h2>
            <p className="modal-desc">iCloud Drive에서 음악 파일이 있는 폴더를 선택하세요.</p>
            <p className="modal-hint">💡 iPhone의 "파일" 앱 {" > "} "iCloud Drive" 폴더를 선택하면 됩니다.</p>
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