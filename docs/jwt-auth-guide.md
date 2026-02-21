# JWT 인증 운영 가이드

> 대상: 운영/인프라/SRE/온콜 엔지니어  
> 범위: JWT 인증 구조, 역할(RBAC), 엔드포인트, 운영 사용법

---

## 1. 개요

Entity Server 인증은 2계층으로 동작합니다.

- 서비스 간 호출: `API Key + HMAC`
- 사용자 인증: `JWT (Bearer)`

요청 우선순위는 다음과 같습니다.

1. `X-API-Key`가 있으면 API Key 인증 흐름 우선
2. API Key가 없고 `Authorization: Bearer`가 있으면 JWT 인증
3. 둘 다 없으면 `401 Unauthorized`

---

## 2. 인증 구조

미들웨어 처리 순서:

1. `recover`
2. `CORS`
3. `TransactionID`
4. Request/Slow logging
5. `HMAC` (활성화 시)
6. `Auth Middleware` (JWT + API Key 분기)
7. `RBAC Middleware`
8. Handler

JWT 인증 성공 시 request locals에 아래 값이 저장됩니다.

- `user_seq`
- `rbac_role`
- `auth_method=jwt`
- `jwt_email`
- `jwt_name`
- `jwt_license_seq`

---

## 3. 역할(RBAC) 체계

JWT의 `rbac_role` 클레임이 `configs/security.json`의 role로 매핑됩니다.

`user` 엔티티에는 역할 관련 필드가 2개 있을 수 있습니다.

- `role`: 비즈니스/업무 구분용 사용자 정의 역할
- `rbac_role`: RBAC 권한 판단용 역할 (인증/인가에서 사용)

중요 정책:

- 로그인/JWT/RBAC는 `role`이 아니라 `rbac_role`만 사용합니다.
- `rbac_role`이 비어 있으면 인증/인가를 통과하지 않습니다.
- `reset_defaults`의 사용자 데이터에도 `rbac_role`을 명시해야 합니다.

예시:

- JWT: `rbac_role=editor`
- RBAC: `roles.editor.permissions` 사용

주요 역할:

- `admin`: 전체 권한 (`*`)
- `editor`: CRUD + history + rollback
- `viewer`: 조회 중심
- `auditor`: 조회 + history + stats
- `user`: meta/read/list/count

운영 체크 포인트:

- role 변경 후 `403` 급증 여부 확인
- `security.json` 배포 이력과 장애 시점 비교

---

## 4. JWT 설정

파일: `configs/jwt.json`

```json
{
    "secret": "${JWT_SECRET}",
    "access_ttl_sec": 3600,
    "refresh_ttl_sec": 1209600,
    "issuer": "entity-server",
    "algorithm": "HS256"
}
```

환경변수 우선순위:

- `JWT_SECRET`

우선순위 규칙: `JWT_SECRET(환경변수) > jwt.json > 기본값`

JWT 활성화 조건:

- `jwt.json` 존재
- 최종 `secret` 값이 비어있지 않음
- `user` 엔티티 설정 파일 존재
- `user.index`에 `email`, `rbac_role` 필드 정의

기동 방어 정책:

- 위 전제조건이 충족되지 않으면 서버는 JWT를 활성화하지 않고 시작 실패(`fatal`)합니다.

---

## 5. 토큰 스펙

### Access Token

필수 클레임:

- `sub`: user seq
- `iss`: issuer
- `iat`, `exp`
- `email`, `name`, `rbac_role`, `license_seq`

기본 만료:

- `3600초` (1시간)

### Refresh Token

필수 클레임:

- `sub`
- `jti`
- `iss`
- `iat`, `exp`

기본 만료:

- `1209600초` (14일)

---

## 6. 인증 엔드포인트

기본 prefix: `/v1/auth`

### 6.1 POST `/v1/auth/login`

설명: 이메일/비밀번호 로그인 후 access+refresh 발급

요청:

```json
{
    "email": "admin1@codeshop.kr",
    "passwd": "admin1234"
}
```

정상 응답:

```json
{
    "ok": true,
    "data": {
        "access_token": "...",
        "refresh_token": "...",
        "expires_in": 3600
    }
}
```

오류 코드:

- `400`: 입력 누락/형식 오류
- `401`: 계정 없음 또는 비밀번호 불일치
- `403`: 비활성 계정
- `403`: `rbac_role` 미설정 계정

### 6.2 POST `/v1/auth/refresh`

설명: refresh token으로 access token 재발급

요청:

```json
{
    "refresh_token": "..."
}
```

정상 응답:

```json
{
    "ok": true,
    "data": {
        "access_token": "...",
        "expires_in": 3600
    }
}
```

오류 코드:

- `400`: token 누락
- `401`: 만료/변조/취소(revoked)/사용자 조회 실패

### 6.3 POST `/v1/auth/logout`

설명: refresh token의 `jti`를 revoke 처리

요청:

```json
{
    "refresh_token": "..."
}
```

정상 응답:

```json
{
    "ok": true,
    "message": "Logged out"
}
```

### 6.4 GET `/v1/auth/me`

설명: 현재 JWT 사용자 정보 조회

헤더:

- `Authorization: Bearer <access_token>`

오류 코드:

- `401`: 토큰 누락/만료/무효
- `404`: 사용자 미존재

---

## 7. 운영 사용법 (실무 절차)

### 7.1 서버 기동 전

1. `.env` 또는 secret manager에 `JWT_SECRET` 설정
2. `configs/jwt.json` 값 검토 (TTL/issuer)
3. `security.json` role/permission 검토

### 7.2 기동 후 점검

1. `/v1/health` 확인
2. `/v1/auth/login`으로 토큰 발급 확인
3. 발급 토큰으로 `/v1/auth/me` 확인
4. `/v1/auth/refresh` 재발급 확인
5. `/v1/auth/logout` 후 동일 refresh 재사용 차단 확인

### 7.3 curl 예시

```bash
# login
curl -s -X POST http://localhost:8080/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin1@codeshop.kr","passwd":"admin1234"}'

# me
TOKEN="<access_token>"
curl -s http://localhost:8080/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"

# refresh
REFRESH="<refresh_token>"
curl -s -X POST http://localhost:8080/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}"

# logout
curl -s -X POST http://localhost:8080/v1/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}"
```

---

## 8. 장애 대응

### 증상 0: 서버가 JWT 전제조건 오류로 기동 실패

로그 예시:

- `JWT configuration prerequisite failed: ...`

점검:

- `entities/Auth/account.json` 존재 여부
- `account.index`에 `email`, `rbac_role` 포함 여부

조치:

- `./scripts/normalize-entities.sh --apply` 실행 (`account.json`, `user.json` 자동 생성)
- `account.json` 검토 후 서버 재기동

### 증상 A: 보호 API가 전부 `401`

점검:

- 인스턴스별 `JWT_SECRET` 불일치
- TTL 오설정 (너무 짧음)
- Authorization 헤더 전달 누락

조치:

- secret 일치화 후 롤링 재배포
- 클라이언트 토큰 재발급 유도

### 증상 B: `refresh`만 `401`

점검:

- refresh 만료
- logout 후 재사용
- 토큰 서명 키 변경 이력

조치:

- 재로그인 안내
- 키 회전 절차 점검

### 증상 C: 특정 role만 `403` 증가

점검:

- `security.json` role 권한 변경 여부
- `user.rbac_role` 데이터 정합성

조치:

- role 정책 롤백 또는 데이터 정정

---

## 9. 보안 운영 원칙

- 운영 환경 HTTPS 필수
- 토큰 원문 로그 저장 금지
- `JWT_SECRET` 정기 회전
- 최소 권한(Role) 원칙 유지
- 장애 시 원인 분석 전 임시 광범위 권한 부여 금지

---

## 10. 제한사항 및 개선 권장

현재 revoke 목록은 인메모리 기반입니다.

- 서버 재시작 시 revoke 상태 소실
- 멀티 인스턴스 간 revoke 공유 불가

운영 고도화 권장:

- revoke 저장소를 Redis 등 외부 스토어로 이전
- 인증 실패율, 401/403 비율을 대시보드/알람으로 상시 관제

---

## 11. 빠른 점검 체크리스트

- [ ] `JWT auth enabled` 로그 확인
- [ ] `/auth/login` 200 확인
- [ ] `/auth/me` 200 확인
- [ ] `/auth/refresh` 200 확인
- [ ] `/auth/logout` 후 재사용 차단 확인
- [ ] 401/403 비율 정상 범위 확인
