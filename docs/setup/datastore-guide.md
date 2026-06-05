# 데이터스토어 가이드 (비SQL 스토어)

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
    │  *sql.DB + Dialect   │ │  MongoDB / DynamoDB  │
    │                     │ │  Firestore / Scylla  │
    │                     │ │  CouchDB             │
    └─────────────────────┘ └─────────────────────┘
```

- **SQL 경로**: 기존 4개 DB (MySQL, PostgreSQL, SQLite, MSSQL) — `database.Dialect` 사용
- **DataStore 경로**: `store.DataStore` 인터페이스 구현체 — 비SQL 스토어

`entity.Service`에 DataStore가 설정(`SetDataStore()`)되면 CRUD 전체가 DataStore 경로로 전환됩니다.
**비즈니스 로직(암호화, 훅, 검증, 캐시, optimistic lock)은 동일하게 적용**됩니다.

---

## 2. 지원 드라이버

| 드라이버                            | 패키지                           | 상태      |
| ----------------------------------- | -------------------------------- | --------- |
| `mongodb` / `mongo`                 | `go.mongodb.org/mongo-driver/v2` | ✅ 구현됨 |
| `dynamodb`                          | `github.com/aws/aws-sdk-go-v2`   | ✅ 구현됨 |
| `firestore`                         | `cloud.google.com/go/firestore`  | ✅ 구현됨 |
| `scylladb` / `scylla` / `cassandra` | `github.com/gocql/gocql`         | ✅ 구현됨 |
| `couchdb` / `couch`                 | `github.com/go-kivik/kivik/v4`   | ✅ 구현됨 |

---

## 3. MongoDB 설정

### 3.1 database.json 설정

```json
{
    "default": "entity",
    "groups": {
        "entity": {
            "driver": "mongodb",
            "uri": "mongodb://localhost:27017",
            "database": "entity_server"
        }
    }
}
```

### 3.2 운영 환경 URI 예시

#### 인증 (SCRAM-SHA-256)

```json
{
    "default": "entity",
    "groups": {
        "entity": {
            "driver": "mongodb",
            "uri": "mongodb://myUser:myPass@mongo1:27017/entity_server?authSource=admin",
            "database": "entity_server"
        }
    }
}
```

- `authSource`를 명시하지 않으면 기본적으로 연결 URI의 `database` 이름이 사용됩니다.
- 비밀번호에 특수문자가 있으면 [URL 퍼센트 인코딩](https://www.mongodb.com/docs/manual/reference/connection-string/#special-characters-in-connection-string-password)이 필요합니다.

#### TLS/SSL 연결

```json
{
    "default": "entity",
    "groups": {
        "entity": {
            "driver": "mongodb",
            "uri": "mongodb://myUser:myPass@mongo1:27017/entity_server?tls=true&tlsCAFile=/etc/ssl/mongo-ca.pem&tlsCertificateKeyFile=/etc/ssl/mongo-client.pem",
            "database": "entity_server"
        }
    }
}
```

| URI 옵션                | 설명                                  |
| ----------------------- | ------------------------------------- |
| `tls=true`              | TLS 활성화                            |
| `tlsCAFile`             | CA 인증서 경로                        |
| `tlsCertificateKeyFile` | 클라이언트 인증서+키 (PEM)            |
| `tlsInsecure=true`      | 인증서 검증 비활성화 (개발용, 비권장) |

#### Replica Set

```json
{
    "default": "entity",
    "groups": {
        "entity": {
            "driver": "mongodb",
            "uri": "mongodb://mongo1:27017,mongo2:27017,mongo3:27017/entity_server?replicaSet=rs0&readPreference=secondaryPreferred&w=majority&journal=true",
            "database": "entity_server"
        }
    }
}
```

| URI 옵션                            | 설명                                |
| ----------------------------------- | ----------------------------------- |
| `replicaSet=rs0`                    | Replica Set 이름                    |
| `readPreference=secondaryPreferred` | 읽기를 Secondary 우선으로 분산      |
| `w=majority`                        | 과반 노드에 쓰기 확인               |
| `journal=true`                      | 저널 커밋 확인 (데이터 안전성 보장) |

#### 프로덕션 권장 (인증 + TLS + Replica Set)

```json
{
    "default": "entity",
    "groups": {
        "entity": {
            "driver": "mongodb",
            "uri": "mongodb://svcUser:${MONGO_PASSWORD}@mongo1:27017,mongo2:27017,mongo3:27017/entity_server?replicaSet=rs0&authSource=admin&tls=true&tlsCAFile=/etc/ssl/mongo-ca.pem&w=majority&readPreference=secondaryPreferred",
            "database": "entity_server"
        }
    }
}
```

> `${MONGO_PASSWORD}` 형태로 환경변수를 참조할 수 있습니다. `.env` 파일 또는 시스템 환경변수에 설정하세요.

### 3.3 데이터 모델

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

## 4. DynamoDB 설정

### 4.1 database.json 설정

```json
{
    "default": "entity",
    "groups": {
        "entity": {
            "driver": "dynamodb",
            "region": "ap-northeast-2",
            "database": "my_app"
        }
    }
}
```

### 4.2 인증 방식

| 방식                   | 설명                                                         |
| ---------------------- | ------------------------------------------------------------ |
| IAM Role (EC2/ECS/EKS) | `~/.aws/credentials` 또는 리소스 역할 자동 확인              |
| 환경변수               | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_REGION` |
| `uri` 필드             | 로캐로 DynamoDB 엔드포인트 (e.g. `http://localhost:8000`)    |

### 4.3 데이터 모델

| DynamoDB 테이블         | 용도                               |
| ----------------------- | ---------------------------------- |
| `entity_data_<name>`    | 레코드 저장, `seq` 이 PK(HASH)     |
| `entity_history_<name>` | 히스토리 저장, `seq#ts` 복합키     |
| `_counters`             | `seq` 원자 증가 (`UpdateItem ADD`) |

---

## 5. Firestore 설정

### 5.1 database.json 설정

```json
{
    "default": "entity",
    "groups": {
        "entity": {
            "driver": "firestore",
            "database": "my-gcp-project"
        }
    }
}
```

### 5.2 인증 방식

| 방식                                  | 설명                                                           |
| ------------------------------------- | -------------------------------------------------------------- |
| ADC (Application Default Credentials) | `gcloud auth application-default login` 또는 Workload Identity |
| 서비스 계정 키                        | `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`             |

### 5.3 데이터 모델

| Firestore 콜렉션        | 용도                                    |
| ----------------------- | --------------------------------------- |
| `entity_data_<name>`    | 레코드 저장, `seq` 필드가 PK            |
| `entity_history_<name>` | 히스토리 저장                           |
| `_counters`             | 카운터 `seq` (RunTransaction 원자 증가) |
| `_entity_registry`      | 엔티티 이름 목록 관리                   |

---

## 6. ScyllaDB / Cassandra 설정

### 6.1 database.json 설정

```json
{
    "default": "entity",
    "groups": {
        "entity": {
            "driver": "scylladb",
            "uri": "127.0.0.1",
            "database": "entity_server"
        }
    }
}
```

### 6.2 다중 노드

```json
{
    "default": "entity",
    "groups": {
        "entity": {
            "driver": "scylladb",
            "uri": "scylla1:9042,scylla2:9042,scylla3:9042",
            "database": "entity_server",
            "username": "svc_user",
            "password": "${SCYLLA_PASSWORD}"
        }
    }
}
```

### 6.3 데이터 모델

| CQL 테이블              | 용도                                        |
| ----------------------- | ------------------------------------------- |
| `entity_data_<name>`    | 레코드 저장, `seq` bigint PK                |
| `entity_history_<name>` | 히스토리 저장, `(seq, created_time)` 복합키 |
| `counters`              | LWT(경량 트랜잭션)으로 `seq` 원자 증가      |

> ⚠️ ScyllaDB는 `WithTx()`이 LOGGED BATCH로 동작하고 **읽기 연산은 트랜잭션 범위에 포함되지 않습니다**.

---

## 7. CouchDB 설정

```json
{
    "default": "entity",
    "groups": {
        "entity": {
            "driver": "couchdb",
            "host": "localhost",
            "port": 5984,
            "username": "admin",
            "password": "password"
        }
    }
}
```

URI 방식으로도 설정 가능합니다:

```json
{
    "driver": "couchdb",
    "uri": "http://admin:password@localhost:5984/"
}
```

| 항목                    | 내용                                      |
| ----------------------- | ----------------------------------------- |
| `driver`                | `couchdb` 또는 `couch`                    |
| `host`                  | CouchDB 서버 호스트 (기본값: `localhost`) |
| `port`                  | CouchDB 포트 (기본값: `5984`)             |
| `username` / `password` | 인증 정보                                 |
| `uri`                   | DSN URI (지정시 host/port/user/pass 무시) |

### CouchDB 데이터 모델

| CouchDB DB 이름         | 용도                                            |
| ----------------------- | ----------------------------------------------- |
| `entity_data_<name>`    | 엔티티 데이터 저장, `_id = "seq:<zero-padded>"` |
| `entity_history_<name>` | 히스토리 저장, `_id = "time_seq_nano"` 형식     |
| `_counters`             | seq 카운터, optimistic CAS 로 원자 증가         |
| `_entity_registry`      | 엔티티 이름 레지스트리                          |

> ⚠️ CouchDB에는 다중 도큐먼트 트랜잭션이 없습니다. `WithTx()`은 fn을 직접 호출합니다.

---

## 8. DataStore 인터페이스

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

## 9. 드라이버 확장 시 체크포인트

- 공식 지원 드라이버(`mongodb`, `dynamodb`, `firestore`, `scylladb`, `couchdb`)를 우선 사용
- 신규/커스텀 드라이버 확장은 소스개발자 작업 범위이며, 배포 사용자 환경에서는 설정 검증과 운영 점검에 집중
- 운영 반영 전 아래 항목을 사전 점검

### 운영 점검 체크리스트

- [ ] CRUD 기본 경로(생성/조회/수정/삭제) 정상 동작
- [ ] 인덱스 검색/정렬/페이지네이션 결과 일관성 확인
- [ ] 히스토리 저장/정리(`history_ttl`) 동작 확인
- [ ] 트랜잭션/동시성(optimistic lock) 시나리오 점검
- [ ] 모니터링 항목(지연시간, 에러율, 커넥션/리소스) 기준치 설정
- [ ] 장애 복구 절차(백업/재동기화/롤백) 문서화

---

## 10. SQL vs DataStore 비교

| 항목               | SQL (Dialect)                       | DataStore                              |
| ------------------ | ----------------------------------- | -------------------------------------- |
| 데이터 저장        | `entity_data_*` 테이블, `data` 컬럼 | `entity_data_*` 컬렉션, `data` 필드    |
| 인덱스 저장        | `entity_idx_*` 별도 테이블          | 같은 도큐먼트 `idx` 서브필드           |
| 스키마 관리        | DDL (CREATE TABLE, ALTER TABLE)     | 컬렉션 + 인덱스 자동 생성              |
| 트랜잭션           | `sql.Tx` — `WithTx()` 서비스 클론   | 드라이버별 트랜잭션 — `WithTx()` 콜백  |
| seq 생성           | AUTO_INCREMENT / IDENTITY / SERIAL  | `_counters` 컬렉션 `$inc` 원자 연산    |
| Placeholder        | `?` / `$1` / `@p1` (Dialect 변환)   | BSON 구조체 직접 구성                  |
| 비즈니스 로직      | entity.Service가 SQL 직접 실행      | entity.Service가 DataStore 메서드 호출 |
| 암호화 · 훅 · 검증 | **동일** (entity.Service 레벨)      | **동일** (entity.Service 레벨)         |

---

## 관련 문서

- [설정 가이드](config-guide.md)
- [시작하기](getting-started.md)
- [타임존 목록 (IANA)](timezone-list.md)

## 다음 문서

- [스토리지](../extensions/storage-guide.md)
- [API 라우트](../api-routes/api-routes.md)
- [운영 플레이북](../operations/operations-playbook.md)
- [목록으로 돌아가기](../README.md)
