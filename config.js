// GitHub Pages의 프로젝트 하위 경로에서도 동작하도록 ./ 상대 경로를 사용합니다.
export const PATCH_CONFIG = Object.freeze({
  siteVersion: '2026.09.29.1',
  title: '프리파라 노려라! 아이돌 그랑프리 No.1',
  expectedTitleId: '0004000000178300',
  romfsPatchPath: './patches/romfs.xdelta',
  sourceRomfsSha256: '775f000c709a7d0455d31d84a919e9d4a5effad0e15f5aabeabd9cbcd626a5e6',
  targetRomfsSha256: 'c01138d8f153821252a18efc90e9a1030b5a747850dd3ddc601ec9449b2955af',
  romfsPatchSha256: '46d5d0d5a7694f4a8d6481300c292d718f9b179e0379d17e00a8625dafd8647e',
  romfsPatchIncluded: true,
  exefsVariants: [{
    sourceSha256: 'c68a4ef55a90565c80ef4701952cd99b341b8df00c200b0a7dbad8727575ef48',
    targetSha256: '95e65ba0cdb0babd8183a916368d27f5808144c4251ebddb757959b065663561',
    patchPath: './patches/exefs.bin.xdelta',
    patchSha256: '8f55112933c0d06a1d96cb9ef61331bdddd366bfae4986f512f7107590f39886',
  }, {
    sourceSha256: 'b706722e8250035143a1059754a95975aa8595525f4911b763559e4783d79712',
    targetSha256: '0ff123ce14056b1ce8512477dbc7dbd46b65a968f639c3774cf9693ea5d924e6',
    patchPath: './patches/exefs_variant.xdelta',
    patchSha256: 'f8d49f5736ae0ccea17759fa9cc89b1e04331cf00d8bbab40b1f944c31222e13',
  }],
  outputName: 'pripara_patched.cia',
  maxOutputBytes: 460000000
});
