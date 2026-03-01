# 본인인증 가이드 (Identity Verification Guide)

> 대상: 운영/인프라/SRE/온콜 엔지니어, 개발자  
> 범위: Entity Server 휴대폰 본인인증 — 설정, API, 프로바이더, 운영, 장애 대응

---

## 개요

Entity Server는 **휴대폰 기반 본인인증**을 지원합니다.  
NICE 본인확인(CheckPlus), KMC 한국모바일인증, Danal 본인확인 등 주요 중계사를 어댑터 패턴으로 연동하며,  
CI(연계정보) 기반의 **중복 가입 방지** 및 **계정 실명 연결** 기능을 제공합니다.

### 핵심 특성

| 항목          | 설명                                                              |
| ------------- | ----------------------------------------------------------------- |
| 지원 중계사   | **NICE**, **KMC**, **Danal** (어댑터 패턴으로 확장 가능)          |
| 인증 방식     | 팝업(popup), PASS 앱(pass), SMS 인증(sms)                         |
| 암호화        | NICE: AES-128-CBC, KMC: 3DES-CBC, Danal: AES-256-CBC              |
| 무결성 검증   | HMAC-SHA256 (NICE v2)                                             |
| CI 저장       | SHA-256 해시 (원문 미보관)                                        |
| 요청 TTL      | 300초 (설정 가능)                                                 |
| 결과 TTL      | 600초 (설정 가능)                                                 |
| CI 중복 검사  | 기본 활성 (`duplicate_ci_check: true`)                            |
| Rate Limit    | IP당 시간당 10회, 계정당 일 5회 (설정 가능)                       |
| PII 마스킹    | 이름: `홍*동`, 전화: `010****5678`, 생년월일: `1990****`          |
| 데이터 암호화 | 엔티티 `data_encryption` 기본 활성 (CI, DI, 개인정보 암호화 저장) |

---

## 인증 흐름

### 회원가입 시 본인인증 (팝업 방식)

```
[Client — 프론트엔드]
  → POST /v1/identity/request { purpose: "signup", method: "popup" }

[Server — 요청 생성, pending 상태 DB 저장]
  ← 200 { ok: true, data: { request_id, popup_url, enc_data, token_version_id, integrity_value } }

[Client — popup_url로 팝업 오픈 → 중계사 인증 화면]

[사용자 — 중계사 팝업에서 본인인증 수행]

[중계사 → Server]
  → POST /v1/identity/callback  (form-urlencoded: enc_data, token_version_id)

[Server — 콜백 복호화, 결과 저장, 팝업에 postMessage 전달]
  ← HTML (window.opener.postMessage({ type: "identity_verification", request_id, status }))

[Client — postMessage 수신]
  → GET /v1/identity/result/:request_id

[Server — 마스킹된 결과 반환]
  ← 200 { ok: true, data: { status: "verified", name: "홍*동", birth_date: "1990****", gender: "M", phone: "010****5678" } }
```

### CI 중복 가입 확인

```
[Client]
  → POST /v1/identity/verify-ci { ci_hash: "abc123..." }

[Server — CI 해시로 기존 계정 조회]
  ← 200 { ok: true, data: { exists: true, account_seq: 42 } }
  ← 200 { ok: true, data: { exists: false } }
```

### 인증 목적별 용도

| purpose           | 설명              | JWT 필요 |
| ----------------- | ----------------- | -------- |
| `signup`          | 회원가입 본인확인 | 불필요   |
| `find_account`    | 계정 찾기         | 불필요   |
| `password_reset`  | 비밀번호 재설정   | 불필요   |
| `adult_verify`    | 성인 인증         | 선택     |
| `identity_change` | 본인정보 변경     | 선택     |

---

## 1. 설정

### 설정 파일 위치

```
configs/
  auth/
    identity.json          ← 실제 설정 (enabled: false 기본)
examples/
  auth/
    identity.json.example  ← 예제 (참고용)
```

### 최소 설정 (`configs/auth/identity.json`)

```jsonc
{
    "enabled": true,
    "default": "nice",
    "return_url": "/v1/identity/callback",
    "providers": [
        {
            "driver": "nice",
            "site_code": "${NICE_SITE_CODE}",
            "site_password": "${NICE_SITE_PASSWORD}",
            "client_id": "${NICE_CLIENT_ID}",
            "client_secret": "${NICE_CLIENT_SECRET}",
            "product_id": "2101979031",
            "api_url": "https://nice.checkplus.co.kr",
            "token_url": "https://svc.niceapi.co.kr:22001/digital/niceid/oauth/oauth/token",
            "crypto_url": "https://svc.niceapi.co.kr:22001/digital/niceid/api/v1.0/common/crypto/token",
        },
    ],
}
```

> 모든 `_url` 필드는 **상대경로** 또는 **절대 URL** 모두 사용할 수 있습니다.  
> 상대경로(`/`로 시작)이면 `server.json`의 `public_url`을 앞에 붙여 절대 URL로 변환됩니다.

### 전체 설정 옵션

```jsonc
{
    // 본인인증 활성화 여부 (기본: false)
    "enabled": true,

    // 기본 프로바이더 (생략 시 providers[0] 사용)
    "default": "nice",

    // 인증 요청 유효 시간 (초, 기본: 300)
    "request_ttl_sec": 300,

    // 인증 결과 조회 유효 시간 (초, 기본: 600)
    "result_ttl_sec": 600,

    // 중계사 콜백 수신 URL
    // 상대경로: /v1/identity/callback  → server.json의 public_url이 앞에 붙습니다
    // 절대 URL: https://api.example.com/v1/identity/callback
    "return_url": "/v1/identity/callback",

    // 인증 성공 시 리다이렉트 URL — 상대경로 또는 절대 URL
    "success_redirect_url": "/identity/complete",

    // 인증 실패 시 리다이렉트 URL — 상대경로 또는 절대 URL
    "failure_redirect_url": "/identity/error",

    // CI 기반 중복 가입 검사 (기본: true)
    "duplicate_ci_check": true,

    // 중계사 목록
    "providers": [
        {
            "driver": "nice",
            "site_code": "${NICE_SITE_CODE}",
            "site_password": "${NICE_SITE_PASSWORD}",
            "client_id": "${NICE_CLIENT_ID}",
            "client_secret": "${NICE_CLIENT_SECRET}",
            "product_id": "2101979031",
            "api_url": "https://nice.checkplus.co.kr",
            "token_url": "https://svc.niceapi.co.kr:22001/digital/niceid/oauth/oauth/token",
            "crypto_url": "https://svc.niceapi.co.kr:22001/digital/niceid/api/v1.0/common/crypto/token",
        },
    ],

    // Rate Limit
    "rate_limit": {
        "per_ip_per_hour": 10, // IP당 시간당 최대 요청 (기본: 10)
        "per_account_per_day": 5, // 계정당 일 최대 요청 (기본: 5)
    },
}
```

### server.json 연동

`_url` 필드(예: `return_url`, `success_redirect_url`, `failure_redirect_url`)에 **상대경로**를 사용하면  
서버 시작 시 `server.json`의 `public_url`이 앞에 붙어 절대 URL로 변환됩니다.

| 설정값                           | `public_url`              | 실제 적용 URL                                  |
| -------------------------------- | ------------------------- | ---------------------------------------------- |
| `"/v1/identity/callback"`        | `https://api.example.com` | `https://api.example.com/v1/identity/callback` |
| `"https://other.example.com/cb"` | 무관                      | `https://other.example.com/cb` (그대로 사용)   |

`configs/server.json`:

```json
{
    "public_url": "https://api.example.com"
}
```

`configs/auth/identity.json`:

```json
{
    "return_url": "/v1/identity/callback"
}
```

> **주의:** `${public_url}` 같은 치환 표현은 동작하지 않습니다. 상대경로(`/`로 시작) 또는 절대 URL만 사용하세요.

### 환경 변수

모든 프로바이더 설정 필드에 `${ENV_VAR}` 형식의 환경 변수를 사용할 수 있습니다.  
민감한 값(client_secret, site_password 등)은 반드시 환경 변수로 관리하세요.

| 환경 변수            | 설명                 | 적용 필드       |
| -------------------- | -------------------- | --------------- |
| `NICE_SITE_CODE`     | NICE 사이트 코드     | `site_code`     |
| `NICE_SITE_PASSWORD` | NICE 사이트 패스워드 | `site_password` |
| `NICE_CLIENT_ID`     | NICE OAuth Client ID | `client_id`     |
| `NICE_CLIENT_SECRET` | NICE OAuth Secret    | `client_secret` |

---

## 2. 프로바이더 설정

### NICE CheckPlus v2

NICE 본인확인은 OAuth2 + Crypto Token 방식의 v2 API를 사용합니다.

```jsonc
{
    "driver": "nice",
    "site_code": "${NICE_SITE_CODE}",
    "site_password": "${NICE_SITE_PASSWORD}",
    "client_id": "${NICE_CLIENT_ID}",
    "client_secret": "${NICE_CLIENT_SECRET}",
    "product_id": "2101979031",
    "api_url": "https://nice.checkplus.co.kr",
    "token_url": "https://svc.niceapi.co.kr:22001/digital/niceid/oauth/oauth/token",
    "crypto_url": "https://svc.niceapi.co.kr:22001/digital/niceid/api/v1.0/common/crypto/token",
}
```

**인증 절차:**

1. Access Token 발급 (OAuth2 `client_credentials`, Basic Auth)
2. Crypto Token 발급 (Bearer 인증, ProductID 헤더)
3. 요청 데이터 AES-128-CBC 암호화 + HMAC-SHA256 무결성 값 생성
4. 팝업 URL로 사용자 인증
5. 콜백에서 `token_version_id`로 복호화 키 조회 → AES-128-CBC 복호화

**필수 필드:** `site_code`, `site_password`, `client_id`, `client_secret`, `product_id`, `api_url`, `token_url`, `crypto_url`

### KMC 한국모바일인증

```jsonc
{
    "driver": "kmc",
    "cp_cd": "${KMC_CP_CD}",
    "url_cd": "${KMC_URL_CD}",
    "cert_key": "${KMC_CERT_KEY}",
    "api_url": "https://www.kmcert.com",
}
```

**암호화:** 3DES-CBC (SHA-256 파생 키)

**필수 필드:** `cp_cd`, `url_cd`, `cert_key`, `api_url`

### Danal 본인확인

```jsonc
{
    "driver": "danal",
    "client_id": "${DANAL_CLIENT_ID}",
    "client_secret": "${DANAL_CLIENT_SECRET}",
    "api_url": "https://uas.teledit.com",
}
```

**암호화:** AES-256-CBC (SHA-256 파생 키)

**필수 필드:** `client_id`, `client_secret`, `api_url`

### 복수 프로바이더

```jsonc
{
    "default": "nice",
    "providers": [
        { "driver": "nice", ... },
        { "driver": "kmc", ... }
    ]
}
```

클라이언트가 `POST /v1/identity/request`에서 `provider` 필드를 지정하면 해당 프로바이더를 사용하고,  
생략하면 `default` 프로바이더를 사용합니다.

---

## 3. API 레퍼런스

### POST /v1/identity/request

인증 요청을 생성합니다.

**인증:** JWT 선택 (있으면 `account_seq` 자동 연결)  
**JWT SkipPath:** `/v1/identity/` 전체

**Request Body:**

```json
{
    "purpose": "signup",
    "method": "popup",
    "provider": "nice"
}
```

| 필드       | 타입   | 필수 | 설명                                                                          |
| ---------- | ------ | ---- | ----------------------------------------------------------------------------- |
| `purpose`  | string | Y    | `signup`, `find_account`, `password_reset`, `adult_verify`, `identity_change` |
| `method`   | string | N    | `popup` (기본), `pass`, `sms`                                                 |
| `provider` | string | N    | `nice`, `kmc`, `danal` (기본: 설정의 `default`)                               |

**Response (200):**

```json
{
    "ok": true,
    "data": {
        "request_id": "a1b2c3d4...",
        "popup_url": "https://nice.checkplus.co.kr/...",
        "enc_data": "base64...",
        "token_version_id": "...",
        "integrity_value": "hmac..."
    }
}
```

| 필드               | 설명                                   |
| ------------------ | -------------------------------------- |
| `request_id`       | 요청 고유 ID (64자 hex)                |
| `popup_url`        | 인증 팝업 URL                          |
| `enc_data`         | 암호화된 요청 데이터                   |
| `token_version_id` | NICE v2 전용 — 토큰 버전 ID            |
| `integrity_value`  | NICE v2 전용 — HMAC-SHA256 무결성 값   |
| `scheme_url`       | PASS 앱투앱 스킴 URL (모바일, 해당 시) |

---

### POST /v1/identity/callback

중계사 콜백을 수신합니다. **서버→서버** 또는 **팝업→서버** 호출입니다.

**인증:** 없음 (외부 중계사 호출)

**Content-Type:** `application/x-www-form-urlencoded` 또는 `application/json`

**Form 파라미터 (NICE):**

| 필드               | 설명               |
| ------------------ | ------------------ |
| `enc_data`         | 암호화된 인증 결과 |
| `token_version_id` | 토큰 버전 ID       |

**Form 파라미터 (KMC):**

| 필드       | 설명               |
| ---------- | ------------------ |
| `rec_cert` | 암호화된 인증 결과 |

**Query 파라미터:**

| 필드       | 설명                                       |
| ---------- | ------------------------------------------ |
| `provider` | 프로바이더 식별 (기본: config의 `default`) |

**Response:** HTML — `window.opener.postMessage`로 결과를 프론트엔드에 전달

```javascript
// 프론트엔드에서 수신하는 메시지
window.addEventListener("message", function (event) {
    if (event.data.type === "identity_verification") {
        console.log(event.data.request_id); // 요청 ID
        console.log(event.data.status); // "verified" | "failed"
    }
});
```

---

### GET /v1/identity/result/:request_id

인증 결과를 조회합니다. 개인정보는 마스킹되어 반환됩니다.

**인증:** JWT 선택

**Path 파라미터:**

| 필드         | 설명               |
| ------------ | ------------------ |
| `request_id` | 요청 ID (64자 hex) |

**Response (200) — 인증 완료:**

```json
{
    "ok": true,
    "data": {
        "status": "verified",
        "name": "홍*동",
        "birth_date": "1990****",
        "gender": "M",
        "phone": "010****5678",
        "verified_at": "2026-03-01T14:30:00+09:00",
        "is_duplicate": false,
        "account_linked": true
    }
}
```

| 필드             | 설명                                       |
| ---------------- | ------------------------------------------ |
| `status`         | `pending`, `verified`, `failed`, `expired` |
| `name`           | 마스킹된 이름 (`홍*동`)                    |
| `birth_date`     | 마스킹된 생년월일 (`1990****`)             |
| `gender`         | `M` 또는 `F`                               |
| `phone`          | 마스킹된 전화번호 (`010****5678`)          |
| `verified_at`    | 인증 완료 시각 (RFC3339)                   |
| `is_duplicate`   | CI 기반 중복 가입 여부                     |
| `account_linked` | 계정 연결 여부                             |

**마스킹 규칙:**

| 대상       | 원본          | 마스킹 결과   |
| ---------- | ------------- | ------------- |
| 이름       | `홍길동`      | `홍*동`       |
| 이름 (2자) | `홍길`        | `홍길`        |
| 전화번호   | `01012345678` | `010****5678` |
| 생년월일   | `19900115`    | `1990****`    |

---

### POST /v1/identity/verify-ci

CI 해시로 중복 가입 여부를 확인합니다.

**인증:** JWT 필수 (권장)

**Request Body:**

```json
{
    "ci_hash": "e3b0c44298fc1c149afbf4c8996fb924..."
}
```

**Response (200):**

```json
{
    "ok": true,
    "data": {
        "exists": true,
        "account_seq": 42
    }
}
```

---

## 4. 엔티티

### identity_verification

본인인증 요청 및 결과를 저장하는 시스템 엔티티입니다.

**위치:** `entities/System/Auth/identity_verification.json`

| 필드            | 타입   | 설명                                                            |
| --------------- | ------ | --------------------------------------------------------------- |
| **index**       |        |                                                                 |
| `request_id`    | string | 고유 요청 ID (unique)                                           |
| `status`        | enum   | pending/verified/failed/expired                                 |
| `purpose`       | enum   | signup/find_account/password_reset/adult_verify/identity_change |
| `provider`      | enum   | nice/kmc/danal                                                  |
| **fields**      |        |                                                                 |
| `ci_hash`       | string | CI의 SHA-256 해시                                               |
| `di`            | string | DI 원문 (암호화 저장)                                           |
| `name`          | string | 인증된 실명                                                     |
| `birth_date`    | string | 생년월일 (YYYYMMDD)                                             |
| `gender`        | string | 성별 (M/F)                                                      |
| `carrier`       | string | 통신사 코드                                                     |
| `phone`         | string | 인증 휴대폰 번호                                                |
| `nationality`   | string | 내/외국인 (local/foreign)                                       |
| `account_seq`   | int    | 연결된 계정 seq                                                 |
| `ip_address`    | string | 요청 IP                                                         |
| `user_agent`    | string | User-Agent                                                      |
| `verified_at`   | string | 인증 완료 시각                                                  |
| `expires_at`    | string | 요청 만료 시각                                                  |
| `error_message` | string | 실패 에러 메시지                                                |
| `raw_response`  | json   | 중계사 원본 응답 (디버깅)                                       |

> `data_encryption`은 기본값이 `true`이므로 CI, DI 등 개인정보는 자동으로 암호화 저장됩니다.

### account 엔티티 확장 필드

본인인증 완료 시 계정에 다음 필드가 추가됩니다:

| 필드                  | 타입   | 설명                  |
| --------------------- | ------ | --------------------- |
| `ci_hash`             | string | CI 해시 (중복 조회용) |
| `identity_verified`   | bool   | 본인인증 완료 여부    |
| `identity_name`       | string | 인증된 실명           |
| `identity_birth_date` | string | 인증된 생년월일       |
| `identity_gender`     | string | 인증된 성별           |

---

## 5. 보안

### CI/DI 관리

- **CI 원문은 서버에 저장하지 않습니다.** SHA-256 해시만 저장하여 중복 조회에 사용합니다.
- DI는 엔티티 `data_encryption`에 의해 AES 암호화되어 DB에 저장됩니다.
- 콜백 처리 후 중계사 원본 응답(`raw_response`)은 디버깅 목적으로만 보관합니다.

### 암호화 방식 (프로바이더별)

| 프로바이더 | 요청 암호화 | 키 파생                                                     | 무결성 검증 |
| ---------- | ----------- | ----------------------------------------------------------- | ----------- |
| NICE       | AES-128-CBC | SHA-256(token_val) → key[0:16], iv[16:32]                   | HMAC-SHA256 |
| KMC        | 3DES-CBC    | SHA-256(cert_key) → key[0:24], iv[24:32]                    | -           |
| Danal      | AES-256-CBC | SHA-256(client_secret) → key, SHA-256(client_id) → iv[0:16] | -           |

### NICE token_val 캐시

NICE v2에서 콜백 복호화 시 `token_val`(요청 시 받은 키)이 필요합니다.  
서버는 요청 생성 시 `token_version_id` → `token_val` 매핑을 인메모리 캐시에 저장하며,  
콜백 처리 후 즉시 삭제합니다 (일회용).

### JWT SkipPaths

본인인증 전체 경로 `/v1/identity/`는 JWT 인증을 건너뜁니다:

- `/v1/identity/callback` — 외부 중계사 콜백 (인증 불가)
- `/v1/identity/request` — 비로그인 상태에서도 인증 요청 가능 (회원가입, 계정찾기)
- `/v1/identity/result/:request_id` — request_id 자체가 인증 토큰 역할

> `verify-ci`는 SkipPath에 포함되지만, 실 운영에서는 추가 검증을 권장합니다.

### Rate Limit

| 제한 기준   | 기본값 | 설정 필드                        |
| ----------- | ------ | -------------------------------- |
| IP당 시간당 | 10회   | `rate_limit.per_ip_per_hour`     |
| 계정당 일   | 5회    | `rate_limit.per_account_per_day` |

---

## 6. 프론트엔드 연동

### 팝업 방식

```javascript
// 1. 인증 요청 생성
const resp = await fetch("/v1/identity/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: "signup", method: "popup" }),
});
const { data } = await resp.json();

// 2. 팝업 오픈
const popup = window.open(data.popup_url, "identity", "width=500,height=600");

// 3. postMessage 수신
window.addEventListener("message", async function (event) {
    if (event.data.type !== "identity_verification") return;

    if (event.data.status === "verified") {
        // 4. 결과 조회
        const result = await fetch(
            `/v1/identity/result/${event.data.request_id}`,
        );
        const { data: resultData } = await result.json();
        console.log("인증 완료:", resultData);
    } else {
        console.error("인증 실패");
    }
});
```

### NICE v2 Form Submit 방식

NICE v2는 `enc_data`를 폼으로 제출하는 방식도 지원합니다:

```html
<form id="identityForm" method="post" action="">
    <input type="hidden" id="m" name="m" value="service" />
    <input
        type="hidden"
        id="token_version_id"
        name="token_version_id"
        value=""
    />
    <input type="hidden" id="enc_data" name="enc_data" value="" />
    <input type="hidden" id="integrity_value" name="integrity_value" value="" />
</form>

<script>
    async function startVerification() {
        const resp = await fetch("/v1/identity/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ purpose: "signup" }),
        });
        const { data } = await resp.json();

        const form = document.getElementById("identityForm");
        form.action = data.popup_url;
        document.getElementById("token_version_id").value =
            data.token_version_id;
        document.getElementById("enc_data").value = data.enc_data;
        document.getElementById("integrity_value").value = data.integrity_value;

        window.open("", "identity", "width=500,height=600");
        form.target = "identity";
        form.submit();
    }
</script>
```

---

## 7. 운영

### 배너 확인

서버 시작 시 배너에서 본인인증 상태를 확인할 수 있습니다:

```
│  Identity  enabled          Timezone   Asia/Seoul      │
```

`enabled`가 표시되면 `configs/auth/identity.json`이 정상 로드된 것입니다.

### 상태 전이

```
pending → verified    (콜백 성공)
pending → failed      (콜백 실패)
pending → expired     (TTL 초과)
```

- `pending` 상태의 요청만 콜백을 받을 수 있습니다.
- 이미 처리된 요청(`verified`, `failed`, `expired`)은 재처리되지 않습니다.

### 로그

```
[INFO]  identity: config disabled via identity.json (enabled=false)
[WARN]  identity: create request failed: ...
[WARN]  identity: callback failed: ...
[WARN]  identity: failed to save result: ...
[WARN]  identity: failed to link account CI: ...
```

### 만료 처리

- 요청 TTL(`request_ttl_sec`, 기본 300초)이 지난 `pending` 요청은 콜백 시 자동으로 `expired`로 변경됩니다.
- 결과 TTL(`result_ttl_sec`, 기본 600초)은 `GetResult` 호출 시 반환 기한으로 사용됩니다.
- `CleanExpiredTokens()`로 NICE token_val 캐시를 주기적으로 정리합니다.

---

## 8. 장애 대응

### 본인인증 비활성화

`configs/auth/identity.json`에서 `enabled`를 `false`로 변경한 뒤 서버를 재시작합니다:

```json
{
    "enabled": false
}
```

또는 파일 자체를 제거하면 자동으로 비활성화됩니다.

### 콜백 수신 실패

**증상:** 팝업에서 인증 완료 후 결과가 전달되지 않음

**확인 사항:**

1. `return_url`이 외부에서 접근 가능한 URL인지 확인
2. HTTPS 인증서 유효성 확인
3. 방화벽/보안그룹에서 중계사 IP 허용 여부 확인
4. 서버 로그에서 `[WARN] identity: callback failed` 확인

### NICE Access Token 만료

NICE OAuth2 Access Token은 자동으로 캐시되며 만료 시 재발급됩니다.  
지속적으로 토큰 발급이 실패하면:

1. `NICE_CLIENT_ID`, `NICE_CLIENT_SECRET` 환경 변수 확인
2. `token_url` 서버 접근 가능 여부 확인
3. NICE 관리자 페이지에서 API 키 상태 확인

### CI 중복 오탐

CI 해시 충돌(SHA-256)은 사실상 발생하지 않으나, 테스트 환경에서 같은 사용자가 여러 계정으로 테스트하는 경우 중복으로 감지될 수 있습니다.

`duplicate_ci_check`를 `false`로 설정하면 중복 검사를 비활성화할 수 있습니다.

---

## 9. 파일 구조

```
internal/identity/
  types.go              ← 상수, 타입 정의
  client.go             ← IdentityClient 인터페이스, 팩토리
  crypto.go             ← 암호화 유틸 (AES-CBC, 3DES-CBC, HMAC)
  client_nice.go        ← NICE CheckPlus v2 어댑터
  client_kmc.go         ← KMC 한국모바일인증 어댑터
  client_danal.go       ← Danal 어댑터
  entity_adapter.go     ← EntityService → IdentityQuerier 브릿지
  service.go            ← 비즈니스 로직

internal/types/
  identity_config.go    ← 설정 타입

internal/config/
  identity_loader.go    ← 설정 로더

internal/handler/
  identity_handler.go   ← API 핸들러

internal/router/
  identity_routes.go    ← 라우트 등록

entities/System/Auth/
  identity_verification.json  ← 엔티티 정의

configs/auth/
  identity.json               ← 설정 파일

configs-example/auth/
  identity.json.example       ← 설정 예제
```
