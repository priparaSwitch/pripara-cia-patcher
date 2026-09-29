import './style.css';
import { PATCH_CONFIG as config } from '../config.js';
import { createSHA256 } from 'hash-wasm';
import { inspectCia } from './cia.js';

const $ = id => document.getElementById(id);
const ciaInput = $('cia'), patchInput = $('patch'), serverInput = $('use-server');
const applyButton = $('apply');
let validation = false, busy = false, run = 0;
const hex = value => typeof value === 'string' && /^[0-9a-f]+$/i.test(value);
const configured = hex(config.expectedTitleId) && config.expectedTitleId.length === 16
  && Number.isSafeInteger(config.maxOutputBytes) && config.maxOutputBytes > 0;

function progress(stage, percent, indeterminate = false) {
  $('stage').textContent = stage;
  $('progress').removeAttribute('value');
  if (!indeterminate) $('progress').value = Math.max(0, Math.min(100, percent));
  $('percent').textContent = indeterminate ? '처리 중' : `${Math.round(percent)}%`;
}
function updateReady() {
  applyButton.disabled = busy || !validation || (!serverInput.checked && !patchInput.files[0])
    || (serverInput.checked && !config.patchPath);
  ciaInput.disabled = busy;
  serverInput.disabled = busy;
  patchInput.disabled = busy || serverInput.checked;
}
async function applyXdelta(source, patch) {
  const sha = config.outputSha256 ? await createSHA256() : null;
  const chunks = [];
  let outputSize = 0;
  const patcher = new Worker(new URL('engine/xdelta3.worker.js', document.baseURI), { type: 'module' });
  try {
    return await new Promise((resolve, reject) => {
      patcher.onmessage = ({ data }) => {
        try {
          if (data.type === 'chunk') {
            outputSize += data.bytes.byteLength;
            if (outputSize > config.maxOutputBytes) throw new Error('패치 결과가 설정된 최대 크기를 초과합니다.');
            chunks.push(data.bytes);
            sha?.update(data.bytes);
            progress('Xdelta3 패치 적용 중', outputSize / config.maxOutputBytes * 100);
          } else if (data.type === 'done') {
            if (!outputSize) throw new Error('패치 결과가 비어 있습니다.');
            if (sha && sha.digest() !== config.outputSha256.toLowerCase()) {
              throw new Error('결과 CIA의 SHA-256이 일치하지 않습니다.');
            }
            resolve(chunks);
          } else if (data.type === 'error') reject(new Error(data.message));
        } catch (error) { reject(error); }
      };
      patcher.onerror = event => reject(new Error(event.message || 'Xdelta3 엔진을 불러오지 못했습니다.'));
      patcher.postMessage({ type: 'patch', source, patch });
    });
  } finally { patcher.terminate(); }
}
function invalidate() {
  run++; validation = false;
  $('title-id').textContent = '—'; $('encryption').textContent = '—';
  $('notice').textContent = ''; updateReady();
}
async function validate() {
  invalidate();
  const ticket = run, file = ciaInput.files[0];
  $('cia-name').textContent = file?.name || '선택한 파일 없음';
  if (!file) { $('verdict').textContent = 'CIA 파일을 선택하면 원본을 검사합니다.'; progress('대기 중', 0); return; }
  progress('CIA 구조 확인 중', 0, true);
  $('verdict').textContent = '원본 CIA를 확인하고 있습니다.';
  try {
    const result = await inspectCia(file);
    if (ticket !== run) return;
    $('title-id').textContent = result.titleId;
    $('encryption').textContent = result.encryptedCount
      ? `CIA 콘텐츠 암호화됨 (${result.encryptedCount}/${result.contentCount})`
      : result.noCrypto ? 'CIA 콘텐츠·메인 NCCH 복호화됨' : '메인 NCCH 암호화됨';
    validation = configured && result.titleId === config.expectedTitleId.toUpperCase()
      && result.encryptedCount === 0 && result.noCrypto;
    $('verdict').textContent = !configured
      ? '원본 검증 기준이 설정되지 않았습니다. 관리자에게 문의하세요.'
      : validation
        ? `이 파일은 [${config.title}] 패치가 가능합니다.`
        : `이 파일은 [${config.title}] 패치가 불가능합니다. Title ID 또는 복호화 상태를 확인하세요.`;
    $('verdict').dataset.valid = String(validation);
    progress(validation ? '검증 완료' : '검증 실패', validation ? 100 : 0);
  } catch (e) { if (ticket === run) $('verdict').textContent = `검증 실패: ${e.message}`; }
  updateReady();
}
ciaInput.addEventListener('change', validate);
patchInput.addEventListener('change', () => {
  $('patch-name').textContent = patchInput.files[0]?.name || '선택한 파일 없음';
  if (patchInput.files[0]) serverInput.checked = false;
  updateReady();
});
serverInput.addEventListener('change', () => {
  patchInput.disabled = serverInput.checked;
  $('patch-name').textContent = serverInput.checked ? (config.patchPath || '설정된 서버 패치 없음') : (patchInput.files[0]?.name || '선택한 파일 없음');
  updateReady();
});
applyButton.addEventListener('click', async () => {
  if (applyButton.disabled || busy || !validation) return;
  busy = true; updateReady();
  $('notice').textContent = '';
  try {
    let patch;
    if (serverInput.checked) {
      progress('패치 파일 내려받는 중', 0, true);
      const patchUrl = new URL(config.patchPath, document.baseURI);
      if (patchUrl.origin !== location.origin) throw new Error('서버 패치는 같은 사이트의 파일만 사용할 수 있습니다.');
      const response = await fetch(patchUrl, { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error(`패치 파일을 가져오지 못했습니다 (HTTP ${response.status}).`);
      patch = await response.blob();
    } else patch = patchInput.files[0];
    if (!patch?.size) throw new Error('패치 파일이 비어 있습니다.');
    progress('Xdelta3 엔진 준비 중', 0, true);
    const chunks = await applyXdelta(ciaInput.files[0], patch);
    progress('다운로드 준비 완료', 100);
    const url = URL.createObjectURL(new Blob(chunks, { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url; a.download = config.outputName; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    $('notice').textContent = '완료되었습니다! 다운로드 폴더를 확인하십시오.';
  } catch (e) {
    $('notice').textContent = `패치 실패: ${e.message}`;
    progress('중단됨', 0);
  } finally { busy = false; updateReady(); }
});
if (!configured) $('verdict').textContent = '원본 검증 기준이 설정되지 않았습니다. config.js를 설정해 주세요.';
