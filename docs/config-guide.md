# Config Guide (설정 가이드)

## 파일 목록

| 파일                 | 목적                             | 상세 설명                      |
| -------------------- | -------------------------------- | ------------------------------ |
| `database.json`      | DB 연결/기본 그룹                | [이동](#database-json)         |
| `security.json`      | 보안 정책(timestamp/nonce TTL)   | [이동](#security-json)         |
| `server.json`        | 서버 실행 정책(환경/포트/스키마) | [이동](#server-json)           |
| `logging.json`       | 로그 레벨/채널/파일/로테이션     | [이동](#logging-json)          |
| `cache.json`         | 전역 캐시 정책/드라이버 설정     | [이동](#cache-json)            |
| `entities/**/*.json` | 엔티티 메타/스키마/기본 데이터   | [이동](entity-config-guide.md) |

<a id="database-json"></a>

## database.json

### 핵심 필드

| 필드                               | 설명                                           |
| ---------------------------------- | ---------------------------------------------- |
| `default`                          | 사용할 기본 DB 그룹명                          |
| `groups.<name>.driver`             | `mysql` / `mariadb` / `postgres` / `sqlite`    |
| `groups.<name>.password`           | DB 비밀번호 (직접 입력 또는 `${ENV_VAR}` 형식) |
| `groups.<name>.maxOpenConns`       | 최대 오픈 커넥션 수                            |
| `groups.<name>.maxIdleConns`       | 최대 idle 커넥션 수                            |
| `groups.<name>.connMaxLifetimeSec` | 커넥션 최대 수명(초)                           |

### 주의사항

- `driver` 미지정 시 기본 `mysql`로 처리됩니다.
- SQLite는 `database` 필드가 파일 경로로 사용됩니다.
- PostgreSQL은 `postgres` 또는 `postgresql`로 지정합니다.
- 엔티티 설정에 `db_group`이 있으면 해당 그룹으로 라우팅됩니다.
- 위 조건이 없으면 `default` 그룹으로 라우팅됩니다.

### 비밀번호 환경변수 치환

- `password` 필드에 `${ENV_VAR}` 형식을 사용하면 해당 환경변수 값으로 자동 치환됩니다.
- 예: `"password": "${DB_PASSWORD_DEVELOPMENT}"` → `DB_PASSWORD_DEVELOPMENT` 환경변수 값을 사용합니다.
- 운영 환경에서는 `.env` 또는 시스템 환경변수에 실제 값을 설정하는 것을 권장합니다.

<a id="cache-json"></a>

## cache.json

### 기본 구조

```json
{
    "defaults": {
        "enabled": true,
        "driver": "redis",
        "ttl_seconds": 300
    },
    "drivers": {
        "file": {
            "dir": ".cache/entity"
        },
        "memcached": {
            "servers": ["127.0.0.1:11211"],
            "max_idle_conns": 10
        },
        "sqlite": {
            "sqlite_path": ".cache/entity/cache.db"
        },
        "redis": {
            "addr": "127.0.0.1:6379",
            "password": "",
            "db": 0,
            "prefix": "entity_cache:"
        }
    }
}
```

### defaults 섹션

| 필드          | 타입    | 설명                                                   |
| ------------- | ------- | ------------------------------------------------------ |
| `enabled`     | boolean | 전역 캐시 활성화 여부                                  |
| `driver`      | string  | 캐시 드라이버 (`memory`, `file`, `memcached`, `redis`) |
| `ttl_seconds` | number  | 캐시 기본 TTL (초)                                     |

- 캐시 키 네임스페이스는 `server.json`의 `namespace`를 공통으로 사용합니다.

### 드라이버별 설정

### 드라이버 비교 (장단점/속도/권장 상황)

> 속도 순위는 단일 서버 기준 일반적인 경향입니다. 실제 성능은 데이터 크기, 네트워크, 디스크 성능에 따라 달라집니다.

| 드라이버    | 상대 속도       | 장점                                                | 단점                                               | 권장 상황                                    |
| ----------- | --------------- | --------------------------------------------------- | -------------------------------------------------- | -------------------------------------------- |
| `memory`    | **가장 빠름**   | 네트워크/디스크 I/O 없음, 설정 단순                 | 프로세스 재시작 시 소멸, 다중 서버 공유 불가       | 개발/테스트, 단일 서버 임시 캐시             |
| `memcached` | 매우 빠름       | 분산 메모리 캐시, 단순 프로토콜, 낮은 지연          | 영속성 없음, 재시작 시 소멸, 운영시 별도 서버 필요 | 읽기 부하가 높은 서비스, 캐시 손실 허용 가능 |
| `redis`     | 빠름            | 분산 캐시, TTL/운영 기능 풍부, 영속성 선택 가능     | memcached 대비 약간 무거움, 운영 복잡도 증가       | 프로덕션 기본 선택, 다중 서버 환경           |
| `sqlite`    | 보통            | 외부 서비스 불필요, 파일 영속성, WAL 읽기 성능 양호 | 로컬 디스크 I/O 의존, 다중 노드 공유 어려움        | 단일 서버 프로덕션, 소규모/중간 규모         |
| `file`      | 상대적으로 느림 | 구현 단순, 외부 의존성 없음, 영속성                 | 파일 I/O 오버헤드 큼, 동시성/대규모 트래픽에 불리  | 로컬 개발, 디버깅 용도                       |

### 어떤 드라이버를 언제 쓰면 좋은가

| 상황                               | 추천 드라이버 | 이유                                   |
| ---------------------------------- | ------------- | -------------------------------------- |
| 로컬 개발/기능 테스트              | `memory`      | 가장 빠르고 준비가 간단함              |
| 단일 서버 운영 + 외부 캐시 미사용  | `sqlite`      | 외부 인프라 없이 영속 캐시 가능        |
| 다중 서버 운영(일반적)             | `redis`       | 공유 캐시/운영 기능/안정성 균형이 좋음 |
| 초저지연 읽기 위주, 캐시 유실 허용 | `memcached`   | 메모리 기반 분산 캐시로 매우 낮은 지연 |
| 임시/검증 목적, 트래픽 낮음        | `file`        | 구성 단순, 문제 재현에 유리            |

### 속도 기준 요약

- 절대 속도 1순위: `memory`
- 분산 캐시 기준 체감 속도: `memcached` ≥ `redis`
- 운영 기본 권장: `redis` (성능/기능/운영성 균형)
- 외부 캐시 없이 영속성이 필요하면: `sqlite`

#### Memory

- 별도 설정 불필요
- 프로세스 메모리에 저장
- 서버 재시작 시 소멸
- 개발 환경 또는 단일 서버에 적합

#### File

| 필드  | 설명                                        |
| ----- | ------------------------------------------- |
| `dir` | 캐시 파일 저장 경로 (기본: `.cache/entity`) |

- 로컬 파일 시스템에 JSON 파일로 저장
- 서버 재시작 후에도 유지
- 디스크 I/O 오버헤드 있음

#### Memcached

| 필드             | 설명                           |
| ---------------- | ------------------------------ |
| `servers`        | Memcache 서버 목록 (host:port) |
| `max_idle_conns` | 최대 유휴 커넥션 수 (기본: 10) |

- 분산 메모리 캐시
- 재시작 시 소멸
- Redis보다 단순하지만 영속성 없음
- TCP 커넥션 풀로 연결 재사용 (상세: [memcache-connection-pool.md](memcache-connection-pool.md))

#### SQLite

| 필드          | 설명                                          |
| ------------- | --------------------------------------------- |
| `sqlite_path` | DB 파일 경로 (기본: `.cache/entity/cache.db`) |

- 내장 DB 캐시 — 외부 서비스 불필요
- 서버 재시작 후에도 유지 (영속성)
- WAL 모드로 읽기 성능 우수
- 만료 항목 백그라운드 자동 정리 (60초 주기)
- 단일 서버 프로덕션에 적합

#### Redis

| 필드       | 설명                        |
| ---------- | --------------------------- |
| `addr`     | Redis 서버 주소 (host:port) |
| `password` | Redis 비밀번호 (선택)       |
| `db`       | Redis DB 번호 (0-15)        |
| `prefix`   | 캐시 키 접두사              |

- 분산 캐시 + 영속성 지원
- 프로덕션 환경 권장
- TTL 자동 관리

### 엔티티별 캐시 재정의

엔티티 설정에서 `cache` 블록을 사용하면 전역 설정을 재정의할 수 있습니다:

```json
{
    "name": "user",
    "cache": {
        "enabled": true,
        "ttl_seconds": 600
    }
}
```

우선순위: **엔티티 설정 > 전역 설정**

### 캐시 동작

| 작업          | 동작                            |
| ------------- | ------------------------------- |
| Entity GET    | 캐시 조회 → DB 조회 → 캐시 저장 |
| Entity UPDATE | 해당 엔티티 캐시 무효화         |
| Entity DELETE | 해당 엔티티 캐시 무효화         |
| List/Query    | 캐시 미사용 (복잡도 높음)       |

### 권장 설정

| 환경        | 드라이버 | TTL       | 용도             |
| ----------- | -------- | --------- | ---------------- |
| Development | `memory` | 60초      | 빠른 개발/테스트 |
| Staging     | `redis`  | 300초     | 운영 환경 검증   |
| Production  | `redis`  | 300-600초 | 읽기 부하 분산   |

### 주의사항

- 캐시 비활성화: `defaults.enabled=false` 또는 엔티티별 `cache.enabled=false`
- TTL이 너무 길면 데이터 정합성 문제 발생 가능
- 수정/삭제가 빈번한 엔티티는 캐시 TTL을 짧게 설정

<a id="security-json"></a>

## security.json

| 필드                      | 설명                                                |
| ------------------------- | --------------------------------------------------- |
| `enable_hmac`             | HMAC 검증 사용 여부 (`true`면 검증, `false`면 우회) |
| `timestamp_skew_sec`      | 요청 timestamp 허용 오차                            |
| `nonce_ttl_sec`           | nonce 재사용 방지 TTL                               |
| `auth_fail_limit_per_min` | 인증 실패 허용 횟수(분당, IP 단위)                  |
| `auth_block_sec`          | 임계 초과 시 차단 시간(초)                          |

개발 환경에서도 `enable_hmac=true`로 설정하면 동일한 HMAC 검증을 적용해 테스트할 수 있습니다.

`security.json`은 정책값(토글/임계값)만 다루며, `API_KEY`, `API_HMAC_SECRET`, `ENCRYPTION_KEY` 같은 비밀키는 `.env` 또는 시스템 환경변수로 관리합니다.

JWT 인증을 사용할 경우(`configs/jwt.json` + `JWT_SECRET`):

- `entities/Auth/account.json`이 필수입니다.
- `account` 엔티티의 인덱스에 `email`, `rbac_role` 필드가 반드시 포함되어야 합니다.

<a id="server-json"></a>

## server.json

| 필드                      | 설명                                        |
| ------------------------- | ------------------------------------------- |
| `namespace`               | 캐시/nonce 키 충돌 방지용 공통 네임스페이스 |
| `language`                | `ko` 또는 `en`                              |
| `environment`             | `development` / `production`                |
| `port`                    | 서버 포트                                   |
| `prefork`                 | Fiber prefork 모드 활성화 여부              |
| `prefork_processes`       | prefork 프로세스 수(0이면 런타임 기본값)    |
| `default_email_domain`    | reset-all 기본 이메일 도메인                |
| `global_optimistic_lock`  | 엔티티 `optimistic_lock` 기본값             |
| `enable_auto_schema_sync` | 자동 스키마 동기화 활성화 여부              |
| `cors_enabled`            | CORS 미들웨어 활성화                        |
| `cors_allow_origins`      | 허용 Origin 목록(예: `*`)                   |
| `cors_allow_methods`      | 허용 메서드 목록                            |
| `cors_allow_headers`      | 허용 요청 헤더 목록                         |
| `cors_allow_credentials`  | Credential 허용 여부                        |

- `namespace`는 같은 Redis/Memcache를 여러 서버가 공유할 때 인스턴스 간 키 충돌을 방지합니다.
- `prefork=true`이고 `prefork_processes>0`이면 해당 값으로 프로세스 수를 제한합니다.
- Prefork 적용 전 성능 검증은 [Prefork Benchmark Guide](prefork-benchmark-guide.md)를 참고하세요.

### Graceful Shutdown

- 서버는 `SIGINT`/`SIGTERM` 수신 시 graceful shutdown을 수행합니다.
- 기본 종료 유예 시간은 10초입니다.

<a id="logging-json"></a>

## logging.json

| 필드           | 설명                               |
| -------------- | ---------------------------------- |
| `level`        | 로그 레벨(`DEBUG/INFO/WARN/ERROR`) |
| `directory`    | 로그 디렉토리                      |
| `access`       | 접근 로그 채널 설정                |
| `error`        | 에러/시스템 로그 채널 설정         |
| `cli`          | CLI 실행 로그 채널 설정            |
| `slow`         | 슬로우 요청 로그 채널 설정         |
| `environments` | 환경별 오버라이드(변경값만)        |

각 채널은 `enabled`, `filename`, `max_size_mb`, `max_backups`, `max_age_days`, `compress`를 지원합니다.
`slow` 채널은 추가로 `threshold_ms`를 사용합니다.

### environments 오버라이드 규칙

| 규칙            | 설명                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| 기본값 우선     | 루트(`level`, `access`, `error`, `cli`, `slow`)를 기본값으로 사용           |
| 환경별 덮어쓰기 | `environments.<env>`에 있는 키만 해당 환경에서 덮어씀                       |
| 최소 정의 권장  | `development` 등에서 바뀌는 값만 작성 (`production`은 기본값과 같으면 생략) |

예: `environments.development.level=DEBUG`, `environments.development.slow.threshold_ms=300`

### 채널 공통 옵션 상세

| 옵션           | 타입    | 의미                                       |
| -------------- | ------- | ------------------------------------------ |
| `enabled`      | boolean | 채널 사용 여부                             |
| `filename`     | string  | 로그 파일명 (`directory` 하위 생성)        |
| `max_size_mb`  | number  | 단일 로그 파일 최대 크기(MB), 초과 시 회전 |
| `max_backups`  | number  | 보관할 백업 로그 파일 개수                 |
| `max_age_days` | number  | 백업 로그 보관 기간(일)                    |
| `compress`     | boolean | 회전된 백업 로그 gzip 압축 여부            |

### slow 채널 추가 옵션

| 옵션           | 타입   | 의미                                                 |
| -------------- | ------ | ---------------------------------------------------- |
| `threshold_ms` | number | 요청 처리 시간이 이 값(ms) 이상이면 `slow` 로그 기록 |

### 로그 레벨 동작 상세

| 레벨    | 기록 범위                                                                               |
| ------- | --------------------------------------------------------------------------------------- |
| `DEBUG` | 기본 access 로그 + 요청 상세 로그(헤더/쿼리/경로 파라미터, 민감값 마스킹) + 시스템 로그 |
| `INFO`  | 기본 access 로그 + 시스템 정보 로그                                                     |
| `WARN`  | 경고/오류 중심 로그                                                                     |
| `ERROR` | 오류 로그만 출력                                                                        |

### 채널별 실제 기록 예

| 채널     | 기록 예                                        |
| -------- | ---------------------------------------------- |
| `access` | 요청 시간, 상태코드, 메서드, 경로, latency     |
| `error`  | 서버 에러, 실행 실패, 치명적 오류 메시지       |
| `cli`    | CLI 명령 시작/완료, CLI 실행 중 경고/오류      |
| `slow`   | 임계치 초과 요청의 메서드/경로/상태/latency/IP |

### 로테이션/보관 동작 주의사항

| 항목           | 설명                                                          |
| -------------- | ------------------------------------------------------------- |
| 회전 트리거    | 쓰기 시점에 파일 크기 확인 후 회전                            |
| 보관 개수/기간 | `max_backups`, `max_age_days` 기준으로 오래된 백업 정리       |
| 압축           | `compress=true`일 때 회전된 백업 파일을 압축                  |
| 적용 위치      | 웹 서버(`access/error/slow`)와 CLI(`cli`) 모두 동일 옵션 사용 |

### 예시 (운영 기본)

| 채널                 | 권장값 |
| -------------------- | ------ |
| `level`              | `INFO` |
| `access.max_size_mb` | `100`  |
| `error.max_age_days` | `30`   |
| `slow.threshold_ms`  | `1000` |

로그 레벨 동작 요약:

| 레벨  | 동작                                                                      |
| ----- | ------------------------------------------------------------------------- |
| DEBUG | 기본 access 로그 + 요청 상세 로그(헤더/쿼리/경로 파라미터, 민감값 마스킹) |
| INFO  | 기본 access 로그 + 시스템 정보 로그                                       |
| WARN  | 경고/오류 중심 로그                                                       |
| ERROR | 오류 로그만 출력                                                          |
