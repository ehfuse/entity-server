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
| T2  | [트랜잭션 전체 롤백](#tx-rollback) | `POST` | `/v1/transaction/rollback/:transaction_id` |

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

<a id="entity-list"></a>

### 4. 목록 조회

페이지네이션 기반 목록을 조회합니다.

**엔드포인트**: `POST/GET /v1/entity/:entity/list`

**쿼리 파라미터**:

- `page` (int, default: 1) - 페이지 번호
- `limit` (int, default: 20) - 페이지당 항목 수
- `order_by` (string, 선택) - 정렬 필드 (예: `email` 오름차순, `-email` 내림차순)
- `fields` (string, 선택) - 반환할 필드 목록 (쉼표로 구분, 예: `name,email` 또는 `@indexes`)
- `skipHooks` (boolean, default: false) - true일 경우 훅 실행 건너뛰기

**요청 본문** (조건 필터):

```json
{
    "active": true,
    "role": "admin"
}
```

**필드 선택 예시**:

```bash
# 특정 필드만 반환 (복호화 필요)
GET /v1/entity/account/list?fields=name,email

# 인덱스 필드만 반환 (복호화 불필요, 빠름)
GET /v1/entity/account/list?fields=@indexes

# 인덱스 필드 중 일부만 반환 (복호화 불필요)
GET /v1/entity/account/list?fields=email,active

# 모든 필드 반환 (기본값)
GET /v1/entity/account/list
```

> **성능 최적화**:
>
> - `@indexes`: 모든 인덱스 필드 반환 (복호화 건너뛰기)
> - 인덱스 필드만 요청 시 자동으로 복호화 건너뛰기
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

인덱스 테이블에 직접 SQL을 실행합니다 (조인 쿼리 가능).

**엔드포인트**: `POST/GET /v1/entity/:entity/query`

**요청 본문**:

```json
{
    "sql": "SELECT u.name, c.name as company FROM user u LEFT JOIN company c ON u.company_seq = c.data_seq WHERE u.active = ?",
    "params": [true],
    "limit": 50
}
```

**파라미터**:

- `sql` (string, 필수) - SELECT 쿼리문
- `params` (array, 선택) - SQL의 `?` 플레이스홀더에 바인딩할 값 배열
- `limit` (int, 선택) - 결과 제한 (최대 1000)

> **보안 주의**: 사용자 입력값을 SQL에 포함할 때는 반드시 `params`를 사용하세요 (SQL Injection 방지).

**제약사항**:

- SELECT 쿼리만 허용
- 엔티티명은 자동으로 인덱스 테이블로 변환 (`account` → `entity_idx_account`)
- SELECT 필드는 인덱스 설정에 정의된 필드만 허용 (와일드카드 `*` 제외)
- 암호화된 본문 데이터는 조회 불가

**응답**:

```json
{
    "ok": true,
    "data": [{ "name": "홍길동", "company": "ABC주식회사" }]
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

<a id="tx-rollback"></a>

### T2. 트랜잭션 전체 롤백

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
