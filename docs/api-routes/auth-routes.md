# 인증 라우트 (`/v1/auth`, `/v1/oauth`)

인증·계정 관리 API 엔드포인트를 설명합니다.

---

## 목차

- [공개 라우트 (인증 불필요)](#public-routes)
- [JWT 보호 라우트](#jwt-routes)
- [OAuth 소셜 로그인](#oauth-routes)
- [OAuth 계정 연동 (JWT 필요)](#oauth-link-routes)
- [계정 관리](#account-management)

---

<a id="public-routes"></a>

## 공개 라우트 (인증 불필요)

API Key, JWT 모두 불필요한 공개 엔드포인트입니다.

| 메서드 | 경로                           | 설명                            |
| ------ | ------------------------------ | ------------------------------- |
| `POST` | `/v1/auth/login`               | 이메일+비밀번호 로그인          |
| `POST` | `/v1/auth/refresh`             | Access Token 재발급             |
| `POST` | `/v1/auth/logout`              | 로그아웃 (Refresh Token 무효화) |
| `POST` | `/v1/auth/reactivate`          | 휴면 계정 재활성화              |
| `GET`  | `/v1/oauth/:provider`          | OAuth 인증 페이지 리다이렉트    |
| `GET`  | `/v1/oauth/:provider/callback` | OAuth 콜백 처리 → JWT 발급      |
| `POST` | `/v1/oauth/:provider/callback` | OAuth 콜백 처리 (Apple POST)    |

---

### `POST /v1/auth/login`

이메일과 비밀번호로 로그인합니다. 성공 시 Access Token + Refresh Token 쌍을 반환합니다.
`account` 엔티티에서 이메일로 사용자를 조회하고 `passwd` 필드와 비교합니다.

**요청 본문**:

```json
{
    "email": "admin@example.com",
    "passwd": "password"
}
```

**응답 (200)**:

```json
{
    "ok": true,
    "data": {
        "access_token": "eyJhbGciOi...",
        "refresh_token": "eyJhbGciOi...",
        "expires_in": 3600
    }
}
```

> **비밀번호 만료 정책 활성 시**: 응답에 `password_expired: true` (만료됨) 또는 `password_expires_in_days: N` (14일 이내 만료 예정)이 추가됩니다.
> 로그인 자체는 차단되지 않으며, 클라이언트가 플래그를 보고 비밀번호 변경 화면으로 유도해야 합니다.

응답 헤더에도 동일한 토큰이 포함됩니다:

- `X-Access-Token: <access_token>`
- `X-Refresh-Token: <refresh_token>`

**에러**:

| 코드 | 사유                                                                                       |
| ---- | ------------------------------------------------------------------------------------------ |
| 400  | email 또는 passwd 누락                                                                     |
| 401  | 이메일/비밀번호 불일치                                                                     |
| 403  | 계정 비활성(`inactive`/`blocked`) 또는 `rbac_role` 미설정                                  |
| 403  | 휴면 계정(`dormant`) — `"Account is dormant. Use POST /v1/auth/reactivate to reactivate."` |

> **휴면 계정**: `status: "dormant"`인 계정은 로그인이 거부되며, 재활성화 안내 메시지를 반환합니다.

---

### `POST /v1/auth/refresh`

Refresh Token으로 새 Access Token을 발급합니다.
Refresh Token의 유효성을 검증하고, `account` 엔티티에서 최신 `rbac_role`을 다시 읽어 반영합니다.

**요청 본문**:

```json
{
    "refresh_token": "eyJhbGciOi..."
}
```

**응답 (200)**:

```json
{
    "ok": true,
    "data": {
        "access_token": "eyJhbGciOi...",
        "expires_in": 3600
    }
}
```

응답 헤더: `X-Access-Token: <access_token>`

**에러**:

| 코드 | 사유                                  |
| ---- | ------------------------------------- |
| 400  | refresh_token 누락                    |
| 401  | 만료되었거나 블랙리스트에 등록된 토큰 |

---

### `POST /v1/auth/logout`

Refresh Token을 서버 측 블랙리스트에 등록하여 무효화합니다.
이후 해당 Refresh Token으로는 재발급이 불가능합니다.
Access Token은 만료 시각까지 유효하므로 클라이언트에서 즉시 파기해야 합니다.

> **블랙리스트 구현**: 인메모리 저장소를 사용합니다. 서버 재시작 시 초기화됩니다.
> Refresh Token이 이미 만료된 경우에도 성공으로 응답합니다.

**요청 본문**:

```json
{
    "refresh_token": "eyJhbGciOi..."
}
```

**응답 (200)**:

```json
{
    "ok": true,
    "message": "Logged out"
}
```

**에러**:

| 코드 | 사유               |
| ---- | ------------------ |
| 400  | refresh_token 누락 |

---

### `POST /v1/auth/reactivate`

휴면(`dormant`) 상태의 계정을 `active`로 전환합니다.
비밀번호 검증 또는 OAuth 코드 검증 후 재활성화됩니다.

**요청 본문 (이메일+비밀번호)**:

```json
{
    "email": "user@example.com",
    "passwd": "password"
}
```

**요청 본문 (OAuth 재활성화)**:

```json
{
    "email": "user@example.com",
    "provider": "kakao",
    "code": "authorization_code",
    "state": "csrf_state"
}
```

**응답 (200)**:

```json
{
    "ok": true,
    "data": {
        "access_token": "eyJhbGciOi...",
        "refresh_token": "eyJhbGciOi...",
        "expires_in": 3600
    }
}
```

**에러**:

| 코드 | 사유                                 |
| ---- | ------------------------------------ |
| 400  | 필수 필드 누락                       |
| 401  | 비밀번호 불일치 또는 OAuth 검증 실패 |
| 404  | 해당 이메일 계정 없음                |
| 409  | 계정이 이미 active 상태              |

---

<a id="jwt-routes"></a>

## JWT 보호 라우트

`Authorization: Bearer <access_token>` 헤더가 필수인 라우트입니다.

| 메서드 | 경로                       | 설명                      |
| ------ | -------------------------- | ------------------------- |
| `GET`  | `/v1/auth/me`              | 현재 로그인 사용자 정보   |
| `POST` | `/v1/auth/change-password` | 비밀번호 변경             |
| `POST` | `/v1/auth/withdraw`        | 회원 탈퇴 (계정 비활성화) |

---

### `GET /v1/auth/me`

현재 로그인한 사용자의 `account` 엔티티 데이터를 반환합니다.
`passwd` 필드는 응답에서 자동으로 제거됩니다.

**헤더**: `Authorization: Bearer <access_token>` 필수

**응답 (200)**:

```json
{
    "ok": true,
    "data": {
        "seq": 1,
        "email": "admin@example.com",
        "name": "관리자",
        "rbac_role": "admin",
        "status": "active"
    }
}
```

**에러**:

| 코드 | 사유                |
| ---- | ------------------- |
| 401  | 토큰 없음 또는 만료 |

---

### `POST /v1/auth/change-password`

현재 비밀번호를 확인한 후 새 비밀번호로 변경합니다.
개인정보보호 정책(`privacy_policy.json`)이 활성화된 경우 비밀번호 복잡도 규칙과 이전 비밀번호 재사용 방지가 적용됩니다.

**헤더**: `Authorization: Bearer <access_token>` 필수

**요청 본문**:

```json
{
    "current_password": "OldPassword123!",
    "new_password": "NewPassword456@"
}
```

**응답 (200)**:

```json
{
    "ok": true,
    "message": "Password changed successfully"
}
```

**에러**:

| 코드 | 사유                                                    |
| ---- | ------------------------------------------------------- |
| 400  | 요청 본문 파싱 실패                                     |
| 400  | `current_password` 또는 `new_password` 누락             |
| 400  | 계정에 비밀번호 없음 (소셜 전용)                        |
| 400  | 새 비밀번호가 현재와 동일                               |
| 400  | 비밀번호 복잡도 미충족 (길이, 대소문자, 숫자, 특수문자) |
| 400  | 이전 비밀번호 재사용 (`Cannot reuse a recent password`) |
| 401  | 현재 비밀번호 불일치                                    |
| 500  | 서버 오류                                               |

> **개인정보보호 정책 미활성 시**: 복잡도 검증과 이력 검사가 건너뛰어지며 기본 비밀번호 변경만 수행됩니다.

---

### `POST /v1/auth/withdraw`

현재 로그인한 사용자의 계정을 탈퇴 처리합니다.

**동작**:

1. 비밀번호 확인 (비밀번호 계정인 경우)
2. `account.status` → `"inactive"` 변경
3. 연결된 모든 `account_oauth` 레코드 삭제
4. 모든 세션(Refresh Token) 무효화

> **참고**: 관리자(`rbac_role: "admin"`)는 자가 탈퇴가 차단됩니다.

**요청 본문**:

```json
{
    "passwd": "current_password"
}
```

> 소셜 전용 계정(`has_password: false`)은 `passwd` 없이 탈퇴 가능합니다.

**응답 (200)**:

```json
{
    "ok": true,
    "message": "Account withdrawn"
}
```

**에러**:

| 코드 | 사유                              |
| ---- | --------------------------------- |
| 400  | 비밀번호 필요 (has_password 계정) |
| 401  | 비밀번호 불일치                   |
| 403  | 관리자 계정 탈퇴 불가             |

---

<a id="oauth-routes"></a>

## OAuth 소셜 로그인

### `GET /v1/oauth/:provider`

OAuth 프로바이더 인증 페이지로 리다이렉트합니다. (`302 Found`)

```
GET /v1/oauth/google
GET /v1/oauth/kakao
GET /v1/oauth/apple
GET /v1/oauth/line
```

프로바이더는 `configs/auth/oauth.json`에 설정된 것만 사용할 수 있습니다.

---

### `GET|POST /v1/oauth/:provider/callback`

OAuth 콜백을 처리하여 JWT를 발급합니다.
3단계 조회 전략으로 `account_oauth` → `account(email)` → 신규 생성을 시도합니다.

> **Apple Sign-In**: `response_mode=form_post`를 사용하므로 POST 콜백도 지원합니다.

**응답**: `success_redirect_url` 설정 시 302 리다이렉트, 미설정 시 JSON 응답 (login과 동일 형식)

---

<a id="oauth-link-routes"></a>

## OAuth 계정 연동 (JWT 필요)

| 메서드   | 경로                               | 설명                             |
| -------- | ---------------------------------- | -------------------------------- |
| `POST`   | `/v1/auth/oauth/link`              | 소셜 계정을 현재 계정에 연결     |
| `DELETE` | `/v1/auth/oauth/link/:provider`    | 소셜 계정 연결 해제              |
| `GET`    | `/v1/auth/oauth/providers`         | 연결된 소셜 프로바이더 목록 조회 |
| `POST`   | `/v1/auth/oauth/refresh/:provider` | OAuth 토큰 갱신                  |

### `POST /v1/auth/oauth/link`

```json
{
    "provider": "kakao",
    "code": "authorization_code",
    "state": "csrf_state_value"
}
```

**응답 (200)**: `{ "ok": true, "message": "Provider linked", "provider": "kakao" }`

### `DELETE /v1/auth/oauth/link/:provider`

비밀번호가 설정되어 있거나 다른 소셜 연결이 남아있을 때만 해제 가능 (로그인 수단 0개 방지).

**응답 (200)**: `{ "ok": true, "message": "Provider unlinked", "provider": "kakao" }`

### `GET /v1/auth/oauth/providers`

연결된 소셜 프로바이더 목록을 반환합니다.

**응답 (200)**:

```json
{
    "ok": true,
    "data": [
        {
            "provider": "kakao",
            "email": "user@kakao.com",
            "name": "홍길동",
            "linked_at": "2025-01-15 10:30:00"
        }
    ]
}
```

### `POST /v1/auth/oauth/refresh/:provider`

DB에 저장된 `refresh_token`으로 프로바이더로부터 새 `access_token`을 발급받고 `account_oauth`를 업데이트합니다.

**응답 (200)**: `{ "ok": true, "provider": "kakao", "token_expires_at": "2026-04-01T00:00:00Z" }`

---

<a id="account-management"></a>

## 계정 관리

### 자동 휴면 전환

장기간 미접속 계정은 서버에서 자동으로 `status: "dormant"`로 전환됩니다.

| 항목          | 설명                                                      |
| ------------- | --------------------------------------------------------- |
| **기준**      | 마지막 로그인 후 `dormancy_days`일 경과 (기본 365일)      |
| **전환 시점** | 서버 배치 작업 (매일 1회 자동 실행)                       |
| **전환 대상** | `status: "active"`이고 `dormancy_days`일 이상 미접속 계정 |
| **제외 대상** | `rbac_role: "admin"` 계정은 자동 휴면 제외                |
| **영향**      | 로그인/토큰갱신 차단, `POST /v1/auth/reactivate`로 복구   |

### 휴면 해제 (재활성화)

`POST /v1/auth/reactivate`로 비밀번호(또는 OAuth 코드)를 검증한 뒤 `status: "active"`로 전환합니다.
재활성화 성공 시 JWT 토큰 쌍이 즉시 발급됩니다.

### 회원 탈퇴

`POST /v1/auth/withdraw`로 계정을 비활성화합니다. 탈퇴된 계정은 `status: "inactive"` 상태가 되며 로그인할 수 없습니다.

> **복구**: 관리자가 `/v1/admin/` API를 통해 수동으로 status를 `active`로 복원할 수 있습니다.

---

## 관련 문서

- [API 라우트](api-routes.md)
- [관리자 라우트](admin-routes.md)
- [엔티티 라우트](entity-routes.md)
- [파일 라우트](files-routes.md)
- [훅](hooks.md)
- [가입 라우트](join-routes.md)
- [푸시 라우트](push-routes.md)
- [SMTP 라우트](smtp-routes.md)
- [유틸리티 라우트](utils-routes.md)
- [Auth Guide (인증 상세)](../security/auth-guide.md)
- [소셜 로그인 가이드](../extensions/social-login-guide.md)
- [개인정보보호 정책 가이드](../security/privacy-policy-guide.md)
