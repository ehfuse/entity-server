# 본인인증 라우트

`/v1/identity` 엔드포인트 상세 가이드입니다.

> 본인인증 API는 `configs/identity.json`이 설정된 경우에만 활성화됩니다.

- 공통 인증 헤더 및 에러 응답 형식은 [API 라우트](api-routes.md)를 참조하세요.

<a id="summary"></a>

## 목록

| No. | 항목                                   | 메서드 | 경로                                 | 인증        |
| --- | -------------------------------------- | ------ | ------------------------------------ | ----------- |
| 1   | [인증 요청 생성](#identity-request)    | `POST` | `/v1/identity/request`               | 인증 불필요 |
| 2   | [중계사 콜백 수신](#identity-callback) | `POST` | `/v1/identity/callback`              | 인증 불필요 |
| 3   | [인증 결과 조회](#identity-result)     | `GET`  | `/v1/identity/result/:request_id`    | 인증 불필요 |
| 4   | [CI 중복 확인](#identity-verify-ci)    | `POST` | `/v1/identity/verify-ci`             | JWT         |

> `/v1/identity/` 경로 전체는 JWT 미들웨어 스킵 대상입니다.  
> CI 중복 확인(`verify-ci`)은 내부 서버 간 호출용입니다.

---

<a id="identity-request"></a>

### 1. 인증 요청 생성

본인인증 세션을 생성하고 중계사(NICE, KMC 등)에 전달할 파라미터를 반환합니다.

**엔드포인트**: `POST /v1/identity/request`

**요청 본문**:

| 필드       | 타입     | 필수 | 설명                                                       |
| ---------- | -------- | ---- | ---------------------------------------------------------- |
| `purpose`  | `string` | ✅   | 인증 목적 (예: `signup`, `find_id`, `change_phone`)        |
| `method`   | `string` |      | 인증 수단: `phone`(기본), `card`, `ipin`                   |
| `provider` | `string` |      | 중계사 (미지정 시 기본 프로바이더)                          |

**요청 예시**:

```bash
curl -X POST http://localhost:47200/v1/identity/request \
  -H "Content-Type: application/json" \
  -d '{"purpose": "signup", "method": "phone"}'
```

**성공 응답** (`200`):

```json
{
  "ok": true,
  "data": {
    "request_id": "a1b2c3d4e5f6...64자 hex",
    "provider": "nice",
    "enc_data": "...",
    "token_version_id": "...",
    "integrity_value": "...",
    "callback_url": "https://your-server.com/v1/identity/callback"
  }
}
```

> 반환된 파라미터를 NICE/KMC SDK에 전달하여 본인인증 팝업을 띄웁니다.

↑ [목록으로 이동](#summary)

---

<a id="identity-callback"></a>

### 2. 중계사 콜백 수신

중계사(NICE, KMC)가 인증 완료 후 서버로 POST하는 콜백을 수신합니다.  
결과를 복호화하여 `identity_verification` 엔티티에 저장하고, 프론트엔드에 HTML(postMessage)로 결과를 전달합니다.

> **인증 불필요** — 중계사에서 직접 호출합니다.  
> `Content-Type`은 `application/x-www-form-urlencoded`(NICE/KMC) 또는 JSON 모두 지원합니다.

**엔드포인트**: `POST /v1/identity/callback`

**요청 (NICE/KMC form-urlencoded)**:

| 필드               | 설명                              |
| ------------------ | --------------------------------- |
| `enc_data`         | 암호화된 인증 결과 데이터         |
| `token_version_id` | 토큰 버전 ID (NICE)               |
| `rec_cert`         | 인증서 데이터 (KMC, `enc_data` 대체) |

**응답**: HTML 페이지 (팝업 닫기 + `window.postMessage`)

```html
<!-- 성공 시 -->
<script>
  window.opener.postMessage({ status: "verified", request_id: "..." }, "*");
  window.close();
</script>
```

↑ [목록으로 이동](#summary)

---

<a id="identity-result"></a>

### 3. 인증 결과 조회

`request_id`로 완료된 본인인증 결과를 조회합니다.  
인증 팝업 닫힘 후 프론트엔드에서 `postMessage`로 받은 `request_id`를 사용합니다.

**엔드포인트**: `GET /v1/identity/result/:request_id`

**경로 파라미터**:

| 파라미터     | 설명                     |
| ------------ | ------------------------ |
| `request_id` | 인증 요청 ID (64자 hex)  |

**요청 예시**:

```bash
curl http://localhost:47200/v1/identity/result/a1b2c3d4e5f6...
```

**성공 응답** (`200`):

```json
{
  "ok": true,
  "data": {
    "request_id": "a1b2c3d4e5f6...",
    "status": "verified",
    "name": "홍길동",
    "birth_date": "19900101",
    "gender": "M",
    "phone": "01012345678",
    "ci_hash": "SHA256 해시값",
    "di_hash": "SHA256 해시값",
    "verified_at": "2024-12-01 10:30:00"
  }
}
```

**오류 응답**:

| 코드 | 원인                                              |
| ---- | ------------------------------------------------- |
| 400  | `request_id` 형식 오류                            |
| 404  | 요청 없음 또는 아직 인증 미완료                   |

↑ [목록으로 이동](#summary)

---

<a id="identity-verify-ci"></a>

### 4. CI 중복 확인

CI 해시가 이미 `account` 엔티티에 등록된 사용자와 연결되어 있는지 확인합니다.  
회원가입 중복 체크에 활용합니다.

> JWT가 있어야 호출 가능합니다 (내부 서버 간 호출 용도).

**엔드포인트**: `POST /v1/identity/verify-ci`

**요청 본문**:

| 필드      | 타입     | 필수 | 설명                             |
| --------- | -------- | ---- | -------------------------------- |
| `ci_hash` | `string` | ✅   | 인증 결과에서 받은 CI SHA-256 값 |

**성공 응답** (`200`):

```json
{
  "ok": true,
  "data": {
    "exists": true,
    "account_seq": 42
  }
}
```

```json
{
  "ok": true,
  "data": {
    "exists": false
  }
}
```

↑ [목록으로 이동](#summary)

---

## 전체 흐름 요약

```
1. 클라이언트: POST /v1/identity/request  → enc_data, token_version_id 수신
2. 클라이언트: NICE/KMC 팝업 표시 (SDK 호출)
3. 사용자: 본인인증 완료
4. 중계사: POST /v1/identity/callback (form-urlencoded)
5. 서버: 복호화 → identity_verification 저장 → HTML postMessage 응답
6. 클라이언트: window.postMessage → request_id 수신
7. 클라이언트: GET /v1/identity/result/:request_id → 이름, 생년월일, 전화번호 확인
```

## 관련 문서

- [API 라우트](api-routes.md)
- [인증 라우트](auth-routes.md)
