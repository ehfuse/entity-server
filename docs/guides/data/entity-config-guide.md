# Entity Config Guide (엔티티 설정 가이드)

## 최소 예시

```json
{
    "name": "user",
    "description": "사용자 기본 정보",
    "index": {
        "email": {
            "comment": "사용자 이메일",
            "type": "email",
            "required": true,
            "unique": true
        },
        "name": {
            "comment": "사용자명",
            "type": "varchar(100)",
            "required": true
        },
        "status": {
            "comment": "상태",
            "type": ["active", "inactive"],
            "default": "active"
        }
    },
    "fields": {
        "bio": {
            "comment": "자기소개",
            "type": "text"
        }
    },
    "reset_defaults": [
        {
            "email": "admin@example.com",
            "name": "Admin"
        }
    ],
    "history_ttl": 1095
}
```

## 전체 예시

모든 설정 키를 사용한 예시입니다.

```json
{
    "name": "user",
    "description": "사용자 계정",
    "enabled": true,

    "index": {
        "email": {
            "comment": "이메일",
            "type": "email",
            "required": true,
            "unique": true,
            "hash": true
        },
        "name": {
            "comment": "사용자명",
            "type": "varchar(100)",
            "required": true
        },
        "status": {
            "comment": "계정 상태",
            "type": ["active", "inactive", "suspended"],
            "default": "active"
        },
        "role": {
            "comment": "역할",
            "type": "varchar(50)",
            "default": "member"
        },
        "department_seq": {
            "comment": "소속 부서 seq"
        },
        "joined_at": {
            "comment": "가입일시",
            "nullable": false
        }
    },

    "fields": {
        "bio": {
            "comment": "자기소개",
            "type": "text",
            "required": true
        },
        "profile_image_url": {
            "comment": "프로필 이미지 URL",
            "type": "string"
        },
        "extra_data": {
            "comment": "추가 데이터",
            "fields": {
                "theme": {
                    "type": ["light", "dark"],
                    "default": "light"
                }
            }
        }
    },

    "unique": [["department_seq", "email"]],

    "fk": {
        "department_seq": "department.seq"
    },

    "reset_defaults": [
        {
            "email": "{{DEFAULT_EMAIL}}",
            "name": "Admin",
            "role": "admin",
            "status": "active"
        }
    ],

    "history_ttl": 1095,
    "license_scope": true,
    "optimistic_lock": true,
    "hard_delete": false,
    "compress": false,
    "db_group": "development",

    "cache": {
        "enabled": true,
        "ttl_seconds": 300
    }
}
```

## 동작 요약

| 기능         | 설명                            |
| ------------ | ------------------------------- |
| Data 저장    | 암호화된 JSON blob 저장         |
| Index 저장   | `index` 필드만 별도 테이블 저장 |
| History 저장 | 액션별 `data_snapshot` 저장     |
| List 필터    | index 테이블 기반 조건 검색     |

## enabled

엔티티별 사용 여부를 `enabled`로 제어할 수 있습니다.

```json
{
    "name": "legacy_entity",
    "enabled": false,
    "index": ["name"]
}
```

- 기본값: `true` (생략 시 사용)
- `enabled=false`인 엔티티는 로드 대상에서 제외됩니다.
- API 호출 시 비활성 엔티티는 사용 불가(설정 없음과 동일하게 처리)됩니다.

## index 확장 형식

`index`는 문자열 배열(간단 모드) 또는 객체맵(확장 모드)을 지원합니다.

### 1) 간단 형식

```json
{
    "index": ["email", "name", "status"]
}
```

### 2) 확장 형식 (권장)

```json
{
    "index": {
        "email": {
            "comment": "사용자 이메일",
            "type": "varchar(255)",
            "required": true,
            "unique": true,
            "hash": true
        },
        "status": {
            "comment": "상태",
            "type": ["active", "inactive"],
            "default": "active"
        },
        "name": {
            "comment": "사용자명",
            "required": true
        }
    }
}
```

### 확장 필드 의미 (`index` / `fields` 공통)

아래 키들은 `index.<field>`와 `fields.<field>`에서 공통으로 사용합니다. (단, `unique`, `hash`, `index_only`는 `index` 전용)

| 키           | index | fields | 설명                                                        |
| ------------ | :---: | :----: | ----------------------------------------------------------- |
| `comment`    |   O   |   O    | 필드 코멘트                                                 |
| `type`       |   O   |   O    | 타입 힌트 (문자열 또는 enum 배열)                           |
| `default`    |   O   |   O    | 기본값 (`index`: 인덱스 컬럼 기본값, `fields`: data 기본값) |
| `required`   |   O   |   O    | `true`면 입력 필수                                          |
| `nullable`   |   O   |   O    | `true`면 null 허용                                          |
| `unique`     |   O   |   X    | `true`면 단일 필드 유니크 (`index` 전용)                    |
| `hash`       |   O   |   X    | `true`면 인덱스 값 평문 대신 해시 저장 (`index` 전용)       |
| `index_only` |   O   |   X    | `true`면 인덱스 테이블에만 저장 (`index` 전용)              |

> `index`는 검색/정렬용 컬럼 설계가 목적입니다. 본문 데이터 구조 설계/검증은 아래 `fields`를 사용하세요.

### index_only (인덱스 전용 필드)

`index_only: true`인 필드는 **인덱스 테이블(`entity_idx_*`)에만 저장**되며, 암호화된 data blob에 포함되지 않습니다.

```json
{
    "name": "device",
    "index": {
        "device_id": { "required": true, "unique": true },
        "status": { "index_only": true, "default": "active" },
        "rssi": { "index_only": true, "type": "int" }
    }
}
```

#### 동작

- **Submit/Update**: `index_only` 필드는 인덱스 테이블에만 저장되고, data blob 암호화에서 제외
- **Get/List**: 응답에 index_only 필드가 자동으로 병합됨 (인덱스 테이블에서 조회)
- **UpdateIndexOnly**: index_only 필드만 별도로 갱신하는 전용 메서드 제공 (data blob 변경 없이 인덱스만 UPDATE)
- **History**: index_only 필드는 data blob에 없으므로 이력에 포함되지 않음

#### 제약

- `index_only: true`와 `required: true`는 동시 사용 불가 (normalizer가 `required` 자동 제거)
- `index_only`는 `index` 전용이며 `fields`에서는 사용 불가

#### 용도

- 빈번하게 갱신되는 상태 필드 (온라인/오프라인, 신호 강도 등)
- 복호화 없이 빠르게 조회/필터링이 필요한 메타데이터

## fields (데이터 구조 스키마)

`fields`는 **data JSON 구조를 선언**하는 키입니다. `index`에 올리지 않아도 구조/타입/필수값/기본값을 정의하고 `submit` 시 검증할 수 있습니다.

### 예시

```json
{
    "name": "push_msg",
    "index": {
        "account_seq": { "required": true },
        "title": { "required": true }
    },
    "fields": {
        "message": { "type": "string", "nullable": true },
        "msg_data": { "type": "string", "nullable": true },
        "meta": {
            "fields": {
                "priority": {
                    "type": ["low", "normal", "high"],
                    "default": "normal"
                }
            }
        }
    }
}
```

### 동작 규칙

- `fields.<name>.required=true`인데 값이 없으면 `submit`이 에러를 반환합니다.
- `fields.<name>.type`이 문자열이면 타입 강제 변환/검증(`int`, `uint`, `string`, `bool`, `date` 등)이 적용됩니다.
- `fields.<name>.type`이 배열이면 enum 허용값으로 검증합니다.
- `fields.<name>.default`는 값이 누락된 경우 자동 적용됩니다.
- `fields.<name>.fields`로 그룹(중첩 객체) 스키마를 정의할 수 있습니다.
- `fields`에 선언되지 않은 추가 키는 그대로 허용됩니다(유연 모드).

권장 선언 순서: `comment` → `type` → `default` → `required` → `nullable` → `unique` → `hash`

### 지원 타입 목록

`index.<field>.type` 및 `fields.<field>.type`에 사용할 수 있는 타입 문자열입니다.

#### 명시 타입 (type 키에 문자열로 선언)

| 타입 문자열                                          | DB 컬럼 타입                                                                          | 비고                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| `"int"` / `"number"`                                 | `BIGINT`                                                                              | 부호 있는 64비트 정수            |
| `"integer"`                                          | `INT`                                                                                 | 부호 있는 32비트 정수            |
| `"tinyint"`                                          | `TINYINT` (MySQL/MSSQL) / `SMALLINT` (PgSQL) / `INTEGER` (SQLite)                     | 8비트 정수                       |
| `"smallint"`                                         | `SMALLINT` (MySQL/PgSQL/MSSQL) / `INTEGER` (SQLite)                                   | 16비트 정수                      |
| `"uint"`                                             | `BIGINT UNSIGNED` (MySQL) / `BIGINT` (PgSQL/MSSQL) / `INTEGER` (SQLite)               | 부호 없는 64비트 정수            |
| `"string"`                                           | `VARCHAR(255)`                                                                        |                                  |
| `"text"`                                             | `TEXT`                                                                                | 대용량 문자열 (인덱스 불가)      |
| `"mediumtext"`                                       | `MEDIUMTEXT` (MySQL) / `TEXT` (PgSQL/SQLite) / `NVARCHAR(MAX)` (MSSQL)                | 중간 크기 텍스트                 |
| `"longtext"`                                         | `LONGTEXT` (MySQL) / `TEXT` (PgSQL/SQLite) / `NVARCHAR(MAX)` (MSSQL)                  | 최대 크기 텍스트                 |
| `"bool"` / `"boolean"`                               | `TINYINT(1)` (MySQL) / `BOOLEAN` (PgSQL) / `INTEGER` (SQLite) / `BIT` (MSSQL)         |                                  |
| `"date"`                                             | `DATE`                                                                                |                                  |
| `"datetime"` / `"timestamp"`                         | `DATETIME` (MySQL/SQLite) / `TIMESTAMP` (PgSQL) / `DATETIME2` (MSSQL)                 |                                  |
| `"year"`                                             | `YEAR` (MySQL) / `SMALLINT` (PgSQL/MSSQL) / `INTEGER` (SQLite)                        | 연도 (1901~2155, MySQL YEAR형)   |
| `"month"`                                            | `TINYINT` (MySQL/MSSQL) / `SMALLINT` (PgSQL) / `INTEGER` (SQLite)                     | 월 (1~12)                        |
| `"decimal"`                                          | `DECIMAL(15,2)`                                                                       | 금액/소수 전용                   |
| `"float"`                                            | `FLOAT` (MySQL/MSSQL) / `REAL` (PgSQL/SQLite)                                         | 단정밀도 부동소수점              |
| `"double"`                                           | `DOUBLE` (MySQL) / `DOUBLE PRECISION` (PgSQL) / `REAL` (SQLite) / `FLOAT(53)` (MSSQL) | 배정밀도 부동소수점              |
| `"blob"` / `"binary"`                                | `LONGBLOB` (MySQL) / `BYTEA` (PgSQL) / `BLOB` (SQLite) / `VARBINARY(MAX)` (MSSQL)     | 바이너리 대용량 객체             |
| `"json"`                                             | data 컬럼 내 저장 (DB 컬럼 타입 변경 없음)                                            | submit 시 JSON 형식 검증         |
| `"email"` / `"url"` / `"uuid"` / `"phone"` / `"tel"` | `VARCHAR(255)`                                                                        | 의미 표현용 별칭, DB 타입은 동일 |
| `"varchar(n)"` 등                                    | 입력한 문자열 그대로 SQL에 전달                                                       | DB별 지원 여부 확인 필요         |
| 배열 `["a", "b", ...]`                               | `VARCHAR(255)`                                                                        | enum 허용값 선언, 입력 시 검증   |

> `text` 타입은 `fields`에서 자유롭게 사용할 수 있습니다. `index` 필드에 선언하면 인덱스 테이블에 `TEXT` 컬럼이 생성되어 정렬/필터 성능이 저하됩니다.
>
> `"json"` 타입은 index 컬럼 타입을 변경하지 않습니다. `fields`에 선언 시 submit 시점에 유효한 JSON인지 검증합니다 (문자열이면 파싱 시도, map/배열이면 통과).
>
> `"varchar(n)"` 등 매핑 테이블에 없는 타입 문자열은 DB에 그대로 전달됩니다. DB별 지원 여부와 이식성을 직접 확인해야 합니다.

#### 필드명 자동 추론 패턴

`type`을 별도 선언하지 않아도 필드명으로 타입이 자동 결정됩니다.

| 필드명 패턴                                | DB 컬럼 타입                                 |
| ------------------------------------------ | -------------------------------------------- |
| `*_seq`, `*_id`                            | `BIGINT UNSIGNED` (MySQL) / `BIGINT` (PgSQL) |
| `*_date`                                   | `DATE`                                       |
| `*_time`, `*_at`                           | `DATETIME` / `TIMESTAMP`                     |
| `is_*`, `has_*`, `can_*`                   | `TINYINT(1)` / `BOOLEAN`                     |
| `*_amount`, `*_price`, `*_total`, `*_cost` | `DECIMAL(15,2)`                              |
| `*_count`, `*_cnt`, `*_qty`, `*_quantity`  | `INT`                                        |
| `name`, `*_name`                           | `VARCHAR(100)`                               |
| `*email*`                                  | `VARCHAR(255)`                               |
| `*phone*`, `*tel*`                         | `VARCHAR(50)`                                |
| 그 외                                      | `VARCHAR(255)` (기본값)                      |

> 자동 추론보다 명시 `type`이 우선 적용됩니다. `user_seq`처럼 `_seq`로 끝나는 필드는 `type` 없이도 `BIGINT UNSIGNED`로 생성됩니다.

### index 필드 기본값 예시 (`default`)

인덱스 필드는 확장 형식에서 `default`를 직접 선언할 수 있습니다.

```json
{
    "name": "user",
    "index": {
        "status": {
            "comment": "상태",
            "type": ["active", "inactive"],
            "default": "active"
        },
        "role": {
            "comment": "역할",
            "type": "varchar(20)",
            "default": "member"
        }
    }
}
```

- 인덱스 필드 기본값은 `index.<field>.default`에 선언합니다.
- 인덱스 외 일반 필드 기본값은 `fields.<field>.default`를 사용합니다.
- 동일 필드에 `index.<field>.default`와 `fields.<field>.default`가 모두 있으면 각 적용 대상(인덱스 컬럼/데이터 필드)에 맞게 사용됩니다.

### 병합/우선순위 규칙

- 문자열 배열은 메타 없는 인덱스만 선언합니다.
- 객체맵은 `comment/type/required/unique/hash`를 한 위치에서 선언합니다.
- 복합 유니크는 기존처럼 `unique: [["field_a", "field_b"]]`를 사용합니다.
- `type` 문자열은 대소문자 구분 없이 동작하며, 문서/설정 일관성을 위해 소문자 표기를 권장합니다.

### 복합 유니크(복합키) 설정

- `index.<field>.unique=true`는 **단일 필드 유니크**만 의미합니다.
- **복합 유니크(복합키)**는 top-level `unique` 배열에서 정의합니다.

```json
{
    "index": {
        "user_seq": {
            "comment": "사용자 seq",
            "required": true
        },
        "device_id": {
            "comment": "디바이스 ID",
            "required": true
        }
    },
    "unique": [["user_seq", "device_id"]]
}
```

- 단일 + 복합을 함께 쓸 수 있습니다.
    - 단일: `index.email.unique=true`
    - 복합: `unique: [["user_seq", "device_id"]]`

## description

- `description`은 엔티티 설명 문자열입니다.
- 설정 시 data/index/history 테이블의 DB COMMENT에 함께 반영됩니다.
- `comments`(필드 코멘트)와 용도가 다릅니다.

## reset_defaults

- `reset-all` 실행 시 엔티티별 기본 데이터로 입력됩니다.
- 실행 결과에 엔티티별 row가 출력되며 민감값은 마스킹됩니다.

## history

- `history`는 변경 이력(INSERT/UPDATE/DELETE) 기록 여부를 제어합니다.
- **기본값은 `true`**(생략 시 활성). 명시적으로 `false`를 설정하면 비활성화됩니다.

```json
{
    "name": "sensor_log",
    "history": false,
    "index": ["device_seq", "value", "logged_at"]
}
```

### 동작

| 값      | 이력 테이블 | INSERT/UPDATE/DELETE 시 기록 | history 조회 API | rollback API |
| ------- | ----------- | ---------------------------- | ---------------- | ------------ |
| `true`  | 생성됨      | 기록                         | 사용 가능        | 사용 가능    |
| `false` | 미생성      | 스킵                         | 400 에러         | 400 에러     |

> **normalizer 규칙**: `history: true`는 기본값이므로 정규화 시 제거됩니다.

### 용도

- 대량 삽입 엔티티(센서 로그, 이벤트 스트림 등)에서 이력 테이블 부하 제거
- 변경 추적이 불필요한 캐시성/일시적 데이터

## data_encryption

- `data_encryption`은 `entity_data_*` 테이블의 data 컬럼 암호화 여부를 제어합니다.
- **기본값은 `true`**(생략 시 XChaCha20-Poly1305 암호화). `false`로 설정하면 평문 JSON 저장됩니다.

```json
{
    "name": "public_config",
    "data_encryption": false,
    "index": ["key", "category"]
}
```

### 동작

| 값      | data 컬럼   | 복호화 필요 | 비고                                  |
| ------- | ----------- | ----------- | ------------------------------------- |
| `true`  | 암호화 blob | 예          | 기본 동작, 운영 권장                  |
| `false` | 평문 JSON   | 아니오      | DB에서 직접 조회 가능, 보안 주의 필요 |

> **normalizer 규칙**: `data_encryption: true`는 기본값이므로 정규화 시 제거됩니다.
>
> **우선순위**: `license_scope: true` + 라이선스 키가 있으면 라이선스 키가 사용되고, `data_encryption: false`이면 암호화를 완전히 건너뜁니다.

## history_ttl

- `history_ttl`은 보존일입니다.
- 보존일 초과 이력 삭제는 두 경로로 수행됩니다.
    - 엔티티 `INSERT` 발생 시: 엔티티별로 하루 1회 자동 정리
    - 운영 명령 실행 시: `cleanup-history`로 수동 정리

## license_scope / isolated

| 항목                 | 현재 동작                                         |
| -------------------- | ------------------------------------------------- |
| `license_scope=true` | `license_seq` 스코프 및 라이선스 키 기반 암복호화 |
| `isolated=license`   | 라이선스 전용 동작(암복호화/스코프 규칙)          |
| `db_group`           | 엔티티별 DB 그룹 라우팅                           |

### global_license_scope (server.json)

`server.json`의 `global_license_scope: true`로 설정하면 **모든 엔티티**에 `license_scope: true`가 자동 적용됩니다.

| 값               | 적합한 상황                                                                                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `true`           | **멀티 테넌트** 시스템. 엔티티 데이터를 라이선스(고객사)별로 파티션하고, 라이선스마다 별도 암복호화 키(`license.secret_key` 파생)를 사용해야 할 때. 엔티티마다 `license_scope: true`를 반복 선언하는 부담을 없앨 수 있음                                                                                      |
| `false` (기본값) | **단일 라이선스** 시스템. `license` 엔티티를 사용하더라도 데이터를 `license_seq`별로 파티션할 필요가 없는 경우. `license_seq` 컬럼이 테이블에 생성되지 않으며, 암복호화는 전역 `ENCRYPTION_KEY`를 직접 사용 (`license.secret_key` 미사용). 필요한 엔티티에만 개별적으로 `license_scope: true`를 선언하는 방식 |

```json
// configs/server.json
{
    "global_license_scope": true
}
```

**단, 아래 엔티티들은 라이선스에 속하지 않는 시스템 수준 데이터이므로 `license_scope: false`를 명시해야 합니다:**

| 대상         | 이유                                                      |
| ------------ | --------------------------------------------------------- |
| `rbac_roles` | 전체 시스템 공통 역할 정의, 특정 라이선스에 종속되지 않음 |
| `api_keys`   | 서버 전역 API 키, 라이선스 시드보다 먼저 생성됨           |
| `license`    | 라이선스 자체 (자동 제외 처리됨)                          |

```json
// entities/System/Auth/rbac_roles.json
{
    "name": "rbac_roles",
    "license_scope": false,
    ...
}
```

`global_license_scope: true` 상태에서 위 엔티티에 `license_scope: false`를 누락하면, `reset-all` 또는 초기 시드 시 license 테이블이 아직 없는 시점에 `license_seq is required` 에러가 발생합니다.

### 암복호화 키 선택 규칙

엔티티 데이터 저장/조회 시 사용되는 암복호화 키는 아래 우선순위로 결정됩니다.

| 경우                    | 사용 키                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| 엔티티 이름이 `license` | 전역 `ENCRYPTION_KEY`                                             |
| `license_scope: false`  | 전역 `ENCRYPTION_KEY`                                             |
| `license_scope: true`   | 해당 레코드의 `license_seq`로 조회한 `license.secret_key` 파생 키 |

즉 `license` 엔티티 자체는 항상 전역 키로 암복호화되며, `license.secret_key`는 다른 `license_scope: true` 엔티티들의 파생 키 재료로만 사용됩니다.

### license 엔티티 필수 구조

`license_scope: true`를 사용하는 시스템에서 `license` 엔티티는 반드시 아래 필드를 포함해야 합니다.

| 필드         | 선언 위치                  | 필수 | 설명                                                                                                                       |
| ------------ | -------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| `name`       | `index` (`required: true`) | ✓    | 라이선스명                                                                                                                 |
| `secret_key` | 자동 주입 (`varchar(32)`)  | -    | 라이선스별 암복호화 파생 키 (submit 시 자동 생성, 16바이트 랜덤 hex = 32자 고정). 사용자 선언 불필요, 백엔드에서 강제 적용 |

```json
{
    "name": "license",
    "index": {
        "name": {
            "comment": "라이선스명",
            "required": true
        }
    }
    // secret_key는 types에 선언하지 않아도 자동 적용됨
}
```

- `secret_key`는 API로 제출하지 않아도 submit 시 자동으로 16바이트 랜덤 hex 값이 생성됩니다.
- 직접 값을 제공하면 제공한 값이 사용됩니다.
- `reset-all` 시드 출력에서는 마스킹되어 표시됩니다.

### unique 규칙 (license_scope)

- `license_scope=true` 엔티티는 `unique` 생성 시 `license_seq`가 자동으로 복합키에 포함됩니다.
- 따라서 아래 두 설정은 동일한 결과를 만듭니다.
    - `"unique": ["name"]`
    - `"unique": [["license_seq", "name"]]`
- 중복 명시를 줄이기 위해 권장 표기는 `"unique": ["name"]` 입니다.

## hard_delete

엔티티별로 삭제 시 기본 동작을 hard delete로 설정할 수 있습니다.

```json
{
    "name": "temp_data",
    "hard_delete": true
}
```

- **기본값**: `false` (soft delete - `deleted_time` 컬럼 업데이트)
- **`hard_delete: true`**: 삭제 시 항상 물리적으로 삭제 (레코드 완전 제거)
- API 요청의 `hard` 파라미터보다 우선 적용됨
- 로그나 임시 데이터처럼 완전 삭제가 필요한 엔티티에 유용

## compress

엔티티별 MySQL InnoDB 테이블 압축을 설정합니다.

```json
{
    "name": "archive_log",
    "compress": true
}
```

- **기본값**: `false` (압축 없음)
- **`compress: true`**: data 테이블과 history 테이블을 `ROW_FORMAT=COMPRESSED`로 생성합니다.
- **index 테이블은 압축하지 않습니다** — 목록 조회/필터에 빈번히 사용되므로 압축 오버헤드가 성능을 저하시킵니다.
- PostgreSQL, SQLite에서는 무시됩니다.

### 트레이드오프

| 항목   | 내용                                                                              |
| ------ | --------------------------------------------------------------------------------- |
| 장점   | 디스크 사용량 20\~50% 절감, I/O 감소 (페이지당 더 많은 데이터 캐시)               |
| 단점   | INSERT/UPDATE 시 CPU 압축 오버헤드, 행 최대 크기 제한 (`KEY_BLOCK_SIZE` 기본 8KB) |
| 적합   | 자주 쓰지 않는 대용량 엔티티 — 아카이브, 로그, 감사 기록 등                       |
| 부적합 | 실시간 트랜잭션이 많은 엔티티                                                     |

### 주의사항

- `compress: true`는 **테이블 생성 시점**에만 적용됩니다. 이미 생성된 테이블은 `ALTER TABLE ... ROW_FORMAT=COMPRESSED`로 직접 변경해야 합니다.
- MySQL 5.7 이상 InnoDB에서 지원됩니다. `innodb_file_per_table=ON`(기본값)이 필요합니다.

## optimistic_lock

엔티티별 낙관적 락을 설정할 수 있습니다.

```json
{
    "name": "user",
    "optimistic_lock": true
}
```

- `true`면 `_version` 기반 충돌 검사를 수행합니다.
- `_version` 누락/형식 오류는 `400`, 버전 충돌은 `409`로 응답합니다.
- 우선순위는 `entity.optimistic_lock` > `server.global_optimistic_lock` > `false` 입니다.

## 엔티티별 DB 그룹 지정

- `db_group`이 설정되면 해당 엔티티는 지정한 DB 그룹으로 라우팅됩니다.
- `db_group`이 없으면 `database.json`의 `default` 그룹을 사용합니다.

## 권장 패턴

- 새 엔티티는 `index` 객체맵을 기본으로 사용
- `index`에는 조회/정렬 조건에 실제 사용하는 필드만 선언
- 단일 유니크는 `index.<field>.unique=true`, 복합 유니크는 `unique` 배열 사용
- `history_ttl`을 업무 도메인별로 명확히 지정

## entities/\*.json 공통 키

| 키                | 설명                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`            | 엔티티 이름                                                                                                                                       |
| `description`     | 엔티티 설명(테이블 COMMENT에 반영)                                                                                                                |
| `enabled`         | 엔티티 사용 여부 (`false`면 로드/사용 제외, 기본값 `true`)                                                                                        |
| `index`           | 검색/정렬/카운트 조건에 사용할 필드. 권장: 객체맵으로 선언하고 `comment/type/default/required/nullable/unique/hash/index_only` 설정               |
| `unique`          | 복합 유니크 제약 (예: `[["user_seq", "device_id"]]`)                                                                                              |
| `fields`          | (선택) data JSON 본문 스키마. `index`와 동일한 확장 키(`comment/type/default/required/nullable`)를 사용하고, 중첩은 `fields.<name>.fields`로 선언 |
| `fk`              | (선택) 외래키 참조 선언 (예: `"user_seq": "user.seq"`). 생략 시 `*_seq` 패턴 자동 추론                                                            |
| `reset_defaults`  | reset-all 시 시드 데이터                                                                                                                          |
| `history`         | 변경 이력 기록 여부 (기본값 `true`). `false` 설정 시 `entity_history_*` 테이블 미생성, history/rollback API 비활성화                              |
| `history_ttl`     | 히스토리 보존일(INSERT 시 엔티티별 일 1회 자동 정리 + `cleanup-history` 수동 정리 시 보존일 초과 이력 삭제)                                       |
| `data_encryption` | 데이터 암호화 여부 (기본값 `true`). `false` 설정 시 data 컬럼에 평문 JSON 저장                                                                    |
| `license_scope`   | 라이선스 스코프 여부                                                                                                                              |
| `isolated`        | `license` 또는 일반 엔티티 동작 지정 (기본값: `entity`, 생략 가능)                                                                                |
| `optimistic_lock` | 낙관적 락 사용 여부 (`_version` 기반, 엔티티 값이 전역값보다 우선)                                                                                |
| `hard_delete`     | 삭제 시 항상 물리 삭제 여부 (기본값 `false` = soft delete)                                                                                        |
| `compress`        | `true`이면 MySQL InnoDB data/history 테이블을 `ROW_FORMAT=COMPRESSED`로 생성. index 테이블 제외. PostgreSQL/SQLite 무시. (기본값 `false`)         |
| `cache`           | 엔티티별 캐시 설정 (`enabled`, `ttl_seconds`). 생략 시 전역 캐시 설정 사용                                                                        |
| `hooks`           | (선택) 이벤트 훅 설정 (`before_insert`, `after_insert`, `after_get` 등)                                                                           |
| `db_group`        | 엔티티 라우팅 대상 DB 그룹명                                                                                                                      |

### index / fields 빠른 선택

| 구분     | 언제 선언하나                              | 어떻게 선언하나                                                            |
| -------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| `index`  | 목록 검색/정렬/필터 조건에 실제로 쓰일 때  | `index.<field>`에 확장 키 선언 (`required/unique/hash` 포함)               |
| `fields` | 저장은 필요하지만 검색 조건으로는 안 쓸 때 | `fields.<field>`에 확장 키 선언 (`comment/type/default/required/nullable`) |

`index` 객체맵 권장 키 순서: `comment` → `type` → `default` → `required` → `nullable` → `unique` → `hash`

복합 유니크는 `index.<field>.unique=true`가 아니라 top-level `unique`에 선언합니다.

해시 저장은 top-level `hash`가 아니라 `index.<field>.hash=true`로만 선언합니다.

필드 타입/코멘트/기본값/필수/nullable 규칙은 top-level(`types/comments/defaults/required/nullable`)이 아니라 `fields`에서 선언합니다.

## cache (엔티티별 캐시 설정)

엔티티별로 캐시 동작을 재정의할 수 있습니다.

### 예시

```json
{
    "name": "user",
    "index": {
        "email": {},
        "name": {}
    },
    "cache": {
        "enabled": true,
        "ttl_seconds": 600
    }
}
```

### 필드

| 필드          | 타입    | 설명                                     |
| ------------- | ------- | ---------------------------------------- |
| `enabled`     | boolean | 이 엔티티의 캐시 사용 여부 (선택)        |
| `ttl_seconds` | number  | 캐시 TTL (초), 전역 설정보다 우선 (선택) |

### 동작

- `enabled`가 명시되지 않으면 전역 캐시 설정(`cache.json`)을 따릅니다.
- `enabled=false`로 설정하면 전역 캐시가 활성화되어 있어도 이 엔티티는 캐시하지 않습니다.
- `ttl_seconds`가 명시되면 전역 TTL 대신 이 값을 사용합니다.

### 사용 예

#### 읽기 빈도가 높고 수정이 드문 엔티티

```json
{
    "name": "country",
    "cache": {
        "enabled": true,
        "ttl_seconds": 3600
    }
}
```

#### 수정이 빈번한 엔티티 (캐시 비활성화)

```json
{
    "name": "session",
    "cache": {
        "enabled": false
    }
}
```

#### 전역 캐시 설정 사용 (기본 동작)

```json
{
    "name": "user"
    // cache 블록 생략 → 전역 설정 따름
}
```

### 우선순위

1. 엔티티별 `cache.enabled` (명시된 경우)
2. 전역 `cache.json`의 `defaults.enabled`

TTL도 동일하게 엔티티별 → 전역 순서로 우선 적용됩니다.

## fk

- `fk`는 `index`의 `*_seq` 필드가 참조하는 엔티티를 명시할 때 사용합니다.
- 참조 컬럼은 기본적으로 `seq`를 사용합니다.
- `fk`를 명시하지 않아도, `index`에 `*_seq` 패턴 필드가 있으면 필드명 기준으로 자동 추론합니다.
    - 예: `user_seq` -> `user.seq`, `employee_seq` -> `employee.seq`
- 자동 추론은 동일 이름의 엔티티가 실제로 존재할 때만 적용됩니다.
- `fk`를 명시하면 자동 추론보다 우선 적용됩니다.
- 따라서 아래 표기들을 동일하게 처리합니다.
    - 축약형만 사용: `"event_seq": "calendar_events.seq"`

### FK 정책 기본값

| 항목       | 기본값     |
| ---------- | ---------- |
| `onDelete` | `RESTRICT` |
| `onUpdate` | `CASCADE`  |

- 엔티티 설정에서는 `fk`를 축약형 문자열만 사용합니다.
- 따라서 `onDelete`, `onUpdate`는 엔티티 설정에 작성하지 않습니다.

## 필수 엔티티

서버가 내부적으로 사용하는 시스템 엔티티(인증, 푸시, 스토리지 등)는 기능 활성화 여부에 따라 자동 생성됩니다.

- 11개 시스템 엔티티의 상세 스펙, 생성 조건, 암호화 키 규칙 → **[시스템 엔티티 가이드](system-entities.md)**
- `normalize-entities --apply` 또는 `reset-all --apply` 실행 시 누락된 필수 엔티티가 자동 생성됩니다.
- 서버 시작 시에는 자동 생성하지 않고, 활성 기능에 필요한 엔티티가 있는지 검증만 수행합니다.

## 초기 설정 확인

엔티티 JSON 파일 작성이 끝나면 반드시 `reset-all`을 실행해 모든 테이블이 DB에 정상 생성되는지 확인합니다.

```bash
cd scripts
./reset-all.sh --apply
```

- 필수 엔티티가 없으면 자동 생성 후 테이블을 만듭니다.
- 각 엔티티의 data/index/history 테이블이 생성되고, `reset_defaults` 시드 데이터가 삽입됩니다.
- 출력에 `✅` 또는 성공 메시지가 표시되면 정상입니다.
- 오류가 있으면 해당 엔티티 JSON 파일의 타입·FK·유니크 설정을 먼저 확인합니다.

> 이미 운영 중인 서버에서 기존 데이터를 유지한 채 스키마만 변경하려면 `--apply` 대신 서버를 재시작하면 됩니다. `--force`는 시드 데이터를 강제 재삽입하므로 초기화 용도로만 사용합니다.
