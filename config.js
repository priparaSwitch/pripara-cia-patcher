// GitHub Pages의 프로젝트 하위 경로에서도 동작하도록 ./ 상대 경로를 사용합니다.
// SHA-256은 ExeFS 아이콘 변형 선택에만 사용합니다. 패치/결과 해시 검증은 하지 않습니다.
export const PATCH_CONFIG = Object.freeze({
  siteVersion: '2026.10.02.1',
  canonicalExefsSha256: 'c68a4ef55a90565c80ef4701952cd99b341b8df00c200b0a7dbad8727575ef48',
  title: '프리파라 노려라! 아이돌 그랑프리 No.1',
  expectedTitleId: '0004000000178300',
  romfsPatchPath: './patches/romfs.xdelta',
  romfsPatchIncluded: true,
  exefsVariants: [{
    sourceSha256: 'c68a4ef55a90565c80ef4701952cd99b341b8df00c200b0a7dbad8727575ef48',
    patchPath: './patches/exefs.bin.xdelta',
  }, {
    sourceSha256: 'b706722e8250035143a1059754a95975aa8595525f4911b763559e4783d79712',
    normalizeIcon: true,
    patchPath: './patches/exefs_variant.xdelta',
  }],
  outputName: 'pripara_patched.cia',
  maxOutputBytes: 460000000
});
