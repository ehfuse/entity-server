# 엔티티 설정 예제

`entities/` 디렉토리에 배치하는 `.json` 설정 파일 예제 모음입니다.  
엔티티 서버의 **모든 주요 기능을 하나씩** 알아볼 수 있도록 주제별로 구성하였습니다.

> **전체 레퍼런스**: [docs/ops/entity-config-guide.md](../../docs/ops/entity-config-guide.md)  
> **훅 가이드**: [docs/ops/hooks.md](../../docs/ops/hooks.md)

---

## 기능별 샘플 목록

### 기본 필드 & 타입

| 파일                                                     | 엔티티    | 설명                                                                                                                         |
| -------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [01_basic_fields.json](01_basic_fields.json)             | `contact` | 필드명 패턴으로 타입이 **자동 추론**되는 모든 케이스 (`_seq`, `_date`, `_at`, `is_*`, `_count`, `_amount`, `email`, `phone`) |
| [02_types_and_defaults.json](02_types_and_defaults.json) | `product` | 자동 추론이 안 될 때 **`fields` 명시 선언** (`type`, `comment`, `default` 인라인) + `reset_defaults` 시딩                    |

### 제약 & 참조

| 파일                                                               | 엔티티        | 설명                                                                     |
| ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------ |
| [03_hash_and_unique.json](03_hash_and_unique.json)                 | `member`      | **`hash`** (민감 필드 해시 저장) + **단일 `unique`** + **복합 `unique`** |
| [04_fk_and_composite_unique.json](04_fk_and_composite_unique.json) | `team_member` | **`fk`** 외래키 참조 + **복합 유니크** (`team_seq + user_seq`)           |

### 성능 & 운영

| 파일                                                               | 엔티티        | 설명                                                                      |
| ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------- |
| [05_cache.json](05_cache.json)                                     | `config_item` | **`cache`** 엔티티 레벨 캐시 (`ttl_seconds: 600`)                         |
| [06_history_and_hard_delete.json](06_history_and_hard_delete.json) | `article`     | **`history_ttl`** 수정 이력 3년 보관 + **`hard_delete: false`** 논리 삭제 |
| [14_optimistic_lock.json](14_optimistic_lock.json)                 | `inventory`   | **`optimistic_lock`** 동시 수정 충돌 방지 (재고 등 경쟁 조건 있는 데이터) |

### 데이터 격리 & 공유

| 파일                                                 | 엔티티          | 설명                                                                                                              |
| ---------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------- |
| [07_license_scope.json](07_license_scope.json)       | `exchange_rate` | **`license_scope: false`** — 전 라이선스 **공용** 기준 데이터 (환율). `license_seq` 컬럼 없이 모든 테넌트가 공유  |
| [16_isolated_license.json](16_isolated_license.json) | `organization`  | **`isolated: "license"`** — 테넌트 경계를 정의하는 루트 엔티티. `license_seq` FK 없이 직접 소유 (멀티테넌트 루트) |

### 특수 모드

| 파일                                             | 엔티티         | 설명                                                                             |
| ------------------------------------------------ | -------------- | -------------------------------------------------------------------------------- |
| [13_read_only.json](13_read_only.json)           | `activity_log` | **`read_only: true`** API로 수정 불가, 서버 내부(훅/SP)에서만 기록되는 감사 로그 |
| [15_reset_defaults.json](15_reset_defaults.json) | `country`      | **`reset_defaults`** 대량 시딩 — `reset-all` 시 국가 코드 자동 입력              |

### 훅 (Hooks)

| 파일                                                     | 엔티티       | 훅 타입             | 설명                                                                            |
| -------------------------------------------------------- | ------------ | ------------------- | ------------------------------------------------------------------------------- |
| [08_hook_sql.json](08_hook_sql.json)                     | `user_point` | `sql`               | 실행형 SQL (포인트 이력 INSERT) + 조회형 SQL (`assign_to`로 결과 주입)          |
| [09_hook_entity.json](09_hook_entity.json)               | `post`       | `entity`            | `after_get`/`after_list`에서 관련 엔티티 자동 주입 (작성자 프로필, 댓글)        |
| [10_hook_submit_delete.json](10_hook_submit_delete.json) | `project`    | `submit` / `delete` | 생성 시 연관 엔티티 자동 생성(Upsert 포함), 삭제 시 연관 데이터 자동 정리       |
| [11_hook_webhook.json](11_hook_webhook.json)             | `payment`    | `webhook`           | 외부 HTTP 통보 — 비동기(결제 생성) + 동기(상태 변경)                            |
| [12_hook_push.json](12_hook_push.json)                   | `delivery`   | `push`              | 배송 상태 변경 시 고객 푸시 알림 (FCM / APNs 공통, 등록된 모든 디바이스로 전송) |

---

## 훅 타입 한눈에 보기

| 훅 타입   | 핵심 필드                                  | 주요 용도                 | 샘플                         |
| --------- | ------------------------------------------ | ------------------------- | ---------------------------- |
| `sql`     | `query`, `params`                          | SQL 실행 또는 결과 주입   | `08_hook_sql.json`           |
| `entity`  | `entity`, `action`, `assign_to`            | 관련 데이터 자동 로드     | `09_hook_entity.json`        |
| `submit`  | `entity`, `data`, `match`                  | 다른 엔티티 생성/수정     | `10_hook_submit_delete.json` |
| `delete`  | `entity`, `match`                          | 다른 엔티티 삭제          | `10_hook_submit_delete.json` |
| `webhook` | `url`, `body`, `async`                     | 외부 HTTP 호출            | `11_hook_webhook.json`       |
| `push`    | `target_account_seq`, `title`, `push_body` | FCM / APNs 푸시 알림 전송 | `12_hook_push.json`          |

## 훅 실행 시점

| 시점            | 설명                  | 주로 사용                  |
| --------------- | --------------------- | -------------------------- |
| `before_insert` | 데이터 삽입 전        | 유효성 검사, 값 주입       |
| `after_insert`  | 데이터 삽입 후        | 감사 로그, 알림, 연관 생성 |
| `before_update` | 데이터 수정 전        | 변경 검증, 권한 확인       |
| `after_update`  | 데이터 수정 후        | 변경 이력, 상태 알림       |
| `before_delete` | 데이터 삭제 전        | 참조 무결성 확인           |
| `after_delete`  | 데이터 삭제 후        | 연관 데이터 정리           |
| `after_get`     | seq로 단건 조회 후    | 관련 데이터 병합           |
| `after_find`    | 조건으로 단건 조회 후 | 관련 데이터 병합           |
| `after_list`    | 목록 조회 후          | 각 항목 추가 정보 주입     |

## 훅 템플릿 변수

| 변수           | 설명                          |
| -------------- | ----------------------------- |
| `${new.field}` | 삽입/수정 후 데이터의 필드 값 |
| `${old.field}` | 수정/삭제 전 데이터의 필드 값 |
