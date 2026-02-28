# API Routes (라우트 가이드)

Entity Server의 API 엔드포인트 개요 및 공통 규격을 설명합니다.

상세 엔드포인트는 아래 파일을 참조하세요:

- **[entity-routes.md](entity-routes.md)** — `/v1/entity/:entity` 엔티티 CRUD API (11개)
- **[admin-routes.md](admin-routes.md)** — `/v1/admin` 관리자 API (10개)
- **[files-routes.md](files-routes.md)** — `/v1/files/:entity` 파일 API (5개)
- **[smtp-routes.md](smtp-routes.md)** — `/v1/smtp` 이메일 API (3개)
- **[push-routes.md](push-routes.md)** — `/v1/push` 푸시 알림 API (3개)
- **[History · Revision · Rollback 가이드](../guides/data/history-revision-guide.md)** — 이력 저장 시점, 트랜잭션 ID, 롤백 원리

인증 라우트(`/v1/auth/*`, `/v1/oauth/*`)는 이 문서의 [인증 라우트](#auth-routes) 섹션을 참조하세요.

<a id="summary"></a>

## 공통 목록

- [기본 정보](#base-info)
- [인증 헤더](#auth-headers)
- [인증 라우트](#auth-routes) — `POST /v1/auth/*`, `GET /v1/oauth/*`
- [훅 실행 제어 (skipHooks)](#skip-hooks)
- [헬스 체크](#health-check) — `GET /v1/health`
- [에러 응답](#error-response)
- [보안 고려사항](#security)
- [참고 문서](#references)

<a id="base-info"></a>

## 기본 정보

- **Base URL**: `http://localhost:47200/v1`
- **인증**: HMAC-SHA256 + API Key (설정에 따라 선택적)
- **Content-Type**: `application/json`
- **HTTP 메서드**: POST/GET 모두 지원

### HTTP 메서드 선택 가이드

| 작업 유형                                 | 메서드            | 설명                        |
| ----------------------------------------- | ----------------- | --------------------------- |
| 조회 (Get, List, Query, Meta, History)    | **GET** 또는 POST | RESTful, 브라우저 캐싱 가능 |
| 생성/수정/삭제 (Submit, Delete, Rollback) | **POST 만**       | RESTful 원칙, 부작용 방지   |

> **참고**:
>
> - 조회 작업: GET/POST 모두 허용
> - 변경 작업: POST만 허용 (Submit, Delete, Rollback)
> - HMAC 인증은 메서드를 서명에 포함하므로 안전합니다.

<a id="auth-headers"></a>

## 인증 헤더

인증 방식별 상세 절차(HMAC 서명식, JWT 발급/검증, OAuth 2.0, RBAC)는
**[Auth Guide](../guides/security/auth-guide.md)**를 기준으로 사용하세요.

이 문서에는 라우트 호출에 필요한 최소 헤더만 요약합니다.

- **HMAC + API Key**

```http
X-API-Key: <api-key>
X-Timestamp: <unix-seconds>
X-Nonce: <unique-nonce>
X-Signature: <hmac-sha256-hex>
```

- **JWT**

```http
Authorization: Bearer <access-token>
```

### API Key

| 경로           | 필요한 API Key | 설명                    |
| -------------- | -------------- | ----------------------- |
| `/v1/entity/*` | `API_KEY`      | 엔티티 CRUD 작업        |
| `/v1/admin/*`  | `API_KEY`      | 관리자 전용 작업 (위험) |
| `/v1/health`   | 인증 불필요    | 헬스 체크               |

---

<a id="auth-routes"></a>

## 인증 라우트 (`/v1/auth`, `/v1/oauth`)

인증이 필요 없는 공개 라우트입니다 (API Key 불필요).

| 메서드 | 경로                           | 설명                               |
| ------ | ------------------------------ | ---------------------------------- |
| `POST` | `/v1/auth/login`               | 이메일+비밀번호 로그인             |
| `POST` | `/v1/auth/refresh`             | Access Token 재발급                |
| `POST` | `/v1/auth/logout`              | 로그아웃 (Refresh Token 무효화)    |
| `GET`  | `/v1/auth/me`                  | 현재 로그인 사용자 정보 (JWT 필요) |
| `GET`  | `/v1/oauth/:provider`          | OAuth 인증 페이지로 리다이렉트     |
| `GET`  | `/v1/oauth/:provider/callback` | OAuth 콜백 처리 → JWT 발급         |

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

**응답**:

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

응답 헤더에도 동일한 토큰이 포함됩니다:

- `X-Access-Token: <access_token>`
- `X-Refresh-Token: <refresh_token>`

**에러**:

- `400` — email 또는 passwd 누락
- `401` — 이메일/비밀번호 불일치
- `403` — 계정 비활성 상태 또는 `rbac_role` 미설정

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

**응답**:

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

- `400` — refresh_token 누락
- `401` — 만료되었거나 블랙리스트에 등록된 토큰

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

**응답**:

```json
{
    "ok": true,
    "message": "Logged out"
}
```

**에러**:

- `400` — refresh_token 누락

---

### `GET /v1/auth/me`

현재 로그인한 사용자의 `account` 엔티티 데이터를 반환합니다.
`passwd` 필드는 응답에서 자동으로 제거됩니다.

**헤더**: `Authorization: Bearer <access_token>` 필수

**응답**:

```json
{
    "ok": true,
    "data": {
        "seq": 1,
        "email": "admin@example.com",
        "name": "관리자",
        "rbac_role": "admin"
    }
}
```

**에러**:

- `401` — 토큰 없음 또는 만료

---

### `GET /v1/oauth/:provider`

OAuth 프로바이더 인증 페이지로 리다이렉트합니다. (`302 Found`)

```
GET /v1/oauth/google
GET /v1/oauth/kakao
```

프로바이더는 `configs/security.json`의 `oauth` 항목에 설정된 것만 사용할 수 있습니다.

---

### `GET /v1/oauth/:provider/callback`

OAuth 콜백을 처리하여 JWT를 발급합니다.
이메일로 `account` 엔티티를 조회하고, 없으면 신규 생성합니다 (기본 `rbac_role: "user"`).

**응답**: `/v1/auth/login`과 동일한 형식의 토큰 쌍

---

<a id="skip-hooks"></a>

## 훅 실행 제어 (`skipHooks`)

엔티티 조회, 생성, 수정, 삭제 작업 시 설정된 훅(hook)을 건너뛸 수 있습니다.

### 사용 사례

- **관리자 작업**: 관리자가 직접 데이터를 수정할 때 부가 작업 방지
- **대량 작업**: 벌크 데이터 가져오기/내보내기 시 성능 향상
- **디버깅**: 훅 없이 순수한 CRUD 동작만 테스트

### 사용 방법

`skipHooks=true` 쿼리 파라미터를 추가합니다:

```bash
# 훅 없이 조회 (GET)
curl http://localhost:47200/v1/entity/account/1?skipHooks=true

# 훅 없이 생성 (POST)
curl -X POST http://localhost:47200/v1/entity/account/submit?skipHooks=true \
  -H "Content-Type: application/json" \
  -d '{"name": "홍길동"}'

# 훅 없이 삭제 (POST)
curl -X POST http://localhost:47200/v1/entity/account/delete/1?skipHooks=true
```

### 동작

- **기본값**: `false` (훅이 정상적으로 실행됨)
- **`skipHooks=true`**: 모든 훅 실행 건너뛰기
    - `after_get`, `after_list` 훅 미실행
    - `before_insert`, `after_insert` 훅 미실행
    - `before_update`, `after_update` 훅 미실행
    - `before_delete`, `after_delete` 훅 미실행
    - Submit/Delete 훅도 실행되지 않음

### 주의사항

- 훅에서 수행하던 검증, 알림, 연관 데이터 처리 등이 건너뛰어집니다.
- 데이터 일관성에 영향을 줄 수 있으므로 신중하게 사용하세요.

---

<a id="health-check"></a>

## 헬스 체크 (`/v1/health`)

서버 상태를 확인합니다 (인증 불필요).

**엔드포인트**: `GET /v1/health`

**응답**:

```json
{
    "ok": true
}
```

---

<a id="error-response"></a>

## 에러 응답

모든 에러는 다음 형식으로 반환됩니다:

```json
{
    "ok": false,
    "message": "에러 메시지"
}
```

### HTTP 상태 코드

| 코드 | 의미                           |
| ---- | ------------------------------ |
| 200  | 성공                           |
| 400  | 잘못된 요청 (유효성 검증 실패) |
| 401  | 인증 실패 (API Key, HMAC)      |
| 404  | 리소스 없음                    |
| 500  | 서버 내부 오류                 |

---

<a id="security"></a>

## 보안 고려사항

### Nonce Store

HMAC 인증 사용 시 Nonce 저장소를 설정하여 replay attack 방지:

```json
// configs/security.json
{
    "nonce_store": {
        "driver": "redis", // "memory" | "redis" | "memcache"
        "redis_addr": "localhost:6379",
        "redis_password": "",
        "redis_db": 0,
        "redis_prefix": "nonce:"
    }
}
```

| Driver   | 용도                                |
| -------- | ----------------------------------- |
| memory   | 개발/테스트 (서버 재시작 시 초기화) |
| redis    | 프로덕션 (영속성 + 멀티 서버)       |
| memcache | 간단한 분산 환경 (메모리만)         |

### API Key

엔티티와 관리자 API는 동일한 `API_KEY`를 사용하며, 실제 권한 통제는 RBAC로 수행합니다:

```bash
# .env
API_KEY=api-key
```

↑ [전체 목록 요약으로 이동](#summary)

---

<a id="references"></a>

## 참고 문서

- [Getting Started](../guides/setup/getting-started.md) - 시작 가이드
- [Entity Config Guide](../guides/data/entity-config-guide.md) - 엔티티 설정
- [Config Guide](../guides/setup/config-guide.md) - 서버 설정
- [Architecture (Deployment)](../guides/setup/architecture-deployment.md) - 배포/운영 아키텍처
