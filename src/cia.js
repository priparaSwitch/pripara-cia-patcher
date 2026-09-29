// CIA/TMD/Ticket/NCCH metadata parser. Only small slices of the local File are read.
const align64 = n => Math.ceil(n / 64) * 64;
const titleIdAt = (bytes, offset) => Array.from(bytes.slice(offset, offset + 8), x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
const signatureSizes = new Map([
  [0x00010000, 0x240], [0x00010001, 0x140], [0x00010002, 0x80],
  [0x00010003, 0x240], [0x00010004, 0x140], [0x00010005, 0x80],
]);
function requireRange(start, length, limit, label) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 || start + length > limit)
    throw new Error(`${label}의 크기 또는 위치가 올바르지 않습니다.`);
}
async function read(file, start, length, label) {
  requireRange(start, length, file.size, label);
  return new Uint8Array(await file.slice(start, start + length).arrayBuffer());
}
function signatureSize(bytes, label) {
  if (bytes.length < 4) throw new Error(`${label}이 너무 짧습니다.`);
  const type = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false);
  const size = signatureSizes.get(type);
  if (!size) throw new Error(`지원하지 않는 ${label} 서명 형식입니다.`);
  return size;
}

export async function inspectCia(file) {
  if (file.size < 0x2020) throw new Error('CIA 헤더가 없습니다.');
  const header = await read(file, 0, 0x2020, 'CIA 헤더');
  const h = new DataView(header.buffer);
  const headerSize = h.getUint32(0, true);
  const certSize = h.getUint32(8, true);
  const ticketSize = h.getUint32(12, true);
  const tmdSize = h.getUint32(16, true);
  const metaSize = h.getUint32(20, true);
  const contentSize = Number(h.getBigUint64(24, true));
  if (headerSize !== 0x2020 || ticketSize < 0x200 || tmdSize < 0xB04 || !Number.isSafeInteger(contentSize))
    throw new Error('지원하지 않거나 손상된 CIA 헤더입니다.');
  const ticketOffset = align64(headerSize) + align64(certSize);
  const tmdOffset = ticketOffset + align64(ticketSize);
  const contentOffset = tmdOffset + align64(tmdSize);
  requireRange(ticketOffset, ticketSize, file.size, 'Ticket');
  requireRange(tmdOffset, tmdSize, file.size, 'TMD');
  requireRange(contentOffset, contentSize, file.size, 'CIA 콘텐츠');
  requireRange(contentOffset + align64(contentSize), metaSize, file.size, 'CIA 메타데이터');

  const ticket = await read(file, ticketOffset, Math.min(ticketSize, 0x400), 'Ticket');
  const ticketSig = signatureSize(ticket, 'Ticket');
  if (ticketSig + 0xA4 > ticketSize) throw new Error('Ticket의 Title ID를 읽을 수 없습니다.');
  const ticketTitleId = titleIdAt(ticket, ticketSig + 0x9C);
  const tmd = await read(file, tmdOffset, tmdSize, 'TMD');
  const sig = signatureSize(tmd, 'TMD');
  const view = new DataView(tmd.buffer);
  const count = view.getUint16(sig + 0x9E, false);
  const recordStart = sig + 0x9C4;
  if (!count || count > 0x2000 || recordStart + count * 0x30 > tmdSize)
    throw new Error('TMD 콘텐츠 목록이 올바르지 않습니다.');
  const titleId = titleIdAt(tmd, sig + 0x4C);
  if (ticketTitleId !== titleId) throw new Error('Ticket과 TMD의 Title ID가 일치하지 않습니다.');

  let position = contentOffset;
  let main = null;
  const contents = [];
  let encryptedCount = 0;
  let totalSize = 0;
  for (let i = 0; i < count; i++) {
    const at = recordStart + i * 0x30;
    const index = view.getUint16(at + 4, false);
    const flags = view.getUint16(at + 6, false);
    const size = Number(view.getBigUint64(at + 8, false));
    if (!Number.isSafeInteger(size) || size === 0 || position + size > contentOffset + contentSize)
      throw new Error('TMD의 콘텐츠 크기가 CIA와 일치하지 않습니다.');
    if (flags & 1) encryptedCount++;
    contents.push({ index, flags, position, size, recordOffset: at });
    if (index === 0) {
      if (main) throw new Error('메인 콘텐츠가 중복되어 있습니다.');
      main = { position, size };
    }
    position += align64(size);
    totalSize += size;
  }
  if (totalSize !== contentSize || !main || main.size < 0x200)
    throw new Error('CIA의 메인 콘텐츠 또는 전체 크기가 올바르지 않습니다.');
  // An encrypted content cannot have a readable NCCH magic at this offset.
  // Report the TMD flag before treating its ciphertext as a malformed NCCH.
  if (encryptedCount) {
    const error = new Error('이 CIA는 암호화되어 있어 지원하지 않습니다. 복호화된 CIA 파일을 사용해 주세요.');
    error.code = 'ENCRYPTED_CIA';
    error.titleId = titleId;
    throw error;
  }
  const ncch = await read(file, main.position, 0x200, '메인 NCCH');
  const magic = String.fromCharCode(...ncch.subarray(0x100, 0x104));
  if (magic !== 'NCCH')
    throw new Error('메인 콘텐츠의 NCCH 헤더를 찾을 수 없습니다. 파일이 손상되었거나 복호화가 완료되지 않았을 수 있습니다. 복호화된 CIA 파일을 확인해 주세요.');
  return {
    titleId, encryptedCount, contentCount: count, noCrypto: Boolean(ncch[0x18F] & 4),
    headerSize, certSize, ticketSize, tmdSize, metaSize, contentSize,
    ticketOffset, tmdOffset, contentOffset, tmd, sig, contents, main, ncch,
  };
}
