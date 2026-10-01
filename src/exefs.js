import { shaBlob } from './rebuild.js';

const fromHex = hex => Uint8Array.from(hex.match(/../g), byte => parseInt(byte, 16));

function iconSection(bytes) {
  if (bytes.length < 0x200) throw new Error('ExeFS 헤더가 너무 짧습니다.');
  for (let index = 0; index < 10; index++) {
    const at = index * 0x10;
    const name = bytes.subarray(at, at + 8);
    if (String.fromCharCode(...name).replace(/\0.*$/, '') !== 'icon') continue;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const offset = view.getUint32(at + 8, true) + 0x200;
    const size = view.getUint32(at + 12, true);
    if (size !== 0x36c0 || offset + size > bytes.length)
      throw new Error('지원하지 않는 ExeFS 아이콘 배치입니다.');
    return { offset, size, hashOffset: 0x1e0 - index * 0x20 };
  }
  throw new Error('ExeFS 아이콘을 찾을 수 없습니다.');
}

// Preserve the known icon variant without SHA-256 validation.
// Recalculate the icon hash stored in the ExeFS header for the generated CIA.
export async function normalizeExeFs(source) {
  const bytes = new Uint8Array(await source.arrayBuffer());
  const { offset, size, hashOffset } = iconSection(bytes);
  const originalIcon = bytes.slice(offset, offset + size);
  const changed = offset + 0x2018;
  if (bytes[changed] !== 0xff || bytes[changed + 1] !== 0xff ||
      bytes[changed + 2] !== 0xff || bytes[changed + 3] !== 0x7f)
    throw new Error('확인되지 않은 ExeFS 아이콘 차이입니다.');
  bytes.set([0x01, 0x00, 0x00, 0x00], changed);
  const digest = await shaBlob(new Blob([bytes.subarray(offset, offset + size)]));
  bytes.set(fromHex(digest), hashOffset);
  return { normalized: new Blob([bytes]), originalIcon };
}

export async function restoreExeFsIcon(patched, originalIcon) {
  const bytes = new Uint8Array(await patched.arrayBuffer());
  const { offset, size, hashOffset } = iconSection(bytes);
  if (size !== originalIcon.length) throw new Error('ExeFS 아이콘 크기가 다릅니다.');
  bytes.set(originalIcon, offset);
  const digest = await shaBlob(new Blob([originalIcon]));
  bytes.set(fromHex(digest), hashOffset);
  return new Blob([bytes]);
}
