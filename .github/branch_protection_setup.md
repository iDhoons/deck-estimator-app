# 🔒 Branch Protection 설정 가이드 (GitHub UI)

> 목적: 리팩토링/기능 변경 시 “연계 영향”을 **자동 알람(CI 실패)**로 잡고, 검증 통과 후에만 머지되도록 강제합니다.

## 적용 위치

- GitHub 레포 → **Settings** → **Branches** → **Branch protection rules**

## 권장 규칙(기본 브랜치)

### 1) Rule 생성

- **Branch name pattern**: `main` (또는 기본 브랜치명)

### 2) PR 강제

- ✅ **Require a pull request before merging**
  - ✅ **Require approvals**: 최소 1
  - ✅ **Dismiss stale approvals when new commits are pushed** (권장)

### 3) CI 통과 강제 (핵심)

- ✅ **Require status checks to pass before merging**
  - ✅ **Require branches to be up to date before merging** (권장)
  - Required checks에 아래를 추가:
    - **CI / validate**

### 4) (선택) CODEOWNERS 강제

- ✅ **Require review from Code Owners**
  - 전제: `.github/CODEOWNERS`에서 실제 핸들(@user 또는 @org/team)로 교체

### 5) 직접 push 방지

- ✅ **Restrict who can push to matching branches** (가능하면)
- ✅ **Do not allow bypassing the above settings** (가능하면)

## 운영 팁

- CI가 실패하면, 실패한 스텝이 “영향 범위 알람”입니다.
  - export 누락 → `check:exports` 실패
  - 타입 연계 오류 → `typecheck` 실패
  - 결과 변화 → `npm test` 스냅샷 실패
  - 번들/빌드 오류 → `npm run build` 실패
