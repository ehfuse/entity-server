# 편의 기능 라우트 (Utils Routes)

> `/v1/utils/*` — 행정구역 조회·주소 정제, QR 코드·바코드 생성, PDF→이미지 변환 등 범용 편의 API

---

## 목차

- [행정구역 조회](#address)
    - [시/도 목록](#address-sido)
    - [시/군/구 목록](#address-sigungu)
    - [읍/면/동 목록](#address-dong)
    - [주소 정제 (cleanAddress)](#address-clean)
- [QR 코드 생성 (PNG)](#qr-png)
- [QR 코드 생성 (Base64)](#qr-base64)
- [QR 코드 생성 (ASCII 아트)](#qr-text)
- [바코드 생성 (PNG)](#barcode-png)
- [PDF→PNG 변환](#pdf2png)
- [PDF→JPG 변환](#pdf2jpg)
- [QR 코드 공통 파라미터](#qr-common-params)
- [바코드 공통 파라미터](#barcode-common-params)
- [PDF 변환 공통 파라미터](#pdf-common-params)
- [에러 응답](#error-response)

---

<a id="address"></a>

## 행정구역 조회

`addr_sido` / `addr_sigungu` / `addr_dong` 엔티티 데이터를 조회합니다.  
데이터는 엔티티 서버 `reset_defaults`로 자동 주입됩니다 (시도 17건 · 시군구 228건 · 읍면동 1,440건).

<a id="address-sido"></a>

### GET /v1/utils/address/sido

시/도 전체 목록을 반환합니다.

```
GET /v1/utils/address/sido
```

#### 응답

```json
{
    "ok": true,
    "data": {
        "total": 17,
        "items": [
            { "seq": 1, "sido": "경기도", "sido_short": "경기" },
            { "seq": 2, "sido": "경상남도", "sido_short": "경남" }
        ]
    }
}
```

---

<a id="address-sigungu"></a>

### GET /v1/utils/address/sigungu

시/군/구 목록을 반환합니다. `sido` 파라미터로 특정 시도만 필터링할 수 있습니다.

```
GET /v1/utils/address/sigungu
GET /v1/utils/address/sigungu?sido=서울특별시
```

#### 쿼리 파라미터

| 파라미터 | 타입   | 설명                                    |
| -------- | ------ | --------------------------------------- |
| `sido`   | string | 시도 정식명칭 필터 (생략 시 전체 228건) |

#### 응답

```json
{
    "ok": true,
    "data": {
        "total": 25,
        "items": [
            {
                "seq": 1,
                "sigungu": "강남구",
                "sido": "서울특별시",
                "sido_short": "서울",
                "sido_seq": 9
            }
        ]
    }
}
```

---

<a id="address-dong"></a>

### GET /v1/utils/address/dong

읍/면/동 목록을 반환합니다. `sigungu`를 지정하지 않으면 해당 시도의 전체 읍면동이 반환됩니다.

```
GET /v1/utils/address/dong?sigungu=강남구
GET /v1/utils/address/dong?sido=서울특별시&sigungu=강남구
```

#### 쿼리 파라미터

| 파라미터  | 타입   | 설명                                          |
| --------- | ------ | --------------------------------------------- |
| `sido`    | string | 시도 정식명칭 필터                            |
| `sigungu` | string | 시군구명 필터 (권장 — 미지정 시 최대 1,500건) |

#### 응답

```json
{
    "ok": true,
    "data": {
        "total": 23,
        "items": [
            {
                "seq": 1,
                "dong": "개포동",
                "sigungu": "강남구",
                "sido": "서울특별시",
                "sigungu_seq": 1,
                "sido_seq": 9
            }
        ]
    }
}
```

---

<a id="address-clean"></a>

### GET /v1/utils/address/clean

자유 형식 한국 주소를 시도·시군구·읍면동으로 분해합니다.  
시도 정식명칭 또는 축약명칭을 모두 인식하며, 매칭되지 않은 나머지는 `detail`로 반환합니다.

```
GET /v1/utils/address/clean?q=서울 강남구 역삼동 123-4
GET /v1/utils/address/clean?q=경기 수원시 팔달구 인계동
```

#### 쿼리 파라미터

| 파라미터 | 타입   | 필수 | 설명               |
| -------- | ------ | ---- | ------------------ |
| `q`      | string | ✅   | 정제할 주소 문자열 |

#### 응답

```json
{
    "ok": true,
    "data": {
        "input": "서울 강남구 역삼동 123-4",
        "sido": "서울특별시",
        "sido_short": "서울",
        "sido_seq": 9,
        "sigungu": "강남구",
        "sigungu_seq": 1,
        "dong": "역삼동",
        "dong_seq": 42,
        "detail": "123-4",
        "ok": true
    }
}
```

시도 매칭 실패 시 `ok: false`로 반환됩니다:

```json
{ "ok": true, "data": { "input": "알수없는주소", "ok": false } }
```

#### 에러

| 상태 코드 | 조건                 | 응답                                                          |
| --------- | -------------------- | ------------------------------------------------------------- |
| `400`     | `q` 파라미터 누락    | `{"ok": false, "message": "q parameter is required"}`         |
| `503`     | 엔티티 서비스 미설정 | `{"ok": false, "message": "entity service is not available"}` |

---

<a id="qr-png"></a>

## QR 코드 생성 (PNG)

QR 코드를 PNG 이미지 바이너리로 반환합니다.

### POST /v1/utils/qrcode

```json
{
    "content": "https://example.com",
    "size": 256,
    "error_correction": "medium",
    "fg_color": "#000000",
    "bg_color": "#ffffff"
}
```

### GET /v1/utils/qrcode

쿼리 파라미터로도 호출할 수 있습니다:

```
GET /v1/utils/qrcode?content=https://example.com&size=256&error_correction=medium&fg_color=%23003366&bg_color=%23fffff0
```

### 응답

- **Content-Type**: `image/png`
- **Body**: PNG 바이너리 데이터

> `<img src="/v1/utils/qrcode?content=hello">` 형태로 HTML에서 직접 사용 가능합니다.

---

<a id="qr-base64"></a>

## QR 코드 생성 (Base64)

QR 코드를 base64 인코딩 문자열과 data URI로 반환합니다.

### POST /v1/utils/qrcode/base64

```json
{
    "content": "otpauth://totp/MyService:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=MyService",
    "size": 300,
    "error_correction": "high",
    "fg_color": "#1a1a2e"
}
```

### GET /v1/utils/qrcode/base64

```
GET /v1/utils/qrcode/base64?content=hello&size=300
```

### 응답

```json
{
    "ok": true,
    "data": {
        "base64": "iVBORw0KGgo...",
        "data_uri": "data:image/png;base64,iVBORw0KGgo..."
    }
}
```

> `data_uri`는 `<img src="...">` 태그에 직접 삽입할 수 있는 형식입니다.

---

<a id="qr-text"></a>

## QR 코드 생성 (ASCII 아트)

QR 코드를 터미널에서 표시 가능한 ASCII 문자열로 반환합니다. 디버깅, 서버측 복붙 시나리오에 유용합니다.

### POST /v1/utils/qrcode/text

```json
{
    "content": "https://example.com",
    "error_correction": "medium"
}
```

### GET /v1/utils/qrcode/text

```
GET /v1/utils/qrcode/text?content=https://example.com
```

### 응답

- **Content-Type**: `text/plain; charset=utf-8`
- **Body**: 화이트스페이스/기호 문자로 구성된 QR 코드

> `size` 파라미터는 ASCII 출력에 적용되지 않습니다.

---

<a id="barcode-png"></a>

## 바코드 생성 (PNG)

선형(1D) 및 2D 바코드를 PNG 이미지 바이너리로 반환합니다.

### POST /v1/utils/barcode

```json
{
    "content": "12345678901",
    "type": "code128",
    "width": 300,
    "height": 100
}
```

### GET /v1/utils/barcode

```
GET /v1/utils/barcode?content=12345678901&type=code128&width=300&height=100
```

### 응답

- **Content-Type**: `image/png`
- **Body**: PNG 바이너리 데이터

### 지원 타입

| `type`       | 이름                     | 허용 내용                             | 비고                         |
| ------------ | ------------------------ | ------------------------------------- | ---------------------------- |
| `code128`    | Code 128                 | ASCII 128자 전체                      | **기본값**, 범용 1D 바코드   |
| `code39`     | Code 39                  | 대문자·숫자·일부 특수문자 (`-.$/+% `) | 산업/물류용                  |
| `ean13`      | EAN-13                   | 숫자 **12 또는 13**자리               | 국제 상품 코드 (체크섬 자동) |
| `ean8`       | EAN-8                    | 숫자 **7 또는 8**자리                 | 소형 상품용                  |
| `codabar`    | Codabar                  | 숫자·`-$:/.+`                         | 의료·도서관용                |
| `datamatrix` | Data Matrix              | ASCII 텍스트                          | 2D 바코드 (항상 정사각형)    |
| `itf`        | ITF (Interleaved 2 of 5) | 숫자 **짝수 자리** 필수               | 물류 외부 포장용             |

---

<a id="pdf2png"></a>

## PDF→PNG 변환

PDF 파일을 PNG 이미지로 변환합니다. 단일 페이지는 PNG 바이너리, 멀티 페이지는 ZIP 아카이브로 응답합니다.

### POST /v1/utils/pdf2png

multipart/form-data로 PDF 파일을 직접 업로드합니다.

```bash
curl -X POST http://localhost:47200/v1/utils/pdf2png \
  -F "file=@document.pdf" \
  -F "dpi=300" \
  -F "page=1" \
  --output page.png
```

### POST /v1/utils/pdf2png/:fileSeq

스토리지에 업로드된 파일을 fileSeq(file_meta의 seq)로 참조하여 변환합니다.

```bash
curl -X POST http://localhost:47200/v1/utils/pdf2png/12345 \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"dpi": 300, "page": 1}' \
  --output page.png
```

### GET /v1/utils/pdf2png/:fileSeq

쿼리 파라미터로 옵션을 전달합니다.

```
GET /v1/utils/pdf2png/12345?dpi=300&page=1
```

### 응답

**단일 페이지** (page 파라미터 지정 또는 1페이지 PDF):

- **Content-Type**: `image/png`
- **Content-Disposition**: `inline; filename="page-001.png"`
- **X-PDF-Total-Pages**: 원본 PDF 총 페이지 수
- **X-PDF-Page-Num**: 반환된 페이지 번호
- **Body**: PNG 바이너리 데이터

**멀티 페이지**:

- **Content-Type**: `application/zip`
- **Content-Disposition**: `attachment; filename="pdf2png-pages.zip"`
- **X-PDF-Total-Pages**: 원본 PDF 총 페이지 수
- **X-PDF-Page-Count**: ZIP에 포함된 페이지 수
- **Body**: ZIP 아카이브 (page-001.png, page-002.png, ...)

---

<a id="pdf2jpg"></a>

## PDF→JPG 변환

PDF 파일을 JPEG 이미지로 변환합니다. 동작 방식은 PDF→PNG와 동일하며, 추가로 `quality` 파라미터를 지원합니다.

### POST /v1/utils/pdf2jpg

```bash
curl -X POST http://localhost:47200/v1/utils/pdf2jpg \
  -F "file=@document.pdf" \
  -F "dpi=200" \
  -F "quality=85" \
  --output pages.zip
```

### POST /v1/utils/pdf2jpg/:fileSeq

```bash
curl -X POST http://localhost:47200/v1/utils/pdf2jpg/12345 \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"dpi": 200, "quality": 85, "page": 2}' \
  --output page2.jpg
```

### GET /v1/utils/pdf2jpg/:fileSeq

```
GET /v1/utils/pdf2jpg/12345?dpi=200&quality=85&first_page=1&last_page=3
```

### 응답

**단일 페이지**:

- **Content-Type**: `image/jpeg`
- **Content-Disposition**: `inline; filename="page-001.jpg"`

**멀티 페이지**:

- **Content-Type**: `application/zip`
- **Content-Disposition**: `attachment; filename="pdf2jpg-pages.zip"`

> 응답 헤더는 PDF→PNG와 동일합니다 (X-PDF-Total-Pages, X-PDF-Page-Count 등).

---

<a id="qr-common-params"></a>

## QR 코드 공통 파라미터

| 파라미터           | 타입   | 기본값      | 설명                                                                      |
| ------------------ | ------ | ----------- | ------------------------------------------------------------------------- |
| `content`          | string | **(필수)**  | QR에 인코딩할 텍스트 (최대 4,296바이트)                                   |
| `size`             | int    | `256`       | PNG 이미지 크기 (픽셀, 1~2048) — `/qrcode/text`에는 무시됨                |
| `error_correction` | string | `"medium"`  | 오류 복구 수준: `low` (7%), `medium` (15%), `high` (25%), `highest` (30%) |
| `fg_color`         | string | `"#000000"` | QR 전경색 hex 코드 (코드 모듈 색상) — PNG/Base64 전용                     |
| `bg_color`         | string | `"#ffffff"` | QR 배경색 hex 코드 — PNG/Base64 전용                                      |

> `fg_color` / `bg_color`는 `#RRGGBB` 또는 `RRGGBB` 형식을 모두 지원합니다. 3자리 단축 `#RGB`도 동작합니다.

### 오류 복구 수준 가이드

| 수준      | 복구율 | 권장 용도                                      |
| --------- | ------ | ---------------------------------------------- |
| `low`     | ~7%    | 화면 표시 전용, 파일 크기 최소화               |
| `medium`  | ~15%   | 일반 용도 (기본값)                             |
| `high`    | ~25%   | 인쇄물, 로고 삽입 시                           |
| `highest` | ~30%   | 열악한 환경 (작은 크기 인쇄, 손상 가능성 높음) |

---

<a id="barcode-common-params"></a>

## 바코드 공통 파라미터

| 파라미터  | 타입   | 기본값     | 설명                                                            |
| --------- | ------ | ---------- | --------------------------------------------------------------- |
| `content` | string | **(필수)** | 바코드에 인코딩할 데이터                                        |
| `type`    | string | `code128`  | 바코드 타입 (위 지원 타입 목록 참조)                            |
| `width`   | int    | `300`      | 출력 너비 (픽셀, 1~2048)                                        |
| `height`  | int    | `100`      | 출력 높이 (픽셀, 1~2048; `datamatrix`는 정사각형으로 자동 조정) |

---

<a id="pdf-common-params"></a>

## PDF 변환 공통 파라미터

JSON body, form 필드, 쿼리 파라미터를 모두 지원합니다. 우선순위: **쿼리 파라미터 > form 필드 > JSON body**.

| 파라미터     | 타입 | 기본값 | 설명                                                              |
| ------------ | ---- | ------ | ----------------------------------------------------------------- |
| `file`       | file | —      | PDF 파일 (multipart 업로드 시 필수, `:fileSeq` 라우트에선 불필요) |
| `dpi`        | int  | `300`  | 출력 해상도 (72~1200)                                             |
| `quality`    | int  | `90`   | JPEG 품질 (1~100, PDF→PNG에서는 무시)                             |
| `page`       | int  | —      | 단일 페이지 지정 (1-based, `first_page`/`last_page`보다 우선)     |
| `first_page` | int  | —      | 시작 페이지 (1-based)                                             |
| `last_page`  | int  | —      | 종료 페이지 (1-based)                                             |

> `page` 파라미터를 지정하면 `first_page`/`last_page`는 무시됩니다.
> `page`, `first_page`, `last_page` 모두 생략하면 전체 페이지를 변환합니다.

### `:fileSeq` 사용 시

- `fileSeq`는 `file_meta` 엔티티의 `seq` 값 (파일 업로드 시 반환되는 번호)
- 스토리지가 설정되지 않은 서버에서는 `503 Service Unavailable` 반환
- `file_meta`의 `mime_type`이 `application/pdf`가 아니면 `400 Bad Request`
- 삭제된 파일(`status=deleted`)은 `410 Gone` 반환

### 런타임 의존성

변환에 `poppler-utils` 패키지가 필요합니다:

```bash
# Alpine
apk add poppler-utils

# Ubuntu/Debian
apt install poppler-utils

# macOS
brew install poppler
```

---

<a id="error-response"></a>

## 에러 응답

### 주소 조회

| 상태 코드 | 조건                 | 응답 예시                                                     |
| --------- | -------------------- | ------------------------------------------------------------- |
| `400`     | `q` 파라미터 누락    | `{"ok": false, "message": "q parameter is required"}`         |
| `404`     | 엔티티 정의 없음     | `{"ok": false, "message": "addr_sido entity not found"}`      |
| `503`     | 엔티티 서비스 미설정 | `{"ok": false, "message": "entity service is not available"}` |

### QR 코드 / 바코드

| 상태 코드 | 조건                             | 응답 예시                                                                        |
| --------- | -------------------------------- | -------------------------------------------------------------------------------- |
| `400`     | `content` 누락                   | `{"ok": false, "message": "content is required"}`                                |
| `400`     | `content` 길이 초과 (QR, 4,296B) | `{"ok": false, "message": "content exceeds maximum length (4296 bytes)"}`        |
| `400`     | EAN13에 12·13자리 이외           | `{"ok": false, "message": "barcode: ean13 requires 12 or 13 digits, got N"}`     |
| `400`     | EAN8에 7·8자리 이외              | `{"ok": false, "message": "barcode: ean8 requires 7 or 8 digits, got N"}`        |
| `400`     | ITF에 홀수 자리 입력             | `{"ok": false, "message": "barcode: itf requires even number of digits, got N"}` |
| `400`     | 지원하지 않는 바코드 타입        | `{"ok": false, "message": "barcode: unsupported type \"xyz\" ..."}`              |
| `500`     | QR 코드 생성 실패                | `{"ok": false, "message": "Failed to generate QR code"}`                         |

### PDF 변환

| 상태 코드 | 조건                             | 응답 예시                                                                   |
| --------- | -------------------------------- | --------------------------------------------------------------------------- |
| `400`     | `file` 필드 누락 (multipart)     | `{"ok": false, "message": "file field is required (multipart/form-data)"}`  |
| `400`     | PDF가 아닌 파일                  | `{"ok": false, "message": "file is not a valid PDF"}`                       |
| `400`     | 스토리지 파일이 PDF가 아님       | `{"ok": false, "message": "file is not a PDF (mime_type=image/png)"}`       |
| `400`     | 잘못된 fileSeq                   | `{"ok": false, "message": "invalid fileSeq: must be a number"}`             |
| `404`     | fileSeq에 해당하는 파일 없음     | `{"ok": false, "message": "file not found: seq=99999"}`                     |
| `410`     | 삭제된 파일                      | `{"ok": false, "message": "file has been deleted"}`                         |
| `413`     | PDF 크기 초과 (100MB)            | `{"ok": false, "message": "PDF file too large (... bytes, max ... bytes)"}` |
| `500`     | 변환 실패 (pdftoppm 오류)        | `{"ok": false, "message": "PDF conversion failed: ..."}`                    |
| `503`     | 스토리지 미설정 (fileSeq 라우트) | `{"ok": false, "message": "storage is not configured"}`                     |

---

## 사용 예시

### cURL — QR PNG 저장

```bash
curl -X POST http://localhost:47200/v1/utils/qrcode \
  -H "Content-Type: application/json" \
  -d '{"content": "https://example.com", "size": 512}' \
  --output qrcode.png
```

### cURL — QR 색상 지정

```bash
curl -X POST http://localhost:47200/v1/utils/qrcode \
  -H "Content-Type: application/json" \
  -d '{"content": "https://example.com", "size": 512, "fg_color": "#003366", "bg_color": "#fffff0"}' \
  --output qrcode-color.png
```

### cURL — QR Base64 JSON

```bash
curl -X POST http://localhost:47200/v1/utils/qrcode/base64 \
  -H "Content-Type: application/json" \
  -d '{"content": "https://example.com"}'
```

### cURL — QR ASCII 아트 (터미널 표시)

```bash
curl "http://localhost:47200/v1/utils/qrcode/text?content=https://example.com"
```

### HTML 직접 삽입 (GET)

```html
<img
    src="http://localhost:47200/v1/utils/qrcode?content=https://example.com&size=200"
    alt="QR Code"
/>
```

### TOTP 2FA QR 코드

```bash
curl -X POST http://localhost:47200/v1/utils/qrcode/base64 \
  -H "Content-Type: application/json" \
  -d '{
    "content": "otpauth://totp/EntityServer:admin@example.com?secret=JBSWY3DPEHPK3PXP&issuer=EntityServer",
    "size": 300,
    "error_correction": "high"
  }'
```

### cURL — Code128 바코드 저장

```bash
curl "http://localhost:47200/v1/utils/barcode?content=HELLO-WORLD-123&type=code128&width=400&height=120" \
  --output barcode.png
```

### cURL — EAN-13 바코드 (POST)

```bash
curl -X POST http://localhost:47200/v1/utils/barcode \
  -H "Content-Type: application/json" \
  -d '{"content": "590123412345", "type": "ean13", "width": 300, "height": 150}' \
  --output ean13.png
```

### cURL — Data Matrix (2D)

```bash
curl -X POST http://localhost:47200/v1/utils/barcode \
  -H "Content-Type: application/json" \
  -d '{"content": "https://example.com", "type": "datamatrix", "width": 200, "height": 200}' \
  --output datamatrix.png
```

### cURL — ITF (짝수 자리 숫자 필수)

```bash
curl "http://localhost:47200/v1/utils/barcode?content=12345678&type=itf" \
  --output itf.png
```

### cURL — PDF→PNG 전체 페이지 (파일 업로드)

```bash
curl -X POST http://localhost:47200/v1/utils/pdf2png \
  -F "file=@document.pdf" \
  -F "dpi=300" \
  --output pages.zip
```

### cURL — PDF→PNG 단일 페이지

```bash
curl -X POST http://localhost:47200/v1/utils/pdf2png \
  -F "file=@document.pdf" \
  -F "page=1" \
  --output page1.png
```

### cURL — PDF→JPG 스토리지 파일 (fileSeq)

```bash
curl -X POST http://localhost:47200/v1/utils/pdf2jpg/12345 \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"dpi": 200, "quality": 85, "first_page": 1, "last_page": 5}' \
  --output pages.zip
```

### cURL — PDF→PNG 스토리지 파일 (GET, 단일 페이지)

```bash
curl "http://localhost:47200/v1/utils/pdf2png/12345?page=3&dpi=150" \
  -H "Authorization: Bearer <TOKEN>" \
  --output page3.png
```

### cURL — PDF→JPG 페이지 범위

```bash
curl -X POST http://localhost:47200/v1/utils/pdf2jpg \
  -F "file=@scan.pdf" \
  -F "first_page=2" \
  -F "last_page=4" \
  -F "quality=90" \
  --output pages-2-4.zip
```

---

## 관련 문서

- [API 라우트 개요](api-routes.md)
