# 트랜잭션 가이드

Entity Server는 **서버 사이드 메모리 큐** 기반의 트랜잭션을 지원합니다.  
`transStart()` 이후 submit/delete 요청은 즉시 실행되지 않고 서버 큐에 쌓였다가,  
`transCommit()` 호출 시 단일 `sql.Tx`로 일괄 처리됩니다.

---

## 개요

### 기존 방식 (Saga 패턴)

과거에는 각 HTTP 요청이 독립적으로 즉시 DB에 커밋됐습니다.  
롤백이 필요할 때는 `history` 테이블을 기반으로 역방향 보상(compensating) 쿼리를 실행했습니다.

```
[client]  submit(A) → [server] INSERT A → commit ✓
[client]  submit(B) → [server] INSERT B → commit ✓  (실패 시)
[client]  rollback → [server] 역방향으로 A, B 삭제 (보상 트랜잭션)
```

**단점:** A는 이미 커밋됐으므로 롤백 전까지 다른 요청에 노출됩니다.

### 현재 방식 (서버 큐 + DB 트랜잭션)

`transStart()`로 등록된 txId를 가진 요청은 서버 메모리 큐에 보류됩니다.  
`transCommit()` 시점에 `db.BeginTx()` 한 번으로 전체 작업을 원자적으로 처리합니다.

```
[client]  transStart() → [server] txId 등록 → {"transaction_id": "..."}
[client]  submit(A)    → [server] 큐에 쌓음  → {"ok":true, "queued":true, "seq":"$tx.0"}
[client]  submit(B)    → [server] 큐에 쌓음  → {"ok":true, "queued":true, "seq":"$tx.1"}
[client]  transCommit()→ [server] db.BeginTx() → A, B 일괄 실행 → Commit
```

**장점:** commit 전까지 DB에 아무것도 기록되지 않으므로 ACID가 보장됩니다.

---

## API 엔드포인트

| 메서드 | 경로                                       | 설명                     |
| ------ | ------------------------------------------ | ------------------------ |
| `POST` | `/v1/transaction/start`                    | 트랜잭션 시작, txId 발급 |
| `POST` | `/v1/transaction/commit/:transaction_id`   | 큐 작업 일괄 커밋        |
| `POST` | `/v1/transaction/rollback/:transaction_id` | 트랜잭션 취소            |

### POST /v1/transaction/start

응답:

```json
{
    "ok": true,
    "transaction_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### POST /v1/transaction/commit/:transaction_id

큐에 쌓인 모든 작업을 단일 DB 트랜잭션으로 실행합니다.  
하나라도 실패하면 전체 ROLLBACK 됩니다.

응답:

```json
{
    "ok": true,
    "results": [
        { "ok": true, "seq": 101 },
        { "ok": true, "seq": 202 }
    ]
}
```

`results` 배열 순서는 큐에 쌓인 순서와 동일합니다.

### POST /v1/transaction/rollback/:transaction_id

| 상태                                            | 동작                                            |
| ----------------------------------------------- | ----------------------------------------------- |
| 큐에 있음 (commit 전)                           | 큐를 버립니다. DB에 아무것도 기록되지 않습니다. |
| 큐에 없음 (이미 commit 됐거나 구버전 saga txId) | history 기반 보상 롤백을 실행합니다.            |

---

## 큐 동작 상세

### submit/delete 응답 (큐 모드)

트랜잭션이 활성화된 상태에서의 submit 응답:

```json
{ "ok": true, "queued": true, "seq": "$tx.0" }
```

`$tx.{N}` 은 **seq placeholder** 입니다. 해당 op 의 큐 등록 순서(0-based)를 나타내며,  
commit 시 실제 INSERT seq 로 자동 치환됩니다.

**seq 체이닝 사용 예:**

```
submit("order", {...})                            → seq: "$tx.0"
submit("order_item", {order_seq: "$tx.0", ...}) → seq: "$tx.1"
transCommit()
  → op[0] 실행: INSERT order → seq=101
  → op[1] 실행 전: order_seq="$tx.0" → 101 로 치환 후 INSERT order_item
```

> placeholder 는 중첩 맵과 배열 내부도 재귀적으로 치환됩니다.

### TTL

큐 항목의 TTL은 **5분**입니다.  
작업이 추가(`submit`/`delete`)될 때마다 TTL이 갱신됩니다.  
TTL이 만료된 항목은 백그라운드 goroutine이 자동으로 정리합니다.

### DB 그룹 일관성

하나의 트랜잭션 안에서 **서로 다른 DB 그룹**의 작업을 섞을 수 없습니다.  
(예: `db_group: "shard1"` 엔티티와 `db_group: "shard2"` 엔티티를 같은 트랜잭션에서 사용 불가)  
위반 시 `409 Conflict` 응답이 반환되며 큐가 유지됩니다.

```json
{
    "ok": false,
    "message": "transaction cannot span multiple DB groups ('shard1' vs 'shard2')"
}
```

---

## 제약 사항

- **read-then-write 주의:** `get` 요청은 큐에 들어가지 않으므로 DB 트랜잭션 격리 밖에서 읽습니다. 동시 수정이 많은 환경에서 낙관적 잠금(seq 기반 버전 체크) 등의 보완이 필요합니다.
- **Cross-DB 불가:** 하나의 트랜잭션은 단일 DB 그룹만 사용할 수 있습니다.
- **TTL 5분:** 5분 내에 commit 또는 rollback하지 않으면 큐가 자동 파기됩니다.
- **단일 서버 메모리:** 큐는 서버 프로세스 메모리에 저장됩니다. 다중 인스턴스 환경에서는 트랜잭션이 시작된 서버로 commit/rollback 요청이 라우팅돼야 합니다.

---

## 언어별 클라이언트 사용 예

### PHP (CI4)

```php
$this->es->transStart(); // 서버에 큐 등록

try {
    $this->es->submit('product', ['seq' => 5, 'stock' => 98]);
    $this->es->submit('order',   ['product_seq' => 5, 'qty' => 2]);

    $result   = $this->es->transCommit(); // DB 트랜잭션 일괄 커밋
    $orderSeq = $result['results'][1]['seq'];

} catch (\Throwable $e) {
    $this->es->transRollback(); // 큐 버림 (DB에 아무것도 기록 안 됨)
}
```

### PHP (Laravel)

```php
$this->es->transStart();

try {
    $this->es->submit('product', ['seq' => 5, 'stock' => 98]);
    $this->es->submit('order',   ['product_seq' => 5, 'qty' => 2]);
    $result   = $this->es->transCommit();
    $orderSeq = $result['results'][1]['seq'];
} catch (\Throwable $e) {
    $this->es->transRollback();
}
```

### Java

```java
String txId = es.transStart();
try {
    es.submit("product", Map.of("seq", 5, "stock", 98));
    es.submit("order",   Map.of("product_seq", 5, "qty", 2));
    Map<String, Object> result = es.transCommit();
} catch (Exception e) {
    es.transRollback();
}
```

### Kotlin

```kotlin
val txId = es.transStart()
try {
    es.submit("product", mapOf("seq" to 5, "stock" to 98))
    es.submit("order",   mapOf("product_seq" to 5, "qty" to 2))
    val result = es.transCommit()
} catch (e: Exception) {
    es.transRollback()
}
```

### Node.js

```javascript
await es.transStart();
try {
    await es.submit("product", { seq: 5, stock: 98 });
    await es.submit("order", { product_seq: 5, qty: 2 });
    const result = await es.transCommit();
    const orderSeq = result.results[1].seq;
} catch (e) {
    await es.transRollback();
}
```

### Python

```python
es.trans_start()
try:
    es.submit("product", {"seq": 5, "stock": 98})
    es.submit("order",   {"product_seq": 5, "qty": 2})
    result    = es.trans_commit()
    order_seq = result["results"][1]["seq"]
except Exception:
    es.trans_rollback()
    raise
```

### React / TypeScript

```typescript
await es.transStart();
try {
    await es.submit("product", { seq: 5, stock: 98 });
    await es.submit("order", { product_seq: 5, qty: 2 });
    const result = await es.transCommit();
    const orderSeq = result.results[1].seq;
} catch (e) {
    await es.transRollback();
}
```

### Flutter (Dart)

```dart
await es.transStart();
try {
    await es.submit("product", {"seq": 5, "stock": 98});
    await es.submit("order",   {"product_seq": 5, "qty": 2});
    final result   = await es.transCommit();
    final orderSeq = result["results"][1]["seq"];
} catch (e) {
    await es.transRollback();
}
```

### Swift

```swift
try await es.transStart()
do {
    try await es.submit(entity: "product", data: ["seq": 5, "stock": 98])
    try await es.submit(entity: "order",   data: ["product_seq": 5, "qty": 2])
    let result   = try await es.transCommit()
    let orderSeq = (result["results"] as? [[String: Any]])?[1]["seq"]
} catch {
    try? await es.transRollback()
    throw error
}
```

---

## 내부 구현 요약

```
transStart()
  └─ server: TxQueue.Register(txId) → 메모리 큐 등록

submit(entity, data)  [txId 활성 시]
  └─ server: TxQueue.EnqueueWithGroup(txId, PendingOp{Action:"submit", ...})
  └─ 응답: {"ok":true, "queued":true, "seq":"$tx.0"}  ← placeholder

submit(entity, {fk_field: "$tx.0", ...})  [다음 op]
  └─ 응답: {"ok":true, "queued":true, "seq":"$tx.1"}

transCommit()
  └─ server: TxQueue.Pop(txId) → []PendingOp
  └─ server: db.BeginTx()
  └─ server: op[0] 실행 전 placeholder 치환 → Submit() → seq=101 기록
  └─ server: op[1] 실행 전 "$tx.0" → 101 치환 → Submit()
  └─ server: tx.Commit() 또는 tx.Rollback() (에러 시)
  └─ 응답: {"ok":true, "results":[{"seq":101}, {"seq":202}]}

transRollback()  [commit 전]
  └─ server: TxQueue.Discard(txId) → 큐 버림
  └─ 응답: {"ok":true, "message":"transaction discarded (no changes were made)"}
```

---

## 관련 파일

| 파일                                      | 설명                                                            |
| ----------------------------------------- | --------------------------------------------------------------- |
| `internal/service/entity/tx_queue.go`     | TxQueue 구현 (Register, Enqueue, Pop, Discard, TTL 정리)        |
| `internal/service/entity/service.go`      | `WithTx()`, `CommitPendingOps()`                                |
| `internal/handler/transaction_handler.go` | TransactionStart, TransactionCommit, TransactionRollback 핸들러 |
| `internal/handler/entity_handler.go`      | HandleSubmit/HandleDelete의 큐 인터셉트 로직                    |
| `internal/router/router.go`               | `/v1/transaction/*` 라우트 등록                                 |
| `samples/`                                | 언어별 클라이언트 샘플                                          |
