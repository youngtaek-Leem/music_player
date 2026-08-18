# AGENTS.md - iCloud Music Player

## 프로젝트 개요
iCloud Drive에 저장된 음악 파일을 웹 브라우저에서 재생하는 PWA. File System Access API를 사용해 사용자가 폴더를 선택하면 인덱싱하고 오프라인 재생 지원.

## 개발 명령어
```bash
npm run dev      # 개발 서버 (포트 3000)
npm run build    # 프로덕션 빌드 (dist/)
npm run preview  # 빌드 미리보기
npm run lint     # oxlint 검사
npm run typecheck # TypeScript 타입 검사
```

## 아키텍처
- **Pure Static Site** - 백엔드 없음, GitHub Pages 배포
- **File System Access API** - 사용자가 iCloud Drive 폴더 선택 권한 부여
- **IndexedDB (idb)** - 라이브러리 인덱스 + 재생 위치 영구 저장
- **HTML5 Audio API** - 네이티브 오디오 재생, 외부 의존성 없음
- **Service Worker (Workbox)** - 앱 셸 + 오디오 파일 캐싱으로 오프라인 재생
- **music-metadata** - mp3/m4a/flac/wav 메타데이터 파싱

## 핵심 파일 구조
```
src/
├── types.ts       # TypeScript 인터페이스 (Track, Playlist, PlaybackState, RepeatMode)
├── library.ts     # 폴더 스캔, 메타데이터 파싱, IndexedDB CRUD
├── player.ts      # AudioPlayer 클래스 (재생/셔플/반복/재개 로직)
├── App.tsx        # 메인 UI 컴포넌트
├── App.css        # 스타일 (CSS Custom Properties, 모바일 퍼스트)
└── main.tsx       # 엔트리 포인트
```

## 주요 컨벤션
- **상태 관리**: React useState + player/library 이벤트 구독 패턴
- **비동기**: async/await, 동시성 제어는 Promise.all + 배치 처리
- **에러 처리**: try/catch + 이벤트 emit으로 UI 토스트 표시
- **파일 핸들**: FileSystemFileHandle을 Track에 저장, 재생 시 getFile()로 Blob URL 생성
- **권한**: 브라우저 종료 시 권한 초기화 → 재방문 시 폴더 재선택 필요

## 중요한 제약사항
1. **iOS Safari HTTPS 필수** - GitHub Pages가 제공
2. **File System Access 권한** - 브라우저 닫으면 리셋, 재선택 필요
3. **대용량 라이브러리** - 점진적 스캔, 진행률 표시
4. **오디오 시킹** - Range Request 필요 (GitHub Pages 지원)
5. **메타데이터 파싱** - music-metadata는 ArrayBuffer 필요, 큰 파일 주의

## 재생 로직 (player.ts)
- `repeatMode`: 'off' | 'file' | 'folder' (순환)
- `isShuffled`: Fisher-Yates 셔플, 원본 큐 보존
- `resumeLastTrack()`: IndexedDB에서 마지막 상태 복원 (trackId, currentTime, queue, index, volume, repeat, shuffle)
- 5초마다 재생 위치 자동 저장

## 라이브러리 로직 (library.ts)
- `pickMusicFolder()`: showDirectoryPicker()로 폴더 선택
- `scanMusicFolder()`: 재귀 스캔, 지원 확장자(.mp3/.m4a/.flac/.wav/.aac/.ogg/.opus/.webm)
- `parseMetadata()`: music-metadata로 타이틀/아티스트/앨범/커버아트/길이 추출
- IndexedDB 스키마: tracks, playlists, playbackState, settings

## 배포 (GitHub Pages)
1. `npm run build` → `dist/` 생성
2. GitHub Actions로 `dist/`를 `gh-pages` 브랜치에 푸시
3. Settings > Pages > Deploy from branch > gh-pages

## 개발 시 주의사항
- **모바일 테스트 필수** - iOS Safari에서 File System Access API 동작 확인
- **오프라인 테스트** - Service Worker 등록 후 네트워크 차단 테스트
- **대용량 폴더** - 1000+ 곡 스캔 시 메모리/성능 확인
- **커버아트** - Blob URL 생성 후 정리 안 하면 메모리 누수 주의

## 타입스크립트 설정
- strict mode on
- React 19 + JSX transform
- 경로 별칭 없음 (단순 구조)

## 향후 개선 사항
- [ ] 가사 표시 (LRC 파싱)
- [ ] 이퀄라이저 (Web Audio API)
- [ ] 테마 커스터마이징
- [ ] 재생목록 내보내기/가져오기