# 2FA 가이드 (Two-Factor Authentication Guide)

> 대상: 운영/인프라/SRE/온콜 엔지니어, 개발자  
> 범위: Entity Server TOTP 기반 2단계 인증 — 설정, API, 운영, 장애 대응

---

## 개요

Entity Server는 **TOTP (Time-based One-Time Password, RFC 6238)** 기반의 2단계 인증을 지원합니다.  
Google Authenticator, Microsoft Authenticator, Authy 등 표준 TOTP 앱과 호환됩니다.

### 핵심 특성

| 항목           | 설명                                                            |
| -------------- | --------------------------------------------------------------- |
| 알고리즘       | **HMAC-SHA1** (RFC 6238 표준)                                   |
| 코드 길이      | 6자리 (설정 가능)                                               |
| 주기           | 30초 (설정 가능)                                                |
| 시간 오차 허용 | ±1 스텝 (±30초, `skew` 설정)                                    |
| 복구 코드      | 8자리 HEX × 10개 (SHA-256 해시 저장, 일회용 소멸)               |
| 잠금 정책      | 5회 실패 → 300초 잠금 (설정 가능)                               |
| 역할 강제      | `enforce_roles`로 특정 역할에 2FA 설정 의무화                   |
| 토큰           | JWT 기반 임시 토큰 (`two_factor_token`, `setup_token`), 5분 TTL |

---

## 인증 흐름

### 일반 로그인 (2FA 활성 계정)

```
[Client]
  → POST /v1/auth/login { email, passwd }

[Server — 비밀번호 검증 성공]
  ← 200 { ok: true, requires_2fa: true, data: { two_factor_token, expires_in } }

[Client]
  → POST /v1/auth/2fa/verify { two_factor_token, code: "123456" }

[Server — TOTP 검증 성공]
  ← 200 { ok: true, data: { access_token, refresh_token, expires_in } }
```

### OAuth 로그인 (2FA 활성 계정)

```
[Client]
  → GET /v1/oauth/google
  → ... OAuth 콜백 ...

[Server — OAuth 성공, 2FA 활성]
  ← 302 <redirect_url>?2fa_required=true&2fa_token=<token>

[Client]
  → POST /v1/auth/2fa/verify { two_factor_token, code: "123456" }
  ← 200 { access_token, refresh_token, expires_in }
```

### 강제 역할 2FA 설정 흐름 (`enforce_roles`)

```
[Client]
  → POST /v1/auth/login { email, passwd }

[Server — 비밀번호 검증 성공, enforce_roles 대상인데 2FA 미설정]
  ← 403 { ok: false, error: "2fa_setup_required", data: { setup_token, expires_in } }

[Client]
  → POST /v1/auth/2fa/setup   (JWT 또는 setup_token 인증)
  ← { secret, qr_code, otpauth_url, setup_token }

[Client — Authenticator 앱에 QR 등록 후]
  → POST /v1/auth/2fa/setup/verify { code: "123456", setup_token }
  ← { recovery_codes: [...], message: "..." }

[Client — 다시 로그인]
  → POST /v1/auth/login { email, passwd }
  ← { requires_2fa: true, two_factor_token }
  → POST /v1/auth/2fa/verify { two_factor_token, code }
  ← { access_token, refresh_token }
```

### 복구 코드 로그인 (앱 분실)

```
[Client]
  → POST /v1/auth/login { email, passwd }
  ← { requires_2fa: true, two_factor_token }

[Client — TOTP 앱 사용 불가]
  → POST /v1/auth/2fa/recovery { two_factor_token, recovery_code: "A1B2C3D4" }
  ← { access_token, refresh_token, remaining_recovery_codes: 9 }
```

---

## 1. 설정

### 1.1 설정 파일

파일: `configs/auth/security.json` — `two_factor` 블록

```json
{
    "two_factor": {
        "enabled": true,
        "issuer": "EntityServer",
        "enforce_roles": ["admin"],
        "code_digits": 6,
        "period_sec": 30,
        "skew": 1,
        "recovery_code_count": 10,
        "setup_token_ttl_sec": 300,
        "max_verify_attempts": 5,
        "verify_lockout_sec": 300
    }
}
```

| 필드                  | 설명                                                   | 기본값         |
| --------------------- | ------------------------------------------------------ | -------------- |
| `enabled`             | 2FA 기능 활성화 토글                                   | `false`        |
| `issuer`              | Authenticator 앱에 표시되는 발급자 이름                | `EntityServer` |
| `enforce_roles`       | 2FA 설정이 필수인 RBAC 역할 목록 (빈 배열 = 강제 없음) | `[]`           |
| `code_digits`         | OTP 코드 자릿수                                        | `6`            |
| `period_sec`          | OTP 코드 갱신 주기 (초)                                | `30`           |
| `skew`                | 시간 오차 허용 스텝 수 (±N)                            | `1`            |
| `recovery_code_count` | 복구 코드 생성 수                                      | `10`           |
| `setup_token_ttl_sec` | 설정/검증 토큰 유효 시간 (초)                          | `300` (5분)    |
| `max_verify_attempts` | 연속 실패 허용 횟수                                    | `5`            |
| `verify_lockout_sec`  | 잠금 해제까지 대기 시간 (초)                           | `300` (5분)    |

### 1.2 활성화 조건

2FA가 동작하려면 다음 조건이 **모두** 충족되어야 합니다:

1. `configs/auth/security.json`에 `two_factor.enabled: true`
2. JWT 인증이 활성화된 상태 (`configs/auth/jwt.json`의 `enabled: true`)
3. `entities/System/Auth/account.json`에 `totp_*` 필드 존재

### 1.3 account 엔티티 필드

2FA 활성화 시 account 엔티티에 자동으로 추가되는 필드:

| 필드                   | 타입         | 설명                          |
| ---------------------- | ------------ | ----------------------------- |
| `totp_secret`          | varchar(64)  | Base32 인코딩된 TOTP 비밀 키  |
| `totp_enabled`         | bool         | 2FA 활성화 여부               |
| `totp_enabled_time`    | nullable     | 2FA 활성화 시각               |
| `totp_recovery_codes`  | varchar(500) | SHA-256 해시 목록 (JSON 배열) |
| `totp_failed_attempts` | uint         | 연속 검증 실패 횟수           |
| `totp_locked_until`    | nullable     | 잠금 해제 시각                |

### 1.4 서버 기동 로그 확인

```
[2fa] two-factor authentication enabled (issuer=EntityServer, enforce=[admin])
```

비활성화 시:

```
[2fa] two-factor authentication is disabled
```

---

## 2. API 엔드포인트

### 2.1 라우트 요약

#### 인증 필요 (JWT Bearer)

| 메서드 | 경로                               | 설명                         |
| ------ | ---------------------------------- | ---------------------------- |
| POST   | `/v1/auth/2fa/setup`               | 2FA 설정 시작 (QR + 비밀 키) |
| POST   | `/v1/auth/2fa/setup/verify`        | 2FA 설정 확인 (TOTP 검증)    |
| DELETE | `/v1/auth/2fa`                     | 2FA 비활성화                 |
| GET    | `/v1/auth/2fa/status`              | 2FA 상태 조회                |
| POST   | `/v1/auth/2fa/recovery/regenerate` | 복구 코드 재생성             |

#### 인증 불필요 (임시 토큰)

| 메서드 | 경로                    | 설명                      |
| ------ | ----------------------- | ------------------------- |
| POST   | `/v1/auth/2fa/verify`   | TOTP 코드 검증 → JWT 발급 |
| POST   | `/v1/auth/2fa/recovery` | 복구 코드 검증 → JWT 발급 |

#### 관리자 전용

| 메서드 | 경로                          | 설명                 |
| ------ | ----------------------------- | -------------------- |
| DELETE | `/v1/admin/accounts/:seq/2fa` | 관리자 2FA 강제 해제 |

### 2.2 POST /v1/auth/2fa/setup

2FA 설정을 시작합니다. TOTP 비밀 키를 생성하고 QR 코드를 반환합니다.

**인증:** JWT Bearer 필요

**응답:**

```json
{
    "ok": true,
    "data": {
        "secret": "JBSWY3DPEHPK3PXP",
        "qr_code": "data:image/png;base64,...",
        "otpauth_url": "otpauth://totp/EntityServer:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=EntityServer&algorithm=SHA1&digits=6&period=30",
        "setup_token": "eyJ..."
    }
}
```

| 필드          | 설명                                               |
| ------------- | -------------------------------------------------- |
| `secret`      | Authenticator 앱에 수동 입력 시 사용하는 비밀 키   |
| `qr_code`     | Data URI (PNG) — Authenticator 앱으로 스캔         |
| `otpauth_url` | otpauth:// URI (Deep Link용)                       |
| `setup_token` | 설정 확인용 임시 토큰 (`setup_token_ttl_sec` 유효) |

**오류:**

| 코드 | 원인              |
| ---- | ----------------- |
| 401  | 인증 실패         |
| 409  | 이미 2FA 활성화됨 |

### 2.3 POST /v1/auth/2fa/setup/verify

Authenticator 앱에 등록한 후 TOTP 코드로 설정을 확인합니다.  
성공 시 2FA가 활성화되고 복구 코드가 반환됩니다.

**인증:** JWT Bearer 또는 `setup_token` (body)

**요청:**

```json
{
    "code": "123456",
    "setup_token": "eyJ..."
}
```

- `setup_token`은 `enforce_roles` 강제 설정 흐름에서 JWT 없이 인증할 때 사용합니다.
- JWT가 있으면 `setup_token`은 생략 가능합니다.

**응답:**

```json
{
    "ok": true,
    "data": {
        "recovery_codes": [
            "A1B2C3D4",
            "E5F6A7B8",
            "C9D0E1F2",
            "A3B4C5D6",
            "E7F8A9B0",
            "C1D2E3F4",
            "A5B6C7D8",
            "E9F0A1B2",
            "C3D4E5F6",
            "A7B8C9D0"
        ],
        "message": "복구 코드를 안전한 곳에 저장하세요. 이 코드는 다시 표시되지 않습니다."
    }
}
```

> **중요:** 복구 코드는 이 응답에서 **한 번만** 평문으로 표시됩니다.  
> 서버에는 SHA-256 해시만 저장되므로 이후에는 복구 불가능합니다.

### 2.4 POST /v1/auth/2fa/verify

로그인 후 TOTP 코드를 검증하고 JWT 토큰 쌍을 발급합니다.

**인증:** 불필요 (`two_factor_token` 사용)

**요청:**

```json
{
    "two_factor_token": "eyJ...",
    "code": "123456"
}
```

**응답 (성공):**

```json
{
    "ok": true,
    "data": {
        "access_token": "eyJ...",
        "refresh_token": "eyJ...",
        "expires_in": 3600
    }
}
```

**오류:**

| 코드 | 원인                             |
| ---- | -------------------------------- |
| 400  | 필수 필드 누락                   |
| 401  | 임시 토큰 만료/변조, TOTP 불일치 |
| 429  | 실패 횟수 초과 (잠금)            |

### 2.5 POST /v1/auth/2fa/recovery

복구 코드로 로그인합니다. 사용된 코드는 즉시 소멸됩니다.

**인증:** 불필요 (`two_factor_token` 사용)

**요청:**

```json
{
    "two_factor_token": "eyJ...",
    "recovery_code": "A1B2C3D4"
}
```

**응답:**

```json
{
    "ok": true,
    "data": {
        "access_token": "eyJ...",
        "refresh_token": "eyJ...",
        "expires_in": 3600,
        "remaining_recovery_codes": 9,
        "message": "복구 코드로 로그인했습니다. 새 복구 코드 생성을 권장합니다."
    }
}
```

### 2.6 DELETE /v1/auth/2fa

본인 2FA를 비활성화합니다.

**인증:** JWT Bearer 필요

**요청:**

```json
{
    "passwd": "my_password",
    "code": "123456"
}
```

- `passwd`: 비밀번호 기반 계정인 경우 필수, OAuth 전용 계정은 생략 가능
- `code`: 현재 TOTP 코드 (필수)

**응답:**

```json
{
    "ok": true,
    "message": "2FA가 비활성화되었습니다."
}
```

### 2.7 GET /v1/auth/2fa/status

현재 계정의 2FA 활성화 상태를 조회합니다.

**인증:** JWT Bearer 필요

**응답:**

```json
{
    "ok": true,
    "data": {
        "enabled": true,
        "enabled_time": "2026-03-01 14:30:00",
        "remaining_recovery_codes": 8
    }
}
```

### 2.8 POST /v1/auth/2fa/recovery/regenerate

복구 코드를 전부 재생성합니다. 기존 코드는 모두 폐기됩니다.

**인증:** JWT Bearer + TOTP 코드 필요

**요청:**

```json
{
    "code": "123456"
}
```

**응답:**

```json
{
    "ok": true,
    "data": {
        "recovery_codes": ["A1B2C3D4", "..."],
        "message": "기존 복구 코드가 모두 폐기되고 새로 생성되었습니다."
    }
}
```

### 2.9 DELETE /v1/admin/accounts/:seq/2fa

관리자가 특정 계정의 2FA를 강제 해제합니다.

**인증:** JWT Bearer (admin 역할)

**응답:**

```json
{
    "ok": true,
    "message": "2FA disabled for account 42"
}
```

| 코드 | 원인                       |
| ---- | -------------------------- |
| 400  | 잘못된 seq 또는 2FA 미활성 |
| 403  | admin이 아님               |
| 404  | 계정 없음                  |

---

## 3. curl 예시

### 3.1 2FA 설정

```bash
# 1단계: 2FA 설정 시작
TOKEN="<access_token>"
curl -s -X POST http://localhost:8080/v1/auth/2fa/setup \
  -H "Authorization: Bearer $TOKEN" | jq .

# 응답에서 secret, qr_code 확인 → Authenticator 앱에 등록

# 2단계: TOTP 코드로 설정 확인
curl -s -X POST http://localhost:8080/v1/auth/2fa/setup/verify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"123456"}' | jq .

# 응답의 recovery_codes를 안전한 곳에 저장!
```

### 3.2 2FA 로그인

```bash
# 1단계: 일반 로그인 (2FA 필요 응답)
RESPONSE=$(curl -s -X POST http://localhost:8080/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","passwd":"secret"}')

echo "$RESPONSE" | jq .
# { "ok": true, "requires_2fa": true, "data": { "two_factor_token": "..." } }

# 2단계: TOTP 코드로 완료
TFA_TOKEN=$(echo "$RESPONSE" | jq -r '.data.two_factor_token')
curl -s -X POST http://localhost:8080/v1/auth/2fa/verify \
  -H "Content-Type: application/json" \
  -d "{\"two_factor_token\":\"$TFA_TOKEN\",\"code\":\"$(oathtool -b --totp <SECRET>)\"}" | jq .
```

### 3.3 복구 코드 로그인

```bash
curl -s -X POST http://localhost:8080/v1/auth/2fa/recovery \
  -H "Content-Type: application/json" \
  -d "{\"two_factor_token\":\"$TFA_TOKEN\",\"recovery_code\":\"A1B2C3D4\"}" | jq .
```

### 3.4 2FA 비활성화

```bash
curl -s -X DELETE http://localhost:8080/v1/auth/2fa \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"passwd":"secret","code":"123456"}'
```

### 3.5 상태 확인

```bash
curl -s http://localhost:8080/v1/auth/2fa/status \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### 3.6 복구 코드 재생성

```bash
curl -s -X POST http://localhost:8080/v1/auth/2fa/recovery/regenerate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"123456"}' | jq .
```

### 3.7 관리자 2FA 강제 해제

```bash
ADMIN_TOKEN="<admin_access_token>"
curl -s -X DELETE http://localhost:8080/v1/admin/accounts/42/2fa \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## 4. 보안 모델

### 4.1 비밀 키 저장

- 비밀 키는 account 엔티티의 `totp_secret` 필드에 저장됩니다.
- `security.json`의 `enable_data_encryption: true` 시 AES-256으로 DB 레벨 암호화됩니다.
- 비밀 키는 2FA 설정 시 한 번만 클라이언트에 노출되며, 이후에는 QR 코드나 비밀 키를 재조회할 수 없습니다.

### 4.2 복구 코드

- 생성 시 8자리 HEX (4바이트 랜덤) × 10개
- **평문은 서버에 저장되지 않습니다.** SHA-256 해시만 JSON 배열로 `totp_recovery_codes`에 저장
- 각 복구 코드는 **일회용**으로, 사용 즉시 해시가 제거됩니다
- 복구 코드 소진 시 TOTP 앱이 없으면 관리자의 강제 해제만 가능합니다

### 4.3 임시 토큰

| 토큰               | 용도                              | 클레임 `purpose` | TTL                   |
| ------------------ | --------------------------------- | ---------------- | --------------------- |
| `two_factor_token` | 로그인 1단계 성공 후 2단계 검증용 | `2fa_verify`     | `setup_token_ttl_sec` |
| `setup_token`      | 강제 설정 흐름에서 JWT 대체       | `2fa_setup`      | `setup_token_ttl_sec` |

- 동일한 `JWT_SECRET`으로 서명 (HS256)
- 서버 재시작 후에도 유효 (stateless JWT)

### 4.4 잠금 메커니즘

- `max_verify_attempts`(기본 5) 연속 실패 시 `verify_lockout_sec`(기본 300초) 잠금
- 잠금 중 요청 시 `429 Too Many Requests` + 남은 잠금 시간 반환
- 성공적인 검증 시 실패 횟수 자동 리셋

### 4.5 시간 동기화

- TOTP는 서버와 클라이언트 시계가 동기화되어야 합니다
- `skew: 1`은 ±30초(1 step) 오차를 허용합니다
- 서버에 **NTP**가 올바르게 구성되어 있어야 합니다

### 4.6 이메일 알림

SMTP 서비스(`configs/smtp.json`)가 활성화되어 있으면, 2FA 관련 이벤트 시 사용자에게 자동으로 이메일이 발송됩니다.

| 이벤트           | 템플릿 파일                     | 제목                        | 포함 내용                            |
| ---------------- | ------------------------------- | --------------------------- | ------------------------------------ |
| 2FA 설정 완료    | `2fa_setup_complete.html`       | 2단계 인증 복구 코드        | 복구 코드 전문, 설정 시각, 보안 안내 |
| 복구 코드 재생성 | `2fa_recovery_regenerated.html` | 2단계 인증 복구 코드 재생성 | 새 복구 코드 전문, 재생성 시각       |
| 2FA 비활성화     | `2fa_disabled.html`             | 2단계 인증 비활성화 알림    | 해제 시각, 해제 방법(본인/관리자)    |

**동작 방식:**

- SMTP 서비스 미설정 시: 이메일 미발송 (경고 로그 없이 무시)
- SMTP 서비스 활성 시: `EnqueueJob` → DB 큐 → 백그라운드 워커가 비동기 전송
- 복구 코드는 이메일에 **평문**으로 포함되므로, 수신 이메일 보안이 중요합니다

**템플릿 변수:**

`2fa_setup_complete.html` / `2fa_recovery_regenerated.html`:

| 변수                  | 설명                         |
| --------------------- | ---------------------------- |
| `${email}`            | 사용자 이메일                |
| `${recovery_codes}`   | 복구 코드 (줄바꿈 구분)      |
| `${recovery_count}`   | 복구 코드 수                 |
| `${enabled_time}`     | 설정 시각 (setup_complete만) |
| `${regenerated_time}` | 재생성 시각 (regenerated만)  |

`2fa_disabled.html`:

| 변수               | 설명                                          |
| ------------------ | --------------------------------------------- |
| `${email}`         | 사용자 이메일                                 |
| `${disabled_time}` | 해제 시각                                     |
| `${disabled_by}`   | 해제 주체 ("본인 요청" 또는 "관리자 (seq=N)") |

> **보안 참고:** 복구 코드가 이메일로 전송되므로, 이메일 계정 보안이 2FA의 실질적 보안 수준을 결정합니다.  
> 운영 환경에서는 TLS 전송이 보장된 SMTP 프로바이더를 사용하세요.

---

## 5. enforce_roles (역할별 강제 적용)

`enforce_roles`에 역할을 지정하면, 해당 역할 사용자는 **로그인 시 2FA 미설정 상태에서 403 응답**을 받습니다.

### 5.1 설정 예시

```json
{
    "two_factor": {
        "enabled": true,
        "enforce_roles": ["admin", "editor"]
    }
}
```

### 5.2 동작

| 역할     | 2FA 설정 | 로그인 결과                                  |
| -------- | -------- | -------------------------------------------- |
| `admin`  | ✅       | `requires_2fa: true` → TOTP 검증 후 JWT 발급 |
| `admin`  | ❌       | `403: 2fa_setup_required` + `setup_token`    |
| `editor` | ✅       | `requires_2fa: true` → TOTP 검증 후 JWT 발급 |
| `editor` | ❌       | `403: 2fa_setup_required` + `setup_token`    |
| `viewer` | ✅       | `requires_2fa: true` → TOTP 검증 후 JWT 발급 |
| `viewer` | ❌       | 일반 로그인 (2FA 무시)                       |
| `user`   | ❌       | 일반 로그인 (2FA 무시)                       |

### 5.3 클라이언트 구현 참고

```javascript
const res = await fetch("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, passwd }),
});
const data = await res.json();

if (data.requires_2fa) {
    // 2FA 검증 화면으로 이동
    navigate("/2fa/verify", { state: { token: data.data.two_factor_token } });
} else if (data.error === "2fa_setup_required") {
    // 2FA 설정 화면으로 이동
    navigate("/2fa/setup", { state: { token: data.data.setup_token } });
} else if (data.ok) {
    // 일반 로그인 성공
    saveTokens(data.data);
}
```

---

## 6. 장애 대응

### 2FA 활성화 후 로그인이 안 됨

**증상:** 로그인 시 `requires_2fa: true` 응답 후 TOTP 검증 실패

점검:

- 서버 시간(NTP) 동기화 상태 확인
- Authenticator 앱의 시간이 정확한지 확인
- `timedatectl` 또는 `ntpstat`로 서버 시계 확인

조치:

```bash
# 서버 시간 확인
timedatectl status

# NTP 동기화 강제
sudo systemctl restart systemd-timesyncd
```

### 복구 코드 모두 소진

**증상:** TOTP 앱 분실 + 복구 코드 모두 사용됨

조치:

```bash
# 관리자가 2FA 강제 해제
ADMIN_TOKEN="<admin_token>"
curl -s -X DELETE http://localhost:8080/v1/admin/accounts/<seq>/2fa \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 429 잠금 발생

**증상:** `Too many failed attempts. Try again in N seconds.`

점검:

- `totp_failed_attempts`와 `totp_locked_until` 확인

조치:

- 기본 300초(5분) 대기
- 긴급 시: 관리자가 DB에서 직접 `totp_failed_attempts = 0`, `totp_locked_until = NULL` 초기화

### enforce_roles 적용 후 기존 사용자 로그인 불가

**증상:** `403: 2fa_setup_required`

원인: `enforce_roles`에 역할 추가 후, 해당 역할의 기존 사용자가 2FA 미설정

조치:

1. 클라이언트에서 `setup_token` 기반 2FA 설정 흐름 구현
2. 또는 `enforce_roles`를 단계적으로 적용 (공지 후 전환)

### 2FA 설정이 동작하지 않음

점검:

- 서버 로그에서 `[2fa] two-factor authentication enabled` 확인
- `configs/auth/security.json`의 `two_factor.enabled` 값 확인
- `entities/System/Auth/account.json`에 `totp_*` 필드 존재 확인

조치:

- `enabled: true` 설정 후 서버 재시작
- 엔티티 필드 누락 시 `./scripts/normalize-entities.sh --apply` 실행

---

## 7. 운영 원칙

- `totp_secret`은 **절대 로그에 기록하지 않습니다**
- 복구 코드 평문은 서버에 저장되지 않습니다 (SHA-256 해시만 저장)
- `enforce_roles` 변경 시 해당 역할 사용자에게 **사전 공지** 필수
- 복구 코드 잔여 수가 3개 이하이면 재생성 안내 권장
- 관리자 2FA 강제 해제는 별도 감사 로그에 기록됩니다 (`[INFO] Admin (seq=N) disabled 2FA for account seq=M`)
- 운영 환경에서 `enable_data_encryption: true`로 `totp_secret` 암호화 적극 권장

---

## 8. 빠른 점검 체크리스트

- [ ] `[2fa] two-factor authentication enabled` 로그 확인
- [ ] `POST /v1/auth/2fa/setup` → 200 + QR 코드 정상 반환
- [ ] Authenticator 앱으로 QR 스캔 후 6자리 코드 확인
- [ ] `POST /v1/auth/2fa/setup/verify` → 200 + 복구 코드 수신
- [ ] 로그인 시 `requires_2fa: true` 응답 확인
- [ ] `POST /v1/auth/2fa/verify` → 200 + JWT 토큰 쌍 발급
- [ ] `GET /v1/auth/2fa/status` → `enabled: true` 확인
- [ ] 복구 코드 로그인 + 잔여 코드 수 감소 확인
- [ ] 5회 실패 → 429 잠금 동작 확인
- [ ] 관리자 강제 해제 후 대상 계정 2FA 비활성화 확인
- [ ] NTP 동기화 상태 확인 (`timedatectl`)

---

## 9. 관련 문서

- [인증 가이드](auth-guide.md)
- [JWT 인증 가이드](jwt-auth-guide.md)
- [보안 설정 가이드](security.md)
- [암호화 가이드](encryption-guide.md)

---

## 10. 다음 문서

- [설정 가이드](../setup/config-guide.md)
- [API 라우트](../api-routes/api-routes.md)
- [운영 플레이북](../operations/operations-playbook.md)
- [목록으로 돌아가기](../README.md)
