# API 라우트

Entity Server의 API 엔드포인트 개요 및 공통 규격을 설명합니다.

상세 엔드포인트는 아래 파일을 참조하세요:

- **[엔티티 라우트](entity-routes.md)** — `/v1/entity/:entity` 엔티티 CRUD API (11개)
- **[인증 라우트](auth-routes.md)** — `/v1/auth/*` 인증·계정 관리 API
- **[훅 가이드](hooks.md)** — 엔티티 생명주기 훅 타입/시점/바인딩
- **[관리자 라우트](admin-routes.md)** — `/v1/admin` 관리자 API (10개)
- **[파일 라우트](files-routes.md)** — `/v1/files/:entity` 파일 API (5개)
- **[SMTP 라우트](smtp-routes.md)** — `/v1/smtp` 이메일 API (3개)
- **[편의 기능 라우트](utils-routes.md)** — `/v1/utils` QR 코드 생성 등 편의 API
- **[History · Revision · Rollback](../data/history-revision-guide.md)** — 이력 저장 시점, 트랜잭션 ID, 롤백 원리

<a id="summary"></a>

## 공통 목록

- [기본 정보](#base-info)
- [인증 헤더](#auth-headers)
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

인증 방식별 상세 절차(HMAC 서명식, JWT 발급/검증, RBAC)는
**[Auth Guide](../security/auth-guide.md)**를 기준으로 사용하세요.

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

## 인증 라우트 (`/v1/auth`)

상세 엔드포인트는 **[인증 라우트](auth-routes.md)**를 참조하세요.

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
// configs/auth/security.json
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

## 관련 문서

- [관리자 라우트](admin-routes.md)
- [엔티티 라우트](entity-routes.md)
- [파일 라우트](files-routes.md)
- [Join 가이드](join-routes.md)
- [SMTP 라우트](smtp-routes.md)

## 다음 문서

- [시작하기](../setup/getting-started.md)
- [설정](../setup/config-guide.md)
- [목록으로 돌아가기](../README.md)
