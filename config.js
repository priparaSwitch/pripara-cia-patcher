// 이 파일만 편집해서 배포할 게임의 Title ID 및 패치를 지정합니다.
// GitHub Pages의 프로젝트 하위 경로에서도 동작하도록 ./ 로 시작하는 상대 경로를 사용하세요.
export const PATCH_CONFIG = Object.freeze({
  title: '프리파라 노려라! 아이돌 그랑프리 No.1',
  expectedTitleId: '0004000000178300', // 프리파라 노려라! 아이돌 그랑프리 No.1
  patchPath: './patches/game.xdelta',
  outputName: 'pripara_patched.cia',
  outputSha256: '',                      // 선택 사항: 특정 결과 CIA 한 종류만 허용할 경우 설정
  maxOutputBytes: 456370816             // 필수: 결과 CIA보다 넉넉한 최대 크기(바이트)
});
