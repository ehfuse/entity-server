# SMS 라우트

`/v1/sms` 엔드포인트 상세 가이드입니다.

> SMS API는 `configs/sms.json`이 설정된 경우에만 활성화됩니다.

- 공통 인증 헤더 및 에러 응답 형식은 [API 라우트](api-routes.md)를 참조하세요.
- SMS 설정, 프로바이더, MMS 첨부 등 운영 가이드는 [SMS 가이드](../notification/sms-guide.md)를 참조하세요.

<a id="summary"></a>

## 목록

| No. | 항목                                        | 메서드 | 경로                              | 인증        |
| --- | ------------------------------------------- | ------ | --------------------------------- | ----------- |
| 1   | [SMS/LMS/MMS 발송](#sms-send)               | `POST` | `/v1/sms/send`                    | API Key     |
| 2   | [발송 상태 조회](#sms-status)               | `GET`  | `/v1/sms/status/:seq`             | API Key     |
| 3   | [인증번호 발송](#sms-verification-send)     | `POST` | `/v1/sms/verification/send`       | 인증 불필요 |
| 4   | [인증번호 검증](#sms-verification-verify)   | `POST` | `/v1/sms/verification/verify`     | 인증 불필요 |

> **참고**: 엔티티 훅을 통한 SMS 발송(`sms_msg` insert)은 엔티티 CRUD API를 사용합니다.

---

<a id="sms-send"></a>

### 1. SMS/LMS/MMS 발송

SMS(90자 이하), LMS(장문), MMS(이미지+장문)를 발송 큐에 등록합니다.  
타입은 `content` 길이와 `image_url` 유무에 따라 자동 결정됩니다.

**엔드포인트**: `POST /v1/sms/send`

**요청 본문**:

| 필드         | 타입     | 필수 | 설명                                         |
| ------------ | -------- | ---- | -------------------------------------------- |
| `receiver`   | `string` | ✅   | 수신자 전화번호 (`01012345678` 형식)         |
| `content`    | `string` | ✅   | 메시지 본문 (90자 초과 시 LMS 자동 전환)     |
| `sender`     | `string` |      | 발신번호 (미지정 시 설정 기본값)             |
| `subject`    | `string` |      | 제목 (LMS/MMS 전용)                          |
| `image_url`  | `string` |      | 이미지 URL (MMS 자동 전환)                   |
| `provider`   | `string` |      | 프로바이더 키 (미지정 시 기본 프로바이더)    |
| `ref_entity` | `string` |      | 참조 엔티티 이름                             |
| `ref_seq`    | `int64`  |      | 참조 레코드 seq                              |

**요청 예시**:

```bash
# SMS
curl -X POST http://localhost:47200/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"receiver": "01012345678", "content": "안녕하세요, 확인 부탁드립니다."}'

# LMS (장문)
curl -X POST http://localhost:47200/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{
    "receiver": "01012345678",
    "subject": "주문 완료 안내",
    "content": "주문이 완료되었습니다. 주문번호: ORD-001\n배송 예정일: 2024-12-05\n감사합니다."
  }'

# MMS (이미지)
curl -X POST http://localhost:47200/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{
    "receiver": "01012345678",
    "subject": "이벤트 안내",
    "content": "이번 주 특별 혜택을 확인하세요!",
    "image_url": "https://your-cdn.com/event.jpg"
  }'
```

**성공 응답** (`200`):

```json
{
  "ok": true,
  "message": "SMS queued for delivery"
}
```

↑ [목록으로 이동](#summary)

---

<a id="sms-status"></a>

### 2. 발송 상태 조회

`sms_log` seq로 발송 상태를 확인합니다.

**엔드포인트**: `GET /v1/sms/status/:seq`

> **참고**: 상세 이력은 엔티티 API로 `sms_log` 엔티티를 직접 조회하는 것을 권장합니다.  
> `GET /v1/entity/sms_log/:seq`

**성공 응답** (`200`):

```json
{
  "ok": true,
  "message": "Use entity API to query sms_log with seq=1"
}
```

↑ [목록으로 이동](#summary)

---

<a id="sms-verification-send"></a>

### 3. 인증번호 발송

6자리 인증번호를 생성하여 지정 번호로 발송합니다.  
`sms_verification` 엔티티에 SHA-256 해시로 저장됩니다.

> **인증 불필요** — `/v1/sms/verification/` 경로는 JWT 스킵 대상입니다.

**엔드포인트**: `POST /v1/sms/verification/send`

**요청 본문**:

| 필드       | 타입     | 필수 | 설명                          |
| ---------- | -------- | ---- | ----------------------------- |
| `phone`    | `string` | ✅   | 전화번호 (`01012345678` 형식) |
| `purpose`  | `string` |      | 용도 (예: `signup`, `login`)  |

**요청 예시**:

```bash
curl -X POST http://localhost:47200/v1/sms/verification/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "01012345678", "purpose": "signup"}'
```

**성공 응답** (`200`):

```json
{
  "ok": true,
  "message": "verification code sent",
  "expires_in": 300
}
```

**오류 응답**:

| 코드 | 원인                           |
| ---- | ------------------------------ |
| 400  | phone 누락                     |
| 429  | 발송 횟수 초과 (rate limit)     |

↑ [목록으로 이동](#summary)

---

<a id="sms-verification-verify"></a>

### 4. 인증번호 검증

사용자가 입력한 인증번호가 올바른지 확인합니다.

**엔드포인트**: `POST /v1/sms/verification/verify`

**요청 본문**:

| 필드      | 타입     | 필수 | 설명                          |
| --------- | -------- | ---- | ----------------------------- |
| `phone`   | `string` | ✅   | 전화번호                      |
| `code`    | `string` | ✅   | 사용자가 입력한 6자리 인증번호 |

**요청 예시**:

```bash
curl -X POST http://localhost:47200/v1/sms/verification/verify \
  -H "Content-Type: application/json" \
  -d '{"phone": "01012345678", "code": "123456"}'
```

**성공 응답** (`200`):

```json
{
  "ok": true,
  "message": "verified"
}
```

**오류 응답**:

| 코드 | 원인                               |
| ---- | ---------------------------------- |
| 400  | 잘못된 인증번호 또는 만료됨        |
| 429  | 시도 횟수 초과                     |

↑ [목록으로 이동](#summary)

---

## 관련 문서

- [SMS 가이드](../notification/sms-guide.md)
- [API 라우트](api-routes.md)
