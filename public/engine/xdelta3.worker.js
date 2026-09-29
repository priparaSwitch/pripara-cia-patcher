// Adapted from kotcrab/xdelta-wasm (Apache-2.0). All file access stays in this worker.
import createXdelta3Module from './xdelta3.js';

const sourceReader = new FileReaderSync();
const bufferSize = 4 * 1024 * 1024;
const cacheSize = 16;

self.onmessage = async ({ data }) => {
  if (data?.type !== 'patch') return;
  let engine;
  let errorMessage = '';
  let access;
  try {
    access = await data.outputHandle.createSyncAccessHandle();
    let outputSize = 0;
    engine = await createXdelta3Module();
    const read = (file, pointer, offset, size) => {
      offset = Number(offset);
      if (!Number.isSafeInteger(offset) || offset < 0 || size < 0) throw new Error('잘못된 파일 읽기 위치입니다.');
      const part = sourceReader.readAsArrayBuffer(file.slice(offset, offset + size));
      engine.HEAP8.set(new Uint8Array(part), pointer);
      return part.byteLength;
    };
    engine.readSource = (pointer, offset, size) => read(data.source, pointer, offset, size);
    engine.readPatch = (pointer, offset, size) => read(data.patch, pointer, offset, size);
    engine.outputFile = (pointer, size) => {
      if (outputSize + size > data.maxOutputBytes) throw new Error('패치 결과 크기가 허용 범위를 넘었습니다.');
      const bytes = new Uint8Array(engine.HEAP8.buffer, pointer, size);
      const written = access.write(bytes, { at: outputSize });
      if (written !== size) throw new Error('임시 파일에 패치 결과를 기록하지 못했습니다.');
      outputSize += size;
      self.postMessage({ type: 'progress', size: outputSize });
    };
    engine.reportError = pointer => { errorMessage = engine.UTF8ToString(pointer); };
    const result = engine.callMain([String(bufferSize), String(cacheSize), 'false']);
    if (result !== 0) throw new Error(errorMessage || `Xdelta3 오류 코드 ${result}`);
    access.flush();
    access.close();
    access = null;
    self.postMessage({ type: 'done', size: outputSize });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || errorMessage || String(error) });
  } finally {
    if (access) access.close();
  }
};
