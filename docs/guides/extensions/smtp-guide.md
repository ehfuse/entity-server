# SMTP 이메일 발송 가이드

Entity Server는 SMTP 프로토콜을 통해 이메일을 비동기 발송하는 기능을 내장하고 있습니다.

## 개요

엔티티 훅 시스템의 `smtp` 타입을 사용하면, **엔티티에 insert 한 번으로 이메일이 자동으로 발송**됩니다.

```
클라이언트 → POST /v1/entity/smtp_msg/submit (insert)
                ↓
         after_insert 훅 (smtp 타입)
                ↓
         smtp_log(pending) 레코드 생성
                ↓
         디스패처 → CAS claim → 워커 풀
                ↓
         go-mail 라이브러리로 실제 SMTP 전송
                ↓
         smtp_log 상태 갱신 (sent / failed)
```

### 발송 큐 타이밍

- `type: "smtp"` 훅 실행 시 즉시 외부 전송하지 않고 `smtp_log(status=pending)`에 적재합니다.
- SMTP 서비스 시작 직후 디스패처가 1회 즉시 실행됩니다.
- 이후 디스패처가 5초 간격(기본값)으로 pending 레코드를 claim하여 워커가 발송합니다.
- 즉, 일반적으로 insert 후 발송까지 `0~5초 + SMTP 전송시간`이 소요됩니다.

### 시스템 필수 엔티티

SMTP 활성화 시 다음 엔티티가 필수입니다:

- `smtp_msg` (`entities/System/Email/`) — 이메일 트리거
- `smtp_log` (`entities/System/Email/`) — 발송 이력

---

## 설정

### 1. smtp.json 설정

`configs/smtp.json`:

```json
{
    "enabled": true,
    "default": "main",
    "workers": 2,
    "queue_size": 200,
    "dispatch_interval_sec": 5,
    "max_retries": 3,

    "providers": {
        "main": {
            "host": "smtp.gmail.com",
            "port": 587,
            "username": "${SMTP_USERNAME}",
            "password": "${SMTP_PASSWORD}",
            "from": "noreply@example.com",
            "from_name": "My Service",
            "encryption": "starttls",
            "auth": "plain",
            "timeout_sec": 30,
            "max_connections": 5
        },
        "transactional": {
            "host": "smtp.sendgrid.net",
            "port": 465,
            "username": "apikey",
            "password": "${SENDGRID_API_KEY}",
            "from": "alerts@example.com",
            "from_name": "My Service Alerts",
            "encryption": "ssl",
            "auth": "plain"
        }
    },

    "templates": {
        "dir": "./configs/templates/email",
        "default_layout": "layout.html"
    },

    "rate_limit": {
        "per_minute": 0,
        "per_hour": 0
    }
}
```

> `configs/smtp.json` 파일이 없으면 SMTP 기능이 비활성화됩니다. Push 알림과 마찬가지로 **선택적 기능**입니다.

### 2. 설정 필드

| 필드                    | 기본값 | 설명                                     |
| ----------------------- | ------ | ---------------------------------------- |
| `enabled`               | `true` | SMTP 기능 활성화 (`false`면 전체 비활성) |
| `default`               | —      | 기본으로 사용할 프로바이더 키 (필수)     |
| `workers`               | `2`    | 동시 발송 워커 수                        |
| `queue_size`            | `200`  | 발송 큐 버퍼 크기                        |
| `dispatch_interval_sec` | `5`    | 디스패치 주기 (초)                       |
| `max_retries`           | `3`    | 최대 재시도 횟수                         |
| `providers`             | —      | SMTP 프로바이더 맵 (최소 1개 필수)       |
| `templates`             | —      | 이메일 템플릿 설정                       |
| `rate_limit`            | —      | 발송 속도 제한 (0 = 무제한, 향후 구현)   |

### 3. 프로바이더 설정

| 필드              | 기본값     | 설명                                         |
| ----------------- | ---------- | -------------------------------------------- |
| `host`            | —          | SMTP 서버 호스트 (필수)                      |
| `port`            | —          | SMTP 서버 포트 (필수)                        |
| `username`        | —          | 인증 사용자명                                |
| `password`        | —          | 인증 비밀번호 (환경 변수 권장)               |
| `from`            | —          | 발신자 이메일 (필수)                         |
| `from_name`       | —          | 발신자 표시 이름                             |
| `encryption`      | `starttls` | `"starttls"`, `"ssl"`, `"none"`              |
| `auth`            | `plain`    | `"plain"`, `"login"`, `"cram-md5"`           |
| `timeout_sec`     | `30`       | 연결 타임아웃 (초)                           |
| `max_connections` | `5`        | 최대 연결 수 (향후 커넥션 풀링 구현 시 사용) |

### 4. 환경 변수

비밀번호 등 민감 정보는 `${ENV_VAR}` 형식으로 환경 변수를 참조할 수 있습니다:

```dotenv
SMTP_USERNAME=user@gmail.com
SMTP_PASSWORD=app-specific-password
SENDGRID_API_KEY=SG.xxxx...
```

---

## 사용법

### 이메일 보내기 (smtp_msg insert)

`smtp_msg` 엔티티에 insert하면 자동으로 이메일이 큐에 등록되고 비동기 발송됩니다:

```bash
curl -X POST http://localhost:47200/v1/entity/smtp_msg/submit \
  -H "Content-Type: application/json" \
  -d '{
    "to": "recipient@example.com",
    "subject": "테스트 이메일",
    "body_html": "<h1>안녕하세요!</h1><p>Entity Server에서 보낸 이메일입니다.</p>"
  }'
```

이 한 번의 insert로:

1. `smtp_msg` 레코드 생성 (status=queued)
2. `smtp_log` 레코드 생성 (status=pending)
3. 디스패처가 claim → 워커가 SMTP 전송
4. 성공 시 `smtp_log.status=sent`, `smtp_msg.status=sent`

### 여러 수신자에게 발송

```bash
curl -X POST http://localhost:47200/v1/entity/smtp_msg/submit \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user1@example.com, user2@example.com",
    "cc": "manager@example.com",
    "bcc": "audit@example.com",
    "subject": "팀 공지사항",
    "body_text": "이번 주 회의가 변경되었습니다."
  }'
```

### 템플릿 사용

```bash
curl -X POST http://localhost:47200/v1/entity/smtp_msg/submit \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user@example.com",
    "subject": "인증 코드",
    "template_name": "verification",
    "template_data": "{\"code\": \"123456\", \"expires_in\": \"10분\"}"
  }'
```

### 특정 프로바이더 사용

```bash
curl -X POST http://localhost:47200/v1/entity/smtp_msg/submit \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "transactional",
    "to": "user@example.com",
    "subject": "결제 확인",
    "template_name": "payment_receipt",
    "template_data": "{\"amount\": \"50,000원\", \"order_id\": \"ORD-123\"}"
  }'
```

### 첨부파일 포함

첨부파일은 `file_meta` 엔티티의 seq 배열로 참조합니다:

```bash
# 먼저 파일을 업로드
curl -X POST http://localhost:47200/v1/files/file_meta/upload \
  -F "file=@report.pdf"
# → {"seq": 42}

# 첨부파일 포함 이메일
curl -X POST http://localhost:47200/v1/entity/smtp_msg/submit \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user@example.com",
    "subject": "월간 보고서",
    "body_text": "첨부된 보고서를 확인해주세요.",
    "attachments": "[42]"
  }'
```

### API 직접 발송

`smtp_msg` 엔티티를 거치지 않고 직접 API로 발송할 수도 있습니다:

```bash
curl -X POST http://localhost:47200/v1/smtp/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": ["user@example.com"],
    "subject": "긴급 알림",
    "body_html": "<h2>서버 경고</h2><p>디스크 사용률이 90%를 초과했습니다.</p>"
  }'
```

### 발송 이력 조회

```bash
# smtp_log 엔티티에서 조회
curl http://localhost:47200/v1/entity/smtp_log/list?status=sent

# 특정 이메일 상태 확인
curl http://localhost:47200/v1/entity/smtp_log/1
```

---

## 커스텀 엔티티에 SMTP 훅 추가

`smtp_msg` 외에 다른 엔티티에도 SMTP 훅을 추가하여 이메일 발송을 자동화할 수 있습니다:

```json
{
    "name": "order",
    "hooks": {
        "after_insert": [
            {
                "type": "smtp",
                "to": "${new.customer_email}",
                "subject": "주문 확인 — #${new.seq}",
                "template_name": "order_confirmation",
                "template_data": "{\"order_seq\": \"${new.seq}\", \"total\": \"${new.total_amount}\"}"
            }
        ]
    }
}
```

### smtp 훅 필드

| 필드            | 기본값          | 설명                                       |
| --------------- | --------------- | ------------------------------------------ |
| `type`          | —               | `"smtp"` (필수)                            |
| `provider`      | config 기본     | SMTP 프로바이더 키                         |
| `from`          | 프로바이더 기본 | 발신자 이메일                              |
| `to`            | —               | 수신자 (쉼표 구분, 템플릿 지원) (필수)     |
| `cc`            | —               | 참조 (쉼표 구분, 템플릿 지원)              |
| `bcc`           | —               | 숨은 참조 (쉼표 구분, 템플릿 지원)         |
| `subject`       | —               | 제목 (템플릿 지원) (필수)                  |
| `body_text`     | —               | 텍스트 본문 (템플릿 지원)                  |
| `body_html`     | —               | HTML 본문 (템플릿 지원)                    |
| `template_name` | —               | 템플릿 이름 (templates/ 디렉터리)          |
| `template_data` | —               | 템플릿 변수 JSON 문자열 (템플릿 지원)      |
| `attachments`   | —               | 첨부 file_meta seq 배열 JSON (템플릿 지원) |
| `reply_to`      | —               | 회신 주소 (템플릿 지원)                    |
| `enabled`       | `true`          | 훅 활성화 여부                             |
| `required`      | `false`         | 실패 시 메인 작업 롤백 여부                |

### 템플릿 변수

- `${new.필드명}` — insert/update된 데이터의 필드 값
- `${old.필드명}` — update/delete 시 이전 값
- `${new.seq}` — 생성된 레코드의 seq

---

## 이메일 템플릿

### 디렉터리 구조

```
configs/templates/email/
├── layout.html              ← 기본 레이아웃 (모든 템플릿에 공통 적용)
├── order_confirmation.html  ← 주문 확인
├── verification.html        ← 인증 코드
├── password_reset.html      ← 비밀번호 리셋
└── welcome.html             ← 환영 메일
```

### 템플릿 문법

`${변수명}` 으로 변수를 치환합니다. `${변수명|기본값}` 형태로 fallback 값을 지정할 수 있습니다.

| 패턴            | 설명                                             |
| --------------- | ------------------------------------------------ |
| `${name}`       | data에 `name` 키가 있으면 치환, 없으면 빈 문자열 |
| `${name\|회원}` | data에 `name` 키가 없으면 `회원`으로 치환        |
| `${content}`    | 레이아웃 전용 — 콘텐츠 템플릿 삽입 위치          |

### 레이아웃 예시

```html
<!-- layout.html -->
<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8" />
    </head>
    <body style="margin:0; padding:0; background:#f4f4f6;">
        <div style="max-width:600px; margin:0 auto; padding:40px 20px;">
            <div style="background:#fff; border-radius:8px; padding:32px;">
                ${content}
            </div>
            <p
                style="text-align:center; font-size:12px; color:#aaa; margin-top:24px;"
            >
                &copy; ${company|Entity Server}
            </p>
        </div>
    </body>
</html>
```

### 템플릿 예시

```html
<!-- verification.html -->
<h2>인증 코드</h2>
<p>아래 코드를 입력하세요:</p>
<div
    style="font-size:32px; font-weight:bold; padding:20px; background:#f0f0f0; text-align:center;"
>
    ${code|000000}
</div>
<p>이 코드는 ${expires_in|10분} 동안 유효합니다.</p>
```

### 인라인 템플릿

`template_name` 없이 `body_html`에 `${변수}` 문법을 직접 사용할 수도 있습니다. 이 경우 `RenderString`으로 처리됩니다.

```json
{
    "to": "user@example.com",
    "subject": "알림",
    "body_html": "<p>${name|회원}님, 주문 #${order_id}이 접수되었습니다.</p>",
    "template_data": "{\"name\": \"홍길동\", \"order_id\": \"ORD-456\"}"
}
```

### 템플릿 미리보기

브라우저에서 이메일 템플릿을 렌더링하여 미리볼 수 있습니다:

```
GET /v1/smtp/template/:name
```

쿼리 파라미터로 변수 값을 전달합니다:

```bash
# 기본값으로 렌더링
curl http://localhost:47200/v1/smtp/template/verification

# 변수 전달
curl "http://localhost:47200/v1/smtp/template/verification?code=123456&expires_in=5분"

# 브라우저에서 직접 열기
http://localhost:47200/v1/smtp/template/welcome?name=홍길동&app_name=서비스
```

- 인증 없이 접근 가능합니다 (개발/테스트 용도).
- layout.html이 존재하면 자동으로 레이아웃이 적용됩니다.
- 쿼리 파라미터를 생략하면 템플릿에 설정된 `${변수|기본값}`이 사용됩니다.

---

## 아키텍처

```
                    ┌─────────────┐
  API Request ──→   │  Entity CRUD │   ← smtp_msg insert
                    │  (Submit)    │      또는 POST /v1/smtp/send
                    └──────┬──────┘
                           │ after_insert / API
                    ┌──────▼──────┐
                    │  SMTP Hook  │  EnqueueJob (non-blocking)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  smtp_log   │  status = pending
                    │  (DB 큐)    │
                    └──────┬──────┘
                           │ dispatch (5초 주기)
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         Worker 0     Worker 1     Worker N
              │            │            │
              ▼            ▼            ▼
      ┌──────────┐  ┌──────────┐  ┌──────────┐
      │ go-mail  │  │ go-mail  │  │ go-mail  │
      │ SMTP Send│  │ SMTP Send│  │ SMTP Send│
      └──────────┘  └──────────┘  └──────────┘
              │            │            │
              └────────────┼────────────┘
                           ▼
                    ┌──────────────┐
                    │  finalize    │  smtp_log → sent / failed
                    │              │  smtp_msg → sent / failed
                    └──────────────┘
```

### 핵심 특성

- **비동기 처리**: SMTP 훅은 큐에 넣기만 하고 즉시 반환 → API 응답 지연 없음
- **워커 풀**: 설정된 수의 goroutine이 큐를 소비하며 병렬 발송
- **CAS Claim**: CompareAndSwap 기반으로 멀티 인스턴스 환경에서 중복 발송 방지
- **자동 재시도**: 발송 실패 시 지수 백오프로 재시도 (기본 최대 3회)
- **Stale 복구**: 서버 재시작 시 processing 상태에서 2분 이상 멈춘 레코드를 pending으로 복구
- **발송 이력**: `smtp_log` 엔티티에 모든 발송 시도/결과 기록

### 재시도 및 백오프

| 재시도 횟수 | 대기 시간 |
| ----------- | --------- |
| 1회차       | 15초      |
| 2회차       | 60초      |
| 3회차       | 225초     |

> 지수 백오프: `min(15s × retry_count², 15분)`. `max_retries` 초과 시 status=failed.

### 상태 흐름

```
smtp_msg:  queued → sent     (성공)
                  → failed   (최종 실패)

smtp_log:  pending → processing → sent     (성공)
                                → pending  (재시도, retry_count++)
                                → failed   (max_retries 초과)
                                → expired  (stale 복구 후 최종 실패)
```

---

## 멀티 프로바이더

여러 SMTP 서버를 설정하여 용도별로 구분할 수 있습니다:

```json
{
    "default": "main",
    "providers": {
        "main": {
            "host": "smtp.gmail.com",
            "port": 587,
            "from": "noreply@company.com",
            "encryption": "starttls"
        },
        "transactional": {
            "host": "smtp.sendgrid.net",
            "port": 465,
            "from": "alerts@company.com",
            "encryption": "ssl"
        },
        "internal": {
            "host": "mail.internal.corp",
            "port": 25,
            "from": "system@internal.corp",
            "encryption": "none"
        }
    }
}
```

- `provider`를 지정하지 않으면 `default`로 설정된 프로바이더를 사용합니다.
- 훅이나 API에서 `"provider": "transactional"` 등으로 명시적으로 선택할 수 있습니다.

---

## 관련 엔티티

| 엔티티     | 위치                     | 역할                        |
| ---------- | ------------------------ | --------------------------- |
| `smtp_msg` | `entities/System/Email/` | 이메일 트리거 메시지 엔티티 |
| `smtp_log` | `entities/System/Email/` | 발송 이력 추적              |

### smtp_msg 주요 필드

| 필드            | 타입         | 설명                    |
| --------------- | ------------ | ----------------------- |
| `status`        | enum (index) | queued / sent / failed  |
| `provider`      | varchar(50)  | SMTP 프로바이더 키      |
| `to`            | text         | 수신자 (쉼표 구분)      |
| `cc`            | text         | 참조                    |
| `bcc`           | text         | 숨은 참조               |
| `subject`       | string       | 제목                    |
| `body_text`     | mediumtext   | 텍스트 본문             |
| `body_html`     | mediumtext   | HTML 본문               |
| `template_name` | string       | 템플릿 이름             |
| `template_data` | text         | 템플릿 변수 JSON        |
| `attachments`   | text         | file_meta seq 배열 JSON |
| `reply_to`      | string       | 회신 주소               |
| `ref_entity`    | string       | 참조 엔티티             |
| `ref_seq`       | string       | 참조 seq                |

### smtp_log 주요 필드

| 필드            | 타입         | 설명                                           |
| --------------- | ------------ | ---------------------------------------------- |
| `status`        | enum (index) | pending / processing / sent / failed / expired |
| `provider`      | varchar(50)  | SMTP 프로바이더 키                             |
| `smtp_msg_seq`  | string       | 원본 smtp_msg seq                              |
| `sent_time`     | datetime     | 발송 완료 시각                                 |
| `retry_count`   | uint         | 재시도 횟수                                    |
| `attempt_time`  | datetime     | 마지막 시도 시각                               |
| `error_message` | text         | 오류 메시지                                    |
| `message_id`    | string       | SMTP Message-ID 헤더                           |

---

## ESP 비교 (SMTP 라이브러리 선택 근거)

Entity Server는 직접 SMTP 전송 방식을 채택하고, SMTP 라이브러리로 `go-mail`을 선택했습니다.

### Go SMTP 라이브러리 비교

| 라이브러리               | Stars | TLS/STARTTLS   | DKIM  | 첨부파일         | 유지보수             |
| ------------------------ | ----- | -------------- | ----- | ---------------- | -------------------- |
| `net/smtp` (stdlib)      | —     | 수동 구현 필요 | ✗     | 수동 MIME 빌드   | deprecated (Go 1.24) |
| **`go-mail` (wneessen)** | 900+  | **자동**       | **✓** | **스트리밍 API** | **활발 (2026)**      |
| `gomail` (go-gomail)     | 4k+   | ✓              | ✗     | ✓                | 아카이브 (2020)      |
| `email` (jordan-wright)  | 2.5k+ | ✓              | ✗     | ✓                | 유지보수 중단        |
| `hermes` (matcornic)     | 2.5k+ | —              | —     | —                | 템플릿 전용          |

### 선택 근거: `go-mail`

1. **Go 1.24 공식 대체**: `net/smtp` deprecated 후 Go 팀이 공식 추천하는 대체 라이브러리
2. **TLS 자동 협상**: STARTTLS, SSL, 평문을 설정 한 줄로 제어
3. **DKIM 내장**: 별도 라이브러리 없이 도메인 서명 가능
4. **스트리밍 첨부**: `io.Reader` 기반으로 대용량 첨부파일 메모리 효율적 처리
5. **커넥션 관리**: 내부 커넥션 풀링 및 재사용 지원

### 직접 SMTP vs ESP API (SES/SendGrid) 비교

| 항목            | 직접 SMTP                        | ESP HTTP API                         |
| --------------- | -------------------------------- | ------------------------------------ |
| **설정 복잡도** | smtp.json 하나로 완료            | API 키 + 도메인 검증 + webhook 설정  |
| **의존성**      | SMTP 서버만 필요                 | 특정 ESP 벤더에 종속                 |
| **비용**        | 자체 SMTP = 무료, Gmail = 500/일 | SES $0.10/1000통, SendGrid 유료 플랜 |
| **발송 속도**   | SMTP 핸드셰이크 오버헤드         | HTTP API → 빠른 큐 등록              |
| **수신 확인**   | ✗ (SMTP 프로토콜 한계)           | Webhook으로 바운스/오픈 추적 가능    |
| **대량 발송**   | IP 평판 관리 필요                | ESP가 IP 평판 관리                   |
| **확장 비용**   | 프로바이더 교체만으로 전환 가능  | API 코드 교체 필요                   |

### 권장 시나리오

| 시나리오             | 권장 방식                            |
| -------------------- | ------------------------------------ |
| 사내 알림/승인 메일  | 직접 SMTP (자체 메일서버 또는 Gmail) |
| 거래 이메일 (영수증) | SMTP + SendGrid SMTP 릴레이          |
| 마케팅/대량 메일     | ESP API 직접 연동 (향후 확장)        |
| 개발/테스트          | 직접 SMTP (Mailhog, Mailtrap 등)     |

> **향후 확장**: SES/SendGrid HTTP API 직접 연동은 v7.3+ 이후 플러그인 형태로 추가 예정입니다. 현재 아키텍처에서 프로바이더를 교체하면 ESP SMTP 릴레이를 즉시 사용할 수 있습니다.

---

## 주요 ESP SMTP 릴레이 설정

### Gmail (개인/Google Workspace)

```json
{
    "host": "smtp.gmail.com",
    "port": 587,
    "username": "your-email@gmail.com",
    "password": "${GMAIL_APP_PASSWORD}",
    "encryption": "starttls",
    "auth": "plain"
}
```

> Gmail은 일일 500통(개인) / 2000통(Workspace) 제한이 있습니다. 앱 비밀번호 사용 필수.

### SendGrid SMTP Relay

```json
{
    "host": "smtp.sendgrid.net",
    "port": 465,
    "username": "apikey",
    "password": "${SENDGRID_API_KEY}",
    "encryption": "ssl",
    "auth": "plain"
}
```

### Amazon SES SMTP

```json
{
    "host": "email-smtp.ap-northeast-2.amazonaws.com",
    "port": 587,
    "username": "${SES_SMTP_USERNAME}",
    "password": "${SES_SMTP_PASSWORD}",
    "encryption": "starttls",
    "auth": "plain"
}
```

> SES SMTP 자격증명은 IAM 콘솔에서 별도 생성해야 합니다. IAM Access Key와 다릅니다.

### Mailgun SMTP

```json
{
    "host": "smtp.mailgun.org",
    "port": 587,
    "username": "postmaster@your-domain.mailgun.org",
    "password": "${MAILGUN_SMTP_PASSWORD}",
    "encryption": "starttls",
    "auth": "plain"
}
```

---

## 개발/테스트 환경

로컬 테스트 시 실제 이메일을 보내지 않고 확인하려면 Mailhog 또는 Mailtrap을 사용합니다.

### Mailhog (Docker)

```bash
docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog
```

```json
{
    "default": "dev",
    "providers": {
        "dev": {
            "host": "localhost",
            "port": 1025,
            "from": "test@localhost",
            "encryption": "none",
            "auth": "plain"
        }
    }
}
```

웹 UI: `http://localhost:8025`에서 발송된 이메일을 확인할 수 있습니다.
