// CIA Meta is optional. Read only its small metadata area, never the game content.
const hex = (n, width) => n.toString(16).toUpperCase().padStart(width, '0');
const regionNames = ['일본', '북미', '유럽', '호주', '중국', '한국', '대만'];
const languageNames = ['일본어', '영어', '프랑스어', '독일어', '이탈리아어', '스페인어',
  '중국어 간체', '한국어', '네덜란드어', '포르투갈어', '러시아어', '중국어 번체'];
const decoder = new TextDecoder('utf-16le');

function utf16(bytes, offset, length) {
  return decoder.decode(bytes.subarray(offset, offset + length)).split('\0', 1)[0].trim();
}

export async function readCiaMeta(file, cia) {
  if (!cia.metaSize) return null;
  const last = cia.contents[cia.contents.length - 1];
  const metaOffset = last.position + Math.ceil(last.size / 64) * 64;
  const bytes = new Uint8Array(await file.slice(metaOffset,
    metaOffset + Math.min(cia.metaSize, 0x3AC0)).arrayBuffer());
  const meta = { size: cia.metaSize, complete: bytes.length >= 0x3AC0 };
  if (bytes.length < 0x400) return meta;
  const view = new DataView(bytes.buffer);
  meta.coreVersion = view.getUint32(0x300, true);
  meta.dependencies = [];
  for (let offset = 0; offset < 0x180; offset += 8) {
    const id = view.getBigUint64(offset, true);
    if (id) meta.dependencies.push(hex(id, 16));
  }
  if (!meta.complete) return meta;
  const smdh = bytes.subarray(0x400);
  if (String.fromCharCode(...smdh.subarray(0, 4)) !== 'SMDH') return meta;
  const iconView = new DataView(smdh.buffer, smdh.byteOffset, smdh.byteLength);
  meta.titles = languageNames.map((language, index) => {
    const offset = 8 + index * 0x200;
    return { language, short: utf16(smdh, offset, 0x80),
      long: utf16(smdh, offset + 0x80, 0x100),
      publisher: utf16(smdh, offset + 0x180, 0x80) };
  }).filter(title => title.short || title.long || title.publisher);
  meta.regionMask = iconView.getUint32(0x2018, true);
  meta.regions = regionNames.filter((_, index) => meta.regionMask & (1 << index));
  meta.flags = iconView.getUint32(0x2028, true);
  meta.smdhVersion = iconView.getUint16(4, true);
  return meta;
}
