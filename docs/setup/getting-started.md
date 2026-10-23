# 시작하기

> 배포용 문서 전체 흐름은 [문서 목록](../README.md)에서 확인하세요.

## 빠른 시작 체크리스트

<a id="4-환경변수-비밀값배포별-값"></a>

| #   | 단계                 | 설명                                                        | 참고 문서                                                                                   |
| --- | -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | **아키텍처 이해**    | 시스템 구성, 데이터 모델, 클라이언트 연동 패턴 파악         | [아키텍처](../intro/architecture-deployment.md)                                             |
| 2   | **설치**             | `npm create entity-server@latest`으로 프로젝트 폴더 생성    | [아래 §2](#2-설치)                                                                          |
| 3   | **configs 설정**     | DB·서버·보안·캐시 설정 파일 구성                            | [Config Guide](config-guide.md)                                                             |
| 4   | **환경변수 생성**    | `ENCRYPTION_KEY`, `JWT_SECRET` 자동 생성 후 `.env` 저장     | [아래 §4](#4-환경변수-비밀값배포별-값)                                                      |
| 5   | **entities 설정**    | 도메인 엔티티 JSON 파일 작성                                | [Entity Config Guide](../data/entity-config-guide.md)                                       |
| 6   | **reset-all 초기화** | 전체 테이블 생성 + 기본 데이터 시드                         | [Scripts Guide](../operations/scripts-guide.md)                                             |
| 7   | **DB 확인**          | 테이블·데이터 정상 생성 여부 확인                           | [Operations Playbook](../operations/operations-playbook.md)                                 |
| 8   | **관리자 웹 접속**   | Admin Web UI 실행 및 접속 후 엔티티 관리                    | [아래 §7](#admin-web-setup)                                                                 |
| 9   | **인증 설정**        | JWT / HMAC / RBAC 설정 및 인증 흐름 확인                    | [Auth Guide](../security/auth-guide.md) · [Security](../security/security.md)               |
| 10  | **API 목록**         | 엔티티 CRUD·조회·필터 API 엔드포인트 확인                   | [엔티티 라우트](../api-routes/entity-routes.md) · [API 라우트](../api-routes/api-routes.md) |
| 11  | **조인 방법**        | 엔티티 간 관계 및 join 쿼리 패턴                            | [조인 가이드](../api-routes/join-routes.md)                                                 |
| 12  | **버전 업데이트**    | `./scripts/update-server.sh` 로 바이너리+배포 파일 업데이트 | [아래 §8](#8-버전-업데이트)                                                                 |
| 13  | **운영 플레이북**    | 배포·점검·장애 대응 절차                                    | [Operations Playbook](../operations/operations-playbook.md)                                 |
| 14  | **스크립트 가이드**  | 전체 CLI 스크립트 옵션 및 사용 예제                         | [Scripts Guide](../operations/scripts-guide.md)                                             |

## 1) 요구사항

| 항목           | 내용                                                                        |
| -------------- | --------------------------------------------------------------------------- |
| **OS**         | Linux / macOS / Windows                                                     |
| **Node.js**    | 18 이상 (`npm create entity-server` 사용 시에만 필요, 서버 실행에는 불필요) |
| **DB (SQL)**   | MySQL 8+, MariaDB 10.x+, TiDB, PostgreSQL 14+, SQLite 3, SQL Server         |
| **DB (NoSQL)** | MongoDB, DynamoDB, Firestore, ScyllaDB, CouchDB (DataStore로 선택 지원)     |
| **포트**       | 제공되는 `configs/server.json` 템플릿은 `47200` — 방화벽 허용 또는 변경. 설정에 `port`가 없으면 코드 기본값 `3400` 사용 |
| **메모리**     | 최소 128MB, 권장 512MB 이상 (엔티티/트래픽 규모에 따라 상이)                |
| **아키텍처**   | amd64 (x86_64) / arm64 바이너리 제공                                        |

## 2) 설치

### 권장: 프로젝트 폴더 생성 방식 (create-vite·CRA와 동일)

```bash
npm create entity-server@latest my-api
```

명령 실행 즉시 `./my-api/` 폴더가 생성되고 다음이 모두 준비됩니다.

```
my-api/
├── entity-server        ← 서버 바이너리 (자동 다운로드)
├── entity-cli           ← CLI 도구
├── .env.example         ← 환경 변수 예시 템플릿
├── .env                 ← 환경 변수 (바로 편집 가능)
├── configs/             ← CORS, JWT 등 서버 설정
├── entities/            ← 엔티티 스키마 (샘플 포함)
├── scripts/             ← 운영 스크립트
└── samples/             ← 샘플 파일
```

이후 cd만 하면 바로 운영할 수 있습니다. **하나의 서버에서 여러 프로젝트를 독립 운영할 때 이 방식을 사용하세요.**

```bash
cd my-api
nano .env        # ⚠️ 비밀값(ENCRYPTION_KEY, JWT_SECRET, DB_PASSWORD_*) 확인/수정
./entity-server  # 즉시 실행
```

> ⚠️ **설치 후 가장 먼저 해야 할 일**: `configs/server.json` 의 `port` 값을 변경하세요.
> 기본값 **47200** 은 다른 프로세스와 충돌하거나 방화벽에서 차단될 수 있습니다.
> 같은 머신에서 여러 인스턴스를 실행하려면 인스턴스마다 **서로 다른 포트**를 지정해야 합니다.
>
> ```json5
> // configs/server.json
> { port: 47200 } // ← 원하는 포트로 변경 (예: 47201, 8080, 9000 …)
> ```

> 특정 버전: `npm create entity-server@1.2.3 my-api`

## 3) 데이터베이스 설정

`configs/database.json`에서 기본 그룹을 지정합니다.

### MySQL 예시

```json
{
    "default": "development",
    "groups": {
        "development": {
            "driver": "mysql",
            "host": "127.0.0.1",
            "port": 3306,
            "database": "entity_server",
            "user": "root",
            "password": "${DB_PASSWORD_DEVELOPMENT}",
            "maxOpenConns": 20,
            "maxIdleConns": 10,
            "connMaxLifetimeSec": 3600
        }
    }
}
```

### SQLite 예시

```json
{
    "default": "development",
    "groups": {
        "development": {
            "driver": "sqlite",
            "database": "./writable/entity-server.sqlite",
            "maxOpenConns": 10,
            "maxIdleConns": 5,
            "connMaxLifetimeSec": 3600
        }
    }
}
```

### PostgreSQL 예시

```json
{
    "default": "development",
    "groups": {
        "development": {
            "driver": "postgres",
            "host": "127.0.0.1",
            "port": 5432,
            "database": "entity_server",
            "user": "postgres",
            "password": "${DB_PASSWORD_DEVELOPMENT}",
            "maxOpenConns": 20,
            "maxIdleConns": 10,
            "connMaxLifetimeSec": 3600
        }
    }
}
```

## 4) 환경변수 (비밀값/배포별 값)

### 자동 생성 (권장)

`ENCRYPTION_KEY`와 `JWT_SECRET`는 직접 입력하는 것보다 스크립트로 자동 생성하는 것을 권장합니다.

```bash
# Linux / macOS
./scripts/generate-env-keys.sh --apply   # 랜덤 값 생성 후 .env 에 바로 반영
./scripts/generate-env-keys.sh --create  # 복붙용 출력만 (직접 .env 에 붙여넣기)
```

```powershell
# Windows (PowerShell)
.\scripts\ps1\generate-env-keys.ps1 -Apply
.\scripts\ps1\generate-env-keys.ps1 -Create
```

> `--apply` 는 프로젝트 루트 `.env` 파일에 즉시 덮어씁니다.  
> 처음 설치 후 한 번 실행하면 이후 수동 편집 없이 바로 서버를 시작할 수 있습니다.

### `.env` 구조

```env
# 기본 암복호화 키 (32바이트, XChaCha20-Poly1305) — generate-env-keys 로 자동 생성
ENCRYPTION_KEY=change-this-to-32char-hex-string

# JWT 서명 키 (HS256) — generate-env-keys 로 자동 생성
JWT_SECRET=change-this-jwt-secret

# DB 비밀번호 (configs/database.json의 ${...} 패턴과 매핑)
DB_PASSWORD_DEVELOPMENT=your-dev-db-password
DB_PASSWORD_PRODUCTION=your-prod-db-password
```

일반 정책값(언어/서버 포트/모드, 보안 TTL, 로깅)은 `configs/*.json`에서 관리합니다.
비밀값(`ENCRYPTION_KEY`, `JWT_SECRET`, `DB_PASSWORD_*`)은 `.env` 또는 시스템 환경변수로 관리합니다.
API 키는 `.env`가 아니라 `api_keys` 엔티티(`entity-cli api-key`)로 등록·관리합니다.

### 환경변수 오버라이드 (configs/server.json·database.json 일부 값)

일부 설정값은 환경변수가 있으면 `configs/*.json` 값을 **덮어씁니다**(env 우선). 컨테이너·systemd 등에서 파일 수정 없이 포트/모드 등을 바꿀 때 유용합니다.

| 설정 (위치)                              | 환경변수 (우선순위 순)                | 비고                       |
| ---------------------------------------- | ------------------------------------- | -------------------------- |
| `port` (server.json)                     | `SERVER_PORT` → `PORT`                | 양의 정수일 때만 적용      |
| `environment` (server.json)              | `SERVER_ENVIRONMENT` → `ENVIRONMENT`  |                            |
| `namespace` (server.json)                | `SERVER_NAMESPACE` → `NAMESPACE`      |                            |
| `default_email_domain` (server.json)     | `DEFAULT_EMAIL_DOMAIN`                |                            |
| `default` 그룹 (database.json)           | `DB_GROUP` → `DATABASE_GROUP`         | 사용할 DB 그룹 선택        |

> 위 표에 없는 값은 환경변수로 덮어쓰지 않으며 `configs/*.json` 값이 그대로 사용됩니다.
> `run.sh` 도 포트 판별 시 `.env`/환경변수의 `SERVER_PORT`(없으면 `PORT`)를 먼저 참조합니다.

## 5) 빠른 실행

`configs/server.json`의 `environment`와 `configs/database.json`의 `default` 그룹을 확인한 뒤 서버를 시작합니다.

```bash
# 서버 시작
entity-server

# 백그라운드 실행 (nohup)
nohup entity-server >> logs/server.out.log 2>&1 &
```

환경별 실행 모드를 빠르게 바꾸려면 스크립트를 사용할 수 있습니다:

```bash
# Linux / macOS
./scripts/run.sh dev     # environment=development로 실행, database.default는 유지
./scripts/run.sh start   # environment=production으로 실행, production일 때만 database.default=production 적용
./scripts/run.sh stop    # 백그라운드 서버 중지
./scripts/run.sh status  # 상태 확인
```

```powershell
# Windows (PowerShell)
.\scripts\run.ps1 dev
.\scripts\run.ps1 start
.\scripts\run.ps1 stop
.\scripts\run.ps1 status
```

> `run.sh dev`는 현재 `configs/database.json`의 `default` 그룹을 그대로 사용합니다.
> `run.sh start`는 production 실행을 전제로 하며, `configs/database.json`에 `production` 그룹이 있을 때만 `default`를 `production`으로 맞춥니다.

## 6) 초기화/동기화

### 전체 초기화

```bash
# Linux / macOS
./scripts/reset-all.sh --dry-run   # 미리보기
./scripts/reset-all.sh --apply     # 확인 후 실행
./scripts/reset-all.sh --force     # 확인 없이 즉시 실행
```

```powershell
# Windows (PowerShell)
.\scripts\reset-all.ps1 -DryRun
.\scripts\reset-all.ps1 -Apply
.\scripts\reset-all.ps1 -Force
```

### 스키마 동기화

```bash
# Linux / macOS
./scripts/sync.sh --all --dry-run
./scripts/sync.sh --all --apply
```

> **Windows**: `sync.sh`는 Linux/macOS 전용입니다. `entity-cli sync-index --entity=<name> --apply`를 엔티티별로 직접 실행하세요.

### 엔티티별 초기화/비우기

```bash
# Linux / macOS

# 테이블 추가 (없으면 생성, 이미 있으면 그대로)
./scripts/entity.sh --entity=<name> --apply

# 테이블 드롭 후 재생성 (스키마 변경 시)
./scripts/entity.sh --entity=<name> --reset --apply

# 데이터 전체 삭제 + AUTO_INCREMENT 초기화
./scripts/entity.sh --entity=<name> --truncate --apply
```

```powershell
# Windows (PowerShell)
.\scripts\entity.ps1 --entity=<name> --apply
.\scripts\entity.ps1 --entity=<name> --reset --apply
.\scripts\entity.ps1 --entity=<name> --truncate --apply
```

<a id="admin-web-setup"></a>

## 7) 관리자 Web 실행 및 접속

Admin Web은 API 서버(`./scripts/run.sh dev`)가 실행 중일 때 접속할 수 있습니다.

```bash
cd admin-web
npm install
```

`admin-web/.env` 파일을 만들고 API 주소를 지정합니다.

```env
VITE_API_BASE_URL=http://localhost:47200
```

> entity-server 의 포트를 변경했다면 위 값도 동일하게 맞춰야 합니다.

개발 서버를 실행합니다.

```bash
npm run dev
```

브라우저에서 `http://localhost:5173`으로 접속해 로그인 후 관리자 기능을 사용합니다.

## 7-1) 클라이언트 SDK 연동 (`entity-client`)

React/브라우저 클라이언트는 공용 패키지 사용을 권장합니다.

```bash
npm install entity-client
```

```ts
import { entityServer } from "entity-client";
import { useEntityServer } from "entity-client/react";

entityServer.configure({
    baseUrl: import.meta.env.VITE_ENTITY_SERVER_URL,
});

// React Hook으로 사용 시
const client = useEntityServer({
    tokenResolver: () => localStorage.getItem("auth_access_token"),
});
```

```env
VITE_ENTITY_SERVER_URL=http://localhost:47200
```

## 8) 버전 업데이트

바이너리(`entity-server`, `entity-cli`)와 배포 파일(`scripts/`, `samples/`)을 업데이트합니다.  
`packages/` 디렉터리는 배포/업데이트 대상에 포함되지 않습니다.
사용자 설정(`configs/`, `entities/`)과 데이터는 건드리지 않습니다.

```bash
# Linux / macOS
./scripts/update-server.sh             # 도움말 + 현재 버전 + 최신 버전 확인
./scripts/update-server.sh latest      # 최신 버전으로 업데이트
./scripts/update-server.sh 1.5.0       # 특정 버전으로 업데이트
```

```powershell
# Windows (PowerShell)
.\scripts\update-server.ps1
.\scripts\update-server.ps1 latest
.\scripts\update-server.ps1 1.5.0
```

업데이트 후 서버를 재시작하면 적용됩니다.

## 9) 관련 문서

- [설정 가이드](config-guide.md)
- [데이터스토어 가이드 (비SQL 스토어)](datastore-guide.md)
- [타임존 목록 (IANA)](timezone-list.md)## 10) 다음 문서

- [엔티티 설정](../data/entity-config-guide.md)
- [스크립트](../operations/scripts-guide.md)
- [API 라우트](../api-routes/api-routes.md)
- [목록으로 돌아가기](../README.md)
