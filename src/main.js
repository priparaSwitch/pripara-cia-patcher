import './style.css';
import { PATCH_CONFIG as config } from '../config.js';
import { inspectCia } from './cia.js';
import { shaBlob, buildMainNcch, buildCia, pickOutput, saveBlob } from './rebuild.js';

const $ = id => document.getElementById(id);
const ciaInput = $('cia');
const applyButton = $('apply');
let validation = null;
let busy = false;
let sequence = 0;
const validHash = h => typeof h === 'string' && /^[a-f0-9]{64}$/i.test(h);
const configured = /^[a-f0-9]{16}$/i.test(config.expectedTitleId) &&
  config.romfsPatchIncluded === true &&
  ['sourceRomfsSha256', 'sourceExefsSha256', 'targetRomfsSha256',
    'targetExefsSha256', 'romfsPatchSha256', 'exefsPatchSha256'].every(k => validHash(config[k]));

function progress(stage, percent, indeterminate = false) {
  $('stage').textContent = stage;
  if (indeterminate) $('progress').removeAttribute('value');
  else $('progress').value = Math.max(0, Math.min(100, percent));
  $('percent').textContent = indeterminate ? '처리 중' : `${Math.round(percent)}%`;
}
function ready() {
  applyButton.disabled = busy || !validation || !configured;
  ciaInput.disabled = busy;
}
async function validate() {
  const current = ++sequence;
  validation = null;
  ready();
  $('title-id').textContent = '—';
  $('encryption').textContent = '—';
  $('verdict').dataset.valid = 'false';
  const file = ciaInput.files[0];
  $('cia-name').textContent = file?.name || '선택한 파일 없음';
  if (!file) return;
  progress('CIA 구조 확인 중', 0, true);
  try {
    const cia = await inspectCia(file);
    if (current !== sequence) return;
    $('title-id').textContent = cia.titleId;
    $('encryption').textContent = cia.encryptedCount === 0 && cia.noCrypto
      ? 'CIA 콘텐츠·메인 NCCH 복호화됨' : '암호화된 콘텐츠가 있습니다';
    const supported = cia.titleId === config.expectedTitleId.toUpperCase() &&
      cia.encryptedCount === 0 && cia.noCrypto;
    validation = supported ? cia : null;
    $('verdict').textContent = cia.encryptedCount || !cia.noCrypto
      ? '이 CIA는 암호화되어 있어 지원하지 않습니다. 복호화된 CIA 파일을 사용해 주세요.'
      : !supported ? '이 게임의 CIA 파일이 아닙니다.'
      : !configured ? '배포용 패치 설정이 아직 완성되지 않았습니다.'
        : '기본 구조 확인 완료. 패치할 내부 영역은 실행 시 해시로 검사합니다.';
    $('verdict').dataset.valid = String(supported && configured);
    progress('기본 구조 확인 완료', 100);
  } catch (error) {
    if (current === sequence) {
      if (error.code === 'ENCRYPTED_CIA') {
        $('title-id').textContent = error.titleId;
        $('encryption').textContent = '암호화됨';
      }
      $('verdict').textContent = `CIA 검사 실패: ${error.message}`;
    }
  }
  ready();
}

async function fetchPatch(path, expectedHash) {
  const url = new URL(path, document.baseURI);
  if (url.origin !== location.origin) throw new Error('패치 파일은 같은 사이트에서만 읽습니다.');
  const response = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error(`패치 파일을 읽지 못했습니다 (${response.status}): ${path}`);
  const patch = await response.blob();
  if (!patch.size || await shaBlob(patch) !== expectedHash.toLowerCase())
    throw new Error(`패치 파일의 SHA-256이 일치하지 않습니다: ${path}`);
  return patch;
}

async function runXdelta(source, patch, outputHandle, maxOutputBytes, label, basePercent, spanPercent) {
  const worker = new Worker(new URL('engine/xdelta3.worker.js', document.baseURI), { type: 'module' });
  try {
    const size = await new Promise((resolve, reject) => {
      worker.onerror = e => reject(new Error(e.message || 'Xdelta 엔진 오류'));
      worker.onmessage = ({ data }) => {
        if (data.type === 'error') reject(new Error(`${label}: ${data.message}`));
        else if (data.type === 'progress')
          progress(`${label} 패치 중`, basePercent + data.size / maxOutputBytes * spanPercent);
        else if (data.type === 'done') resolve(data.size);
      };
      worker.postMessage({ type: 'patch', source, patch, outputHandle, maxOutputBytes });
    });
    const output = await outputHandle.getFile();
    if (!size || output.size !== size) throw new Error(`${label} 결과 크기가 올바르지 않습니다.`);
    return output;
  } finally { worker.terminate(); }
}

ciaInput.addEventListener('change', validate);
applyButton.addEventListener('click', async () => {
  if (busy || !validation || !configured) return;
  // The picker must be opened in the click's user activation, before any fetch/hasher await.
  let destination;
  try { destination = await pickOutput(config.outputName); }
  catch (error) {
    if (error.name !== 'AbortError') $('notice').textContent = error.message;
    return;
  }
  busy = true;
  ready();
  $('notice').textContent = '';
  const file = ciaInput.files[0];
  const temporaryNames = [];
  try {
    const cia = validation;
    const n = new DataView(cia.ncch.buffer);
    if (cia.ncch[0x18E] !== 0) throw new Error('지원하지 않는 NCCH media unit입니다.');
    const exefsOffset = cia.main.position + n.getUint32(0x1A0, true) * 512;
    const exefsSize = n.getUint32(0x1A4, true) * 512;
    const romfsOffset = cia.main.position + n.getUint32(0x1B0, true) * 512;
    const romfsSize = n.getUint32(0x1B4, true) * 512;
    if (!exefsSize || !romfsSize || romfsOffset + romfsSize > cia.main.position + cia.main.size)
      throw new Error('메인 NCCH 영역이 올바르지 않습니다.');
    const sourceExefs = file.slice(exefsOffset, exefsOffset + exefsSize);
    const sourceRomfs = file.slice(romfsOffset, romfsOffset + romfsSize);
    progress('내부 파일 해시 검사 중', 0, true);
    if (await shaBlob(sourceExefs) !== config.sourceExefsSha256 ||
        await shaBlob(sourceRomfs) !== config.sourceRomfsSha256)
      throw new Error('내부 RomFS·ExeFS가 지원하는 원본과 다릅니다.');

    progress('패치 파일 검증 중', 0, true);
    const [romfsPatch, exefsPatch] = await Promise.all([
      fetchPatch(config.romfsPatchPath, config.romfsPatchSha256),
      fetchPatch(config.exefsPatchPath, config.exefsPatchSha256),
    ]);
    if (!navigator.storage?.getDirectory) throw new Error('브라우저의 임시 파일 저장 기능이 필요합니다.');
    const root = await navigator.storage.getDirectory();
    const unique = crypto.randomUUID();
    const exefsName = `${unique}-exefs.bin`, romfsName = `${unique}-romfs.bin`;
    const exefsHandle = await root.getFileHandle(exefsName, { create: true });
    temporaryNames.push(exefsName);
    const romfsHandle = await root.getFileHandle(romfsName, { create: true });
    temporaryNames.push(romfsName);
    const exefs = await runXdelta(sourceExefs, exefsPatch, exefsHandle, 3000000, 'ExeFS', 0, 5);
    if (await shaBlob(exefs) !== config.targetExefsSha256) throw new Error('ExeFS 결과 해시 불일치');
    const romfs = await runXdelta(sourceRomfs, romfsPatch, romfsHandle, 450000000, 'RomFS', 5, 70);
    if (await shaBlob(romfs) !== config.targetRomfsSha256) throw new Error('RomFS 결과 해시 불일치');
    progress('NCCH·CIA 메타데이터 구성 중', 80, true);
    const main = await buildMainNcch(file, cia, exefs, romfs);
    const output = await buildCia(file, cia, main);
    if (output.size > config.maxOutputBytes) throw new Error('CIA 결과 크기가 예상 범위를 넘었습니다.');
    const check = await inspectCia(output);
    if (check.titleId !== cia.titleId || check.encryptedCount || !check.noCrypto ||
        check.main.size !== main.size) throw new Error('생성한 CIA의 구조 검사에 실패했습니다.');
    await saveBlob(output, destination, fraction => progress('CIA 저장 중', 85 + fraction * 15));
    progress('완료', 100);
    $('notice').textContent = '완성 CIA가 저장되었습니다.';
  } catch (error) {
    progress('중단됨', 0);
    $('notice').textContent = `패치 실패: ${error.message}`;
  } finally {
    try {
      const root = await navigator.storage.getDirectory();
      for (const name of temporaryNames) await root.removeEntry(name);
    } catch { /* Temporary files may remain after interrupted storage operations. */ }
    busy = false;
    ready();
  }
});
if (!configured) $('verdict').textContent = '배포용 RomFS 패치 파일이 아직 포함되지 않았습니다.';
