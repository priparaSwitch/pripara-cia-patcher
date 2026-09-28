# 프리파라 CIA 브라우저 패처

GitHub Pages에서 실행하는 정적 웹페이지입니다. CIA는 브라우저의 File API로 읽으며 업로드 코드/API가 없습니다. 서버 패치는 `fetch`로 **브라우저가 다운로드**하여 같은 브라우저의 Web Worker에서 적용합니다.

## 배포 전 설정

1. `config.js`에 정확한 원본 CIA의 바이트 크기, SHA-256, MD5를 넣습니다. 세 값이 없으면 패치 버튼은 비활성화됩니다.
2. 결과 CIA의 예상 최대 크기(`maxOutputBytes`)와 가능하면 결과 SHA-256을 넣습니다.
3. `public/patches/game.xdelta`에 배포할 패치를 놓거나 `patchPath`를 상대 경로로 바꿉니다.
4. `npm install`, `npm run build` 실행 후 `dist/`를 GitHub Pages에 배포합니다. GitHub Actions에서는 `npm ci`, `npm run build`로 생성할 수 있습니다. Vite의 상대 `base` 설정은 프로젝트 Pages 경로를 지원합니다.

## 주의

- 패치 경로에는 같은 사이트의 상대 경로를 사용하세요. 빌드된 JS는 서버에 CGI/업로드 엔드포인트를 만들지 않습니다.
- 현재 디코더(`rom-patcher`)는 원본과 결과물을 메모리에 올리는 방식입니다. 500MB CIA에서는 메모리 부족으로 실패할 수 있습니다. Xdelta3의 보조 압축(secondary compression)이 들어간 패치는 이 엔진에서 지원하지 않습니다. 실제 배포 전 대상 CIA와 Xdelta 패치로 PC Chrome/Edge에서 시험하고 결과 SHA-256을 확인하세요.
- 진행 막대에서 해시 계산은 실제 진행률입니다. Xdelta 복원 중에는 엔진이 진행률을 제공하지 않아 처리 중 표시를 사용합니다.
- 출력 파일명은 `config.js`의 `outputName`을 사용합니다. 브라우저의 다운로드 설정에 따라 저장 위치는 달라질 수 있습니다.
- 서드파티 라이브러리: Marc Robledo의 RomPatcher.js VCDIFF/BinFile 부분(MIT, `src/vendor/vcdiff.js`), hash-wasm(MIT).
