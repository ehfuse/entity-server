# Entity App Server — 서버 코드 리뷰 보고서

> **분석 대상**: `packages/entity-app-server/src/`  
> **분석 날짜**: 2025-07-17  
> **관련 문서**: Admin Web 리뷰 → [admin-web-review.md](admin-web-review.md)

---

## 목차

1. [요약 (Executive Summary)](#1-요약)
2. [설계 및 구조](#2-설계-및-구조)
3. [성능 및 효율](#3-성능-및-효율)
4. [보안](#4-보안)
5. [코드 품질](#5-코드-품질)
6. [권장 조치 우선순위](#6-권장-조치-우선순위)

---

## 1. 요약

| 카테고리         | 심각도  | 이슈 수 | 핵심 항목                                                                                |
| ---------------- | :-----: | :-----: | ---------------------------------------------------------------------------------------- |
| **보안**         | 🔴 높음 |    4    | CSP 비활성화, 에러 로그 민감정보, **인터셉터 authRequired 미적용**, **시크릿 최소 길이** |
| **설계 및 구조** | 🟡 중간 |    1    | `any` 타입 과다 사용 (fastify.d.ts 부분 해결)                                            |
| **코드 품질**    | 🟡 중간 |    2    | hooks 파라미터 타입, Database 인터페이스                                                 |
| **성능 및 효율** | 🟢 낮음 |    1    | rate-limit 단일 버킷                                                                     |

**전체 평가**: 서버 아키텍처(플러그인 자동 로드, 훅 인터셉터, 패킷 암호화, JWT 캐싱)는 잘 설계되어 있습니다. 주요 위험은 CSP 비활성화와 **인터셉터 라우트의 JWT 서명 미검증**(§4.6)입니다.

---

## 2. 설계 및 구조

### 2.1 `any` 타입 과다 사용

**파일**: `src/system/plugins/auth.ts`, `src/system/plugins/packet-encrypt.ts`, `src/system/hooks/runner.ts`, `src/system/config/database.ts`

```typescript
// auth.ts
req.user = jwt.decode(token) as any;        // L16
const user = jwt.verify(token, env.JWT_SECRET) as any;  // L41
const cached = await store.get<any>(cacheKey);  // L36

// packet-encrypt.ts
(req as any).rawBody = plaintext;           // L163
(req as any).body = JSON.parse(...);        // L164
(req as any)._packetKey = key;              // L166
```

`as any`는 타입 검사를 회피하므로 런타임 오류의 원인이 됩니다.

> **⚠️ 교차검증 결과**:
> `src/system/types/fastify.d.ts`에 이미 `user: UserInfo | null` 타입이 선언되어 있음.
> 따라서 auth.ts의 `as any`는 **불필요한 캐스팅**이며, 단순히 `as any`를 제거하면 됨 (새 타입 선언 불필요).
> 단, `rawBody`와 `_packetKey`는 fastify.d.ts에 **미정의**이므로 이 두 속성만 추가 필요.

> **권장**:
>
> ```typescript
> // auth.ts — as any 제거 (fastify.d.ts에 UserInfo 타입 이미 존재)
> req.user = jwt.decode(token) as UserInfo; // as any → as UserInfo
> const user = jwt.verify(token, env.JWT_SECRET) as UserInfo;
>
> // src/system/types/fastify.d.ts — rawBody, _packetKey만 추가
> declare module "fastify" {
>     interface FastifyRequest {
>         // user: UserInfo | null;  ← 이미 존재
>         rawBody?: Buffer;
>         _packetKey?: Buffer;
>     }
> }
> ```

---

## 3. 성능 및 효율

### 3.1 rate-limit 설정 단일 버킷

**파일**: `src/system/config/rate-limit.ts`

```typescript
export const rateLimitOptions = {
    max: 100,
    timeWindow: "1 minute",
};
```

모든 경로에 동일한 제한이 적용됩니다. 인증(`/api/v1/auth/login`) 경로는 훨씬 낮은 한도가 필요합니다. (단, 현재 프록시로 넘기므로 Go 서버에서도 처리 중일 수 있음 — 확인 필요)

> **⚠️ 교차검증 결과**:
> 인증 경로(`/api/v1/auth/*`)는 `@fastify/http-proxy`를 통해 Go Entity Server로 프록시됩니다.
> Go 서버에도 자체 rate-limit이 존재할 수 있으므로 이중 방어(defense in depth) 관점에서
> Fastify 레이어의 경로별 제한은 **권장 사항**이지 **필수는 아닙니다**.
> 다만 프록시 레이어에서 brute force를 조기 차단하면 Go 서버 부하를 줄일 수 있습니다.

> **권장**: 경로별 rate-limit 또는 적어도 전역 한도를 낮게 조정.

---

## 4. 보안

### 🔴 4.1 Content Security Policy 비활성화 (High)

**파일**: `src/system/config/security.ts`

```typescript
export const helmetOptions: FastifyHelmetOptions = {
    contentSecurityPolicy: false, // ← 비활성화
};
```

CSP 없이는 XSS 공격이 인라인 스크립트, 외부 스크립트 로드, `eval()` 등으로 자유롭게 실행됩니다.

> **권장**:
>
> ```typescript
> export const helmetOptions: FastifyHelmetOptions = {
>     contentSecurityPolicy: {
>         directives: {
>             defaultSrc: ["'self'"],
>             scriptSrc: ["'self'"],
>             styleSrc: ["'self'", "'unsafe-inline'"],
>             imgSrc: ["'self'", "data:", "https:"],
>             connectSrc: ["'self'"],
>             fontSrc: ["'self'"],
>             objectSrc: ["'none'"],
>             frameAncestors: ["'none'"],
>         },
>     },
> };
> ```
>
> (SPA 환경에서 `unsafe-inline` 등은 사용 중인 번들러에 맞게 조정 필요)

---

### 🟡 4.2 에러 로그 민감정보 필터링 (Medium)

**파일**: `src/system/plugins/error-handler.ts`

```typescript
logger.error(
    {
        requestId,
        method: req.method,
        url: req.url, // ← URL에 쿼리 파라미터 포함 가능
        statusCode,
        error: error.message, // ← 에러 메시지에 민감정보 포함 가능
        stack: statusCode >= 500 ? error.stack : undefined,
    },
    "Request error",
);
```

에러 메시지나 URL 쿼리스트링에 비밀번호, 토큰, 개인정보가 포함될 수 있습니다.

> **권장**:
>
> ```typescript
> function sanitizeUrl(url: string): string {
>     try {
>         const parsed = new URL(url, "http://localhost");
>         // 민감 파라미터 마스킹
>         for (const key of ["token", "password", "secret", "key"]) {
>             if (parsed.searchParams.has(key)) {
>                 parsed.searchParams.set(key, "[REDACTED]");
>             }
>         }
>         return parsed.pathname + parsed.search;
>     } catch {
>         return url;
>     }
> }
>
> // stack trace는 프로덕션에서 항상 제외
> stack: isDev && statusCode >= 500 ? error.stack : undefined,
> ```

---

### 🟢 4.3 CSRF 보호 (양호 — 개선 가능)

**파일**: `src/system/plugins/csrf.ts`

Double Submit Cookie 패턴이 올바르게 구현되어 있습니다. Bearer 토큰 인증 경로에서 CSRF를 면제하는 것도 RFC에 부합합니다.

**개선 사항**: 토큰 기본 길이가 32(bytes hex = 64자)로 적절하나, 설정 파일에서 작게 낮출 수 있으므로 최솟값 강제 검증 필요.

```typescript
tokenLength: Math.max(c.token_length ?? defaults.tokenLength, 24), // 최소 24 bytes
```

---

### 🟢 4.4 패킷 암호화 (양호)

**파일**: `src/system/plugins/packet-encrypt.ts`

HKDF-SHA256 기반 키 파생, 복호화 실패 시 400 응답, 응답 암호화(2xx만)가 올바르게 구현되어 있습니다. `as any` 캐스팅 문제(§2.1)만 개선하면 됩니다.

---

### 🟢 4.5 JWT 검증 캐싱 구현 (양호)

**파일**: `src/system/plugins/auth.ts`

```typescript
const cached = await store.get<any>(cacheKey);
if (cached) { req.user = cached; return; }
const user = jwt.verify(token, env.JWT_SECRET) as any;
const ttlMs = user.exp ? Math.max(0, (user.exp - ...) * 1000) : 5 * 60 * 1000;
if (ttlMs > 1000) await store.set(cacheKey, user, ttlMs);
```

암호화 연산 비용 절감을 위해 검증 결과를 캐싱하는 방식은 바람직합니다. TTL을 토큰 만료에 맞춘 것도 적절합니다.

> **⚠️ 교차검증 추가 의견**:
> 캐시 키가 `auth:${token}` — JWT 토큰 전문(수백~수천 바이트)을 그대로 사용합니다.
> 캐시 스토어(memory/redis)의 키 크기에 따라 메모리 효율이 떨어질 수 있습니다.
>
> ```typescript
> // 권장: SHA-256 해시로 캐시 키 생성
> import { createHash } from "crypto";
> const cacheKey = `auth:${createHash("sha256").update(token).digest("hex")}`;
> ```

---

### 🔴 4.6 인터셉터 라우트에 `authRequired` 미적용 (High) — 교차검증 신규 발견

**파일**: `src/system/hooks/entity-interceptor.ts`

`registerEntityInterceptor()`가 등록하는 모든 라우트(get, submit, delete, find, list)에 `preHandler: [app.authRequired]`가 **지정되어 있지 않습니다**.

전역 `onRequest` hook(`auth.ts`)은 `jwt.decode()`만 수행하여 서명 검증 없이 `req.user`를 설정합니다.

```typescript
// entity-interceptor.ts L65~68
app.get<{ Params: EntitySeqParams; Querystring: SkipHooksQs }>(
    "/api/v1/entity/:entity/:seq",
    async (req, reply) => {
        const user = req.user as UserInfo;  // ← decode만 된 미검증 사용자!

// skipHooks=false 경로:
//   beforeGet(entity, seq, user) → 위변조된 user.role로 접근 통과 가능
//   entityServer.get() → API 키 인증 → 실제 데이터 반환
//   afterGet() → 실제 데이터가 가짜 user에게 노출될 수 있음
```

**위험 시나리오**: 공격자가 서명 없이 `{ sub: 1, role: "admin" }` 페이로드를 가진 JWT를 생성하면, `jwt.decode()`는 성공하고 훅 코드는 admin 권한으로 판단합니다. `entityServer.get/submit/delete`는 API 키 인증(`skipHooks: true`)으로 실제 데이터에 접근합니다.

`skipHooks=true`인 경우: `forwardToEntityServer()`가 원본 Authorization 헤더를 전달하므로 Entity Server가 검증 → 이 경로는 안전합니다.

> **권장**: 인터셉터 라우트에 `preHandler` 추가
>
> ```typescript
> app.get<{ Params: EntitySeqParams; Querystring: SkipHooksQs }>(
>     "/api/v1/entity/:entity/:seq",
>     { preHandler: [app.authRequired] },  // ← JWT 서명 검증 필수
>     async (req, reply) => { ... },
> );
> ```
>
> 또는 `registerEntityInterceptor()` 진입 시 한 번에 prefix 라우트에 preHandler를 등록.

---

### 🟡 4.7 환경변수 시크릿 최소 길이 미검증 (Medium) — 교차검증 신규 발견

**파일**: `src/system/config/env.ts`

```typescript
JWT_SECRET: z.string().min(1),          // ← 1자도 허용
ENTITY_HMAC_SECRET: z.string().min(1),  // ← 동일
```

시크릿 키가 1자일 수 있으므로 브루트포스에 취약합니다. JWT 서명은 HS256 기준 최소 256비트(32바이트)의 시크릿을 권장합니다.

> **권장**:
>
> ```typescript
> JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
> ENTITY_HMAC_SECRET: z.string().min(32, "HMAC secret must be at least 32 characters"),
> ```

---

## 5. 코드 품질

### 5.1 hooks/runner.ts 파라미터 타입 느슨

**파일**: `src/system/hooks/runner.ts`

```typescript
export async function runBeforeList(
    entity: string,
    params: any,      // ← any
    user: UserInfo,
): Promise<any> {    // ← any

export async function runBeforeSubmit(
    entity: string,
    ctx: SubmitContext,
    user: UserInfo,
): Promise<any> {    // ← any
```

반환 타입이 `any`여서 훅 실행 결과를 사용하는 코드에서 타입 안전성이 없습니다.

> **⚠️ 교차검증 보충**: `EntityHook` 인터페이스가 `SubmitContext<T=any>` 등 제네릭을 지원하므로
> 런타임 안전성은 일부 확보되어 있음. `any` 사용은 플러그인(app/hooks/)에서 자유롭게 데이터를
> 변환할 수 있게 하려는 의도적 설계일 수 있음. 다만 `hookRegistry`가 모듈 스코프의 mutable
> 변수(`let hookRegistry = {}`)라서 테스트 시 격리가 어려움 — DI 패턴 또는 `setHookRegistry()`
> 초기화 보장이 필요.

> **권장**: `ListParams`, `SubmitData` 등 인터페이스 정의 후 사용.

---

### 5.2 Database 인터페이스의 느슨한 타입

**파일**: `src/system/public-api.ts`

```typescript
export interface Database {
    [key: string]: any; // 테이블 타입은 프로젝트에서 직접 확장하세요
}
```

이 선언이 기본값으로 남아있으면 Kysely의 타입 안전 쿼리 빌더 효과를 전혀 활용할 수 없습니다.

> **권장**: 실제 사용 테이블에 대한 타입 정의를 `app/types/db.ts`에 작성하고 이 인터페이스를 확장하도록 문서화.

---

## 6. 권장 조치 우선순위

### Phase 1 — 즉시 (보안)

| 우선순위 | 항목                           | 작업                                                                          |
| :------: | ------------------------------ | ----------------------------------------------------------------------------- |
|    1     | **인터셉터 authRequired 적용** | `entity-interceptor.ts` 라우트에 `preHandler: [app.authRequired]` 추가 (§4.6) |
|    2     | **CSP 활성화**                 | `security.ts`에 적절한 CSP 지시문 설정 (§4.1)                                 |
|    3     | **시크릿 최소 길이 강화**      | `env.ts`에서 `JWT_SECRET`, `ENTITY_HMAC_SECRET`을 `.min(32)` 이상으로 (§4.7)  |
|    4     | **에러 로그 URL 마스킹**       | `error-handler.ts`에서 쿼리 파라미터 민감정보 처리 (§4.2)                     |

### Phase 2 — 단기 (1~2주, 코드 품질)

| 우선순위 | 항목                   | 작업                                                                                      |
| :------: | ---------------------- | ----------------------------------------------------------------------------------------- |
|    5     | **`as any` 제거**      | auth.ts에서 `as any` → `as UserInfo` 변경, fastify.d.ts에 rawBody/\_packetKey 추가 (§2.1) |
|    6     | **JWT 캐시 키 최적화** | `auth:${token}` → `auth:${sha256(token)}` (§4.5)                                          |
|    7     | **훅 타입 강화**       | `runner.ts` 파라미터/반환 타입 정의 (§5.1)                                                |

### Phase 3 — 중기 (2~4주, 구조 개선)

| 우선순위 | 항목                   | 작업                                           |
| :------: | ---------------------- | ---------------------------------------------- |
|    8     | **Database 타입 정의** | 실제 사용 테이블에 대한 Kysely 인터페이스 작성 |

### Phase 4 — 장기 (1개월+, 성능 최적화)

| 우선순위 | 항목                  | 작업                                    |
| :------: | --------------------- | --------------------------------------- |
|    9     | **경로별 rate-limit** | 로그인 엔드포인트에 별도 낮은 한도 설정 |

---

## 부록: 양호하게 구현된 항목

다음 항목들은 잘 설계되어 있으며 현재 상태를 유지하면 됩니다.

- **플러그인 아키텍처**: `app/plugins/*/index.ts` 자동 로드로 깔끔한 확장성 확보
- **훅 인터셉터**: `entity-interceptor.ts`의 before/after 훅 분리 및 실패 정책 구분 (before: 차단, after: 무시)
- **JWT 캐싱**: 암호화 연산 비용 절감을 위한 검증 결과 캐싱, TTL 자동 계산
- **CSRF 구현**: Double Submit Cookie 패턴, Bearer 토큰 경로 면제 올바름
- **패킷 암호화**: HKDF-SHA256 키 파생, 복호화 실패 시 명시적 400 응답
- **에러 클래스 계층**: `AppError` → `BadRequestError`, `UnauthorizedError` 등 계층적 예외 정의
- **에러 핸들러**: 500 에러만 스택 트레이스 기록, 클라이언트에는 일반화된 메시지 반환
- **환경 변수 검증**: `zod` 스키마로 시작 시 필수 환경변수 검증
- **로거 설정**: 개발(pretty)/프로덕션(JSON + 로그 로테이션) 자동 분기
