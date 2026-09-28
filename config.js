// 이 파일만 편집해서 배포할 게임의 기준 파일 및 패치를 지정합니다.
// GitHub Pages의 프로젝트 하위 경로에서도 동작하도록 ./ 로 시작하는 상대 경로를 사용하세요.
export const PATCH_CONFIG = Object.freeze({
  title: '프리파라 노려라! 아이돌 그랑프리 No.1',
  expectedSize: null,              // 예: 524288000 (바이트)
  expectedSha256: '',              // 원본 CIA SHA-256 (64자리 16진수)
  expectedMd5: '',                 // 원본 CIA MD5 (32자리 16진수)
  patchPath: './patches/game.xdelta',
  outputName: 'pripara_patched.cia',
  outputSha256: '',                // 선택 사항: 패치 적용 후 결과 파일 검증
  maxOutputBytes: null             // 필수: 결과 CIA보다 넉넉한 최대 크기(바이트)
});
