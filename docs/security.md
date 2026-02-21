# 보안 설정 가이드

Entity Server의 인증(Authentication) 및 권한(Authorization) 보안 설정을 다룹니다.

---

## 보안 아키텍처

```
[Client Request]
  ↓
  ① HMAC 미들웨어     → 서명/타임스탬프/논스 검증 (인증 + 무결성)
  ↓
  ② RBAC 미들웨어     → 역할 기반 접근 제어 (권한)
  ↓
  [Handler]
```

- **HMAC**: 요청이 정당한가? (인증 + 무결성)
- **RBAC**: 이 API 키가 이 작업을 할 수 있는가? (권한)

두 레이어는 독립적으로 활성화/비활성화 가능합니다.

---

## 환경 변수

| 환경 변수        | 필수 | 설명                                       |
| ---------------- | ---- | ------------------------------------------ |
| `ENCRYPTION_KEY` | ✅   | 데이터 암/복호화 키 (128bit AES-CTR)       |
| `JWT_SECRET`     | ✅   | JWT 서명 키 (HS256)                        |
| `DB_PASSWORD_*`  | 선택 | DB 비밀번호 (`configs/database.json` 매핑) |

> API 키(`key`)와 HMAC 시크릿(`hmac_secret`)은 환경 변수가 아닙니다.
> `./scripts/api-key.sh`로 DB에 생성·관리합니다.

---

## 설정 파일: `configs/security.json`

### 전체 스키마

```json
{
    "enable_hmac": false,
    "enable_rbac": true,
    "timestamp_skew_sec": 300,
    "nonce_ttl_sec": 300,
    "nonce_store": {
        "driver": "redis",
        "redis_addr": "localhost:6379",
        "redis_password": "",
        "redis_db": 0,
        "redis_prefix": "nonce:",
        "memcache_servers": ["localhost:11211"]
    }
}
```

> `roles`와 `api_keys`는 DB에서 관리합니다 (`./scripts/api-key.sh`, Admin API `/v1/admin/roles`).
> 초기 부트스트랩 목적으로만 `security.json`에 정적 선언이 가능하며, 일반 운영에서는 사용하지 않습니다.

### 필드 설명

| 필드                      | 타입 | 기본값 | 설명                             |
| ------------------------- | ---- | ------ | -------------------------------- |
| `enable_hmac`             | bool | false  | HMAC 서명 검증 활성화            |
| `enable_rbac`             | bool | true   | RBAC 역할 기반 접근 제어 활성화  |
| `timestamp_skew_sec`      | int  | 300    | 타임스탬프 허용 오차 (초)        |
| `nonce_ttl_sec`           | int  | 300    | 일회용 값(nonce) 유효 기간 (초)  |
| `auth_fail_limit_per_min` | int  | 120    | IP당 분당 인증 실패 허용 횟수    |
| `auth_block_sec`          | int  | 60     | 인증 실패 초과 시 차단 시간 (초) |

---

## 1단계: HMAC 인증

HMAC은 요청의 **인증**과 **무결성**을 보장합니다.

### 활성화

```json
{
    "enable_hmac": true
}
```

### 클라이언트 요청 헤더

| 헤더          | 설명                         |
| ------------- | ---------------------------- |
| `X-API-Key`   | API 키                       |
| `X-Signature` | HMAC-SHA256 서명값           |
| `X-Timestamp` | Unix 타임스탬프              |
| `X-Nonce`     | 일회용 값 (재전송 공격 방지) |

### 서명 생성 방식

```
payload = "METHOD|PATH|TIMESTAMP|NONCE|BODY"
signature = HMAC-SHA256(API_HMAC_SECRET, payload)
```

**예시** (Python):

```python
import hmac, hashlib, time, uuid, json, requests

api_key = "your-api-key"
secret = "your-hmac-secret"
url = "http://localhost:47200/v1/entity/user/list"
body = json.dumps({"page": 1, "limit": 10})

timestamp = str(int(time.time()))
nonce = str(uuid.uuid4())
payload = f"POST|/v1/entity/user/list|{timestamp}|{nonce}|{body}"
signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()

response = requests.post(url, json={"page": 1, "limit": 10}, headers={
    "X-API-Key": api_key,
    "X-Signature": signature,
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
})
```

### API 키 사용

`X-API-Key` 헤더에 DB에서 발급한 API 키(`key` 값)를 전달합니다.

| 경로           | 사용 키                                     |
| -------------- | ------------------------------------------- |
| `/v1/entity/*` | `api-key.sh`로 발급한 키 (`X-API-Key` 헤더) |
| `/v1/admin/*`  | `api-key.sh`로 발급한 키 (`X-API-Key` 헤더) |

> 키 발급: `./scripts/api-key.sh add --role=admin --apply`

### Nonce 저장소

재전송 공격 방지를 위해 사용된 nonce를 저장합니다.

| 드라이버   | 설정                                       | 용도                     |
| ---------- | ------------------------------------------ | ------------------------ |
| `memory`   | 기본값, 별도 설정 불필요                   | 개발/단일 인스턴스       |
| `redis`    | `redis_addr`, `redis_password`, `redis_db` | 프로덕션 (다중 인스턴스) |
| `memcache` | `memcache_servers`                         | 프로덕션 대안            |

**프로덕션에서는 반드시 `redis` 또는 `memcache`를 사용하세요.** 메모리 저장소는 서버 재시작 시 초기화됩니다.

### Rate Limiting

> ⚠️ Rate Limiting은 **HMAC 미들웨어 내부**에서 동작합니다. `enable_hmac: false`이면 적용되지 않습니다.

IP 기반 인증 실패 제한 (`enable_hmac: true`인 경우에만 동작):

- `auth_fail_limit_per_min: 120` → 분당 120회 초과 시 차단
- `auth_block_sec: 60` → 60초간 해당 IP 차단

---

## 2단계: RBAC 역할 기반 접근 제어

RBAC은 API 키별로 **역할(Role)**을 부여하고, 역할에 따라 **권한(Permission)**을 제어합니다.

### 활성화

```json
{
    "enable_rbac": true
}
```

### 역할 정의

역할은 **DB(`rbac_roles` 엔티티)에서 관리**합니다. 서버 실행 여부에 따라 두 가지 방법을 사용합니다.

**CLI 스크립트** (서버 미실행 시에도 사용 가능):

```bash
./scripts/rbac-role.sh list
./scripts/rbac-role.sh add --name=editor --permissions='["entity:*"]' --description="편집자" --apply
./scripts/rbac-role.sh delete --name=editor --apply
```

**Admin API** (서버 실행 중):

```bash
GET    /v1/admin/roles       # 목록
POST   /v1/admin/roles       # 생성
PATCH  /v1/admin/roles/:seq  # 수정
DELETE /v1/admin/roles/:seq  # 삭제
```

역할 데이터 구조:

```json
{
    "name": "editor",
    "permissions": [
        "entity:read",
        "entity:list",
        "entity:create",
        "admin:entities"
    ],
    "description": "편집자"
}
```

> `security.json`의 `roles` 필드는 최초 부트스트랩 시드 전용입니다. 일반 운영에서는 CLI 스크립트 또는 Admin API를 사용하세요.

### 권한(Permission) 목록

#### Entity 권한

| Permission        | 라우트                                | 설명        |
| ----------------- | ------------------------------------- | ----------- |
| `entity:meta`     | `POST /:entity/meta`                  | 메타 조회   |
| `entity:validate` | `POST /:entity/validate`              | 유효성 검증 |
| `entity:read`     | `POST /:entity/:seq`                  | 단건 조회   |
| `entity:list`     | `POST /:entity/list`                  | 목록 조회   |
| `entity:count`    | `POST /:entity/count`                 | 조건별 개수 |
| `entity:query`    | `POST /:entity/query`                 | 커스텀 쿼리 |
| `entity:create`   | `POST /:entity/submit`                | 생성/수정   |
| `entity:delete`   | `POST /:entity/delete/:seq`           | 삭제        |
| `entity:history`  | `POST /:entity/history/:seq`          | 이력 조회   |
| `entity:rollback` | `POST /:entity/rollback/:history_seq` | 롤백        |

#### Admin 권한

| Permission          | 라우트                                  | 설명             |
| ------------------- | --------------------------------------- | ---------------- |
| `admin:entities`    | `GET /admin/entities`                   | 엔티티 목록 조회 |
| `admin:configs`     | `GET/PATCH /admin/configs[/:domain]`    | 설정 조회/수정   |
| `admin:roles`       | `GET/POST/PATCH/DELETE /admin/roles`    | 역할 관리        |
| `admin:api-keys`    | `GET/POST/PATCH/DELETE /admin/api-keys` | API 키 관리      |
| `admin:users`       | `GET/POST/PATCH/DELETE /admin/users`    | 사용자 관리      |
| `admin:stats`       | `POST /admin/:entity/stats`             | 통계 조회        |
| `admin:reindex`     | `POST /admin/:entity/reindex`           | 인덱스 재구축    |
| `admin:sync-schema` | `POST /admin/:entity/sync-schema`       | 스키마 동기화    |
| `admin:reset`       | `POST /admin/:entity/reset`             | 테이블 초기화    |
| `admin:truncate`    | `POST /admin/:entity/truncate`          | 데이터 비우기    |
| `admin:drop`        | `POST /admin/:entity/drop`              | 엔티티 삭제      |
| `admin:reset-all`   | `POST /admin/reset-all`                 | 전체 초기화      |

### 와일드카드 권한

| 패턴       | 의미                            |
| ---------- | ------------------------------- |
| `*`        | 모든 권한 (admin + entity 전체) |
| `entity:*` | Entity API 전체 권한            |
| `admin:*`  | Admin API 전체 권한             |

### API 키 바인딩

API 키는 **DB에서 관리**하는 것을 권장합니다. 서버 실행 여부에 따라 두 가지 방법을 사용합니다.

**CLI 스크립트** (서버 미실행 시에도 사용 가능):

```bash
./scripts/api-key.sh list
./scripts/api-key.sh add --role=admin --apply
./scripts/api-key.sh add --role=viewer --entities='["user","product"]' --description="뷰어" --apply
./scripts/api-key.sh delete --seq=<n> --apply
```

**Admin API** (서버 실행 중): `GET/POST/PATCH/DELETE /v1/admin/api-keys`

`security.json`의 `api_keys` 필드는 서버 시작 시 추가로 로드되는 **정적 키 바인딩**입니다. DB 키가 없는 초기 부트스트랩 용도로 사용할 수 있습니다:

```json
{
    "api_keys": {
        "$API_KEY": {
            "role": "admin",
            "entities": ["*"],
            "description": "부트스트랩용 정적 키"
        }
    }
}
```

#### 키 이름 규칙

| 형식          | 의미                            |
| ------------- | ------------------------------- |
| `$ENV_VAR`    | 환경 변수에서 실제 키 값을 읽음 |
| `literal-key` | 키 이름 자체가 실제 API 키 값   |

**`$` 접두사**: `$API_KEY` → 환경 변수 `API_KEY`의 값을 실제 API 키로 사용합니다. 환경 변수가 비어있으면 해당 바인딩은 무시됩니다.

#### 엔티티 접근 제한

`entities` 필드로 접근 가능한 엔티티를 제한합니다:

| 값                    | 의미                      |
| --------------------- | ------------------------- |
| `["*"]`               | 모든 엔티티 접근 허용     |
| `["user", "product"]` | user, product만 접근 가능 |

---

## 운영 시나리오별 설정 예시

### 시나리오 1: 내부 서비스 전용 (최소 보안)

서버 간 내부 통신만 사용하는 경우:

```json
{
    "enable_hmac": false,
    "enable_rbac": false
}
```

API 키 기반 인증만 작동합니다 (HMAC 미들웨어의 기본 동작).

### 시나리오 2: RBAC만 사용 (역할 분리)

HMAC 서명 없이 역할 기반 접근 제어만 사용:

1. `security.json`에서 RBAC 활성화:

```json
{
    "enable_hmac": false,
    "enable_rbac": true
}
```

2. Admin API로 역할과 API 키 생성:

```bash
# 역할 생성
POST /v1/admin/roles  {"name": "readonly", "permissions": ["entity:meta", "entity:read", "entity:list", "entity:count"]}

# API 키 생성
./scripts/api-key.sh add --role=admin --apply
./scripts/api-key.sh add --role=readonly --apply
```

### 시나리오 3: HMAC + RBAC (최대 보안)

인증 + 무결성 + 역할 기반 권한 모두 적용:

1. `security.json`:

```json
{
    "enable_hmac": true,
    "enable_rbac": true
}
```

2. Admin API로 역할과 API 키 생성:

```bash
# 역할 생성
POST /v1/admin/roles  {"name": "editor", "permissions": ["entity:*"]}
POST /v1/admin/roles  {"name": "viewer", "permissions": ["entity:meta", "entity:read", "entity:list", "entity:count", "entity:query"]}

# API 키 생성
./scripts/api-key.sh add --role=admin --apply
```

### 시나리오 4: 멀티 서비스 환경

서비스별로 접근 가능한 엔티티를 분리:

1. `security.json`:

```json
{
    "enable_rbac": true
}
```

2. Admin API로 역할과 API 키 생성:

```bash
# 역할 생성
POST /v1/admin/roles  {"name": "user_service", "permissions": ["entity:*"]}
POST /v1/admin/roles  {"name": "report_service", "permissions": ["entity:read", "entity:list", "entity:count", "entity:query"]}

# 서비스별 API 키 생성 (엔티티 범위 제한은 api_keys 엔티티 데이터로 설정)
./scripts/api-key.sh add --role=user_service --entities='["user","user_profile","user_setting"]' --description="사용자 서비스" --apply
./scripts/api-key.sh add --role=report_service --apply
```

---

## 미들웨어 처리 흐름

### HMAC 비활성화 + RBAC 비활성화

```
요청 → (건너뜀) → (건너뜀) → Handler
```

기존 API 키 검증만 동작합니다.

### HMAC 활성화 + RBAC 비활성화

```
요청 → HMAC 검증 → Handler
       ├─ X-API-Key 확인
       ├─ X-Signature 검증
       ├─ X-Timestamp 범위 확인
       └─ X-Nonce 재사용 여부 확인
```

### HMAC 활성화 + RBAC 활성화

```
요청 → HMAC 검증 → RBAC 검증 → Handler
                ├─ API 키로 역할(role) 조회
                ├─ 요청 경로에서 필요 권한 추출
                ├─ 역할의 권한 목록 확인
                └─ 엔티티 접근 범위 확인
```

### 오류 응답

| HTTP 상태 | 원인                                |
| --------- | ----------------------------------- |
| 401       | HMAC 인증 실패 (서명/타임스탬프 등) |
| 403       | RBAC 권한 부족 또는 API 키 미인식   |
| 429       | Rate Limit 초과                     |

---

## 보안 체크리스트

### 프로덕션 배포 전

- [ ] `ENCRYPTION_KEY` 랜덤 값으로 교체 (`./scripts/generate-env-keys.sh --apply`)
- [ ] `JWT_SECRET` 랜덤 값으로 교체 (`./scripts/generate-env-keys.sh --apply`)
- [ ] API 키 생성 (`./scripts/api-key.sh add --role=admin --apply`)
- [ ] 역할 생성 (`./scripts/rbac-role.sh add --name=<역할> --permissions='[...]' --apply`)
- [ ] `enable_hmac: true` 설정 (외부 접근이 있는 경우)
- [ ] `enable_rbac: true` 설정 및 역할/키 바인딩 구성
- [ ] Nonce 저장소를 `redis`로 설정 (다중 인스턴스 환경)
- [ ] `auth_fail_limit_per_min` 값을 환경에 맞게 조정
- [ ] 불필요한 역할에 최소 권한만 부여 (최소 권한 원칙)
- [ ] 서비스별 별도 API 키 발급 및 엔티티 접근 범위 제한
- [ ] `ENCRYPTION_KEY`, `JWT_SECRET` 안전하게 관리 (환경 변수 또는 시크릿 매니저)

### 키 관리

**환경 변수 키 (`ENCRYPTION_KEY`, `JWT_SECRET`)**

- 생성 후 `.env` 반영: `./scripts/generate-env-keys.sh --apply`
- 출력만 (복붙): `./scripts/generate-env-keys.sh --create`
- 수동 생성: `openssl rand -hex 32`
- `.env` 파일을 코드 저장소에 포함하지 마세요
- 주기적으로 키를 교체하세요 (90일 권장)

**API 키 (`key` + `hmac_secret`) — DB 관리**

- API 키와 HMAC 시크릿은 자동 생성되어 DB(`api_keys` 엔티티)에 저장됩니다
- 생성: `./scripts/api-key.sh add --role=admin --apply`
- 목록: `./scripts/api-key.sh list`
- 삭제: `./scripts/api-key.sh delete --seq=<n> --apply`
- HMAC 시크릿 재생성: Admin API `POST /v1/admin/api-keys/:seq/regenerate-secret`

**역할 (`name` + `permissions`) — DB 관리**

- 역할은 `rbac_roles` 엔티티에 저장됩니다
- 생성: `./scripts/rbac-role.sh add --name=editor --permissions='["entity:*"]' --apply`
- 목록: `./scripts/rbac-role.sh list`
- 삭제: `./scripts/rbac-role.sh delete --name=editor --apply`
