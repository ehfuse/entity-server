# Entity Hooks 가이드

엔티티 서버는 엔티티의 생명주기 이벤트에 훅(Hook)을 연결하여 자동화된 작업을 수행할 수 있습니다.

## 목차

- [훅 타입](#훅-타입)
- [훅 시점](#훅-시점)
- [파라미터 바인딩](#파라미터-바인딩)
- [사용 예시](#사용-예시)

---

## 훅 타입

| 타입        | 목적                       | 핵심 필드(필수)    | 비고                                                             |
| ----------- | -------------------------- | ------------------ | ---------------------------------------------------------------- |
| `webhook`   | 외부 HTTP 엔드포인트 호출  | `url`              | `method`, `headers`, `body`, `timeout` 지원 · [상세](#1-webhook) |
| `sql`       | SQL 실행/조회              | `query`            | SELECT는 `assign_to` 필수 · [상세](#2-sql)                       |
| `procedure` | Stored Procedure 호출      | `name`             | `params` 템플릿 바인딩 지원 · [상세](#3-procedure)               |
| `entity`    | 관계 엔티티 자동 조회/주입 | `entity`, `action` | `conditions`, `assign_to` 지원 · [상세](#4-entity)               |
| `submit`    | 다른 엔티티 생성/수정      | `entity`, `data`   | Upsert 지원 · [상세](#5-submit)                                  |
| `delete`    | 다른 엔티티 삭제           | `entity`           | `seq` 또는 `match` 필수 · [상세](#6-delete)                      |

### 1. Webhook

외부 HTTP 엔드포인트를 호출합니다.

```json
{
    "type": "webhook",
    "url": "http://localhost:3500/hooks/user-created",
    "method": "POST",
    "headers": {
        "Authorization": "Bearer secret-token"
    },
    "body": {
        "user_seq": "${new.seq}",
        "email": "${new.email}"
    },
    "async": true,
    "timeout": 5000
}
```

**필드:**

- `url` (필수): 호출할 HTTP URL
- `method`: HTTP 메서드 (기본: POST)
- `headers`: 커스텀 헤더
- `body`: 요청 본문 (템플릿 지원)
- `async`: 비동기 실행 여부
- `timeout`: 타임아웃 (밀리초, 기본: 5000)

### 2. SQL

SQL 훅은 **실행형(INSERT/UPDATE/DELETE/CALL)** 과 **조회형(SELECT)** 을 모두 지원합니다.

- 실행형: `assign_to` 없이 실행
- 조회형: `assign_to` 필수, 조회 결과를 컨텍스트에 바인딩

```json
{
    "type": "sql",
    "query": "INSERT INTO user_audit (user_seq, action, email, created_time) VALUES (?, ?, ?, NOW())",
    "params": ["${new.seq}", "INSERT", "${new.email}"]
}
```

```json
{
    "type": "sql",
    "query": "SELECT data_seq, device_name, last_login FROM user_device WHERE user_seq = ? ORDER BY last_login DESC LIMIT 5",
    "params": ["${new.seq}"],
    "assign_to": "recent_devices"
}
```

**필드:**

- `query` (필수): 실행할 SQL 쿼리
- `params`: 파라미터 배열 (템플릿 지원)
- `assign_to`: SELECT 결과를 저장할 키 (SELECT에서 필수)
    - 점 표기 중첩 경로 지원 (예: `meta.recent_devices`)

**검증 규칙:**

- `SELECT` + `assign_to` 없음 → 에러
- `SELECT` 아님 + `assign_to` 있음 → 에러
- `SELECT`는 안전성 검증 적용 (`SELECT` 외 위험 키워드 포함 시 에러)

**SELECT 바인딩 결과 형식:**

- 항상 배열(`[]`)로 바인딩
- 각 행은 `{컬럼명: 값}` 형태 객체
- 행이 없으면 빈 배열 `[]`

**SELECT 엔티티명 자동 치환:**

- SQL의 `FROM/JOIN` 절에서 엔티티명(`user_device`)을 쓰면 내부적으로 인덱스 테이블(`entity_idx_user_device`)로 자동 치환
- 즉 SQL 훅 SELECT에서는 `entity_idx_*`를 직접 쓰지 않아도 됨

예: `assign_to: "recent_devices"`이면 `${new.recent_devices}`로 후속 훅에서 사용 가능

중첩 경로 예: `assign_to: "meta.recent_devices"`이면 `${new.meta.recent_devices}`로 접근 가능

### 3. Procedure

Stored Procedure를 호출합니다.

```json
{
    "type": "procedure",
    "name": "sp_user_created",
    "params": ["${new.seq}", "${new.email}", "${new.name}"]
}
```

**필드:**

- `name` (필수): Stored Procedure 이름
- `params`: 파라미터 배열 (템플릿 지원)

### 4. Entity

관계된 다른 엔티티 데이터를 자동으로 로드합니다.

```json
{
    "type": "entity",
    "entity": "user_login_log",
    "action": "list",
    "conditions": {
        "user_seq": "${new.seq}"
    },
    "assign_to": "login_logs"
}
```

**필드:**

- `entity` (필수): 조회할 엔티티 이름
- `action` (필수): "get", "list", "find"
- `conditions`: 조회 조건 (템플릿 지원)
- `assign_to`: 결과를 할당할 필드명 (기본: entity 이름)

### 5. Submit

다른 엔티티를 생성하거나 수정합니다. **전체 엔티티 생명주기**를 거치므로 validation, encryption, history가 모두 정상 동작합니다.

#### 기본 예시 (신규 생성)

```json
{
    "type": "submit",
    "entity": "employee",
    "data": {
        "user_seq": "${new.seq}",
        "name": "${new.name}",
        "email": "${new.email}"
    },
    "assign_seq_to": "employee_seq"
}
```

#### Upsert (있으면 수정, 없으면 생성)

```json
{
    "type": "submit",
    "entity": "employee",
    "match": {
        "user_seq": "${new.seq}"
    },
    "data": {
        "user_seq": "${new.seq}",
        "name": "${new.name}",
        "email": "${new.email}",
        "status": "active"
    },
    "assign_seq_to": "employee_seq"
}
```

#### 여러 엔티티 동시 생성

```json
{
    "hooks": {
        "after_insert": [
            {
                "type": "submit",
                "entity": "employee",
                "data": {
                    "user_seq": "${new.seq}",
                    "name": "${new.name}"
                }
            },
            {
                "type": "submit",
                "entity": "user_profile",
                "data": {
                    "user_seq": "${new.seq}",
                    "bio": ""
                }
            }
        ]
    }
}
```

**필드:**

- `entity` (필수): submit할 대상 엔티티
- `data` (필수): 저장할 데이터 (템플릿 바인딩 지원)
- `match`: Upsert 조건 (있으면 찾아서 수정, 없으면 생성)
- `assign_seq_to`: 생성/수정된 seq를 현재 엔티티 필드에 저장

**동작 방식:**

- `match`가 있으면: 조건으로 레코드를 찾아 있으면 update, 없으면 insert
- `match`가 없으면: 무조건 insert

### 6. Delete

다른 엔티티를 삭제합니다. Soft delete 또는 hard delete를 선택할 수 있습니다.

#### seq로 삭제

```json
{
    "type": "delete",
    "entity": "employee",
    "seq": "${old.employee_seq}"
}
```

#### 조건으로 찾아서 삭제

```json
{
    "type": "delete",
    "entity": "employee",
    "match": {
        "user_seq": "${old.seq}"
    }
}
```

#### Hard delete

```json
{
    "type": "delete",
    "entity": "temp_data",
    "match": {
        "user_seq": "${old.seq}"
    },
    "hard": true
}
```

#### 여러 엔티티 연쇄 삭제

```json
{
    "hooks": {
        "after_delete": [
            {
                "type": "delete",
                "entity": "employee",
                "match": { "user_seq": "${old.seq}" }
            },
            {
                "type": "delete",
                "entity": "user_profile",
                "match": { "user_seq": "${old.seq}" }
            },
            {
                "type": "delete",
                "entity": "user_settings",
                "match": { "user_seq": "${old.seq}" }
            }
        ]
    }
}
```

**필드:**

- `entity` (필수): 삭제할 대상 엔티티
- `seq`: 삭제할 레코드의 seq (템플릿 지원)
- `match`: 조건으로 레코드 찾기 (여러 개 있으면 전부 삭제)
- `hard`: Hard delete 여부 (기본: false = soft delete)

**동작 방식:**

- `seq`가 있으면: 해당 seq의 레코드 삭제
- `match`가 있으면: 조건에 맞는 모든 레코드 삭제 (최대 100개)
- `hard: true`이면 물리적 삭제, 기본값(false)이면 soft delete

---

## 훅 시점

| 훅 시점         | 실행 타이밍    | 주 용도                    | 실패 시 동작                                     |
| --------------- | -------------- | -------------------------- | ------------------------------------------------ |
| `before_insert` | INSERT 직전    | 유효성 검증/전처리         | 메인 작업 중단                                   |
| `before_update` | UPDATE 직전    | 변경 검증/충돌 확인        | 메인 작업 중단                                   |
| `before_delete` | DELETE 직전    | 의존성/삭제 가능성 검증    | 메인 작업 중단                                   |
| `after_insert`  | INSERT 직후    | 감사 로그/알림/후속 생성   | 기본적으로 경고 로그(설정에 따라 실패 전파 가능) |
| `after_update`  | UPDATE 직후    | 이력 기록/캐시 처리        | 기본적으로 경고 로그(설정에 따라 실패 전파 가능) |
| `after_delete`  | DELETE 직후    | 정리 작업/알림             | 기본적으로 경고 로그(설정에 따라 실패 전파 가능) |
| `after_get`     | 단건 조회 직후 | 관계 데이터 로드/접근 로깅 | 기본적으로 경고 로그(설정에 따라 실패 전파 가능) |
| `after_list`    | 목록 조회 직후 | 조회 로그/통계 집계        | 기본적으로 경고 로그(설정에 따라 실패 전파 가능) |

### Before Hooks (동기 전용)

**before_insert**

- 실행 시점: 데이터 삽입 전
- 용도: 유효성 검증, 데이터 전처리
- 실패 시: 삽입 작업 중단

**before_update**

- 실행 시점: 데이터 수정 전
- 용도: 변경 전 검증, 이전 데이터 확인
- 실패 시: 수정 작업 중단

**before_delete**

- 실행 시점: 데이터 삭제 전
- 용도: 삭제 가능 여부 확인, 의존성 체크
- 실패 시: 삭제 작업 중단

### After Hooks (동기/비동기)

**after_insert**

- 실행 시점: 데이터 삽입 후
- 용도: 알림 발송, 로그 기록, 관련 데이터 생성

**after_update**

- 실행 시점: 데이터 수정 후
- 용도: 변경 이력 기록, 캐시 무효화

**after_delete**

- 실행 시점: 데이터 삭제 후
- 용도: 관련 데이터 정리, 삭제 알림

**after_get**

- 실행 시점: 단일 데이터 조회 후
- 용도: 관계 데이터 자동 로드, 접근 로그
- Entity 타입: 조회된 단일 데이터에 관계 데이터를 추가 가능

**after_list**

- 실행 시점: 목록 조회 후
- 용도: 검색 로그 기록, 통계 집계
- **주의**: Entity 타입 훅은 각 아이템에 관계 데이터를 추가하지 않음 (전체 목록에 대한 로깅/통계 용도만)
- Webhook/SQL/Procedure 타입만 실용적

---

## 파라미터 바인딩

훅에서 동적 값을 사용하려면 `${new.*}`, `${old.*}` 템플릿을 사용합니다.

### 사용 가능한 네임스페이스

**`${new.*}`** - 현재/새로운 데이터

```
${new.seq}          - 엔티티 seq (PK)
${new.license_seq}  - 라이선스 seq
${new.user_seq}     - 요청 사용자 seq
${new.entity}       - 엔티티 이름
${new.email}        - 데이터 필드 (email)
${new.name}         - 데이터 필드 (name)
... (모든 데이터 필드)
```

**`${old.*}`** - 이전 데이터 (UPDATE/DELETE만)

```
${old.email}        - 수정/삭제 전 이메일
${old.name}         - 수정/삭제 전 이름
... (모든 이전 필드)
```

### 작업별 사용 가능한 변수

| 작업   | new.\*    | old.\*      |
| ------ | --------- | ----------- |
| INSERT | ✓         | ✗           |
| UPDATE | ✓ (새 값) | ✓ (이전 값) |
| DELETE | ✗         | ✓           |
| GET    | ✓         | ✗           |
| LIST   | ✓         | ✗           |

---

## 사용 예시

### 예시 1: 사용자 생성 시 감사 로그

```json
{
    "hooks": {
        "after_insert": [
            {
                "type": "sql",
                "query": "INSERT INTO user_audit (user_seq, action, email, created_time) VALUES (?, ?, ?, NOW())",
                "params": ["${new.seq}", "INSERT", "${new.email}"]
            }
        ]
    }
}
```

### 예시 1-1: 사용자 조회 시 SQL SELECT 결과 바인딩

```json
{
    "hooks": {
        "after_get": [
            {
                "type": "sql",
                "query": "SELECT data_seq, device_name FROM user_device WHERE user_seq = ? ORDER BY updated_time DESC LIMIT 3",
                "params": ["${new.seq}"],
                "assign_to": "recent_devices"
            },
            {
                "type": "webhook",
                "url": "http://localhost:3500/hooks/user-devices",
                "body": {
                    "user_seq": "${new.seq}",
                    "devices": "${new.recent_devices}"
                }
            }
        ]
    }
}
```

### 예시 2: 사용자 조회 시 로그인 이력 자동 로드

```json
{
    "hooks": {
        "after_get": [
            {
                "type": "entity",
                "entity": "user_login_log",
                "action": "list",
                "conditions": {
                    "user_seq": "${new.seq}"
                },
                "assign_to": "login_logs"
            }
        ]
    }
}
```

**결과:**

```json
{
    "seq": 1,
    "email": "user@example.com",
    "name": "홍길동",
    "login_logs": [
        {
            "seq": 1,
            "user_seq": 1,
            "ip_address": "192.168.1.100",
            "is_success": 1
        }
    ]
}
```

### 예시 3: 이메일 변경 시 알림

```json
{
    "hooks": {
        "after_update": [
            {
                "type": "webhook",
                "url": "http://localhost:3500/notify-email-change",
                "body": {
                    "user_seq": "${new.seq}",
                    "old_email": "${old.email}",
                    "new_email": "${new.email}"
                },
                "async": true
            }
        ]
    }
}
```

### 예시 4: 삭제 전 의존성 확인

```json
{
    "hooks": {
        "before_delete": [
            {
                "type": "procedure",
                "name": "sp_check_user_dependencies",
                "params": ["${old.seq}"],
                "required": true
            }
        ]
    }
}
```

Stored Procedure 예시:

```sql
DELIMITER //
CREATE PROCEDURE sp_check_user_dependencies(IN p_user_seq BIGINT)
BEGIN
  DECLARE device_count INT;

  SELECT COUNT(*) INTO device_count
  FROM entity_data_user_device
  WHERE JSON_EXTRACT(data, '$.user_seq') = p_user_seq
    AND deleted_time IS NULL;

  IF device_count > 0 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Cannot delete user with active devices';
  END IF;
END //
DELIMITER ;
```

### 예시 5: 복합 훅 - 여러 작업 조합

```json
{
    "hooks": {
        "after_insert": [
            {
                "type": "sql",
                "query": "INSERT INTO user_stats (user_seq) VALUES (?)",
                "params": ["${new.seq}"]
            },
            {
                "type": "procedure",
                "name": "sp_send_welcome_email",
                "params": ["${new.email}", "${new.name}"]
            },
            {
                "type": "webhook",
                "url": "http://localhost:3500/slack/notify",
                "body": {
                    "message": "New user: ${new.email}"
                },
                "async": true
            }
        ]
    }
}
```

### 예시 6: 사용자 조회 시 여러 관계 데이터 로드

```json
{
    "hooks": {
        "after_get": [
            {
                "type": "entity",
                "entity": "user_device",
                "action": "list",
                "conditions": {
                    "user_seq": "${new.seq}"
                },
                "assign_to": "devices"
            },
            {
                "type": "entity",
                "entity": "user_login_log",
                "action": "list",
                "conditions": {
                    "user_seq": "${new.seq}"
                },
                "assign_to": "login_logs"
            }
        ]
    }
}
```

**결과:**

```json
{
  "seq": 1,
  "email": "user@example.com",
  "name": "홍길동",
  "devices": [...],
  "login_logs": [...]
}
```

### 예시 7: 다른 엔티티 자동 생성 (Submit)

user를 생성할 때 employee와 user_profile을 자동으로 생성하는 예시:

```json
{
    "hooks": {
        "after_insert": [
            {
                "type": "submit",
                "entity": "employee",
                "match": {
                    "user_seq": "${new.seq}"
                },
                "data": {
                    "user_seq": "${new.seq}",
                    "name": "${new.name}",
                    "email": "${new.email}",
                    "status": "active"
                },
                "assign_seq_to": "employee_seq"
            },
            {
                "type": "submit",
                "entity": "user_profile",
                "data": {
                    "user_seq": "${new.seq}",
                    "bio": "",
                    "avatar_url": ""
                }
            }
        ]
    }
}
```

**결과:**

- user가 생성되면 자동으로 employee와 user_profile도 생성됨
- employee의 seq가 user의 employee_seq 필드에 저장됨
- match가 있으므로 이미 존재하면 수정, 없으면 생성 (Upsert)

### 예시 8: 연쇄 삭제 (Delete)

user를 삭제할 때 관련 데이터를 모두 삭제하는 예시:

```json
{
    "hooks": {
        "after_delete": [
            {
                "type": "delete",
                "entity": "employee",
                "match": {
                    "user_seq": "${old.seq}"
                }
            },
            {
                "type": "delete",
                "entity": "user_device",
                "match": {
                    "user_seq": "${old.seq}"
                }
            },
            {
                "type": "delete",
                "entity": "user_login_log",
                "match": {
                    "user_seq": "${old.seq}"
                },
                "hard": true
            }
        ]
    }
}
```

**결과:**

- user가 삭제되면 연관된 employee, user_device도 soft delete
- user_login_log는 hard delete로 완전 삭제

### 예시 9: 목록 조회 시 검색 로그 기록 (after_list)

사용자가 user 목록을 조회할 때마다 검색 로그를 남기는 예시:

```json
{
    "hooks": {
        "after_list": [
            {
                "type": "sql",
                "query": "INSERT INTO search_log (entity_name, total_count, page, searched_at) VALUES (?, ?, ?, NOW())",
                "params": ["user", "${new.total}", "${new.page}"]
            }
        ]
    }
}
```

**주의사항:**

- `${new.total}`: 전체 레코드 수
- `${new.page}`: 현재 페이지 번호
- `${new.limit}`: 페이지당 항목 수
- `${new.items}`: 조회된 아이템 배열 (개별 접근 불가)

**after_list vs after_get 차이:**

- **after_get**: Entity 타입 훅으로 관계 데이터를 조회된 단일 객체에 추가 가능
- **after_list**: Entity 타입 훅이 각 아이템에 데이터를 추가하지 않음, 전체 목록에 대한 로깅/통계만 가능

---

## 공통 옵션

모든 훅 타입에서 사용 가능한 공통 옵션:

### enabled

훅 활성화 여부 (기본: true)

```json
{
    "enabled": false
}
```

### async (Webhook 전용)

비동기 실행 여부 (기본: false)

- `true`: 백그라운드에서 실행, 실패해도 메인 작업에 영향 없음
- `false`: 동기 실행, 실패 시 메인 작업도 실패 가능

```json
{
    "async": true
}
```

### required

훅 실패 시 메인 작업 중단 여부 (기본: false)

- before 훅은 항상 required=true처럼 동작
- after 훅에서만 의미 있음

```json
{
    "required": true
}
```

### timeout

웹훅 타임아웃 (밀리초, 기본: 5000)

```json
{
    "timeout": 10000
}
```

---

## 주의사항

1. **Before 훅은 항상 동기 실행**
    - 실패 시 메인 작업이 중단됨

2. **순환 참조 방지**
    - Entity 타입 훅에서 같은 엔티티를 참조하면 무한 루프 발생 가능
    - Submit/Delete 훅에서도 주의 필요 (A가 B를 생성하고, B가 A를 생성하면 무한 루프)

3. **성능 고려**
    - after_get, after_list에 무거운 작업을 넣으면 조회 성능 저하
    - Webhook 타입은 필요 시 async 사용 권장
    - **after_list는 Entity 타입 훅이 각 아이템에 데이터를 추가하지 않음** (전체 목록에 대한 로깅/통계만)

4. **트랜잭션**
    - SQL/Procedure 훅은 같은 트랜잭션에서 실행되지 않음
    - 원자성이 필요하면 메인 로직에 통합 권장

5. **에러 처리**
    - Webhook 실패 시 재시도하지 않음
    - 중요한 작업은 별도 큐 시스템 사용 권장

---

## 디버깅

훅 실행 로그는 서버 로그에 기록됩니다:

```
Warning: after_insert hook failed for user seq=123: webhook returned error: 500
Warning: Failed to insert index data for user seq=123: ...
```

개발 모드에서는 더 상세한 로그를 확인할 수 있습니다.
