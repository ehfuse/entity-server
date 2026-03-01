# 푸시 알림 가이드

Entity Server는 FCM (Firebase Cloud Messaging)을 통해 사용자 디바이스로 푸시 알림을 전송하는 기능을 내장하고 있습니다.

## 개요

엔티티 훅 시스템의 `push` 타입을 사용하면, **엔티티에 insert 한 번으로 사용자의 모든 등록 디바이스에 자동으로 푸시 알림이 전송**됩니다.

```
클라이언트 → POST /v1/push_msg (insert)
                ↓
         after_insert 훅 (push 타입)
                ↓
         account_device 엔티티에서 수신자 디바이스 조회
                ↓
         FCM 비동기 전송 (워커 풀)
                ↓
         push_log 엔티티에 발송 이력 기록
```

### 발송 큐 타이밍

- `type: "push"` 훅 실행 시 즉시 외부 전송하지 않고 `push_log(status=pending)`에 적재합니다.
- 푸시 서비스 시작 직후 디스패처가 1회 즉시 실행됩니다.
- 이후 디스패처가 5초 간격으로 pending 레코드를 claim하여 워커가 발송합니다.
- 즉, 일반적으로 insert 후 발송까지 `0~5초 + 워커 처리시간`이 소요됩니다.

### 시스템 필수 엔티티

푸시 활성화 시 다음 엔티티가 필수입니다.

- `account_device` (`entities/System/Auth/`)
- `push_msg` (`entities/System/Push/`)
- `push_log` (`entities/System/Push/`)

## 설정

### 1. Firebase 프로젝트 준비

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트 생성
2. **프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성** → JSON 파일 다운로드
3. JSON에서 `private_key` 값을 `configs/keys/firebase.pem`으로 저장
4. 나머지 내용을 `configs/notification/push.json`의 `fcm` 키에 입력하고 `private_key_file` 경로 지정

### 2. 키 디렉토리 구조

```
configs/
├── push.json              ← FCM/APNs 설정 (키 제외 정보)
└── keys/                  ← 비공개키 모음 (.gitignore에 자동 제외)
    ├── firebase.pem.example   ← FCM 키 형식 참고 (Git 추적)
    ├── firebase.pem           ← Firebase 서비스 계정 개인키 (Git 제외)
    ├── apns.p8.example        ← APNs 키 형식 참고 (Git 추적)
    └── apns.p8                ← APNs 인증 키 (Git 제외)
```

**`configs/keys/firebase.pem`** 생성 (`firebase.pem.example` 참고, Firebase JSON의 `private_key` 값):

```
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...
-----END PRIVATE KEY-----
```

### 3. push.json 설정

`configs/notification/push.json`:

```json
{
    "workers": 2,
    "queue_size": 500,
    "fcm": {
        "enabled": true,
        "type": "service_account",
        "project_id": "my-firebase-project-id",
        "private_key_id": "abc123...",
        "private_key_file": "./configs/keys/firebase.pem",
        "client_email": "firebase-adminsdk-xxx@my-firebase-project-id.iam.gserviceaccount.com",
        "client_id": "123456789",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": "https://www.googleapis.com/robot/v1/..."
    },
    "apns": {
        "enabled": false,
        "key_file": "./configs/keys/apns.p8",
        "key_id": "ABCDE12345",
        "team_id": "FGHIJ67890",
        "bundle_id": "com.example.myapp",
        "production": false
    }
}
```

> APNs 직접 전송은 미구현(예약)입니다. iOS는 FCM을 통해 푸시를 받으므로 `fcm` 설정만으로 iOS도 동작합니다.

| 필드                   | 기본값  | 설명                                                    |
| ---------------------- | ------- | ------------------------------------------------------- |
| `fcm.enabled`          | `false` | FCM 푸시 활성화                                         |
| `workers`              | `2`     | 동시 발송 워커 수                                       |
| `queue_size`           | `500`   | 발송 큐 버퍼 크기                                       |
| `fcm`                  | —       | Firebase 서비스 계정 JSON 필드들 (service_account 형식) |
| `fcm.private_key_file` | —       | PEM 키 파일 경로 (`configs/keys/` 권장)                 |
| `apns.enabled`         | `false` | APNs 푸시 활성화 (미구현 - 예약)                        |
| `apns.key_file`        | —       | APNs `.p8` 키 파일 경로 (미구현 - 예약)                 |
| `apns.key_id`          | —       | `.p8` 파일명의 ID 부분 (`AuthKey_XXXXX.p8`)             |
| `apns.team_id`         | —       | Apple Developer 팀 ID                                   |
| `apns.bundle_id`       | —       | 앱 번들 ID (`com.example.myapp`)                        |
| `apns.production`      | `false` | `true`이면 프로덕션 APNs 서버 사용                      |

> **APNs 키 취득**: Apple Developer Console → Certificates, Identifiers & Profiles → Keys → "+" → APNs 체크 → 생성 → `.p8` 다운로드. `key_id`는 파일명에서 (`AuthKey_ABCDE12345.p8` → `ABCDE12345`), `team_id`는 Developer 계정 상단에 표시됩니다.

> **APNs 현황**: FCM을 통한 iOS 푸시는 현재 지원됩니다. APNs 직접 전송은 추후 구현 예정입니다.

### 4. 환경 변수 (선택)

`.env` 파일 또는 시스템 환경 변수로 project_id를 오버라이드할 수 있습니다:

```dotenv
FCM_PROJECT_ID=my-firebase-project-id
```

## 사용법

### 디바이스 등록

클라이언트 앱에서 푸시 토큰을 받아 `account_device` 엔티티에 등록합니다:

```bash
# 디바이스 등록 (push_token 포함)
curl -X POST http://localhost:47200/v1/entity/account_device/submit \
  -H "Content-Type: application/json" \
  -d '{
    "id": "device-uuid-123",
    "account_seq": 1,
    "platform": "android",
    "device_type": "mobile",
    "push_token": "dK8f...푸시토큰...x9Qs",
    "push_enabled": true
  }'
```

`account_device` 엔티티의 푸시 관련 필드:

| 필드           | 타입   | 설명                                                 |
| -------------- | ------ | ---------------------------------------------------- |
| `push_token`   | string | 푸시 디바이스 토큰                                   |
| `push_enabled` | bool   | 푸시 수신 허용 (기본: `true`)                        |
| `platform`     | enum   | `android`, `ios`, `web`, `windows`, `macos`, `linux` |

검증 규칙:

- `push_enabled=true` 이고 `platform`이 `android`/`ios`이면 `push_token`이 필요합니다.
- PC/웹 플랫폼(`web`, `windows`, `macos`, `linux`)은 `push_token` 없이 등록 가능합니다.

### 알림 보내기

`push_msg` 엔티티에 insert하면 수신자 디바이스로 자동 푸시 전송됩니다:

```bash
# 사용자에게 알림 보내기 (insert 한 번 = 푸시 알림 자동 전송)
curl -X POST http://localhost:47200/v1/entity/push_msg/submit \
  -H "Content-Type: application/json" \
  -d '{
    "account_seq": 1,
    "title": "새로운 결재 요청",
    "message": "새로운 결재 요청이 도착했습니다",
    "ref_entity": "approval",
    "ref_seq": 42,
    "msg_data": "{\"priority\":\"high\"}"
  }'
```

이 한 번의 insert로:

1. `push_msg` 레코드 생성
2. `account_seq=1`인 계정의 모든 등록 디바이스에 FCM 푸시 전송
3. `push_log` 엔티티에 발송 결과 기록

### 발송 이력 조회

```bash
# 특정 사용자의 푸시 발송 이력
curl http://localhost:47200/v1/entity/push_log/list?account_seq=1
```

## 커스텀 엔티티에 push 훅 추가

`push_msg` 외에 다른 엔티티에도 push 훅을 추가할 수 있습니다:

```json
{
    "name": "order",
    "hooks": {
        "after_insert": [
            {
                "type": "push",
                "target_user_field": "customer_seq",
                "title": "주문 접수",
                "push_body": "주문 #${new.seq}이 접수되었습니다",
                "push_data": {
                    "order_seq": "${new.seq}",
                    "action": "order_created"
                }
            }
        ]
    }
}
```

### push 훅 필드

| 필드                | 기본값          | 설명                             |
| ------------------- | --------------- | -------------------------------- |
| `type`              | —               | `"push"` (필수)                  |
| `target_user_field` | `"account_seq"` | 수신자 account seq를 담는 필드명 |
| `title`             | `"새 알림"`     | 알림 제목 (템플릿 지원)          |
| `push_body`         | —               | 알림 본문 (템플릿 지원)          |
| `push_data`         | —               | 커스텀 데이터 맵 (템플릿 지원)   |
| `enabled`           | `true`          | 훅 활성화 여부                   |
| `required`          | `false`         | 실패 시 insert 롤백 여부         |

### 템플릿 변수

- `${new.필드명}` — insert된 데이터의 필드 값
- `${new.seq}` — 생성된 레코드의 seq

## 아키텍처

```
                    ┌─────────────┐
  API Request ──→   │  Entity CRUD │
                    │  (Submit)    │
                    └──────┬──────┘
                           │ after_insert
                    ┌──────▼──────┐
                    │  Push Hook  │  enqueue (non-blocking)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Push Queue │  channel (buffered)
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         Worker 0     Worker 1     Worker N
              │            │            │
              ▼            ▼            ▼
      ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ account_ │  │ FCM API  │  │ push_log │
      │ device   │  │ Send     │  │ Record   │
      │ Query    │  │          │  │          │
      └──────────┘  └──────────┘  └──────────┘
```

- **비동기 처리**: push 훅은 큐에 넣기만 하고 즉시 반환 → API 응답 지연 없음
- **워커 풀**: 설정된 수의 goroutine이 큐를 소비하며 병렬 발송
- **토큰 만료 자동 처리**: FCM에서 `UNREGISTERED` 응답 시 해당 디바이스의 `push_enabled`를 자동으로 `false`로 변경
- **발송 이력**: `push_log` 엔티티에 모든 발송 시도/결과 기록

## 관련 엔티티

| 엔티티           | 위치                    | 역할                          |
| ---------------- | ----------------------- | ----------------------------- |
| `account_device` | `entities/System/Auth/` | 디바이스 등록 + FCM 토큰 관리 |
| `push_msg`       | `entities/System/Push/` | 푸시 트리거 메시지 엔티티     |
| `push_log`       | `entities/System/Push/` | 발송 이력 추적                |

---

## 관련 문서

- [알림톡 가이드](alimtalk-guide.md)
- [친구톡(FriendTalk) 가이드](friendtalk-guide.md)
- [SMS 가이드](sms-guide.md)
- [SMTP 이메일 발송 가이드](smtp-guide.md)

## 관련 문서

- [SMTP 이메일 가이드](smtp-guide.md)
- [SMS/LMS 가이드](sms-guide.md)
- [카카오 알림톡 가이드](alimtalk-guide.md)

## 다음 문서

- [소셜 로그인](../extensions/social-login-guide.md)
- [훅](../api-routes/hooks.md)
- [API 라우트](../api-routes/api-routes.md)
- [목록으로 돌아가기](../README.md)
