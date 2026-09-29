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

async function verifiedIcon(bytes) {
  const section = iconSection(bytes);
  const icon = bytes.slice(section.offset, section.offset + section.size);
  const digest = await shaBlob(new Blob([icon]));
  const stored = bytes.subarray(section.hashOffset, section.hashOffset + 32);
  if (!stored.every((value, index) => value === fromHex(digest)[index]))
    throw new Error('ExeFS 아이콘의 헤더 해시가 일치하지 않습니다.');
  return { ...section, icon, digest };
}

// Only the verified icon variant is accepted. The four known bytes and its
// header digest are normalized, then the full ExeFS hash must match the base.
export async function normalizeExeFs(source, canonicalHash, canonicalIconHash) {
  const bytes = new Uint8Array(await source.arrayBuffer());
  const { offset, size, hashOffset, icon } = await verifiedIcon(bytes);
  const changed = offset + 0x2018;
  if (bytes[changed] !== 0xff || bytes[changed + 1] !== 0xff ||
      bytes[changed + 2] !== 0xff || bytes[changed + 3] !== 0x7f)
    throw new Error('확인되지 않은 ExeFS 아이콘 차이입니다.');
  bytes.set([0x01, 0x00, 0x00, 0x00], changed);
  if (await shaBlob(new Blob([bytes.subarray(offset, offset + size)])) !== canonicalIconHash)
    throw new Error('ExeFS 아이콘 정규화 결과가 예상과 다릅니다.');
  bytes.set(fromHex(canonicalIconHash), hashOffset);
  const normalized = new Blob([bytes]);
  if (await shaBlob(normalized) !== canonicalHash)
    throw new Error('ExeFS의 다른 부분도 기준 원본과 다릅니다.');
  return { normalized, originalIcon: icon };
}

export async function restoreExeFsIcon(patched, originalIcon, canonicalIconHash) {
  const bytes = new Uint8Array(await patched.arrayBuffer());
  const section = await verifiedIcon(bytes);
  if (section.digest !== canonicalIconHash || section.size !== originalIcon.length)
    throw new Error('패치가 아이콘을 변경했습니다. 공통 경로로 처리할 수 없습니다.');
  bytes.set(originalIcon, section.offset);
  const digest = await shaBlob(new Blob([originalIcon]));
  bytes.set(fromHex(digest), section.hashOffset);
  return new Blob([bytes]);
}
