# 백업 및 복원 가이드

Entity Server는 데이터, 파일, 스키마를 통합 관리하는 내장 백업 시스템을 제공합니다.

## 개요

`backup.json` 하나로 **DB 데이터 + 파일 + 엔티티 스키마**를 일괄 백업합니다. 외부 도구(mysqldump, rsync 등)가 필요 없으며, 이미 구현된 Storage Backend(Local/S3/Azure/GCS/SFTP/Swift)를 백업 대상으로 재사용합니다.

```
┌────────────────────────────────────────────────────────┐
│  backup.json                                           │
│                                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ 데이터   │  │ 파일     │  │ 스키마   │             │
│  │ (JSONL)  │  │ (실시간) │  │ (JSON)   │             │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘             │
│       └──────────────┼─────────────┘                   │
│                      ▼                                 │
│            storage.json의 Backend                      │
│         (Local / S3 / Azure / GCS / SFTP)              │
└────────────────────────────────────────────────────────┘
```

### 왜 내장 백업인가?

| 항목               | 외부 백업 (mysqldump 등)         | 엔티티 서버 내장 백업                   |
| ------------------ | -------------------------------- | --------------------------------------- |
| 설정               | 외부 도구 + cron + 스크립트 별도 | `backup.json` 하나                      |
| DB 드라이버 호환   | 드라이버별 도구 필요             | SQL + NoSQL 모두 동일 인터페이스        |
| 암호화 데이터      | 평문 노출 (SELECT 결과)          | 암호화 상태 그대로 백업                 |
| 선택적 백업        | 테이블 단위 매핑 필요            | 엔티티 단위 include/exclude             |
| 크로스 DB 복원     | 같은 DB 엔진만 가능              | MySQL → PostgreSQL 등 이종 DB 복원 가능 |
| 파일 + 데이터 통합 | 별도 관리 필요                   | 단일 설정으로 통합                      |
| 멀티 인스턴스      | 분산 락 별도 구현                | CAS 기반 자동 중복 방지                 |

---

## 설정

### 1. backup.json 생성

`configs/backup.json`:

```json
{
    "enabled": true,

    "data": {
        "enabled": true,
        "schedule": "0 2 * * *",
        "db_groups": ["default"],
        "entities": {
            "include": [],
            "exclude": ["system_audit_log", "push_log"]
        },
        "include_history": false,
        "format": "jsonl",
        "compress": true,
        "encrypt_passphrase": "${BACKUP_ENCRYPT_KEY}",
        "batch_size": 500,
        "max_concurrent_entities": 3,
        "retention": {
            "keep_count": 7,
            "keep_days": 30
        }
    },

    "files": {
        "enabled": true,
        "mode": "realtime",
        "max_retries": 3,
        "retry_interval_sec": 60
    },

    "schema": {
        "enabled": true
    },

    "target": {
        "storage_key": "s3-backup",
        "prefix": "backups"
    },

    "notification": {
        "on_success": false,
        "on_failure": true,
        "channels": ["log"]
    }
}
```

> `configs/backup.json`이 없거나 `enabled: false`이면 백업 기능이 비활성화됩니다.

### 2. 설정 필드 상세

#### 최상위

| 필드      | 타입 | 기본값  | 설명             |
| --------- | ---- | ------- | ---------------- |
| `enabled` | bool | `false` | 전체 백업 활성화 |

#### data (데이터 백업)

| 필드                      | 타입     | 기본값        | 설명                                              |
| ------------------------- | -------- | ------------- | ------------------------------------------------- |
| `enabled`                 | bool     | `true`        | 데이터 백업 활성화                                |
| `schedule`                | string   | `"0 2 * * *"` | cron 식 (기본: 매일 02:00)                        |
| `db_groups`               | string[] | `["default"]` | 백업 대상 DB 그룹 (`database.json` 키)            |
| `entities.include`        | string[] | `[]` (=전체)  | 포함할 엔티티 (빈 배열 = 전체)                    |
| `entities.exclude`        | string[] | `[]`          | 제외할 엔티티                                     |
| `include_history`         | bool     | `false`       | 히스토리 데이터 포함 여부                         |
| `format`                  | string   | `"jsonl"`     | 출력 형식 (`jsonl`)                               |
| `compress`                | bool     | `true`        | gzip 압축                                         |
| `encrypt_passphrase`      | string   | `""`          | 백업 파일 AES-256-GCM 암호화 (빈 문자열 = 비활성) |
| `batch_size`              | int      | `500`         | 레코드 조회 배치 크기                             |
| `max_concurrent_entities` | int      | `3`           | 동시 백업 엔티티 수                               |
| `retention.keep_count`    | int      | `7`           | 보존할 백업 세대 수                               |
| `retention.keep_days`     | int      | `30`          | 최대 보존 일수                                    |

#### files (파일 백업)

| 필드                 | 타입   | 기본값       | 설명                                       |
| -------------------- | ------ | ------------ | ------------------------------------------ |
| `enabled`            | bool   | `true`       | 파일 백업 활성화                           |
| `mode`               | string | `"realtime"` | `realtime`: 업로드 즉시 백업 대상으로 복제 |
| `max_retries`        | int    | `3`          | 최대 재시도                                |
| `retry_interval_sec` | int    | `60`         | 재시도 간격 (초)                           |

> **파일 백업은 `backup.json`에서만 관리합니다.** 이전 `storage.json`의 `backup` 섹션은 사용하지 않습니다.

#### schema (스키마 백업)

| 필드      | 타입 | 기본값 | 설명                                       |
| --------- | ---- | ------ | ------------------------------------------ |
| `enabled` | bool | `true` | `entities/` 디렉터리의 JSON 정의 파일 백업 |

> 스키마 백업이 활성화되면 백업 세션마다 엔티티 JSON 정의 파일을 함께 저장하여 복원 시 스키마까지 복구할 수 있습니다.

#### target (백업 저장 대상)

| 필드          | 타입   | 기본값      | 설명                         |
| ------------- | ------ | ----------- | ---------------------------- |
| `storage_key` | string | —           | `storage.json`의 storages 키 |
| `prefix`      | string | `"backups"` | 백업 파일 저장 경로 접두어   |

> `storage.json`에 이미 구현된 Backend를 참조하므로 별도 클라우드 설정이 필요 없습니다.

#### notification (알림)

| 필드         | 타입     | 기본값    | 설명                     |
| ------------ | -------- | --------- | ------------------------ |
| `on_success` | bool     | `false`   | 백업 성공 시 알림        |
| `on_failure` | bool     | `true`    | 백업 실패 시 알림        |
| `channels`   | string[] | `["log"]` | `log`, `smtp`, `webhook` |

### 3. 환경 변수

민감 정보는 `${ENV_VAR}` 형식으로 환경 변수를 참조할 수 있습니다:

```dotenv
BACKUP_ENCRYPT_KEY=my-secret-passphrase-256bit
```

---

## 백업 대상 설정 예시

`target.storage_key`는 `storage.json`의 storages를 참조합니다. 이미 구현된 6종의 Backend를 모두 사용할 수 있습니다.

### 로컬 → 로컬 백업

```json
// storage.json
{
    "storages": {
        "local-main": { "driver": "local", "root": "./uploads" },
        "local-backup": { "driver": "local", "root": "/mnt/backup/files" }
    }
}

// backup.json
{
    "target": { "storage_key": "local-backup", "prefix": "data-backups" }
}
```

백업 결과:

- 파일 복제: `./uploads/...` → `/mnt/backup/files/...`
- 데이터 백업: `/mnt/backup/files/data-backups/2026-02-28T020000Z/...`

### 로컬 → S3 백업

```json
// storage.json
{
    "storages": {
        "local-main": { "driver": "local", "root": "./uploads" },
        "s3-backup": {
            "driver": "s3",
            "bucket": "my-backups",
            "region": "ap-northeast-2",
            "access_key": "${AWS_ACCESS_KEY}",
            "secret_key": "${AWS_SECRET_KEY}"
        }
    }
}

// backup.json
{
    "target": { "storage_key": "s3-backup", "prefix": "entity-server/backups" }
}
```

백업 결과:

- 데이터: `s3://my-backups/entity-server/backups/2026-02-28T020000Z/...`
- 파일: `s3://my-backups/...` (원본 경로 구조 유지)

### 로컬 → Azure Blob 백업

```json
// storage.json
{
    "storages": {
        "azure-backup": {
            "driver": "azure",
            "container": "backups",
            "account_name": "${AZURE_ACCOUNT}",
            "account_key": "${AZURE_KEY}"
        }
    }
}

// backup.json
{
    "target": { "storage_key": "azure-backup", "prefix": "entity-server" }
}
```

---

## 백업 파일 구조

각 백업 세션은 UTC 시작 시각으로 디렉터리가 생성됩니다:

```
{target.prefix}/
├── 2026-02-28T020000Z/                    ← 백업 세션 (최신)
│   ├── manifest.json                      ← 백업 메타데이터
│   ├── schema/                            ← 엔티티 JSON 정의
│   │   ├── Employee.json
│   │   ├── Department.json
│   │   └── System/
│   │       └── Backup/
│   │           └── backup_log.json
│   ├── default/                           ← DB 그룹명
│   │   ├── Employee.jsonl.gz              ← 엔티티별 백업 파일
│   │   ├── Department.jsonl.gz
│   │   └── file_meta.jsonl.gz
│   └── analytics/                         ← 추가 DB 그룹 (있는 경우)
│       └── EventLog.jsonl.gz
└── 2026-02-27T020000Z/                    ← 이전 세션
    └── ...
```

### manifest.json

각 백업 세션에는 메타데이터 파일이 포함됩니다:

```json
{
    "version": "1.0",
    "server_version": "7.2.0",
    "started_at": "2026-02-28T02:00:00Z",
    "completed_at": "2026-02-28T02:03:45Z",
    "status": "completed",
    "db_groups": {
        "default": {
            "driver": "mysql",
            "entities": [
                {
                    "name": "Employee",
                    "record_count": 1523,
                    "size_bytes": 2458624,
                    "checksum": "sha256:abc123..."
                }
            ],
            "total_records": 1568,
            "total_size_bytes": 2471424
        }
    },
    "schema": {
        "backed_up": true,
        "entity_count": 12
    },
    "settings": {
        "format": "jsonl",
        "compressed": true,
        "encrypted": false,
        "include_history": false
    }
}
```

### JSONL 레코드 형식

```jsonl
{"_entity":"Employee","_seq":1,"_version":3,"_created":"2026-01-15T09:00:00Z","_updated":"2026-02-20T14:30:00Z","name":"홍길동","email":"hong@...","data":"encrypted_base64..."}
{"_entity":"Employee","_seq":2,"_version":1,...}
```

- `_entity`, `_seq`, `_version`, `_created`, `_updated`: 시스템 메타데이터
- 인덱스 필드: 평문으로 저장
- `data`: 암호화 활성 엔티티는 **암호화 상태 그대로** 백업
- 소프트 삭제 레코드: `_deleted: true` 포함

---

## 데이터 백업

### 자동 스케줄 백업

`schedule` 필드에 cron 식을 설정하면 자동으로 실행됩니다:

```json
{
    "data": {
        "schedule": "0 2 * * *"
    }
}
```

| cron 식        | 설명        |
| -------------- | ----------- |
| `0 2 * * *`    | 매일 02:00  |
| `0 */12 * * *` | 12시간마다  |
| `0 3 * * 0`    | 매주 일요일 |
| `0 2 1 * *`    | 매월 1일    |

### 엔티티 필터

특정 엔티티만 백업하거나 제외할 수 있습니다:

```json
// 특정 엔티티만 백업
{
    "data": {
        "entities": {
            "include": ["Employee", "Department", "Order"]
        }
    }
}
```

```json
// 대용량 로그 엔티티 제외
{
    "data": {
        "entities": {
            "exclude": ["system_audit_log", "push_log", "smtp_log"]
        }
    }
}
```

> `include`가 빈 배열이면 **전체 엔티티**가 백업 대상입니다.

### 수동 백업 (Admin API)

```bash
# 즉시 백업 실행
curl -X POST http://localhost:47200/v1/admin/backup/run \
  -H "Content-Type: application/json"

# 응답
{
    "ok": true,
    "session_id": "2026-02-28T143000Z",
    "status": "running"
}
```

### 백업 상태 확인

```bash
# 현재 진행 중인 백업 상태
curl -X POST http://localhost:47200/v1/admin/backup/status

# 백업 세션 목록
curl -X POST http://localhost:47200/v1/admin/backup/list
```

### 정합성 보장

| DB 드라이버       | 정합성 보장 방법                          |
| ----------------- | ----------------------------------------- |
| **MySQL/MariaDB** | `CONSISTENT SNAPSHOT` 트랜잭션 (InnoDB)   |
| **PostgreSQL**    | `REPEATABLE READ` 트랜잭션                |
| **SQLite**        | `DEFERRED` 트랜잭션 (단일 커넥션)         |
| **MongoDB**       | Snapshot 읽기 트랜잭션 (Replica Set 필요) |
| **DynamoDB**      | 결과적 일관성 (manifest에 표시)           |

SQL 드라이버는 트랜잭션 기반 스냅샷으로 백업 중 데이터 변경에 영향받지 않습니다.

---

## 파일 백업

파일 백업은 **실시간**(`realtime`) 모드로 동작합니다. 파일이 업로드되면 즉시 백업 대상 스토리지로 복제됩니다.

```json
{
    "files": {
        "enabled": true,
        "mode": "realtime",
        "max_retries": 3,
        "retry_interval_sec": 60
    }
}
```

### 파일 백업 상태 추적

`file_meta` 엔티티의 `backup_status` 필드로 개별 파일의 백업 상태를 추적합니다:

| backup_status | 설명                    |
| ------------- | ----------------------- |
| `pending`     | 업로드 직후, 백업 대기  |
| `synced`      | 백업 대상으로 복제 완료 |
| `failed`      | 복제 실패 (재시도 예정) |
| `skipped`     | 백업 미활성 시          |

```bash
# 백업 실패한 파일 조회
curl http://localhost:47200/v1/entity/file_meta/list?backup_status=failed
```

---

## 스키마 백업

`schema.enabled: true`이면 매 백업 세션마다 `entities/` 디렉터리의 JSON 정의 파일을 함께 저장합니다.

- 복원 시 엔티티 스키마까지 함께 복구 가능
- `examples/` 하위 디렉터리는 제외
- 데이터 백업 없이 스키마만 백업할 수도 있음

---

## 보존 정책 (Retention)

오래된 백업 세션은 자동으로 정리됩니다:

```json
{
    "data": {
        "retention": {
            "keep_count": 7,
            "keep_days": 30
        }
    }
}
```

- `keep_count`: 최근 N개 세션을 보존 (기본: 7)
- `keep_days`: N일 이내 세션을 보존 (기본: 30일)
- 두 조건 중 하나라도 충족하면 보존, 모두 초과하면 삭제
- 세션 삭제 시 해당 세션의 JSONL, manifest, schema 모두 삭제

```bash
# 특정 세션 수동 삭제
curl -X POST http://localhost:47200/v1/admin/backup/delete \
  -H "Content-Type: application/json" \
  -d '{"session_id": "2026-02-20T020000Z"}'
```

---

## 복원 (Restore)

### Admin API 복원 (서버 실행 중)

```bash
curl -X POST http://localhost:47200/v1/admin/backup/restore \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "2026-02-28T020000Z",
    "db_group": "default",
    "entities": ["Employee", "Department"],
    "mode": "merge",
    "dry_run": false
  }'
```

| 필드         | 설명                                |
| ------------ | ----------------------------------- |
| `session_id` | 복원할 백업 세션 ID                 |
| `db_group`   | 대상 DB 그룹                        |
| `entities`   | 복원할 엔티티 (빈 배열 = 전체)      |
| `mode`       | `merge` / `overwrite` / `clean`     |
| `dry_run`    | `true`면 실제 삽입 없이 건수만 반환 |

### 복원 모드

| 모드        | 동작                                      | 사용 시나리오             |
| ----------- | ----------------------------------------- | ------------------------- |
| `merge`     | 이미 존재하는 레코드는 스킵               | 누락된 데이터만 보충      |
| `overwrite` | 존재하면 덮어쓰기, 없으면 새로 삽입       | 특정 시점으로 데이터 갱신 |
| `clean`     | 기존 데이터 전체 삭제 후 백업 데이터 복원 | 완전한 시점 복원          |

> **주의**: `clean` 모드는 기존 데이터를 삭제합니다. `dry_run: true`로 먼저 확인하세요.

### CLI 복원 (서버 중단 상태)

서버가 중단된 상태에서 CLI로 직접 복원:

```bash
# 백업 세션 목록 조회
entity-cli backup-list --config ./configs

# 특정 세션 정보 확인
entity-cli backup-info --config ./configs --session 2026-02-28T020000Z

# dry-run (건수 확인)
entity-cli restore --config ./configs --session 2026-02-28T020000Z --dry-run

# 전체 복원 (clean 모드)
entity-cli restore --config ./configs --session 2026-02-28T020000Z --mode clean

# 특정 엔티티만 복원
entity-cli restore --config ./configs --session 2026-02-28T020000Z \
    --entities Employee,Department --mode merge

# 스키마만 복원 (엔티티 JSON 정의 파일)
entity-cli restore-schema --config ./configs --session 2026-02-28T020000Z
```

### 크로스 DB 복원

JSONL 형식이므로 다른 DB 엔진으로 복원할 수 있습니다:

```
MySQL (원본) → JSONL 백업 → PostgreSQL (복원 대상)
```

- 암호화 데이터는 `EncryptionKey`가 동일하면 그대로 복원됨
- 인덱스 필드 매핑은 엔티티 스키마(`EnsureSchema`)로 자동 처리

---

## 멀티 인스턴스 운영

로드밸런서 뒤에 복수 인스턴스를 배포할 경우, 동일한 `backup.json`으로 중복 백업이 발생하지 않도록 **CAS 기반 세션 락**을 사용합니다.

### 동작 방식

```
인스턴스 A                           인스턴스 B
│                                    │
├─ cron 트리거 (02:00)               ├─ cron 트리거 (02:00)
├─ backup_log INSERT 시도            ├─ backup_log INSERT 시도
│  session_id="...T020000Z"          │  session_id="...T020000Z"
│                                    │
├─ ✅ INSERT 성공 → 백업 실행        ├─ ❌ UNIQUE 위반 → 스킵
└─ 완료                              └─ 로그: "already locked by A"
```

- `backup_log` 엔티티의 `session_id`에 UNIQUE 인덱스가 적용됩니다
- 먼저 INSERT에 성공한 인스턴스가 백업을 실행합니다
- 실패한 인스턴스는 자동으로 스킵합니다
- `running` 상태가 30분 이상 지속되면 실패로 간주하여 다음 스케줄에서 재시도합니다

### 배포 패턴

| 패턴                        | 설명                                       | 권장 상황                       |
| --------------------------- | ------------------------------------------ | ------------------------------- |
| 단일 백업 인스턴스          | 특정 인스턴스만 `backup.json` 활성화       | 소규모, 백업 전담 인스턴스 분리 |
| 전 인스턴스 활성화 + CAS 락 | 모든 인스턴스에 동일 설정, CAS로 자동 조율 | 고가용성, 장애 시 자동 인계     |

---

## 성능 가이드라인

| 데이터 규모   | 예상 소요 시간  | 권장 설정                                   |
| ------------- | --------------- | ------------------------------------------- |
| < 10만 레코드 | 수 초 ~ 수십 초 | 기본값 (`batch=500`, `concurrent=3`)        |
| 10만 ~ 100만  | 수 분           | `batch=1000`, `concurrent=5`                |
| 100만+        | 수십 분         | `batch=2000`, `concurrent=1`, 저부하 시간대 |

### 운영 권장 사항

1. **스케줄 시간대**: 서비스 부하가 낮은 새벽 시간대 권장 (기본: 02:00)
2. **대용량 엔티티 제외**: 로그성 엔티티(`push_log`, `smtp_log`, `system_audit_log`)는 `exclude`에 추가
3. **압축 활성화**: `compress: true` 설정으로 저장 공간 절약 (일반적으로 60~80% 압축률)
4. **암호화**: 클라우드 백업 시 `encrypt_passphrase` 설정 권장
5. **알림**: `on_failure: true`로 실패 시 즉시 인지

---

## Admin API 요약

| 엔드포인트                      | 설명           |
| ------------------------------- | -------------- |
| `POST /v1/admin/backup/run`     | 즉시 백업 실행 |
| `POST /v1/admin/backup/status`  | 현재 진행 상태 |
| `POST /v1/admin/backup/list`    | 백업 세션 목록 |
| `POST /v1/admin/backup/restore` | 복원 실행      |
| `POST /v1/admin/backup/delete`  | 백업 세션 삭제 |

RBAC 권한: `admin:backup`

---

## 시스템 엔티티

| 엔티티       | 위치                      | 역할                |
| ------------ | ------------------------- | ------------------- |
| `backup_log` | `entities/System/Backup/` | 백업 작업 이력 기록 |

### backup_log 주요 필드

| 필드            | 타입     | 설명                                   |
| --------------- | -------- | -------------------------------------- |
| `status`        | enum     | running / completed / partial / failed |
| `backup_type`   | enum     | data / file / full                     |
| `session_id`    | string   | 백업 세션 ID (타임스탬프)              |
| `started_time`  | datetime | 시작 시각                              |
| `finished_time` | datetime | 완료 시각                              |
| `entity_count`  | int      | 백업된 엔티티 수                       |
| `total_records` | int      | 총 레코드 수                           |
| `total_bytes`   | int      | 총 바이트                              |
| `error_count`   | int      | 에러 수                                |
| `error_message` | text     | 에러 상세                              |
| `exec_instance` | string   | 실행 서버 인스턴스 ID                  |
| `manifest_path` | string   | manifest.json 경로                     |

---

## 빠른 시작 예시

### 최소 설정 (로컬 백업)

```json
// configs/backup.json
{
    "enabled": true,
    "data": {
        "enabled": true,
        "schedule": "0 2 * * *"
    },
    "target": {
        "storage_key": "local-backup",
        "prefix": "backups"
    }
}
```

```json
// storage.json에 local-backup 추가
{
    "storages": {
        "local-main": { "driver": "local", "root": "./uploads" },
        "local-backup": { "driver": "local", "root": "/mnt/backup" }
    }
}
```

이것만으로 매일 02:00에 전체 엔티티 데이터 + 스키마가 `/mnt/backup/backups/`에 JSONL로 백업됩니다.

### S3 백업 + 암호화 + 알림

```json
// configs/backup.json
{
    "enabled": true,
    "data": {
        "enabled": true,
        "schedule": "0 2 * * *",
        "entities": {
            "exclude": ["push_log", "smtp_log"]
        },
        "compress": true,
        "encrypt_passphrase": "${BACKUP_ENCRYPT_KEY}",
        "retention": {
            "keep_count": 14,
            "keep_days": 60
        }
    },
    "files": {
        "enabled": true,
        "mode": "realtime"
    },
    "schema": {
        "enabled": true
    },
    "target": {
        "storage_key": "s3-backup",
        "prefix": "prod/backups"
    },
    "notification": {
        "on_failure": true,
        "channels": ["log", "smtp"]
    }
}
```

---

## 알림 (Notification)

### 알림 채널

| 채널      | 설명                      | 필요 조건                  |
| --------- | ------------------------- | -------------------------- |
| `log`     | 서버 로그 출력            | 없음 (항상 사용 가능)      |
| `smtp`    | 이메일 알림 발송          | `configs/smtp.json` 활성화 |
| `webhook` | 등록된 webhook URL로 알림 | Hook 시스템 설정           |

### SMTP 알림 설정

`smtp.json`이 활성화되어 있으면 백업 성공/실패 시 이메일 알림을 받을 수 있습니다.

```json
// configs/backup.json
{
    "notification": {
        "on_success": false,
        "on_failure": true,
        "channels": ["log", "smtp"]
    }
}
```

- `on_failure: true` + `smtp` 채널: 백업 실패 시 관리자 이메일로 알림
- `on_success: true` + `smtp` 채널: 백업 성공 시에도 이메일 알림 (선택)
- 수신자: `smtp.json`의 `default_email_domain` 기반 `admin@{domain}` 주소
- SMTP 서비스가 비활성화 상태면 `smtp` 채널은 자동 스킵됩니다

---

## 로그

| 이벤트         | 레벨    | 메시지 예시                                                                  |
| -------------- | ------- | ---------------------------------------------------------------------------- |
| 백업 시작      | `INFO`  | `[backup] data backup started: session=2026-02-28T020000Z, groups=[default]` |
| 엔티티 완료    | `INFO`  | `[backup] entity exported: Employee (1523 records, 2.3MB, 1.2s)`             |
| 스키마 백업    | `INFO`  | `[backup] schema exported: 12 entity definitions`                            |
| 세션 완료      | `INFO`  | `[backup] completed: 5 entities, 4523 records, 12.5MB, 3.2s`                 |
| retention 정리 | `INFO`  | `[backup] retention cleanup: removed 2 sessions`                             |
| 세션 락 스킵   | `WARN`  | `[backup] session already locked by instance-02, skipping`                   |
| 백업 실패      | `ERROR` | `[backup] entity export failed: Employee: context deadline exceeded`         |
