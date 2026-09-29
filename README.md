# 프리파라 CIA 브라우저 패처

GitHub Pages에서 실행하는 정적 웹페이지입니다. CIA는 브라우저의 File API로 읽으며 업로드 코드/API가 없습니다. 서버 패치는 `fetch`로 **브라우저가 다운로드**하여 같은 브라우저의 Web Worker에서 적용합니다.

## 배포 전 설정

1. `config.js`의 `expectedTitleId`에 대상 게임의 16자리 Title ID를 넣습니다. 이 사이트는 TMD와 Ticket의 Title ID가 일치하고, CIA 콘텐츠 암호화 플래그가 모두 꺼져 있으며, 메인 NCCH의 NoCrypto 플래그가 켜진 CIA만 허용합니다.
2. 결과 CIA의 최대 크기(`maxOutputBytes`)를 넣습니다. 여러 원본에서 서로 다른 CIA가 만들어지므로 `outputSha256`은 기본적으로 비워 둡니다. 특정 결과 한 종류만 허용할 때 설정할 수 있습니다.
3. `public/patches/game.xdelta`에 배포할 패치를 놓거나 `patchPath`를 상대 경로로 바꿉니다. Xdelta3 LZMA 보조 압축 패치를 그대로 사용할 수 있습니다.
4. `npm install`, `npm run build` 실행 후 `dist/`를 GitHub Pages에 배포합니다. GitHub Actions에서는 `npm ci`, `npm run build`로 생성할 수 있습니다. Vite의 상대 `base` 설정은 프로젝트 Pages 경로를 지원합니다.

## 주의

- 패치 경로에는 같은 사이트의 상대 경로를 사용하세요. 빌드된 JS는 서버에 CGI/업로드 엔드포인트를 만들지 않습니다.
- Xdelta3 WebAssembly 엔진은 사용자의 브라우저 Worker에서 CIA와 패치를 부분적으로 읽습니다. 출력은 브라우저에 조각으로 모아 다운로드하므로 결과 CIA 크기만큼의 브라우저 메모리가 필요할 수 있습니다. PC Chrome/Edge에서 실제 CIA로 적용하고 결과 SHA-256을 확인하세요.
- CIA 검사는 브라우저에서 작은 메타데이터 조각만 읽습니다. 이 구조 검사는 원본의 전체 바이트 동일성을 보증하지 않습니다. Xdelta 적용 오류 또는 출력 파일의 게임 실행 실패 가능성은 실제 CIA 종류별로 시험하세요. 출력 진행률의 분모는 `maxOutputBytes`입니다.
- 출력 파일명은 `config.js`의 `outputName`을 사용합니다. 브라우저의 다운로드 설정에 따라 저장 위치는 달라질 수 있습니다.
- 서드파티 라이브러리: kotcrab/xdelta-wasm의 Xdelta3 WebAssembly 엔진(Apache-2.0, `public/engine`), hash-wasm(MIT). `THIRD_PARTY_NOTICES.md` 참고.
