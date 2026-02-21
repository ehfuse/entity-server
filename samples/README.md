# Entity Server — 클라이언트 라이브러리 샘플

백엔드 서버에서 Entity Server와 HMAC 인증으로 통신하는 클라이언트 구현 샘플입니다.

> **Admin API(`/v1/admin/...`)는 포함하지 않습니다.**  
> 관리 작업(초기화·스키마 동기화·사용자·API 키 관리 등)은 `scripts/` 스크립트 또는 Admin Web UI를 통해 수행합니다.  
> 앱 코드에서 파괴적 admin 작업을 직접 호출하는 것은 권장하지 않습니다.

## 아키텍처 패턴

```
Client / Browser
      │
      ▼ (기존 인증: 세션, JWT 등)
Backend Server  ←── 이 샘플이 구현하는 부분
      │
      ▼ HMAC 서명 (서버 간 통신)
Entity Server (Go)
```

> **React (SPA)** 샘플은 HMAC 대신 JWT Bearer 토큰을 사용합니다.  
> 브라우저 환경에서는 HMAC secret을 노출할 수 없기 때문입니다.

## HMAC 서명 공식

```
payload   = METHOD|PATH|UNIX_TIMESTAMP|NONCE|BODY
signature = HMAC-SHA256(hmacSecret, payload) → hex
```

**요청 헤더:**

| 헤더          | 내용                             |
| ------------- | -------------------------------- |
| `X-API-Key`   | API 키                           |
| `X-Timestamp` | 현재 Unix 타임스탬프(초)         |
| `X-Nonce`     | 요청마다 다른 랜덤 문자열 (UUID) |
| `X-Signature` | HMAC-SHA256 hex 서명             |

## API 엔드포인트

| 동작      | 메서드 | 경로                               |
| --------- | ------ | ---------------------------------- |
| 단건 조회 | GET    | `/v1/entity/{name}/{seq}`          |
| 목록 조회 | GET    | `/v1/entity/{name}/list`           |
| 필터 검색 | POST   | `/v1/entity/{name}/query`          |
| 건수 조회 | GET    | `/v1/entity/{name}/count`          |
| 생성/수정 | POST   | `/v1/entity/{name}/submit`         |
| 삭제      | DELETE | `/v1/entity/{name}/delete/{seq}`   |
| 이력 조회 | GET    | `/v1/entity/{name}/history/{seq}`  |
| 롤백      | POST   | `/v1/entity/{name}/rollback/{seq}` |

- `list` 쿼리 파라미터: `?page=1&limit=20&order_by=<field>`
- `submit` — body에 `seq` 포함 시 수정, 없으면 생성

## 샘플 목록

| 디렉토리       | 프레임워크             | 인증 방식 |
| -------------- | ---------------------- | --------- |
| `php/ci4/`     | CodeIgniter 4          | HMAC      |
| `php/laravel/` | Laravel                | HMAC      |
| `java/`        | Java (표준 라이브러리) | HMAC      |
| `node/`        | Node.js (fetch)        | HMAC      |
| `python/`      | Python (requests)      | HMAC      |
| `react/`       | React + TypeScript     | JWT       |
