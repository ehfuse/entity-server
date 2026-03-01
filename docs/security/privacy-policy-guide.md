# 개인정보보호 정책 가이드 (Privacy Policy Guide)

> 대상: 운영/인프라/서비스 관리자, 백엔드 개발자  
> 범위: Entity Server 자동 휴면 전환, 개인정보 보유기간 파기, 비밀번호 만료 정책

---

## 개요

Entity Server의 개인정보보호 정책 자동화 기능은 **3가지 독립 모듈**로 구성되며, 모두 기본적으로 비활성화되어 있습니다.
`configs/auth/privacy_policy.json` 파일을 생성하고 각 섹션의 `enabled: true`로 설정해 원하는 기능만 선택적으로 활성화합니다.

| 모듈              | 설명                                               | 기본 상태 |
| ----------------- | -------------------------------------------------- | --------- |
| **휴면 정책**     | 장기 미접속 계정 자동 휴면 전환 + 사전 경고 이메일 | 비활성    |
| **보유기간 파기** | 휴면 계정의 개인정보 자동 익명화/삭제              | 비활성    |
| **비밀번호 정책** | 주기적 비밀번호 변경 강제 + 재사용 방지            | 비활성    |

> **SMTP 미설정 시**: 이메일 발송이 자동으로 건너뛰어집니다. 이메일 없이 자동 전환/파기만 동작합니다.

---

## 설정 파일

`configs/auth/privacy_policy.json` 파일이 없으면 정책 자동화 전체가 비활성화됩니다.

### 전체 예시

```json
{
    "dormancy": {
        "enabled": true,
        "dormancy_days": 365,
        "warning_days": [30, 7],
        "email_template": "account/dormancy_warning",
        "check_interval_hours": 24
    },
    "data_retention": {
        "enabled": true,
        "retention_days": 1095,
        "action": "anonymize",
        "check_interval_hours": 24
    },
    "password_policy": {
        "enabled": true,
        "max_age_days": 180,
        "warning_days": [14, 7],
        "email_template": "account/password_expiry_warning",
        "history_count": 3,
        "min_length": 8,
        "require_mixed_case": false,
        "require_number": false,
        "require_special": false
    }
}
```

---

## 1. 휴면 정책

### 동작 방식

서버 시작 1분 후 첫 번째 사이클이 실행되며, 이후 `check_interval_hours` 간격으로 반복합니다.

```
dormancyLoop (check_interval_hours마다 반복)
  ├─ active 계정 전체 스캔 (admin 제외)
  ├─ 마지막 활동 시각 < dormancy_days 전 → status: "dormant" 자동 전환
  └─ 마지막 활동 시각이 warning_days 임박 → 경고 이메일 발송
```

**마지막 활동 시각 판단 우선순위**: `last_login_time` → `updated_time` → `created_time`

### 설정 항목

| 키                       | 타입   | 설명                                               |
| ------------------------ | ------ | -------------------------------------------------- |
| `enabled`                | bool   | 활성화 여부                                        |
| `dormancy_days`          | int    | 마지막 활동 후 N일 경과 시 휴면 전환               |
| `warning_days`           | []int  | 휴면 전환 N일 전에 경고 이메일 발송 (여러 값 가능) |
| `email_template` | string | SMTP 이메일 템플릿 이름                            |
| `check_interval_hours`   | int    | 배치 실행 주기 (시간 단위)                         |

### 중복 발송 방지

`account.dormancy_warned_days` 필드로 마지막 발송 D-일수를 추적합니다.

- `warning_days: [30, 7]` 설정 시: D-30, D-7에 각 1회만 발송
- 사용자가 로그인하거나 계정을 재활성화하면 자동으로 0으로 초기화

### 관리자 계정 처리

`rbac_role: "admin"` 계정은 자동 휴면 전환에서 **항상 제외**됩니다.

### 이메일 템플릿

기본 제공 템플릿: `templates/email/dormancy_warning.html`

`email_template`을 비워두면 이메일이 발송되지 않습니다. 커스텀 템플릿 파일명(확장자 제외)을 지정하면 해당 템플릿을 사용합니다.

| 변수           | 설명                                          |
| -------------- | --------------------------------------------- |
| `${email}`     | 사용자 이메일                                 |
| `${days_left}` | 휴면까지 남은 일수                            |
| `${warn_day}`  | 발송 기준이 된 warning_days 임계값            |
| `${login_url}` | 로그인 페이지 URL (템플릿에서 직접 지정 필요) |

### 휴면 해제

`POST /v1/auth/reactivate`를 통해 비밀번호 또는 OAuth 코드를 검증한 후 `active`로 복구됩니다.
재활성화 시 `last_login_time`이 자동 갱신됩니다.

---

## 2. 개인정보 보유기간 자동 파기

### 동작 방식

서버 시작 2분 후 첫 번째 실행, 이후 `check_interval_hours` 간격으로 반복합니다.

```
dataRetentionLoop (check_interval_hours마다 반복)
  ├─ dormant 계정 전체 스캔
  ├─ 휴면 전환 시점(updated_time) + retention_days 초과 여부 확인
  └─ action에 따라 파기 처리
```

### 설정 항목

| 키                     | 타입   | 설명                                               |
| ---------------------- | ------ | -------------------------------------------------- |
| `enabled`              | bool   | 활성화 여부                                        |
| `retention_days`       | int    | 휴면 전환 후 N일 경과 시 파기                      |
| `action`               | string | `"anonymize"` (익명화) 또는 `"delete"` (물리 삭제) |
| `check_interval_hours` | int    | 배치 실행 주기 (시간 단위)                         |

### action 선택 가이드

| 구분        | `"anonymize"`                           | `"delete"`                |
| ----------- | --------------------------------------- | ------------------------- |
| 동작        | 개인정보 필드 마스킹 + 연관 레코드 삭제 | 계정 레코드 물리 삭제     |
| 데이터 잔존 | 비식별 통계 목적으로 잔존 가능          | 완전 소거                 |
| 법적 의무   | 개인정보보호법상 비식별 처리 허용       | 최강 수준                 |
| 권장        | 서비스 통계/감사 필요 시                | 불필요한 데이터 0 보존 시 |

### 익명화(`"anonymize"`) 처리 내역

| 대상                   | 처리 내용                          |
| ---------------------- | ---------------------------------- |
| `account.email`        | `withdrawn_{seq}@anonymized.local` |
| `account.passwd`       | 빈 문자열                          |
| `account.status`       | `inactive`                         |
| `account_oauth` 레코드 | 전체 물리 삭제                     |
| `user.name`            | `탈퇴회원_{seq}`                   |
| `user.profile_image`   | 빈 문자열                          |
| `user.status`          | `inactive`                         |
| `password_history`     | 전체 물리 삭제                     |

### 주의사항

- `action: "delete"` 설정 시 복구 불가능 — 반드시 백업 정책과 함께 운용
- `retention_days`는 관련 법령(개인정보보호법 제21조) 및 서비스 이용약관과 일치시킬 것
- 파기 처리 중 오류 발생 시 해당 계정은 건너뛰고 다음 사이클에서 재시도

---

## 3. 비밀번호 만료 정책

### 동작 방식

세 가지 경로로 작동합니다.

```
1. 배치 경고 (서버 자동)
   passwordExpiryLoop (24시간마다)
   └─ has_password=true 계정 스캔 → 만료 임박 시 경고 이메일

2. 로그인 시 실시간 감지
   HandleLogin → CheckPasswordExpiry()
   └─ 만료됨 → password_expired: true (토큰은 정상 발급)
   └─ 14일 이내 → password_expires_in_days: N

3. 비밀번호 변경
   POST /v1/auth/change-password
   └─ 복잡도 검증 + 이전 비밀번호 재사용 방지
```

### 설정 항목

| 키                       | 타입   | 설명                                          |
| ------------------------ | ------ | --------------------------------------------- |
| `enabled`                | bool   | 활성화 여부                                   |
| `max_age_days`           | int    | 비밀번호 유효 기간 (일 단위, 0이면 무제한)    |
| `warning_days`           | []int  | 만료 N일 전 경고 이메일                       |
| `email_template` | string | SMTP 이메일 템플릿 이름                       |
| `history_count`          | int    | 이전 비밀번호 재사용 금지 횟수 (0이면 비활성) |
| `min_length`             | int    | 최소 비밀번호 길이                            |
| `require_mixed_case`     | bool   | 대소문자 혼합 필수                            |
| `require_number`         | bool   | 숫자 포함 필수                                |
| `require_special`        | bool   | 특수문자 포함 필수                            |

### 로그인 응답 통합

비밀번호 정책이 활성화된 경우 `POST /v1/auth/login` 응답에 추가 필드가 포함됩니다.

```json
// 만료된 경우
{
  "ok": true,
  "data": {
    "access_token": "...",
    "refresh_token": "...",
    "password_expired": true,
    "password_change_message": "비밀번호가 만료되었습니다. 보안을 위해 비밀번호를 변경해주세요."
  }
}

// 14일 이내 만료 예정
{
  "ok": true,
  "data": {
    "access_token": "...",
    "refresh_token": "...",
    "password_expires_in_days": 7
  }
}
```

> **로그인은 차단되지 않습니다.** `password_expired: true`를 받은 클라이언트가 비밀번호 변경 화면으로 유도해야 합니다.

### 비밀북 변경 API

`POST /v1/auth/change-password` (JWT 필요)

```json
{
    "current_password": "OldPassword123!",
    "new_password": "NewPassword456@"
}
```

변경 시 수행되는 검증 순서:

1. 현재 비밀번호 일치 확인
2. 새 비밀번호 ≠ 현재 비밀번호 확인
3. 복잡도 규칙 검증 (min*length, require*\* 설정)
4. 이전 비밀번호 재사용 여부 확인 (history_count)

### 소셜 전용 계정

`has_password: false`인 계정은 비밀번호 만료 배치 스캔에서 **자동 제외**됩니다.

### 기존 계정 호환성

`passwd_changed_time`이 없는 기존 계정은 만료 판단에서 제외됩니다 (신규 로그인 시 갱신).

### 이메일 템플릿

기본 제공 템플릿: `templates/email/password_expiry_warning.html`

`email_template`을 비워두면 이메일이 발송되지 않습니다. 커스텀 템플릿 파일명(확장자 제외)을 지정하면 해당 템플릿을 사용합니다.

| 변수                     | 설명                                                 |
| ------------------------ | ---------------------------------------------------- |
| `${email}`               | 사용자 이메일                                        |
| `${days_left}`           | 만료까지 남은 일수                                   |
| `${change_password_url}` | 비밀번호 변경 페이지 URL (템플릿에서 직접 지정 필요) |

---

## 운영 참고

### 배치 시작 지연

서비스 재시작 직후 즉각 실행을 방지하기 위한 초기 대기 시간이 적용됩니다.

| 배치               | 초기 대기 | 이후 주기                             |
| ------------------ | --------- | ------------------------------------- |
| 휴면 정책          | 1분       | `dormancy.check_interval_hours`       |
| 보유기간 파기      | 2분       | `data_retention.check_interval_hours` |
| 비밀번호 만료 경고 | 3분       | 24시간 고정                           |

### 로그 확인

정책별 배치 로그는 서버 표준 출력에 기록됩니다.

```
[INFO] Privacy: dormancy policy enabled (dormancy=365d, warnings=[30 7], interval=24h)
[INFO] Privacy/dormancy: warned=3, transitioned=1
[INFO] Privacy/retention: processed=2 (action=anonymize)
[INFO] Privacy/password: expiry warnings sent=5
```

### 설정 파일 없을 때

`configs/auth/privacy_policy.json`이 없으면 경고 로그가 출력되고 전체 비활성 상태로 시작합니다.
기존 서비스 동작에 영향을 주지 않습니다.

### 권장 운용 시나리오

```
# 단계적 활성화 권장 순서

1. 먼저 dormancy만 활성화 (경고 이메일부터 시작)
   → 사용자 공지 후 dormancy_days 설정

2. 안정화 후 data_retention 활성화
   → action: "anonymize"로 시작, 법무 검토 후 "delete" 전환 고려

3. 마지막으로 password_policy 활성화
   → max_age_days를 길게 설정하고 점진적으로 단축
```

---

## 관련 문서

- [인증 라우트](../api-routes/auth-routes.md)
- [Auth Guide](auth-guide.md)
- [소셜 로그인 가이드](../extensions/social-login-guide.md)
- [SMTP 가이드](../notification/smtp-guide.md)
- [설계 문서](../dev/design/privacy-policy-design.md)
