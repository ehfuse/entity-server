# 이메일 인증 라우트 (`/v1/email/verification`, `/v1/email/change`)

이메일 주소 인증 및 변경 API 엔드포인트를 설명합니다.

> 구성: `configs/auth/password.json` → `email_verification` 섹션

---

## 목차

- [인증 흐름 개요](#overview)
- [공개 라우트 (인증 불필요)](#public-routes)
    - [POST /v1/email/verification/send — 코드/링크 발송](#send)
    - [POST /v1/email/verification/confirm — 코드 입력 확인](#confirm)
    - [GET /v1/email/verification/activate — 링크 클릭 인증](#activate)
- [JWT 보호 라우트](#jwt-routes)
    - [GET /v1/email/verification/status — 인증 상태 조회](#status)
    - [POST /v1/email/change — 이메일 변경](#change-email)
- [설정 참조](#config)
- [이메일 템플릿](#templates)

---

<a id="overview"></a>

## 인증 흐름 개요

두 가지 인증 방식을 지원합니다.

### 방식 1: 코드 입력 (회원가입 중 즉시 인증)

```
회원가입 → POST /send (method: "code") → 이메일로 6자리 코드 수신
       → POST /confirm (email + code) → email_verified: true
```

### 방식 2: 링크 클릭 (회원가입 후 이메일 활성화)

```
회원가입 → POST /send (method: "link") → 이메일로 인증 링크 수신
       → 링크 클릭 → GET /activate?email=...&token=... → email_verified: true
       → (optional) redirect 파라미터로 앱으로 복귀
```

### `email_verification.required: true` 설정 시

`email_verified: false`인 계정은 로그인은 허용되지만, 서버·앱에서 별도 미들웨어를 통해 기능을 제한할 수 있습니다. `/status` 엔드포인트로 상태를 확인하세요.

---

<a id="public-routes"></a>

## 공개 라우트 (인증 불필요)

| 메서드 | 경로                             | 설명                            |
| ------ | -------------------------------- | ------------------------------- |
| `POST` | `/v1/email/verification/send`     | 인증 코드 또는 링크 이메일 발송 |
| `POST` | `/v1/email/verification/confirm`  | 코드 입력으로 인증 완료         |
| `GET`  | `/v1/email/verification/activate` | 링크 클릭으로 인증 완료         |

---

<a id="send"></a>

### `POST /v1/email/verification/send`

지정한 이메일로 인증 코드 또는 인증 링크를 발송합니다.

- `method: "code"` — 설정된 자릿수(기본 6자리)의 숫자 코드를 이메일로 전송
- `method: "link"` — `link_base_url` 기반의 고유 인증 링크를 이메일로 전송

이미 인증된 계정이거나 존재하지 않는 이메일이어도 **항상 동일한 성공 응답**을 반환합니다 (계정 열거 공격 방지).

> **재발송 제한**: 동일 이메일에 대해 `rate_limit.requests_per_hour`(기본 5회) 초과 시 `429` 반환

**요청 본문**:

```json
{
    "email": "user@example.com",
    "method": "code"
}
```

| 필드     | 타입   | 필수 | 설명                   |
| -------- | ------ | ---- | ---------------------- |
| `email`  | string | ✅   | 인증할 이메일 주소     |
| `method` | string | ✅   | `"code"` 또는 `"link"` |

**응답 (200)**:

```json
{
    "ok": true,
    "message": "If the email is registered, a verification email has been sent."
}
```

**에러**:

| 코드 | 사유                                              |
| ---- | ------------------------------------------------- |
| 400  | `email` 또는 `method` 누락 / 유효하지 않은 method |
| 429  | 해당 이메일에 대한 발송 횟수 초과                 |

---

<a id="confirm"></a>

### `POST /v1/email/verification/confirm`

이메일로 수신한 숫자 코드를 입력하여 인증을 완료합니다.

- 코드는 SHA-256으로 저장되며 타이밍 안전 비교(`subtle.ConstantTimeCompare`)를 사용합니다
- 최대 시도 횟수(`max_attempts`, 기본 5회) 초과 시 코드가 무효화됩니다
- 코드 만료(`code_ttl_sec`) 또는 시도 초과 시 재발송 필요

**요청 본문**:

```json
{
    "email": "user@example.com",
    "code": "123456"
}
```

| 필드    | 타입   | 필수 | 설명               |
| ------- | ------ | ---- | ------------------ |
| `email` | string | ✅   | 인증할 이메일 주소 |
| `code`  | string | ✅   | 수신한 인증 코드   |

**응답 (200)**:

```json
{
    "ok": true,
    "message": "Email verified successfully."
}
```

**에러**:

| 코드 | 사유                                             |
| ---- | ------------------------------------------------ |
| 400  | `email` 또는 `code` 누락                         |
| 400  | 코드가 만료되었거나 발급된 코드 없음             |
| 401  | 코드 불일치 (남은 시도 횟수 포함)                |
| 404  | 해당 이메일 계정 없음                            |
| 429  | 최대 시도 횟수 초과 — 코드 무효화됨, 재발송 필요 |

---

<a id="activate"></a>

### `GET /v1/email/verification/activate`

이메일에 포함된 인증 링크를 클릭하면 호출되는 엔드포인트입니다. 토큰 검증 후 `email_verified`를 `true`로 설정합니다.

- 토큰은 SHA-256으로 저장되며 타이밍 안전 비교를 사용합니다
- `redirect=1` 파라미터가 있으면 `link_base_url?verified=1` 또는 `link_base_url?error=1`로 리다이렉트

**요청 파라미터**:

| 파라미터   | 타입    | 필수 | 설명                                 |
| ---------- | ------- | ---- | ------------------------------------ |
| `email`    | string  | ✅   | 인증할 이메일 주소 (URL 인코딩)      |
| `token`    | string  | ✅   | 이메일에 포함된 인증 토큰 (64자 hex) |
| `redirect` | integer | ❌   | `1`이면 `link_base_url`로 리다이렉트 |

**요청 예시**:

```
GET /v1/email/verification/activate?email=user%40example.com&token=abcdef1234...&redirect=1
```

**응답 (200)** — `redirect` 없을 때:

```json
{
    "ok": true,
    "message": "Email verified successfully."
}
```

**응답 (302)** — `redirect=1`일 때:

```
Location: https://myapp.com/verify-email?verified=1
```

인증 실패 시:

```
Location: https://myapp.com/verify-email?error=1
```

**에러** (`redirect` 없을 때):

| 코드 | 사유                                      |
| ---- | ----------------------------------------- |
| 400  | `email` 또는 `token` 누락                 |
| 400  | 토큰 만료 또는 발급된 토큰 없음           |
| 401  | 토큰 불일치                               |
| 404  | 해당 이메일 계정 없음                     |
| 500  | `link_base_url` 미설정 시 리다이렉트 불가 |

---

<a id="jwt-routes"></a>

## JWT 보호 라우트

`Authorization: Bearer <access_token>` 헤더가 필요합니다.

| 메서드 | 경로                           | 설명                       |
| ------ | ------------------------------ | -------------------------- |
| `GET`  | `/v1/email/verification/status` | 현재 이메일 인증 상태 조회 |
| `POST` | `/v1/email/change`        | 이메일 주소 변경           |

---

<a id="status"></a>

### `GET /v1/email/verification/status`

현재 로그인된 계정의 이메일 인증 상태를 반환합니다. 클라이언트에서 인증 완료 여부를 폴링하거나, 재발송 가능 여부를 확인할 때 사용합니다.

**응답 (200)**:

```json
{
    "ok": true,
    "data": {
        "email": "user@example.com",
        "email_verified": false,
        "required": true,
        "can_resend": false,
        "resend_available_at": "2024-01-01T12:05:00Z"
    }
}
```

| 필드                  | 타입    | 설명                                                               |
| --------------------- | ------- | ------------------------------------------------------------------ |
| `email`               | string  | 계정 이메일 주소                                                   |
| `email_verified`      | boolean | 이메일 인증 완료 여부                                              |
| `required`            | boolean | 서버 설정(`email_verification.required`)에 따른 인증 필수 여부     |
| `can_resend`          | boolean | 현재 재발송 가능 여부 (인증 코드/링크가 만료되었거나 없을 때 true) |
| `resend_available_at` | string  | `can_resend: false`일 때 재발송 가능 시각 (ISO 8601, 생략 가능)    |

**에러**:

| 코드 | 사유                |
| ---- | ------------------- |
| 401  | JWT 누락 또는 만료  |
| 404  | 계정을 찾을 수 없음 |

---

<a id="change-email"></a>

### `POST /v1/email/change`

이메일 주소를 변경합니다. 변경 후 `email_verified`가 `false`로 초기화되며, 새 이메일로 인증 코드가 자동 발송됩니다.

- 비밀번호가 설정된 계정(`has_password: true`)은 `current_password` 필드가 필수
- 새 이메일이 다른 계정에서 이미 사용 중인 경우 `409` 반환

**요청 본문**:

```json
{
    "new_email": "new@example.com",
    "current_password": "current_password"
}
```

| 필드               | 타입   | 필수                      | 설명                      |
| ------------------ | ------ | ------------------------- | ------------------------- |
| `new_email`        | string | ✅                        | 변경할 새 이메일 주소     |
| `current_password` | string | ✅ (비밀번호 계정인 경우) | 본인 확인용 현재 비밀번호 |

**응답 (200)**:

```json
{
    "ok": true,
    "message": "Email updated. A verification code has been sent to your new email."
}
```

**에러**:

| 코드 | 사유                                           |
| ---- | ---------------------------------------------- |
| 400  | `new_email` 누락 또는 현재 이메일과 동일       |
| 400  | `current_password` 누락 (비밀번호 계정인 경우) |
| 401  | JWT 누락 또는 만료                             |
| 401  | `current_password` 불일치                      |
| 404  | 계정을 찾을 수 없음                            |
| 409  | 새 이메일이 이미 다른 계정에서 사용 중         |
| 429  | 이메일 발송 횟수 초과                          |

---

<a id="config"></a>

## 설정 참조

`configs/auth/password.json`:

```json
{
    "email_verification": {
        "enabled": true,
        "required": false,
        "code_length": 6,
        "code_ttl_sec": 600,
        "max_attempts": 5,
        "link_base_url": "https://myapp.com/verify-email",
        "rate_limit": {
            "requests_per_hour": 5
        }
    }
}
```

| 필드                           | 기본값  | 설명                                                      |
| ------------------------------ | ------- | --------------------------------------------------------- |
| `enabled`                      | `false` | 이메일 인증 기능 전체 활성화                              |
| `required`                     | `false` | 인증 필수 여부 (`/status`의 `required` 필드에 반영)       |
| `code_length`                  | `6`     | 인증 코드 자릿수                                          |
| `code_ttl_sec`                 | `600`   | 코드/링크 유효 시간 (초)                                  |
| `max_attempts`                 | `5`     | 코드 확인 최대 시도 횟수 (초과 시 코드 삭제)              |
| `link_base_url`                | `""`    | 링크 방식 사용 시 `method: "link"` 및 `redirect=1`에 필요 |
| `rate_limit.requests_per_hour` | `5`     | 동일 이메일에 대한 시간당 최대 발송 횟수                  |

> `link_base_url`을 설정하면 인증 링크가 `<link_base_url>?email=...&token=...` 형태로 생성됩니다.

---

<a id="templates"></a>

## 이메일 템플릿

| 흐름      | 템플릿 경로                                   | 사용 변수                                  |
| --------- | --------------------------------------------- | ------------------------------------------ |
| 코드 방식 | `templates/email/auth/verification.html`      | `code`, `expires_in`, `app_name`           |
| 링크 방식 | `templates/email/auth/verification_link.html` | `activation_url`, `expires_in`, `app_name` |

템플릿 변수 형식: `${변수명|기본값}` (예: `${code|000000}`)
