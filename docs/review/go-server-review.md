# Go 서버 코드 리뷰 보고서

> **최초 작성:** 2026-03-06  
> **2차 리뷰:** 2026-03-08  
> **3차 리뷰:** 2026-03-08  
> **범위:** `cmd/`, `internal/` 전체 Go 소스 코드  
> **검토 항목:** 설계 및 구조, 성능 및 효율, 보안, 코드 품질  
> **코드 검증:** 모든 항목은 실제 소스 코드 라인 대조 후 확인 완료

---

## 목차

1. [요약](#1-요약)
2. [이전 리뷰 수정 이력](#2-이전-리뷰-수정-이력)
3. [3차 리뷰 발견 항목](#3-3차-리뷰-발견-항목)
4. [종합 우선순위 매트릭스](#4-종합-우선순위-매트릭스)
5. [작업 이력](#5-작업-이력)

---

## 1. 요약

| 리뷰 차수 |   발견   | 수정 완료 |  보류   |
| :-------: | :------: | :-------: | :-----: |
|    1차    |   30건   |   30건    |   0건   |
|    2차    |   7건    |    7건    |   0건   |
|    3차    |   10건   |    6건    |   4건   |
| **합계**  | **47건** | **43건**  | **4건** |

### 아키텍처 개요 (양호한 점)

- ✅ 의존성 주입 — 전역 변수 없이 구조체 필드로 의존성 전달 (SMTP 서비스 포함)
- ✅ 다중 DB Dialect — MySQL/PostgreSQL/MSSQL/SQLite를 인터페이스로 추상화
- ✅ Context 전파 — 요청 스코핑과 graceful shutdown (`os/signal` + `syscall`)
- ✅ Hook 시스템 — 엔티티별 pre/post 훅으로 이벤트 기반 확장 + `filterHookData`로 PII 필터링
- ✅ 낙관적 잠금 — CAS 연산으로 동시성 충돌 방지
- ✅ 요청 캐시 — Fiber 요청 단위 `RequestCache`로 중복 DB 호출 제거
- ✅ RBAC 핫 리로드 — DB에서 역할·API키를 읽어 미들웨어 즉시 갱신
- ✅ 분산 기능 — Redis 기반 TxQueue, RateLimiter, NonceStore
- ✅ OrderBy 검증 — `AssertSafeIdentifier` + `searchableFields` 화이트리스트 이중 방어
- ✅ Hook write-back 안전 — `skipHooks=true`로 무한 루프 방지
- ✅ SQL 쿼리 안전 — 파라미터 바인딩(`?`) 일관 적용, `IsSafeSelectQuery` 멀티스테이트먼트/위험 키워드 차단
- ✅ Refresh Token Rotation — 단일 사용 보장 + JTI 즉시 취소
- ✅ HMAC 서명 검증 — 타임스탬프 + Nonce 재전송 방어 + 상수 시간 비교(`hmac.Equal`)
- ✅ 패킷 암호화 — `MaxBodyBytes` 크기 제한, XChaCha20-Poly1305 + 키 파생
- ✅ `RespondInternalError` — 500 에러 시 내부 구현 노출 방지

---

## 2. 이전 리뷰 수정 이력

### 1차 리뷰 (30건 → 30건 수정 완료)

| 카테고리  | ID 범위                    | 수정 내용 요약                                                      |
| --------- | -------------------------- | ------------------------------------------------------------------- |
| 설계      | S-01~S-07, S-14            | SRP 분리(4파일), 헬퍼 추출, HMACRateLimitConfig, configFileManager  |
| 성능      | P-01~P-05, P-11~P-14       | N+1 배치화, sido 캐시, SkipCount, MaxBodyBytes, Redis 설정 타임아웃 |
| 보안      | SEC-06, SEC-12~15          | RTR, CSRF 옵션, RespondInternalError, filterHookData                |
| 코드 품질 | Q-01~Q-03, Q-09, Q-15~Q-17 | 필드명 통일, 시그니처 정리, 상수화                                  |

### 2차 리뷰 (7건 → 7건 수정 완료)

| ID       | 항목                                       | 카테고리  | 파일                                   |
| -------- | ------------------------------------------ | --------- | -------------------------------------- |
| N-SEC-01 | skipHooks 파라미터 권한 제어 없음          | 보안      | internal/handler/entity_handler.go     |
| N-S-01   | globalSmtpService 전역 변수                | 설계      | internal/service/entity/smtp_hooks.go  |
| N-P-01   | recordAuditLog 매 호출마다 설정 파일 로드  | 성능      | internal/handler/entity_handler.go     |
| N-Q-01   | after_insert/after_update 에러 정책 비일관 | 코드 품질 | internal/service/entity/crud_submit.go |
| N-S-02   | 캐시 무효화 코드 반복                      | 설계      | internal/service/entity/crud_delete.go |
| N-S-03   | index_only/no_store 필터링 로직 중복       | 설계      | internal/service/entity/crud\_\*.go    |
| N-Q-02   | 히스토리 action 문자열 매직 상수           | 코드 품질 | internal/service/entity/               |

---

## 3. 3차 리뷰 발견 항목

### 🟠 High (조기 수정 권장) — 3건 ✅

#### ✅ R3-SEC-01. HMAC 서명 비교에 timing attack 취약점 (수정 완료)

**파일:** internal/security/hmac.go  
**심각도:** 🟠 High — 보안

HMAC 서명 검증에서 `!=` 연산자로 문자열을 직접 비교하고 있었습니다. 이는 일치하지 않는 첫 바이트 위치에 따라 비교 시간이 달라져 timing side-channel attack이 가능합니다.

**수정:** `hmac.Equal()` (상수 시간 비교)로 교체.

```go
// before
if signature != expected {

// after
if !hmac.Equal([]byte(signature), []byte(expected)) {
```

---

#### ✅ R3-SEC-02. recordDownloadLog goroutine에서 Fiber context 접근 — data race (수정 완료)

**파일:** internal/handler/file_handler.go (HandleDownload, HandleView)  
**심각도:** 🟠 High — 보안/안정성

`go fh.recordDownloadLog(c, meta, thumbSize)` — 핸들러 반환 후 Fiber가 `sync.Pool`로 context를 재활용하면, goroutine 내부의 `c.IP()`, `c.Get("User-Agent")`, `c.Locals()` 호출이 **다른 요청의 데이터를 읽는** data race가 발생합니다. 다른 사용자의 IP/UA가 다운로드 로그에 기록될 수 있습니다.

**수정:** `downloadLogContext` 구조체를 도입하여, goroutine 시작 전에 필요한 값을 미리 캡처.

```go
// 핸들러에서 캡처 후 goroutine 전달
dlCtx := captureDownloadLogContext(c)
go fh.recordDownloadLog(dlCtx, meta, thumbSize)
```

---

#### ✅ R3-SEC-03. OAuth 실패 리다이렉트 URL 인코딩 누락 (수정 완료)

**파일:** internal/handler/auth_handler.go (`oauthFailureRedirect`)  
**심각도:** 🟠 High — 보안

`error=` 파라미터에 메시지를 그대로 삽입하여 공백·특수문자가 URL을 손상시킬 수 있었습니다.

**수정:** `url.QueryEscape(message)` 적용.

```go
// before
return c.Redirect(ah.FailureRedirectURL+sep+"error="+message, ...)

// after
return c.Redirect(ah.FailureRedirectURL+sep+"error="+url.QueryEscape(message), ...)
```

---

### 🟡 Medium (계획적 개선) — 5건

#### ✅ R3-SEC-04. HandleMe 응답에 민감 필드 노출 (수정 완료)

**파일:** internal/handler/auth_handler.go (`HandleMe`)  
**심각도:** 🟡 Medium — 보안

`/v1/auth/me` 응답에서 `passwd`만 제거하고 `temp_password_hash`, `totp_secret`, `totp_recovery_codes` 등 민감 필드가 그대로 노출되었습니다.

**수정:** 민감 필드 목록을 확장하여 일괄 제거.

```go
for _, key := range []string{
    "passwd", "temp_password_hash", "temp_password_issued_time",
    "totp_secret", "totp_recovery_codes",
} {
    delete(user, key)
}
```

---

#### ✅ R3-LEAK-01. OAuthService.periodicStatePurge goroutine 누수 (수정 완료)

**파일:** internal/security/oauth.go  
**심각도:** 🟡 Medium — 리소스 누수

`periodicStatePurge` goroutine이 종료 메커니즘 없이 영원히 실행되었습니다. 서버 shutdown 시 goroutine이 누수됩니다.

**수정:** `stopCh` 채널을 추가하고 `select`로 종료 시그널 수신. `Close()` 메서드 추가.

---

#### ✅ R3-LEAK-02. MemoryRateLimiter.startCleanup goroutine 누수 (수정 완료)

**파일:** internal/security/rate_limiter.go  
**심각도:** 🟡 Medium — 리소스 누수

`startCleanup` goroutine도 동일하게 종료 메커니즘이 없었습니다.

**수정:** `stopCh` 채널 + `select` 패턴 + `Close()` 메서드 추가.

---

#### ⏸️ R3-PERF-01. getStorageUsage 배치 순회 성능 (보류)

**파일:** internal/handler/file_handler.go  
**심각도:** 🟡 Medium — 성능

`getStorageUsage`가 file_meta를 500건씩 순회하며 size를 합산합니다. SQL `SUM()` 집계가 효율적이지만, 현재 Entity Service 추상화가 집계 함수를 지원하지 않아 아키텍처 변경이 필요합니다.

**보류 사유:** Entity Service에 Aggregate API 추가가 선행되어야 함.

---

#### ⏸️ R3-DESIGN-01. 파일 조회 시 license_seq 격리 미적용 (보류)

**파일:** internal/handler/file_handler.go (HandleDownload, HandleFileDelete 등)  
**심각도:** 🟡 Medium — 설계

파일 다운로드/삭제 시 UUID만으로 조회하여 멀티테넌트 격리가 없습니다. 다만 UUID v4의 불투명성(2^122 엔트로피)에 의존하는 의도적 설계이며, 인증된 API에서만 접근 가능합니다.

**보류 사유:** 의도적 설계 판단. 멀티테넌트 강화 시 별도 작업으로 진행.

---

### 🟢 Low (여유 시 개선) — 2건

#### ⏸️ R3-SEC-05. SFTP 백엔드 ssh.InsecureIgnoreHostKey() (보류)

**파일:** internal/storage/sftp.go  
**심각도:** 🟢 Low — 보안

호스트 키 검증 없이 SFTP 연결을 수립합니다. 코드 주석에 이미 인식되어 있으며(`// 프로덕션에서는 known_hosts 사용 권장`), `known_hosts` 파일 경로 설정 기능 추가가 필요합니다.

**보류 사유:** 설정 스키마 확장 + known_hosts 파싱 로직이 필요하여 별도 작업.

---

#### ⏸️ R3-PERF-02. findByContentHash 100건 제한 (보류)

**파일:** internal/handler/file_handler.go  
**심각도:** 🟢 Low — 성능

content_hash가 암호화 필드에 있어 SQL 검색이 불가하여 클라이언트 사이드 매칭을 100건으로 제한합니다. 대량 파일 시 중복 감지가 누락될 수 있으나, dedup은 best-effort 설계입니다.

**보류 사유:** 의도적 제한. content_hash 전용 인덱스 컬럼 추가 시 해결 가능.

---

## 4. 종합 우선순위 매트릭스

### 🟠 High — 3건 ✅

| ID        | 항목                                  | 카테고리 | 파일                             | 상태         |
| --------- | ------------------------------------- | -------- | -------------------------------- | ------------ |
| R3-SEC-01 | HMAC 서명 timing attack 취약          | 보안     | internal/security/hmac.go        | ✅ 수정 완료 |
| R3-SEC-02 | recordDownloadLog goroutine data race | 보안     | internal/handler/file_handler.go | ✅ 수정 완료 |
| R3-SEC-03 | OAuth 리다이렉트 URL 인코딩 누락      | 보안     | internal/handler/auth_handler.go | ✅ 수정 완료 |

### 🟡 Medium — 5건 (3건 수정, 2건 보류)

| ID           | 항목                              | 카테고리    | 파일                              | 상태         |
| ------------ | --------------------------------- | ----------- | --------------------------------- | ------------ |
| R3-SEC-04    | HandleMe 민감 필드 노출           | 보안        | internal/handler/auth_handler.go  | ✅ 수정 완료 |
| R3-LEAK-01   | OAuthService goroutine 누수       | 리소스 누수 | internal/security/oauth.go        | ✅ 수정 완료 |
| R3-LEAK-02   | MemoryRateLimiter goroutine 누수  | 리소스 누수 | internal/security/rate_limiter.go | ✅ 수정 완료 |
| R3-PERF-01   | getStorageUsage 배치 순회         | 성능        | internal/handler/file_handler.go  | ⏸️ 보류      |
| R3-DESIGN-01 | 파일 조회 license_seq 격리 미적용 | 설계        | internal/handler/file_handler.go  | ⏸️ 보류      |

### 🟢 Low — 2건 (보류)

| ID         | 항목                         | 카테고리 | 파일                             | 상태    |
| ---------- | ---------------------------- | -------- | -------------------------------- | ------- |
| R3-SEC-05  | SFTP InsecureIgnoreHostKey   | 보안     | internal/storage/sftp.go         | ⏸️ 보류 |
| R3-PERF-02 | findByContentHash 100건 제한 | 성능     | internal/handler/file_handler.go | ⏸️ 보류 |

---

## 5. 작업 이력

| 날짜       | 작업 내용                                                                                      | 처리 건수 |
| ---------- | ---------------------------------------------------------------------------------------------- | --------: |
| 2026-03-06 | 초기 리뷰 보고서 작성                                                                          | 30건 발견 |
| 2026-03-06 | 1차 소스 코드 수정 (보안·성능·코드 품질)                                                       | 19건 수정 |
| 2026-03-06 | 2차 소스 코드 수정 (보안·성능·설계·코드 품질)                                                  | 13건 수정 |
| 2026-03-07 | S-01, S-02 리팩토링 — 함수 분리 + SRP 파일 분리 (4파일)                                        |  2건 수정 |
| 2026-03-07 | High 10건 수정 (S-03~S-07, P-01~P-03, SEC-12, Q-01)                                            | 10건 수정 |
| 2026-03-07 | Medium 14건 수정 (S-08~S-11, P-04~P-13, SEC-06, Q-02~Q-17)                                     | 14건 수정 |
| 2026-03-07 | Low 4건 수정 (S-14, P-14, SEC-14, SEC-15)                                                      |  4건 수정 |
| 2026-03-08 | **2차 전체 리뷰** — 이전 30건 수정 확인 + 신규 7건 발견                                        |  7건 발견 |
| 2026-03-08 | 2차 리뷰 7건 수정 — skipHooks 권한, DI 전환, 헬퍼 추출, 캐싱, 에러 정책, 상수화                |  7건 수정 |
| 2026-03-08 | **3차 전체 리뷰** — 10건 발견 (High 3 + Medium 5 + Low 2)                                      | 10건 발견 |
| 2026-03-08 | 3차 리뷰 6건 수정 — HMAC timing, goroutine data race, URL 인코딩, 민감 필드, goroutine 누수 x2 |  6건 수정 |

---

## 6. 남은 작업 요약

> **수정 완료:** 43건 / 47건  
> **보류:** 4건 (아키텍처 제약 2건, 의도적 설계 1건, 별도 작업 필요 1건)
