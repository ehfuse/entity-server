# Entity Hooks 가이드

엔티티 서버는 엔티티의 생명주기 이벤트에 훅(Hook)을 연결하여 자동화된 작업을 수행할 수 있습니다.

## 목차

- [훅 타입](#훅-타입)
- [훅 시점](#훅-시점)
- [파라미터 바인딩](#파라미터-바인딩)
- [사용 예시](#사용-예시)

---

## 훅 타입

| 타입         | 목적                           | 핵심 필드(필수)                               | 비고                                                             |
| ------------ | ------------------------------ | --------------------------------------------- | ---------------------------------------------------------------- |
| `webhook`    | 외부 HTTP 엔드포인트 호출      | `url`                                         | `method`, `headers`, `body`, `timeout` 지원 · [상세](#1-webhook) |
| `sql`        | SQL 실행/조회                  | `query`                                       | SELECT는 `assign_to` 필수 · [상세](#2-sql)                       |
| `procedure`  | Stored Procedure 호출          | `name`                                        | `params` 템플릿 바인딩 지원 · [상세](#3-procedure)               |
| `entity`     | 관계 엔티티 자동 조회/주입     | `entity`, `action`                            | `conditions`, `assign_to` 지원 · [상세](#4-entity)               |
| `submit`     | 다른 엔티티 생성/수정          | `entity`, `data`                              | Upsert 지원 · [상세](#5-submit)                                  |
| `delete`     | 다른 엔티티 삭제               | `entity`                                      | `seq` 또는 `match` 필수 · [상세](#6-delete)                      |
| `update`     | 다른 엔티티의 특정 레코드 수정 | `entity`, `match`, `data`                     | `${target.*}` 산술식 지원 · [상세](#7-update)                    |
| `push`       | 푸시 발송 작업 큐 적재         | `target_account_seq` 또는 `target_device_id`  | 비동기 큐 처리 (FCM / APNs) · [상세](#8-push)                    |
| `smtp`       | 이메일 발송 작업 큐 적재       | `to`                                          | 비동기 큐 처리 (SMTP) · [상세](#9-smtp)                          |
| `sms`        | 문자 발송 작업 큐 적재         | `sms_receiver`, `sms_content`                 | 비동기 큐 처리 (SMS/LMS) · [상세](#10-sms)                       |
| `alimtalk`   | 카카오 알림톡 큐 적재          | `alimtalk_receiver`, `alimtalk_template_code` | 템플릿 코드 기반 발송 · [상세](#11-alimtalk)                     |
| `friendtalk` | 카카오 친구톡 큐 적재          | `friendtalk_receiver`, `friendtalk_content`   | 텍스트/이미지/캐러셀 지원 · [상세](#12-friendtalk)               |

### 1. Webhook

외부 HTTP 엔드포인트를 호출합니다.

```json
{
    "type": "webhook",
    "url": "http://localhost:3500/hooks/account-created",
    "method": "POST",
    "headers": {
        "Authorization": "Bearer secret-token"
    },
    "body": {
        "account_seq": "${new.seq}",
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
    "query": "INSERT INTO account_audit (account_seq, action, email, created_time) VALUES (?, ?, ?, NOW())",
    "params": ["${new.seq}", "INSERT", "${new.email}"]
}
```

```json
{
    "type": "sql",
    "query": "SELECT data_seq, device_name, last_login FROM account_device WHERE account_seq = ? ORDER BY last_login DESC LIMIT 5",
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

- SQL의 `FROM/JOIN` 절에서 엔티티명(`account_device`)을 쓰면 내부적으로 인덱스 테이블(`entity_idx_account_device`)로 자동 치환
- 즉 SQL 훅 SELECT에서는 `entity_idx_*`를 직접 쓰지 않아도 됨

예: `assign_to: "recent_devices"`이면 `${new.recent_devices}`로 후속 훅에서 사용 가능

중첩 경로 예: `assign_to: "meta.recent_devices"`이면 `${new.meta.recent_devices}`로 접근 가능

### 3. Procedure

Stored Procedure를 호출합니다.

```json
{
    "type": "procedure",
    "name": "sp_account_created",
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
    "entity": "account_login_log",
    "action": "list",
    "conditions": {
        "account_seq": "${new.seq}"
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
        "account_seq": "${new.seq}",
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
        "account_seq": "${new.seq}"
    },
    "data": {
        "account_seq": "${new.seq}",
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
                    "account_seq": "${new.seq}",
                    "name": "${new.name}"
                }
            },
            {
                "type": "submit",
                "entity": "account_profile",
                "data": {
                    "account_seq": "${new.seq}",
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
        "account_seq": "${old.seq}"
    }
}
```

#### Hard delete

```json
{
    "type": "delete",
    "entity": "temp_data",
    "match": {
        "account_seq": "${old.seq}"
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
                "match": { "account_seq": "${old.seq}" }
            },
            {
                "type": "delete",
                "entity": "account_profile",
                "match": { "account_seq": "${old.seq}" }
            },
            {
                "type": "delete",
                "entity": "account_settings",
                "match": { "account_seq": "${old.seq}" }
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

### 7. Update

`match`로 대상 레코드를 찾아 **단건** 업데이트합니다. `data` 값에서 `${target.*}`로 대상 레코드의 현재 값을 참조할 수 있으며, `{}` 바깥의 산술식(`+ 1`, `- ${old.score}`)이 자동 평가됩니다.

#### 카운터 증감 (after_insert / after_delete)

```json
{
    "type": "update",
    "entity": "board_post",
    "match": { "seq": "${new.post_seq}" },
    "data": {
        "like_count": "${target.like_count} + 1"
    }
}
```

```json
{
    "type": "update",
    "entity": "board_post",
    "match": { "seq": "${old.post_seq}" },
    "data": {
        "like_count": "${target.like_count} - 1"
    }
}
```

#### 여러 필드 동시 갱신 (after_insert / after_update / after_delete)

```json
{
    "type": "update",
    "entity": "board_post",
    "match": { "seq": "${new.target_seq}" },
    "data": {
        "rating_sum": "${target.rating_sum} + ${new.score}",
        "rating_count": "${target.rating_count} + 1"
    }
}
```

#### after_update: old 값 활용 (점수 변경 시 차액 반영)

```json
{
    "type": "update",
    "entity": "board_post",
    "match": { "seq": "${new.target_seq}" },
    "data": {
        "rating_sum": "${target.rating_sum} - ${old.score} + ${new.score}"
    }
}
```

**필드:**

- `entity` (필수): 수정할 대상 엔티티
- `match` (필수): 대상 레코드 조건 — `${new.*}`, `${old.*}` 바인딩 지원. 조건에 맞는 첫 번째 레코드만 수정
- `data` (필수): 수정할 데이터 — `${target.*}` 포함 산술식 지원

**`${target.*}` 산술식 규칙:**

- `${}` 안에는 `new.field`, `old.field`, `target.field` **단순 필드 참조만** 허용
- 산술 연산자(`+`, `-`, `*`, `/`)와 숫자 리터럴은 `${}` **바깥**에 표기
- 치환 후 문자열이 `숫자 연산자 숫자 ...` 형태이면 좌→우 순서로 자동 평가됨
- 다항식 가능: `"${target.a} - ${old.x} + ${new.y}"`

**동작 방식:**

1. `match` 조건으로 대상 레코드 조회 → `target` 컨텍스트에 로드
2. `data` 값에서 `${target.*}`, `${new.*}`, `${old.*}` 치환
3. 치환 후 산술식 평가 → 정수 결과는 `int64`로 저장
4. `s.Update(targetEntity, seq, data)` 호출 — 전체 엔티티 생명주기(validation, history, after_update 훅) 정상 동작

> 대상 레코드가 없으면 에러 없이 스킵됩니다.

### 8. Push

푸시 발송 작업을 비동기 큐에 적재합니다.

```json
{
    "type": "push",
    "target_account_seq": "account_seq",
    "title": "${new.title}",
    "push_body": "${new.message}",
    "push_data": {
        "ref_entity": "${new.ref_entity}",
        "ref_seq": "${new.ref_seq}"
    }
}
```

특정 디바이스에만 발송하려면 `target_device_id`를 사용합니다:

```json
{
    "type": "push",
    "target_device_id": "device_id",
    "title": "${new.title}",
    "push_body": "${new.message}"
}
```

**필드:**

- `type` (필수): `"push"`
- `target_account_seq`: 수신자의 account_seq 값을 담는 필드명 (기본: `account_seq`) — 등록된 **모든 디바이스**에 발송
- `target_device_id`: 수신 디바이스의 device_id 값을 담는 필드명 (기본: `device_id`) — **특정 디바이스 1대**에만 발송. `target_account_seq`와 함께 쓸 수 있으며, 둘 중 하나는 반드시 있어야 함
- `title`: 알림 제목 (템플릿 지원, 비어있으면 기본값 `"새 알림"`)
- `push_body`: 알림 본문 (템플릿 지원)
- `push_data`: 커스텀 payload map (템플릿 지원)
- `enabled`: 훅 활성화 여부 (기본: `true`)
- `required`: 실패 전파 여부 (기본: `false`)

**동작 방식:**

- 훅 실행 시 즉시 네트워크 전송하지 않고 `push_log`에 `pending`으로 적재됩니다.
- 푸시 워커 디스패처가 시작 직후 1회 즉시 실행 후, 5초 간격으로 `pending`을 claim하여 발송합니다.
- 따라서 일반적으로 insert 후 발송까지 대략 `0~5초 + 워커 처리시간`이 걸립니다.
- `target_account_seq`를 사용하면 수신자의 등록된 **모든 디바이스** (FCM, APNs, web)에 각각 발송됩니다.
- `target_device_id`를 사용하면 해당 device_id를 가진 **특정 디바이스 1대**에만 발송됩니다.

### 9. SMTP

이메일 발송 작업을 비동기 큐에 적재합니다.

```json
{
    "type": "smtp",
    "to": "${new.email}",
    "subject": "회원가입을 환영합니다",
    "body_text": "안녕하세요 ${new.name}님",
    "provider": "default"
}
```

**필드:**

- `to` (필수): 수신자 주소(쉼표 구분 문자열 또는 JSON 배열 문자열)
- `subject`: 메일 제목
- `body_text`: 텍스트 본문
- `body_html`: HTML 본문
- `template_name`, `template_data`: 템플릿 기반 발송 옵션
- `attachments`: 첨부파일 seq 배열(JSON 문자열)
- `from`, `cc`, `bcc`, `reply_to`, `provider`: 발신/참조/프로바이더 옵션

### 10. SMS

문자(SMS/LMS) 발송 작업을 비동기 큐에 적재합니다.

```json
{
    "type": "sms",
    "sms_receiver": "${new.phone}",
    "sms_content": "인증번호는 ${new.verify_code} 입니다.",
    "sms_subject": "인증 안내"
}
```

**필드:**

- `sms_receiver` (필수): 수신 전화번호
- `sms_content` (필수): 메시지 본문
- `sms_subject`: LMS 제목
- `sms_sender`: 발신번호
- `sms_provider`: SMS 프로바이더 키

### 11. Alimtalk

카카오 알림톡 발송 작업을 비동기 큐에 적재합니다.

```json
{
    "type": "alimtalk",
    "alimtalk_receiver": "${new.phone}",
    "alimtalk_template_code": "ORDER_COMPLETE",
    "alimtalk_variables": "{\"name\":\"${new.name}\",\"order_no\":\"${new.order_no}\"}"
}
```

**필드:**

- `alimtalk_receiver` (필수): 수신 전화번호
- `alimtalk_template_code` (필수): 카카오 검수 완료 템플릿 코드
- `alimtalk_variables`: 템플릿 변수(JSON 문자열)
- `alimtalk_provider`: 알림톡 프로바이더 키

### 12. Friendtalk

카카오 친구톡/브랜드메시지 발송 작업을 비동기 큐에 적재합니다.

```json
{
    "type": "friendtalk",
    "friendtalk_receiver": "${new.phone}",
    "friendtalk_content": "신규 혜택을 확인하세요",
    "friendtalk_msg_type": "text",
    "friendtalk_is_ad": "true"
}
```

**필드:**

- `friendtalk_receiver` (필수): 수신 전화번호
- `friendtalk_content` (필수): 메시지 본문
- `friendtalk_msg_type`: 메시지 유형(`text`, `image`, `wide_image`, `wide_item_list`, `carousel`)
- `friendtalk_image_url`, `friendtalk_image_link`: 이미지형 옵션
- `friendtalk_buttons_json`, `friendtalk_carousel_json`, `friendtalk_items_json`, `friendtalk_header`: 고급 카드/버튼 옵션
- `friendtalk_provider`: 친구톡 프로바이더 키

---

## 훅 시점

| 훅 시점         | 실행 타이밍    | 주 용도                            | 실패 시 동작                                     |
| --------------- | -------------- | ---------------------------------- | ------------------------------------------------ |
| `before_insert` | INSERT 직전    | 유효성 검증/전처리                 | 메인 작업 중단                                   |
| `before_update` | UPDATE 직전    | 변경 검증/충돌 확인                | 메인 작업 중단                                   |
| `before_delete` | DELETE 직전    | 의존성/삭제 가능성 검증            | 메인 작업 중단                                   |
| `after_insert`  | INSERT 직후    | 감사 로그/알림/후속 생성           | 기본적으로 경고 로그(설정에 따라 실패 전파 가능) |
| `after_update`  | UPDATE 직후    | 이력 기록/캐시 처리                | 기본적으로 경고 로그(설정에 따라 실패 전파 가능) |
| `after_delete`  | DELETE 직후    | 정리 작업/알림                     | 기본적으로 경고 로그(설정에 따라 실패 전파 가능) |
| `after_get`     | 단건 조회 직후 | 관계 데이터 로드/접근 로깅         | 기본적으로 경고 로그(설정에 따라 실패 전파 가능) |
| `after_find`    | 조건 조회 직후 | 조건 기반 단건 조회 후 관계 데이터 | 기본적으로 경고 로그(설정에 따라 실패 전파 가능) |
| `after_list`    | 목록 조회 직후 | 조회 로그/통계 집계                | 기본적으로 경고 로그(설정에 따라 실패 전파 가능) |

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

- 실행 시점: 단일 데이터 조회 후 (`GET /v1/entity/:entity/:seq`)
- 용도: 관계 데이터 자동 로드, 접근 로그
- Entity 타입: 조회된 단일 데이터에 관계 데이터를 추가 가능

**after_find**

- 실행 시점: 조건 기반 단건 조회 후 (`POST /v1/entity/:entity/find`)
- 용도: 관계 데이터 자동 로드, 조회 이벤트 처리
- Entity 타입: 조회된 데이터에 관계 데이터를 추가 가능
- **`after_get`와 차이**: `after_get`은 seq 기반, `after_find`는 conditions 기반 조회 시 실행

**after_list**

- 실행 시점: 목록 조회 후
- 용도: 검색 로그 기록, 통계 집계
- **주의**: Entity 타입 훅은 각 아이템에 관계 데이터를 추가하지 않음 (전체 목록에 대한 로깅/통계 용도만)
- Webhook/SQL/Procedure 타입만 실용적

---

## 파라미터 바인딩

훅에서 동적 값을 사용하려면 `${new.*}`, `${old.*}`, `${target.*}` 템플릿을 사용합니다.

### 사용 가능한 네임스페이스

**`${new.*}`** - 현재/새로운 데이터

```
${new.seq}          - 엔티티 seq (PK)
${new.license_seq}  - 라이선스 seq
${new.account_seq}     - 요청 사용자 seq
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

**`${target.*}`** - `update` 훅 전용, `match`로 조회한 대상 레코드의 현재 값

```
${target.like_count}    - 대상 레코드의 like_count 현재 값
${target.rating_sum}    - 대상 레코드의 rating_sum 현재 값
... (대상 엔티티의 모든 필드)
```

> `${}` 안에는 필드 참조만 허용합니다. 연산자와 숫자 리터럴은 `${}` 바깥에 표기하세요.
>
> ```json
> "like_count": "${target.like_count} + 1"          ✅
> "like_count": "${target.like_count + 1}"          ❌
> "rating_sum": "${target.rating_sum} - ${old.score} + ${new.score}"  ✅
> ```

### 작업별 사용 가능한 변수

| 작업        | `new.*`   | `old.*`     | `target.*`                   |
| ----------- | --------- | ----------- | ---------------------------- |
| INSERT      | ✓         | ✗           | ✗                            |
| UPDATE      | ✓ (새 값) | ✓ (이전 값) | ✗                            |
| DELETE      | ✗         | ✓           | ✗                            |
| GET         | ✓         | ✗           | ✗                            |
| LIST        | ✓         | ✗           | ✗                            |
| `update` 훅 | ✓         | ✓           | ✓ (match로 찾은 대상 레코드) |

---

## 사용 예시

### 예시 1: 사용자 생성 시 감사 로그

```json
{
    "hooks": {
        "after_insert": [
            {
                "type": "sql",
                "query": "INSERT INTO account_audit (account_seq, action, email, created_time) VALUES (?, ?, ?, NOW())",
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
                "query": "SELECT data_seq, device_name FROM account_device WHERE account_seq = ? ORDER BY updated_time DESC LIMIT 3",
                "params": ["${new.seq}"],
                "assign_to": "recent_devices"
            },
            {
                "type": "webhook",
                "url": "http://localhost:3500/hooks/account-devices",
                "body": {
                    "account_seq": "${new.seq}",
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
                "entity": "account_login_log",
                "action": "list",
                "conditions": {
                    "account_seq": "${new.seq}"
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
    "email": "account@example.com",
    "name": "홍길동",
    "login_logs": [
        {
            "seq": 1,
            "account_seq": 1,
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
                    "account_seq": "${new.seq}",
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
                "name": "sp_check_account_dependencies",
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
CREATE PROCEDURE sp_check_account_dependencies(IN p_account_seq BIGINT)
BEGIN
  DECLARE device_count INT;

  SELECT COUNT(*) INTO device_count
  FROM entity_data_account_device
  WHERE JSON_EXTRACT(data, '$.account_seq') = p_account_seq
    AND deleted_time IS NULL;

  IF device_count > 0 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Cannot delete account with active devices';
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
                "query": "INSERT INTO account_stats (account_seq) VALUES (?)",
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
                    "message": "New account: ${new.email}"
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
                "entity": "account_device",
                "action": "list",
                "conditions": {
                    "account_seq": "${new.seq}"
                },
                "assign_to": "devices"
            },
            {
                "type": "entity",
                "entity": "account_login_log",
                "action": "list",
                "conditions": {
                    "account_seq": "${new.seq}"
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
  "email": "account@example.com",
  "name": "홍길동",
  "devices": [...],
  "login_logs": [...]
}
```

### 예시 7: 다른 엔티티 자동 생성 (Submit)

account를 생성할 때 employee와 account_profile을 자동으로 생성하는 예시:

```json
{
    "hooks": {
        "after_insert": [
            {
                "type": "submit",
                "entity": "employee",
                "match": {
                    "account_seq": "${new.seq}"
                },
                "data": {
                    "account_seq": "${new.seq}",
                    "name": "${new.name}",
                    "email": "${new.email}",
                    "status": "active"
                },
                "assign_seq_to": "employee_seq"
            },
            {
                "type": "submit",
                "entity": "account_profile",
                "data": {
                    "account_seq": "${new.seq}",
                    "bio": "",
                    "avatar_url": ""
                }
            }
        ]
    }
}
```

**결과:**

- account가 생성되면 자동으로 employee와 account_profile도 생성됨
- employee의 seq가 account의 employee_seq 필드에 저장됨
- match가 있으므로 이미 존재하면 수정, 없으면 생성 (Upsert)

### 예시 8: 연쇄 삭제 (Delete)

account를 삭제할 때 관련 데이터를 모두 삭제하는 예시:

```json
{
    "hooks": {
        "after_delete": [
            {
                "type": "delete",
                "entity": "employee",
                "match": {
                    "account_seq": "${old.seq}"
                }
            },
            {
                "type": "delete",
                "entity": "account_device",
                "match": {
                    "account_seq": "${old.seq}"
                }
            },
            {
                "type": "delete",
                "entity": "account_login_log",
                "match": {
                    "account_seq": "${old.seq}"
                },
                "hard": true
            }
        ]
    }
}
```

**결과:**

- account가 삭제되면 연관된 employee, account_device도 soft delete
- account_login_log는 hard delete로 완전 삭제

### 예시 9: 목록 조회 시 검색 로그 기록 (after_list)

사용자가 account 목록을 조회할 때마다 검색 로그를 남기는 예시:

```json
{
    "hooks": {
        "after_list": [
            {
                "type": "sql",
                "query": "INSERT INTO search_log (entity_name, total_count, page, searched_at) VALUES (?, ?, ?, NOW())",
                "params": ["account", "${new.total}", "${new.page}"]
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

4. **트랜잭션 경계**
    - **SQL/Procedure 훅**: 메인 작업과 **같은 DB 트랜잭션** 안에서 실행됩니다. 훅 실패 시 메인 작업도 함께 ROLLBACK됩니다.
    - **Webhook 훅**: HTTP 외부 호출이므로 DB 트랜잭션 **밖에서** 실행됩니다. Webhook 실패가 메인 작업 롤백을 일으키지 않습니다.
    - **Entity/Submit/Delete 훅**: 내부적으로 별도 Service 호출이므로 독립 트랜잭션입니다.
    - 정리: SQL/Procedure만 ACID 원자성이 보장되며, 나머지 타입은 eventually consistent입니다.

5. **에러 처리**
    - Webhook 실패 시 재시도하지 않음
    - 중요한 작업은 별도 큐 시스템 사용 권장

---

## 디버깅

훅 실행 로그는 서버 로그에 기록됩니다:

```
Warning: after_insert hook failed for account seq=123: webhook returned error: 500
Warning: Failed to insert index data for account seq=123: ...
```

개발 모드에서는 더 상세한 로그를 확인할 수 있습니다.

---

## 관련 문서

- [API 라우트](api-routes.md)
- [엔티티 라우트](entity-routes.md)
- [조인](join-routes.md)
- [SMTP 라우트](smtp-routes.md) (`smtp`)
- [SMTP 이메일 발송 가이드](../notification/smtp-guide.md) (`smtp`)

## 다음 문서

- [엔티티 설정](../data/entity-config-guide.md)
- [운영 플레이북](../operations/operations-playbook.md)
- [설정](../setup/config-guide.md)
- [목록으로 돌아가기](../README.md)
