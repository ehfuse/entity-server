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
Entity Server
```

> **브라우저(React·Vanilla)** 환경에서도 HMAC / JWT 모두 사용 가능합니다.  
> 단, 브라우저에서 HMAC을 사용하면 `hmacSecret`이 클라이언트에 노출되므로,  
> **프론트엔드 프로덕션 환경에서는 JWT 사용을 권장합니다.**

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

| 동작           | 메서드 | 경로                               |
| -------------- | ------ | ---------------------------------- |
| 단건 조회      | GET    | `/v1/entity/{name}/{seq}`          |
| 조건 단건 조회 | POST   | `/v1/entity/{name}/find`           |
| 목록 조회      | POST   | `/v1/entity/{name}/list`           |
| 필터 검색      | POST   | `/v1/entity/{name}/query`          |
| 건수 조회      | POST   | `/v1/entity/{name}/count`          |
| 생성/수정      | POST   | `/v1/entity/{name}/submit`         |
| 삭제           | POST   | `/v1/entity/{name}/delete/{seq}`   |
| 이력 조회      | GET    | `/v1/entity/{name}/history/{seq}`  |
| 롤백           | POST   | `/v1/entity/{name}/rollback/{seq}` |

- `list` 쿼리 파라미터: `?page=1&limit=20&order_by=<field>`
- `submit` — body에 `seq` 포함 시 수정, 없으면 생성

## 샘플 목록

| 디렉토리       | 프레임워크                                     | 인증 방식  |
| -------------- | ---------------------------------------------- | ---------- |
| `entities/`    | 엔티티 설정 예제                               | —          |
| `browser/`     | 브라우저 (Vanilla ES Module, 빌드 도구 불필요) | HMAC / JWT |
| `php/ci4/`     | CodeIgniter 4                                  | HMAC / JWT |
| `php/laravel/` | Laravel                                        | HMAC / JWT |
| `java/`        | Java (표준 라이브러리)                         | HMAC / JWT |
| `kotlin/`      | Kotlin (표준 라이브러리)                       | HMAC / JWT |
| `swift/`       | Swift (URLSession)                             | HMAC / JWT |
| `flutter/`     | Flutter (Dart)                                 | HMAC / JWT |
| `node/`        | Node.js (fetch)                                | HMAC / JWT |
| `python/`      | Python (requests)                              | HMAC / JWT |
| `react/`       | React + TypeScript                             | HMAC / JWT |

### CI4 설정 방식

- `php/ci4` 샘플은 `app/Config/EntityServer.php` 중심으로 설정을 관리합니다.
- 다른 언어 샘플은 각 라이브러리/클라이언트 파일 내부 설정값을 직접 수정해 사용합니다.

### Push 헬퍼

- 모든 샘플 클라이언트는 푸시 트리거용 헬퍼를 제공합니다. - `push(pushEntity, payload[, transactionId])` : 내부적으로 `submit(pushEntity, payload)` 호출 - `pushLogList(...)` : 내부적으로 `list('push_log', ...)` 호출
- Python 샘플은 PEP8 네이밍으로 `push_log_list(...)` 메서드를 제공합니다.

### 요청 본문(암호 패킷) 읽기 헬퍼

- 모든 샘플에 요청 본문 파싱 헬퍼를 제공합니다. - `application/octet-stream`이면 XChaCha20-Poly1305 패킷을 복호화해 JSON 반환 - 그 외 Content-Type이면 평문 JSON 파싱 - 옵션으로 `requireEncrypted=true` 정책을 줄 수 있습니다.
- 언어별 메서드명 - Node/React/Kotlin/Java/Swift/Laravel: `readRequestBody(...)` - Python: `read_request_body(...)` - Flutter: `readRequestBody(...)`
