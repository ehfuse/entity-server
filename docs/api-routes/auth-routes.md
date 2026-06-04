# 인증 라우트 (`/v1/auth`)

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

| 메서드 | 경로               | 설명                            |
| ------ | ------------------ | ------------------------------- |
| `POST` | `/v1/auth/login`   | 이메일+비밀번호 로그인          |
| `POST` | `/v1/auth/refresh` | Access Token 재발급             |
| `POST` | `/v1/auth/logout`  | 로그아웃 (Refresh Token 무효화) |

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
    "ok": true,
    "requires_2fa": true,
    "data": {
        "two_factor_token": "eyJhbGciOi...",
        "expires_in": 300
    }
}
```

`two_factor_token`은 후속 2FA 검증 단계에서 사용하는 임시 토큰입니다. 현재 이 문서에서는 `/v1/auth` 라우트 표면만 다룹니다.

**응답 (200)** — 2FA 강제 설정 필요 시 (`enforce_roles` 설정으로 2FA 미설정 계정이 로그인 시도 시):

```json
{
    "ok": false,
    "error": "2fa_setup_required",
    "message": "이 계정은 2FA 설정이 필수입니다.",
    "data": {
        "setup_token": "eyJhbGciOi...",
        "expires_in": 300
    }
}
```

`setup_token`은 강제 2FA 설정이 필요한 계정에 대해 발급되는 임시 토큰입니다.

응답 헤더에도 동일한 토큰이 포함됩니다:

- `X-Access-Token: <access_token>`
- `X-Refresh-Token: <refresh_token>`

**에러**:

| 코드 | 사유                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------- |
| 400  | email 또는 passwd 누락                                                                         |
| 401  | 이메일/비밀번호 불일치                                                                         |
| 403  | 계정 비활성(`inactive`/`blocked`) 또는 `rbac_role` 미설정                                      |
| 403  | 휴면 계정(`dormant`) — `"Account is dormant. Use POST /api/v1/auth/reactivate to reactivate."` |

> **휴면 계정**: `status: "dormant"`인 계정은 로그인이 거부됩니다. 현재 `/v1/auth` 라우트에는 재활성화 엔드포인트가 포함되어 있지 않습니다.

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
        "refresh_token": "eyJhbGciOi...",
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

<a id="jwt-routes"></a>

## JWT 보호 라우트

`Authorization: Bearer <access_token>` 헤더가 필수인 라우트입니다.

| 메서드 | 경로                | 설명                    |
| ------ | ------------------- | ----------------------- |
| `GET`  | `/v1/auth/me`       | 현재 로그인 사용자 정보 |
| `POST` | `/v1/auth/withdraw` | 현재 로그인 사용자 탈퇴 |

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

### `POST /v1/auth/withdraw`

현재 로그인한 사용자를 탈퇴 처리하고 `account.status`를 `inactive`로 변경합니다.
비밀번호 기반 계정은 요청 본문에 비밀번호를 포함해야 합니다.

**헤더**: `Authorization: Bearer <access_token>` 필수

**요청 본문** (비밀번호 계정인 경우):

```json
{
    "passwd": "password"
}
```

**응답 (200)**:

```json
{
    "ok": true,
    "message": "Account withdrawn"
}
```

**에러**:

| 코드 | 사유                           |
| ---- | ------------------------------ |
| 400  | 비밀번호 계정인데 passwd 누락  |
| 401  | 인증 없음 또는 비밀번호 불일치 |
| 403  | 관리자 계정은 자가 탈퇴 불가   |
| 404  | account 레코드를 찾을 수 없음  |

---

<a id="account-management"></a>

## 계정 관리

### 자동 휴면 전환

장기간 미접속 계정은 서버에서 자동으로 `status: "dormant"`로 전환됩니다.

| 항목          | 설명                                                        |
| ------------- | ----------------------------------------------------------- |
| **기준**      | 마지막 로그인 후 `dormancy_days`일 경과 (기본 365일)        |
| **전환 시점** | 서버 배치 작업 (매일 1회 자동 실행)                         |
| **전환 대상** | `status: "active"`이고 `dormancy_days`일 이상 미접속 계정   |
| **제외 대상** | `rbac_role: "admin"` 계정은 자동 휴면 제외                  |
| **영향**      | 로그인/토큰갱신 차단, `POST /api/v1/auth/reactivate`로 복구 |

### 휴면 해제 (재활성화)

현재 이 저장소의 `/v1/auth` 라우트에는 휴면 재활성화 엔드포인트가 포함되어 있지 않습니다.
로그인 시 휴면 계정은 403 응답과 안내 메시지를 반환합니다.

### 회원 탈퇴

`POST /v1/auth/withdraw`로 계정을 비활성화합니다. 탈퇴된 계정은 `status: "inactive"` 상태가 되며 로그인할 수 없습니다.

> **복구**: 관리자가 `/v1/admin/` API를 통해 수동으로 status를 `active`로 복원할 수 있습니다.

---

## 관련 문서

- [API 라우트](api-routes.md)
- [관리자 라우트](admin-routes.md)
- [엔티티 라우트](entity-routes.md)
- [파일 라우트](files-routes.md)
- [훅](../data/hooks.md)
- [가입 라우트](join-routes.md)
- [SMTP 라우트](smtp-routes.md)
- [유틸리티 라우트](utils-routes.md)
- [Auth Guide (인증 상세)](../security/auth-guide.md)
