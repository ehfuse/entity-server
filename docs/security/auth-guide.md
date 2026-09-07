# 인증 가이드 (Auth Guide)

> 대상: 운영/인프라/SRE/온콜 엔지니어, 개발자  
> 범위: Entity Server의 인증 방식 — HMAC·JWT·RBAC

---

## 개요

Entity Server 인증은 2계층과 공통 권한 제어로 구성됩니다.

| 계층    | 방식                      | 대상              | 용도                                                      |
| ------- | ------------------------- | ----------------- | --------------------------------------------------------- |
| Layer 1 | **API Key + HMAC-SHA256** | 서비스/백엔드     | 서버 간 통신, 관리 API — 요청 무결성 + 타임스탬프 + Nonce |
| Layer 2 | **JWT (HS256)**           | 프론트엔드 사용자 | 이메일/비밀번호 로그인 → Access + Refresh 토큰 발급       |
| 공통    | **RBAC**                  | 모든 인증 방식    | 엔티티별 역할/권한 제한                                   |

요청 우선순위:

1. `X-API-Key` 헤더가 있으면 **HMAC/API Key 흐름** 우선
2. `Authorization: Bearer`가 있으면 **JWT 인증** 흐름
3. 둘 다 없으면 `401 Unauthorized`

---

## 미들웨어 처리 순서

```
Request
  → [1] recover (패닉 핸들러)
  → [2] CORS
  → [3] TransactionID 주입
  → [4] 요청/슬로우 로깅
  → [5] HMAC 미들웨어 (활성화 시)
  → [6] Auth 미들웨어 (JWT + API Key 분기)
  → [7] RBAC 미들웨어
  → Handler
  → [8] 패킷 암호화 (2xx 응답 XChaCha20-Poly1305)
```

---

## 1. API Key + HMAC 인증

### 1.1 개요

HMAC은 요청의 **인증**과 **무결성**을 동시에 보장합니다.  
내부 서비스 간 통신, 관리 API(`/v1/admin/`)에 사용합니다.

### 1.2 요청 헤더

| 헤더           | 설명                  | 예시                |
| -------------- | --------------------- | ------------------- |
| `X-API-Key`    | 발급된 API 키         | `ak_prod_xxxxxx`    |
| `X-Timestamp`  | UNIX 초 타임스탬프    | `1708000000`        |
| `X-Nonce`      | 일회용 값 (UUID 권장) | `f47ac10b-58cc-...` |
| `X-Signature`  | HMAC-SHA256 서명      | `a3f7...` (hex)     |
| `Content-Type` | `application/json`    | —                   |

### 1.3 서명 생성

```
HMAC_INPUT = <method>|<path>|<timestamp>|<nonce>|<body>
SIGNATURE  = HMAC-SHA256(<hmac_secret>, HMAC_INPUT)
```

- 구분자는 파이프(`|`)입니다.
- `body`: 요청 본문 원본 문자열 (없으면 빈 문자열). SHA-256 해시가 **아닙니다**.
- `hmac_secret`: API 키에 연결된 비밀 값 (`scripts/api-key.sh`로 관리)

### 1.4 설정

`configs/auth/security.json`:

```json
{
    "enable_hmac": true,
    "timestamp_skew_sec": 300,
    "nonce_ttl_sec": 300,
    "auth_fail_limit_per_min": 120,
    "auth_block_sec": 60,
    "nonce_store": {
        "driver": "redis",
        "redis_addr": "localhost:6379",
        "redis_prefix": "nonce:"
    }
}
```

### 1.5 API 키 관리

```bash
# 신규 API 키 발급
./scripts/api-key.sh add --role "editor"

# 목록 조회
./scripts/api-key.sh list

# 삭제
./scripts/api-key.sh delete --seq 1
```

---

## 2. JWT 인증 (이메일/비밀번호)

### 2.1 활성화 조건

- `configs/auth/jwt.json` 파일 존재
- `configs/auth/jwt.json`의 `enabled: true`
- `JWT_SECRET` 환경변수 설정
- `entities/System/Auth/account.json`에 `email` + `rbac_role` 인덱스 필드 존재

### 2.2 설정

파일: `configs/auth/jwt.json`

```json
{
    "enabled": true,
    "secret": "${JWT_SECRET}",
    "access_ttl_sec": 3600,
    "refresh_ttl_sec": 1209600,
    "issuer": "entity-server",
    "algorithm": "HS256"
}
```

| 필드              | 설명                         | 기본값          |
| ----------------- | ---------------------------- | --------------- |
| `enabled`         | JWT 인증 활성화 토글         | `true`          |
| `secret`          | HS256 서명 키 (`JWT_SECRET`) | (필수)          |
| `access_ttl_sec`  | Access 토큰 만료 (초)        | 3600 (1시간)    |
| `refresh_ttl_sec` | Refresh 토큰 만료 (초)       | 1209600 (14일)  |
| `issuer`          | JWT `iss` 클레임             | `entity-server` |

### 2.3 토큰 구조

**Access Token 클레임:**

| 클레임        | 설명                               |
| ------------- | ---------------------------------- |
| `sub`         | account seq (문자열)               |
| `email`       | 사용자 이메일                      |
| `name`        | 사용자 이름                        |
| `rbac_role`   | RBAC 역할 (admin/editor/viewer 등) |
| `license_seq` | 소속 라이선스 seq                  |
| `iat`, `exp`  | 발급/만료 시각                     |

**Refresh Token 클레임:** `sub`, `jti`, `iss`, `iat`, `exp`

### 2.4 엔드포인트

| 메서드 | 경로               | 설명                                 |
| ------ | ------------------ | ------------------------------------ |
| POST   | `/v1/auth/login`   | 이메일/비밀번호 로그인 → 토큰 발급   |
| POST   | `/v1/auth/refresh` | Refresh 토큰 → 새 Access 토큰 발급   |
| GET    | `/v1/health`       | 브라우저 쿠키 세션 부트스트랩/연장   |
| POST   | `/v1/auth/logout`  | 세션 revoke (session_id 블랙리스트 → access·refresh 동시 무효화) |
| GET    | `/v1/auth/me`      | 현재 인증 사용자 정보 조회           |

> **로그아웃 시 Access 토큰 즉시 무효화:** Access 토큰과 Refresh 토큰은 동일한 `session_id` 를 공유합니다. `/v1/auth/logout` 은 이 `session_id` 를 블랙리스트에 등록하므로, 같은 세션의 **Access 토큰도 만료(기본 1시간) 전에 즉시 거부**됩니다(이전에는 Refresh 토큰만 revoke 되어 Access 토큰이 만료까지 유효했습니다). Access·Refresh 검증 모두 `session_id` 블랙리스트를 확인합니다. (구버전 `session_id` 없는 토큰은 refresh `jti` 로 폴백.)

### 2.5 오류 코드

| 코드 | 엔드포인트 | 원인                                  |
| ---- | ---------- | ------------------------------------- |
| 400  | login      | 입력 누락 / 형식 오류                 |
| 401  | login      | 계정 없음 또는 비밀번호 불일치        |
| 403  | login      | 비활성 계정 또는 `rbac_role` 미설정   |
| 400  | refresh    | token 누락                            |
| 401  | refresh    | 만료 / 변조 / revoked / 사용자 미존재 |

### 2.6 curl 예시

```bash
# 로그인
curl -s -X POST http://localhost:8080/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","passwd":"secret"}'

# 사용자 정보 조회
TOKEN="<access_token>"
curl -s http://localhost:8080/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"

# 토큰 갱신
REFRESH="<refresh_token>"
curl -s -X POST http://localhost:8080/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}"

# 로그아웃
curl -s -X POST http://localhost:8080/v1/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}"
```

### 2.7 브라우저 직접 통신과 CSRF

브라우저가 Entity Server에 직접 접속하고 JWT를 쿠키로 저장하는 경우에는 CSRF 보호가 필요합니다.

- 쿠키 기반 JWT 요청에서만 CSRF 검사
- 기본 발급 경로: GET /v1/health
- 로그인/리프레시 응답도 CSRF 토큰 재발급 가능
- 브라우저 세션 연장은 /v1/auth/refresh 직접 호출보다 health 부트스트랩 권장
- 보호 헤더 기본값: X-CSRF-Token

상세 통신 흐름, 샘플 헤더, fetch와 curl 예제는 [CSRF 보호 가이드](csrf-guide.md)를 참고하세요.

### 2.8 운영 절차

**기동 전 체크:**

1. `.env` 또는 secret manager에 `JWT_SECRET` 설정
2. `configs/auth/jwt.json` TTL/issuer 검토
3. `configs/auth/security.json` role/permission 검토

**기동 후 점검:**

1. 로그에서 `JWT auth enabled` 확인
2. `/v1/auth/login`으로 토큰 발급 정상 확인
3. 발급 토큰으로 `/v1/auth/me` 확인
4. `/v1/auth/refresh` 재발급 확인
5. `/v1/auth/logout` 후 동일 refresh 재사용 차단 확인

**revoke 제한사항:**  
revoke 저장소는 기본적으로 인메모리입니다.

- 서버 재시작 시 revoke 상태 초기화
- 다중 인스턴스 간 revoke 공유 불가

운영 고도화 시 `configs/auth/security.json`의 `nonce_store`를 Redis로 변경하거나,  
revoke 저장소를 외부 스토어로 이전하는 것을 권장합니다.

---

## 3. RBAC (역할 기반 접근 제어)

### 4.1 개요

HMAC과 JWT는 동일한 RBAC 정책을 공유합니다.  
인증 성공 후 `rbac_role`이 `security.json`의 `roles` 맵에 매핑됩니다.

### 4.2 역할 매핑

| 역할      | 설명        | 핵심 권한                        |
| --------- | ----------- | -------------------------------- |
| `admin`   | 전체 관리자 | `*` (모든 권한)                  |
| `editor`  | 편집자      | CRUD + history + rollback        |
| `viewer`  | 조회자      | read/list/count/query            |
| `auditor` | 감사자      | read/list + history + stats      |
| `user`    | 일반 사용자 | meta/read/list/count — 쓰기 불가 |

> `role` vs `rbac_role`
>
> - `role`: 비즈니스 업무 구분용 (권한 판정에 사용 안 함)
> - `rbac_role`: 인증/인가 전용 — JWT 클레임, RBAC 판정에서 사용

### 4.3 JWT Locals (인증 성공 후 핸들러에서 사용 가능한 값)

| key               | 설명                     |
| ----------------- | ------------------------ |
| `account_seq`     | int64 — 사용자 seq       |
| `rbac_role`       | string — 역할            |
| `auth_method`     | `"jwt"` 또는 `"api_key"` |
| `jwt_email`       | 사용자 이메일            |
| `jwt_name`        | 사용자 이름              |
| `jwt_license_seq` | int64 — 라이선스 seq     |

---

## 4. 환경 변수 요약

| 환경 변수        | 필수 | 설명                                           |
| ---------------- | ---- | ---------------------------------------------- |
| `JWT_SECRET`     | ✅   | JWT HS256 서명 키                              |
| `ENCRYPTION_KEY` | ✅   | XChaCha20-Poly1305 데이터 암호화 키 (32바이트) |

---

## 5. 장애 대응

### JWT 서버가 기동 실패

```
JWT configuration prerequisite failed
```

원인: `entities/System/Auth/account.json` 미존재 또는 `index`에 `email`/`rbac_role` 누락  
조치: `./scripts/normalize-entities.sh --apply` 실행 후 재기동

### 모든 보호 API가 401

점검:

- `JWT_SECRET` 인스턴스 간 불일치
- Access Token 만료 (TTL 설정 확인)
- `Authorization: Bearer` 헤더 전달 여부

조치: secret 일치화 → 롤링 재배포, 클라이언트 토큰 재발급 유도

### Refresh 토큰만 401

점검:

- refresh 토큰 만료 (기본 14일)
- 로그아웃 후 동일 토큰 재사용
- 서버 재시작으로 인메모리 revoke 목록 초기화 후 키 회전 여부

조치: 재로그인 안내, 키 회전 절차 점검

### 특정 role만 403 증가

점검:

- `configs/auth/security.json` role 권한 변경 이력
- account 엔티티의 `rbac_role` 데이터 정합성

조치: role 정책 롤백 또는 데이터 정정

---

## 6. 보안 운영 원칙

- 운영 환경 HTTPS 필수
- 토큰 원문 로그 저장 금지
- `JWT_SECRET` 정기 회전
- 최소 권한(Role) 원칙 유지
- revoke 저장소는 Redis 외부 스토어 이전 권장 (인메모리는 재시작 시 초기화)

---

## 7. 빠른 점검 체크리스트

- [ ] `JWT auth enabled` 로그 확인
- [ ] `/v1/auth/login` 200 확인
- [ ] `/v1/auth/me` 200 확인
- [ ] `/v1/auth/refresh` 200 확인
- [ ] `/v1/auth/logout` 후 Refresh 재사용 차단 확인
- [ ] 401/403 비율 정상 범위 확인
- [ ] 다중 인스턴스 환경에서 revoke 공유 방식 확인 (Redis 권장)

---

## 8. 관련 문서

- [인증](auth-guide.md)
- [JWT 인증](jwt-auth-guide.md)
- [보안](security.md)
- [암호화](encryption-guide.md)

---

## 9. 다음 문서

- [설정](../setup/config-guide.md)
- [API 라우트](../api-routes/api-routes.md)
- [운영 플레이북](../operations/operations-playbook.md)
- [목록으로 돌아가기](../README.md)
