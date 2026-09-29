# 프리파라 CIA 브라우저 패처 — 검증용 빌드

이 프로젝트는 사용자가 고른 **복호화 CIA**를 브라우저에서만 읽습니다. CIA를 서버에 업로드하지 않습니다. GitHub Pages에서는 RomFS/ExeFS 델타 두 개만 내려받습니다. 사용자 CIA의 exheader, Ticket, 콘텐츠 0001 및 다른 변경 없는 부분은 보존하고, 메인 NCCH와 TMD의 크기·해시 필드를 재계산합니다.

## 현재 상태

`public/patches/romfs.xdelta`를 포함했습니다. SHA-256은 `46D5D0D5A7694F4A8D6481300C292D718F9B179E0379D17E00A8625DAFD8647E`로 확인했습니다. 복원한 RomFS의 보고된 SHA-256도 아래 목표값과 일치합니다. `exefs.bin.xdelta`는 첨부된 29개 파일 패치 묶음에서 검증된 파일입니다. **실제 CIA 두 종류의 종단 간 생성과 실행 검증 전까지 배포하지 마세요.**

기존 29개 파일별 델타는 패치 데이터로 유효하지만, 브라우저에서 RomFS를 28개 파일별로 재구성하려면 RomFS IVFC 해시 트리와 파일 메타데이터 작성기가 필요합니다. 여기서는 이미 동일하다고 검증된 원본 RomFS 전체(443,654,144바이트)를 하나의 Xdelta 입력으로 사용합니다. Xdelta 입력은 File.slice로 부분 읽고, 결과는 OPFS 임시 파일에 동기적으로 순차 기록합니다. CPU/RAM보다 디스크 공간이 더 필요합니다.

## RomFS 패치 생성 기록

`F:\nintendo3ds\roms`에서 최신 `cia_compare_*` 폴더를 확인한 후 Windows PowerShell에서 실행:

```powershell
Set-Location 'F:\nintendo3ds\roms'
$work = Get-ChildItem -Directory -Filter 'cia_compare_*' | Where-Object {
    (Test-Path (Join-Path $_.FullName 'pripara-godmode\romfs.bin')) -and
    (Test-Path (Join-Path $_.FullName 'patched\romfs.bin'))
} | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (!$work) { throw 'CIA 추출 폴더를 찾지 못했습니다.' }
$old = Join-Path $work.FullName 'pripara-godmode\romfs.bin'
$new = Join-Path $work.FullName 'patched\romfs.bin'
$out = Join-Path (Get-Location) 'romfs.xdelta'
& .\xdelta3.exe -e -a -S none -D -s $old $new $out
if ($LASTEXITCODE -ne 0) { throw 'Xdelta 생성 실패' }
& .\xdelta3.exe -d -a -D -s $old $out (Join-Path $work.FullName 'romfs_verify.bin')
if ($LASTEXITCODE -ne 0) { throw 'Xdelta 복원 실패' }
Get-FileHash $out -Algorithm SHA256
Get-FileHash (Join-Path $work.FullName 'romfs_verify.bin') -Algorithm SHA256
```

복원 해시는 `C01138D8F153821252A18EFC90E9A1030B5A747850DD3DDC601EC9449B2955AF`여야 합니다. `-a`는 새 CLI의 armor 헤더만 끄며 VCDIFF 구간 체크섬은 유지합니다.

## 검증 및 제한

- `npm ci`, `npm run build`로 정적 파일을 만듭니다. `dist/`를 시험 서버에서 제공합니다.
- 최신 PC Chrome/Edge와 충분한 임시 디스크 공간이 필요합니다. 저장 대화상자는 패치 버튼을 누를 때 바로 표시됩니다.
- 입력 RomFS·ExeFS 전체 SHA-256과 델타 파일 SHA-256, 결과 두 영역의 SHA-256을 확인합니다. 다른 버전은 거부합니다.
- 개발 중에는 작은 합성 CIA를 사용해 파서·NCCH/TMD 필드를 검증했습니다. 사용자가 `pripara-godmode.cia`와 `piratelegit-decrypted.cia`로 모두 패치가 동작한다고 보고했습니다. 다른 배포본의 호환성까지 확인한 결과는 아닙니다.
- 생성한 CIA의 전체 SHA-256은 godmode 기반 배포용 CIA의 SHA-256과 다를 수 있습니다. 검증 기준은 내부 패치 결과와 컨테이너 구조입니다.

## 아이콘이 다른 세 번째 CIA

`PriPara Mezase Idol Grand Prix No.1.decrypted.cia`는 원본 RomFS SHA-256이 지원 목록과 같지만, ExeFS의 `icon`에서 4바이트, 해당 ExeFS 헤더의 해시에서 32바이트가 다릅니다. 기존 ExeFS 전체 델타를 이 파일에 적용하면 안 됩니다. 패처는 ExeFS SHA-256으로 델타를 선택하고, 아이콘을 보존한 세 번째 입력용 `exefs_variant.xdelta`를 포함합니다. 사용자가 만든 델타의 SHA-256과 복원된 결과 ExeFS의 SHA-256을 별도로 확인했습니다. **이 세 번째 CIA의 브라우저 패치 결과 및 설치·실행은 아직 테스트가 필요합니다.**

로컬에서 `tools/make_exefs_variant.py`를 `F:\nintendo3ds\roms`로 복사해 같은 폴더의 `xdelta3.exe`와 함께 실행할 수 있습니다. 이전 `cia_compare_*` 폴더의 `pripara-godmode/exefs.bin`, `patched/exefs.bin`, 새 `new_cia_regions/exefs.bin`이 필요합니다. 스크립트는 세 ExeFS의 SHA-256을 고정 검사하고, 차이가 아이콘 본문 4바이트와 헤더 해시 32바이트뿐인지 다시 검사합니다. 원래 아이콘을 새 아이콘으로 바꾼 패치 결과 ExeFS를 로컬에서 만든 뒤, 새 입력용 Xdelta를 생성하고 복원 검증합니다. `new_cia_regions/exefs_variant.xdelta`와 출력된 SHA-256만 전달하면 됩니다. CIA나 ExeFS 원본은 전달하지 않습니다.

현재 `config.js`에는 두 ExeFS 입력 해시와 각기 다른 델타·목표 해시가 들어 있습니다. 처음 확인한 두 CIA는 사용자가 패치 동작을 보고했습니다. 세 번째 CIA는 별도 종단 간 검증이 필요합니다.
