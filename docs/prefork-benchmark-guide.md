# Prefork 벤치마크 가이드

Prefork on/off 및 프로세스 수(`prefork_processes`)에 따른 성능 차이를 측정하기 위한 운영 벤치 시나리오입니다.

---

## 1. 목적

- 현재 워크로드에서 Prefork가 실제로 효과가 있는지 검증
- 최적의 `prefork` / `prefork_processes` 값을 결정
- CPU, 지연시간, DB 커넥션 사용량의 trade-off 확인

---

## 2. 전제 조건

- 서버는 동일한 코드/데이터 상태로 실행
- DB는 동일 환경(같은 인스턴스/같은 데이터량)
- 테스트 중 외부 부하 최소화
- JWT 로그인 가능한 계정 준비

권장: 각 케이스 2~3회 반복 후 중앙값 사용

---

## 3. 비교 시나리오

`configs/server.json`의 두 값으로 조합 테스트:

- `prefork=false` (baseline)
- `prefork=true, prefork_processes=2`
- `prefork=true, prefork_processes=4`
- `prefork=true, prefork_processes=8` (서버 코어 수 이하 권장)

> `prefork_processes=0`은 런타임 기본값을 사용합니다.

---

## 4. 측정 API 세트

혼합 부하를 권장합니다.

1. 로그인: `POST /v1/auth/login`
2. 목록 조회: `GET /v1/entity/user/list?page=1&limit=20`
3. 단건 조회: `GET /v1/entity/user/1`
4. 메타 조회: `GET /v1/entity/user/meta`

관리 API가 필요하면 별도 케이스로 분리 측정하세요.

---

## 5. 측정 지표

필수 지표:

- Throughput (RPS)
- Latency p50/p95/p99
- Error rate (4xx/5xx)
- CPU 사용률 (전체/코어별)
- Memory RSS
- DB open/idle connection 수

권장 판정 기준:

- p95 개선 + 에러율 유지 + DB 커넥션 폭증 없음

---

## 6. 실행 절차

### Step 1) 서버 설정 적용

`configs/server.json`에서 케이스별로 값 변경:

```json
{
    "prefork": true,
    "prefork_processes": 4
}
```

### Step 2) 서버 실행

```bash
cd /home/ehfuse/entity-server-src/scripts
./run.sh dev
```

### Step 3) 토큰 발급

```bash
TOKEN=$(curl -s -X POST http://localhost:47200/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin1@codeshop.kr","passwd":"admin12345"}' \
  | jq -r '.data.access_token')
```

### Step 4) 부하 실행 (예: hey)

```bash
hey -n 5000 -c 100 -H "Authorization: Bearer $TOKEN" \
  http://localhost:47200/v1/entity/user/list?page=1\&limit=20
```

로그인 API 측정 예시:

```bash
hey -n 2000 -c 50 -m POST -H "Content-Type: application/json" \
  -d '{"email":"admin1@codeshop.kr","passwd":"admin12345"}' \
  http://localhost:47200/v1/auth/login
```

### Step 5) 시스템 지표 수집

예시:

```bash
# CPU/메모리
pidstat -rud -p ALL 1 30

# 프로세스 확인
ps -ef | grep entity-server | grep -v grep
```

---

## 7. 결과 기록 템플릿

| Case | prefork | processes | RPS | p95(ms) | p99(ms) | Error% | CPU% | RSS(MB) | 비고     |
| ---- | ------- | --------- | --- | ------- | ------- | ------ | ---- | ------- | -------- |
| A    | false   | -         |     |         |         |        |      |         | baseline |
| B    | true    | 2         |     |         |         |        |      |         |          |
| C    | true    | 4         |     |         |         |        |      |         |          |
| D    | true    | 8         |     |         |         |        |      |         |          |

---

## 8. 해석 가이드

- DB 대기 시간이 큰 경우: Prefork 효과가 제한적일 수 있음
- CPU 바운드가 강한 경우: Prefork + 적정 process 수에서 개선 가능
- process 수를 과도하게 늘리면:
    - 컨텍스트 스위칭 증가
    - DB 커넥션 경쟁 증가
    - 오히려 p99 악화 가능

---

## 9. 운영 권장안

1. baseline(`prefork=false`) 먼저 측정
2. 코어 수 절반/동일 수준으로 단계 증가(2→4→8)
3. p95/에러율/DB 커넥션이 가장 안정적인 지점 채택
4. 채택값을 `server.json`에 고정하고 운영 문서에 기록
