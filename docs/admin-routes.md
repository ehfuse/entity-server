# Admin API Routes

`/v1/admin` 엔드포인트 상세 가이드입니다.

> ⚠️ **경고**: 관리자 API는 데이터 삭제, 시스템 초기화 등 위험한 작업을 수행합니다. 최소 권한 원칙과 RBAC 정책으로 보호하세요.

- 공통 인증 헤더 및 에러 응답 형식은 [api-routes.md](api-routes.md)를 참조하세요.

<a id="summary"></a>

## 목록

### 엔티티 관리

| No. | 항목                                        | 메서드     | 경로                            |
| --- | ------------------------------------------- | ---------- | ------------------------------- |
| 1   | [엔티티 목록 조회](#admin-entities)         | `POST/GET` | `/v1/admin/entities`            |
| 2   | [통계 조회](#admin-stats)                   | `POST/GET` | `/v1/admin/:entity/stats`       |
| 3   | [인덱스 재구축](#admin-rebuild-index)       | `POST`     | `/v1/admin/:entity/reindex`     |
| 3-1 | [스키마 동기화](#admin-sync-schema)         | `POST`     | `/v1/admin/:entity/sync-schema` |
| 4   | [엔티티 초기화 (Reset)](#admin-reset)       | `POST`     | `/v1/admin/:entity/reset`       |
| 5   | [엔티티 비우기 (Truncate)](#admin-truncate) | `POST`     | `/v1/admin/:entity/truncate`    |
| 6   | [엔티티 삭제 (Drop)](#admin-drop)           | `POST`     | `/v1/admin/:entity/drop`        |
| 7   | [시스템 전체 초기화](#admin-reset-all)      | `POST`     | `/v1/admin/reset-all`           |

### 엔티티 설정

| No. | 항목                                                 | 메서드 | 경로                        |
| --- | ---------------------------------------------------- | ------ | --------------------------- |
| 8   | [엔티티 설정 조회](#admin-get-entity-config)         | `GET`  | `/v1/admin/:entity/config`  |
| 9   | [엔티티 설정 저장](#admin-update-entity-config)      | `PUT`  | `/v1/admin/:entity/config`  |
| 9-1 | [엔티티 설정 검증](#admin-validate-entity-config)    | `POST` | `/v1/admin/entity/validate` |
| 9-2 | [엔티티 설정 정규화](#admin-normalize-entity-config) | `POST` | `/v1/admin/entity/nomalize` |
| 9-3 | [엔티티 추가](#admin-create-entity-config)           | `POST` | `/v1/admin/:entity/create`  |

### 설정 관리

| No. | 항목                                        | 메서드  | 경로                        |
| --- | ------------------------------------------- | ------- | --------------------------- |
| 10  | [전체 설정 조회](#admin-configs-list)       | `GET`   | `/v1/admin/configs`         |
| 11  | [도메인별 설정 조회](#admin-configs-get)    | `GET`   | `/v1/admin/configs/:domain` |
| 12  | [도메인별 설정 수정](#admin-configs-update) | `PATCH` | `/v1/admin/configs/:domain` |

### 역할 관리

| No. | 항목                                | 메서드   | 경로                   |
| --- | ----------------------------------- | -------- | ---------------------- |
| 13  | [역할 목록 조회](#admin-roles-list) | `GET`    | `/v1/admin/roles`      |
| 14  | [역할 단건 조회](#admin-roles-get)  | `GET`    | `/v1/admin/roles/:seq` |
| 15  | [역할 생성](#admin-roles-create)    | `POST`   | `/v1/admin/roles`      |
| 16  | [역할 수정](#admin-roles-update)    | `PATCH`  | `/v1/admin/roles/:seq` |
| 17  | [역할 삭제](#admin-roles-delete)    | `DELETE` | `/v1/admin/roles/:seq` |

### API 키 관리

| No. | 항목                                              | 메서드   | 경로                                        |
| --- | ------------------------------------------------- | -------- | ------------------------------------------- |
| 18  | [API 키 목록 조회](#admin-apikeys-list)           | `GET`    | `/v1/admin/api-keys`                        |
| 19  | [API 키 단건 조회](#admin-apikeys-get)            | `GET`    | `/v1/admin/api-keys/:seq`                   |
| 20  | [API 키 생성](#admin-apikeys-create)              | `POST`   | `/v1/admin/api-keys`                        |
| 21  | [API 키 수정](#admin-apikeys-update)              | `PATCH`  | `/v1/admin/api-keys/:seq`                   |
| 22  | [API 키 삭제](#admin-apikeys-delete)              | `DELETE` | `/v1/admin/api-keys/:seq`                   |
| 23  | [API 키 시크릿 재생성](#admin-apikeys-regenerate) | `POST`   | `/v1/admin/api-keys/:seq/regenerate-secret` |

### 계정 관리

| No. | 항목                                   | 메서드   | 경로                      |
| --- | -------------------------------------- | -------- | ------------------------- |
| 24  | [계정 목록 조회](#admin-accounts-list) | `GET`    | `/v1/admin/accounts`      |
| 25  | [계정 단건 조회](#admin-accounts-get)  | `GET`    | `/v1/admin/accounts/:seq` |
| 26  | [계정 생성](#admin-accounts-create)    | `POST`   | `/v1/admin/accounts`      |
| 27  | [계정 수정](#admin-accounts-update)    | `PATCH`  | `/v1/admin/accounts/:seq` |
| 28  | [계정 삭제](#admin-accounts-delete)    | `DELETE` | `/v1/admin/accounts/:seq` |

### 라이선스 관리

| No. | 항목                                       | 메서드   | 경로                      |
| --- | ------------------------------------------ | -------- | ------------------------- |
| 29  | [라이선스 목록 조회](#admin-licenses-list) | `GET`    | `/v1/admin/licenses`      |
| 30  | [라이선스 단건 조회](#admin-licenses-get)  | `GET`    | `/v1/admin/licenses/:seq` |
| 31  | [라이선스 생성](#admin-licenses-create)    | `POST`   | `/v1/admin/licenses`      |
| 32  | [라이선스 수정](#admin-licenses-update)    | `PATCH`  | `/v1/admin/licenses/:seq` |
| 33  | [라이선스 삭제](#admin-licenses-delete)    | `DELETE` | `/v1/admin/licenses/:seq` |

---

## 엔티티 관리 (`/v1/admin`)

<a id="admin-entities"></a>

### 1. 엔티티 목록 조회

등록된 엔티티 설정 목록을 페이지네이션으로 조회합니다.

**엔드포인트**: `POST/GET /v1/admin/entities`

**쿼리 파라미터**:

- `page` (int, default: 1) - 페이지 번호
- `page_size` (int, default: 20) - 페이지당 항목 수

**설명**:

- 각 엔티티 항목에 `table_summary`를 포함해 레코드 수/테이블 크기를 함께 반환합니다.
- 응답의 `data.summary`는 현재 페이지 범위(`scope: page`)의 합계를 제공합니다.

**응답**:

```json
{
    "ok": true,
    "data": {
        "items": [
            {
                "id": "user",
                "name": "user",
                "description": "사용자 엔티티",
                "fields": [{ "name": "email", "type": "string" }],
                "hooks": {},
                "table_summary": {
                    "data_table": "entity_data_account",
                    "index_table": "entity_idx_account",
                    "history_table": "entity_history_account",
                    "total_records": 120,
                    "deleted_records": 3,
                    "data_size_bytes": 1048576,
                    "index_size_bytes": 262144,
                    "history_size_bytes": 131072,
                    "total_size_bytes": 1441792
                },
                "created_at": "",
                "updated_at": ""
            }
        ],
        "total": 1,
        "page": 1,
        "page_size": 20,
        "summary": {
            "scope": "page",
            "entity_count": 1,
            "total_records": 120,
            "deleted_records": 3,
            "total_size_bytes": 1441792
        }
    }
}
```

> `*_size_bytes` 값은 DB 드라이버/스토리지 엔진 특성에 따라 0 또는 근사치로 반환될 수 있습니다.

> 엔티티 단건 메타 정보가 필요하면 `POST/GET /v1/entity/:entity/meta`를 사용하세요.

---

<a id="admin-stats"></a>

### 2. 통계 조회

엔티티의 레코드 통계를 조회합니다.

**엔드포인트**: `POST/GET /v1/admin/:entity/stats`

**응답**:

```json
{
    "ok": true,
    "data": {
        "total": 100,
        "active": 80,
        "deleted": 20
    }
}
```

---

<a id="admin-rebuild-index"></a>

### 3. 인덱스 재구축

인덱스 스키마를 동기화한 뒤 인덱스 데이터를 재구성합니다.

**엔드포인트**: `POST /v1/admin/:entity/reindex`

**응답**:

```json
{
    "ok": true,
    "message": "Index schema synced and data rebuilt successfully",
    "schema": {
        "added": [],
        "dropped": [],
        "unchanged": []
    },
    "indexed": 100
}
```

---

<a id="admin-sync-schema"></a>

### 3-1. 스키마 동기화 (sync-schema)

인덱스 데이터 재구성 없이 스키마(컬럼 comment 등 메타)만 동기화합니다.

- comment 변경처럼 데이터가 아닌 스키마 메타만 바뀐 경우에 사용합니다.
- 설정 저장(`PUT /config`) 시 comment만 변경된 경우 자동으로 호출됩니다.

**엔드포인트**: `POST /v1/admin/:entity/sync-schema`

**응답**:

```json
{
    "ok": true,
    "message": "Index schema synced successfully",
    "schema": {
        "added": [],
        "dropped": [],
        "unchanged": ["name", "email"]
    }
}
```

---

<a id="admin-reset"></a>

### 4. 엔티티 초기화 (Reset)

엔티티 관련 테이블(data/index/history)을 삭제 후 재생성합니다.

**엔드포인트**: `POST /v1/admin/:entity/reset`

**쿼리 파라미터**:

- `confirm` (string, required) - `RESET_엔티티명` 확인 (`confirm=RESET_account`)

**응답**:

```json
{
    "ok": true,
    "message": "Entity reset successfully (tables dropped and recreated)"
}
```

---

<a id="admin-truncate"></a>

### 5. 엔티티 비우기 (Truncate)

엔티티 관련 테이블(data/index/history)의 데이터를 비웁니다 (auto increment 초기화).

**엔드포인트**: `POST /v1/admin/:entity/truncate`

**쿼리 파라미터**:

- `confirm` (string, required) - `TRUNCATE_엔티티명` 확인 (`confirm=TRUNCATE_account`)

**응답**:

```json
{
    "ok": true,
    "message": "Entity truncated successfully (data deleted, auto increment reset)"
}
```

---

<a id="admin-drop"></a>

### 6. 엔티티 삭제 (Drop)

엔티티 관련 테이블(data/index/history)과 `entities` 메타 row를 삭제합니다.

**엔드포인트**: `POST /v1/admin/:entity/drop`

**쿼리 파라미터**:

- `confirm` (string, required) - `DROP_엔티티명` 확인 (`confirm=DROP_account`)

**응답**:

```json
{
    "ok": true,
    "message": "Entity dropped successfully (tables + entities row removed)"
}
```

---

<a id="admin-reset-all"></a>

### 7. 시스템 전체 초기화

모든 엔티티를 초기화합니다.

**엔드포인트**: `POST /v1/admin/reset-all`

**쿼리 파라미터**:

- `confirm` (string, required) - `RESET_ALL_ENTITIES`

**사전 조건**:

- 서버 환경변수 `ENCRYPTION_KEY`가 설정되어 있어야 합니다.

**응답**:

```json
{
    "ok": true,
    "message": "All entity tables reset successfully",
    "result": {
        "dropped": ["entity_data_account", "entity_idx_account"],
        "created": ["entity_data_account", "entity_idx_account"]
    }
}
```

↑ [목록으로 이동](#summary)

---

## 엔티티 설정 (`/v1/admin/:entity/config`, `/v1/admin/entity/validate`, `/v1/admin/entity/nomalize`)

<a id="admin-get-entity-config"></a>

### 8. 엔티티 설정 조회

엔티티의 설정 파일 내용을 raw JSON 텍스트로 반환합니다.

**엔드포인트**: `GET /v1/admin/:entity/config`

**응답**:

```json
{
    "ok": true,
    "data": "{\n    \"name\": \"user\",\n    \"index\": { ... }\n}\n"
}
```

---

<a id="admin-update-entity-config"></a>

### 9. 엔티티 설정 저장

엔티티 설정 파일을 저장합니다. **엔티티가 존재하지 않으면 신규 생성**, 이미 존재하면 수정입니다.  
저장 후 변경 내용을 자동으로 분석하여 필요한 후처리를 수행합니다.

**엔드포인트**: `PUT /v1/admin/:entity/config`

**요청 헤더**: `Content-Type: application/json`

**요청 본문**: 엔티티 설정 JSON 전체 (아래 필드 참조)

> `:entity` (URL 경로)와 본문의 `name` 필드가 일치해야 합니다.

---

#### 신규 생성 흐름 (Admin UI 기준)

1. Admin UI에서 "추가" 버튼 클릭 → 기본 템플릿이 Monaco 에디터에 로드됨
2. `name` 필드를 포함한 설정 JSON 작성
3. "만들기" 버튼 클릭 시:
    - 프론트엔드에서 기존 엔티티 목록과 비교하여 **이름 중복을 사전 차단**
    - `POST /v1/admin/entity/validate`로 서버 검증 수행
    - `POST /v1/admin/entity/nomalize`로 서버 정규화 수행
    - 정규화된 결과로 `POST /v1/admin/{name}/create` 호출
4. 서버가 설정 파일 생성 후 스키마(테이블) 자동 생성

#### 기본 템플릿 (신규 생성 시 에디터 초기값)

```json
{
    "name": "",
    "description": "",
    "enabled": true,
    "db_group": "",
    "index": {
        "field_name": {
            "type": "varchar(255)",
            "comment": "",
            "required": false,
            "nullable": false,
            "unique": false,
            "hash": false,
            "default": null
        }
    },
    "hash": [],
    "required": [],
    "nullable": [],
    "unique": [],
    "types": {},
    "comments": {},
    "defaults": {},
    "fk": {},
    "optimistic_lock": false,
    "history_ttl": 94608000,
    "license_scope": true,
    "hard_delete": false,
    "cache": {
        "enabled": false,
        "ttl_seconds": 0
    },
    "reset_defaults": [],
    "hooks": {
        "before_insert": [],
        "after_insert": [],
        "before_update": [],
        "after_update": [],
        "before_delete": [],
        "after_delete": [],
        "after_get": [],
        "after_list": []
    }
}
```

> `history_ttl` 기본값 `94608000`은 3년(= 3 × 365 × 24 × 3600초)입니다.

---

#### 후처리 자동 수행 규칙 (수정 시)

| 변경 유형                                                             | action        | 자동 처리                   |
| --------------------------------------------------------------------- | ------------- | --------------------------- |
| index 필드 추가/삭제, type/required/nullable/unique/hash/default 변경 | `reindex`     | 스키마 동기화 + 전체 재색인 |
| comment만 변경                                                        | `sync-schema` | ALTER TABLE comment만 수행  |
| index 외 변경 (description 등)                                        | `none`        | 없음                        |

**응답 (reindex)**:

```json
{
    "ok": true,
    "action": "reindex",
    "message": "설정 저장 완료. index 구조 변경이 감지되어 스키마 동기화 및 재색인을 수행했습니다.",
    "schema": { "added": ["phone"], "dropped": [], "unchanged": ["name"] },
    "indexed": 500
}
```

**응답 (sync-schema)**:

```json
{
    "ok": true,
    "action": "sync-schema",
    "message": "설정 저장 완료. comment 변경이 감지되어 스키마를 동기화했습니다.",
    "schema": { "added": [], "dropped": [], "unchanged": ["name", "email"] }
}
```

**응답 (변경 없음 / 신규 생성)**:

```json
{
    "ok": true,
    "action": "none",
    "message": "설정 저장 완료. index 변경 없음."
}
```

**에러 케이스**:

```json
{ "ok": false, "message": "JSON 문법 오류: ..." }
{ "ok": false, "message": "JSON의 name 필드(user2)가 경로의 엔티티명(user)과 일치하지 않습니다." }
```

---

<a id="admin-validate-entity-config"></a>

### 9-1. 엔티티 설정 검증

저장 전에 서버 규칙으로 엔티티 설정을 검증합니다.

**엔드포인트**: `POST /v1/admin/entity/validate`

**요청 헤더**: `Content-Type: application/json`

**응답**:

```json
{
    "ok": true,
    "message": "valid"
}
```

---

<a id="admin-normalize-entity-config"></a>

### 9-2. 엔티티 설정 정규화

저장 전에 서버 규칙으로 엔티티 설정을 정규화하고 완성된 JSON을 반환합니다.

**엔드포인트**: `POST /v1/admin/entity/nomalize`

**요청 헤더**: `Content-Type: application/json`

**응답**:

```json
{
    "ok": true,
    "data": {
        "json": "{\n    \"name\": \"account\", ... }\n",
        "rules": [
            "removed enabled:true (default)",
            "reordered index field keys"
        ]
    }
}
```

---

<a id="admin-create-entity-config"></a>

### 9-3. 엔티티 추가

정규화된 설정 JSON으로 새 엔티티를 생성합니다.

**엔드포인트**: `POST /v1/admin/:entity/create`

↑ [목록으로 이동](#summary)

---

## 설정 관리 (`/v1/admin/configs`)

> **주의**: 설정 변경은 서버 동작에 직접 영향을 줍니다. 수정 전 백업이 자동으로 생성됩니다 (`configs/.backup/`).
> 민감 필드(`password`, `secret`, `api_keys`, `redis_password`)는 응답에서 `"********"`으로 마스킹됩니다.

<a id="admin-configs-list"></a>

### 10. 전체 설정 조회

서버의 모든 설정 도메인(server/database/security/jwt/cache/logging)을 일괄 조회합니다.

**엔드포인트**: `GET /v1/admin/configs`

**요청 예시**:

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:47200/v1/admin/configs
```

**응답**:

```json
{
    "ok": true,
    "data": {
        "items": [
            {
                "domain": "server",
                "label": "서버",
                "config": {
                    "host": "0.0.0.0",
                    "port": 47200,
                    "prefork": false
                },
                "exists": true
            },
            {
                "domain": "database",
                "label": "데이터베이스",
                "config": {
                    "driver": "mysql",
                    "host": "localhost",
                    "port": 3306,
                    "name": "entity_db",
                    "user": "root",
                    "password": "********"
                },
                "exists": true
            }
        ],
        "total": 6
    }
}
```

**도메인 목록**:

| domain     | label        | 파일            |
| ---------- | ------------ | --------------- |
| `server`   | 서버         | `server.json`   |
| `database` | 데이터베이스 | `database.json` |
| `security` | 보안         | `security.json` |
| `jwt`      | JWT 인증     | `jwt.json`      |
| `cache`    | 캐시         | `cache.json`    |
| `logging`  | 로깅         | `logging.json`  |

---

<a id="admin-configs-get"></a>

### 11. 도메인별 설정 조회

특정 도메인의 설정을 단건 조회합니다.

**엔드포인트**: `GET /v1/admin/configs/:domain`

**경로 파라미터**:

- `domain` (string, 필수) — `server` | `database` | `security` | `jwt` | `cache` | `logging`

**요청 예시**:

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:47200/v1/admin/configs/jwt
```

**응답**:

```json
{
    "ok": true,
    "data": {
        "domain": "jwt",
        "label": "JWT 인증",
        "config": {
            "secret": "********",
            "expires_in": 3600,
            "refresh_expires_in": 604800
        },
        "exists": true
    }
}
```

**에러 케이스**:

```json
{ "ok": false, "message": "허용되지 않은 설정 도메인입니다: unknown" }
```

---

<a id="admin-configs-update"></a>

### 12. 도메인별 설정 수정

특정 도메인의 설정을 PATCH 방식으로 병합 업데이트합니다. 제출한 필드만 덮어쓰고 나머지는 기존 값을 유지합니다.

**엔드포인트**: `PATCH /v1/admin/configs/:domain`

**경로 파라미터**:

- `domain` (string, 필수) — `server` | `database` | `security` | `jwt` | `cache` | `logging`

**요청 본문** (변경할 필드만 포함):

```json
{
    "port": 47201,
    "prefork": true
}
```

**동작**:

- 기존 설정 파일을 읽어 요청 본문과 병합합니다.
- 민감 필드(`"********"`)가 그대로 전송되면 기존 원래 값으로 복원합니다.
- 저장 전 `configs/.backup/<domain>_<timestamp>.json`에 자동 백업합니다.
- 원자적 쓰기(tmp 파일 생성 후 rename)로 파일 손상을 방지합니다.

**응답**:

```json
{
    "ok": true,
    "data": {
        "domain": "server",
        "label": "서버",
        "config": {
            "host": "0.0.0.0",
            "port": 47201,
            "prefork": true
        }
    }
}
```

**에러 케이스**:

```json
{ "ok": false, "message": "요청 본문 파싱 실패" }
{ "ok": false, "message": "허용되지 않은 설정 도메인입니다: unknown" }
{ "ok": false, "message": "설정 파일 저장 실패: server" }
```

> ⚠️ **주의**: 변경된 설정은 서버 재시작 후 완전히 적용됩니다. 일부 항목(예: 포트)은 재시작 없이는 반영되지 않습니다.

↑ [목록으로 이동](#summary)

---

## 역할 관리 (`/v1/admin/roles`)

> RBAC 역할을 관리합니다. 역할은 권한(permissions) 목록과 설명으로 구성됩니다. 변경 사항은 서버 보안 설정에 즉시 반영됩니다.

<a id="admin-roles-list"></a>

### 13. 역할 목록 조회

**엔드포인트**: `GET /v1/admin/roles`

**쿼리 파라미터**: `page` (default: 1), `page_size` (default: 100)

**응답**:

```json
{
    "ok": true,
    "data": {
        "items": [
            {
                "seq": 1,
                "name": "admin",
                "permissions": ["*"],
                "description": "전체 권한"
            }
        ],
        "total": 1,
        "page": 1,
        "page_size": 100
    }
}
```

---

<a id="admin-roles-get"></a>

### 14. 역할 단건 조회

**엔드포인트**: `GET /v1/admin/roles/:seq`

**응답**: `{ "ok": true, "data": { "seq": 1, "name": "admin", "permissions": ["*"] } }`

---

<a id="admin-roles-create"></a>

### 15. 역할 생성

**엔드포인트**: `POST /v1/admin/roles`

**요청 본문**:

```json
{
    "name": "editor",
    "permissions": ["entity:read", "entity:list", "entity:create"],
    "description": "편집자"
}
```

**응답**: `{ "ok": true, "seq": 2 }`

---

<a id="admin-roles-update"></a>

### 16. 역할 수정

**엔드포인트**: `PATCH /v1/admin/roles/:seq`

**요청 본문** (변경할 필드만 포함): `{ "permissions": ["entity:*"] }`

**응답**: `{ "ok": true }`

---

<a id="admin-roles-delete"></a>

### 17. 역할 삭제

**엔드포인트**: `DELETE /v1/admin/roles/:seq`

**응답**: `{ "ok": true, "deleted": 2 }`

↑ [목록으로 이동](#summary)

---

## API 키 관리 (`/v1/admin/api-keys`)

> API 키를 생성·관리하고 역할을 바인딩합니다. 시크릿(`hmac_secret`)은 응답에서 마스킹됩니다.

<a id="admin-apikeys-list"></a>

### 18. API 키 목록 조회

**엔드포인트**: `GET /v1/admin/api-keys`

**쿼리 파라미터**: `page` (default: 1), `page_size` (default: 50)

**응답**:

```json
{
    "ok": true,
    "data": {
        "items": [
            {
                "seq": 1,
                "name": "main-key",
                "key": "abc123...",
                "hmac_secret": "********",
                "role": "admin",
                "entities": ["*"],
                "description": "기본 관리 키"
            }
        ],
        "total": 1,
        "page": 1,
        "page_size": 50
    }
}
```

---

<a id="admin-apikeys-get"></a>

### 19. API 키 단건 조회

**엔드포인트**: `GET /v1/admin/api-keys/:seq`

**응답**: `{ "ok": true, "data": { ... } }`

---

<a id="admin-apikeys-create"></a>

### 20. API 키 생성

**엔드포인트**: `POST /v1/admin/api-keys`

**요청 본문**:

```json
{
    "name": "service-key",
    "role": "editor",
    "entities": ["user", "product"],
    "description": "서비스용 키"
}
```

**응답**: `{ "ok": true, "seq": 2 }`

---

<a id="admin-apikeys-update"></a>

### 21. API 키 수정

**엔드포인트**: `PATCH /v1/admin/api-keys/:seq`

**요청 본문** (변경할 필드만 포함): `{ "role": "viewer", "description": "읽기 전용" }`

**응답**: `{ "ok": true }`

---

<a id="admin-apikeys-delete"></a>

### 22. API 키 삭제

**엔드포인트**: `DELETE /v1/admin/api-keys/:seq`

**응답**: `{ "ok": true, "deleted": 2 }`

---

<a id="admin-apikeys-regenerate"></a>

### 23. API 키 시크릿 재생성

HMAC 서명에 사용되는 `hmac_secret`을 새로 생성합니다.

**엔드포인트**: `POST /v1/admin/api-keys/:seq/regenerate-secret`

**응답**:

```json
{
    "ok": true,
    "hmac_secret": "새로 생성된 시크릿 값"
}
```

> ⚠️ 재생성 즉시 기존 시크릿은 무효화됩니다. 클라이언트 설정을 함께 갱신하세요.

↑ [목록으로 이동](#summary)

---

## 계정 관리 (`/v1/admin/accounts`)

> `account` 엔티티의 관리자 전용 CRUD입니다.

<a id="admin-accounts-list"></a>

### 24. 계정 목록 조회

**엔드포인트**: `GET /v1/admin/accounts`

**쿼리 파라미터**: `page` (default: 1), `page_size` (default: 50), `search` (email 필터)

**응답**:

```json
{
    "ok": true,
    "data": {
        "items": [
            {
                "seq": 1,
                "user_seq": 10,
                "email": "admin@example.com",
                "status": "active",
                "rbac_role": "admin"
            }
        ],
        "total": 1,
        "page": 1,
        "page_size": 50
    }
}
```

---

<a id="admin-accounts-get"></a>

### 25. 계정 단건 조회

**엔드포인트**: `GET /v1/admin/accounts/:seq`

**응답**: `{ "ok": true, "data": { ... } }`

---

<a id="admin-accounts-create"></a>

### 26. 계정 생성

**엔드포인트**: `POST /v1/admin/accounts`

**요청 본문**:

```json
{
    "user_seq": 10,
    "email": "user@example.com",
    "status": "active",
    "rbac_role": "viewer"
}
```

**응답**: `{ "ok": true, "seq": 2 }` (HTTP 201)

---

<a id="admin-accounts-update"></a>

### 27. 계정 수정

**엔드포인트**: `PATCH /v1/admin/accounts/:seq`

**요청 본문** (변경할 필드만 포함): `{ "rbac_role": "editor", "status": "suspended" }`

**응답**: `{ "ok": true }`

---

<a id="admin-accounts-delete"></a>

### 28. 계정 삭제

**엔드포인트**: `DELETE /v1/admin/accounts/:seq`

**응답**: `{ "ok": true, "deleted": 2 }`

↑ [목록으로 이동](#summary)

---

## 라이선스 관리 (`/v1/admin/licenses`)

> `license` 엔티티의 관리자 전용 CRUD입니다. 라이선스는 엔티티 접근 범위와 레코드 수 제한을 정의합니다.

<a id="admin-licenses-list"></a>

### 29. 라이선스 목록 조회

**엔드포인트**: `GET /v1/admin/licenses`

**쿼리 파라미터**: `page` (default: 1), `page_size` (default: 50), `status` (`active` | `expired` | `suspended` | `pending`)

**응답**:

```json
{
    "ok": true,
    "data": {
        "items": [
            {
                "seq": 1,
                "key": "LIC-XXXX",
                "description": "기본 라이선스",
                "scope": "global",
                "entities": ["*"],
                "max_records": 10000,
                "status": "active",
                "expires_at": "2027-01-01T00:00:00Z"
            }
        ],
        "total": 1,
        "page": 1,
        "page_size": 50
    }
}
```

---

<a id="admin-licenses-get"></a>

### 30. 라이선스 단건 조회

**엔드포인트**: `GET /v1/admin/licenses/:seq`

**응답**: `{ "ok": true, "data": { ... } }`

---

<a id="admin-licenses-create"></a>

### 31. 라이선스 생성

**엔드포인트**: `POST /v1/admin/licenses`

**요청 본문**:

```json
{
    "key": "LIC-2026-001",
    "description": "서비스 A 라이선스",
    "scope": "entity",
    "entities": ["user", "product"],
    "max_records": 5000,
    "status": "active",
    "expires_at": "2027-12-31T23:59:59Z"
}
```

**응답**: `{ "ok": true, "seq": 2 }` (HTTP 201)

---

<a id="admin-licenses-update"></a>

### 32. 라이선스 수정

**엔드포인트**: `PATCH /v1/admin/licenses/:seq`

**요청 본문** (변경할 필드만 포함): `{ "status": "suspended" }`

**응답**: `{ "ok": true }`

---

<a id="admin-licenses-delete"></a>

### 33. 라이선스 삭제

**엔드포인트**: `DELETE /v1/admin/licenses/:seq`

**응답**: `{ "ok": true, "deleted": 2 }`

↑ [목록으로 이동](#summary)

---

## 참고 문서

- [API Routes 개요](api-routes.md) - 공통 인증, skipHooks, 에러 응답
- [Entity Routes](entity-routes.md) - 엔티티 CRUD API
- [Config Guide](config-guide.md) - 서버 설정 파일 가이드
