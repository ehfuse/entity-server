# 이메일 인증 · 비밀번호 가이드

> 대상: 운영/개발 엔지니어  
> 범위: 이메일 인증, 비밀번호 재설정·변경, 비밀번호 정책, 관리자 강제 리셋

> **⚠️ 마이그레이션 공지**: 비밀번호 재설정(Password Reset) 요청 기능은 **게이트웨이 서버**(`POST /v1/api/password-reset/request`)로 이관되었습니다.  
> 기존 `POST /v1/auth/password-reset` 엔드포인트는 제거되었습니다.  
> 게이트웨이 문서: `packages/entity-app-server/docs/routes/auth/password-reset.md`

---

## 목차

1. [개요](#1-개요)
2. [이메일 인증](#2-이메일-인증)
3. [비밀번호 재설정 (분실)](#3-비밀번호-재설정-분실)
4. [비밀번호 변경 (로그인 상태)](#4-비밀번호-변경-로그인-상태)
5. [비밀번호 정책](#5-비밀번호-정책)
6. [비밀번호 히스토리 (재사용 방지)](#6-비밀번호-히스토리-재사용-방지)
7. [관리자 강제 리셋](#7-관리자-강제-리셋)
8. [설정 (security.json)](#8-설정-securityjson)
9. [보안 운영 원칙](#9-보안-운영-원칙)
10. [장애 대응](#10-장애-대응)
11. [관련 문서](#11-관련-문서)

---

## 1. 개요

이메일/비밀번호 인증을 사용하는 경우 다음 기능을 설정 기반으로 활성화할 수 있습니다.

| 기능                    | 설정 키                         | SMTP 필요 |
| ----------------------- | ------------------------------- | --------- |
| 이메일 인증 (코드/링크) | `email_verification.enabled`    | ✅        |
| 비밀번호 재설정 (분실)  | `password_reset.enabled`        | ✅        |
| 비밀번호 변경           | 항상 활성 (JWT 인증 필수)       | ❌        |
| 비밀번호 정책 검사      | `password_policy` 섹션 존재 시  | ❌        |
| 비밀번호 히스토리       | `password_policy.history_count` | ❌        |
| 관리자 강제 리셋        | `admin_force_reset.enabled`     | 선택      |

모든 설정은 `configs/auth/security.json` 에서 관리합니다.

---

## 2. 이메일 인증

### 2.1 개요

회원가입 시 이메일 소유권을 확인하는 기능입니다. **코드 입력** 방식과 **링크 클릭** 방식을 모두 지원합니다.

### 2.2 인증 방식 비교

| 방식      | 흐름                                                      | 권장 사용처            |
| --------- | --------------------------------------------------------- | ---------------------- |
| 코드 입력 | 회원가입 → 코드 발송 → `/confirm` 에 코드 입력            | 앱 내 즉시 인증        |
| 링크 클릭 | 회원가입 → 링크 발송 → 이메일에서 링크 클릭 → `/activate` | 이메일 클라이언트 인증 |

### 2.3 엔드포인트

| 메서드 | 경로                              | 인증 | 설명                     |
| ------ | --------------------------------- | ---- | ------------------------ |
| POST   | `/v1/email/verification/send`     | ❌   | 인증 코드 또는 링크 발송 |
| POST   | `/v1/email/verification/confirm`  | ❌   | 코드 입력으로 인증 완료  |
| GET    | `/v1/email/verification/activate` | ❌   | 링크 클릭으로 인증 완료  |
| GET    | `/v1/email/verification/status`   | JWT  | 현재 인증 상태 조회      |

### 2.4 코드 발송

```
POST /v1/email/verification/send
Content-Type: application/json

{
    "email": "user@example.com",
    "method": "code"
}
```

링크 발송:

```json
{
    "email": "user@example.com",
    "method": "link"
}
```

**응답 (항상 200 — 계정 열거 공격 방지):**

```json
{ "ok": true, "message": "인증 코드를 발송했습니다." }
```

> 재발송 제한: 기본 이메일당 5회/시간. 초과 시 `429` 반환.

### 2.5 코드 확인

```
POST /v1/email/verification/confirm
Content-Type: application/json

{
    "email": "user@example.com",
    "code": "482917"
}
```

**성공:**

```json
{ "ok": true, "message": "이메일 인증이 완료되었습니다." }
```

**실패 (인증 코드 불일치 또는 만료):**

```json
{ "ok": false, "message": "유효하지 않거나 만료된 인증 코드입니다." }
```

### 2.6 링크 클릭 인증

```
GET /v1/email/verification/activate?email=user@example.com&token=<token>
```

- 성공 시 `redirect` 파라미터가 있으면 해당 URL로 302 리다이렉트
- 없으면 `{ "ok": true }` JSON 응답

### 2.7 인증 상태 조회

```
GET /v1/email/verification/status
Authorization: Bearer <access_token>
```

```json
{
    "ok": true,
    "data": {
        "email": "user@example.com",
        "email_verified": true
    }
}
```

### 2.8 오류 코드

| 코드 | 원인                                   |
| ---- | -------------------------------------- |
| 400  | 필수 필드 누락 / 형식 오류             |
| 429  | Rate Limit 초과                        |
| 410  | 인증 코드 만료                         |
| 422  | 인증 코드 불일치 (시도 횟수 소진 포함) |

---

## 3. 비밀번호 재설정 (분실)

### 3.1 흐름

```
사용자 → POST /password-reset { email }
       ← 200 (이메일 존재 여부 무관 — 열거 공격 방지)
       ← 이메일 수신 (임시 비밀번호 12자, 유효시간 기본 5분)
       → POST /login { email, temp_password }
       ← 200 { access_token, ..., force_password_change: true }
       → POST /change-password { current_passwd: temp_password, new_passwd: "..." }
       ← 200 (비밀번호 변경 완료)
```

> **핵심**: 기존 비밀번호는 임시 비밀번호 TTL 만료 전까지 그대로 유효합니다.
> 임시 비밀번호로 로그인하는 순간 기존 비밀번호가 임시 비밀번호로 교체됩니다.

### 3.2 엔드포인트

| 메서드 | 경로                       | 인증 | 설명                           |
| ------ | -------------------------- | ---- | ------------------------------ |
| POST   | `/v1/auth/password-reset`  | ❌   | 임시 비밀번호 이메일 발송 요청 |
| POST   | `/v1/auth/login`           | ❌   | 임시 비밀번호로 로그인         |
| POST   | `/v1/auth/change-password` | ✅   | 새 비밀번호로 변경 (JWT 필요)  |

### 3.3 재설정 요청

```
POST /v1/auth/password-reset
Content-Type: application/json

{
    "email": "user@example.com"
}
```

**응답 (항상 200):**

```json
{ "ok": true, "message": "임시 비밀번호를 발송했습니다." }
```

### 3.4 임시 비밀번호로 로그인

임시 비밀번호로 `/v1/auth/login`을 호출하면 응답에 `force_password_change: true`가 포함됩니다.

```json
{
    "ok": true,
    "data": {
        "access_token": "...",
        "refresh_token": "...",
        "expires_in": 3600,
        "force_password_change": true
    }
}
```

프론트엔드는 이 플래그를 확인하여 새 비밀번호 입력 UI를 표시하고,
`/v1/auth/change-password`에서 `current_passwd`에 임시 비밀번호, `new_passwd`에 새 비밀번호를 전달합니다.

### 3.5 임시 비밀번호 보안 설계

| 항목           | 내용                                               |
| -------------- | -------------------------------------------------- |
| 임시 비밀번호  | 영대소문자 + 숫자 12자 (`crypto/rand`) — 62¹² 조합 |
| DB 저장        | SHA-256 salt 해시만 저장 (평문 미저장)             |
| 유효시간       | 기본 5분 (`temp_password_ttl_sec` 설정 가능)       |
| 기존 비밀번호  | 임시 비밀번호 사용 전까지 기존 비밀번호 유지       |
| 일회성         | 임시 비밀번호로 로그인 즉시 제거                   |
| 혼동 문자 제외 | `0/O`, `1/l/I` 제외하여 오입력 방지                |

### 3.6 Rate Limit

| 대상     | 기본값   |
| -------- | -------- |
| 이메일당 | 5회/시간 |
| IP당     | 10회/분  |

### 3.7 오류 코드

| 코드 | 원인               |
| ---- | ------------------ |
| 400  | 필수 필드 누락     |
| 401  | 임시 비밀번호 만료 |
| 429  | Rate Limit 초과    |

---

## 4. 비밀번호 변경 (로그인 상태)

로그인한 사용자가 현재 비밀번호를 알고 있을 때 변경하는 엔드포인트입니다.

```
POST /v1/auth/password-change
Authorization: Bearer <access_token>
Content-Type: application/json

{
    "current_password": "OldP@ss1",
    "new_password": "NewP@ss2"
}
```

**성공:**

```json
{ "ok": true, "message": "비밀번호가 변경되었습니다." }
```

**실패 (현재 비밀번호 불일치):**

```json
{ "ok": false, "message": "현재 비밀번호가 올바르지 않습니다." }
```

> 변경 성공 시 해당 계정의 모든 Refresh 토큰이 즉시 무효화됩니다 (다른 디바이스 재로그인 강제).

---

## 5. 비밀번호 정책

`security.json`의 `password_policy` 섹션으로 설정합니다. 비밀번호 변경·재설정·회원가입 시 공통으로 적용됩니다.

| 설정 키                                | 기본값  | 설명                                             |
| -------------------------------------- | ------- | ------------------------------------------------ |
| `min_length`                           | `8`     | 최소 길이                                        |
| `max_length`                           | `128`   | 최대 길이 (`0`이면 무제한)                       |
| `require_number`                       | `false` | 숫자(0–9) 1자 이상 포함 필수                     |
| `require_special`                      | `false` | 특수문자 1자 이상 포함 필수                      |
| `require_mixed_case`                   | `false` | 대문자+소문자 모두 포함 필수                     |
| `history_count`                        | `5`     | 최근 N개 비밀번호 재사용 금지 (`0`이면 비활성)   |
| `forbidden_patterns.sequential_digits` | `true`  | 연속 숫자 금지 (`1234`, `9876` 등)               |
| `forbidden_patterns.repeated_chars`    | `true`  | 반복 문자 금지 (`aaaa`, `1111` 등)               |
| `forbidden_patterns.keyboard_patterns` | `false` | 키보드 패턴 금지 (`qwerty`, `asdf` 등)           |
| `forbidden_patterns.sequential_length` | `4`     | 연속/반복 판단 최소 길이                         |
| `pii_check.enabled`                    | `false` | 개인정보 비밀번호 사용 금지 검사 활성화          |
| `pii_check.entity`                     | —       | PII가 저장된 엔티티명 (예: `"user"`)             |
| `pii_check.fields`                     | —       | 검사 대상 필드 목록 (예: `["phone","birthday"]`) |

**정책 위반 시 응답 예시:**

| 위반 항목             | 오류 메시지                                         |
| --------------------- | --------------------------------------------------- |
| 최소 길이 미달        | `비밀번호는 최소 8자 이상이어야 합니다`             |
| 숫자 미포함           | `비밀번호에 숫자가 포함되어야 합니다`               |
| 특수문자 미포함       | `비밀번호에 특수문자가 포함되어야 합니다`           |
| 대소문자 미혼합       | `비밀번호에 대소문자를 모두 포함해야 합니다`        |
| 연속 숫자 (`1234`)    | `연속된 숫자(4자 이상)는 사용할 수 없습니다`        |
| 반복 문자 (`aaaa`)    | `동일한 문자의 반복(4자 이상)은 사용할 수 없습니다` |
| 키보드 패턴 (`qwert`) | `키보드 연속 문자(4자 이상)는 사용할 수 없습니다`   |
| 개인정보 포함         | `비밀번호에 개인정보를 사용할 수 없습니다`          |
| 최근 비밀번호 재사용  | `최근에 사용한 비밀번호는 재사용할 수 없습니다`     |

> **PII 검사 동작**: `pii_check.enabled: true`이고 `entity`로 지정한 엔티티에서 `account_seq`로 연결된 행을 찾아 `fields`에 나열된 필드 값이 비밀번호에 포함되어 있으면 거부합니다. 엔티티가 없거나 조회 실패 시에는 검사를 건너뛰고 통과시킵니다 (운영 방해 방지).

---

## 6. 비밀번호 히스토리 (재사용 방지)

`password_policy.history_count`가 `1` 이상이면 최근 N개의 비밀번호 해시를 account 데이터 필드에 저장하고, 새 비밀번호 설정 시 재사용 여부를 검사합니다.

- 저장 형식: `[{hash, salt, changed_at}, ...]` (JSON 배열, account `data` 필드)
- 검사 대상: 비밀번호 변경, 재설정, 관리자 강제 리셋 모두 포함
- `history_count: 0` 으로 설정하면 히스토리 검사가 비활성화됩니다.

---

## 7. 관리자 강제 리셋

관리자가 특정 계정의 비밀번호를 강제로 초기화합니다.

```
POST /v1/admin/accounts/:seq/force-reset-password
Authorization: Bearer <admin_token>
Content-Type: application/json

{
    "new_password": "Temp@12345",
    "require_change": true,
    "notify_email": true
}
```

| 필드             | 기본값    | 설명                                   |
| ---------------- | --------- | -------------------------------------- |
| `new_password`   | 랜덤 12자 | 생략 시 임시 비밀번호 자동 생성        |
| `require_change` | `true`    | 다음 로그인 시 비밀번호 변경 강제 여부 |
| `notify_email`   | `true`    | 대상 계정 이메일로 임시 비밀번호 발송  |

> `require_change: true` 인 계정은 로그인 성공 후 access token 발급 대신 비밀번호 변경 요구 응답이 반환됩니다.

**강제 리셋 시 자동 처리:**

1. 해당 계정의 모든 Refresh 토큰 즉시 무효화
2. `force_password_change: true` 플래그 설정
3. `notify_email: true` 이면 임시 비밀번호 이메일 발송

---

## 8. 설정 (security.json)

파일: `configs/auth/security.json`

```json
{
    "password_reset": {
        "enabled": true,
        "token_ttl_sec": 300,
        "base_url": "https://your-domain.com",
        "rate_limit": {
            "per_email_per_hour": 5,
            "per_ip_per_minute": 10
        }
    },

    "email_verification": {
        "enabled": true,
        "required": false,
        "code_length": 6,
        "code_ttl_sec": 300,
        "max_attempts": 5,
        "rate_limit": {
            "per_email_per_hour": 5
        }
    },

    "password_policy": {
        "min_length": 8,
        "max_length": 128,
        "require_number": true,
        "require_special": true,
        "require_mixed_case": false,
        "history_count": 5,
        "forbidden_patterns": {
            "sequential_digits": true,
            "repeated_chars": true,
            "keyboard_patterns": false,
            "sequential_length": 4
        },
        "pii_check": {
            "enabled": false,
            "entity": "user",
            "fields": ["phone", "birthday"]
        }
    },

    "admin_force_reset": {
        "temp_password_length": 12,
        "require_change": true,
        "notify_email": true
    }
}
```

| 섹션                 | 필수 조건                       |
| -------------------- | ------------------------------- |
| `password_reset`     | SMTP 서비스 활성화 필요         |
| `email_verification` | SMTP 서비스 활성화 필요         |
| `password_policy`    | 없음                            |
| `admin_force_reset`  | 없음 (notify_email은 SMTP 필요) |

---

## 9. 보안 운영 원칙

- 토큰/코드 원문은 로그에 기록하지 않습니다.
- `password_reset.base_url`은 반드시 HTTPS URL로 설정합니다.
- `email_verification.required: true` 설정 시, 미인증 계정의 API 접근을 앱 미들웨어에서 별도 제한해야 합니다 (서버는 로그인만 허용).
- 임시 비밀번호 이메일 발송(`notify_email: true`)은 TLS 연결 SMTP를 사용합니다.
- DB에는 비밀번호 원문, 토큰 원문이 저장되지 않습니다. SHA-256 해시만 저장됩니다.

---

## 10. 장애 대응

### 재설정 이메일이 발송되지 않음

- SMTP 서비스 설정 및 활성화 여부 확인 (`configs/notification/smtp.json`)
- `password_reset.enabled: true` 확인
- 서버 로그에서 `[WARN] password-reset: SMTP service required` 메시지 확인

### 토큰이 만료됐다고 나옴

- `token_ttl_sec` 기본값은 5분입니다. 이메일 도착 지연이 잦으면 값을 늘려 주세요.
- 서버 시간(UTC 기준) 동기화 여부 확인 (`timedatectl status`)

### 429 Too Many Requests

- Rate Limit 초과 — `per_email_per_hour` / `per_ip_per_minute` 값을 상황에 맞게 조정합니다.
- 자동화 공격 의심 시 IP 차단 규칙 추가 권장

### 관리자 강제 리셋 후 로그인 루프 발생

- `force_password_change` 플래그 확인 — 로그인 성공 후 비밀번호 변경 API(`/password-change`)로 유도해야 합니다.
- 클라이언트가 비밀번호 변경 응답(`require_password_change: true`)을 처리하는지 확인

---

## 11. 관련 문서

- [인증 가이드](auth-guide.md)
- [JWT 인증 가이드](jwt-auth-guide.md)
- [2FA 가이드](2fa-guide.md)
- [보안 설정](security.md)
- [SMTP 가이드](../notification/smtp-guide.md)
- [이메일 인증 API 레퍼런스](../../packages/entity-app-server/docs/routes/email-verification.md)
- [auth API 레퍼런스](../api-routes/auth-routes.md)
- [목록으로 돌아가기](../README.md)
