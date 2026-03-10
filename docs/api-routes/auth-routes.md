# 인증 라우트 (`/v1/auth`, `/v1/oauth`)

인증·계정 관리 API 엔드포인트를 설명합니다.

---

## 목차

- [공개 라우트 (인증 불필요)](#public-routes)
- [JWT 보호 라우트](#jwt-routes)
- [계정 관리](#account-management)

---

<a id="public-routes"></a>

## 공개 라우트 (인증 불필요)

API Key, JWT 모두 불필요한 공개 엔드포인트입니다.

| 메서드 | 경로                  | 설명                            |
| ------ | --------------------- | ------------------------------- |
| `POST` | `/v1/auth/login`      | 이메일+비밀번호 로그인          |
| `POST` | `/v1/auth/refresh`    | Access Token 재발급             |
| `POST` | `/v1/auth/logout`     | 로그아웃 (Refresh Token 무효화) |
| `POST` | `/v1/auth/reactivate` | 휴면 계정 재활성화              |

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

**응답 (200)** — 2FA 비활성화 시:

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

**응답 (200)** — 2FA 활성화 시 (로그인 2단계 필요):

```json
{
    "ok": false,
    "requires_2fa": true,
    "two_factor_token": "eyJhbGciOi...",
    "message": "Two-factor authentication required"
}
```

`two_factor_token`을 `POST /v1/auth/2fa/verify` 또는 `POST /v1/auth/2fa/recovery`에 전달하여 2단계 인증을 완료합니다.

**응답 (200)** — 2FA 강제 설정 필요 시 (`enforce_roles` 설정으로 2FA 미설정 계정이 로그인 시도 시):

```json
{
    "ok": false,
    "error": "2fa_setup_required",
    "setup_token": "eyJhbGciOi...",
    "message": "2FA setup is required for your role"
}
```

`setup_token`을 `POST /v1/auth/2fa/setup/verify`에 전달하여 2FA 설정을 완료합니다.

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

| 메서드 | 경로          | 설명                    |
| ------ | ------------- | ----------------------- |
| `GET`  | `/v1/auth/me` | 현재 로그인 사용자 정보 |

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

`POST /v1/api/account/withdraw`(게이트웨이)로 계정을 비활성화합니다. 탈퇴된 계정은 `status: "inactive"` 상태가 되며 로그인할 수 없습니다.

> **복구**: 관리자가 `/v1/admin/` API를 통해 수동으로 status를 `active`로 복원할 수 있습니다.

---

## 관련 문서

- [API 라우트](api-routes.md)
- [관리자 라우트](admin-routes.md)
- [엔티티 라우트](entity-routes.md)
- [파일 라우트](files-routes.md)
- [훅](hooks.md)
- [가입 라우트](join-routes.md)
- [SMTP 라우트](smtp-routes.md)
- [유틸리티 라우트](utils-routes.md)
- [Auth Guide (인증 상세)](../security/auth-guide.md)
- [소셜 로그인 가이드](../extensions/social-login-guide.md)
- [개인정보보호 정책 가이드](../security/privacy-policy-guide.md)
