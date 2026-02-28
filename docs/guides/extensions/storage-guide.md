# 파일 스토리지 가이드

> Entity Server v7.2 파일 스토리지 설정 및 사용법

---

## 목차

1. [빠른 시작](#1-빠른-시작)
2. [설정 파일 (storage.json)](#2-설정-파일-storagejson)
3. [스토리지 백엔드](#3-스토리지-백엔드)
4. [파일 API](#4-파일-api)
5. [file/file[] 엔티티 타입](#5-filefile-엔티티-타입)
6. [썸네일](#6-썸네일)
7. [쿼터 (용량 제한)](#7-쿼터-용량-제한)
8. [백업](#8-백업)
9. [GC (고아 파일 정리)](#9-gc-고아-파일-정리)
10. [보안](#10-보안)
11. [운영 참고사항](#11-운영-참고사항)

---

## 1) 빠른 시작

### 1-1. 최소 설정

`configs/` 디렉터리에 `storage.json` 파일을 생성합니다. 로컬 스토리지만 사용하는 최소 설정:

```json
{
    "enabled": true,
    "default": "local-main",
    "storages": {
        "local-main": {
            "driver": "local",
            "root": "./uploads"
        }
    }
}
```

### 1-2. 지원 드라이버

| 드라이버 | 설명                                              | 상세 설정                                         |
| -------- | ------------------------------------------------- | ------------------------------------------------- |
| `local`  | 로컬 파일시스템                                   | [3-1. Local](#3-1-local-로컬-파일시스템)          |
| `s3`     | AWS S3 및 S3 호환 서비스 (R2, B2, MinIO 등 13개+) | [3-2. S3](#3-2-s3-aws--minio--cloudflare-r2)      |
| `azure`  | Azure Blob Storage                                | [3-3. Azure](#3-3-azure-blob-storage)             |
| `gcs`    | Google Cloud Storage                              | [3-4. GCS](#3-4-google-cloud-storage-gcs)         |
| `sftp`   | SFTP (NAS/온프레미스 서버)                        | [3-5. SFTP](#3-5-sftp)                            |
| `swift`  | OpenStack Swift (KT Cloud Storage 등)             | [3-6. Swift](#3-6-swift-openstack-object-storage) |

### 1-3. 파일 업로드 테스트

```bash
curl -X POST http://localhost:3000/v1/files/upload/MyEntity \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@photo.jpg" \
  -F "field_name=profile_photo"
```

응답:

```json
{
    "ok": true,
    "seq": 1,
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "data": {
        "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "original_name": "photo.jpg",
        "mime_type": "image/jpeg",
        "size": 1048576,
        "status": "active",
        "content_hash": "sha256:abc123..."
    }
}
```

### 1-4. 파일 다운로드

```bash
curl -O http://localhost:3000/v1/files/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890 \
  -H "Authorization: Bearer <TOKEN>"
```

---

## 2) 설정 파일 (storage.json)

### 2-1. 파일 위치

서버의 `configs/` 디렉터리에 `storage.json`으로 저장합니다.

> **참고:** `configs/examples/storage.json.example`에 전체 옵션이 포함된 참조 템플릿이 있습니다.

### 2-2. 전체 구조

```json
{
    "enabled": true,
    "default": "local-main",

    "storages": {
    "local": { ... },
    "s3-main": { ... },
    "s3-backup": { ... }
  },

    "thumbnail": {
    "enabled": true,
    "sizes": {
      "sm": 150,
      "md": 480,
      "lg": 1024
    },
    "quality": 85
  },

  "quota": {
    "default_limit_gb": 0,
    "notify": ["log"]
  },

  "gc": {
    "enabled": true,
    "orphan_threshold_hours": 24,
    "cron": "1h"
  },

  "max_file_size_mb": 0
}
```

### 2-3. 환경변수 치환

설정 값에 `${ENV_VAR}` 형식을 사용하면 실행 시 환경변수로 대체됩니다:

```json
{
    "storages": {
        "s3-main": {
            "access_key": "${AWS_ACCESS_KEY_ID}",
            "secret_key": "${AWS_SECRET_ACCESS_KEY}"
        }
    }
}
```

### 2-4. 설정 미존재 시

`storage.json`이 없으면 파일 스토리지 기능은 **비활성화**됩니다. 서버는 정상 구동되며, 파일 관련 API 호출 시 에러를 반환합니다.

`storage.json`이 있어도 최상위 `enabled: false`면 동일하게 파일 스토리지가 비활성화됩니다.

---

## 3) 스토리지 백엔드

### 3-1. Local (로컬 파일시스템)

```json
{
    "local": {
        "driver": "local",
        "root": "/data/files"
    }
}
```

| 옵션     | 필수 | 설명                |
| -------- | ---- | ------------------- |
| `driver` | ✅   | `"local"`           |
| `root`   | ✅   | 파일 저장 루트 경로 |

- 디렉터리 자동 생성 (0755)
- Atomic write: temp 파일에 쓴 후 rename (중단 시 불완전 파일 방지)

### 3-2. S3 (AWS / MinIO / Cloudflare R2)

```json
{
    "s3-main": {
        "driver": "s3",
        "bucket": "my-bucket",
        "region": "ap-northeast-2",
        "access_key": "${AWS_ACCESS_KEY_ID}",
        "secret_key": "${AWS_SECRET_ACCESS_KEY}",
        "endpoint": "",
        "prefix": "files"
    }
}
```

| 옵션         | 필수 | 설명                                     |
| ------------ | ---- | ---------------------------------------- |
| `driver`     | ✅   | `"s3"`                                   |
| `bucket`     | ✅   | S3 버킷 이름                             |
| `region`     | ✅   | AWS 리전                                 |
| `access_key` | -    | 명시적 자격증명 (없으면 기본 체인 사용)  |
| `secret_key` | -    | 명시적 자격증명                          |
| `endpoint`   | -    | S3 호환 서비스 엔드포인트 (MinIO, R2 등) |
| `prefix`     | -    | 키 접두어                                |

**MinIO 예시:**

```json
{
    "minio": {
        "driver": "s3",
        "bucket": "files",
        "region": "us-east-1",
        "endpoint": "http://localhost:9000",
        "access_key": "minioadmin",
        "secret_key": "minioadmin"
    }
}
```

### 3-3. Azure Blob Storage

```json
{
    "azure-main": {
        "driver": "azure",
        "container": "my-container",
        "connection_string": "${AZURE_STORAGE_CONNECTION_STRING}",
        "prefix": "files"
    }
}
```

| 옵션                | 필수 | 설명                                                   |
| ------------------- | ---- | ------------------------------------------------------ |
| `driver`            | ✅   | `"azure"`                                              |
| `container`         | ✅   | Blob 컨테이너 이름                                     |
| `connection_string` | -    | 연결 문자열 (이것 또는 `account_name` + `account_key`) |
| `account_name`      | -    | 스토리지 계정 이름 (Shared Key 인증)                   |
| `account_key`       | -    | 스토리지 계정 키                                       |
| `endpoint`          | -    | 커스텀 엔드포인트 (Azurite 등)                         |
| `prefix`            | -    | Blob 키 접두어                                         |

> 인증 우선순위: `connection_string` > `account_name` + `account_key`. 둘 다 없으면 설정 오류.

**Shared Key 예시:**

```json
{
    "azure-main": {
        "driver": "azure",
        "container": "files",
        "account_name": "${AZURE_STORAGE_ACCOUNT}",
        "account_key": "${AZURE_STORAGE_KEY}"
    }
}
```

**Azurite (로컬 개발) 예시:**

```json
{
    "azure-local": {
        "driver": "azure",
        "container": "devfiles",
        "connection_string": "UseDevelopmentStorage=true",
        "endpoint": "http://127.0.0.1:10000"
    }
}
```

### 3-4. Google Cloud Storage (GCS)

GCS 네이티브 JSON API를 사용합니다. SA 키 파일, 인라인 JSON, 또는 ADC(Application Default Credentials) 인증을 지원합니다.

```json
{
    "gcs-main": {
        "driver": "gcs",
        "bucket": "my-entity-files",
        "credentials_file": "./configs/keys/gcp-sa.json",
        "prefix": "entity-files"
    }
}
```

| 옵션               | 필수 | 설명                                |
| ------------------ | ---- | ----------------------------------- |
| `driver`           | ✅   | `"gcs"`                             |
| `bucket`           | ✅   | GCS 버킷 이름                       |
| `credentials_file` | -    | Service Account JSON 키 파일 경로   |
| `credentials_json` | -    | SA JSON 인라인 (환경변수 치환 가능) |
| `prefix`           | -    | 오브젝트 키 접두어                  |

> 인증 우선순위: `credentials_file` > `credentials_json` > ADC 자동 탐색.
> GKE/Cloud Run에서는 Workload Identity로 자동 인증되므로 credentials 설정이 불필요합니다.

**GKE/Cloud Run 예시 (ADC):**

```json
{
    "gcs-main": {
        "driver": "gcs",
        "bucket": "my-entity-files",
        "prefix": "entity-files"
    }
}
```

**인라인 JSON 예시:**

```json
{
    "gcs-main": {
        "driver": "gcs",
        "bucket": "my-entity-files",
        "credentials_json": "${GCP_SA_JSON}"
    }
}
```

### 3-5. SFTP

SSH를 통한 원격 파일시스템 접근으로, NAS나 온프레미스 서버와 연동할 때 사용합니다.

```json
{
    "sftp-nas": {
        "driver": "sftp",
        "host": "nas.company.com",
        "port": 22,
        "user": "backup",
        "private_key_file": "./configs/keys/backup_rsa",
        "root": "/volume1/entity-files"
    }
}
```

| 옵션               | 필수 | 설명                                         |
| ------------------ | ---- | -------------------------------------------- |
| `driver`           | ✅   | `"sftp"`                                     |
| `host`             | ✅   | SSH 호스트                                   |
| `port`             | -    | SSH 포트 (기본값: 22)                        |
| `user`             | ✅   | SSH 사용자                                   |
| `password`         | -    | 비밀번호 인증 (이것 또는 `private_key_file`) |
| `private_key_file` | -    | SSH 키 파일 경로                             |
| `root`             | ✅   | 원격 파일 저장 루트 경로                     |

> 인증: `private_key_file` 또는 `password` 중 하나 이상 필요. 둘 다 설정하면 키 파일 우선.
> 연결이 끊어지면 자동으로 재연결합니다.

**비밀번호 인증 예시:**

```json
{
    "sftp-nas": {
        "driver": "sftp",
        "host": "nas.company.com",
        "user": "backup",
        "password": "${SFTP_PASSWORD}",
        "root": "/volume1/entity-files"
    }
}
```

### 3-6. Swift (OpenStack Object Storage)

OpenStack Swift API를 사용하는 스토리지 서비스와 연동합니다. KT Cloud Storage 등 OpenStack 기반 서비스를 지원합니다.

```json
{
    "swift-kt": {
        "driver": "swift",
        "auth_url": "https://ssproxy.ucloudbiz.olleh.com/identity/v3",
        "container": "my-files",
        "user": "${KT_USER}",
        "password": "${KT_PASSWORD}",
        "tenant_name": "${KT_TENANT}",
        "domain_name": "Default",
        "region": "kr1"
    }
}
```

| 옵션          | 필수 | 설명                                            |
| ------------- | ---- | ----------------------------------------------- |
| `driver`      | ✅   | `"swift"`                                       |
| `auth_url`    | ✅   | Keystone 인증 엔드포인트 (v2/v3)                |
| `container`   | ✅   | Swift 컨테이너 이름                             |
| `user`        | ✅   | 인증 사용자명                                   |
| `password`    | ✅   | 인증 비밀번호                                   |
| `tenant_name` | -    | 프로젝트/테넌트 이름                            |
| `tenant_id`   | -    | 프로젝트/테넌트 ID (테넌트 이름 대신 사용 가능) |
| `domain_name` | -    | Keystone v3 도메인 (기본: `"Default"`)          |
| `region`      | -    | 서비스 리전                                     |
| `prefix`      | -    | 오브젝트 키 접두어                              |

> Keystone v3에서 `domain_name`이 비어있으면 자동으로 `"Default"`가 사용됩니다 (`tenant_name` 또는 `tenant_id`가 설정된 경우).

**OpenStack DevStack 예시:**

```json
{
    "swift-dev": {
        "driver": "swift",
        "auth_url": "http://devstack.local:5000/v3",
        "container": "files",
        "user": "admin",
        "password": "secret",
        "tenant_name": "admin",
        "domain_name": "Default"
    }
}
```

### 3-7. S3 호환 서비스

S3 드라이버의 `endpoint` 필드를 설정하면 다양한 S3 호환 서비스를 **코드 변경 없이** 사용할 수 있습니다:

| 서비스                  | endpoint                                                     | region              | 비고             |
| ----------------------- | ------------------------------------------------------------ | ------------------- | ---------------- |
| **AWS S3**              | _(생략 — 자동)_                                              | `ap-northeast-2` 등 | 기본             |
| **Cloudflare R2**       | `https://{account_id}.r2.cloudflarestorage.com`              | `auto`              | 이그레스 무료    |
| **Backblaze B2**        | `https://s3.{region}.backblazeb2.com`                        | `us-west-004` 등    | S3 대비 1/4 가격 |
| **Wasabi**              | `https://s3.{region}.wasabisys.com`                          | `ap-northeast-2` 등 | Hot storage 전문 |
| **DigitalOcean Spaces** | `https://{region}.digitaloceanspaces.com`                    | `sgp1`, `nyc3` 등   | CDN 통합         |
| **Linode (Akamai)**     | `https://{region}.linodeobjects.com`                         | `ap-south-1` 등     | Akamai CDN       |
| **Vultr**               | `https://{region}.vultrobjects.com`                          | `ewr1` 등           |                  |
| **MinIO**               | `http://{host}:9000`                                         | `us-east-1`         | 자체 호스팅      |
| **Naver Cloud**         | `https://kr.object.ncloudstorage.com`                        | `kr-standard`       | 한국 시장        |
| **Oracle Cloud**        | `https://{ns}.compat.objectstorage.{region}.oraclecloud.com` | `ap-seoul-1` 등     |                  |
| **IDrive e2**           | `https://{region}.idrivee2.com`                              | `e2-1` 등           | 저가             |
| **Ceph RadosGW**        | `http://{host}:{port}`                                       | 설정에 따라         | 자체 호스팅      |
| **SeaweedFS**           | `http://{host}:8333`                                         | `us-east-1`         | 자체 호스팅      |

**Cloudflare R2 예시:**

```json
{
    "r2-storage": {
        "driver": "s3",
        "bucket": "my-files",
        "region": "auto",
        "endpoint": "https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com",
        "access_key": "${R2_ACCESS_KEY}",
        "secret_key": "${R2_SECRET_KEY}"
    }
}
```

**Backblaze B2 예시:**

```json
{
    "b2-storage": {
        "driver": "s3",
        "bucket": "my-files",
        "region": "us-west-004",
        "endpoint": "https://s3.us-west-004.backblazeb2.com",
        "access_key": "${B2_KEY_ID}",
        "secret_key": "${B2_APP_KEY}"
    }
}
```

**Naver Cloud Object Storage 예시:**

```json
{
    "ncloud-storage": {
        "driver": "s3",
        "bucket": "my-files",
        "region": "kr-standard",
        "endpoint": "https://kr.object.ncloudstorage.com",
        "access_key": "${NCLOUD_ACCESS_KEY}",
        "secret_key": "${NCLOUD_SECRET_KEY}"
    }
}
```

---

## 4) 파일 API

스토리지 관점에서 파일 API는 다음 두 가지만 기억하면 됩니다.

- 모든 파일 API는 인증이 필요합니다 (`Authorization: Bearer <TOKEN>`).
- RBAC 권한은 `files:*` 또는 세부 권한(`files:upload`, `files:download`, `files:delete`, `files:list`, `files:meta`)이 필요합니다.

엔드포인트 목록, 요청/응답 예시, 파라미터, 처리 순서는 아래 문서를 단일 기준으로 확인하세요.

- [files-routes.md](../../api-routes/files-routes.md)

---

## 5) file/file[] 엔티티 타입

### 5-1. 엔티티에서 파일 필드 선언

엔티티 JSON에서 인덱스나 필드 타입으로 `"file"` 또는 `"file[]"`을 사용합니다:

```json
{
    "name": "Employee",
    "indexes": {
        "profile_photo": {
            "type": "file",
            "label": "프로필 사진"
        }
    },
    "fields": {
        "attachments": {
            "type": "file[]",
            "label": "첨부파일"
        }
    }
}
```

### 5-2. DB 저장 방식

| 타입     | SQL 컬럼          | 저장 값               | 예시           |
| -------- | ----------------- | --------------------- | -------------- |
| `file`   | `BIGINT UNSIGNED` | file_meta seq 단일 값 | `42`           |
| `file[]` | `TEXT`            | JSON 배열             | `[42, 43, 44]` |

### 5-3. 자동 확장

GET/Find/List 응답에서 `FileExpander`가 file_meta seq를 메타 정보 객체로 자동 변환합니다:

**DB 저장 값:**

```json
{ "profile_photo": 42, "attachments": "[42, 43]" }
```

**API 응답 (자동 확장 후):**

```json
{
    "profile_photo": {
        "seq": 42,
        "uuid": "a1b2c3d4-...",
        "original_name": "photo.jpg",
        "mime_type": "image/jpeg",
        "size": 1048576,
        "status": "active"
    },
    "attachments": [
        {
            "seq": 42,
            "uuid": "a1b2c3d4-...",
            "original_name": "photo.jpg",
            "mime_type": "image/jpeg",
            "size": 1048576,
            "status": "active"
        },
        {
            "seq": 43,
            "uuid": "e5f6a7b8-...",
            "original_name": "doc.pdf",
            "mime_type": "application/pdf",
            "size": 2097152,
            "status": "active"
        }
    ]
}
```

### 5-4. 확장 비활성화

성능이 중요한 경우 쿼리 파라미터로 비활성화할 수 있습니다:

```
GET /v1/entity/Employee?expand_files=false
```

이 경우 file_meta seq 값이 그대로 반환됩니다.

---

## 6) 썸네일

### 6-1. 설정

```json
{
    "thumbnail": {
        "enabled": true,
        "sizes": {
            "sm": 150,
            "md": 480,
            "lg": 1024
        },
        "quality": 85
    }
}
```

| 옵션      | 기본값                  | 설명                                  |
| --------- | ----------------------- | ------------------------------------- |
| `enabled` | `true`                  | 썸네일 생성 여부                      |
| `sizes`   | sm:150, md:480, lg:1024 | 이름 → 최대 픽셀 (가로/세로 중 긴 쪽) |
| `quality` | 85                      | JPEG 품질 (1-100)                     |

### 6-2. 지원 이미지 포맷

| MIME         | 리사이즈 | 비고                               |
| ------------ | -------- | ---------------------------------- |
| `image/jpeg` | ✅       | EXIF auto-orient 포함              |
| `image/png`  | ✅       |                                    |
| `image/gif`  | ❌       | 이미지로 인식하지만 리사이즈 안 함 |
| `image/webp` | ❌       | 이미지로 인식하지만 리사이즈 안 함 |
| `image/bmp`  | ✅       |                                    |
| `image/tiff` | ✅       |                                    |

### 6-3. 저장 위치

썸네일은 원본과 동일한 디렉터리에 `{uuid}_{size}.jpg` 형식으로 저장됩니다:

```
/data/files/1/2026/02/27/Employee/a1b2c3d4.jpg       ← 원본
/data/files/1/2026/02/27/Employee/a1b2c3d4_sm.jpg     ← 150px
/data/files/1/2026/02/27/Employee/a1b2c3d4_md.jpg     ← 480px
/data/files/1/2026/02/27/Employee/a1b2c3d4_lg.jpg     ← 1024px
```

### 6-4. 썸네일 다운로드

```
POST /v1/files/download/:uuid?thumb=sm
```

해당 크기의 썸네일이 없으면 원본을 반환합니다.

---

## 7) 쿼터 (용량 제한)

### 7-1. 설정

```json
{
    "quota": {
        "default_limit_gb": 10,
        "notify": ["log", "webhook"]
    }
}
```

| 옵션               | 기본값    | 설명                                  |
| ------------------ | --------- | ------------------------------------- |
| `default_limit_gb` | `0`       | 라이선스당 기본 제한 (GB). 0 = 무제한 |
| `notify`           | `["log"]` | 초과 시 알림 채널                     |

### 7-2. 동작

- 업로드 시 현재 라이선스의 전체 파일 용량(`file_meta.size` 합계)을 계산
- 새 파일 추가 시 제한 초과 여부 확인
- 초과 시 **HTTP 413** 응답:

```json
{
    "ok": false,
    "error": "storage quota exceeded",
    "message": "현재 사용량 8.5 GB / 제한 10.0 GB — 추가 요청 2.0 GB 초과"
}
```

### 7-3. 알림 채널

| 채널      | 설명                                       |
| --------- | ------------------------------------------ |
| `log`     | 서버 로그에 경고 출력                      |
| `webhook` | 설정된 webhook URL로 알림 전송 (향후 구현) |

### 7-4. 개별 파일 용량 제한 (max_file_size_mb)

쿼터와 별도로 개별 파일의 최대 크기를 제한할 수 있습니다:

```json
{
    "max_file_size_mb": 50
}
```

| 옵션               | 기본값 | 설명                                 |
| ------------------ | ------ | ------------------------------------ |
| `max_file_size_mb` | `20`   | 개별 파일 최대 크기 (MB). 0 = 무제한 |

초과 시 **HTTP 413** 응답:

```json
{
    "ok": false,
    "error": "file too large: 75.0 MB exceeds limit 50 MB"
}
```

### 7-5. 중복 파일 감지 (dedup)

업로드 시 `?dedup=true` 쿼리 파라미터를 추가하면 동일한 `content_hash`를 가진 기존 파일이 있을 때 새로 저장하지 않고 기존 레코드를 반환합니다:

```bash
curl -X POST "http://localhost:3000/v1/files/upload/MyEntity?dedup=true" \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@photo.jpg"
```

중복 발견 시 응답에 `"dedup": true` 플래그가 포함됩니다:

```json
{
    "ok": true,
    "seq": 42,
    "uuid": "a1b2c3d4-...",
    "dedup": true,
    "data": { ... }
}
```

---

## 8) 백업

파일 백업 설정은 `backup.json`에서 관리합니다. `storage.json`에서는 백업 관련 설정을 하지 않습니다.

> 백업 운영 절차와 정책은 [backup-guide.md](backup-guide.md)를 참조하세요.

### 8-1. backup.json 파일 백업 설정

```json
{
    "enabled": true,
    "files": {
        "enabled": true,
        "mode": "realtime",
        "max_retries": 3,
        "retry_interval_sec": 60
    },
    "target": {
        "storage_key": "s3-backup",
        "prefix": "backups"
    }
}
```

| 옵션                       | 기본값       | 설명                                        |
| -------------------------- | ------------ | ------------------------------------------- |
| `files.enabled`            | `true`       | 파일 백업 활성화                            |
| `files.mode`               | `"realtime"` | 백업 모드 (`realtime`: 업로드 즉시 복제)    |
| `files.max_retries`        | `3`          | 최대 재시도 횟수                            |
| `files.retry_interval_sec` | `60`         | 재시도 간격 (초)                            |
| `target.storage_key`       | -            | 백업 대상 백엔드 이름 (`storage.json`의 키) |
| `target.prefix`            | `"backups"`  | 데이터 백업 파일 경로 접두어                |

> `backup.json`은 파일 백업 외에 데이터 백업, 스키마 백업도 통합 관리합니다. 자세한 설정은 설계 문서를 참조하세요.

### 8-2. 파일 상태 흐름

```
업로드 시:
  backup_status = "none" (백업 미설정) 또는 "pending" (백업 설정됨)

FileBackupWorker:
  pending → synced (성공)
  pending → pending + retries++ (실패, 재시도 가능)
  pending → skipped (max_retries 초과)
```

### 8-3. 모니터링

`file_backup_log` 엔티티에 백업 작업 로그가 기록됩니다:

| 필드            | 설명                  |
| --------------- | --------------------- |
| `source_key`    | 원본 스토리지 키      |
| `target_key`    | 백업 스토리지 키      |
| `status`        | `completed`, `failed` |
| `file_count`    | 처리 파일 수          |
| `total_bytes`   | 총 바이트             |
| `error_count`   | 에러 수               |
| `error_message` | 에러 메시지 (실패 시) |

---

## 9) GC (고아 파일 정리)

### 9-1. 고아 파일이란?

업로드 후 엔티티에 연결되지 않은 파일입니다. 예:

- 파일을 업로드했지만 폼 제출을 취소한 경우
- `entity_seq`가 비어있는 상태로 `orphan_threshold_hours`가 경과한 경우

### 9-2. 설정

```json
{
    "gc": {
        "enabled": true,
        "orphan_threshold_hours": 24,
        "cron": "1h"
    }
}
```

| 옵션                     | 기본값 | 설명                |
| ------------------------ | ------ | ------------------- |
| `enabled`                | `true` | GC 활성화           |
| `orphan_threshold_hours` | `24`   | 고아 판정 기준 시간 |
| `cron`                   | `"1h"` | 실행 주기           |

### 9-3. 동작

1. `status=pending` + 생성 시간이 `orphan_threshold_hours` 초과한 레코드 조회
2. `status` → `orphan` 마킹
3. 스토리지에서 원본 파일 삭제
4. 매칭되는 모든 썸네일 삭제
5. 백업 스토리지에서도 삭제 (`backup.json`에서 파일 백업 활성 시)
6. `file_meta` 레코드 물리 삭제 (hard_delete)

---

## 10) 보안

### 10-1. 메타데이터 암호화

`file_meta` 시스템 엔티티는 `data_encryption: true`가 기본값입니다.

암호화되는 필드:

- `original_name` — 원본 파일명
- `storage_key` — 스토리지 상대 경로
- `storage_path` — 전체 경로
- `entity_name` — 첨부 대상 엔티티 이름
- `entity_seq` — 첨부 대상 레코드 seq
- `field_name` — 첨부 필드 이름
- `mime_type` — MIME 타입
- `content_hash` — SHA-256 해시
- `backup_retries` — 백업 재시도 횟수

암호화 방식: XChaCha20-Poly1305. 암호화 키는 `license_scope` 설정에 따라 결정됩니다:

- `license_scope: false` → `ENCRYPTION_KEY` 환경변수 (마스터 키)
- `license_scope: true` (기본값) + `license_seq` 존재 → 해당 라이선스의 `secret_key` (per-license 키)

> 상세 키 결정 규칙은 [system-entities.md — 암호화 키 결정 규칙](../data/system-entities.md#8-암호화-키-결정-규칙)을 참조하세요.

> 인덱스 필드(`uuid`, `size`, `status`, `backup_status`)는 검색을 위해 평문으로 저장됩니다.

### 10-2. 인증 및 권한

- 모든 파일 API는 JWT 인증 필수 (`/v1/files/` 경로 보호)
- RBAC 권한으로 세분화된 접근 제어:

| 권한             | 설명           |
| ---------------- | -------------- |
| `files:upload`   | 파일 업로드    |
| `files:download` | 파일 다운로드  |
| `files:delete`   | 파일 삭제      |
| `files:list`     | 파일 목록 조회 |
| `files:meta`     | 메타 조회      |
| `files:*`        | 모든 파일 권한 |

### 10-3. 스토리지 키 보안

파일은 UUID 기반 경로에 저장되므로 원본 파일명이 스토리지에 노출되지 않습니다:

```
원본: 중요문서_2026.pdf
저장: /data/files/1/2026/02/27/Contract/a1b2c3d4-e5f6-7890-abcd-ef1234567890.pdf
```

---

## 11) 운영 참고사항

### 11-1. 경로 구조

```
{root}/
├── {license_seq}/
│   └── {YYYY}/
│       └── {MM}/
│           └── {DD}/
│               └── {entity_name}/
│                   ├── {uuid}.{ext}           ← 원본
│                   ├── {uuid}_sm.jpg          ← 썸네일 150px
│                   ├── {uuid}_md.jpg          ← 썸네일 480px
│                   └── {uuid}_lg.jpg          ← 썸네일 1024px
└── global/                                    ← license_scope: false 엔티티
    └── ... (동일 구조)
```

### 11-2. 디스크 용량 모니터링

쿼터와 별개로 디스크 용량을 주기적으로 확인하세요:

```bash
# 전체 사용량
du -sh /data/files/

# 라이선스별 사용량
du -sh /data/files/*/
```

### 11-3. 백엔드 전환

1. 새 백엔드를 `storage.json`의 `storages`에 추가
2. 기존 파일을 새 백엔드로 마이그레이션 (수동 또는 `rsync` / `aws s3 sync`)
3. `default`를 변경
4. 서버 재시작

> ⚠️ 기존 `file_meta` 레코드의 `storage_path`는 자동 갱신되지 않습니다. 백엔드 전환 시 경로 호환성을 확인하세요.

### 11-4. 문제 해결

| 증상            | 원인                    | 해결                                                         |
| --------------- | ----------------------- | ------------------------------------------------------------ |
| 업로드 시 413   | 쿼터 또는 파일크기 초과 | `quota.default_limit_gb`와 `max_file_size_mb` 확인           |
| 다운로드 시 404 | 파일 미존재             | `file_meta` 상태 확인, 스토리지 경로 확인                    |
| 썸네일 없음     | 지원하지 않는 포맷      | GIF/WebP는 리사이즈 미지원                                   |
| 백업 skipped    | 재시도 초과             | `file_backup_log` 에러 확인, `backup_retries` 리셋 후 재시도 |
| GC 미작동       | 설정 미활성             | `gc.enabled: true` 확인                                      |

---

## 부록: 전체 설정 예시

로컬 + S3 백업 + Azure + GCS + SFTP 구성의 프로덕션 설정 예시:

```json
{
    "enabled": true,
    "default": "local",
    "max_file_size_mb": 100,

    "storages": {
        "local": {
            "driver": "local",
            "root": "/data/files"
        },
        "s3-backup": {
            "driver": "s3",
            "bucket": "mycompany-backup",
            "region": "ap-northeast-2",
            "access_key": "${AWS_ACCESS_KEY_ID}",
            "secret_key": "${AWS_SECRET_ACCESS_KEY}",
            "prefix": "entity-files"
        },
        "s3-r2": {
            "driver": "s3",
            "bucket": "cdn-files",
            "region": "auto",
            "endpoint": "https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com",
            "access_key": "${R2_ACCESS_KEY}",
            "secret_key": "${R2_SECRET_KEY}"
        },
        "azure-archive": {
            "driver": "azure",
            "container": "archive",
            "connection_string": "${AZURE_STORAGE_CONNECTION_STRING}"
        },
        "gcs-main": {
            "driver": "gcs",
            "bucket": "mycompany-files",
            "credentials_file": "./configs/keys/gcp-sa.json",
            "prefix": "entity-files"
        },
        "sftp-nas": {
            "driver": "sftp",
            "host": "nas.internal.company.com",
            "port": 22,
            "user": "backup",
            "private_key_file": "./configs/keys/backup_rsa",
            "root": "/volume1/entity-backups"
        },
        "swift-kt": {
            "driver": "swift",
            "auth_url": "https://ssproxy.ucloudbiz.olleh.com/identity/v3",
            "container": "entity-files",
            "user": "${KT_USER}",
            "password": "${KT_PASSWORD}",
            "tenant_name": "${KT_TENANT}",
            "region": "kr1"
        }
    },

    "thumbnail": {
        "enabled": true,
        "sizes": {
            "sm": 150,
            "md": 480,
            "lg": 1024
        },
        "quality": 85
    },

    "quota": {
        "default_limit_gb": 50,
        "notify": ["log"]
    },

    "gc": {
        "enabled": true,
        "orphan_threshold_hours": 24,
        "cron": "1h"
    }
}
```
