# DataStore — 비SQL 스토어 가이드

> SQL Dialect(MySQL/PostgreSQL/SQLite/MSSQL)와 **독립적으로** 동작하는 비SQL 저장소 계층입니다.

---

## 1. 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│             entity.Service (비즈니스 로직)                │
│  암호화 · 훅 · 검증 · 캐시 · optimistic lock             │
└──────────────┬──────────────────────┬────────────────────┘
               │                      │
    ┌──────────▼──────────┐ ┌─────────▼──────────┐
    │  SQL (기존 Dialect)  │ │  DataStore 구현체   │
    │  *sql.DB + Dialect   │ │  MongoDB / ...      │
    └─────────────────────┘ └─────────────────────┘
```

- **SQL 경로**: 기존 4개 DB (MySQL, PostgreSQL, SQLite, MSSQL) — `database.Dialect` 사용
- **DataStore 경로**: `store.DataStore` 인터페이스 구현체 — 비SQL 스토어

`entity.Service`에 DataStore가 설정(`SetDataStore()`)되면 CRUD 전체가 DataStore 경로로 전환됩니다.
**비즈니스 로직(암호화, 훅, 검증, 캐시, optimistic lock)은 동일하게 적용**됩니다.

---

## 2. 지원 드라이버

| 드라이버    | 패키지                           | 상태      |
| ----------- | -------------------------------- | --------- |
| `mongodb`   | `go.mongodb.org/mongo-driver/v2` | ✅ 구현됨 |
| `dynamodb`  | —                                | 🔮 확장점 |
| `firestore` | —                                | 🔮 확장점 |

---

## 3. MongoDB 설정

### 3.1 server.yaml 설정

```yaml
database:
    store:
        driver: mongodb
        uri: "mongodb://localhost:27017"
        database: "entity_server"
```

### 3.2 운영 환경 URI 예시

#### 인증 (SCRAM-SHA-256)

```yaml
database:
    store:
        driver: mongodb
        uri: "mongodb://myUser:myPass@mongo1:27017/entity_server?authSource=admin"
        database: "entity_server"
```

- `authSource`를 명시하지 않으면 기본적으로 연결 URI의 `database` 이름이 사용됩니다.
- 비밀번호에 특수문자가 있으면 [URL 퍼센트 인코딩](https://www.mongodb.com/docs/manual/reference/connection-string/#special-characters-in-connection-string-password)이 필요합니다.

#### TLS/SSL 연결

```yaml
database:
    store:
        driver: mongodb
        uri: "mongodb://myUser:myPass@mongo1:27017/entity_server?tls=true&tlsCAFile=/etc/ssl/mongo-ca.pem&tlsCertificateKeyFile=/etc/ssl/mongo-client.pem"
        database: "entity_server"
```

| URI 옵션                | 설명                                  |
| ----------------------- | ------------------------------------- |
| `tls=true`              | TLS 활성화                            |
| `tlsCAFile`             | CA 인증서 경로                        |
| `tlsCertificateKeyFile` | 클라이언트 인증서+키 (PEM)            |
| `tlsInsecure=true`      | 인증서 검증 비활성화 (개발용, 비권장) |

#### Replica Set

```yaml
database:
    store:
        driver: mongodb
        uri: "mongodb://mongo1:27017,mongo2:27017,mongo3:27017/entity_server?replicaSet=rs0&readPreference=secondaryPreferred&w=majority&journal=true"
        database: "entity_server"
```

| URI 옵션                            | 설명                                |
| ----------------------------------- | ----------------------------------- |
| `replicaSet=rs0`                    | Replica Set 이름                    |
| `readPreference=secondaryPreferred` | 읽기를 Secondary 우선으로 분산      |
| `w=majority`                        | 과반 노드에 쓰기 확인               |
| `journal=true`                      | 저널 커밋 확인 (데이터 안전성 보장) |

#### 프로덕션 권장 (인증 + TLS + Replica Set)

```yaml
database:
    store:
        driver: mongodb
        uri: "mongodb://svcUser:${MONGO_PASSWORD}@mongo1:27017,mongo2:27017,mongo3:27017/entity_server?replicaSet=rs0&authSource=admin&tls=true&tlsCAFile=/etc/ssl/mongo-ca.pem&w=majority&readPreference=secondaryPreferred"
        database: "entity_server"
```

> `${MONGO_PASSWORD}` 형태로 환경변수를 참조할 수 있습니다. `.env` 파일 또는 시스템 환경변수에 설정하세요.

### 3.2 데이터 모델

SQL의 3-테이블 구조가 MongoDB에서는 다음과 같이 매핑됩니다:

| SQL                         | MongoDB                          | 비고                             |
| --------------------------- | -------------------------------- | -------------------------------- |
| `entity_data_<name>` 테이블 | `entity_data_<name>` 컬렉션      | 동일 네이밍 컨벤션               |
| `entity_idx_<name>` 테이블  | 같은 도큐먼트의 `idx` 서브필드   | 별도 컬렉션 불필요               |
| `entity_history_<name>`     | `entity_history_<name>` 컬렉션   | 동일                             |
| `seq` (auto_increment PK)   | `_counters` 컬렉션 + `$inc` 원자 | `findOneAndUpdate`로 시퀀스 발급 |

#### 데이터 도큐먼트 구조

```json
{
    "seq": 42,
    "license_seq": 1,
    "data": "<encrypted-json-string>",
    "created_by": 1,
    "updated_by": 1,
    "created_time": "2026-02-22T09:00:00Z",
    "updated_time": "2026-02-22T09:00:00Z",
    "deleted_time": null,
    "idx": {
        "name": "홍길동",
        "email": "hong@example.com",
        "phone_hash": "a1b2c3..."
    }
}
```

인덱스 필드(`entity.json`의 `index`, `hash`, `unique`)는 `idx` 서브문서에 평문으로 저장되어
MongoDB 네이티브 인덱스로 검색 성능을 확보합니다.

### 3.3 자동 생성되는 인덱스

`EnsureSchema()`가 자동으로 생성하는 인덱스:

| 인덱스                                   | 용도                                         |
| ---------------------------------------- | -------------------------------------------- |
| `{ seq: 1 }` (unique)                    | 기본 PK 검색                                 |
| `{ deleted_time: 1, seq: -1 }`           | soft delete 필터 + 역순 정렬                 |
| `{ license_seq: 1, deleted_time: 1 }`    | 라이선스 격리 엔티티만                       |
| `{ "idx.<field>": 1 }`                   | entity.json `index` / `hash` 필드별          |
| `{ "idx.<field>": 1 }` (unique, partial) | entity.json `unique` 필드 (deleted_time=nil) |

---

## 4. DataStore 인터페이스

```go
type DataStore interface {
    // 레코드 CRUD
    GetRecord(ctx, entity, seq, GetOptions) (*Record, error)
    ListRecords(ctx, entity, []Condition, ListOptions) (*ListResult, error)
    InsertRecord(ctx, entity, *InsertParams) (int64, error)
    UpdateRecord(ctx, entity, seq, *UpdateParams) (int64, error)
    SoftDelete(ctx, entity, seq, DeleteOptions) error
    HardDelete(ctx, entity, seq, DeleteOptions) error

    // 인덱스
    UpsertIndex(ctx, entity, seq, *int64, []IndexField) error

    // 히스토리
    InsertHistory(ctx, entity, HistoryParams) error
    CleanupHistory(ctx, entity, olderThan) (int64, error)

    // 스키마
    EnsureSchema(ctx, *EntityConfig) error

    // 트랜잭션
    WithTx(ctx, func(tx DataStore) error) error

    // 메타
    DriverName() string
    Close() error
}
```

---

## 5. 새 드라이버 추가 방법

1. `internal/store/` 에 `<driver>_store.go` 파일 생성
2. `DataStore` 인터페이스 구현
3. `factory.go`의 `Open()` switch에 케이스 추가
4. `go.mod`에 드라이버 의존성 추가 (필요 시)

### 구현 체크리스트

- [ ] `GetRecord` — deleted_time 필터 포함
- [ ] `ListRecords` — Condition 변환 + 페이지네이션
- [ ] `InsertRecord` — seq 자동 생성 + 반환
- [ ] `UpdateRecord` — 부분 갱신 + MatchedCount 확인
- [ ] `SoftDelete` — deleted_time 설정 (물리 삭제 아님)
- [ ] `HardDelete` — 레코드 완전 삭제
- [ ] `UpsertIndex` — 인덱스 필드 갱신
- [ ] `InsertHistory` — 변경 이력 기록
- [ ] `CleanupHistory` — 만료 히스토리 삭제
- [ ] `EnsureSchema` — 컬렉션/인덱스 자동 생성
- [ ] `WithTx` — 트랜잭션 콜백 (지원하지 않으면 단순 실행)
- [ ] `Close` — 연결 정리

---

## 6. SQL vs DataStore 비교

| 항목               | SQL (Dialect)                       | DataStore (MongoDB)                    |
| ------------------ | ----------------------------------- | -------------------------------------- |
| 데이터 저장        | `entity_data_*` 테이블, `data` 컬럼 | `entity_data_*` 컬렉션, `data` 필드    |
| 인덱스 저장        | `entity_idx_*` 별도 테이블          | 같은 도큐먼트 `idx` 서브필드           |
| 스키마 관리        | DDL (CREATE TABLE, ALTER TABLE)     | 컬렉션 + 인덱스 자동 생성              |
| 트랜잭션           | `sql.Tx` — `WithTx()` 서비스 클론   | MongoDB Session — `WithTx()` 콜백      |
| seq 생성           | AUTO_INCREMENT / IDENTITY / SERIAL  | `_counters` 컬렉션 `$inc` 원자 연산    |
| Placeholder        | `?` / `$1` / `@p1` (Dialect 변환)   | BSON 구조체 직접 구성                  |
| 비즈니스 로직      | entity.Service가 SQL 직접 실행      | entity.Service가 DataStore 메서드 호출 |
| 암호화 · 훅 · 검증 | **동일** (entity.Service 레벨)      | **동일** (entity.Service 레벨)         |
