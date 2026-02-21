# Example Entities

이 폴더는 배포용 예제 엔티티 스키마입니다.

## 예제 엔티티 목록

| 파일                                                                       | 설명           | 주요 특징                                                                 |
| -------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------- |
| [todo.json](#1-todojson)                                                   | 할 일 목록     | 기본 인덱스, 해시 필드                                                    |
| [product.json](#2-productjson)                                             | 제품 관리      | 유니크 제약, reset_defaults 시딩                                          |
| [examples/Auth/account.json](#3-examplesauthaccountjson)                   | 사용자 관리    | rbac_role, 인증 훅 / **JWT 사용 시 필수**                                 |
| [examples/Auth/rbac_roles.json](#4-examplesauthrbac_rolesjson)             | RBAC 역할 정의 | permissions 포함 5개 역할, reset-all 시 자동 시딩 / **RBAC 사용 시 필수** |
| [examples/Auth/api_keys.json](#5-examplesauthauthapi_keysjson)             | API 키 관리    | HMAC 인증 키, 역할 연결, user_seq 연결 / **HMAC 사용 시 필수**            |
| [license.json](#6-licensejson)                                             | 라이선스 관리  | 계약/만료일, 유니크 제약, 자동 시딩                                       |
| [company.json](#7-companyjson)                                             | 회사 정보      | license_scope, 사업자번호 해시, 캐시                                      |
| [examples/Account/account_audit.json](#8-examplesaccountaccount_auditjson) | 감사 로그      | INSERT 전용, 훅으로 자동 기록                                             |

## 문서 바로가기

| 섹션                                                         | 내용                                      |
| ------------------------------------------------------------ | ----------------------------------------- |
| [포함된 예제](#포함된-예제)                                  | 각 예제 파일 상세 설명                    |
| [엔티티 설정 규칙](#엔티티-설정-규칙)                        | 자동 추론 필드, Types, index 형식, 복합키 |
| [훅 (Hooks)](#훅-hooks)                                      | SQL 훅, Entity 훅, 실행 시점, 템플릿 변수 |
| [라이선스 스코프](#라이선스-스코프란)                        | 멀티테넌트 / 단일 시스템 모드             |
| [Entity Config Guide](../../docs/ops/entity-config-guide.md) | 전체 엔티티 설정 레퍼런스                 |

---

## 포함된 예제

### 1. todo.json

간단한 할 일 목록 엔티티

**특징**:

- 기본 인덱스 필드 (`title`, `status`, `created_time`)
- 해시 필드 (`user_id`) - 암호화되어 저장

### 2. product.json

제품 관리 엔티티

**특징**:

- 유니크 제약 (`name`) - 제품명 중복 방지
- `reset_defaults` - 초기 데이터 시딩
- `stock` 필드는 자동 추론 (int)

### 3. examples/Auth/account.json

사용자 관리 엔티티 (`entities/examples/Auth/` 에 위치 → 배포 시 `dist/entities/Auth/account.json`)

> **⚠️ JWT 인증을 사용하려면 필수입니다.**  
> HMAC 인증만 사용하는 경우에는 필요하지 않습니다.  
> `jwt.json`에 `secret`이 설정된 경우 서버 기동 시 `entities/Auth/account.json`이 존재하지 않으면 오류가 발생합니다.  
> `email`, `rbac_role` 필드가 index에 포함되어 있어야 합니다.  
> `./scripts/reset-all.sh --apply` 실행 시 파일이 없으면 자동으로 생성됩니다.

**특징**:

- `rbac_role` 필드 - JWT 토큰에 포함되는 RBAC 역할 (인증/인가에 사용)
- 해시 필드 (`password_hash`) - 비밀번호 암호화
- 유니크 제약 (`email`) - 이메일 중복 방지
- **훅 예제**:
    - `after_insert`: 감사 로그 기록 (SQL 훅)

### 4. examples/Auth/rbac_roles.json

RBAC 역할 정의 엔티티 (`entities/examples/Auth/` 에 위치 → 배포 시 `dist/entities/Auth/rbac_roles.json`)

> **⚠️ RBAC 인증을 사용하려면 필수입니다.**  
> `reset-all` 실행 시 `reset_defaults`의 5개 역할이 자동 시딩됩니다.  
> `/v1/admin/roles` API 및 `scripts/rbac-roles.sh` 로 역할 조회/추가/삭제가 가능합니다.  
> `security.json`의 `roles`는 더 이상 사용하지 않습니다 (`{}`로 비워져 있음).

**특징**:

- `name` 유니크 제약 - 역할명 중복 방지
- `reset_defaults` - 기본 역할 5개 (`admin`, `editor`, `viewer`, `auditor`, `user`) 자동 시딩
- `hard_delete: true` - 논리 삭제 없이 실제 삭제
- `account.rbac_role` 필드와 구성이 일치해야 함

### 5. examples/Auth/api_keys.json

API 키 관리 엔티티 (`entities/examples/Auth/` 에 위치 → 배포 시 `dist/entities/Auth/api_keys.json`)

> **⚠️ HMAC 인증을 사용하려면 필수입니다.**  
> `reset-all` 실행 시 admin 역할의 API 키 1개가 자동 생성되며 `key_value`와 `hmac_secret`이 출력됩니다.  
> `/v1/admin/api-keys` API 및 `scripts/api-keys.sh` 로 키 조회/추가/삭제/재생성이 가능합니다.  
> JWT 전용으로 운영하는 경우에는 이 엔티티 없이도 동작합니다.

**특징**:

- `key_value` 해시 저장 - 원본 키는 생성 시 1회만 노출
- `hmac_secret` - HMAC 서명 검증용 시크릿 (재생성 가능)
- `role` 필드 - `rbac_roles` 엔티티의 역할명 참조
- `user_seq` 필드 (nullable) - 특정 사용자에게 키를 귀속시킬 수 있음 (확장성)
- `entities` 필드 - 접근 가능한 엔티티 목록 (기본값 `["*"]`)
- `hard_delete: true` - 완전 삭제

**CLI 사용 예**:

```bash
API_KEY=<admin-key> ./scripts/api-keys.sh list
API_KEY=<admin-key> ./scripts/api-keys.sh create --role=viewer --description="대시보드 읽기 전용"
API_KEY=<admin-key> ./scripts/api-keys.sh create --role=editor --user-seq=5
API_KEY=<admin-key> ./scripts/api-keys.sh regenerate 3
API_KEY=<admin-key> ./scripts/api-keys.sh delete 3
```

### 6. license.json

라이선스 관리 엔티티

**특징**:

- 계약일/만료일 관리
- 유니크 제약으로 라이선스명 중복 방지
- `reset_defaults`로 Trial 라이선스 자동 생성

### 7. company.json

회사 정보 엔티티 (라이선스 스코프)

**특징**:

- **`license_scope: true`** - 라이선스별 데이터 분리
- 해시 필드 (`tax_id`) - 사업자번호 암호화
- 캐시 활성화 (TTL 300초)

### 8. examples/Account/account_audit.json

사용자 감사 로그 엔티티

**특징**:

- **`license_scope: false`** - 전체 시스템 감사 로그 통합 관리
- 훅을 통해 자동 기록 (`account.json`의 `after_insert` 훅)
- 읽기 전용 로그 (INSERT만 허용)
- action 타입: `INSERT`, `UPDATE`, `DELETE`, `LOGIN`, `LOGOUT`

## 엔티티 설정 규칙

### 자동 추론되는 필드

필드명 패턴에 따라 타입이 자동으로 추론됩니다:

**식별자**:

- `_seq`, `_id` → BIGINT UNSIGNED

**날짜/시간**:

- `_date` → DATE
- `_time`, `_at` → DATETIME

**불리언**:

- `is_*`, `has_*`, `can_*` → TINYINT(1)

**숫자**:

- `_count`, `_cnt`, `_qty`, `_quantity` → INT
- `_amount`, `_price`, `_total`, `_cost` → DECIMAL(15,2)

**문자열**:

- `name`, `*_name` → VARCHAR(100)
- `*email*` → VARCHAR(255)
- `*phone*`, `*tel*` → VARCHAR(50)

### Types 정의

필드명 패턴으로 자동 추론이 안되는 경우에만 types를 명시적으로 정의합니다.

#### 사용 가능한 타입

| 타입                              | 사용 예시                      | MySQL 매핑        | 설명                       |
| --------------------------------- | ------------------------------ | ----------------- | -------------------------- |
| **enum**                          | `["active", "expired"]`        | `ENUM(...)`       | 허용 값 목록 (배열로 정의) |
| `"int"` / `"number"` / `"bigint"` | `"count": "int"`               | `BIGINT`          | 정수 (음수 가능)           |
| `"uint"`                          | `"max_users": "uint"`          | `BIGINT UNSIGNED` | 양의 정수                  |
| `"string"`                        | `"code": "string"`             | `VARCHAR(255)`    | 일반 문자열                |
| `"text"`                          | `"description": "text"`        | `TEXT`            | 긴 텍스트                  |
| `"boolean"` / `"bool"`            | `"enabled": "bool"`            | `TINYINT(1)`      | 참/거짓                    |
| `"date"`                          | `"birth_date": "date"`         | `DATE`            | 날짜 (시간 제외)           |
| `"datetime"` / `"timestamp"`      | `"scheduled_time": "datetime"` | `DATETIME`        | 날짜+시간                  |
| `"decimal"`                       | `"tax_rate": "decimal"`        | `DECIMAL(15,2)`   | 소수점 숫자                |
| `"email"`                         | `"contact": "email"`           | `VARCHAR(255)`    | 이메일 (검증 포함)         |
| `"phone"`                         | `"mobile": "phone"`            | `VARCHAR(50)`     | 전화번호 (검증 포함)       |

**참고**: 자동 추론 가능한 필드는 types 정의를 생략하세요 (위 "자동 추론되는 필드" 섹션 참고)

### Comments

- **인덱스 필드만** 코멘트 작성
- 해시 필드나 자동 추론 필드는 불필요
- enum 값 설명은 types에 정의하고 comments는 간결하게

### index 확장 형식 (하위 호환)

- `index`는 문자열 배열(간단 모드) 또는 객체맵(확장 모드)을 지원
- 객체맵 키는 필드명이며 값에 `comment`, `type`, `required`, `unique`, `hash`를 선언
- 권장 키 순서: `comment` → `type` → `required` → `unique` → `hash`
- `type`은 대소문자 구분 없이 동작하며 소문자 통일 권장 (예: `bigint`, `varchar(32)`)

```json
{
    "index": {
        "user_seq": {
            "comment": "사용자 seq",
            "type": "bigint",
            "required": true
        },
        "action": {
            "comment": "작업 유형",
            "type": "varchar(32)",
            "required": true,
            "unique": true,
            "hash": true
        }
    }
}
```

### 복합키(복합 유니크) 설정

- `index.<field>.unique=true`는 단일 유니크만 설정합니다.
- 두 개 이상 필드의 복합키는 `unique`에 배열로 선언합니다.

```json
{
    "index": {
        "user_seq": {
            "comment": "사용자seq",
            "required": true
        },
        "device_id": {
            "comment": "기기ID",
            "required": true
        }
    },
    "unique": [["user_seq", "device_id"]]
}
```

## 훅 (Hooks)

훅은 엔티티 이벤트 발생 시 자동으로 실행되는 기능입니다.

### 사용 가능한 훅 타이프

**SQL 훅** - 직접 SQL 실행:

```json
{
    "type": "sql",
    "query": "INSERT INTO account_audit (account_seq, action, created_time) VALUES (?, ?, NOW())",
    "params": ["${new.seq}", "INSERT"],
    "async": false
}
```

**Entity 훅** - 다른 엔티티 조작:

```json
{
    "type": "entity",
    "entity": "todo",
    "action": "list",
    "conditions": {
        "user_id": "${new.seq}"
    },
    "assign_to": "todos"
}
```

### 훅 실행 시점

| 이벤트         | 설명                | 사용 예시                       |
| -------------- | ------------------- | ------------------------------- |
| `after_insert` | 데이터 삽입 후 실행 | 감사 로그, 알림 발송            |
| `after_update` | 데이터 수정 후 실행 | 변경 이력 기록, 캐시 무효화     |
| `after_delete` | 데이터 삭제 후 실행 | 관련 데이터 정리, 파일 삭제     |
| `after_get`    | 데이터 조회 후 실행 | 관련 데이터 병합 (join 과 유사) |
| `after_list`   | 목록 조회 후 실행   | 각 항목에 추가 정보 부착        |

### 테플릿 변수

훅에서 사용 가능한 변수:

- `${new.field}` - 새로 삽입/수정된 데이터의 필드
- `${old.field}` - 수정 이전 데이터의 필드
- `${ctx.license_seq}` - 현재 라이선스 seq
- `${ctx.user_seq}` - 현재 사용자 seq

**참고**: 자세한 내용은 [Hooks Guide](../../docs/hooks.md)를 참고하세요.

## 라이선스 스코프란?

### 전역 설정 (권장)

**server.json**에서 전체 시스템의 기본 동작을 설정할 수 있습니다:

**멀티테넌트 SaaS 모드** (기본값):

```json
{
    "global_license_scope": true
}
```

- 라이선스별 데이터 완전 분리
- `license` 엔티티 필수
- 각 라이선스의 `secret_key`로 암호화

**단일 시스템 모드**:

```json
{
    "global_license_scope": false
}
```

- `license` 엔티티 불필요
- 모든 사용자가 동일한 데이터 공유
- `.env`의 `ENCRYPTION_KEY`로 암호화
- 소규모 팀, 내부 시스템에 적합

**개별 엔티티**에서 이 설정을 덮어쓸 수 있습니다:

```json
{
    "name": "shared_config",
    "license_scope": false,
    "index": ["key", "value"]
}
```

### 멀티테넌트 모드 (license_scope: true)

라이선스별로 데이터가 **완전히 분리**됩니다:

- A 라이선스 사용자는 B 라이선스의 데이터를 볼 수 없습니다
- 멀티테넌트 SaaS 구조에 적합합니다
- **암호화 키**: 각 라이선스의 `secret_key` 사용
- `license` 엔티티 필수

**예시**: `license.json` + `company.json` 조합

- `license`: 라이선스별 계약/만료 관리
- `company`: 각 라이선스가 관리하는 회사 목록 (분리 저장)

### 단일 시스템 모드 (license_scope: false)

라이선스 구분 없이 단일 시스템으로 동작합니다:

- `license` 엔티티 불필요
- 모든 사용자가 동일한 데이터 공유
- **암호화 키**: `.env`의 `ENCRYPTION_KEY` 사용
- 소규모 팀, 내부 시스템에 적합

**설정 우선순위**:

1. 엔티티 개별 설정 (`license_scope`)
2. server.json 전역 설정 (`global_license_scope`)
3. 기본값 (`true`)

예제 파일을 복사하여 수정 후 사용하세요:

```bash
# 서버 실행 시 자동으로 인덱스 테이블 생성됩니다
./scripts/run.sh dev
```

## 더 많은 예제

전체 문서는 [Entity Config Guide](../../docs/entity-config-guide.md)를 참고하세요.
