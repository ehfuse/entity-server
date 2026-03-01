# SMS 가이드

Entity Server는 DB 큐 기반 비동기 SMS/LMS 발송 서비스를 제공합니다. 훅(Hook) 트리거 또는 REST API를 통해 문자를 발송할 수 있으며, 4개 국내 프로바이더 및 AWS SNS(해외)를 지원합니다.

## 목차

- [개요](#개요)
- [프로바이더 비교](#프로바이더-비교)
- [사전 준비](#사전-준비)
- [설정 (sms.json)](#설정-smsjson)
- [발송 흐름](#발송-흐름)
- [API 레퍼런스](#api-레퍼런스)
- [훅(Hook) 연동](#훅hook-연동)
- [SMS 본인인증](#sms-본인인증)
- [엔티티 구조](#엔티티-구조)
- [운영 팁](#운영-팁)

---

## 개요

SMS 서비스는 SMTP, Push와 동일한 아키텍처를 사용합니다:

1. **Hook 트리거 또는 API 호출** → `sms_log(pending)` DB 레코드 생성
2. **디스패처** (주기적 polling) → pending 레코드를 CAS로 claim → `processing`
3. **워커** → SMS/LMS 자동 판정 + 프로바이더 API 발송 → `sent` 또는 `failed`
4. **서버 재시작** → processing 레코드를 pending으로 자동 복구

---

## 프로바이더 비교

| 항목                  | **알리고 (Aligo)**                     | **솔라피 (Solapi)**               | **뿌리오 (Ppurio)**                   | **NHN Cloud**                                                        |
| --------------------- | -------------------------------------- | --------------------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| **홈페이지**          | [aligo.in](https://smartsms.aligo.in/) | [solapi.com](https://solapi.com/) | [ppurio.com](https://www.ppurio.com/) | [nhncloud.com](https://www.nhncloud.com/kr/service/notification/sms) |
| **건당 가격 (SMS)**   | 9.9원                                  | 9.5원                             | 10원                                  | 9.9원                                                                |
| **건당 가격 (LMS)**   | 27원                                   | 28원                              | 30원                                  | 27원                                                                 |
| **건당 가격 (MMS)**   | 55원                                   | 55원                              | 58원                                  | 55원                                                                 |
| **인증 방식**         | API Key + User ID                      | API Key + HMAC-SHA256             | Account + Bearer Token                | App Key + Secret Key                                                 |
| **무료 충전**         | 회원 가입 시 300원                     | 회원 가입 시 테스트 건수          | 회원 가입 시 3건                      | -                                                                    |
| **특징**              | 국내 점유율 높음, 간편한 API           | 개발자 친화적 SDK, 카카오 통합    | 대량 발송에 강함, 엔터프라이즈        | 클라우드 통합 플랫폼, 글로벌                                         |
| **카카오 알림톡**     | ✅ 연동 가능                           | ✅ 통합 제공                      | ✅ 연동 가능                          | ✅ 별도 상품                                                         |
| **발신번호 사전등록** | 필수                                   | 필수                              | 필수                                  | 필수                                                                 |
| **과금 방식**         | 선불 충전                              | 선불/후불                         | 선불 충전                             | 후불                                                                 |

> **참고**: 가격은 2025년 1월 기준 대략치이며, 이용량·계약 조건에 따라 달라질 수 있습니다. 정확한 가격은 각 프로바이더 홈페이지를 확인하세요.

### AWS SNS (해외 발송)

국내 프로바이더와 별도로 **AWS Simple Notification Service**를 통한 해외 SMS 발송을 지원합니다.

| 항목            | 내용                                                       |
| --------------- | ---------------------------------------------------------- |
| **홈페이지**    | [aws.amazon.com/sns](https://aws.amazon.com/sns/)          |
| **용도**        | 해외 SMS (국내 발송 비권장)                                |
| **인증 방식**   | Access Key + Secret Key (IAM)                              |
| **메시지 타입** | `Transactional` (거래성) / `Promotional` (광고성)          |
| **과금 방식**   | 후불 (국가별 단가 상이)                                    |
| **발신번호**    | AWS에서 발급한 번호 또는 Sender ID 사용 (국가별 제한 있음) |

---

## 사전 준비

### 1. 프로바이더 가입 및 API 키 발급

위 표의 홈페이지에서 가입 후 API 키를 발급받습니다.

### 2. 발신번호 사전등록

**통신사 규정에 따라 발신번호는 반드시 사전등록**해야 합니다:

1. 각 프로바이더 관리 콘솔에서 발신번호 등록
2. 본인 인증(ARS 또는 서류) 완료
3. 등록된 번호만 `sender` 필드에 사용 가능

### 3. 엔티티 배치

`entities/System/Notification/` 디렉터리에 다음 엔티티들이 있어야 합니다:

- `sms_msg.json` — 발송 트리거
- `sms_log.json` — 발송 로그 (DB 큐)

파일이 없으면 서버 시작 시 에러를 출력하고 종료됩니다. 배포 패키지의 `entities/` 샘플에서 복사하여 사용합니다.
서버 시작 후 엔티티 설정에 따라 DB 테이블이 자동으로 생성됩니다.

---

## 설정 (sms.json)

`configs/notification/sms.json`:

```json
{
    "enabled": true,
    "default": "aligo",
    "sender": "${SMS_SENDER_NUMBER}",
    "workers": 2,
    "dispatch_interval_sec": 5,
    "queue_size": 200,
    "max_retries": 3,
    "auto_lms": true,
    "lms_threshold_bytes": 80,
    "providers": [
        {
            "driver": "aligo",
            "api_key": "${ALIGO_API_KEY}",
            "user_id": "${ALIGO_USER_ID}"
        },
        {
            "driver": "aws_sns",
            "region": "${AWS_SNS_REGION}",
            "access_key": "${AWS_SNS_ACCESS_KEY}",
            "secret_key": "${AWS_SNS_SECRET_KEY}",
            "api_key": "Transactional"
        }
    ],
    "rate_limit": {
        "per_number_per_minute": 5,
        "per_minute": 60,
        "per_hour": 500
    },
    "verification": {
        "code_length": 6,
        "ttl_sec": 180,
        "max_attempts": 5,
        "cooldown_sec": 60
    }
}
```

### 주요 설정 항목

| 항목                    | 기본값 | 설명                               |
| ----------------------- | ------ | ---------------------------------- |
| `enabled`               | `true` | SMS 기능 활성화                    |
| `default`               | -      | 기본 프로바이더 driver명 (필수)    |
| `sender`                | -      | 전역 기본 발신번호 (사전등록 필수) |
| `workers`               | 2      | 동시 발송 워커 수                  |
| `dispatch_interval_sec` | 5      | 디스패처 폴링 주기 (초)            |
| `auto_lms`              | true   | 80바이트 초과 시 자동 LMS 전환     |
| `lms_threshold_bytes`   | 80     | LMS 전환 기준 바이트 수            |
| `max_retries`           | 3      | 최대 재시도 횟수                   |

### 프로바이더별 드라이버 설정

| 드라이버    | 필수 필드                                         | 선택 필드 |
| ----------- | ------------------------------------------------- | --------- |
| `aligo`     | `api_key`, `user_id`                              | `sender`  |
| `solapi`    | `api_key`, `api_secret`                           | `sender`  |
| `ppurio`    | `account`, `api_key`                              | `sender`  |
| `nhn_cloud` | `app_key`, `secret_key`                           | `sender`  |
| `aws_sns`   | `region`, `access_key`, `secret_key`, `api_key`\* | -         |

> \* `aws_sns`의 `api_key`는 SMS 타입 문자열입니다: `Transactional`(거래성) 또는 `Promotional`(광고성).

**프로바이더별 `sender` 오버라이드**  
각 프로바이더에 `sender`를 지정하면 전역 `sender`를 덮어씁니다. 프로바이더마다 다른 발신번호를 사용해야 할 경우에만 설정합니다. 미지정 시 최상위 `sender`가 사용됩니다.

> 예시 파일: `configs-example/sms.json.example`

---

## 발송 흐름

```
Hook/API → EnqueueJob()
         → sms_log(pending) 생성
         ↓
디스패처 (5초 주기)
         → ClaimPendingSmsLogs() [CAS: pending→processing]
         → dispatchCh 전달
         ↓
워커
         → SMS/LMS 자동 판정
         → 프로바이더 API 발송
         → sms_log 상태 갱신 (sent/failed)
         → sms_msg 상태 갱신 (트리거 엔티티)
```

### SMS/LMS 자동 판정

`auto_lms: true` 설정 시, 메시지 본문이 80바이트(한글 약 26자, 영문 80자)를 초과하면 자동으로 LMS로 전환합니다. LMS는 제목(subject) 필드를 사용할 수 있습니다.

---

## API 레퍼런스

### SMS 발송 (JWT 필요)

| 메서드 | 경로                  | 설명                    |
| ------ | --------------------- | ----------------------- |
| `POST` | `/v1/sms/send`        | SMS 발송 요청 (큐 등록) |
| `GET`  | `/v1/sms/status/:seq` | 발송 상태 조회          |

### POST /v1/sms/send

```json
{
    "receiver": "01012345678",
    "content": "안녕하세요, 테스트 메시지입니다.",
    "subject": "LMS 제목 (선택)",
    "sender": "01098765432",
    "provider": "aligo"
}
```

**응답 (202)**:

```json
{
    "message": "sms queued"
}
```

---

## 훅(Hook) 연동

엔티티 JSON에서 Hook을 설정하여 자동 SMS 발송이 가능합니다:

```json
{
    "hooks": {
        "after_insert": [
            {
                "type": "sms",
                "sms_receiver": "${new.phone}",
                "sms_content": "주문이 접수되었습니다. 주문번호: ${new.order_no}",
                "sms_subject": "주문 접수 알림"
            }
        ]
    }
}
```

### Hook 필드

| 필드           | 설명                              | 필수 |
| -------------- | --------------------------------- | ---- |
| `type`         | `"sms"`                           | ✅   |
| `sms_receiver` | 수신 번호 (템플릿 지원)           | ✅   |
| `sms_content`  | 메시지 본문 (템플릿 지원)         | ✅   |
| `sms_subject`  | LMS 제목 (템플릿 지원)            | 선택 |
| `sms_sender`   | 발신번호 (미지정 시 기본값)       | 선택 |
| `sms_provider` | 프로바이더 키 (미지정 시 default) | 선택 |

> 템플릿 변수: `${new.field_name}` — 엔티티의 새 레코드 필드 값으로 치환됩니다.

---

## SMS 본인인증

SMS 인증코드 발송 및 검증 기능을 제공합니다. 인증 API는 **JWT 없이 접근 가능**합니다.

### API

| 메서드 | 경로                          | 설명          |
| ------ | ----------------------------- | ------------- |
| `POST` | `/v1/sms/verification/send`   | 인증코드 발송 |
| `POST` | `/v1/sms/verification/verify` | 인증코드 검증 |

### POST /v1/sms/verification/send

```json
{
    "phone": "01012345678",
    "purpose": "signup"
}
```

### POST /v1/sms/verification/verify

```json
{
    "phone": "01012345678",
    "purpose": "signup",
    "code": "482916"
}
```

### 보안

- 인증코드는 `crypto/rand`로 생성 (6자리 기본)
- DB에는 **SHA-256 해시**만 저장 (평문 미저장)
- TTL(기본 180초), 최대 시도 횟수(기본 5회) 제한
- 만료된 코드는 자동 무효화

---

## 엔티티 구조

### sms_msg (트리거)

| 필드       | 타입   | 설명                  |
| ---------- | ------ | --------------------- |
| `receiver` | string | 수신 전화번호         |
| `sender`   | string | 발신 전화번호         |
| `content`  | text   | 메시지 본문           |
| `subject`  | string | LMS 제목              |
| `status`   | string | pending → sent/failed |
| `msg_type` | string | sms / lms             |
| `provider` | string | 프로바이더 키         |

### sms_log (DB 큐)

| 필드              | 타입     | 설명                               |
| ----------------- | -------- | ---------------------------------- |
| `status`          | string   | pending → processing → sent/failed |
| `provider_msg_id` | string   | 프로바이더 응답 메시지 ID          |
| `error_message`   | text     | 오류 메시지                        |
| `retry_count`     | integer  | 재시도 횟수                        |
| `sent_at`         | datetime | 발송 완료 시각                     |

---

## 운영 팁

1. **워커 수 조정**: 대량 발송 시 `workers`를 늘리세요 (4~8 권장).
2. **발신번호 관리**: 프로바이더별로 다른 발신번호를 사용하려면 각 provider에 `sender`를 설정합니다.
3. **재시도 정책**: `max_retries` 초과 시 `failed` 처리되며, 서버 재시작 시 stale 복구가 동작합니다.
4. **LMS 자동 전환**: `auto_lms: false`로 설정하면 항상 SMS로 발송합니다 (80바이트 초과 시 잘림 주의).
5. **모니터링**: `sms_log` 엔티티를 통해 발송 상태를 실시간 조회할 수 있습니다.

---

## 관련 문서

- [알림톡 가이드](alimtalk-guide.md)
- [친구톡(FriendTalk) 가이드](friendtalk-guide.md)
- [푸시 알림 가이드](push-guide.md)
- [SMTP 이메일 발송 가이드](smtp-guide.md)

## 관련 문서

- [SMTP 이메일 가이드](smtp-guide.md)
- [카카오 알림톡 가이드](alimtalk-guide.md)
- [푸시 알림 가이드](push-guide.md)

## 다음 문서

- [소셜 로그인](../extensions/social-login-guide.md)
- [목록으로 돌아가기](../README.md)
