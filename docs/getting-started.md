# Getting Started (시작하기)

## 빠른 시작 체크리스트

| #   | 단계                 | 설명                                                     | 참고 문서                                                                                     |
| --- | -------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --- | --- | ----------------- | --------------------------------------------- | --------------------------- | --- | --- | ------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| 1   | **아키텍처 이해**    | 시스템 구성, 데이터 모델, 클라이언트 연동 패턴 파악      | [Architecture (운영)](architecture.md) · [Architecture (개발)](architecture.md) |
| 2   | **설치**             | `npm create entity-server@latest`으로 프로젝트 폴더 생성 | [아래 §2](#2-설치)                                                                            |
| 3   | **configs 설정**     | DB·서버·보안·캐시 설정 파일 구성, `.env` 작성            | [Config Guide](config-guide.md)                                                        |
| 4   | **entities 설정**    | 도메인 엔티티 JSON 파일 작성                             | [Entity Config Guide](entity-config-guide.md)                                          |
| 5   | **reset-all 초기화** | 전체 테이블 생성 + 기본 데이터 시드                      | [Scripts Guide](scripts-guide.md)                                                      |
| 6   | **DB 확인**          | 테이블·데이터 정상 생성 여부 확인                        | [Operations Playbook](operations-playbook.md)                                          |
| 7   | **관리자 웹 접속**   | Admin Web UI 실행 및 접속 후 엔티티 관리                 | [아래 §7](#admin-web-setup)                                                                   |     | 8   | **버전 업데이트** | `./scripts/update-server.sh` 로 바이너리 교체 | [아래 §8](#8-버전-업데이트) |     | 8   | **인증 설정** | JWT / HMAC API 키 발급 및 인증 흐름 확인 | [JWT Auth Guide](jwt-auth-guide.md) · [Security](security.md) |
| 9   | **API 목록**         | 엔티티 CRUD·조회·필터 API 엔드포인트 확인                | [Entity Routes](entity-routes.md) · [API Routes](api-routes.md)                               |
| 10  | **조인 방법**        | 엔티티 간 관계 및 join 쿼리 패턴                         | [Join Guide](join-guide.md)                                                            |
| 11  | **운영 플레이북**    | 배포·점검·장애 대응 절차                                 | [Operations Playbook](operations-playbook.md)                                          |
| 12  | **스크립트 가이드**  | 전체 CLI 스크립트 옵션 및 사용 예제                      | [Scripts Guide](scripts-guide.md)                                                      |

## 1) 요구사항

| 항목    | 최소                                   |
| ------- | -------------------------------------- |
| Node.js | 18 이상 (npm 사용 시)                  |
| DB      | MySQL/MariaDB, PostgreSQL, 또는 SQLite |
| OS      | Linux / macOS / Windows                |

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
├── .env                 ← 환경 변수 (바로 편집 가능)
├── configs/             ← CORS, JWT 등 서버 설정
├── entities/            ← 엔티티 스키마 (샘플 포함)
└── scripts/             ← 운영 스크립트
```

이후 cd만 하면 바로 운영할 수 있습니다. **하나의 서버에서 여러 프로젝트를 독립 운영할 때 이 방식을 사용하세요.**

```bash
cd my-api
nano .env        # ⚠️ 반드시 PORT 와 DB_PATH 를 먼저 수정하세요 (아래 §2 참고)
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

`.env` 기본 예시:

```env
# 기본 암복호화 키 (32자 16진수, 128bit AES-CTR)
ENCRYPTION_KEY=change-this-to-32char-hex-string

# JWT 서명 키 (HS256)
JWT_SECRET=change-this-jwt-secret

# DB 비밀번호 (configs/database.json의 ${...} 패턴과 매핑)
DB_PASSWORD_DEVELOPMENT=your-dev-db-password
DB_PASSWORD_PRODUCTION=your-prod-db-password
```

일반 정책값(언어/서버 포트/모드, 보안 TTL, 로깅)은 `configs/*.json`에서 관리합니다.
비밀값(`ENCRYPTION_KEY`, `JWT_SECRET`, `DB_PASSWORD_*`)은 `.env` 또는 시스템 환경변수로 관리합니다.
API 키는 `.env`가 아니라 `api_keys` 엔티티(`entity-cli api-key`)로 등록·관리합니다.

## 5) 빠른 실행

`configs/server.json`의 `environment` 와 `configs/database.json`의 `default` 그룹을 원하는 환경으로 설정한 뒤 서버를 시작합니다.

```bash
# 서버 시작
entity-server

# 백그라운드 실행 (nohup)
nohup entity-server >> logs/server.out.log 2>&1 &
```

환경별 config 전환이 필요하면 스크립트를 사용할 수 있습니다:

```bash
# Linux / macOS
./scripts/run.sh dev     # 개발 환경으로 configs 자동 패치 후 실행
./scripts/run.sh start   # 프로덕션 백그라운드 실행
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

## 8) 버전 업데이트

프로젝트 폴더 안의 바이너리만 교체합니다. 설정·데이터는 건드리지 않습니다.

```bash
# Linux / macOS
./scripts/update-server.sh version     # 현재 버전 + 최신 버전 확인
./scripts/update-server.sh latest      # 최신 버전으로 업데이트
./scripts/update-server.sh 1.5.0       # 특정 버전으로 업데이트
```

```powershell
# Windows (PowerShell)
.\scripts\update-server.ps1 version
.\scripts\update-server.ps1 latest
.\scripts\update-server.ps1 1.5.0
```

업데이트 후 서버를 재시작하면 적용됩니다.

## 9) 다음 문서

- [Config Guide](config-guide.md)
- [Entity Config Guide](entity-config-guide.md)
- [Operations Playbook](operations-playbook.md)
