# 전자세금계산서 가이드

Entity Server는 다중 프로바이더 기반 전자세금계산서 발행·관리를 지원합니다. 홈택스 접속 없이 ERP/CRM 내부에서 세금계산서를 발행하고, 국세청으로 자동 전송합니다.

## 목차

- [개요](#개요)
- [지원 프로바이더](#지원-프로바이더)
- [프로바이더별 가격표](#프로바이더별-가격표)
- [사전 준비](#사전-준비)
- [설정 (tax-invoice.json)](#설정-tax-invoicejson)
- [발행 흐름](#발행-흐름)
- [상태 모델](#상태-모델)
- [API 레퍼런스](#api-레퍼런스)
- [엔티티 구조](#엔티티-구조)
- [국세청 전송](#국세청-전송)
- [수정세금계산서](#수정세금계산서)
- [프로바이더별 설정 가이드](#프로바이더별-설정-가이드)
- [비즈니스 규칙](#비즈니스-규칙)
- [오류 처리](#오류-처리)
- [보안 권장사항](#보안-권장사항)

---

## 개요

전자세금계산서 기능은 **드라이버 패턴**으로 설계되어 있으며, `configs/extensions/tax-invoice.json`의 `driver` 값 하나로 프로바이더를 교체할 수 있습니다.

```
[Entity Server]
    │
    ├─ TaxInvoiceDriver (interface)
    │       ├─ BarobillDriver  ──SOAP──▶ 바로빌    ──▶ 국세청 e세로
    │       ├─ PopbillDriver   ──REST──▶ 팝빌      ──▶ 국세청 e세로
    │       ├─ BoltaDriver     ──REST──▶ 볼타      ──▶ 국세청 e세로
    │       ├─ SmartbillDriver ──REST──▶ 스마트빌  ──▶ 국세청 e세로
    │       └─ EseroDriver     ─────────────────────▶ 국세청 e세로 (직접)
```

### 지원 발행 유형

| 유형               | 설명                                        |
| ------------------ | ------------------------------------------- |
| **정발급**         | 공급자가 작성 후 공급받는자에게 이메일 발송 |
| **역발행**         | 공급받는자가 작성 → 공급자 승인 후 발급     |
| **위수탁발급**     | 수탁자가 공급자 대신 발행                   |
| **수정세금계산서** | 기 발행 건에 대한 수정 (6가지 사유 코드)    |

---

## 지원 프로바이더

| 프로바이더          | driver 키   | API 방식    | 인증 방식                                | 공식 문서                          | 특징                                |
| ------------------- | ----------- | ----------- | ---------------------------------------- | ---------------------------------- | ----------------------------------- |
| **바로빌**          | `barobill`  | SOAP (ASMX) | CertKey + 사업자번호                     | https://dev.barobill.co.kr         | SOAP 레거시, 국내 연동사 다수       |
| **팝빌** (링크허브) | `popbill`   | REST (JSON) | LinkID + SecretKey → JWT                 | https://developers.popbill.com     | Go SDK 제공, Webhook 지원           |
| **볼타**            | `bolta`     | REST (JSON) | API Key (HTTP Basic) + Customer-Key 헤더 | https://docs.bolta.io              | 최신 REST, Webhook 지원             |
| **스마트빌**        | `smartbill` | REST (JSON) | API Key → Token (10분 TTL, Bearer)       | https://developers.smartbill.co.kr | Token 갱신 필요, 샌드박스 제공      |
| **국세청 e세로**    | `esero`     | REST (XML)  | 공동인증서 (직접발급사업자 등록)         | https://esero.go.kr                | 건당 수수료 없음, XML 전자서명 필요 |

### 드라이버 선택 기준

| 기준                              | 추천 드라이버              |
| --------------------------------- | -------------------------- |
| 신규 개발, REST + Webhook 선호    | `bolta` 또는 `popbill`     |
| 다양한 언어 SDK가 필요            | `popbill`                  |
| 레거시 SOAP 연동 유지             | `barobill`                 |
| 비즈니스온 ERP 사용 기업          | `smartbill`                |
| 월 발행량이 매우 많아 수수료 절감 | `esero` (구현 복잡도 높음) |

### 프로바이더별 가격표

> **주의**: 아래 가격은 2026년 3월 기준이며, 프로바이더 정책에 따라 변동될 수 있습니다. 정확한 요금은 각 프로바이더 공식 사이트에서 확인하세요.

#### 바로빌 (barobill)

| 요금제          | 건당 단가 (VAT 별도) | 비고                  |
| --------------- | -------------------- | --------------------- |
| 종량제          | 100원                | 선불 충전 방식        |
| 정액제 1,000건  | 80원 (월 80,000원)   | 월 단위 계약          |
| 정액제 5,000건  | 60원 (월 300,000원)  | 월 단위 계약          |
| 정액제 10,000건 | 50원 (월 500,000원)  | 대량 발행 기업용      |
| 무료 체험       | 0원                  | 테스트 환경 10건 무료 |

#### 팝빌 (popbill)

| 요금제          | 건당 단가 (VAT 별도)  | 비고                            |
| --------------- | --------------------- | ------------------------------- |
| 종량제          | 100원                 | 선불 포인트 충전                |
| 정액제 1,000건  | 80원 (월 80,000원)    | 연 계약 시 할인 적용            |
| 정액제 5,000건  | 60원 (월 300,000원)   | 연 계약 시 할인 적용            |
| 정액제 30,000건 | 40원 (월 1,200,000원) | 대량 발행 기업 전용             |
| 무료 체험       | 0원                   | 샌드박스 무제한, 운영 10건 무료 |

#### 볼타 (bolta)

| 요금제     | 건당 단가 (VAT 별도) | 비고                         |
| ---------- | -------------------- | ---------------------------- |
| Free       | 0원                  | 월 50건 무료                 |
| Standard   | 100원                | 종량 과금, 월 기본료 없음    |
| Business   | 60원                 | 월 1,000건 이상 시 자동 적용 |
| Enterprise | 별도 협의            | 월 10,000건 이상, 전용 지원  |

#### 스마트빌 (smartbill)

| 요금제          | 건당 단가 (VAT 별도) | 비고                        |
| --------------- | -------------------- | --------------------------- |
| 종량제          | 100원                | 선불 충전                   |
| 정액제 1,000건  | 70원 (월 70,000원)   | 비즈니스온 ERP 연동 시 할인 |
| 정액제 5,000건  | 50원 (월 250,000원)  | 비즈니스온 ERP 연동 시 할인 |
| 정액제 20,000건 | 40원 (월 800,000원)  | 대량 발행 기업용            |
| 무료 체험       | 0원                  | 샌드박스 무제한             |

#### 국세청 e세로 (esero)

| 요금제   | 건당 단가 | 비고                              |
| -------- | --------- | --------------------------------- |
| 직접발급 | **0원**   | 건당 수수료 없음, 공동인증서 필요 |

> **e세로 참고**: 수수료는 없지만 공동인증서 발급·갱신 비용(연 4,400원~110,000원)과 XML 전자서명 구현 복잡도를 고려해야 합니다.

#### 비용 비교 요약 (월 1,000건 기준)

| 프로바이더 | 월 예상 비용 (VAT 별도)                | 비고             |
| ---------- | -------------------------------------- | ---------------- |
| 바로빌     | 80,000원                               | 정액제 기준      |
| 팝빌       | 80,000원                               | 정액제 기준      |
| 볼타       | 100,000원 (종량) / 60,000원 (Business) | 자동 등급 전환   |
| 스마트빌   | 70,000원                               | 정액제 기준      |
| e세로      | 0원                                    | 인증서 비용 별도 |

---

## 사전 준비

1. 사용할 프로바이더의 개발자 콘솔에서 **인증키**를 발급받습니다.
2. 프로바이더에 **공동인증서**를 등록합니다 (정발급·위수탁 시 필요).
3. `entities/TaxInvoice/` 디렉토리에 엔티티 JSON 파일 4개가 배치되어 있는지 확인합니다.

```bash
ls entities/TaxInvoice/
# tax_invoice_party.json
# tax_invoice.json
# tax_invoice_item.json
# tax_invoice_log.json
```

---

## 설정 (tax-invoice.json)

`configs/extensions/tax-invoice.json`에 프로바이더 및 운영 설정을 구성합니다. 예제 파일은 `configs-example/extensions/tax-invoice.json.example`을 참고하세요.

### 최소 설정 (바로빌 1개 프로바이더)

```json
{
    "enabled": true,
    "default": "barobill",
    "workers": 2,
    "queue_size": 100,
    "dispatch_interval_sec": 10,
    "max_retries": 3,
    "providers": [
        {
            "driver": "barobill",
            "cert_key": "${TAXINVOICE_CERT_KEY}",
            "corp_num": "${TAXINVOICE_CORP_NUM}",
            "user_id": "${TAXINVOICE_USER_ID}",
            "api_endpoint": "https://barobill.co.kr/TAPI/TaxInvoiceService.asmx",
            "timeout_sec": 30
        }
    ],
    "nts": {
        "auto_send": true,
        "taxation_option": 1,
        "taxation_add_tax_allow": 0,
        "tax_exemption_option": 1,
        "tax_exemption_add_tax_allow": 0
    },
    "notify": ["log", "smtp"],
    "sync": {
        "enabled": true,
        "interval_sec": 600,
        "state_sync_interval_min": 10,
        "max_list_days": 200
    }
}
```

### 설정 항목

| 항목                    | 타입   | 기본값       | 설명                       |
| ----------------------- | ------ | ------------ | -------------------------- |
| `enabled`               | bool   | `false`      | 전자세금계산서 기능 활성화 |
| `default`               | string | `"barobill"` | 기본 프로바이더 드라이버명 |
| `workers`               | int    | `2`          | 비동기 처리 워커 수        |
| `queue_size`            | int    | `100`        | 디스패치 채널 버퍼 크기    |
| `dispatch_interval_sec` | int    | `10`         | 대기 큐 폴링 간격 (초)     |
| `max_retries`           | int    | `3`          | 실패 시 최대 재시도 횟수   |

### 프로바이더 설정

`providers` 배열에 사용할 드라이버를 등록합니다. 여러 프로바이더를 동시에 등록할 수 있으며, 세금계산서 발행 시 `provider` 필드로 지정합니다. 미지정 시 `default` 드라이버가 사용됩니다.

| 필드           | 드라이버                            | 설명                   |
| -------------- | ----------------------------------- | ---------------------- |
| `driver`       | 공통                                | 드라이버 식별자 (필수) |
| `cert_key`     | barobill                            | 인증키                 |
| `corp_num`     | barobill, popbill, smartbill, esero | 사업자번호             |
| `user_id`      | barobill                            | 사용자 ID              |
| `link_id`      | popbill                             | 링크허브 LinkID        |
| `secret_key`   | popbill                             | 링크허브 SecretKey     |
| `api_key`      | bolta, smartbill                    | API Key                |
| `customer_key` | bolta                               | Customer-Key           |
| `cert_path`    | esero                               | 공동인증서 .pfx 경로   |
| `cert_pass`    | esero                               | 인증서 비밀번호        |
| `api_endpoint` | 공통                                | API 엔드포인트 (필수)  |
| `timeout_sec`  | 공통                                | HTTP 타임아웃 (초)     |

> **민감 정보**: `cert_key`, `secret_key`, `api_key`, `cert_pass` 등은 `${ENV_VAR}` 형식으로 환경변수를 사용하세요.

### 국세청 전송 설정 (nts)

| 항목                          | 설명                                |
| ----------------------------- | ----------------------------------- |
| `auto_send`                   | 발행 후 국세청 자동 전송 여부       |
| `taxation_option`             | 과세 전송 옵션 (1: 즉시, 2: 익일)   |
| `taxation_add_tax_allow`      | 과세 가산세 허용 (0: 차단, 1: 허용) |
| `tax_exemption_option`        | 면세 전송 옵션                      |
| `tax_exemption_add_tax_allow` | 면세 가산세 허용                    |

### 알림 설정 (notify)

`storage.json`과 동일한 배열 패턴입니다. 지원 채널: `"log"`, `"smtp"`, `"sms"`, `"alimtalk"`

```json
"notify": ["log", "smtp", "alimtalk"]
```

| 값         | 설명                       |
| ---------- | -------------------------- |
| `log`      | 발행 결과를 로그에 기록    |
| `smtp`     | 발행 시 이메일 알림 발송   |
| `sms`      | 발행 시 문자 알림 발송     |
| `alimtalk` | 발행 시 카카오 알림톡 발송 |

### 상태 동기화 설정 (sync)

| 항목                      | 설명                    |
| ------------------------- | ----------------------- |
| `enabled`                 | 상태 동기화 활성화 여부 |
| `interval_sec`            | 동기화 주기 (초)        |
| `state_sync_interval_min` | 상태 동기화 간격 (분)   |
| `max_list_days`           | 목록 조회 최대 일수     |

---

## 발행 흐름

### 정발급 (가장 일반적)

```
POST /tax-invoices/issue
    │
    ├─ 거래처 자동 조회/생성 (tax_invoice_party)
    ├─ 프로바이더 RegistIssue() 호출
    ├─ DB 저장 (tax_invoice + tax_invoice_item)
    ├─ 이력 기록 (tax_invoice_log)
    │
    └─ nts.auto_send = true 이면
        └─ 비동기 국세청 전송 큐에 등록
```

#### 즉시발급 시퀀스

1. 클라이언트 → `POST /tax-invoices/issue` (invoicer/invoicee JSON 포함)
2. Service가 `corp_num` + `tax_reg_id`로 `tax_invoice_party` 조회 (없으면 자동생성)
3. Driver의 `RegistIssue()` 호출 → 프로바이더 API로 발행
4. `tax_invoice` 엔티티에 저장 (state: `issued`)
5. 발행 시점의 거래처 정보를 스냅샷 JSON으로 `invoicer`, `invoicee` 필드에 보존
6. `tax_invoice_log`에 `regist_issue` 이력 기록
7. 응답: `{ state: "issued", nts_state: "waiting", mgt_key: "..." }`

#### 저장 후 발급

1. `POST /tax-invoices` → state: `draft` (임시저장)
2. `POST /tax-invoices/:mgtKey/issue` → state: `issued` (발행)

### 역발행

1. `POST /tax-invoices/reverse-issue` → state: `reverse_waiting`
2. 공급자가 `POST /tax-invoices/:mgtKey/issue` → state: `issued` (승인 발행)
3. 또는 `POST /tax-invoices/:mgtKey/refuse` → state: `refused` (거부)
4. 또는 공급받는자가 `POST /tax-invoices/:mgtKey/cancel` → state: `cancelled` (취소)

---

## 상태 모델

### state (발행 흐름 상태)

| state                | 설명                      |
| -------------------- | ------------------------- |
| `draft`              | 임시저장                  |
| `pre_issue_waiting`  | 발급예정 승인대기         |
| `pre_issue_accepted` | 발급예정 승인완료         |
| `reverse_waiting`    | 역발행 요청 대기          |
| `issued`             | 발행완료                  |
| `issue_cancelled`    | 발행취소 (국세청 전송 전) |
| `refused`            | 거부                      |
| `cancelled`          | 취소                      |

### nts_state (국세청 전송 상태)

| nts_state   | 설명        |
| ----------- | ----------- |
| `pending`   | 전송 전     |
| `waiting`   | 전송 대기중 |
| `sending`   | 전송 처리중 |
| `completed` | 전송 완료   |
| `failed`    | 전송 실패   |

### 프로바이더별 상태 매핑

각 드라이버는 프로바이더 고유 상태코드를 위 공통 enum으로 정규화합니다. 원본 코드는 `provider_raw` 필드에 JSON으로 보존됩니다.

| 공통 state        | 바로빌 코드      | 팝빌 코드 | 볼타 상태         | 비고                          |
| ----------------- | ---------------- | --------- | ----------------- | ----------------------------- |
| `draft`           | 1000             | 1         | DRAFT             |                               |
| `reverse_waiting` | 2020             | 20        | REVERSE_REQUESTED |                               |
| `issued`          | 3014, 3011, 3021 | 4         | ISSUED            |                               |
| `issue_cancelled` | 5014             | 6         | CANCELLED\*       | \*볼타는 취소사유 필드로 분기 |
| `refused`         | 4012, 4022       | 7         | REFUSED           |                               |
| `cancelled`       | 5013, 5023       | 5         | CANCELLED\*       | \*볼타는 취소사유 필드로 분기 |

---

## API 레퍼런스

### 엔드포인트 목록

| Method   | Path                               | 설명                        |
| -------- | ---------------------------------- | --------------------------- |
| `POST`   | `/tax-invoices`                    | 세금계산서 임시저장         |
| `POST`   | `/tax-invoices/issue`              | 저장+발급 (즉시)            |
| `POST`   | `/tax-invoices/pre-issue`          | 저장+발급예정               |
| `POST`   | `/tax-invoices/reverse-issue`      | 저장+역발행 요청            |
| `PUT`    | `/tax-invoices/:mgtKey`            | 세금계산서 수정             |
| `POST`   | `/tax-invoices/:mgtKey/issue`      | 발급 처리                   |
| `POST`   | `/tax-invoices/:mgtKey/cancel`     | 취소                        |
| `POST`   | `/tax-invoices/:mgtKey/accept`     | 발급예정 승인               |
| `POST`   | `/tax-invoices/:mgtKey/refuse`     | 거부                        |
| `DELETE` | `/tax-invoices/:mgtKey`            | 삭제 (임시저장·취소·거부만) |
| `GET`    | `/tax-invoices/:mgtKey`            | 세금계산서 조회             |
| `GET`    | `/tax-invoices/:mgtKey/state`      | 상태 조회                   |
| `GET`    | `/tax-invoices/:mgtKey/logs`       | 이력 조회                   |
| `GET`    | `/tax-invoices`                    | 목록 조회                   |
| `POST`   | `/tax-invoices/:mgtKey/send-email` | 이메일 재전송               |
| `POST`   | `/tax-invoices/:mgtKey/send-sms`   | 문자 재전송                 |
| `POST`   | `/tax-invoices/nts/send`           | 국세청 수동 전송            |
| `GET`    | `/tax-invoices/nts/send-option`    | 국세청 전송설정 조회        |
| `PUT`    | `/tax-invoices/nts/send-option`    | 국세청 전송설정 변경        |

### 세금계산서 즉시발급

```bash
curl -X POST http://localhost:3000/v1/tax-invoices/issue \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "mgt_key": "20260301-SALE-0001",
    "issue_direction": "forward",
    "tax_invoice_type": 1,
    "tax_type": "taxation",
    "purpose_type": 2,
    "write_date": "20260301",
    "invoicer": {
        "corp_num": "1234567890",
        "corp_name": "(주)공급자",
        "ceo_name": "홍길동",
        "addr": "서울시 강남구",
        "biz_type": "제조업",
        "biz_class": "전자제품",
        "email": "seller@example.com"
    },
    "invoicee": {
        "corp_num": "9876543210",
        "corp_name": "(주)공급받는자",
        "ceo_name": "김철수",
        "addr": "서울시 마포구",
        "email": "buyer@example.com"
    },
    "amount_total": 1000000,
    "tax_total": 100000,
    "total_amount": 1100000,
    "items": [
        {
            "item_seq": 1,
            "purchase_date": "20260301",
            "name": "소프트웨어 라이선스",
            "quantity": 1,
            "unit_price": 1000000,
            "amount": 1000000,
            "tax": 100000
        }
    ]
  }'
```

#### 응답

```json
{
    "success": true,
    "mgt_key": "20260301-SALE-0001",
    "state": "issued",
    "nts_state": "waiting",
    "nts_confirm_num": "202603011234567890123456",
    "message": "발급 완료"
}
```

### 관리번호(MgtKey) 생성 규칙

```
{YYYYMMDD}-{TYPE}-{SEQ:04d}

예) 20260301-SALE-0001   (매출 정발급)
    20260301-PURCH-0001  (매입 역발행)
    20260301-BROKER-0001 (위수탁)
    20260301-MOD-0001    (수정세금계산서)
```

- 최대 24자
- 취소/거부된 관리번호는 **재사용 불가** (삭제 후 새 번호 생성)

### 거래처 자동 해석

API 요청에는 `invoicer`, `invoicee` JSON 객체를 전달합니다. Service 레이어가 `corp_num` + `tax_reg_id` 조합으로 `tax_invoice_party`를 조회(없으면 자동 생성)하여 `invoicer_seq`, `invoicee_seq`를 할당합니다. 발행 시점의 거래처 데이터는 스냅샷 JSON으로 보존됩니다.

---

## 엔티티 구조

엔티티 JSON 파일은 `entities/TaxInvoice/` 디렉토리에 위치합니다.

### tax_invoice_party (거래처 마스터)

공급자·공급받는자·수탁자가 모두 참조하는 공용 거래처 테이블입니다.

| 컬럼           | 타입  | 설명              | 비고          |
| -------------- | ----- | ----------------- | ------------- |
| `corp_num`     | index | 사업자번호        | 필수          |
| `corp_name`    | index | 회사명            | 필수          |
| `tax_reg_id`   | index | 종사업장 식별번호 | 기본값 "0000" |
| `ceo_name`     | field | 대표자명          |               |
| `addr`         | field | 주소              |               |
| `biz_type`     | field | 업태              |               |
| `biz_class`    | field | 업종              |               |
| `contact_name` | field | 담당자명          |               |
| `tel`          | field | 전화번호          |               |
| `hp`           | field | 휴대폰            |               |
| `email`        | field | 이메일            |               |

- 복합 유니크: `[corp_num, tax_reg_id]`

### tax_invoice (세금계산서 마스터)

| 컬럼              | 타입           | 설명                 | 비고                    |
| ----------------- | -------------- | -------------------- | ----------------------- |
| `mgt_key`         | index (unique) | 내부 관리번호        | 필수                    |
| `write_date`      | index          | 작성일자 (YYYYMMDD)  | 필수                    |
| `provider`        | index (enum)   | 프로바이더 드라이버  | 필수                    |
| `invoicer_seq`    | index (FK)     | 공급자 party seq     | 필수                    |
| `invoicee_seq`    | index (FK)     | 공급받는자 party seq | 필수                    |
| `broker_seq`      | index (FK)     | 수탁자 party seq     | 위수탁 시만             |
| `issue_direction` | index (enum)   | 발급방향             | forward/reverse/trustee |
| `tax_type`        | index (enum)   | 과세형태             | taxation/zero/exempt    |
| `state`           | index (enum)   | 발행 상태            | 8개 enum                |
| `nts_state`       | index (enum)   | 국세청 전송 상태     | 5개 enum                |
| `nts_confirm_num` | index          | 국세청 승인번호      |                         |
| `ref_table`       | index          | 연결 테이블명        |                         |
| `ref_seq`         | index          | 연결 데이터 seq      |                         |
| `amount_total`    | field          | 공급가액             |                         |
| `tax_total`       | field          | 세액                 |                         |
| `total_amount`    | field          | 합계금액             |                         |
| `invoicer`        | field (json)   | 공급자 스냅샷        | 발행 시점 보존          |
| `invoicee`        | field (json)   | 공급받는자 스냅샷    | 발행 시점 보존          |
| `broker`          | field (json)   | 수탁자 스냅샷        |                         |
| `provider_raw`    | field (json)   | 프로바이더 원본 응답 |                         |

### tax_invoice_item (품목)

세금계산서 1건당 최대 99개 품목을 저장합니다.

| 컬럼              | 타입  | 설명             |
| ----------------- | ----- | ---------------- |
| `tax_invoice_seq` | index | tax_invoice FK   |
| `item_seq`        | field | 품목 순번 (1~99) |
| `purchase_date`   | field | 공급일자         |
| `name`            | field | 품목명           |
| `information`     | field | 규격             |
| `quantity`        | field | 수량 (decimal)   |
| `unit_price`      | field | 단가 (decimal)   |
| `amount`          | field | 공급가액         |
| `tax`             | field | 세액             |

### tax_invoice_log (처리 이력)

| 컬럼                | 타입         | 설명            |
| ------------------- | ------------ | --------------- |
| `tax_invoice_seq`   | index        | tax_invoice FK  |
| `log_type`          | index (enum) | 이력 유형 (8종) |
| `log_time`          | index        | 발생 일시       |
| `mgt_key`           | field        | 관리번호        |
| `proc_corp_name`    | field        | 처리 회사명     |
| `proc_contact_name` | field        | 처리 담당자명   |
| `memo`              | field        | 메모            |

`log_type` enum: `state_change`, `nts_send`, `nts_result`, `email_send`, `sms_send`, `cancel`, `refuse`, `error`

---

## 국세청 전송

### 자동 전송

`nts.auto_send: true` 설정 시, 세금계산서 발행 완료 후 자동으로 국세청 전송 큐에 등록됩니다.

```
issued → 큐 등록 → worker 처리 → SendToNTS() → nts_state: sending → 동기화 → completed
```

### 수동 전송

```bash
curl -X POST http://localhost:3000/v1/tax-invoices/nts/send \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{ "mgt_key": "20260301-SALE-0001" }'
```

### 상태 동기화

`sync.enabled: true` 설정 시, 주기적으로 `nts_state`가 `waiting` 또는 `sending`인 건을 프로바이더에 조회하여 상태를 업데이트합니다.

> **esero 드라이버** 는 발행 자체가 곧 국세청 전송이므로 동기화 대상에서 제외됩니다.

### 재시도 정책

- 국세청 전송 실패 시 `max_retries` 횟수까지 자동 재시도
- 재시도 횟수 초과 시 `nts_state: failed`로 전환

---

## 수정세금계산서

기 발행된 세금계산서를 수정할 때는 **수정세금계산서**를 발행합니다.

### 수정 사유 코드

| 코드 | 사유                 |
| ---- | -------------------- |
| 1    | 기재사항의 착오·정정 |
| 2    | 공급가액의 변동      |
| 3    | 재화의 환입          |
| 4    | 계약의 해제          |
| 5    | 내국신용장 사후개설  |
| 6    | 착오에 의한 이중발급 |

### 수정세금계산서 발행

```bash
curl -X POST http://localhost:3000/v1/tax-invoices/issue \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "mgt_key": "20260301-MOD-0001",
    "modify_code": 1,
    "original_nts_key": "202603011234567890123456",
    "issue_direction": "forward",
    ...
  }'
```

- `modify_code`: 수정 사유 코드 (1~6)
- `original_nts_key`: 원본 세금계산서의 국세청 승인번호
- 국세청 전송 완료된 건은 **삭제 불가** → 수정세금계산서로만 처리

---

## 프로바이더별 설정 가이드

### 바로빌 (barobill)

```json
{
    "driver": "barobill",
    "cert_key": "${TAXINVOICE_CERT_KEY}",
    "corp_num": "${TAXINVOICE_CORP_NUM}",
    "user_id": "${TAXINVOICE_USER_ID}",
    "api_endpoint": "https://barobill.co.kr/TAPI/TaxInvoiceService.asmx",
    "timeout_sec": 30
}
```

```bash
export TAXINVOICE_CERT_KEY="발급받은 인증키"
export TAXINVOICE_CORP_NUM="1234567890"
export TAXINVOICE_USER_ID="바로빌 사용자 ID"
```

- SOAP (ASMX) 방식으로 통신
- 바로빌 개발자센터(https://dev.barobill.co.kr)에서 인증키 발급
- 테스트 환경: `https://testbarobill.co.kr/TAPI/TaxInvoiceService.asmx`

### 팝빌 (popbill)

```json
{
    "driver": "popbill",
    "link_id": "${TAXINVOICE_LINK_ID}",
    "secret_key": "${TAXINVOICE_SECRET_KEY}",
    "corp_num": "${TAXINVOICE_CORP_NUM}",
    "api_endpoint": "https://taxinvoice.linkhub.co.kr",
    "timeout_sec": 30
}
```

```bash
export TAXINVOICE_LINK_ID="링크허브 LinkID"
export TAXINVOICE_SECRET_KEY="링크허브 SecretKey"
export TAXINVOICE_CORP_NUM="1234567890"
```

- REST JSON 방식, LinkHub Token API로 인증
- 팝빌 개발자센터(https://developers.popbill.com)에서 연동키 발급
- `MgtKeyType`: 매출(SELL), 매입(BUY), 위수탁(TRUSTEE) 구분 필요
- Webhook 지원: 상태 변경 시 실시간 알림 수신 가능

### 볼타 (bolta)

```json
{
    "driver": "bolta",
    "api_key": "${TAXINVOICE_API_KEY}",
    "customer_key": "${TAXINVOICE_CUSTOMER_KEY}",
    "api_endpoint": "https://xapi.bolta.io/v1",
    "timeout_sec": 30
}
```

```bash
export TAXINVOICE_API_KEY="볼타 API Key"
export TAXINVOICE_CUSTOMER_KEY="볼타 Customer-Key"
```

- REST JSON 방식, HTTP Basic Auth(API Key) + Customer-Key 헤더
- 볼타 개발자 문서(https://docs.bolta.io)에서 연동키 발급
- Webhook 지원
- 테스트 인증서 제공

### 스마트빌 (smartbill)

```json
{
    "driver": "smartbill",
    "api_key": "${TAXINVOICE_API_KEY}",
    "corp_num": "${TAXINVOICE_CORP_NUM}",
    "api_endpoint": "https://nxapi.smartbill.co.kr",
    "timeout_sec": 30
}
```

```bash
export TAXINVOICE_API_KEY="스마트빌 API Key"
export TAXINVOICE_CORP_NUM="1234567890"
```

- REST JSON 방식, API Key로 Bearer Token 발급 (10분 TTL, 자동 갱신)
- 스마트빌 개발자센터(https://developers.smartbill.co.kr)에서 연동키 발급
- 샌드박스 환경 제공

### 국세청 e세로 (esero)

```json
{
    "driver": "esero",
    "corp_num": "${TAXINVOICE_CORP_NUM}",
    "cert_path": "/run/secrets/esero_cert.pfx",
    "cert_pass": "${TAXINVOICE_CERT_PASS}",
    "api_endpoint": "https://esero.go.kr/api/v1",
    "timeout_sec": 60
}
```

```bash
export TAXINVOICE_CORP_NUM="1234567890"
export TAXINVOICE_CERT_PASS="인증서 비밀번호"
```

**사전 요구사항:**

1. 국세청에 **직접발급사업자** 등록 신청
2. **공동인증서** 준비 (.pfx 파일)
3. 국세청 테스트망 검증 → 운영망 전환 승인

**특이사항:**

- 발행 = 국세청 전송이므로 `SendToNTS()`는 no-op
- 역발행(`RegistReverseRequest`) 미지원 (ErrNotSupported 반환)
- KFTC 표준전자세금계산서 XML V3.0으로 직접 생성하여 전자서명
- 건당 수수료 없음 — 대량 발행 기업에 유리
- nts_state 흐름: `issued → completed` (중간 단계 없음)

---

## 비즈니스 규칙

### 가산세 처리

- 작성일자 다음달 10일 이후 발급 시 가산세 발생
- `force_issue: false` (기본값) → 가산세 구간이면 발급 차단
- `force_issue: true` → 관리자가 명시적으로 허용 시에만 발급
- `nts.taxation_add_tax_allow: 0` (차단)이면 `force_issue: true`여도 발급 불가

### 취소·삭제 제한

| 상태                                | 취소 가능                | 삭제 가능    |
| ----------------------------------- | ------------------------ | ------------ |
| `draft`                             | -                        | O            |
| `pre_issue_waiting/accepted`        | O (CancelIssue)          | 취소 후 가능 |
| `reverse_waiting`                   | O (CancelReverseRequest) | 취소 후 가능 |
| `issued` (nts_state: pending)       | O (CancelIssue)          | 취소 후 가능 |
| `issued` (nts_state: completed)     | X                        | X            |
| `refused/cancelled/issue_cancelled` | -                        | O            |

> 국세청 전송 완료(`nts_state: completed`) 이후에는 삭제 불가 → **수정세금계산서**로만 처리

---

## 오류 처리

### 공통 오류 유형

프로바이더 고유 오류코드는 아래 공통 유형으로 변환됩니다:

| 공통 오류 유형        | HTTP 상태 | 설명                 |
| --------------------- | --------- | -------------------- |
| `auth_error`          | 401       | 인증키 오류          |
| `corp_num_error`      | 400       | 사업자번호 오류      |
| `duplicate_mgt_key`   | 409       | 관리번호 중복        |
| `invalid_invoice`     | 422       | 세금계산서 내용 오류 |
| `cert_not_registered` | 424       | 공동인증서 미등록    |
| `provider_error`      | 400       | 기타 프로바이더 오류 |

### 재시도 정책

- 국세청 전송 실패: 최대 `max_retries`회 재시도 (간격 30분)
- 프로바이더 API 타임아웃: 최대 2회 재시도 (지수 백오프)
- `esero` 직접 전송 실패: 동일 재시도 정책, 국세청 오류코드는 `provider_raw`에 보존

---

## 보안 권장사항

- 프로바이더 인증키(`cert_key`, `secret_key`, `api_key`, `cert_pass` 등)는 **환경변수** 또는 암호화된 설정으로 관리하세요.
- 세금계산서 조회 API는 해당 `tenant_id` 소유 건만 반환합니다.
- 프로바이더 팝업 URL(팝빌 `GetPopUpURL` 등)은 단기 TTL → **캐시 금지**.
- 발급 행위 로그는 감사 로그(audit log)에 별도 기록됩니다.
- `esero` 직접 연동 시 공동인증서 개인키는 **HSM** 또는 암호화 파일로 보관하세요.
- Docker 환경에서는 `cert_path`를 `/run/secrets/`에 마운트하는 것을 권장합니다.
