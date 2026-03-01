# 알림톡 가이드

Entity Server는 카카오 알림톡(Kakao Alimtalk) 발송을 지원합니다. 템플릿 기반 비동기 발송, 4개 국내 프로바이더를 지원합니다.

## 목차

- [개요](#개요)
- [프로바이더 비교](#프로바이더-비교)
- [카카오 비즈니스 채널 준비](#카카오-비즈니스-채널-준비)
- [템플릿 등록 방법](#템플릿-등록-방법)
- [설정 (alimtalk.json)](#설정-alimtalkjson)
- [발송 흐름](#발송-흐름)
- [API 레퍼런스](#api-레퍼런스)
- [훅(Hook) 연동](#훅hook-연동)
- [엔티티 구조](#엔티티-구조)
- [운영 팁](#운영-팁)

---

## 개요

카카오 알림톡은 카카오톡 채널을 통해 사용자에게 **사전 승인된 템플릿** 메시지를 발송하는 서비스입니다. 광고가 아닌 **정보성 메시지**(주문 확인, 배송 알림, 인증코드 등)만 발송할 수 있습니다.

### SMS와의 차이점

| 구분      | 알림톡                    | SMS                                |
| --------- | ------------------------- | ---------------------------------- |
| 채널      | 카카오톡                  | 일반 문자                          |
| 가격      | ~6.5원/건                 | ~10원/건                           |
| 글자 수   | 1,000자                   | 80바이트 (SMS) / 2,000바이트 (LMS) |
| 템플릿    | 사전 검수 필수            | 자유                               |
| 수신 조건 | 카카오톡 사용자만         | 모든 휴대폰                        |
| 발신 조건 | 카카오 비즈니스 채널 필수 | 사전등록 발신번호                  |

---

## 프로바이더 비교

| 항목            | **알리고 (Aligo)**                     | **솔라피 (Solapi)**               | **뿌리오 (Ppurio)**                   | **NHN Cloud**                                                             |
| --------------- | -------------------------------------- | --------------------------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| **홈페이지**    | [aligo.in](https://smartsms.aligo.in/) | [solapi.com](https://solapi.com/) | [ppurio.com](https://www.ppurio.com/) | [nhncloud.com](https://www.nhncloud.com/kr/service/notification/alimtalk) |
| **알림톡 가격** | 6.5원                                  | 7원                               | 8원                                   | 7.5원                                                                     |
| **친구톡 가격** | 15원                                   | 15원                              | 15원                                  | 15원                                                                      |
| **인증 방식**   | API Key + User ID                      | API Key + HMAC-SHA256             | Account + Bearer Token                | App Key + Secret Key                                                      |
| **SMS 폴백**    | ✅ 자동 (failover 옵션)                | ✅ 통합 처리                      | ✅ resend 옵션                        | ✅ resendParameter                                                        |
| **특징**        | 국내 점유율 높음, 간편                 | SDK 제공, 통합 메시징             | 엔터프라이즈 대량 발송                | 클라우드 통합, 글로벌                                                     |
| **관리 콘솔**   | 웹 관리자                              | 대시보드 + API Playground         | 엔터프라이즈 관리자                   | NHN Cloud Console                                                         |
| **과금 방식**   | 선불 충전                              | 선불/후불                         | 선불 충전                             | 후불                                                                      |

> **참고**: 가격은 2026년 3월 기준 대략치이며, 이용량·계약 조건에 따라 달라질 수 있습니다.

---

## 카카오 비즈니스 채널 준비

알림톡 발송을 위해서는 **카카오톡 채널(구 플러스친구)**이 필요합니다.

### 1단계: 카카오톡 채널 개설

1. [카카오톡 채널 관리자센터](https://business.kakao.com/dashboard/) 접속
2. **채널 만들기** 클릭
3. 채널 이름, 프로필 사진, 소개글 입력
4. 채널 개설 완료

### 2단계: 비즈니스 채널 전환

일반 채널은 알림톡을 발송할 수 없습니다. **비즈니스 채널**로 전환해야 합니다:

1. 채널 관리자센터 → **비즈니스 도구** → **비즈니스 채널**
2. 사업자등록증 또는 사업자정보 입력
3. 심사 승인 대기 (보통 1~3영업일)

### 3단계: 발신프로필 등록 (프로바이더별)

프로바이더에서 카카오 발신프로필을 연결합니다:

1. 프로바이더 관리 콘솔에서 **카카오 알림톡** 메뉴 접근
2. **발신프로필 등록** → 카카오톡 채널 검색 → 연결
3. 카카오 인증 (채널 관리자 인증 필요)
4. 발신프로필 키(`sender_key`) 발급 완료

> **이 `sender_key`를 `alimtalk.json`의 설정에 사용합니다.**

---

## 템플릿 등록 방법

알림톡은 **카카오에서 사전 검수를 통과한 템플릿**만 발송할 수 있습니다.

### 템플릿 작성 규칙

| 규칙               | 설명                                          |
| ------------------ | --------------------------------------------- |
| 정보성 내용만 가능 | 광고, 홍보 문구 불가                          |
| 변수 형식          | `#{변수명}` (예: `#{고객명}`, `#{주문번호}`)  |
| 최대 길이          | 1,000자 (변수 포함)                           |
| 버튼               | 최대 5개 (웹링크, 앱링크, 배송조회, 봇키워드) |

### 프로바이더별 템플릿 등록

#### 알리고 (Aligo)

1. 알리고 관리자 → **카카오 알림톡 관리 → 템플릿 관리**
2. **템플릿 등록** 클릭
3. 카테고리, 내용, 버튼 입력
4. **검수 요청** → 카카오 검수 대기 (보통 1~3영업일)
5. 검수 승인 후 `template_code` 확인

#### 솔라피 (Solapi)

1. 솔라피 대시보드 → **카카오 → 알림톡 템플릿**
2. **+ 템플릿 추가** → 발신프로필 선택
3. 카테고리, 메시지 내용, 버튼 작성
4. **검수 요청** → 승인 후 사용 가능

#### 뿌리오 (Ppurio)

1. 뿌리오 관리자 → **카카오 서비스 → 템플릿 관리**
2. **신규 등록** → 내용 입력
3. **검수 요청** → 승인 대기

#### NHN Cloud

1. NHN Cloud Console → **Notification → KakaoTalk Bizmessage**
2. **템플릿 관리 → 등록**
3. 내용 입력 → **검수 요청**
4. 승인 후 `templateCode` 확인

### 템플릿 예시

```
[#{회사명}] 주문 확인 알림

안녕하세요, #{고객명}님.

주문이 정상적으로 접수되었습니다.

■ 주문번호: #{주문번호}
■ 주문일시: #{주문일시}
■ 결제금액: #{결제금액}원

주문 상세 내역은 아래 버튼을 눌러 확인해주세요.
```

### Entity Server에 템플릿 등록

`alimtalk.json`의 `templates` 배열에 검수 완료된 템플릿 코드를 등록합니다:

```json
"templates": [
    {
        "code": "ORDER_001",
        "description": "주문 접수 알림",
        "variables": ["고객명", "주문번호", "주문일시", "결제금액"]
    }
]
```

> 서버 시작 시 인메모리 캐시에 로드됩니다. 추가·변경 시 서버를 재시작해야 반영됩니다.

---

## 설정 (alimtalk.json)

`configs/notification/alimtalk.json`:

```json
{
    "default": "aligo",
    "sender_key": "${ALIMTALK_SENDER_KEY}",
    "workers": 2,
    "dispatch_interval_sec": 5,
    "queue_size": 200,
    "max_retries": 3,
    "providers": [
        {
            "driver": "aligo",
            "api_key": "${ALIGO_API_KEY}",
            "user_id": "${ALIGO_USER_ID}",
            "sender_key": "${ALIMTALK_SENDER_KEY}"
        }
    ]
}
```

### 주요 설정 항목

| 항목                    | 기본값 | 설명                                  |
| ----------------------- | ------ | ------------------------------------- |
| `enabled`               | true   | 알림톡 기능 활성화 여부               |
| `default`               | -      | 기본 프로바이더 driver (필수)         |
| `sender_key`            | -      | 카카오 발신프로필 키 (필수)           |
| `workers`               | 2      | 동시 발송 워커 수                     |
| `queue_size`            | 200    | DB 큐에서 한 번에 조회할 최대 건수    |
| `dispatch_interval_sec` | 5      | 디스패처 폴링 주기 (초)               |
| `max_retries`           | 3      | 최대 재시도 횟수                      |
| `templates`             | []     | 설정 파일에서 미리 로드할 템플릿 매핑 |
| `rate_limit`            | -      | 분/시간 발송 제한 설정                |
| `friendtalk`            | -      | 친구톡(브랜드메시지) 확장 설정        |

### 프로바이더별 드라이버 설정

| 드라이버    | 필수 필드                              |
| ----------- | -------------------------------------- |
| `aligo`     | `api_key`, `user_id`                   |
| `solapi`    | `api_key`, `api_secret` (`pf_id` 선택) |
| `ppurio`    | `account`, `api_key`                   |
| `nhn_cloud` | `app_key`, `secret_key`                |

> 예시 파일: `configs-example/alimtalk.json.example`

---

## 발송 흐름

```
Hook/API → EnqueueJob()
         → alimtalk_log(pending) 생성
         ↓
디스패처 (5초 주기)
         → ClaimPendingAlimtalkLogs() [CAS: pending→processing]
         → dispatchCh 전달
         ↓
워커
         → 템플릿 캐시에서 변수 목록 조회
         → #{변수} 바인딩
         → 프로바이더 API 발송
         ├─ 성공 → alimtalk_log(sent)
         └─ 실패 → alimtalk_log(failed), retry_count 증가
```

---

## API 레퍼런스

### 알림톡 발송 (인증 설정에 따름)

| 메서드 | 경로                       | 설명                            |
| ------ | -------------------------- | ------------------------------- |
| `POST` | `/v1/alimtalk/send`        | 알림톡 발송 요청                |
| `GET`  | `/v1/alimtalk/templates`   | 설정 파일 기반 템플릿 목록 조회 |
| `GET`  | `/v1/alimtalk/status/:seq` | 미구현 (501)                    |
| `POST` | `/v1/friendtalk/send`      | 친구톡(브랜드메시지) 발송 요청  |

> 인증 동작은 `jwt.json`/`security.json` 설정에 따라 달라집니다. JWT 미들웨어가 활성화된 환경에서는 `Authorization: Bearer` 또는 `X-API-Key`가 필요합니다.

### POST /v1/alimtalk/send

```json
{
    "template_code": "ORDER_001",
    "receiver": "01012345678",
    "variables": {
        "고객명": "홍길동",
        "주문번호": "ORD-2025-001",
        "주문일시": "2025-01-15 14:30",
        "결제금액": "35,000"
    }
}
```

**응답 (202)**:

```json
{
    "message": "alimtalk queued"
}
```

---

## 훅(Hook) 연동

엔티티 JSON에서 Hook을 설정하여 자동 알림톡 발송이 가능합니다:

```json
{
    "hooks": {
        "after_insert": [
            {
                "type": "alimtalk",
                "alimtalk_receiver": "{{phone}}",
                "alimtalk_template_code": "ORDER_001",
                "alimtalk_variables": "{\"고객명\": \"{{name}}\", \"주문번호\": \"{{order_no}}\"}"
            }
        ]
    }
}
```

### Hook 필드

| 필드                     | 설명                                  | 필수 |
| ------------------------ | ------------------------------------- | ---- |
| `type`                   | `"alimtalk"`                          | ✅   |
| `alimtalk_receiver`      | 수신 번호 (템플릿 지원)               | ✅   |
| `alimtalk_template_code` | 카카오 템플릿 코드 (템플릿 지원)      | ✅   |
| `alimtalk_variables`     | 변수 JSON 문자열 (템플릿 지원)        | 선택 |
| `alimtalk_provider`      | 프로바이더 driver (미지정 시 default) | 선택 |

---

## 엔티티 구조

### alimtalk_msg (트리거)

| 필드             | 타입    | 설명                                  |
| ---------------- | ------- | ------------------------------------- |
| `template_code`  | string  | 카카오 알림톡 템플릿 코드             |
| `receiver`       | string  | 수신 전화번호                         |
| `variables_json` | text    | 템플릿 변수 JSON (#{key} 바인딩)      |
| `provider`       | string  | 프로바이더 driver (빈 값이면 default) |
| `status`         | string  | pending → processing → sent/failed    |
| `ref_entity`     | string  | 참조 엔티티 이름 (옵션)               |
| `ref_seq`        | integer | 참조 엔티티 seq (옵션)                |

### alimtalk_log (DB 큐)

| 필드               | 타입     | 설명                                       |
| ------------------ | -------- | ------------------------------------------ |
| `status`           | string   | pending → processing → sent/failed/expired |
| `template_code`    | string   | 카카오 알림톡 템플릿 코드                  |
| `template_name`    | string   | 내부 템플릿 이름                           |
| `receiver`         | string   | 수신 전화번호                              |
| `variables_json`   | text     | 변수 JSON                                  |
| `provider`         | string   | 사용 프로바이더                            |
| `provider_msg_id`  | string   | 프로바이더 메시지 ID                       |
| `error_message`    | text     | 오류 메시지                                |
| `retry_count`      | integer  | 재시도 횟수                                |
| `sent_at`          | datetime | 발송 완료 시각                             |
| `alimtalk_msg_seq` | integer  | alimtalk_msg 참조 seq                      |

---

## 운영 팁

1. **템플릿 검수**: 새 템플릿은 카카오 검수에 1~3영업일이 소요됩니다. 운영 전에 충분한 시간을 확보하세요.
2. **비용 절감**: 알림톡(~6.5원)이 SMS(~10원)보다 저렴합니다. 가능하면 알림톡을 우선 사용하세요.
3. **발신프로필 관리**: 카카오 비즈니스 채널이 차단되면 모든 알림톡 발송이 중단됩니다.
4. **변수 매칭**: 템플릿의 `#{변수명}`과 `variables` JSON 키가 정확히 일치해야 합니다.
5. **템플릿 변경**: `alimtalk.json`의 `templates`를 수정한 경우 서버를 재시작해야 반영됩니다.

---

## 관련 문서

- [친구톡(FriendTalk) 가이드](friendtalk-guide.md)
- [푸시 알림 가이드](push-guide.md)
- [SMS 가이드](sms-guide.md)
- [SMTP 이메일 발송 가이드](smtp-guide.md)

## 관련 문서

- [친구톡 가이드](friendtalk-guide.md)
- [SMTP 이메일 가이드](smtp-guide.md)
- [SMS/LMS 가이드](sms-guide.md)
- [푸시 알림 가이드](push-guide.md)

## 다음 문서

- [소셜 로그인](../extensions/social-login-guide.md)
- [훅](../api-routes/hooks.md)
- [목록으로 돌아가기](../README.md)
