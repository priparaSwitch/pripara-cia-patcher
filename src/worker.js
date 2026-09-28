import { createSHA256, createMD5 } from 'hash-wasm';
import { BinFile, VCDIFF } from './vendor/vcdiff.js';

async function digest(file, report) {
  const sha = await createSHA256(), md5 = await createMD5();
  const chunkSize = 4 * 1024 * 1024;
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const part = new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer());
    sha.update(part); md5.update(part);
    report(Math.min(100, (offset + part.length) / file.size * 100));
  }
  return { sha256: sha.digest(), md5: md5.digest() };
}
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'hash') {
      const hashes = await digest(data.file, percent => self.postMessage({ type: 'progress', percent }));
      self.postMessage({ type: 'result', ...hashes });
      return;
    }
    if (data.type !== 'patch') throw new Error('알 수 없는 작업입니다.');
    self.postMessage({ type: 'progress', stage: '패치 데이터 준비 중' });
    const [sourceBuffer, patchBuffer] = await Promise.all([data.source.arrayBuffer(), data.patch.arrayBuffer()]);
    self.postMessage({ type: 'progress', stage: 'Xdelta 패치 적용 중' });
    const decoded = VCDIFF.fromFile(new BinFile(patchBuffer)).apply(new BinFile(sourceBuffer), false, data.maxOutputBytes);
    if (decoded.fileSize > data.maxOutputBytes) throw new Error('패치 결과가 설정된 최대 크기를 초과합니다.');
    if (data.outputSha256) {
      self.postMessage({ type: 'progress', stage: '결과 파일 검증 중' });
      const sha = await createSHA256();
      for (let i = 0; i < decoded.fileSize; i += 4 * 1024 * 1024) {
        sha.update(decoded._u8array.subarray(i, i + 4 * 1024 * 1024));
        self.postMessage({ type: 'progress', stage: '결과 파일 검증 중', percent: Math.min(100, (i + 4 * 1024 * 1024) / decoded.fileSize * 100) });
      }
      if (sha.digest() !== data.outputSha256.toLowerCase()) throw new Error('결과 CIA의 SHA-256이 일치하지 않습니다.');
    }
    self.postMessage({ type: 'result', output: decoded._u8array.buffer }, [decoded._u8array.buffer]);
  } catch (error) { self.postMessage({ type: 'error', message: error?.message || String(error) }); }
};
