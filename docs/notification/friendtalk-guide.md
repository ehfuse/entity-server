# 친구톡(FriendTalk) 가이드

카카오톡 채널을 추가한 친구에게 브랜드 메시지를 발송하는 방법을 설명합니다.

---

## 목차

1. [개요](#개요)
2. [알림톡과의 차이점](#알림톡과의-차이점)
3. [설정](#설정)
4. [API 레퍼런스](#api-레퍼런스)
5. [msg_type별 발송 예시](#msg_type별-발송-예시)
6. [훅 연동 (friendtalk_msg 엔티티)](#훅-연동-friendtalk_msg-엔티티)
7. [엔티티 구조](#엔티티-구조)
8. [광고 메시지 규칙](#광고-메시지-규칙)
9. [운영 팁](#운영-팁)

---

## 개요

친구톡은 카카오톡 채널(구 플러스친구)을 추가한 사용자에게 보내는 **마케팅형 카카오 메시지**입니다.

- 사전 심사된 템플릿이 **필요 없습니다** — 자유 텍스트를 즉시 발송할 수 있습니다.
- 이미지, 와이드 이미지, 와이드 아이템 리스트, 캐러셀 등 풍부한 메시지 유형을 지원합니다.
- 광고성 메시지에는 수신 동의 및 광고 표기가 의무입니다.

발송 흐름:

```
클라이언트 / 훅
    │
    ▼
POST /v1/friendtalk/send  또는  friendtalk_msg INSERT 훅
    │
    ▼
friendtalk_log (pending) DB 저장
    │
    ▼
FriendTalk Worker (백그라운드)
    │
    ├─ 카카오 프로바이더 API 호출
    │
    ├─ 성공 → status: sent, sent_at 기록
    └─ 실패 → status: failed, error_message 기록 / 재시도
```

---

## 알림톡과의 차이점

| 항목             | 알림톡                        | 친구톡                                                |
| ---------------- | ----------------------------- | ----------------------------------------------------- |
| 템플릿 필요 여부 | ✅ 필수 (사전 심사)           | ❌ 불필요                                             |
| 수신 대상        | 채널 미추가 사용자 포함       | **채널 추가 친구만**                                  |
| 메시지 유형      | 텍스트 (변수 치환)            | 텍스트·이미지·와이드·캐러셀                           |
| 광고 표기        | 비광고 메시지 허용            | 광고 여부 명시 필수                                   |
| 설정 위치        | `alimtalk.json` `providers[]` | `alimtalk.json` `friendtalk` 블록 (프로바이더는 공유) |

---

## 설정

친구톡은 알림톡과 **프로바이더(발신 채널 키)를 공유**합니다.  
`configs/notification/alimtalk.json`에서 `friendtalk` 블록만 추가로 설정합니다.

```json
{
    "default": "aligo",
    "providers": [
        {
            "driver": "aligo",
            "api_key": "${ALIGO_API_KEY}",
            "user_id": "${ALIGO_USER_ID}",
            "sender_key": "${ALIMTALK_SENDER_KEY}"
        }
    ],
    "friendtalk": {
        "enabled": true,
        "workers": 2,
        "ad_prefix": "(광고)",
        "default_ad": true
    }
}
```

### 친구톡 설정 항목

| 항목         | 타입   | 기본값     | 설명                                                 |
| ------------ | ------ | ---------- | ---------------------------------------------------- |
| `enabled`    | bool   | `false`    | 친구톡 기능 활성화                                   |
| `workers`    | int    | `2`        | 백그라운드 발송 워커 수                              |
| `ad_prefix`  | string | `"(광고)"` | `is_ad: true`일 때 본문 앞에 자동 삽입되는 광고 표기 |
| `default_ad` | bool   | `true`     | `is_ad` 미지정 시 기본값                             |

> **주의**: `enabled: false`이면 `/v1/friendtalk/send` 요청이 503으로 거부됩니다.

---

## API 레퍼런스

| 메서드 | 경로                  | 설명                |
| ------ | --------------------- | ------------------- |
| `POST` | `/v1/friendtalk/send` | 친구톡 발송 큐 등록 |

### POST /v1/friendtalk/send

친구톡 메시지를 발송 큐에 등록합니다. 실제 발송은 백그라운드 워커가 처리합니다.

**요청 헤더**

```
Content-Type: application/json
Authorization: Bearer <token>
```

**요청 바디**

| 필드            | 타입   | 필수 | 설명                                                |
| --------------- | ------ | ---- | --------------------------------------------------- |
| `receiver`      | string | ✅   | 수신자 전화번호 (예: `01012345678`)                 |
| `content`       | string | ✅   | 메시지 본문 (유형별 글자 수 제한 참고)              |
| `msg_type`      | string |      | 메시지 유형 (기본: `text`)                          |
| `image_url`     | string |      | 이미지 URL (`image`, `wide_image`형 필수)           |
| `image_link`    | string |      | 이미지 클릭 링크                                    |
| `is_ad`         | bool   |      | 광고 여부 (기본: 설정의 `default_ad`)               |
| `buttons`       | array  |      | 버튼 목록 (최대 5개, 아래 버튼 구조 참고)           |
| `carousel_json` | string |      | 캐러셀 JSON (`carousel`형 필수)                     |
| `items_json`    | string |      | 와이드 아이템 리스트 JSON (`wide_item_list`형 필수) |
| `header`        | string |      | 헤더 텍스트 (`wide_item_list`형)                    |
| `provider`      | string |      | 프로바이더 driver명 (비어있으면 default 사용)       |

**msg_type 글자 수 제한**

| msg_type         | content 최대 길이                  |
| ---------------- | ---------------------------------- |
| `text`           | 1000자                             |
| `image`          | 400자                              |
| `wide_image`     | 76자                               |
| `wide_item_list` | 제목/설명은 items_json 내에서 제한 |
| `carousel`       | 카드별 message 최대 180자          |

**버튼 구조** (`buttons` 배열의 각 항목)

| 필드             | 타입   | 설명                                                            |
| ---------------- | ------ | --------------------------------------------------------------- |
| `name`           | string | 버튼 텍스트                                                     |
| `type`           | string | `WL` (웹링크), `AL` (앱링크), `DS` (배송조회), `BK` (봇 키워드) |
| `url_mobile`     | string | 모바일 URL (`WL`형 필수)                                        |
| `url_pc`         | string | PC URL                                                          |
| `scheme_ios`     | string | iOS 앱 스킴 (`AL`형)                                            |
| `scheme_android` | string | Android 앱 스킴 (`AL`형)                                        |

**응답**

```json
// 202 Accepted — 큐 등록 성공
{
    "message": "friendtalk queued"
}
```

```json
// 400 Bad Request — 필수 파라미터 누락
{
    "error": "receiver required"
}
```

```json
// 503 Service Unavailable — 친구톡 비활성화
{
    "error": "friendtalk not enabled"
}
```

---

## msg_type별 발송 예시

### 1. 텍스트형 (text)

```json
POST /v1/friendtalk/send
{
  "receiver": "01012345678",
  "msg_type": "text",
  "content": "안녕하세요! 이번 주말 특별 할인 이벤트를 놓치지 마세요.\n최대 50% 할인 혜택을 드립니다.",
  "is_ad": true,
  "buttons": [
    {
      "name": "이벤트 보러가기",
      "type": "WL",
      "url_mobile": "https://example.com/event",
      "url_pc": "https://example.com/event"
    }
  ]
}
```

### 2. 이미지형 (image)

```json
POST /v1/friendtalk/send
{
  "receiver": "01012345678",
  "msg_type": "image",
  "content": "이번 주 신상품을 확인해 보세요!",
  "image_url": "https://example.com/images/banner.jpg",
  "image_link": "https://example.com/new",
  "is_ad": true
}
```

### 3. 와이드 이미지형 (wide_image)

이미지가 메시지 전체 너비로 표시됩니다. 본문 최대 76자.

```json
POST /v1/friendtalk/send
{
  "receiver": "01012345678",
  "msg_type": "wide_image",
  "content": "깜짝 세일 시작!",
  "image_url": "https://example.com/images/wide_banner.jpg",
  "image_link": "https://example.com/sale",
  "is_ad": true,
  "buttons": [
    {
      "name": "지금 쇼핑하기",
      "type": "WL",
      "url_mobile": "https://example.com/sale"
    }
  ]
}
```

### 4. 와이드 아이템 리스트형 (wide_item_list)

여러 상품/항목을 리스트 형태로 노출합니다. `items_json`에 `FriendTalkItem` 배열을 JSON 문자열로 전달합니다.

```json
POST /v1/friendtalk/send
{
  "receiver": "01012345678",
  "msg_type": "wide_item_list",
  "content": "이번 주 추천 상품입니다.",
  "header": "BEST 상품",
  "is_ad": true,
  "items_json": "[{\"title\":\"상품 A\",\"image_url\":\"https://example.com/a.jpg\",\"link_mobile\":\"https://example.com/a\"},{\"title\":\"상품 B\",\"image_url\":\"https://example.com/b.jpg\",\"link_mobile\":\"https://example.com/b\"}]"
}
```

`items_json` 개별 아이템 구조:

| 필드             | 타입   | 필수 | 설명              |
| ---------------- | ------ | ---- | ----------------- |
| `title`          | string | ✅   | 아이템 제목       |
| `image_url`      | string | ✅   | 아이템 이미지 URL |
| `link_mobile`    | string | ✅   | 모바일 클릭 링크  |
| `link_pc`        | string |      | PC 클릭 링크      |
| `scheme_ios`     | string |      | iOS 앱 스킴       |
| `scheme_android` | string |      | Android 앱 스킴   |

### 5. 캐러셀 피드형 (carousel)

이미지 카드를 슬라이드로 노출합니다. `carousel_json`에 `FriendTalkCarousel` 객체를 JSON 문자열로 전달합니다.

```json
POST /v1/friendtalk/send
{
  "receiver": "01012345678",
  "msg_type": "carousel",
  "content": "",
  "is_ad": true,
  "carousel_json": "{\"items\":[{\"header\":\"겨울 신상\",\"message\":\"따뜻하고 스타일리시한 겨울 컬렉션\",\"image_url\":\"https://example.com/winter.jpg\",\"buttons\":[{\"name\":\"구매하기\",\"type\":\"WL\",\"url_mobile\":\"https://example.com/winter\"}]},{\"header\":\"봄 예약\",\"message\":\"두근두근 봄 신상 예약 판매 중\",\"image_url\":\"https://example.com/spring.jpg\",\"buttons\":[{\"name\":\"예약하기\",\"type\":\"WL\",\"url_mobile\":\"https://example.com/spring\"}]}]}"
}
```

`carousel_json` 구조:

```json
{
    "items": [
        {
            "header": "카드 제목 (최대 20자)",
            "message": "카드 설명 (최대 180자)",
            "image_url": "https://example.com/card.jpg",
            "image_link": "https://example.com/",
            "buttons": [
                {
                    "name": "버튼",
                    "type": "WL",
                    "url_mobile": "https://example.com/"
                }
            ]
        }
    ],
    "tail": {
        "link_mobile": "https://example.com/more",
        "link_pc": "https://example.com/more"
    }
}
```

---

## 훅 연동 (friendtalk_msg 엔티티)

`friendtalk_msg` 엔티티에 레코드를 INSERT하면 `after_insert` 훅이 자동으로 친구톡 발송을 트리거합니다.  
API를 직접 호출하는 것과 기능은 동일하지만, 발송 이력이 `friendtalk_msg`에도 남아 추적이 용이합니다.

### INSERT 예시

```json
POST /v1/entity/friendtalk_msg
{
  "receiver": "01012345678",
  "content": "주문이 확인되었습니다.",
  "msg_type": "text",
  "is_ad": false,
  "provider": "aligo",
  "ref_entity": "orders",
  "ref_seq": 1001
}
```

### 훅 매핑 (friendtalk_msg.json)

INSERT 후 `after_insert` 훅이 다음 필드들을 친구톡 발송 작업으로 전달합니다:

| 훅 변수                    | 소스 필드       |
| -------------------------- | --------------- |
| `friendtalk_receiver`      | `receiver`      |
| `friendtalk_content`       | `content`       |
| `friendtalk_msg_type`      | `msg_type`      |
| `friendtalk_image_url`     | `image_url`     |
| `friendtalk_image_link`    | `image_link`    |
| `friendtalk_is_ad`         | `is_ad`         |
| `friendtalk_buttons_json`  | `buttons_json`  |
| `friendtalk_carousel_json` | `carousel_json` |
| `friendtalk_items_json`    | `items_json`    |
| `friendtalk_header`        | `header`        |

---

## 엔티티 구조

### friendtalk_msg

발송 요청 원본을 보관합니다.

| 필드            | 타입    | 설명                                                                  |
| --------------- | ------- | --------------------------------------------------------------------- |
| `seq`           | integer | 자동 증가 기본키                                                      |
| `receiver`      | string  | 수신자 전화번호                                                       |
| `content`       | text    | 메시지 본문                                                           |
| `msg_type`      | string  | 메시지 유형 (`text`/`image`/`wide_image`/`wide_item_list`/`carousel`) |
| `image_url`     | string  | 이미지 URL                                                            |
| `image_link`    | string  | 이미지 링크                                                           |
| `is_ad`         | boolean | 광고 여부                                                             |
| `buttons_json`  | text    | 버튼 목록 JSON                                                        |
| `carousel_json` | text    | 캐러셀 JSON                                                           |
| `items_json`    | text    | 아이템 리스트 JSON                                                    |
| `header`        | string  | 와이드 아이템 헤더                                                    |
| `provider`      | string  | 사용 프로바이더 driver명                                              |
| `status`        | string  | 처리 상태                                                             |
| `ref_entity`    | string  | 참조 엔티티 이름                                                      |
| `ref_seq`       | integer | 참조 엔티티 seq                                                       |

### friendtalk_log

실제 발송 시도 로그입니다. 재시도마다 레코드가 업데이트됩니다.

| 필드                 | 타입     | 설명                                                     |
| -------------------- | -------- | -------------------------------------------------------- |
| `seq`                | integer  | 자동 증가 기본키                                         |
| `status`             | string   | `pending` / `processing` / `sent` / `failed` / `expired` |
| `msg_type`           | string   | 메시지 유형                                              |
| `receiver`           | string   | 수신자 전화번호                                          |
| `content`            | text     | 발송된 본문                                              |
| `image_url`          | string   | 이미지 URL                                               |
| `image_link`         | string   | 이미지 링크                                              |
| `is_ad`              | boolean  | 광고 여부                                                |
| `buttons_json`       | text     | 버튼 JSON                                                |
| `carousel_json`      | text     | 캐러셀 JSON                                              |
| `items_json`         | text     | 아이템 리스트 JSON                                       |
| `header`             | string   | 헤더                                                     |
| `provider`           | string   | 사용 프로바이더                                          |
| `provider_msg_id`    | string   | 프로바이더 메시지 ID                                     |
| `error_message`      | text     | 오류 메시지                                              |
| `retry_count`        | integer  | 재시도 횟수                                              |
| `sent_at`            | datetime | 발송 완료 시각                                           |
| `friendtalk_msg_seq` | integer  | `friendtalk_msg` 참조 seq                                |

---

## 광고 메시지 규칙

카카오 정책상 광고성 메시지에는 아래 규칙이 강제됩니다.

1. **`is_ad: true`** 설정 시 `alimtalk.json`의 `ad_prefix`가 본문 앞에 자동 삽입됩니다.
    - 기본: `(광고)` → 실제 발송 본문: `(광고) 안녕하세요...`
2. 광고 메시지 수신자는 **채널 추가 + 광고 수신 동의**가 모두 완료되어 있어야 합니다.
3. 야간(21:00 ~ 08:00) 광고 발송은 카카오 정책에 따라 제한될 수 있습니다.
4. `default_ad: true` 설정 시 `is_ad`를 명시하지 않으면 자동으로 광고로 처리됩니다.

> 비광고 서비스 메시지(`is_ad: false`)는 수신 동의 없이 발송 가능하지만,  
> 실제로 광고 내용을 포함할 경우 카카오 가이드라인 위반입니다.

---

## 운영 팁

**워커 수 조정**  
트래픽이 높은 경우 `workers` 값을 높이세요. 단, 프로바이더 API 초당 요청 제한을 초과하지 않도록 주의합니다.

```json
"friendtalk": {
  "enabled": true,
  "workers": 5
}
```

**발송 상태 조회**  
`friendtalk_log` 엔티티를 직접 조회하여 발송 상태를 확인할 수 있습니다.

```
GET /v1/entity/friendtalk_log?friendtalk_msg_seq=1001
```

**실패 메시지 재처리**  
`status: failed` 레코드의 `error_message`를 확인한 뒤, 원인을 수정하고 `friendtalk_msg`를 재INSERT하세요.

**채널 미추가 수신자 오류**  
수신자가 채널을 추가하지 않은 경우 프로바이더에서 오류가 반환됩니다.  
알림톡(`/v1/alimtalk/send`)은 채널 미추가 사용자에게도 발송 가능하므로, 서비스 메시지에는 알림톡을 사용하세요.

---

## 관련 문서

- [알림톡 가이드](alimtalk-guide.md)
- [푸시 알림 가이드](push-guide.md)
- [SMS 가이드](sms-guide.md)
- [SMTP 이메일 발송 가이드](smtp-guide.md)

## 관련 문서

- [알림톡 가이드](alimtalk-guide.md)
- [SMTP 이메일 가이드](smtp-guide.md)
- [SMS/LMS 가이드](sms-guide.md)
- [푸시 알림 가이드](push-guide.md)

## 다음 문서

- [소셜 로그인](../extensions/social-login-guide.md)
- [훅](../api-routes/hooks.md)
- [목록으로 돌아가기](../README.md)
