# Operations Playbook (운영 플레이북)

## 초기 배포

1. `configs/database.json` 설정
2. `.env` 설정 (`ENCRYPTION_KEY` 필수)
3. `npm install -g entity-server` 설치 (postinstall이 자동으로 바이너리 다운로드)
4. `entity-cli reset-all --apply`로 초기 엔티티/시드 생성

## 주기 운영 커맨드

- 스크립트 옵션/전체 사용법: [Scripts Guide](scripts-guide.md)
- `백필(backfill)`은 이미 저장된 기존 데이터를 다시 읽어서, 누락된 인덱스/파생 데이터를 채워 넣는 작업입니다.

| 작업                 | 명령                                                      |
| -------------------- | --------------------------------------------------------- |
| 전체 재초기화        | `entity-cli reset-all --force`                            |
| 단일 엔티티 재생성   | `entity-cli init-entity --entity=account --reset --apply` |
| 인덱스 전체 동기화   | `./scripts/sync.sh --all --apply`                         |
| 인덱스 + 데이터 백필 | `./scripts/sync.sh --all --apply --with-data`             |
| 히스토리 정리        | `entity-cli cleanup-history --apply`                      |
| 엔티티 JSON 정규화   | `./scripts/normalize-entities.sh --apply`                 |

## 장애 대응 체크리스트

| 증상                  | 점검                                              |
| --------------------- | ------------------------------------------------- |
| 조회 누락/조건 불일치 | `sync.sh --with-data`로 인덱스/검색용 데이터 백필 |
| 히스토리 과적재       | `cleanup-history.sh` 실행 + `history_ttl` 점검    |
| 암복호화 오류         | `ENCRYPTION_KEY`/license secret_key 정합성 확인   |
| 성능 저하             | index 필드 재검토, cache 설정 확인                |

## 안전 수칙

- 운영에서 `reset-all --force`는 백업 후에만 사용
- `with-data`는 데이터량이 크면 배치 윈도우에서 실행
- 문서화되지 않은 임의 SQL 수정보다 `sync.sh` 우선
