import { createSHA256, createMD5 } from 'hash-wasm';

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
    throw new Error('알 수 없는 작업입니다.');
  } catch (error) { self.postMessage({ type: 'error', message: error?.message || String(error) }); }
};
