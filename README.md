# Entity Server 문서

## Entity Server란?

**Entity Server는 데이터 레이어를 직접 구현하지 않아도 되게 해주는 백엔드 엔진입니다.**

백엔드를 개발하다 보면 비즈니스 로직보다 데이터 레이어 반복 작업에 더 많은 시간을 씁니다.

> DB 테이블 설계 → 마이그레이션 작성 → CRUD API 구현 → 인증/권한 처리 → 이력 저장 로직 추가 → ...

Entity Server는 이 반복을 없앱니다. 아래처럼 JSON 파일 하나를 작성하면:

> `index`는 "조회·정렬·검색에 쓸 필드를 고르는 선언"입니다.
> 선언된 필드는 `entity_idx_{name}` 테이블에 별도 컬럼으로 생성되고, DB 인덱스(INDEX)도 함께 걸립니다.
> 선언하지 않은 나머지 필드는 본문(JSON blob)으로 자유롭게 저장됩니다.

```json
{
    "name": "product",
    "index": {
        "name": { "required": true },
        "status": { "type": ["active", "inactive"], "default": "active" },
        "price": {}
    }
}
```

- `product` 엔티티의 **DB 테이블 자동 생성** (data / index / history 3개)
- **CRUD REST API 자동 제공** (`GET /entity/product`, `POST /entity/product`, ...)
- 본문 데이터 **XChaCha20 자동 암호화 저장**
- 필드 변경 **이력(revision) 자동 기록** + `history_ttl`로 보존 기간 관리
- **RBAC 역할 기반 권한**, API 키 인증, JWT 로그인 내장

> **테이블 구조**: 엔티티 하나당 3개 테이블이 자동 생성됩니다.
>
> - `entity_data_{name}` — 본문 데이터 (XChaCha20 암호화 blob)
> - `entity_idx_{name}` — `index` 선언 필드를 평문 컬럼으로 저장 (검색·정렬·직접 쿼리용)
> - `entity_history_{name}` — 변경 이력 스냅샷 (트랜잭션 ID 단위, 롤백 가능)

코드를 전혀 작성하지 않아도 됩니다. 엔티티 JSON 파일을 추가하거나 수정하면 서버를 재시작하는 것만으로 API가 반영됩니다.

**시작하는 순서:**

1. `npm create entity-server@latest my-api` — 프로젝트 생성 + 바이너리 자동 다운로드
    - npm: https://www.npmjs.com/package/create-entity-server
2. `configs/database.json` — DB 연결 설정
3. `entities/` 폴더에 엔티티 JSON 파일 작성
4. `./scripts/generate-env-keys.sh --create` — `ENCRYPTION_KEY`, `JWT_SECRET` 생성
5. `./scripts/run.sh start` — 서버 실행 → API 즉시 사용 가능

## 어떤 도구와 비슷한가?

→ [Comparison (비교)](docs/comparison.md) 문서를 참고하세요.

---

배포용 문서입니다. 운영에 필요한 가이드를 제공합니다.

## 장점

다른 도구들은 아래 중 일부만 제공합니다. Entity Server는 코드 없이 한 번에 제공합니다.

| 항목                        | 설명                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **빠른 개발**               | JSON 파일 → 테이블 + CRUD API + RBAC + JWT + HMAC + OAuth 2.0이 한 번에. CRUD·마이그레이션·인증 구현 없이 즉시 API 완성          |
| **자체 설치형**             | 단일 Go 바이너리, 외부 서비스 의존 없음. 데이터가 자신의 서버 밖으로 나가지 않음                                                 |
| **암호화 내장**             | 본문 데이터를 XChaCha20으로 저장. DB 수준 암호화나 별도 구현 불필요                                                              |
| **변경 이력 + 그룹 롤백**   | 모든 변경이 트랜잭션 ID 단위로 스냅샷 저장되고, 트랜잭션 단위 그룹 롤백 지원                                                     |
| **유연한 스키마**           | 본문은 JSON blob으로 유연하게 저장, 조회·정렬에 필요한 필드만 `index`로 지정. 스키마 변경 시 마이그레이션 없이 재시작만으로 반영 |
| **인덱스 테이블 직접 접근** | `index` 필드는 `entity_idx_{name}` 테이블에 평문 저장 — 복호화 없이 직접 DB 쿼리·JOIN·집계 가능                                  |
| **개발 일관성**             | 팀 전체가 동일한 패턴으로 개발. 특정 개발자의 설계 방식에 의존하지 않아 기술 공백 없이 백엔드를 일관되게 유지                    |
| 운영 효율                   | `history_ttl` 기반 이력 보존 기간 자동 관리, 인덱스 스키마 변경은 재시작만으로 반영                                              |

## 빠른 시작

| 문서                                            | 설명                        |
| ----------------------------------------------- | --------------------------- |
| [Getting Started](docs/getting-started.md) | 설치 및 실행                |
| [Config Guide](docs/config-guide.md)                 | 설정 상세                   |
| [Entity Config Guide](docs/entity-config-guide.md)   | 엔티티 스키마 정의          |
| [API Routes](docs/api-routes.md)           | 전체 엔드포인트 레퍼런스    |
| [Operations Playbook](docs/operations-playbook.md)   | 운영 시나리오별 대응 가이드 |
| [Scripts Guide](docs/scripts-guide.md)               | 운영 스크립트 실행 방법     |
| [Security](docs/security.md)                         | 보안 운영 원칙 및 점검 항목 |

## 엔티티 구조

엔티티 하나당 세 개의 테이블이 자동 생성됩니다. (예: `user` 엔티티)

| 테이블 패턴             | 주요 컬럼                                           | 역할                | 비고                                                  |
| ----------------------- | --------------------------------------------------- | ------------------- | ----------------------------------------------------- |
| `entity_data_{name}`    | `seq`, `data`(blob), `created_time`, `deleted_time` | 암호화 본문 저장소  | XChaCha20-Poly1305 JSON                               |
| `entity_idx_{name}`     | `data_seq`(FK), 엔티티 `index` 설정 필드들          | 검색·정렬·JOIN 전용 | `scripts/sync.sh`로 스키마 무중단 반영                |
| `entity_history_{name}` | `seq`, `data_seq`(FK), `data_snapshot`, `action`    | 변경 이력 스냅샷    | 트랜잭션 ID 단위 그룹 롤백, `history_ttl`로 자동 정리 |

조건 기반 조회/검색 쿼리는 `entity_idx_{name}`를 사용하고, 본문 데이터는 `entity_data_{name}`에 암호화되어 저장됩니다.  
이력은 트랜잭션 ID 단위로 `entity_history_{name}`에 저장되어 그룹 롤백이 가능하며, `history_ttl` 기준으로 보존 기간을 관리할 수 있습니다.

## API

- [API Routes](docs/api-routes.md) - 전체 엔드포인트 레퍼런스
- [Auth Guide](docs/auth-guide.md) - HMAC · JWT · OAuth 2.0 인증 통합 가이드

## 운영

- [Operations Playbook](docs/operations-playbook.md) - 운영 시나리오별 가이드
- [Scripts Guide](docs/scripts-guide.md) - 운영 스크립트 사용법
- [Prefork Benchmark Guide](docs/prefork-benchmark-guide.md) - Prefork on/off 및 프로세스 수 벤치 시나리오
- [Commercial Policy](docs/commercial-policy.md) - 상업 정책 유형, 현재 정책(MIT + EE), 운영 원칙

## 고급 기능

- [Hooks Guide](docs/hooks.md) - 엔티티 생명주기 훅 시스템
- [Join Guide](docs/join-guide.md) - 인덱스 조인 및 커스텀 SQL 쿼리

## 현재 범위

| 항목                        | 상태                                                          |
| --------------------------- | ------------------------------------------------------------- |
| 지원 DB 드라이버            | `mysql`, `mariadb`, `tidb`, `sqlite`, `postgres`, `sqlserver` |
| DataStore 드라이버          | `mongodb`, `dynamodb`, `firestore`, `scylladb`, `couchdb`     |
| 멀티 DB 그룹(엔티티별 분리) | 엔티티 `db_group` 기반 라우팅 지원                            |
| 캐시 드라이버               | `memory`, `file`, `memcached`, `redis`, `sqlite`              |
| 히스토리 보존               | `history_ttl` + `cleanup-history`                             |

> DB 라우팅 우선순위: `db_group` → `default`
