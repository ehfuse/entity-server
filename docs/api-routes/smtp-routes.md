# SMTP 라우트

`/v1/smtp` 엔드포인트 상세 가이드입니다.

> SMTP API는 `configs/notification/smtp.json`이 설정된 경우에만 활성화됩니다.

- 공통 인증 헤더 및 에러 응답 형식은 [API 라우트](api-routes.md)를 참조하세요.
- SMTP 설정, 프로바이더, 템플릿 등 운영 가이드는 [SMTP](../notification/smtp-guide.md)를 참조하세요.

<a id="summary"></a>

## 목록

| No. | 항목                                      | 메서드 | 경로                      | 인증        |
| --- | ----------------------------------------- | ------ | ------------------------- | ----------- |
| 1   | [이메일 발송](#smtp-send)                 | `POST` | `/v1/smtp/send`           | API Key     |
| 2   | [발송 상태 조회](#smtp-status)            | `POST` | `/v1/smtp/status/:seq`    | API Key     |
| 3   | [템플릿 미리보기](#smtp-template-preview) | `GET`  | `/v1/smtp/template/:name` | 인증 불필요 |

> **참고**: 엔티티 훅을 통한 이메일 발송(`smtp_msg` insert)은 엔티티 CRUD API를 사용합니다.
> 자세한 내용은 [엔티티 라우트](entity-routes.md)의 `POST /v1/entity/:entity/submit`을 참조하세요.

---

<a id="smtp-send"></a>

### 1. 이메일 발송

이메일을 발송 큐에 등록합니다. 실제 전송은 워커가 비동기로 처리합니다.

**엔드포인트**: `POST /v1/smtp/send`

**요청 본문**:

| 필드            | 타입       | 필수 | 설명                                           |
| --------------- | ---------- | ---- | ---------------------------------------------- |
| `to`            | `string[]` | ✅   | 수신자 이메일 배열                             |
| `subject`       | `string`   | ✅   | 제목                                           |
| `provider`      | `string`   |      | SMTP 프로바이더 키 (미지정 시 기본 프로바이더) |
| `from`          | `string`   |      | 발신자 (미지정 시 프로바이더 기본값)           |
| `cc`            | `string[]` |      | 참조                                           |
| `bcc`           | `string[]` |      | 숨은 참조                                      |
| `body_text`     | `string`   |      | 텍스트 본문                                    |
| `body_html`     | `string`   |      | HTML 본문                                      |
| `template_name` | `string`   |      | 템플릿 이름 (`templates/email/` 기준)          |
| `template_data` | `object`   |      | 템플릿 변수                                    |
| `attachments`   | `int64[]`  |      | 첨부 file_meta seq 배열                        |
| `reply_to`      | `string`   |      | 회신 주소                                      |
| `ref_entity`    | `string`   |      | 참조 엔티티 이름                               |
| `ref_seq`       | `int64`    |      | 참조 레코드 seq                                |

> `body_html`에 `${변수}` 또는 `${변수|기본값}` 문법을 직접 사용할 수 있습니다 (인라인 템플릿).

**요청 예시**:

```bash
# 기본 텍스트 이메일
curl -X POST http://localhost:47200/v1/smtp/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": ["user@example.com"],
    "subject": "테스트 이메일",
    "body_text": "Hello, World!"
  }'

# 템플릿 사용
curl -X POST http://localhost:47200/v1/smtp/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": ["user@example.com"],
    "subject": "인증 코드",
    "template_name": "auth/verification",
    "template_data": {"code": "123456", "expires_in": "10분"}
  }'

# HTML 인라인 템플릿
curl -X POST http://localhost:47200/v1/smtp/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": ["user@example.com"],
    "subject": "주문 접수",
    "body_html": "<p>${name|고객}님, 주문 #${order_id}이 접수되었습니다.</p>",
    "template_data": {"name": "홍길동", "order_id": "ORD-456"}
  }'

# 특정 프로바이더 + 첨부파일
curl -X POST http://localhost:47200/v1/smtp/send \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "transactional",
    "to": ["user@example.com"],
    "cc": ["manager@example.com"],
    "subject": "월간 보고서",
    "body_text": "첨부된 보고서를 확인해주세요.",
    "attachments": [42]
  }'
```

**성공 응답** (`200`):

```json
{
    "ok": true,
    "message": "queued"
}
```

**에러 응답**:

| 코드 | 조건                          |
| ---- | ----------------------------- |
| 400  | `to` 누락 또는 `subject` 누락 |
| 500  | 큐 등록 실패                  |

---

<a id="smtp-status"></a>

### 2. 발송 상태 조회

`smtp_log` 레코드의 발송 상태를 조회합니다.

**엔드포인트**: `POST /v1/smtp/status/:seq`

**URL 파라미터**:

| 파라미터 | 필수 | 설명           |
| -------- | ---- | -------------- |
| `:seq`   | ✅   | smtp_log의 seq |

**요청 예시**:

```bash
curl -X POST http://localhost:47200/v1/smtp/status/1
```

**성공 응답** (`200`):

```json
{
    "ok": true,
    "seq": 1,
    "message": "use entity API to query smtp_log for detailed status"
}
```

> **상세 조회**: `smtp_log` 엔티티에서 직접 조회하면 `status`, `retry_count`, `sent_time`, `error_message` 등 모든 필드를 확인할 수 있습니다:
>
> ```bash
> curl http://localhost:47200/v1/entity/smtp_log/1
> ```

**에러 응답**:

| 코드 | 조건              |
| ---- | ----------------- |
| 400  | 유효하지 않은 seq |

---

<a id="smtp-template-preview"></a>

### 3. 템플릿 미리보기

이메일 템플릿을 브라우저에서 렌더링하여 미리봅니다. 개발/테스트 용도입니다.

**엔드포인트**: `GET /v1/smtp/template/*name`

**인증**: 불필요

**URL 파라미터**:

| 파라미터 | 필수 | 설명                                                                           |
| -------- | ---- | ------------------------------------------------------------------------------ |
| `*name`  | ✅   | 템플릿 경로 (확장자 제외, 슬래시 포함 가능, 예: `auth/verification`, `layout`) |

> 템플릿 파일은 `smtp.json` → `templates.dir` 기준 하위 경로에 위치합니다.
> 예: `dir = ./templates/email` → `auth/password_reset` → `./templates/email/auth/password_reset.html`

**Query 파라미터**:

쿼리 파라미터로 템플릿 변수를 오버라이드할 수 있습니다. 파라미터를 생략하면 템플릿에 설정된 `${변수|기본값}`이 사용됩니다.

**현재 제공되는 템플릿**:

| 경로                              | 용도                        |
| --------------------------------- | --------------------------- |
| `auth/password_reset`             | 비밀번호 재설정 이메일      |
| `auth/force_reset`                | 강제 비밀번호 초기화 이메일 |
| `auth/verification`               | 이메일 인증 코드            |
| `auth/verification_link`          | 이메일 인증 링크            |
| `auth/welcome`                    | 회원가입 환영 이메일        |
| `auth/2fa_setup_complete`         | 2FA 설정 완료               |
| `auth/2fa_disabled`               | 2FA 비활성화 알림           |
| `auth/2fa_recovery_regenerated`   | 2FA 복구 코드 재발급        |
| `auth/email_verification`         | 이메일 인증 완료            |
| `account/dormancy_warning`        | 휴면 전환 예고 알림         |
| `account/password_expiry_warning` | 비밀번호 만료 예고 알림     |
| `backup/backup_completed`         | 백업 완료 알림              |
| `backup/backup_failed`            | 백업 실패 알림              |
| `backup/backup_partial`           | 백업 부분 완료 알림         |
| `storage/storage_quota_exceeded`  | 저장공간 초과 알림          |
| `storage/storage_quota_warning`   | 저장공간 경고 알림          |
| `order/order_confirmation`        | 주문 확인 이메일            |

**요청 예시**:

```bash
# 기본값으로 렌더링
curl http://localhost:47200/v1/smtp/template/auth/verification

# 변수 오버라이드
curl "http://localhost:47200/v1/smtp/template/auth/verification?code=123456&expires_in=5분"

# 비밀번호 재설정 미리보기
curl http://localhost:47200/v1/smtp/template/auth/password_reset

# 브라우저에서 직접 열기
http://localhost:47200/v1/smtp/template/auth/welcome?name=홍길동&app_name=서비스
```

**성공 응답** (`200`):

`Content-Type: text/html; charset=utf-8`로 렌더링된 HTML을 반환합니다.

`layout.html`이 존재하면 자동으로 레이아웃이 적용됩니다.

**에러 응답**:

| 코드 | 조건                                     |
| ---- | ---------------------------------------- |
| 400  | 템플릿 이름 누락                         |
| 404  | 템플릿 파일 없음 또는 템플릿 엔진 미설정 |

---

## 내장 템플릿

`templates/email/` 디렉터리에 제공되는 기본 템플릿입니다:

| 파일                            | 용도          | 주요 변수                                                 |
| ------------------------------- | ------------- | --------------------------------------------------------- |
| `layout.html`                   | 공통 레이아웃 | `${app_name\|Entity Server}`, `${company\|Entity Server}` |
| `auth/verification.html`        | 인증 코드     | `${code\|000000}`, `${expires_in\|10분}`                  |
| `auth/password_reset.html`      | 비밀번호 리셋 | `${reset_url\|#}`, `${expires_in\|1시간}`                 |
| `auth/welcome.html`             | 환영 메일     | `${name\|회원}`, `${app_name\|서비스}`, `${login_url\|#}` |
| `order/order_confirmation.html` | 주문 확인     | `${name\|고객}`, `${order_id}`, `${total\|50,000원}`      |

### 템플릿 문법

| 패턴            | 설명                                             |
| --------------- | ------------------------------------------------ |
| `${name}`       | data에 `name` 키가 있으면 치환, 없으면 빈 문자열 |
| `${name\|회원}` | data에 `name` 키가 없으면 `회원`으로 치환        |
| `${content}`    | 레이아웃 전용 — 콘텐츠 템플릿 삽입 위치          |

---

## 관련 문서

- [관리자 라우트](admin-routes.md)
- [API 라우트](api-routes.md)
- [엔티티 라우트](entity-routes.md)
- [파일 라우트](files-routes.md)
- [Join 가이드](join-routes.md)

## 다음 문서

- [SMTP](../notification/smtp-guide.md)
- [운영 플레이북](../operations/operations-playbook.md)
- [설정](../setup/config-guide.md)
- [목록으로 돌아가기](../README.md)
