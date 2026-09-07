# ES 계정·라이선스 자동 주입 설계

## 개요

ES(Entity Server)는 쓰기 작업(Insert, Update, Delete)에서 `license_seq`, `created_by`, `updated_by` 를 자동으로 주입한다.
이 값들은 data BLOB 이 아닌 **data 테이블의 별도 DB 컬럼**에 저장된다.

---

## 인증 흐름

```
프런트 → AS(entity-app-server) → ES(entity-server)
```

1. **프런트 → AS**: Bearer JWT 토큰으로 인증.
2. **AS**: JWT 를 검증하여 `req.account` 를 구성하고, ES 요청 시 HMAC 클라이언트에 `X-Account-Seq` 헤더만 실어 보낸다. `X-License-Seq` 는 전달하지 않으며, Bearer JWT 도 ES 로 직접 전달하지 않는다.
3. **ES (JWT 경로)**: JWT 인증 미들웨어에서 `claims.Subject` → `account_seq`, `claims.LicenseSeq` → `jwt_license_seq` 를 `c.Locals()` 에 저장한다.
4. **ES (HMAC 경로)**: `X-Account-Seq` 헤더를 읽어 `account_seq` 를 설정하고, `AccountLicenseResolver` 콜백으로 `license_seq` 를 내부 조회하여 `jwt_license_seq` 에 설정한다.

---

## 필드별 주입 규칙

### license_seq

| 우선순위 | 출처 | 설명 |
|---------|------|------|
| 1 | JWT `jwt_license_seq` | JWT 클레임에 포함된 값 |
| 1 | HMAC `AccountLicenseResolver` | HMAC 경로에서 X-Account-Seq 기반 내부 조회 결과 (`jwt_license_seq` 에 설정) |
| 2 | 페이로드 내 `license_seq` | 인증 컨텍스트가 없는 내부 호출이 명시적으로 보낸 값 |
| — | 에러 | 위 모두 없으면 에러 반환 |

- `license_scope: true` 이거나 `HasLicenseSeqColumn()` 인 엔티티에만 적용.
- JWT/HMAC 경로에서 결정된 값이 있으면 페이로드 값은 무시된다.
- 요청 헤더의 `X-License-Seq` fallback 은 사용하지 않는다.

### created_by

- **항상** 인증 경로(JWT 또는 HMAC+X-Account-Seq)에서 추출한 `account_seq` (`currentAccountSeq`) 를 사용한다.
- 페이로드에 명시된 값이 있어도 **무시**된다.
- **Insert 시에만** 기록된다.
- **API 응답에 포함되지 않는다.** DB 컬럼에만 기록되는 내부 필드이다.

### updated_by

- **항상** 인증 경로(JWT 또는 HMAC+X-Account-Seq)에서 추출한 `account_seq` (`currentAccountSeq`) 를 사용한다.
- 페이로드에 명시된 값이 있어도 **무시**된다.
- **Insert, Update, Delete(soft)** 모두에서 갱신된다.
- **API 응답에 포함되지 않는다.** DB 컬럼에만 기록되는 내부 필드이다.

---

## 작업별 적용 범위

| 작업 | license_seq | created_by | updated_by |
|------|:-----------:|:----------:|:----------:|
| Submit (Insert) | ✅ | ✅ | ✅ |
| Update | ✅ | — | ✅ |
| Delete (Soft) | ✅ (WHERE절) | — | ✅ |
| Delete (Hard) | ✅ (WHERE절) | — | ✅ |
| CompareAndSwap | ✅ | — | ✅ |

---

## 내부 코드 경로

```
[요청] → middleware/auth.go
         [JWT 경로]
           JWT 파싱 → c.Locals("account_seq", accountSeq)
                      c.Locals("jwt_license_seq", claims.LicenseSeq)
         [HMAC 경로]
           X-Account-Seq 헤더 → c.Locals("account_seq", seq)
           AccountLicenseResolver(seq) → c.Locals("jwt_license_seq", licSeq)

       → handler/handler.go → setServiceContext()
         c.Locals("account_seq") → accountSeqPtr
         → Service.WithRequestContext(ctx, txID, accountSeqPtr)
           → clone.currentAccountSeq = accountSeqPtr

       → Service.Submit() / Update() / Delete()
         s.currentAccountSeq → INSERT created_by, updated_by
                              → UPDATE updated_by
                              → history changed_by
```

### 주요 파일

| 파일 | 역할 |
|------|------|
| `internal/middleware/auth.go` | JWT 파싱, HMAC X-Account-Seq 파싱, `c.Locals("account_seq")` 설정 |
| `internal/handler/handler.go` | `setServiceContext()` — Locals → Service 전달 |
| `internal/service/entity/service.go` | `currentAccountSeq` 필드, `WithRequestContext()` |
| `internal/service/entity/crud_submit.go` | INSERT — `created_by`, `updated_by` |
| `internal/service/entity/crud_update.go` | UPDATE — `updated_by` |
| `internal/service/entity/crud_delete.go` | DELETE(soft) — `updated_by` |
| `internal/service/entity/history.go` | history — `changed_by` |
| `internal/service/entity/license.go` | `resolveEffectiveLicenseSeq()` — license_seq 우선순위 |
| `cmd/setup_web.go` | `newAccountLicenseResolver()` — HMAC 경로 license_seq 내부 조회 (5분 TTL 캐시) |

---

## 특수 케이스

### 비로그인 요청 (스케줄러, 배치, guest)

- `req.account.seq` 가 없어 AS 에서 요청 전용 클라이언트가 만들어지지 않는다.
- `currentAccountSeq` 가 nil 이므로 `created_by`, `updated_by` 는 NULL 로 저장된다.
- `license_scope` 엔티티는 페이로드에 `license_seq` 를 직접 넣어야 한다. `X-License-Seq` fallback 은 사용하지 않는다.

### after_insert 훅 컨텍스트

- `currentAccountSeq` 가 있으면 훅의 `hookCtx.New["account_seq"]` 에 자동 주입된다.
- 이 값은 DB 에 저장되는 것이 아니라 훅 로직에서 참조용으로만 사용된다.

### 트랜잭션 큐

- `Register()` 시 `accountSeq` 를 함께 저장하고, `CommitPendingOps` 에서 일괄 적용한다.
