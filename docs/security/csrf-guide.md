# CSRF 보호 가이드

> 대상: 브라우저에서 Entity Server에 직접 접속하는 프런트엔드 개발자, 운영 담당자

---

## 개요

Entity Server는 JWT, HMAC과 별개로 브라우저 직접 통신 시 필요한 CSRF 보호를 지원합니다.

- HMAC API Key 요청: CSRF 대상 아님
- Authorization Bearer 헤더 요청: CSRF 대상 아님
- Cookie 기반 JWT 요청: 상태 변경 메서드에서 CSRF 검사 대상

즉, 브라우저가 쿠키를 자동 전송하는 환경에서만 CSRF를 검사합니다.

기본 구현 방식은 double-submit cookie 패턴입니다.

- access/refresh 토큰: 서로 다른 JWT 값이 들어가는 HttpOnly 쿠키
- CSRF 토큰: 읽기 가능한 쿠키 + 동일 값을 헤더에 함께 전송
- 별도 CSRF 발급 라우트 없음
- 기본 부트스트랩 경로: GET /v1/health
- 브라우저 세션 연장은 refresh API 직접 호출보다 health 부트스트랩을 권장

---

## 동작 방식

### 1. 서버가 CSRF 토큰을 발급합니다.

다음 응답에서 CSRF 토큰이 내려갑니다.

- GET /v1/health
- POST /v1/auth/login
- POST /v1/auth/refresh
- POST /v1/auth/token_refresh

응답에는 CSRF 쿠키가 포함됩니다.

- Set-Cookie: \_csrf=<token>

### 2. 브라우저가 쿠키를 저장합니다.

기본 쿠키 이름은 \_csrf 이고 HttpOnly가 아니므로 프런트엔드에서 읽을 수 있습니다.

### 3. 상태 변경 요청에 헤더를 붙입니다.

다음과 같은 메서드가 기본 보호 대상입니다.

- POST
- PUT
- PATCH
- DELETE

요청 시 쿠키의 \_csrf 값과 동일한 값을 X-CSRF-Token 헤더에 실어야 합니다.

### 4. 서버가 cookie/header 일치 여부를 검사합니다.

조건이 모두 맞아야 통과합니다.

- JWT가 쿠키로 들어온 요청일 것
- 보호 대상 메서드일 것
- ignore_paths에 포함되지 않을 것
- CSRF 쿠키와 헤더 값이 정확히 같을 것

---

## 설정 파일

파일: configs/auth/csrf.json

```json
{
    "enabled": true,
    "header_name": "X-CSRF-Token",
    "cookie_name": "_csrf",
    "cookie_path": "/",
    "cookie_max_age_sec": 86400,
    "same_site": "Lax",
    "issue_on_health": true,
    "protect_methods": ["POST", "PUT", "PATCH", "DELETE"],
    "ignore_paths": ["/v1/health", "/v1/alimtalk/webhook/"]
}
```

### 설정 항목

| 필드               | 설명                           | 기본값                            |
| ------------------ | ------------------------------ | --------------------------------- |
| enabled            | CSRF 보호 활성화               | false                             |
| header_name        | 클라이언트가 보낼 헤더 이름    | X-CSRF-Token                      |
| cookie_name        | CSRF 쿠키 이름                 | \_csrf                            |
| cookie_path        | CSRF 쿠키 Path                 | /                                 |
| cookie_domain      | CSRF 쿠키 Domain               | 빈 값                             |
| cookie_max_age_sec | CSRF 쿠키 수명(초)             | 86400                             |
| same_site          | Lax, Strict, None              | Lax                               |
| issue_on_health    | health 응답에서 CSRF 토큰 발급 | true                              |
| protect_methods    | CSRF 검사 대상 메서드 목록     | POST, PUT, PATCH, DELETE          |
| ignore_paths       | 검사 제외 경로 prefix 목록     | /v1/health, /v1/alimtalk/webhook/ |

---

## 보호 범위

CSRF는 쿠키 기반 JWT 흐름에서만 적용됩니다.

| 인증 방식      | 예시                                  | CSRF 검사 |
| -------------- | ------------------------------------- | --------- |
| API Key + HMAC | X-API-Key, X-Signature                | 안 함     |
| Bearer JWT     | Authorization: Bearer <token>         | 안 함     |
| Cookie JWT     | token_access, token_refresh 쿠키 사용 | 함        |

이 설계의 목적은 서버 간 통신과 브라우저 직접 통신을 동시에 지원하는 것입니다.

---

## 샘플 헤더

### 1. health 부트스트랩 요청

```http
GET /v1/health HTTP/1.1
Host: api.example.com
Accept: application/json
Origin: https://www.example.com
```

### 2. health 응답 헤더 예시

```http
HTTP/1.1 200 OK
Content-Type: application/json
Set-Cookie: _csrf=7bdf0d7a0d7d2f1c0e4d8f7c8a3f5f2d4aa55b7f5162f33af4d78c7d8d884e74; Path=/; Max-Age=86400; SameSite=Lax
```

### 3. 로그인 응답 헤더 예시

```http
HTTP/1.1 200 OK
Content-Type: application/json
Set-Cookie: token_access=<access_jwt>; Path=/; HttpOnly; SameSite=Lax
Set-Cookie: token_refresh=<refresh_jwt>; Path=/; HttpOnly; SameSite=Lax
Set-Cookie: _csrf=7bdf0d7a0d7d2f1c0e4d8f7c8a3f5f2d4aa55b7f5162f33af4d78c7d8d884e74; Path=/; Max-Age=86400; SameSite=Lax
X-Access-Token: <access_jwt>
X-Refresh-Token: <refresh_jwt>
```

### 4. 보호 대상 요청 헤더 예시

```http
POST /v1/entity/post/create HTTP/1.1
Host: api.example.com
Content-Type: application/json
Cookie: token_access=<access_jwt>; token_refresh=<refresh_jwt>; _csrf=7bdf0d7a0d7d2f1c0e4d8f7c8a3f5f2d4aa55b7f5162f33af4d78c7d8d884e74
X-CSRF-Token: 7bdf0d7a0d7d2f1c0e4d8f7c8a3f5f2d4aa55b7f5162f33af4d78c7d8d884e74
```

---

## 브라우저 통신 예제

### fetch 예제

```ts
const readCookie = (name: string) => {
    const cookies = document.cookie.split(";");
    const prefix = `${name}=`;
    for (const raw of cookies) {
        const value = raw.trim();
        if (value.startsWith(prefix)) {
            return decodeURIComponent(value.slice(prefix.length));
        }
    }
    return "";
};

const bootstrap = async () => {
    const response = await fetch("https://api.example.com/v1/health", {
        method: "GET",
        credentials: "include",
    });

    if (!response.ok) {
        throw new Error("health check failed");
    }

    return {
        csrfCookie: readCookie("_csrf"),
    };
};

const createPost = async () => {
    const csrfToken = readCookie("_csrf");

    const response = await fetch(
        "https://api.example.com/v1/entity/post/create",
        {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": csrfToken,
            },
            body: JSON.stringify({
                title: "hello",
                content: "world",
            }),
        },
    );

    if (!response.ok) {
        throw new Error(`request failed: ${response.status}`);
    }

    return response.json();
};
```

### 로그인 후 바로 사용하는 예제

```ts
const login = async (email: string, passwd: string) => {
    const response = await fetch("https://api.example.com/v1/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, passwd }),
    });

    if (!response.ok) {
        throw new Error("login failed");
    }

    const csrfToken = readCookie("_csrf");
    return { csrfToken, data: await response.json() };
};
```

---

## curl 예제

브라우저 외 환경에서도 쿠키 jar를 쓰면 동일 흐름을 재현할 수 있습니다.

### 1. health로 CSRF 토큰 발급

```bash
curl -i -c cookie.jar \
  http://localhost:47200/v1/health
```

응답에서 Set-Cookie의 \_csrf 값을 확인합니다.

### 2. 로그인

```bash
curl -i -c cookie.jar -b cookie.jar \
  -X POST http://localhost:47200/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","passwd":"secret"}'
```

### 3. 쿠키에서 CSRF 값을 읽어 보호 대상 요청에 전달

```bash
CSRF_TOKEN=$(awk '$6 == "_csrf" { print $7 }' cookie.jar | tail -n 1)

curl -i -c cookie.jar -b cookie.jar \
  -X POST http://localhost:47200/v1/entity/post/create \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ${CSRF_TOKEN}" \
  -d '{"title":"hello","content":"world"}'
```

### 4. refresh

```bash
CSRF_TOKEN=$(awk '$6 == "_csrf" { print $7 }' cookie.jar | tail -n 1)

curl -i -c cookie.jar -b cookie.jar \
  -X POST http://localhost:47200/v1/auth/refresh \
  -H "X-CSRF-Token: ${CSRF_TOKEN}"
```

### 5. logout

```bash
CSRF_TOKEN=$(awk '$6 == "_csrf" { print $7 }' cookie.jar | tail -n 1)

curl -i -c cookie.jar -b cookie.jar \
  -X POST http://localhost:47200/v1/auth/logout \
  -H "X-CSRF-Token: ${CSRF_TOKEN}"
```

---

## health 기반 세션 부트스트랩

이미 refresh 쿠키가 브라우저에 있고 access 쿠키가 만료되었을 때는 health 요청으로 세션을 재부트스트랩할 수 있습니다.

브라우저 직접 통신에서는 이 방식을 세션 연장의 기본 방식으로 사용하는 것을 권장합니다.
주기적으로 health를 호출하면 access token 만료 시점마다 refresh 쿠키를 이용해 자동으로 새 토큰 쌍을 받을 수 있습니다.

요청 헤더에 아래 값을 추가합니다.

```http
X-Session-Bootstrap: 1
```

예시:

```bash
curl -i -c cookie.jar -b cookie.jar \
  -H "X-Session-Bootstrap: 1" \
  http://localhost:47200/v1/health
```

성공하면 응답 JSON에 authenticated: true 가 포함되고, 새 access/refresh 쿠키와 CSRF 쿠키가 함께 내려옵니다.

### 브라우저 자동 연장 예제

```ts
await client.login(email, password);

client.configure({
    keepSession: true,
    healthTickInterval: 5 * 60 * 1000,
});
```

위 설정이면 5분마다 health를 호출하면서 세션 연장을 함께 시도합니다.

---

## 실패 케이스

### 403 CSRF token required

다음 중 하나입니다.

- X-CSRF-Token 헤더가 없음
- \_csrf 쿠키가 없음
- 헤더와 쿠키 값이 다름
- 쿠키 기반 JWT 요청인데 보호 대상 메서드로 접근함

### 401 Authentication required

- Authorization 헤더도 없고 token_access 쿠키도 없음

### 401 Invalid or expired token

- token_access 쿠키는 있으나 access token이 만료 또는 위조됨

---

## 운영 권장사항

- 브라우저 직접 통신이면 csrf.enabled를 true로 두세요.
- API Key + HMAC 전용 서버 간 통신이면 CSRF는 굳이 켤 필요가 없습니다.
- same_site를 None으로 바꾸는 경우 HTTPS가 전제되어야 합니다.
- reverse proxy 환경이면 X-Forwarded-Proto를 정확히 넘겨 Secure 쿠키 판정이 틀어지지 않게 하세요.
- 프런트엔드에서는 항상 credentials: include 를 사용하세요.

---

## 관련 문서

- [인증 가이드](auth-guide.md)
- [JWT 인증](jwt-auth-guide.md)
- [보안 설정](security.md)
