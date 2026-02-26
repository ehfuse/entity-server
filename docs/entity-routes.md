# Entity API Routes

`/v1/entity/:entity` 엔드포인트 상세 가이드입니다.

- 공통 인증 헤더 및 `skipHooks` 사용법은 [api-routes.md](api-routes.md)를 참조하세요.

<a id="summary"></a>

## 목록

| No. | 항목                                                       | 메서드     | 경로                                       |
| --- | ---------------------------------------------------------- | ---------- | ------------------------------------------ |
| 1   | [메타데이터 조회](#entity-meta)                            | `POST/GET` | `/v1/entity/:entity/meta`                  |
| 2   | [데이터 검증](#entity-validate)                            | `POST/GET` | `/v1/entity/:entity/validate`              |
| 3   | [단건 조회](#entity-get)                                   | `POST/GET` | `/v1/entity/:entity/:seq`                  |
| 3.5 | [조건 기반 단건 조회](#entity-find)                        | `POST`     | `/v1/entity/:entity/find`                  |
| 4   | [목록 조회](#entity-list)                                  | `POST/GET` | `/v1/entity/:entity/list`                  |
| 5   | [조건 기반 개수 조회](#entity-count)                       | `POST/GET` | `/v1/entity/:entity/count`                 |
| 6   | [커스텀 SQL 쿼리](#entity-query)                           | `POST/GET` | `/v1/entity/:entity/query`                 |
| 7   | [변경 이력 조회](#entity-history)                          | `POST/GET` | `/v1/entity/:entity/history/:seq`          |
| 8   | [신규 생성](#entity-submit-create)                         | `POST`     | `/v1/entity/:entity/submit`                |
| 9   | [Submit 기반 생성/수정 (Upsert)](#entity-submit-upsert)    | `POST`     | `/v1/entity/:entity/submit`                |
| 10  | [히스토리 기준 트랜잭션 롤백](#entity-rollback-by-history) | `POST`     | `/v1/entity/:entity/rollback/:history_seq` |
| 11  | [삭제](#entity-delete)                                     | `POST`     | `/v1/entity/:entity/delete/:seq`           |

**트랜잭션 API** (`/v1/transaction`)

| No. | 항목                               | 메서드 | 경로                                       |
| --- | ---------------------------------- | ------ | ------------------------------------------ |
| T1  | [트랜잭션 ID 발급](#tx-start)      | `POST` | `/v1/transaction/start`                    |
| T2  | [트랜잭션 커밋](#tx-commit)        | `POST` | `/v1/transaction/commit/:transaction_id`   |
| T3  | [트랜잭션 전체 롤백](#tx-rollback) | `POST` | `/v1/transaction/rollback/:transaction_id` |

---

<a id="entity-meta"></a>

### 1. 메타데이터 조회

엔티티 설정 정보를 조회합니다.

**엔드포인트**: `POST/GET /v1/entity/:entity/meta`

**요청 예시**:

```bash
curl http://localhost:47200/v1/entity/account/meta
```

**응답**:

```json
{
    "ok": true,
    "data": {
        "name": "user",
        "required": ["name", "email"],
        "index": [
            { "name": "name", "type": "string" },
            { "name": "email", "type": "string" }
        ]
    }
}
```

---

<a id="entity-validate"></a>

### 2. 데이터 검증

실제 저장 없이 유효성만 검증합니다.

**엔드포인트**: `POST/GET /v1/entity/:entity/validate`

**요청 본문**:

```json
{
    "name": "홍길동",
    "email": "hong@example.com"
}
```

**응답**:

```json
{
    "ok": true,
    "valid": true
}
```

---

<a id="entity-get"></a>

### 3. 단건 조회

일련번호로 엔티티를 조회합니다.

**엔드포인트**: `POST/GET /v1/entity/:entity/:seq`

**쿼리 파라미터**:

- `skipHooks` (boolean, default: false) - true일 경우 훅 실행 건너뛰기

**요청 예시**:

```bash
curl http://localhost:47200/v1/entity/account/1
```

**응답**:

```json
{
    "ok": true,
    "data": {
        "seq": 1,
        "name": "홍길동",
        "email": "hong@example.com",
        "created_at": "2026-01-01T00:00:00Z"
    }
}
```

---

<a id="entity-find"></a>

### 3.5. 조건 기반 단건 조회

조건(conditions)을 본문으로 전달하여 첫 번째 일치 레코드를 조회합니다.  
`data` 컬럼을 **항상 완전히 복호화**하여 반환합니다.

**엔드포인트**: `POST /v1/entity/:entity/find`

**쿼리 파라미터**:

- `skipHooks` (boolean, default: false) - true일 경우 훅 실행 건너뛰기

**요청 본문** (JSON 객체):

```json
{
    "email": "hong@example.com"
}
```

**요청 예시**:

```bash
curl -X POST http://localhost:47200/v1/entity/account/find \
  -H 'Content-Type: application/json' \
  -d '{"email":"hong@example.com"}'
```

**응답 (성공)**:

```json
{
    "ok": true,
    "data": {
        "seq": 1,
        "name": "홍길동",
        "email": "hong@example.com",
        "passwd": "...",
        "created_at": "2026-01-01T00:00:00Z"
    }
}
```

**응답 (미발견)**:

```json
{ "ok": false, "message": "entity not found" }
```

↑ [목록으로 이동](#summary)

---

<a id="entity-list"></a>

### 4. 목록 조회

페이지네이션 기반 목록을 조회합니다.

**엔드포인트**: `POST/GET /v1/entity/:entity/list`

**쿼리 파라미터**:

- `page` (int, default: 1) - 페이지 번호
- `limit` (int, default: 20) - 페이지당 항목 수
- `order_by` (string, 선택) - 정렬 필드 (예: `email` 오름차순, `-email` 내림차순)
- `fields` (string, 선택) - 반환할 필드 목록. **미지정 시 인덱스 필드만 반환** (빠름). `*` 지정 시 전체 필드 반환 (복호화 수행). 특정 필드명을 쉼표로 구분하여 지정 가능
- `skipHooks` (boolean, default: false) - true일 경우 훅 실행 건너뛰기

**요청 본문** (조건 필터):

```json
{
    "active": true,
    "role": "admin"
}
```

**조건 연산자**:

조건 키에 연산자를 지정하지 않으면 값 타입에서 자동 추론합니다.

| 지정 방식     | 예시                                                                     |
| ------------- | ------------------------------------------------------------------------ |
| **자동 추론** | `"name": "홍%"` → LIKE, `"ids": [1,2]` → IN, `"deleted": null` → IS NULL |
| **붙여쓰기**  | `"age>=": 20`, `"age<": 40`, `"name!=": "홍"`                            |
| **띄어쓰기**  | `"age >=": 20`, `"status not in": ["x"]`, `"memo is null": true`         |

지원 연산자: `=` `!=` `>` `>=` `<` `<=` `LIKE` `IN` `NOT IN` `IS NULL` `IS NOT NULL`

```json
{
    "age>=": 20,
    "age<": 40,
    "name": "홍%",
    "status": ["active", "pending"],
    "status not in": ["deleted"],
    "deleted_at": null
}
```

**필드 선택 예시**:

```bash
# 인덱스 필드만 반환 (기본값, 복호화 불필요, 가장 빠름)
GET /v1/entity/account/list

# 전체 필드 반환 (복호화 수행)
GET /v1/entity/account/list?fields=*

# 특정 인덱스 필드만 반환 (복호화 불필요)
GET /v1/entity/account/list?fields=email,active

# 특정 일반 필드 반환 (복호화 수행)
GET /v1/entity/account/list?fields=name,email
```

> **성능 최적화**:
>
> - 기본값(미지정): 인덱스 필드만 반환, 복호화 건너뛰기 → 가장 빠름
> - `fields=*`: 전체 필드 반환 (복호화 수행)
> - 인덱스 필드만 지정해도 자동으로 복호화 건너뛰기
> - `seq`, `created_time`, `updated_time`, `license_seq`는 항상 포함
>
> **필드 검증**: 존재하지 않는 필드를 요청하면 에러 발생

**응답**:

```json
{
    "ok": true,
    "data": {
        "total": 100,
        "page": 1,
        "limit": 20,
        "items": [{ "seq": 1, "name": "홍길동", "email": "hong@example.com" }]
    }
}
```

---

<a id="entity-count"></a>

### 5. 조건 기반 개수 조회

`list`와 동일한 조건 규칙(index/hash/unique + `seq`)으로 레코드 수를 조회합니다.

**엔드포인트**: `POST/GET /v1/entity/:entity/count`

**요청 본문** (조건 필터, 선택):

```json
{
    "active": true,
    "role": "admin"
}
```

**응답**:

```json
{
    "ok": true,
    "count": 42
}
```

---

<a id="entity-query"></a>

### 6. 커스텀 SQL 쿼리

엔티티 인덱스 테이블을 대상으로 JOIN을 포함한 SELECT 쿼리를 직접 실행할 수 있습니다.

**엔드포인트**: `POST/GET /v1/entity/:entity/query`

**요청 본문**:

```json
{
    "sql": "SELECT o.data_seq, o.status, g.name FROM orders o JOIN goods g ON o.goods_id = g.data_seq WHERE o.status = ?",
    "params": ["pending"],
    "limit": 100
}
```

**파라미터**:

- `sql` (string, 필수) - SELECT 쿼리문
- `params` (array, 선택) - SQL의 `?` 플레이스홀더에 바인딩할 값 배열
- `limit` (int, 선택) - 결과 제한 (최대 1000)

> **보안 주의**: 사용자 입력값을 SQL에 포함할 때는 반드시 `params`를 사용하세요 (SQL Injection 방지).

#### 테이블명 자동 치환 규칙

`FROM goods` 또는 `JOIN goods`처럼 테이블명을 사용할 때, 서버는 아래 순서로 처리합니다.

1. **실제 DB 테이블 존재 확인** — DB에 `goods` 테이블이 실제로 존재하면 그대로 `goods`를 사용합니다.
2. **엔티티 인덱스 테이블로 치환** — `goods` 테이블이 없으면 `goods` 엔티티의 인덱스 테이블(`entity_idx_goods`)로 치환합니다.

위 예시에서:

- `orders` → DB에 없으면 `entity_idx_orders`로 치환
- `goods` → DB에 실제로 존재하면 `goods` 그대로 사용 (치환 없음)

#### 제약사항

- SELECT 쿼리만 허용
- 엔티티(치환 대상)의 WHERE/ON 조건 필드는 **인덱스/해시/유니크 필드**만 허용 — 실제 DB 테이블 참조 시에는 제한 없음
- 와일드카드 `*` 제외

#### SELECT 필드 규칙

| 참조 대상         | SELECT 필드 규칙                                       |
| ----------------- | ------------------------------------------------------ |
| 실제 DB 테이블    | 모든 컬럼 선택 가능                                    |
| 엔티티(치환 대상) | 인덱스 필드는 그대로 / data 필드는 자동 복호화 후 반환 |

엔티티의 비인덱스 필드(data 내 필드)를 SELECT하면 내부적으로 data blob을 복호화하여 해당 값을 반환합니다.

**응답**:

```json
{
    "ok": true,
    "data": [{ "data_seq": 1, "status": "pending", "name": "상품A" }]
}
```

---

<a id="entity-history"></a>

### 7. 변경 이력 조회

엔티티의 수정 이력을 조회합니다.

**엔드포인트**: `POST/GET /v1/entity/:entity/history/:seq`

**쿼리 파라미터**:

- `page` (int, default: 1)
- `limit` (int, default: 50)

**응답**:

```json
{
    "ok": true,
    "total": 3,
    "page": 1,
    "limit": 50,
    "items": [
        {
            "seq": 10,
            "action": "INSERT",
            "data_snapshot": { "name": "홍길동", "email": "hong@example.com" },
            "changed_by": 2,
            "changed_time": "2026-01-01T12:00:00Z",
            "transaction_id": "TX-20260101-001"
        },
        {
            "seq": 15,
            "action": "UPDATE",
            "data_snapshot": { "name": "홍길동", "email": "hong@example.com" },
            "changed_by": 2,
            "changed_time": "2026-01-02T09:30:00Z",
            "transaction_id": "auto-x9y8z7"
        }
    ]
}
```

> `data_snapshot`은 **after 통일 모델**을 따릅니다.
>
> - `INSERT` / `UPDATE`: 변경 **후** 데이터 (after — revision 결과)
> - `DELETE_SOFT` / `DELETE_HARD`: 삭제 **직전** 데이터 (before — tombstone, 복원에 사용)  
>   상세 내용은 [History · Revision · Rollback 가이드](history-revision-guide.md)를 참조하세요.

---

<a id="entity-submit-create"></a>

### 8. 신규 생성

새로운 엔티티를 생성합니다.

**엔드포인트**: `POST /v1/entity/:entity/submit`

**쿼리 파라미터**:

- `skipHooks` (boolean, default: false) - true일 경우 훅 실행 건너뛰기

**요청 본문**:

```json
{
    "name": "홍길동",
    "email": "hong@example.com",
    "active": true
}
```

**응답**:

```json
{
    "ok": true,
    "seq": 1
}
```

---

<a id="entity-submit-upsert"></a>

### 9. Submit 기반 Upsert (생성/수정)

`submit`은 일련번호(`seq`)가 있으면 수정, 없으면 생성합니다. 또한 unique 기준 중복이 감지되면 수정으로 처리됩니다.

**엔드포인트**: `POST /v1/entity/:entity/submit`

**쿼리 파라미터**:

- `skipHooks` (boolean, default: false) - true일 경우 훅 실행 건너뛰기

**요청 본문** (신규):

```json
{
    "name": "홍길동",
    "email": "hong@example.com"
}
```

**요청 본문** (수정):

```json
{
    "seq": 1,
    "name": "홍길순",
    "email": "hong@example.com"
}
```

**응답**:

```json
{
    "ok": true,
    "seq": 1
}
```

---

<a id="entity-rollback-by-history"></a>

### 10. 히스토리 기준 트랜잭션 롤백

해당 히스토리 레코드의 `transaction_id`를 조회해 트랜잭션 단위로 롤백합니다.

**엔드포인트**: `POST /v1/entity/:entity/rollback/:history_seq`

**요청 예시**:

```bash
curl -X POST http://localhost:47200/v1/entity/account/rollback/10
```

**응답**:

```json
{
    "ok": true,
    "transaction_id": "TX202602150001",
    "rolled_back_count": 2,
    "source_entity": "user",
    "source_history_seq": 10
}
```

---

<a id="tx-start"></a>

### T1. 트랜잭션 ID 발급

새 트랜잭션 ID를 생성하여 반환합니다. 여러 요청을 하나의 revision 그룹으로 묶을 때 사용합니다.

**엔드포인트**: `POST /v1/transaction/start`

**응답**:

```json
{
    "transaction_id": "TX-20260201-abc123"
}
```

발급받은 ID를 이후 요청의 `X-Transaction-ID` 헤더에 넣으면 해당 요청들이 같은 transaction_id를 공유합니다.

---

<a id="tx-commit"></a>

### T2. 트랜잭션 커밋

큐에 쌓인 모든 작업을 단일 DB 트랜잭션으로 일괄 실행합니다. 하나라도 실패하면 전체 ROLLBACK됩니다.

**엔드포인트**: `POST /v1/transaction/commit/:transaction_id`

**요청 예시**:

```bash
curl -X POST http://localhost:47200/v1/transaction/commit/TX-20260201-abc123
```

**응답**:

```json
{
    "ok": true,
    "results": [
        { "entity": "order", "action": "submit", "seq": 55 },
        { "entity": "inventory", "action": "update", "seq": 12 }
    ]
}
```

> 트랜잭션 큐의 TTL은 5분입니다. 5분 이내에 커밋하지 않으면 자동 만료됩니다.

---

<a id="tx-rollback"></a>

### T3. 트랜잭션 전체 롤백

transaction_id가 같은 모든 history 레코드를 찾아 모든 엔티티에 걸쳐 한 번에 롤백합니다.

**엔드포인트**: `POST /v1/transaction/rollback/:transaction_id`

**요청 예시**:

```bash
curl -X POST http://localhost:47200/v1/transaction/rollback/TX-20260201-abc123
```

**응답**:

```json
{
    "ok": true,
    "transaction_id": "TX-20260201-abc123",
    "rolled_back": [
        {
            "entity": "order",
            "data_seq": 55,
            "action": "DELETE (rollback INSERT)"
        },
        {
            "entity": "inventory",
            "data_seq": 12,
            "action": "RESTORE (rollback UPDATE)"
        }
    ],
    "skipped": [],
    "errors": []
}
```

> 롤백 메커니즘 상세는 [History · Revision · Rollback 가이드](history-revision-guide.md)를 참조하세요.

↑ [목록으로 이동](#summary)

---

<a id="entity-delete"></a>

### 11. 삭제

엔티티를 삭제합니다 (소프트 삭제 또는 하드 삭제).

**엔드포인트**: `POST /v1/entity/:entity/delete/:seq`

**쿼리 파라미터**:

- `hard` (boolean, default: false) - true일 경우 완전 삭제
- `skipHooks` (boolean, default: false) - true일 경우 훅 실행 건너뛰기

**응답**:

```json
{
    "ok": true,
    "deleted": 1
}
```

↑ [목록으로 이동](#summary)

---

## 참고 문서

- [API Routes 개요](api-routes.md) - 공통 인증, skipHooks, 에러 응답
- [Admin Routes](admin-routes.md) - 관리자 API
- [Entity Config Guide](entity-config-guide.md) - 엔티티 설정
- [History · Revision · Rollback 가이드](history-revision-guide.md) - 스냅샷 저장 시점, 트랜잭션 ID 활용, 롤백 동작 원리
