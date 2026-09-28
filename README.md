# 프리파라 CIA 브라우저 패처

GitHub Pages에서 실행하는 정적 웹페이지입니다. CIA는 브라우저의 File API로 읽으며 업로드 코드/API가 없습니다. 서버 패치는 `fetch`로 **브라우저가 다운로드**하여 같은 브라우저의 Web Worker에서 적용합니다.

## 배포 전 설정

1. `config.js`에 정확한 원본 CIA의 바이트 크기, SHA-256, MD5를 넣습니다. 세 값이 없으면 패치 버튼은 비활성화됩니다.
2. 결과 CIA의 예상 최대 크기(`maxOutputBytes`)와 가능하면 결과 SHA-256을 넣습니다.
3. `public/patches/game.xdelta`에 배포할 패치를 놓거나 `patchPath`를 상대 경로로 바꿉니다. Xdelta3 LZMA 보조 압축 패치를 그대로 사용할 수 있습니다.
4. `npm install`, `npm run build` 실행 후 `dist/`를 GitHub Pages에 배포합니다. GitHub Actions에서는 `npm ci`, `npm run build`로 생성할 수 있습니다. Vite의 상대 `base` 설정은 프로젝트 Pages 경로를 지원합니다.

## 주의

- 패치 경로에는 같은 사이트의 상대 경로를 사용하세요. 빌드된 JS는 서버에 CGI/업로드 엔드포인트를 만들지 않습니다.
- Xdelta3 WebAssembly 엔진은 사용자의 브라우저 Worker에서 CIA와 패치를 부분적으로 읽습니다. 출력은 브라우저에 조각으로 모아 다운로드하므로 결과 CIA 크기만큼의 브라우저 메모리가 필요할 수 있습니다. PC Chrome/Edge에서 실제 CIA로 적용하고 결과 SHA-256을 확인하세요.
- 진행 막대의 CIA 해시 계산과 Xdelta 출력은 실제 처리된 바이트 기준입니다. 출력 진행률의 분모는 `maxOutputBytes`입니다.
- 출력 파일명은 `config.js`의 `outputName`을 사용합니다. 브라우저의 다운로드 설정에 따라 저장 위치는 달라질 수 있습니다.
- 서드파티 라이브러리: kotcrab/xdelta-wasm의 Xdelta3 WebAssembly 엔진(Apache-2.0, `public/engine`), hash-wasm(MIT). `THIRD_PARTY_NOTICES.md` 참고.
