# 시스템 엔티티 가이드

> Entity Server가 내부적으로 사용하는 시스템 엔티티 목록과 필수 요건

---

## 목차

1. [개요](#1-개요)
2. [필수 엔티티 요건 요약](#2-필수-엔티티-요건-요약)
3. [항상 필수](#3-항상-필수)
4. [JWT 활성 시 필수](#4-jwt-활성-시-필수)
5. [SMTP 활성 시 필수](#5-smtp-활성-시-필수)
6. [Storage 활성 시 필수](#6-storage-활성-시-필수)
7. [검증 시점과 방법](#7-검증-시점과-방법)
8. [암호화 키 결정 규칙](#8-암호화-키-결정-규칙)

---

## 1) 개요

시스템 엔티티는 `entities/System/` 하위에 위치하며 활성화된 기능에 따라 필수 요건이 달라집니다.
서버 시작 시 활성화된 기능에 필요한 엔티티 파일이 없으면 에러를 출력하고 프로그램을 종료합니다.
엔티티 파일을 삭제한 경우 자동으로 복구되지 않으며, 배포 패키지의 `entities/` 샘플에서 복사하여 사용하면 됩니다.

```
entities/
├── System/
│   ├── Auth/           ← 항상 + JWT
│   │   ├── api_keys.json
│   │   ├── rbac_roles.json
│   │   ├── account.json
│   │   ├── account_device.json
│   │   └── account_login_log.json
│   ├── Email/          ← SMTP 활성 시
│   │   ├── smtp_msg.json
│   │   └── smtp_log.json
│   ├── Storage/        ← Storage 활성 시
│   │   ├── file_meta.json
│   │   ├── file_backup_log.json
│   │   └── file_download_log.json
│   └── system_audit_log.json
```

---

## 2) 필수 엔티티 요건 요약

| 엔티티              | 경로                                    | 조건         | `license_scope`     |
| ------------------- | --------------------------------------- | ------------ | ------------------- |
| `api_keys`          | `System/Auth/api_keys.json`             | 항상         | `false`             |
| `rbac_roles`        | `System/Auth/rbac_roles.json`           | 항상         | `false`             |
| `system_audit_log`  | `System/system_audit_log.json`          | 항상         | `false`             |
| `account`           | `System/Auth/account.json`              | JWT 활성     | 명시 안 함 (기본값) |
| `account_login_log` | `System/Auth/account_login_log.json`    | JWT 활성     | 명시 안 함 (기본값) |
| `account_device`    | `System/Auth/account_device.json`       | JWT 활성     | 명시 안 함 (기본값) |
| `smtp_msg`          | `System/Email/smtp_msg.json`            | SMTP 활성    | 명시 안 함 (기본값) |
| `smtp_log`          | `System/Email/smtp_log.json`            | SMTP 활성    | `false`             |
| `file_meta`         | `System/Storage/file_meta.json`         | Storage 활성 | 명시 안 함 (기본값) |
| `file_backup_log`   | `System/Storage/file_backup_log.json`   | Storage 활성 | `false`             |
| `file_download_log` | `System/Storage/file_download_log.json` | Storage 활성 | 명시 안 함 (기본값) |

> `license_scope`가 명시되지 않은 엔티티는 `server.json`의 `global_license_scope` 설정을 따릅니다 (미설정 시 기본 `true`).

---

## 3) 항상 필수

서버 기능 설정과 무관하게 항상 생성되는 엔티티입니다.

### `api_keys`

- **역할**: API 키 / HMAC 시크릿 저장 및 인증 키 매핑
- **주요 인덱스**: `key_value` (해시, unique), `enabled`, `account_seq`
- **특성**: `license_scope: false`, `hard_delete: true`

### `rbac_roles`

- **역할**: 역할 기반 접근 제어 (RBAC) 권한 집합 정의
- **주요 인덱스**: `name` (unique), `permissions` (JSON)
- **특성**: `license_scope: false`

### `system_audit_log`

- **역할**: 서버 레벨 감사 로그 (모든 CRUD 요청 자동 기록)
- **주요 인덱스**: `action`, `entity_name`, `account_seq`, `request_time`
- **특성**: `license_scope: false`, `read_only: true`, `hard_delete: true`
- **활성 조건**: `server.json`의 `enable_audit_log: true`

---

## 4) JWT 활성 시 필수

**활성 조건**: `configs/auth/jwt.json`의 `enabled: true` + `JWT_SECRET` 환경변수 설정

### `account`

- **역할**: JWT 로그인/인증 계정
- **주요 인덱스**: `email` (unique), `status`, `rbac_role`, `user_seq`
- **FK**: `user_seq → user.seq`
- **시드**: `reset_defaults`로 관리자 계정 자동 생성

#### account와 user를 분리하는 이유

처음 보면 "왜 로그인 정보(`account`)와 사용자 정보(`user`)를 따로 두는가?"라는 의문이 생깁니다.

| 엔티티    | 역할                                                   | 예시 필드                                                |
| --------- | ------------------------------------------------------ | -------------------------------------------------------- |
| `account` | **인증 수단** — 로그인 방법과 자격증명을 관리          | `login_id`, `password_hash`, `provider`, `refresh_token` |
| `user`    | **사용자 프로필** — 비즈니스 도메인의 사람 정보를 관리 | `name`, `email`, `department_seq`, `role`                |

**분리의 장점:**

- **다중 인증 계정 관리**: 한 사람(`user`)이 서비스 정책에 따라 여러 `account` 레코드를 가질 수 있습니다.
- **책임 분리**: 비밀번호 변경·토큰 갱신은 `account`만 수정하면 되고, 프로필 수정은 `user`만 건드리면 됩니다.
- **라이선스 스코프 분리**: 멀티 테넌트 환경에서 `account`는 `license_scope: false`(시스템 전역), `user`는 `license_scope: true`(고객사별)로 구성할 수 있습니다.

> 단순한 단일 테넌트 서비스라면 초기에는 `account`에 이름·이메일을 같이 두고, 나중에 `user`를 분리하는 방식도 가능합니다.

### `account_login_log`

- **역할**: 로그인 성공/실패 추적 로그
- **주요 인덱스**: `account_seq`, `login_type`, `logged_time`, `status`
- **특성**: `read_only: true`, `hard_delete: true`

### `account_device`

- **역할**: 계정별 디바이스 식별 정보 관리
- **주요 인덱스**: `account_seq`, `device_id` (unique), `platform`, `push_token`
- **참고**: 로그인 기기 추적이나 디바이스 기반 확장 기능에서 공용으로 사용할 수 있습니다.

---

## 5) SMTP 활성 시 필수

**활성 조건**: `configs/smtp.json` 파일이 존재

### `smtp_msg`

- **역할**: SMTP 이메일 트리거 엔티티 (insert 시 smtp hook로 비동기 발송)
- **주요 인덱스**: `status` (`[queued, sent, failed]`, required), `provider` (varchar(50))
- **주요 필드**: `from`, `to` (required), `cc`, `bcc`, `subject` (required), `body_text`, `body_html`, `template_name`, `template_data`, `attachments`, `reply_to`, `ref_entity`, `ref_seq`
- **특성**: `hard_delete: true`, `read_only: true`, `history: false`

### `smtp_log`

- **역할**: SMTP 이메일 발송 이력/재시도 상태 기록
- **주요 인덱스**: `status` (`[pending, processing, sent, failed, expired]`), `provider`, `sent_time`, `retry_count`, `attempt_time`
- **주요 필드**: `smtp_msg_seq`, `from`, `to`, `cc`, `bcc`, `subject`, `body_text`, `body_html`, `attachments`, `error_message`, `message_id`, `ref_entity`, `ref_seq`
- **특성**: `license_scope: false`, `hard_delete: true`, `history: false`

---

## 6) Storage 활성 시 필수

**활성 조건**: `configs/extensions/storage.json`이 존재하고 `storages`에 1개 이상의 스토리지가 설정된 경우

### `file_meta`

- **역할**: 업로드된 파일의 메타데이터 (저장 위치, 크기, 해시, 상태) 관리
- **파일 API**: [파일 라우트](../api-routes/files-routes.md)
- **주요 인덱스** (평문):

| 필드            | 타입                                           | 설명                                  |
| --------------- | ---------------------------------------------- | ------------------------------------- |
| `uuid`          | `varchar(36)`, unique, required                | 파일 UUID v4                          |
| `status`        | `[active, pending, orphan, deleted]`, required | 파일 상태                             |
| `size`          | `bigint unsigned`                              | 파일 크기 (bytes)                     |
| `backup_status` | `[none, pending, synced, failed, skipped]`     | 백업 동기화 상태                      |
| `is_public`     | `boolean`, default `false`, indexed            | 공개 파일 여부 (인증 없이 GET 접근용) |

- **암호화 필드** (data):

| 필드             | 설명                           |
| ---------------- | ------------------------------ |
| `original_name`  | 원본 파일명                    |
| `storage_key`    | 스토리지 상대 경로             |
| `storage_path`   | 라이선스 접두어 포함 전체 경로 |
| `entity_name`    | 첨부 대상 엔티티 이름          |
| `entity_seq`     | 첨부 대상 레코드 seq           |
| `field_name`     | 첨부 필드 이름                 |
| `mime_type`      | MIME 타입                      |
| `content_hash`   | SHA-256 해시                   |
| `backup_retries` | 백업 재시도 횟수               |

- **특성**: `read_only: true`, `hard_delete: true`, `history: false`
- **`license_scope`**: 명시 안 함 → `global_license_scope` 기본값 적용

> `license_scope: true`(기본)이면 로그인 사용자의 파일은 해당 라이선스의 `secret_key`로 암호화됩니다.
> 암호화 키 결정 규칙은 [8절](#8-암호화-키-결정-규칙)을 참조하세요.

### `file_backup_log`

- **역할**: 파일 백업 작업 로그 (스토리지 간 동기화 이력)
- **주요 인덱스**: `status` (`[running, completed, partial, failed]`), `started_time`
- **주요 필드**: `source_key`, `target_key`, `file_count`, `total_bytes`, `error_count`, `error_message`, `exec_instance`, `finished_time`
- **특성**: `license_scope: false`, `read_only: true`, `hard_delete: true`, `history: false`

### `file_download_log`

- **역할**: 파일 다운로드 감사 로그 (누가 언제 어떤 파일을 다운로드했는지)
- **주요 인덱스**: `file_seq` (required), `account_seq`, `entity_name`, `downloaded_time`
- **주요 필드**: `ip` (varchar(45)), `thumb` (varchar(10)), `user_agent` (varchar(500))
- **특성**: `read_only: true`, `hard_delete: true`, `history: false`
- **FK**: `account_seq → false`, `file_seq → false` (soft FK — 참조 무결성 미적용)
- **`license_scope`**: 명시 안 함 → `global_license_scope` 기본값 적용

---

## 7) 검증 시점과 방법

### 필수 엔티티 검증 시점

| 스크립트 / 명령                  | 동작                                                           |
| -------------------------------- | -------------------------------------------------------------- |
| `./normalize-entities.sh`        | 누락된 필수 엔티티를 확인하고 에러 출력 — 파일을 생성하지 않음 |
| `./reset-all.sh --apply/--force` | 필수 엔티티 파일이 없으면 에러로 중단                          |
| 서버 시작                        | 활성 기능의 필수 엔티티가 없으면 에러 출력 후 즉시 종료        |

### 활성 조건 판정

```
항상 필수:
  api_keys, rbac_roles, system_audit_log

JWT 활성 판정:
  configs/auth/jwt.json 존재 + enabled=true + JWT_SECRET 환경변수 비어있지 않음
  → account, account_device, account_login_log 추가

SMTP 활성 판정:
  configs/smtp.json 존재 + enabled≠false
  → smtp_msg, smtp_log 추가

Storage 활성 판정:
  configs/extensions/storage.json 존재 + storages에 1개 이상 설정
  → file_meta, file_backup_log, file_download_log 추가
```

### 검증 로직

1. 활성 조건에 따라 필수 엔티티 목록 결정
2. 각 엔티티에 대해 `entities/` 하위에서 동일 `name`의 JSON 파일 검색
3. 파일이 없으면 에러를 출력하고 프로그램/서버를 중단

> 엔티티 파일이 없는 경우 배포 패키지에 포함된 `entities/` 샘플에서 복사하여 사용합니다.

---

## 8) 암호화 키 결정 규칙

시스템 엔티티의 `data` 필드는 XChaCha20-Poly1305로 암호화됩니다.
어떤 키를 사용하는지는 `license_scope` 설정에 따라 결정됩니다.

### 키 결정 흐름

```
shouldEncrypt(entity) ?
  ├─ entity.DataEncryption 명시됨 → 명시값 사용
  └─ 미명시 → server.json enable_data_encryption 기본값

암호화 활성 시:
  entity.name == "license"       → ENCRYPTION_KEY (마스터)
  entity.LicenseScope == false   → ENCRYPTION_KEY (마스터)
  entity.LicenseScope == true
    └─ license_seq 존재          → license.secret_key (per-license 키)
```

### 엔티티별 암호화 키

| 엔티티              | `license_scope` | 암호화 키                     |
| ------------------- | --------------- | ----------------------------- |
| `api_keys`          | `false`         | `ENCRYPTION_KEY` (마스터)     |
| `rbac_roles`        | `false`         | `ENCRYPTION_KEY` (마스터)     |
| `system_audit_log`  | `false`         | `ENCRYPTION_KEY` (마스터)     |
| `smtp_msg`          | 기본값 적용     | `global_license_scope`에 따라 |
| `smtp_log`          | `false`         | `ENCRYPTION_KEY` (마스터)     |
| `file_backup_log`   | `false`         | `ENCRYPTION_KEY` (마스터)     |
| `account`           | 기본값 적용     | `global_license_scope`에 따라 |
| `account_device`    | 기본값 적용     | `global_license_scope`에 따라 |
| `account_login_log` | 기본값 적용     | `global_license_scope`에 따라 |
| `file_meta`         | 기본값 적용     | `global_license_scope`에 따라 |
| `file_download_log` | 기본값 적용     | `global_license_scope`에 따라 |

### per-license 키 조회 과정

1. `license` 테이블에서 해당 `license_seq` 레코드 조회
2. `ENCRYPTION_KEY` (마스터)로 license 레코드의 `data` 복호화
3. 복호화된 JSON에서 `secret_key` 필드 추출
4. 이 `secret_key`로 해당 라이선스 소속 엔티티 데이터를 암호화/복호화

> `license.secret_key`는 라이선스 생성 시 자동 발급되며, `ENCRYPTION_KEY`(마스터)로 암호화되어 저장됩니다.
> 따라서 `ENCRYPTION_KEY`를 분실하면 모든 데이터 복호화가 불가합니다.

---

## 관련 문서

- [Entity Config Guide (엔티티 설정 가이드)](entity-config-guide.md)
- [History · Revision · Rollback 가이드](history-revision-guide.md)

## 다음 문서

- [파일 라우트](../api-routes/files-routes.md)
- [운영 플레이북](../operations/operations-playbook.md)
- [목록으로 돌아가기](../README.md)
