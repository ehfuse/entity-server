# History · Revision · Rollback 가이드

Entity Server의 모든 데이터 변경은 `entity_history_{name}` 테이블에 자동 기록됩니다.  
이 문서는 스냅샷이 정확히 언제·어떻게 저장되는지, 트랜잭션 ID로 여러 변경을 하나의 revision으로 묶는 방법, 그리고 롤백 동작 원리를 설명합니다.

---

## 1. history 테이블 구조

엔티티 하나당 히스토리 테이블이 자동 생성됩니다.

| 컬럼             | 타입        | 설명                                                |
| ---------------- | ----------- | --------------------------------------------------- |
| `seq`            | BIGINT PK   | 히스토리 레코드 고유 번호                           |
| `data_seq`       | BIGINT FK   | 원본 데이터 행 (`entity_data_{name}.seq`)           |
| `action`         | VARCHAR(20) | `INSERT` / `UPDATE` / `DELETE_SOFT` / `DELETE_HARD` |
| `data_snapshot`  | LONGTEXT    | 변경 시점의 데이터 스냅샷 (암호화)                  |
| `changed_by`     | BIGINT      | 변경자 account seq                                  |
| `changed_time`   | DATETIME    | 변경 일시                                           |
| `transaction_id` | VARCHAR(32) | 트랜잭션 그룹 ID (같은 요청 또는 클라이언트 지정)   |

---

## 2. 스냅샷 저장 시점과 내용

`data_snapshot`은 **after 통일 모델**을 따릅니다.  
INSERT와 UPDATE는 변경 **후** 상태(revision 결과)를, DELETE는 삭제 **직전** 상태(tombstone)를 저장합니다.

| action        | data_snapshot 내용        | 비고                                       |
| ------------- | ------------------------- | ------------------------------------------ |
| `INSERT`      | 생성된 데이터 (after)     | 최초 상태. revision v1                     |
| `UPDATE`      | 변경 후 데이터 (after)    | 변경 결과. revision v2, v3 …               |
| `DELETE_SOFT` | 삭제 직전 데이터 (before) | tombstone. 복원에 사용                     |
| `DELETE_HARD` | 삭제 직전 데이터 (before) | tombstone. 삭제 후 data 행 없음. 감사 전용 |

> **after 통일의 이점**
>
> - 각 history 행이 **그 시점의 완전한 상태**를 담습니다 (revision = 스냅샷).
> - UPDATE rollback 시 이전 history 행의 snapshot을 가져다 복원합니다.
> - DELETE rollback은 tombstone(before) 값을 직접 복원합니다.

### 예시 — 단건 이력 흐름

```
data_seq=5 의 history 테이블 예시

seq | action       | data_snapshot          | changed_time
----|--------------|------------------------|---------------------
 1  | INSERT       | {name:"홍길동"}         | 2026-01-01 10:00:00   ← 최초 생성값 (after)
 2  | UPDATE       | {name:"홍길순"}         | 2026-01-02 15:00:00   ← 변경 결과값 (after)
 3  | UPDATE       | {name:"홍길수"}         | 2026-01-03 09:00:00   ← 변경 결과값 (after)
 4  | DELETE_SOFT  | {name:"홍길수"}         | 2026-01-04 12:00:00   ← 삭제 전 마지막 값 (before/tombstone)
```

- seq=3의 snapshot `{name:"홍길수"}` = entity_data의 현재 실제 값과 동일합니다.
- seq=3을 rollback하면 → seq=2의 snapshot `{name:"홍길순"}`으로 복원합니다.

---

## 3. transaction_id — revision 그룹 관리

### 자동 할당

모든 API 요청은 서버 미들웨어가 자동으로 `transaction_id`를 생성합니다.  
단일 요청 안에서 발생하는 모든 history 레코드는 같은 `transaction_id`를 공유합니다.

```
POST /v1/entity/order/submit
  → order INSERT history           transaction_id: "auto-a1b2c3"
  → (after_insert 훅으로 order_item INSERT)  transaction_id: "auto-a1b2c3"
```

### 클라이언트가 직접 지정

여러 API 요청을 하나의 revision으로 묶으려면 `X-Transaction-ID` 헤더를 지정합니다.  
형식: 영문·숫자·`_`·`-`, 최대 64자.

```bash
# 1단계: 트랜잭션 ID 발급 (선택 사항 — 직접 생성해도 됨)
curl -X POST http://localhost:47200/v1/transaction/start
# → { "transaction_id": "TX-20260201-001" }

# 2단계: 같은 ID를 헤더에 실어 여러 요청 전송
curl -X POST http://localhost:47200/v1/entity/order/submit \
  -H "X-Transaction-ID: TX-20260201-001" \
  -d '{"product_seq": 1, "qty": 3}'

curl -X POST http://localhost:47200/v1/entity/inventory/submit \
  -H "X-Transaction-ID: TX-20260201-001" \
  -d '{"product_seq": 1, "stock": 97}'
```

이 두 요청의 history 레코드는 모두 `transaction_id = "TX-20260201-001"`로 기록됩니다.  
→ 나중에 이 ID 하나로 두 변경을 동시에 롤백할 수 있습니다.

> **주의**: `X-Transaction-ID`는 DB 트랜잭션(원자성 보장)이 아닙니다.  
> 각 요청은 독립적으로 커밋됩니다. 이 ID는 **revision 그룹 표식** 역할만 합니다.  
> 요청 도중 실패하면 성공한 요청만 DB에 반영되고, rollback API로 수동 되돌려야 합니다.

---

## 4. rollback 동작 원리

### 방법 A — entity 기준 (history_seq 지정)

특정 history 레코드의 `transaction_id`를 조회해 해당 트랜잭션 전체를 롤백합니다.

```bash
POST /v1/entity/order/rollback/42
```

내부 동작:

1. `entity_history_order.seq = 42` 에서 `transaction_id` 조회
2. 해당 `transaction_id`로 모든 엔티티의 history 테이블 검색
3. 아래 action별 롤백 수행

### 방법 B — transaction_id 직접 지정

```bash
POST /v1/transaction/rollback/TX-20260201-001
```

### action별 롤백 로직

| action        | 롤백 처리                                                                            |
| ------------- | ------------------------------------------------------------------------------------ |
| `INSERT`      | `entity_data`에서 해당 행 DELETE (index 행도 함께 삭제)                              |
| `UPDATE`      | 이전 history 행의 `data_snapshot`(after)으로 복원 — 첫 번째 변경이면 복원 불가(skip) |
| `DELETE_SOFT` | `data_snapshot`(tombstone)으로 복원 + `deleted_time = NULL`                          |
| `DELETE_HARD` | 복원 불가 (data 행 없음). 에러로 skip 처리                                           |

> after 모델에서 UPDATE rollback은 **이전 history 행의 snapshot**을 조회해 복원합니다.  
> INSERT가 첫 변경이라면 이전 history 행이 없으므로 해당 항목은 skip됩니다.

### 롤백 응답 예시

```json
{
    "ok": true,
    "transaction_id": "TX-20260201-001",
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

---

## 5. history 기반 감사 추적

history 테이블은 revision 저장소이면서 동시에 감사 로그입니다.

### 단건 이력 조회

```bash
GET /v1/entity/order/history/55?page=1&limit=20
```

```json
{
    "total": 3,
    "page": 1,
    "limit": 20,
    "items": [
        {
            "seq": 10,
            "action": "INSERT",
            "data_snapshot": { "product_seq": 1, "qty": 3 },
            "changed_by": 2,
            "changed_time": "2026-02-01T10:00:00Z",
            "transaction_id": "TX-20260201-001"
        },
        {
            "seq": 15,
            "action": "UPDATE",
            "data_snapshot": { "product_seq": 1, "qty": 3 },
            "changed_by": 2,
            "changed_time": "2026-02-02T09:30:00Z",
            "transaction_id": "auto-x9y8z7"
        }
    ]
}
```

> `data_snapshot`의 의미 (after 통일 모델)
>
> - `INSERT`: 생성 당시 값 (revision v1).
> - `UPDATE`: 변경 **후** 값 (revision v2, v3 …).
> - `DELETE_SOFT` / `DELETE_HARD`: 삭제 **직전** 값 (tombstone).

### transaction_id로 관련 변경 전체 파악

동일 `transaction_id`를 가진 history 레코드를 조회하면 한 작업 단위에서 어떤 엔티티들이 얼마나 바뀌었는지 파악할 수 있습니다.

```sql
-- 같은 트랜잭션에서 변경된 모든 레코드 확인 (직접 쿼리 예시)
SELECT 'order'    AS entity, seq, data_seq, action, changed_by, changed_time FROM entity_history_order     WHERE transaction_id = 'TX-20260201-001'
UNION ALL
SELECT 'inventory',          seq, data_seq, action, changed_by, changed_time FROM entity_history_inventory WHERE transaction_id = 'TX-20260201-001'
ORDER BY changed_time;
```

### system_audit_log — 서버 레벨 감사 로그

`history` 테이블이 **무엇이 바뀌었는가(WHAT)** 를 담당하는 반면,  
`system_audit_log` 엔티티는 **누가, 어디서, 언제(WHO/WHERE/WHEN)** 를 기록합니다.

| 필드              | 설명                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| `transaction_id`  | history 테이블과 JOIN 튵                                                |
| `entity_name`     | 대상 엔티티 이름                                                        |
| `entity_seq`      | 대상 레코드 seq                                                         |
| `action`          | INSERT / UPDATE / DELETE_SOFT / DELETE_HARD / LOGIN / LOGOUT / ROLLBACK |
| `account_seq`     | 요청한 계정 seq                                                         |
| `ip_address`      | 요청자 IP                                                               |
| `endpoint`        | 요청 API 경로                                                           |
| `request_payload` | 요청 본문 JSON (민감 필드 자동 마스킹)                                  |
| `result_code`     | HTTP 응답 코드                                                          |

**활성화 방법** (server.json):

```json
{
    "enable_audit_log": true,
    "audit_log_payload": false
}
```

- `enable_audit_log: true` — submit / delete 요청 시 자동으로 `system_audit_log`에 기록합니다.
- `audit_log_payload: true` — `request_payload`도 함께 저장합니다. password, token 등 민감 필드는 자동 `***`로 마스킹됩니다.
- `system_audit_log` 엔티티는 `read_only: true`로 API에서 직접 수정 불가 (서버 내부에서만 기록)입니다.

```bash
# 감사 로그 조회 예시
GET /v1/entity/system_audit_log/list?page=1&limit=50
```

---

## 6. history_ttl — 보존 기간

이력은 무한정 쌓입니다. `history_ttl`로 자동 정리 기간을 지정하세요.

```json
{
    "name": "order",
    "history_ttl": 365
}
```

- `history_ttl: 365` → 365일 이전 이력이 정리됨
- 정리 시점: INSERT 발생 시 엔티티별 **하루 1회** 자동 실행
- 수동 정리: `scripts/cleanup-history.sh --apply`

> 감사 목적으로 이력을 장기 보관해야 한다면 `history_ttl`을 크게 설정하거나 0(무제한)으로 두세요.  
> 단, 테이블 크기가 커지면 `scripts/cleanup-history.sh`를 정기 실행하는 배치를 권장합니다.

---

## 7. 실전 시나리오

### 시나리오 1 — 주문 + 재고 동시 변경, 실패 시 되돌리기

```bash
# 1) 트랜잭션 ID 발급
TID=$(curl -sX POST http://localhost:47200/v1/transaction/start | jq -r .transaction_id)

# 2) 주문 생성
curl -X POST http://localhost:47200/v1/entity/order/submit \
  -H "X-Transaction-ID: $TID" \
  -d '{"product_seq": 3, "qty": 5, "status": "pending"}'

# 3) 재고 차감
curl -X POST http://localhost:47200/v1/entity/inventory/submit \
  -H "X-Transaction-ID: $TID" \
  -d '{"seq": 3, "stock": 95}'

# 4) 이후 오류 확인 → 롤백
curl -X POST http://localhost:47200/v1/transaction/rollback/$TID
```

### 시나리오 2 — 특정 시점으로 되돌리기 (단건)

```bash
# order seq=55 의 이력 조회
curl http://localhost:47200/v1/entity/order/history/55

# 원하는 history_seq를 기준으로 그 트랜잭션 전체 롤백
curl -X POST http://localhost:47200/v1/entity/order/rollback/10
```

### 시나리오 3 — 감사 추적 (누가 언제 바꿨나)

```bash
# order seq=55 의 전체 변경 이력
curl http://localhost:47200/v1/entity/order/history/55?limit=100

# history 레코드의 transaction_id로 연관 변경 파악 → 같은 ID로 다른 엔티티 history 조회
```

---

## 8. 요약 — API 레퍼런스

| 목적                    | 엔드포인트                                 | 메서드 |
| ----------------------- | ------------------------------------------ | ------ |
| 트랜잭션 ID 발급        | `/v1/transaction/start`                    | POST   |
| 트랜잭션 전체 롤백      | `/v1/transaction/rollback/:transaction_id` | POST   |
| 단건 이력 조회          | `/v1/entity/:entity/history/:seq`          | GET    |
| 이력 기준 트랜잭션 롤백 | `/v1/entity/:entity/rollback/:history_seq` | POST   |
| history TTL 수동 정리   | `scripts/cleanup-history.sh --apply`       | CLI    |

---

## 참고 문서

- [entity-routes.md](entity-routes.md) — 엔티티 API 전체 목록
- [entity-config-guide.md](entity-config-guide.md) — `history_ttl` 설정
- [architecture.md](architecture.md) — 3-테이블 구조 및 데이터 모델
- [security.md](security.md) — `entity:history`, `entity:rollback` RBAC 권한
