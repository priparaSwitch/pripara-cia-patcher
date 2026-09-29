import { createSHA256 } from 'hash-wasm';

const align = (n, unit) => Math.ceil(n / unit) * unit;
const pad = n => new Uint8Array(n);
const hexBytes = hex => Uint8Array.from(hex.match(/../g), byte => parseInt(byte, 16));
const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

export async function shaBlob(blob) {
  const hash = await createSHA256();
  const reader = blob.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
    }
  } finally { reader.releaseLock(); }
  return hash.digest();
}

async function shaSmall(blob) {
  return hexBytes(await shaBlob(blob));
}

export async function buildMainNcch(file, cia, exefs, romfs) {
  const header = cia.ncch.slice();
  const h = view(header);
  if (header[0x18E] !== 0) throw new Error('512바이트가 아닌 NCCH media unit은 지원하지 않습니다.');
  const exefsOffset = h.getUint32(0x1A0, true) * 512;
  const oldExefsSize = h.getUint32(0x1A4, true) * 512;
  const oldRomfsOffset = h.getUint32(0x1B0, true) * 512;
  const oldRomfsSize = h.getUint32(0x1B4, true) * 512;
  const exefsHashSize = h.getUint32(0x1A8, true) * 512;
  const romfsHashSize = h.getUint32(0x1B8, true) * 512;
  if (exefsOffset < 0x200 || oldRomfsOffset < exefsOffset + oldExefsSize ||
      oldRomfsOffset + oldRomfsSize > cia.main.size ||
      !exefsHashSize || exefsHashSize > exefs.size ||
      !romfsHashSize || romfsHashSize > romfs.size ||
      exefs.size % 512 || romfs.size % 512) {
    throw new Error('지원하지 않는 NCCH 영역 배치 또는 크기입니다.');
  }
  const romfsOffset = align(exefsOffset + exefs.size, 512);
  const size = align(romfsOffset + romfs.size, 512);
  h.setUint32(0x104, size / 512, true);
  h.setUint32(0x1A4, exefs.size / 512, true);
  h.setUint32(0x1B0, romfsOffset / 512, true);
  h.setUint32(0x1B4, romfs.size / 512, true);
  header.set(await shaSmall(exefs.slice(0, exefsHashSize)), 0x1C0);
  header.set(await shaSmall(romfs.slice(0, romfsHashSize)), 0x1E0);
  const prefix = file.slice(cia.main.position + 0x200, cia.main.position + exefsOffset);
  return new Blob([header, prefix, exefs, pad(romfsOffset - exefsOffset - exefs.size), romfs]);
}

export async function buildCia(file, cia, main) {
  const tmd = cia.tmd.slice();
  const t = view(tmd);
  const recordStart = cia.sig + 0x9C4;
  const index0 = cia.contents.find(x => x.index === 0);
  if (!index0 || main.size % 64) throw new Error('메인 콘텐츠 크기가 올바르지 않습니다.');
  t.setBigUint64(index0.recordOffset + 8, BigInt(main.size), false);
  tmd.set(await shaSmall(main), index0.recordOffset + 0x10);

  // TMD hashes: each used content-info record covers a run of chunk records.
  const infoStart = cia.sig + 0xC4;
  let covered = 0;
  for (let i = 0; i < 64; i++) {
    const at = infoStart + i * 0x24;
    const count = t.getUint16(at + 2, false);
    if (!count) continue;
    const offset = t.getUint16(at, false);
    if (offset !== covered || covered + count > cia.contents.length)
      throw new Error('지원하지 않는 TMD 콘텐츠 정보 구성입니다.');
    tmd.set(await shaSmall(new Blob([tmd.subarray(recordStart + offset * 0x30,
      recordStart + (offset + count) * 0x30)])), at + 4);
    covered += count;
  }
  if (covered !== cia.contents.length) throw new Error('TMD 콘텐츠 정보가 불완전합니다.');
  tmd.set(await shaSmall(new Blob([tmd.subarray(infoStart, infoStart + 64 * 0x24)])), cia.sig + 0xA4);

  const contentSize = cia.contents.reduce((n, c) => n + (c.index === 0 ? main.size : c.size), 0);
  const size = new Uint8Array(8);
  view(size).setBigUint64(0, BigInt(contentSize), true);
  const parts = [file.slice(0, 0x18), size, file.slice(0x20, cia.tmdOffset),
    tmd, file.slice(cia.tmdOffset + cia.tmdSize, cia.contentOffset)];
  for (const content of cia.contents) {
    const data = content.index === 0 ? main : file.slice(content.position, content.position + content.size);
    parts.push(data);
    if (data.size % 64) parts.push(pad(align(data.size, 64) - data.size));
  }
  const last = cia.contents[cia.contents.length - 1];
  const oldMetaOffset = last.position + align(last.size, 64);
  if (cia.metaSize) parts.push(file.slice(oldMetaOffset, oldMetaOffset + cia.metaSize));
  return new Blob(parts, { type: 'application/octet-stream' });
}

export async function pickOutput(name) {
  if (typeof window.showSaveFilePicker !== 'function')
    throw new Error('이 브라우저는 대용량 파일 저장을 지원하지 않습니다. PC의 최신 Chrome 또는 Edge를 사용해 주세요.');
  return window.showSaveFilePicker({ suggestedName: name,
    types: [{ description: 'CIA 파일', accept: { 'application/octet-stream': ['.cia'] } }] });
}

export async function saveBlob(blob, handle, onProgress = () => {}) {
  const writable = await handle.createWritable();
  try {
    for (let offset = 0; offset < blob.size; offset += 4 * 1024 * 1024) {
      await writable.write(blob.slice(offset, offset + 4 * 1024 * 1024));
      onProgress(Math.min(1, (offset + 4 * 1024 * 1024) / blob.size));
    }
    await writable.close();
  } catch (error) {
    await writable.abort();
    throw error;
  }
}
