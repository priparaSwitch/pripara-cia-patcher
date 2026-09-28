import './style.css';
import { PATCH_CONFIG as config } from '../config.js';

const $ = id => document.getElementById(id);
const ciaInput = $('cia'), patchInput = $('patch'), serverInput = $('use-server');
const applyButton = $('apply');
let worker = null, validation = false, busy = false, run = 0;
const hex = value => typeof value === 'string' && /^[0-9a-f]+$/i.test(value);
const configured = Number.isSafeInteger(config.expectedSize) && config.expectedSize > 0
  && hex(config.expectedSha256) && config.expectedSha256.length === 64
  && hex(config.expectedMd5) && config.expectedMd5.length === 32
  && Number.isSafeInteger(config.maxOutputBytes) && config.maxOutputBytes >= config.expectedSize;

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
function resetWorker() { if (worker) worker.terminate(); worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); }
function requestWorker(message, transfer = [], onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress(data);
      else if (data.type === 'result') resolve(data);
      else if (data.type === 'error') reject(new Error(data.message));
    };
    worker.onerror = e => reject(new Error(e.message || '브라우저 작업 중 오류가 발생했습니다.'));
    worker.postMessage(message, transfer);
  });
}
function invalidate() {
  run++; validation = false;
  if (worker) { worker.terminate(); worker = null; }
  $('sha256').textContent = '—'; $('md5').textContent = '—';
  $('notice').textContent = ''; updateReady();
}
async function validate() {
  invalidate();
  const ticket = run, file = ciaInput.files[0];
  $('cia-name').textContent = file?.name || '선택한 파일 없음';
  if (!file) { $('verdict').textContent = 'CIA 파일을 선택하면 원본을 검사합니다.'; progress('대기 중', 0); return; }
  resetWorker();
  progress('CIA 파일 해시 계산 중', 0);
  $('verdict').textContent = '원본 CIA를 확인하고 있습니다.';
  try {
    const result = await requestWorker({ type: 'hash', file }, [], ({ percent }) => progress('CIA 파일 해시 계산 중', percent));
    if (ticket !== run) return;
    $('sha256').textContent = result.sha256;
    $('md5').textContent = result.md5;
    validation = configured && file.size === config.expectedSize
      && result.sha256 === config.expectedSha256.toLowerCase()
      && result.md5 === config.expectedMd5.toLowerCase();
    $('verdict').textContent = !configured
      ? '원본 검증 기준이 설정되지 않았습니다. 관리자에게 문의하세요.'
      : validation
        ? `이 파일은 [${config.title}] 패치가 가능합니다.`
        : `이 파일은 [${config.title}] 패치가 불가능합니다. 파일 크기 또는 해시가 일치하지 않습니다.`;
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
    progress('패치 적용 중', 0, true);
    if (!worker) resetWorker();
    const result = await requestWorker({
      type: 'patch', source: ciaInput.files[0], patch, maxOutputBytes: config.maxOutputBytes,
      outputSha256: config.outputSha256
    }, [], ({ stage, percent }) => progress(stage, percent ?? 0, percent == null));
    progress('다운로드 준비 완료', 100);
    const url = URL.createObjectURL(new Blob([result.output], { type: 'application/octet-stream' }));
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
