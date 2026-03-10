# 소셜 로그인 가이드

Entity Server는 OAuth 2.0 기반 소셜 로그인을 지원합니다. 카카오, 구글, 네이버, GitHub, Apple, Line 프로바이더를 기본 제공하며, 추가 프로바이더를 확장할 수 있습니다.

## 목차

- [개요](#개요)
- [지원 프로바이더](#지원-프로바이더)
- [사전 준비](#사전-준비)
- [설정 (oauth.json)](#설정-oauthjson)
- [인증 흐름](#인증-흐름)
- [프로필 동기화](#프로필-동기화)
- [API 레퍼런스](#api-레퍼런스)
- [계정 연동/해제](#계정-연동해제)
- [회원탈퇴 · 휴면 · 복원](#회원탈퇴--휴면--복원)
- [엔티티 구조](#엔티티-구조)
- [카카오 로그인 설정](#카카오-로그인-설정-가이드)
- [Apple 로그인 설정](#apple-로그인-설정-가이드)
- [Line 로그인 설정](#line-로그인-설정-가이드)
- [보안 권장사항](#보안-권장사항)

---

## 개요

소셜 로그인을 사용하면 사용자가 별도 비밀번호 없이 기존 소셜 계정으로 로그인할 수 있습니다. Entity Server는 다음 두 가지 모드를 지원합니다:

1. **OAuth 로그인** — 소셜 프로바이더로 인증 후 JWT 토큰 발급
2. **계정 연동** — 기존 계정에 소셜 프로바이더를 연결/해제

---

## 지원 프로바이더

| 프로바이더 | OAuth 2.0 | PKCE | 사용자 정보                   | 비고                              |
| ---------- | --------- | ---- | ----------------------------- | --------------------------------- |
| **카카오** | ✅        | —    | 이메일, 닉네임, 프로필 이미지 | REST API 키 사용                  |
| **구글**   | ✅        | —    | 이메일, 이름, 프로필 이미지   | Google Cloud Console              |
| **네이버** | ✅        | —    | 이메일, 이름, 프로필 이미지   | 네이버 개발자센터                 |
| **GitHub** | ✅        | —    | 이메일, 이름, 아바타          | GitHub Developer Settings         |
| **Apple**  | ✅        | ✅   | 이메일, 이름                  | PKCE+POST, ES256 JWT 자동 서명    |
| **Line**   | ✅        | ✅   | 이메일, 이름, 프로필 이미지   | PKCE 권장, ID Token에서 정보 추출 |

> **PKCE** (Proof Key for Code Exchange): Apple과 Line은 PKCE를 사용합니다.
> `oauth.json`에서 `"pkce": true`를 설정하면 자동으로 `code_verifier`/`code_challenge`를 생성합니다.

---

## 사전 준비

각 프로바이더의 개발자 콘솔에서 앱을 등록하고, **Client ID**와 **Client Secret**을 발급받아야 합니다.

### 공통 요구사항

- **Redirect URI**: `https://{서버주소}/v1/oauth/{provider}/callback`
- 예: `https://api.example.com/v1/oauth/kakao/callback`

---

## 설정 (oauth.json)

`configs/auth/oauth.json`에 프로바이더별 설정을 추가합니다:

```json
{
    "state_secret": "${OAUTH_STATE_SECRET}",
    "state_ttl_sec": 600,
    "success_redirect_url": "https://your-domain.com/auth/callback",
    "failure_redirect_url": "https://your-domain.com/auth/error",
    "providers": [
        {
            "driver": "kakao",
            "client_id": "${KAKAO_CLIENT_ID}",
            "client_secret": "${KAKAO_CLIENT_SECRET}",
            "redirect_url": "https://api.example.com/v1/oauth/kakao/callback",
            "auth_url": "https://kauth.kakao.com/oauth/authorize",
            "token_url": "https://kauth.kakao.com/oauth/token",
            "user_info_url": "https://kapi.kakao.com/v2/user/me",
            "scopes": ["profile_nickname", "account_email"],
            "email_field": "kakao_account.email",
            "name_field": "properties.nickname"
        },
        {
            "driver": "google",
            "client_id": "${GOOGLE_CLIENT_ID}",
            "client_secret": "${GOOGLE_CLIENT_SECRET}",
            "redirect_url": "https://api.example.com/v1/oauth/google/callback",
            "scopes": ["openid", "email", "profile"]
        },
        {
            "_comment": "Apple — apple_team_id / apple_key_id / apple_private_key → client_secret JWT 자동 생성",
            "driver": "apple",
            "client_id": "${APPLE_CLIENT_ID}",
            "client_secret": "",
            "redirect_url": "https://api.example.com/v1/oauth/apple/callback",
            "scopes": ["name", "email"],
            "pkce": true,
            "apple_team_id": "${APPLE_TEAM_ID}",
            "apple_key_id": "${APPLE_KEY_ID}",
            "apple_private_key": "${APPLE_PRIVATE_KEY}"
        },
        {
            "_comment": "Line Login v2.1 — PKCE 권장, openid+email 스코프",
            "driver": "line",
            "client_id": "${LINE_CLIENT_ID}",
            "client_secret": "${LINE_CLIENT_SECRET}",
            "redirect_url": "https://api.example.com/v1/oauth/line/callback",
            "scopes": ["openid", "profile", "email"],
            "pkce": true
        }
    ]
}
```

> **참고**: `${ENV_VAR}` 패턴은 서버 시작 시 환경 변수로 자동 치환됩니다.

### 최상위 설정

| 필드                   | 설명                                    | 필수 |
| ---------------------- | --------------------------------------- | ---- |
| `state_secret`         | CSRF State HMAC 서명 키                 | ✅   |
| `state_ttl_sec`        | State 유효기간 (초, 기본 600)           | 선택 |
| `success_redirect_url` | OAuth 성공 시 프론트엔드 리다이렉트 URL | 선택 |
| `failure_redirect_url` | OAuth 실패 시 프론트엔드 리다이렉트 URL | 선택 |
| `providers`            | 프로바이더별 설정 (아래 참고)           | ✅   |

### 프로바이더별 필드 매핑

카카오처럼 커스텀 엔드포인트를 사용하는 프로바이더는 `email_field`, `name_field`로 사용자 정보 경로를 지정합니다. dot-notation(`kakao_account.email`)을 지원합니다.

| 필드                | 설명                                               | 필수 |
| ------------------- | -------------------------------------------------- | ---- |
| `email_field`       | 이메일 경로 (기본: `email`)                        | 선택 |
| `name_field`        | 이름 경로 (기본: `name`)                           | 선택 |
| `pkce`              | `true`이면 PKCE 사용 (Apple, Line 권장)            | 선택 |
| `apple_team_id`     | Apple Developer Team ID (Apple 전용)               | 조건 |
| `apple_key_id`      | Apple Sign-In Key ID (Apple 전용)                  | 조건 |
| `apple_private_key` | Apple `.p8` 개인키 PEM 또는 환경 변수 (Apple 전용) | 조건 |

> Google, GitHub, Naver는 이메일/이름 매핑이 하드코딩되어 있으므로 `email_field`/`name_field` 지정이 불필요합니다.
> Apple 전용 필드 3개(`apple_team_id`, `apple_key_id`, `apple_private_key`)가 모두 있으면 `client_secret` ES256 JWT를 **자동 생성**합니다.

---

## 인증 흐름

```
사용자 → GET /v1/oauth/{provider}
       → 프로바이더 로그인 페이지로 302 리다이렉트
       → 로그인 완료 후 콜백
       → GET /v1/oauth/{provider}/callback?code=...&state=...
       → Entity Server가 state 검증, access_token 교환, 사용자 정보 조회
       → account_oauth 조회 → 이메일로 account 조회 → 신규 생성 (3단계 전략)
       → JWT 토큰 쌍 생성
       → 302 리다이렉트: {success_redirect_url}?access_token=...&refresh_token=...
         (success_redirect_url 미설정 시 JSON 응답 폴백)
```

### 신규 사용자

소셜 로그인 시 해당 이메일의 계정이 없으면 **자동으로 계정을 생성**합니다.

### 기존 사용자

이메일이 일치하는 기존 계정이 있으면 해당 계정으로 로그인합니다.

---

<a id="프로필-동기화"></a>

## 프로필 동기화

소셜 로그인으로 **신규 계정이 생성되는 경우에만** 프로바이더의 프로필 정보를 `user` 엔티티에 저장합니다.

### 동기화 규칙

| 단계  | 시나리오                                          | 프로필 동기화 | 설명                    |
| ----- | ------------------------------------------------- | ------------- | ----------------------- |
| 1단계 | `account_oauth`에서 기존 연동 발견                | ❌            | 이미 알려진 소셜 연동   |
| 2단계 | 이메일로 기존 `account` 발견 → 연동 추가          | ❌            | 기존 계정에 소셜만 연결 |
| 3단계 | 계정 없음 → `account` + `account_oauth` 신규 생성 | ✅            | 최초 1회만              |

### 동기화 데이터

프로바이더에서 제공하는 다음 필드를 `user` 엔티티에 저장합니다:

| 필드            | 매핑                 | 비고                 |
| --------------- | -------------------- | -------------------- |
| `name`          | 프로바이더 표시 이름 | 값이 있을 때만       |
| `profile_image` | 프로필 이미지 URL    | 값이 있을 때만       |
| `email`         | 이메일               | `user` 엔티티 식별자 |

> **설계 원칙**: 매 로그인마다 프로필을 덮어쓰지 않습니다.
> 사용자가 직접 수정한 프로필이 소셜 로그인 시 초기화되는 것을 방지합니다.

---

## API 레퍼런스

### OAuth 로그인 (JWT 불필요)

| 메서드     | 경로                           | 설명                                  |
| ---------- | ------------------------------ | ------------------------------------- |
| `GET`      | `/v1/oauth/:provider`          | 프로바이더 로그인 페이지로 리다이렉트 |
| `GET/POST` | `/v1/oauth/:provider/callback` | 콜백 처리 → JWT 발급                  |

> Apple은 콜백이 **POST**로 전달됩니다. Entity Server는 GET/POST 모두 지원합니다.

### 계정 연동 관리 (JWT 필요)

| 메서드   | 경로                               | 설명                             |
| -------- | ---------------------------------- | -------------------------------- |
| `POST`   | `/v1/auth/oauth/link`              | 소셜 계정을 현재 계정에 연결     |
| `DELETE` | `/v1/auth/oauth/link/:provider`    | 소셜 계정 연결 해제              |
| `GET`    | `/v1/auth/oauth/providers`         | 연결된 소셜 프로바이더 목록 조회 |
| `POST`   | `/v1/auth/oauth/refresh/:provider` | 프로바이더 OAuth 토큰 갱신       |

### 계정 관리 API

| 메서드 | 경로                       | 인증   | 설명                               |
| ------ | -------------------------- | ------ | ---------------------------------- |
| `POST` | `/v1/api/account/withdraw` | JWT    | 회원탈퇴 (계정 비활성 + 연동 삭제) |
| `POST` | `/v1/auth/reactivate`      | 불필요 | 휴면 계정 복원                     |

### POST /v1/auth/oauth/link

```json
{
    "provider": "kakao",
    "code": "authorization_code_from_provider",
    "state": "csrf_state_value"
}
```

**응답 (200)**:

```json
{
    "ok": true,
    "message": "Provider linked",
    "provider": "kakao"
}
```

### GET /v1/auth/oauth/providers

**응답 (200)**:

```json
{
    "ok": true,
    "data": [
        {
            "provider": "kakao",
            "email": "user@kakao.com",
            "name": "홍길동",
            "profile_image": "https://k.kakaocdn.net/...",
            "linked_at": "2025-01-15 10:30:00"
        }
    ]
}
```

---

<a id="계정-연동해제"></a>

## 계정 연동/해제

기존 아이디/비밀번호 계정에 소셜 프로바이더를 연결하여 두 가지 방식 모두로 로그인할 수 있습니다.

### 연동

1. 클라이언트에서 프로바이더 로그인 후 authorization code 획득
2. `POST /v1/auth/oauth/link`에 code와 provider 전송
3. 서버가 code를 교환하여 소셜 계정 정보 확인
4. `account_oauth` 테이블에 연결 레코드 생성

### 해제

1. `DELETE /v1/auth/oauth/link/:provider` 호출
2. 비밀번호가 설정되어 있거나 다른 소셜 연결이 남아있을 때만 해제 가능 (로그인 수단 0개 방지)
3. `account_oauth` 레코드가 삭제됨 (`hard_delete: true`)
4. 재연결 시 `POST /v1/auth/oauth/link`로 새 레코드 생성

---

<a id="회원탈퇴--휴면--복원"></a>

## 회원탈퇴 · 휴면 · 복원

### 회원탈퇴 (`POST /v1/api/account/withdraw`)

로그인(JWT)된 사용자가 자신의 계정을 삭제합니다.

- **관리자 계정** (`rbac_role: admin`)은 탈퇴 불가 (403)
- 비밀번호가 설정된 계정은 `passwd` 확인 필수
- 소셜 전용 계정(`has_password: false`)은 비밀번호 없이 탈퇴 가능
- 처리 순서: 계정 `status` → `inactive` → `account_oauth` 연동 삭제 → 세션 무효화

**요청**:

```json
{ "passwd": "current-password" }
```

**응답 (200)**:

```json
{ "ok": true, "message": "Account withdrawn" }
```

### 자동 휴면 (`RunDormancyCheck`)

일정 기간 로그인하지 않은 계정을 자동으로 휴면 처리합니다.

- `last_login_time` 또는 `updated_time` 기준으로 판단
- `rbac_role: admin` 계정은 대상에서 제외
- `status` 값이 `active` → `dormant`로 변경
- 서버 내부 배치 함수로 호출 (HTTP 엔드포인트 아님)

### 휴면 복원 (`POST /v1/auth/reactivate`)

휴면(`dormant`) 계정을 복원하고 JWT를 재발급합니다.

- 비밀번호 로그인: `email` + `passwd`
- 소셜 로그인: `email` + `provider` + `code`
- 복원 시 `status` → `active`, `last_login_time` 갱신

**요청 (비밀번호)**:

```json
{ "email": "user@example.com", "passwd": "password" }
```

**요청 (소셜)**:

```json
{
    "email": "user@example.com",
    "provider": "kakao",
    "code": "authorization_code"
}
```

**응답 (200)**:

```json
{
    "ok": true,
    "message": "Account reactivated",
    "data": {
        "access_token": "eyJhbGciOi...",
        "refresh_token": "eyJhbGciOi...",
        "expires_in": 3600
    }
}
```

---

## 엔티티 구조

### account_oauth

소셜 로그인 연동 정보를 저장하는 엔티티입니다.

**Index 필드:**

| 필드          | 타입                                             | 설명                      |
| ------------- | ------------------------------------------------ | ------------------------- |
| `account_seq` | integer                                          | 연결된 계정 seq (필수)    |
| `provider`    | enum (google, github, naver, kakao, apple, line) | 프로바이더 이름 (필수)    |
| `provider_id` | string                                           | 프로바이더 고유 사용자 ID |
| `status`      | enum (active, unlinked)                          | 연동 상태 (기본: active)  |

**Fields:**

| 필드               | 타입   | 설명                              |
| ------------------ | ------ | --------------------------------- |
| `email`            | email  | 프로바이더에서 제공한 이메일      |
| `name`             | string | 표시 이름                         |
| `profile_image`    | string | 프로필 이미지 URL                 |
| `access_token`     | string | OAuth access token (암호화 저장)  |
| `refresh_token`    | string | OAuth refresh token (암호화 저장) |
| `token_expires_at` | string | access token 만료 시각 (RFC3339)  |
| `raw`              | json   | 프로바이더 원본 응답 (디버깅용)   |
| `linked_at`        | string | 연동 시각                         |
| `unlinked_at`      | string | 해제 시각                         |

> `data_encryption: true` — 토큰 등 민감 데이터가 암호화되어 저장됩니다.
> `hard_delete: true` — 삭제 시 물리 삭제됩니다.

### user

소셜 로그인 신규 계정 생성 시 프로필 정보가 저장되는 엔티티입니다.

| 필드            | 타입   | 설명                                        |
| --------------- | ------ | ------------------------------------------- |
| `email`         | email  | 사용자 이메일 (account와 동일)              |
| `name`          | string | 표시 이름 (소셜 프로바이더에서 초기 동기화) |
| `profile_image` | string | 프로필 이미지 URL (소셜 초기 동기화)        |
| `status`        | enum   | active / inactive                           |

> 프로필 동기화는 [프로필 동기화](#프로필-동기화) 섹션 규칙에 따라 **신규 생성 시 1회만** 실행됩니다.

---

## 카카오 로그인 설정 가이드

### 1. Kakao Developers 앱 등록

1. [Kakao Developers](https://developers.kakao.com/)에 접속
2. **내 애플리케이션 → 애플리케이션 추가**
3. 앱 이름과 사업자 정보 입력

### 2. 플랫폼 등록

1. **앱 설정 → 플랫폼** 메뉴
2. **Web** 플랫폼 추가
3. 사이트 도메인 입력: `https://api.example.com`

### 3. Redirect URI 등록

1. **카카오 로그인 → Redirect URI**
2. `https://api.example.com/v1/oauth/kakao/callback` 추가

### 4. 동의항목 설정

1. **카카오 로그인 → 동의항목**
2. 다음 항목을 **필수 동의** 또는 **선택 동의**로 설정:
    - `profile_nickname` — 닉네임
    - `account_email` — 카카오계정(이메일)

### 5. REST API 키 확인

1. **앱 키** 메뉴에서 **REST API 키** 복사
2. `KAKAO_CLIENT_ID` 환경 변수에 설정

> **참고**: 카카오는 `client_secret` 없이도 동작하지만, **보안 강화를 위해 설정을 권장**합니다.
> **카카오 로그인 → 보안** 메뉴에서 Client Secret을 발급받을 수 있습니다.

### 6. 비즈앱 전환 (선택)

이메일 정보를 필수 동의로 받으려면 **비즈앱**으로 전환해야 합니다:

1. **앱 설정 → 비즈니스** 메뉴
2. 비즈니스 채널 연결
3. 사업자 정보 등록

---

## Apple 로그인 설정 가이드

### 1. Apple Developer 설정

1. [Apple Developer](https://developer.apple.com/) 계정에 접속
2. **Certificates, Identifiers & Profiles** 메뉴

### 2. App ID 등록

1. **Identifiers → App IDs** 에서 앱 등록
2. **Sign In with Apple** capability 활성화

### 3. Services ID 등록

1. **Identifiers → Services IDs** 에서 새 서비스 생성
2. Identifier를 `client_id`로 사용 (예: `com.example.auth`)
3. **Sign In with Apple → Configure**:
    - **Domains**: `api.example.com`
    - **Return URLs**: `https://api.example.com/v1/oauth/apple/callback`

### 4. Key 생성

1. **Keys** 에서 새 키 생성
2. **Sign In with Apple** 체크
3. 키 다운로드 (`.p8` 파일) — **한 번만** 다운로드 가능
4. **Key ID**를 `apple_key_id`에 설정

### 5. 환경 변수 설정

```bash
APPLE_CLIENT_ID=com.example.auth         # Services ID
APPLE_TEAM_ID=XXXXXXXXXX                  # Apple Developer Team ID
APPLE_KEY_ID=YYYYYYYYYY                   # Key ID
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIGT...base64...\n-----END PRIVATE KEY-----"
```

> `client_secret`은 서버가 **ES256 JWT로 자동 생성**합니다. 수동 설정 불필요.
> Apple 콜백은 **POST**로 전달되므로 Entity Server는 GET/POST 모두 처리합니다.

---

## Line 로그인 설정 가이드

### 1. LINE Developers 채널 생성

1. [LINE Developers Console](https://developers.line.biz/) 접속
2. **Provider 생성** (없는 경우)
3. **LINE Login** 채널 생성

### 2. 채널 설정

1. **Basic settings** 탭에서 **Channel ID** / **Channel secret** 확인
2. **LINE Login** 탭:
    - **Callback URL** 추가: `https://api.example.com/v1/oauth/line/callback`

### 3. OpenID Connect 활성화

1. **LINE Login** 탭 → **OpenID Connect**: 활성화
2. **Email address permission**: 신청 (비즈니스 인증 필요할 수 있음)

### 4. 환경 변수 설정

```bash
LINE_CLIENT_ID=1234567890        # Channel ID
LINE_CLIENT_SECRET=xxxxxxxxx     # Channel secret
```

### 5. oauth.json 설정

```json
{
    "driver": "line",
    "client_id": "${LINE_CLIENT_ID}",
    "client_secret": "${LINE_CLIENT_SECRET}",
    "redirect_url": "https://api.example.com/v1/oauth/line/callback",
    "scopes": ["openid", "profile", "email"],
    "pkce": true
}
```

> Line은 **PKCE**를 권장합니다. `"pkce": true` 설정 시 자동으로 `code_verifier`/`code_challenge`가 생성됩니다.
> 사용자 정보는 ID Token에서 추출합니다 (UserInfo API와 별도).

---

## 보안 권장사항

1. **`client_secret`은 반드시 환경 변수로 관리**하세요.
2. **Redirect URI에 와일드카드를 사용하지 마세요.** 정확한 URL만 등록합니다.
3. **프로덕션 환경에서는 HTTPS만 사용**하세요.
4. `state` 파라미터는 서버가 자동으로 생성·검증합니다 (CSRF 방지).
5. OAuth 콜백 엔드포인트(`/v1/oauth/`)는 JWT 인증을 건너뛰지만, 내부적으로 `state` 검증을 수행합니다.
6. **Apple / Line은 PKCE를 활성화**하세요 (`"pkce": true`). Authorization Code 가로채기를 방지합니다.
7. **OAuth 토큰은 암호화 저장**됩니다 (`data_encryption: true`). `account_oauth` 엔티티의 `access_token`, `refresh_token` 필드가 대상입니다.
8. **Apple 개인키(`.p8`)는 절대 코드에 하드코딩하지 마세요.** 환경 변수 또는 시크릿 매니저를 사용하세요.

---

## 관련 문서

- [소셜 로그인 설계 문서](../dev/design/social-login-design.md) — 3단계 전략, PKCE, Apple ES256 상세
- [인증 라우트](../api-routes/auth-routes.md) — 인증·계정 관리 API 전체 목록
- [백업 및 복원 가이드](backup-guide.md)
- [파일 스토리지 가이드](storage-guide.md)
- [SMTP 이메일 발송 가이드](../notification/smtp-guide.md)
- [SMS 가이드](../notification/sms-guide.md)
- [카카오 알림톡 가이드](../notification/alimtalk-guide.md)
- [친구톡(FriendTalk) 가이드](../notification/friendtalk-guide.md)
- [푸시 알림 가이드](../notification/push-guide.md)

## 다음 문서

- [API 라우트](../api-routes/api-routes.md)
- [운영 플레이북](../operations/operations-playbook.md)
- [목록으로 돌아가기](../README.md)
