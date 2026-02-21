# Scripts Guide (스크립트 가이드)

운영용 스크립트 요약 문서입니다.

## 전제 조건

| 항목      | 내용                                                                                        |
| --------- | ------------------------------------------------------------------------------------------- |
| 설치      | `npm create entity-server@latest my-api` — 설치 시 플랫폼 바이너리 자동 다운로드            |
| 언어 설정 | `.env`의 `LANGUAGE` (`ko`/`en`, 기본 `ko`)                                                  |
| 정책      | 스크립트는 바이너리를 자동 생성하지 않음 — 프로젝트 폴더 초기화 후 바이너리가 있어야 동작함 |

> **OS별 스크립트**: `scripts/` 폴더에는 설치 시 현재 OS에 맞는 파일만 복사됩니다.
> Linux/macOS → `.sh` 파일만, Windows → `.ps1` 파일만 존재합니다.

## 스크립트 한눈에 보기

모든 스크립트는 `` 폴더에 있으며, 프로젝트 루트에서 실행합니다.

| 스크립트                                           | 용도                                                        | 예시                                              |
| -------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| [`update-server`](#script-update)                  | 바이너리 버전 업데이트 (버전 확인 / 최신 / 특정 버전)       | `./update-server.sh latest`                       |
| [`run`](#script-run)                               | 서버 실행/중지/상태(dev/start/stop/status)                  | `./run.sh dev`                                    |
| [`entity`](#script-entity)                         | 단일 엔티티 add/reset/truncate                              | `./entity.sh --entity=account --truncate --apply` |
| [`generate-env-keys`](#script-generate-api-key)    | ENCRYPTION_KEY/JWT_SECRET 랜덤 값 생성                      | `./generate-env-keys.sh --create`                 |
| [`api-key`](#script-api-key)                       | API 키 DB 관리 (CLI 직접, 서버 불필요)                      | `./api-key.sh list`                               |
| [`rbac-role`](#script-rbac-role)                   | RBAC 역할 DB 관리 (CLI 직접, 서버 불필요)                   | `./rbac-role.sh list`                             |
| [`reset-all`](#script-reset-all)                   | 전체 엔티티 초기화 + 기본 데이터 시드                       | `./reset-all.sh --force`                          |
| [`cli`](#script-cli)                               | `entity-cli` 래퍼 실행                                      | `./cli.sh help`                                   |
| [`sync`](#script-sync)                             | 단일 엔티티 인덱스 스키마 동기화                            | `./sync.sh account --apply`                       |
| [`cleanup-history`](#script-cleanup-history)       | `history_ttl` 기준 이력 정리                                | `./cleanup-history.sh --apply`                    |
| [`normalize-entities`](#script-normalize-entities) | 엔티티 JSON 정규화 (기본값 제거/키 순서 + 필수 엔티티 생성) | `./normalize-entities.sh --apply`                 |
| [`install-systemd`](#script-install-systemd)       | systemd 서비스 등록/enable/start                            | `./install-systemd.sh`                            |
| [`remove-systemd`](#script-remove-systemd)         | systemd 서비스 stop/disable/remove                          | `./remove-systemd.sh`                             |

> **Windows**: `.sh` → `.ps1`로 확장자만 바꿔 실행합니다. 일부 플래그는 `--flag` → `-Flag` 형식으로 변경됩니다 (예: `./reset-all.ps1 -Force`).  
> `install-systemd`, `remove-systemd`는 Linux 전용입니다.

## 주요 사용 패턴

<a id="script-update"></a>

### -1) 바이너리 버전 업데이트 (`./update-server.sh` / `./update-server.ps1`)

프로젝트 폴더에서 실행하면 `entity-server` / `entity-cli` 바이너리를 GitHub Releases 에서 받아 교체합니다.

```bash
# Linux / macOS
./update-server.sh version        # 현재 버전 + 최신 버전 확인
./update-server.sh latest         # 최신 버전으로 업데이트
./update-server.sh 1.5.0          # 특정 버전으로 업데이트
```

```powershell
# Windows (PowerShell)
./update-server.ps1 version
./update-server.ps1 latest
./update-server.ps1 1.5.0
```

> **주의**: 업데이트 후 실행 중인 서버를 재시작해야 적용됩니다.
> `configs/`, `entities/`, `.env` 등 설정 파일은 변경되지 않습니다.

<a id="script-run"></a>

### 0) 서버 실행 (`./run.sh`)

| 모드     | 동작                                                                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev`    | `configs/server.json.environment=development`, `configs/database.json.default=development`로 강제 후 `bin/entity-server`를 포그라운드 실행                                                      |
| `start`  | `configs/server.json.environment=production`, `configs/database.json.default=production`로 강제 후 시작 배너(`bin/entity-server banner`)를 먼저 출력하고, `bin/entity-server`를 백그라운드 실행 |
| `stop`   | `./run.sh`가 관리하는 백그라운드 PID를 종료하고 pid 파일 정리                                                                                                                                   |
| `status` | 시작 배너를 출력하며, 저작권 위 라인에 `Status: RUNNING/STOPPED`를 삽입해 표시                                                                                                                  |

```bash
# Linux / macOS
./run.sh dev
./run.sh start
./run.sh stop
./run.sh status
```

```powershell
# Windows (PowerShell)
./run.ps1 dev
./run.ps1 start
./run.ps1 stop
./run.ps1 status
```

<a id="script-generate-api-key"></a>

### 0-1) 환경 키/시크릿 생성 (`./generate-env-keys.sh` / `./generate-env-keys.ps1`)

| 목적               | Linux / macOS                     | Windows (PowerShell)              |
| ------------------ | --------------------------------- | --------------------------------- |
| 도움말 출력(기본)  | `./generate-env-keys.sh`          | `./generate-env-keys.ps1`         |
| `.env` 복붙용 출력 | `./generate-env-keys.sh --create` | `./generate-env-keys.ps1 -Create` |
| `export` 형식 출력 | `./generate-env-keys.sh --export` | `./generate-env-keys.ps1 -Export` |
| `.env` 즉시 반영   | `./generate-env-keys.sh --apply`  | `./generate-env-keys.ps1 -Apply`  |

> 기본 실행은 도움말만 출력합니다. 실제 키 생성은 옵션(`--create`, `--export`, `--apply`)으로 실행합니다.

생성/반영되는 키:

- `ENCRYPTION_KEY`
- `JWT_SECRET`

> API 키(api_keys 엔티티)와 HMAC 시크릿은 `reset-all` 또는 `./api-key.sh add` 로 DB에서 관리합니다. `.env`에 하드코딩하지 않습니다.

<a id="script-api-key"></a>

### 0-2) API 키 DB 관리 (`./api-key.sh` / `./api-key.ps1`)

API 키와 HMAC 시크릿을 `api_keys` 엔티티(DB)에 직접 조작합니다. 서버가 실행 중이지 않아도 사용 가능합니다.

| 목적                    | Linux / macOS                                                            | Windows (PowerShell)                                       |
| ----------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 도움말(기본)            | `./api-key.sh`                                                           | `./api-key.ps1`                                            |
| 목록 조회               | `./api-key.sh list`                                                      | `./api-key.ps1 list`                                       |
| 목록 조회 (50건)        | `./api-key.sh list --limit=50`                                           | `./api-key.ps1 list --limit=50`                            |
| 상세 조회               | `./api-key.sh show --seq=1`                                              | `./api-key.ps1 show --seq=1`                               |
| 상세 조회 (시크릿 표시) | `./api-key.sh show --seq=1 --reveal-secret`                              | `./api-key.ps1 show --seq=1 --reveal-secret`               |
| admin 키 생성 (dry-run) | `./api-key.sh add --role=admin`                                          | `./api-key.ps1 add --role=admin`                           |
| admin 키 생성 (실행)    | `./api-key.sh add --role=admin --apply`                                  | `./api-key.ps1 add --role=admin --apply`                   |
| 뷰어 키 생성 (실행)     | `./api-key.sh add --role=viewer --entities='["user","product"]' --apply` | `./api-key.ps1 add --role=viewer --entities=[...] --apply` |
| 사용자 연결 키 생성     | `./api-key.sh add --role=admin --user-seq=1 --apply`                     | `./api-key.ps1 add --role=admin --user-seq=1 --apply`      |
| 키 삭제 (dry-run)       | `./api-key.sh delete --seq=3`                                            | `./api-key.ps1 delete --seq=3`                             |
| 키 삭제 (실행)          | `./api-key.sh delete --seq=3 --apply`                                    | `./api-key.ps1 delete --seq=3 --apply`                     |

> `add` 실행 시 `API_KEY`와 `API_HMAC_SECRET` 값이 터미널에 1회 출력됩니다. 반드시 저장하세요.

<a id="script-rbac-role"></a>

### 0-3) RBAC 역할 DB 관리 (`./rbac-role.sh` / `./rbac-role.ps1`)

RBAC 역할(권한 집합)을 `rbac_roles` 엔티티(DB)에 직접 조작합니다. 서버가 실행 중이지 않아도 사용 가능합니다.

| 목적                 | Linux / macOS                                                                | Windows (PowerShell)                                                |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 도움말(기본)         | `./rbac-role.sh`                                                             | `./rbac-role.ps1`                                                   |
| 목록 조회            | `./rbac-role.sh list`                                                        | `./rbac-role.ps1 list`                                              |
| 상세 조회 (seq)      | `./rbac-role.sh show --seq=1`                                                | `./rbac-role.ps1 show --seq=1`                                      |
| 상세 조회 (이름)     | `./rbac-role.sh show --name=admin`                                           | `./rbac-role.ps1 show --name=admin`                                 |
| 역할 추가 (dry-run)  | `./rbac-role.sh add --name=readonly --permissions='["entity:read"]'`         | `./rbac-role.ps1 add --name=readonly --permissions=[...]`           |
| 역할 추가 (실행)     | `./rbac-role.sh add --name=readonly --permissions='["entity:read"]' --apply` | `./rbac-role.ps1 add --name=readonly --permissions=[...] --apply`   |
| 전체 권한 역할 추가  | `./rbac-role.sh add --name=superadmin --permissions='["*"]' --apply`         | `./rbac-role.ps1 add --name=superadmin --permissions=["*"] --apply` |
| 이름으로 삭제 (실행) | `./rbac-role.sh delete --name=readonly --apply`                              | `./rbac-role.ps1 delete --name=readonly --apply`                    |
| seq로 삭제 (실행)    | `./rbac-role.sh delete --seq=5 --apply`                                      | `./rbac-role.ps1 delete --seq=5 --apply`                            |

> 기본 역할(`admin`, `editor`, `viewer`, `auditor`, `user`)은 `reset-all` 시 자동 시드됩니다.

<a id="script-entity"></a>

### 1) 단일 엔티티 관리 (`./entity.sh` / `./entity.ps1`)

| 작업                                    | Linux / macOS                                     | Windows (PowerShell)                               |
| --------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| 추가(없으면 생성)                       | `./entity.sh --entity=account --apply`            | `./entity.ps1 --entity=account --apply`            |
| 재생성(테이블 드롭 후 생성)             | `./entity.sh --entity=account --reset --apply`    | `./entity.ps1 --entity=account --reset --apply`    |
| truncate(데이터/인덱스/히스토리 비우기) | `./entity.sh --entity=account --truncate --apply` | `./entity.ps1 --entity=account --truncate --apply` |
| 도움말                                  | `./entity.sh`                                     | `./entity.ps1`                                     |

> `--reset` 과 `--truncate` 는 동시에 사용할 수 없습니다.

<a id="script-reset-all"></a>

### 2) 전체 초기화 (`./reset-all.sh` / `./reset-all.ps1`)

| 모드           | Linux / macOS              | Windows (PowerShell)      |
| -------------- | -------------------------- | ------------------------- |
| 미리보기       | `./reset-all.sh --dry-run` | `./reset-all.ps1 -DryRun` |
| 확인 후 실행   | `./reset-all.sh --apply`   | `./reset-all.ps1 -Apply`  |
| 확인 없이 실행 | `./reset-all.sh --force`   | `./reset-all.ps1 -Force`  |

> `--apply` / `--force` 실행 전 `./normalize-entities.sh --apply`를 자동 호출해 필수 엔티티(`api_keys`, `rbac_roles`, `account`, `user`)가 없으면 먼저 생성합니다.  
> 실행 결과 마지막에 `[summary] dropped=... created=... seeded_entities=... seeded_rows=...` 형식의 요약이 출력됩니다.  
> 엔티티별 시드 row 미리보기도 출력되며, 민감값(`passwd`, `secret_key`, `token`류)은 마스킹됩니다.

<a id="script-sync"></a>

### 3) 인덱스 동기화 (`./sync.sh` / `./sync.ps1`)

| 모드                   | Linux / macOS                        | Windows (PowerShell)               |
| ---------------------- | ------------------------------------ | ---------------------------------- |
| 도움말                 | `./sync.sh`                          | `./sync.ps1`                       |
| 미리보기               | `./sync.sh user --dry-run`           | `./sync.ps1 user`                  |
| 적용(기본: index-only) | `./sync.sh user --apply`             | `./sync.ps1 user -Apply`           |
| 적용 + 데이터 백필     | `./sync.sh user --apply --with-data` | `./sync.ps1 user -Apply -WithData` |
| 전체 엔티티 미리보기   | `./sync.sh --all --dry-run`          | `./sync.ps1 -All`                  |
| 전체 엔티티 적용       | `./sync.sh --all --apply`            | `./sync.ps1 -All -Apply`           |

> `--index-only` / `--with-data`를 생략하면 기본값은 `--index-only` 입니다.
> 실행 결과 마지막에 `[summary] target=... mode=... apply=... total=... success=... failed=...` 형식의 요약을 출력합니다.

<a id="script-cleanup-history"></a>

### 4) 히스토리 정리 (`./cleanup-history.sh` / `./cleanup-history.ps1`)

| 범위             | Linux / macOS                                   | Windows (PowerShell)                           |
| ---------------- | ----------------------------------------------- | ---------------------------------------------- |
| 도움말           | `./cleanup-history.sh`                          | `./cleanup-history.ps1`                        |
| 전체 엔티티 적용 | `./cleanup-history.sh --apply`                  | `./cleanup-history.ps1 -Apply`                 |
| 단일 엔티티 적용 | `./cleanup-history.sh --entity=account --apply` | `./cleanup-history.ps1 -Entity account -Apply` |

<a id="script-normalize-entities"></a>

### 5) 엔티티 JSON 정규화 (`./normalize-entities.sh` / `./normalize-entities.ps1`)

엔티티 JSON 파일에서 불필요한 기본값을 제거하고 키 순서를 정렬합니다.  
전체 모드(`--entity` 미지정)에서는 **필수 엔티티가 없으면 자동 생성**합니다 (`api_keys`, `rbac_roles` 항상 / `account`, `user` JWT 활성 시 — `account`는 `user.seq` FK 참조).  
JWT 활성 기준: `configs/jwt.json`이 존재하고 `JWT_SECRET` 환경변수가 설정된 경우. 미설정 시 2개만 생성됩니다.

| 모드                 | Linux / macOS                                      | Windows (PowerShell)                              |
| -------------------- | -------------------------------------------------- | ------------------------------------------------- |
| 도움말               | `./normalize-entities.sh`                          | `./normalize-entities.ps1`                        |
| 전체 적용            | `./normalize-entities.sh --apply`                  | `./normalize-entities.ps1 -Apply`                 |
| 단일 엔티티 미리보기 | `./normalize-entities.sh --entity=account`         | `./normalize-entities.ps1 -Entity account`        |
| 단일 엔티티 적용     | `./normalize-entities.sh --entity=account --apply` | `./normalize-entities.ps1 -Entity account -Apply` |

**정규화 규칙:**

| 규칙                          | 조건                                                             |
| ----------------------------- | ---------------------------------------------------------------- |
| `enabled: true` 제거          | 기본값 (생략 시 자동 true 처리)                                  |
| `hard_delete: false` 제거     | 기본값                                                           |
| `optimistic_lock: false` 제거 | 기본값                                                           |
| `optimistic_lock: true` 제거  | `global_optimistic_lock: true`와 중복                            |
| `license_scope: true` 제거    | `global_license_scope: true`와 중복                              |
| `cache.enabled: true` 제거    | cache 블록 내 기본값                                             |
| 최상위 키 순서 정규화         | `name → description → cache → index → types → ...`               |
| index 내부 키 순서 정규화     | `comment → type → default → required → nullable → unique → hash` |

**필수 엔티티 자동 생성 (전체 모드):**

| 엔티티       | 기본 생성 경로                  | 비고                                                    |
| ------------ | ------------------------------- | ------------------------------------------------------- |
| `api_keys`   | `entities/Auth/api_keys.json`   | 항상 필수, `reset-all` 시드에 필요                      |
| `rbac_roles` | `entities/Auth/rbac_roles.json` | 항상 필수, `reset-all` 시드에 필요 (기본 역할 5개 포함) |
| `account`    | `entities/Auth/account.json`    | JWT 활성 시 필수                                        |
| `user`       | `entities/User/user.json`       | JWT 활성 시 필수 (`account.user_seq → user.seq` FK)     |

> 파일이 이미 존재하면 생성하지 않습니다. `--entity` 지정 시 필수 엔티티 체크는 건너뜁니다.  
> `license_scope: false`는 명시적 비활성화이므로 `global_license_scope: true`인 경우에도 제거하지 않습니다.  
> 필수 엔티티 상세 설명 → [entity-config-guide.md — 필수 엔티티](entity-config-guide.md#필수-엔티티)

<a id="script-cli"></a>

### 6) CLI 래퍼 (`./cli.sh` / `./cli.ps1`)

| 항목        | Linux / macOS                                | Windows (PowerShell) |
| ----------- | -------------------------------------------- | -------------------- |
| 도움말 실행 | `./cli.sh help`                              | `./cli.ps1 help`     |
| 출력 표기   | `Usage: cli <command> [options]` 형태로 표시 | 동일                 |

<a id="script-install-systemd"></a>

### 7) systemd 등록 (`./install-systemd.sh`) — Linux 전용

| 항목           | 명령                                                 |
| -------------- | ---------------------------------------------------- |
| 실행 (기본)    | `./install-systemd.sh`                               |
| 옵션 직접 지정 | `./install-systemd.sh --user=<user> --group=<group>` |
| 시작 생략      | `./install-systemd.sh --no-start`                    |

> 인수 없이 실행하면 바로 인터랙티브 모드로 진입합니다.
> 서비스명은 `configs/server.json`의 `namespace`를 기준으로 자동 생성됩니다: `<namespace>-entity-server`

<a id="script-remove-systemd"></a>

### 8) systemd 제거 (`./remove-systemd.sh`) — Linux 전용

| 항목        | 명령                  |
| ----------- | --------------------- |
| 실행 (기본) | `./remove-systemd.sh` |

> 인수 없이 실행하면 바로 인터랙티브 모드로 진입합니다.
> 서비스가 등록되어 있지 않으면 안내 메시지와 함께 `./install-systemd.sh` 등록 명령을 출력합니다.
> 제거 완료 후 재등록 명령(`./install-systemd.sh`)을 안내합니다.
> 제거 대상 서비스명은 자동 계산됩니다: `<namespace>-entity-server`
