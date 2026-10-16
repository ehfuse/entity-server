"""
Entity Server 클라이언트 (Python)

의존성:
    pip install requests cryptography

환경변수:
    ENTITY_SERVER_URL          http://localhost:47200
    ENTITY_SERVER_API_KEY      your-api-key
    ENTITY_SERVER_HMAC_SECRET  your-hmac-secret

사용 예:
    es = EntityServerClient()
    result = es.get("account", 1)
    items  = es.list("account", page=1, limit=20)
    seq    = es.submit("account", {"name": "홍길동", "email": "hong@example.com"})

트랜잭션 사용 예:
    es.trans_start()
    try:
        order_ref = es.submit("order", {...})          # seq: "$tx.0"
        es.submit("order_item", {"order_seq": order_ref["seq"], ...})  # "$tx.0" 자동 치환
        result    = es.trans_commit()
        order_seq = result["results"][0]["seq"]   # 실제 seq
    except Exception:
        es.trans_rollback()
        raise
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import uuid
from typing import Any

import requests
from cryptography.hazmat.primitives.ciphers.aead import XChaCha20Poly1305
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

import secrets as _secrets


class EntityServerClient:
    def __init__(
        self,
        base_url:        str  = "",
        api_key:         str  = "",
        hmac_secret:     str  = "",
        token:           str  = "",
        timeout:         int  = 10,
        encrypt_requests: bool = False,
    ) -> None:
        self.base_url        = (base_url    or os.getenv("ENTITY_SERVER_URL",          "http://localhost:47200")).rstrip("/")
        self.api_key         = api_key     or os.getenv("ENTITY_SERVER_API_KEY",     "")
        self.hmac_secret     = hmac_secret or os.getenv("ENTITY_SERVER_HMAC_SECRET", "")
        self.token           = token       or os.getenv("ENTITY_SERVER_TOKEN",       "")
        self.timeout         = timeout
        self.encrypt_requests = encrypt_requests
        self._packet_encryption: bool = False
        self._session        = requests.Session()
        self._active_tx_id: str | None = None

    def set_token(self, token: str) -> None:
        """JWT Bearer 토큰을 설정합니다. HMAC 모드와 배타적으로 사용해야 합니다."""
        self.token = token

    # ─── 트랜잭션 ──────────────────────────────────────────────────────────────

    def trans_start(self) -> str:
        """
        트랜잭션 시작 — 서버에 트랜잭션 큐를 등록하고 transaction_id 를 반환합니다.
        이후 submit / delete 가 서버 큐에 쌓이고 trans_commit() 시 일괄 처리됩니다.
        """
        result = self._request("POST", "/v1/transaction/start")
        self._active_tx_id = result["transaction_id"]
        return self._active_tx_id

    def trans_rollback(self, transaction_id: str | None = None) -> dict:
        """트랜잭션 단위로 변경사항을 롤백합니다.
        transaction_id 생략 시 trans_start() 로 시작한 활성 트랜잭션을 사용합니다."""
        tx_id = transaction_id or self._active_tx_id
        if not tx_id:
            raise RuntimeError("No active transaction. Call trans_start() first.")
        self._active_tx_id = None
        return self._request("POST", f"/v1/transaction/rollback/{tx_id}")

    def trans_commit(self, transaction_id: str | None = None) -> dict:
        """트랜잭션 커밋 — 서버 큐에 쌓인 작업을 단일 DB 트랜잭션으로 일괄 처리합니다.
        transaction_id 생략 시 trans_start() 로 시작한 활성 트랜잭션을 사용합니다."""
        tx_id = transaction_id or self._active_tx_id
        if not tx_id:
            raise RuntimeError("No active transaction. Call trans_start() first.")
        self._active_tx_id = None
        return self._request("POST", f"/v1/transaction/commit/{tx_id}")

    # ─── CRUD ─────────────────────────────────────────────────────────────────
    def check_health(self) -> dict:
        """서버 헬스 체크를 수행하고 패킷 암호화 활성 여부를 자동으로 감지합니다.
        서버가 packet_encryption: true 를 응답하면 이후 모든 요청에 암호화가 자동 적용됩니다."""
        resp = self._session.get(self.base_url + "/v1/health", timeout=self.timeout)
        data = resp.json()
        if data.get("packet_encryption"):
            self._packet_encryption = True
        return data
    def get(self, entity: str, seq: int, *, skip_hooks: bool = False) -> dict:
        """단건 조회. skip_hooks=True 이면 after_get 훅 미실행."""
        q = "?skipHooks=true" if skip_hooks else ""
        return self._request("GET", f"/v1/entity/{entity}/{seq}{q}")

    def find(self, entity: str, conditions: dict, *, skip_hooks: bool = False) -> dict:
        """
        조건으로 단건 조회 (POST + conditions body).

        - conditions: index/hash/unique 필드에만 필터 조건 사용 가능
        - skip_hooks=True 이면 after_find 훅 미실행
        """
        q = "?skipHooks=true" if skip_hooks else ""
        return self._request("POST", f"/v1/entity/{entity}/find{q}", body=conditions)

    def list(
        self,
        entity: str,
        page: int = 1,
        limit: int = 20,
        order_by: str | None = None,
        order_dir: str | None = None,
        fields: list[str] | None = None,
        conditions: dict | None = None,
    ) -> dict:
        """
        목록 조회 (POST + conditions body)

        - fields: 미지정 시 인덱스 필드만 반환 (기본, 가장 빠름). ['*'] 지정 시 전체 필드 반환
        - conditions: index/hash/unique 필드에만 필터 조건 사용 가능
        """
        query_params: dict = {"page": page, "limit": limit}
        if order_by:
            query_params["order_by"] = f"-{order_by}" if order_dir == "DESC" else order_by
        if fields:
            query_params["fields"] = ",".join(fields)
        return self._request("POST", f"/v1/entity/{entity}/list", body=conditions or {}, params=query_params)

    def count(self, entity: str, conditions: dict | None = None) -> dict:
        """건수 조회. conditions 는 list() 와 동일한 필터 규칙."""
        return self._request("POST", f"/v1/entity/{entity}/count", body=conditions or {})

    def query(
        self,
        entity: str,
        sql: str,
        params: list | None = None,
        limit: int | None = None,
    ) -> dict:
        """
        커스텀 SQL 조회 (SELECT 전용, 인덱스 테이블만, JOIN 지원)

        - SELECT 쿼리만 허용. SELECT * 불가. 최대 1000건.
        - 사용자 입력은 반드시 params 로 바인딩 (SQL Injection 방지)

        예::
            es.query(
                'order',
                'SELECT o.seq, u.name FROM order o JOIN account u ON u.data_seq = o.account_seq WHERE o.status = ?',
                params=['pending'],
                limit=100,
            )
        """
        body: dict[str, Any] = {"sql": sql, "params": params or []}
        if limit is not None:
            body["limit"] = limit
        return self._request("POST", f"/v1/entity/{entity}/query", body=body)

    def submit(self, entity: str, data: dict, *, transaction_id: str | None = None, skip_hooks: bool = False) -> dict:
        """
        생성 또는 수정
        data에 'seq' 포함 시 수정, 없으면 생성
        :param transaction_id: trans_start() 가 반환한 ID (생략 시 활성 트랜잭션 자동 사용)
        :param skip_hooks: True 이면 before/after_insert, before/after_update 훅 미실행
        """
        tx_id = transaction_id or self._active_tx_id
        extra = {"X-Transaction-ID": tx_id} if tx_id else {}
        q = "?skipHooks=true" if skip_hooks else ""
        return self._request("POST", f"/v1/entity/{entity}/submit{q}", body=data, extra_headers=extra)

    def delete(self, entity: str, seq: int, *, transaction_id: str | None = None, hard: bool = False, skip_hooks: bool = False) -> dict:
        """
        삭제
        :param transaction_id: trans_start() 가 반환한 ID (생략 시 활성 트랜잭션 자동 사용)
        :param hard: True 시 하드(물리) 삭제. False(기본) 이면 소프트 삭제 (rollback 으로 복원 가능)
        :param skip_hooks: True 이면 before/after_delete 훅 미실행
        """
        query_parts: list[str] = []
        if hard:       query_parts.append("hard=true")
        if skip_hooks: query_parts.append("skipHooks=true")
        q = "?" + "&".join(query_parts) if query_parts else ""
        tx_id = transaction_id or self._active_tx_id
        extra = {"X-Transaction-ID": tx_id} if tx_id else {}
        return self._request("POST", f"/v1/entity/{entity}/delete/{seq}{q}", extra_headers=extra)

    def history(self, entity: str, seq: int, page: int = 1, limit: int = 50) -> dict:
        """변경 이력 조회"""
        return self._request("GET", f"/v1/entity/{entity}/history/{seq}", params={"page": page, "limit": limit})

    def rollback(self, entity: str, history_seq: int) -> dict:
        """history seq 단위 롤백 (단건)"""
        return self._request("POST", f"/v1/entity/{entity}/rollback/{history_seq}")

    def push(self, push_entity: str, payload: dict, *, transaction_id: str | None = None) -> dict:
        """푸시 발송 트리거 엔티티에 submit합니다."""
        return self.submit(push_entity, payload, transaction_id=transaction_id)

    def push_log_list(self, page: int = 1, limit: int = 20, order_by: str | None = None) -> dict:
        """push_log 목록 조회 헬퍼"""
        return self.list("push_log", page=page, limit=limit, order_by=order_by)

    def register_push_device(
        self,
        account_seq: int,
        device_id: str,
        push_token: str,
        *,
        platform: str | None = None,
        device_type: str | None = None,
        browser: str | None = None,
        browser_version: str | None = None,
        push_enabled: bool = True,
        transaction_id: str | None = None,
    ) -> dict:
        """account_device 디바이스 등록/갱신 헬퍼 (push_token 단일 필드)"""
        payload: dict[str, Any] = {
            "id": device_id,
            "account_seq": account_seq,
            "push_token": push_token,
            "push_enabled": push_enabled,
        }
        if platform:
            payload["platform"] = platform
        if device_type:
            payload["device_type"] = device_type
        if browser:
            payload["browser"] = browser
        if browser_version:
            payload["browser_version"] = browser_version
        return self.submit("account_device", payload, transaction_id=transaction_id)

    def update_push_device_token(
        self,
        device_seq: int,
        push_token: str,
        *,
        push_enabled: bool = True,
        transaction_id: str | None = None,
    ) -> dict:
        """account_device.seq 기준 push_token 갱신 헬퍼"""
        return self.submit(
            "account_device",
            {
                "seq": device_seq,
                "push_token": push_token,
                "push_enabled": push_enabled,
            },
            transaction_id=transaction_id,
        )

    def disable_push_device(
        self,
        device_seq: int,
        *,
        transaction_id: str | None = None,
    ) -> dict:
        """account_device.seq 기준 푸시 수신 비활성화 헬퍼"""
        return self.submit(
            "account_device",
            {
                "seq": device_seq,
                "push_enabled": False,
            },
            transaction_id=transaction_id,
        )

    def read_request_body(
        self,
        raw_body: bytes | str | None,
        content_type: str = "application/json",
        *,
        require_encrypted: bool = False,
    ) -> dict:
        """요청 본문을 읽어 JSON으로 반환합니다.
        - application/octet-stream: 암호 패킷 복호화
        - 그 외: 평문 JSON 파싱
        """
        lowered = (content_type or "").lower()
        is_encrypted = "application/octet-stream" in lowered

        if require_encrypted and not is_encrypted:
            raise RuntimeError(
                "Encrypted request required: Content-Type must be application/octet-stream"
            )

        if is_encrypted:
            if raw_body in (None, b"", ""):
                raise RuntimeError("Encrypted request body is empty")

            packet = raw_body if isinstance(raw_body, bytes) else raw_body.encode("utf-8")
            return json.loads(self._decrypt_packet(packet))

        if raw_body in (None, b"", ""):
            return {}

        if isinstance(raw_body, bytes):
            return json.loads(raw_body.decode("utf-8"))
        return json.loads(raw_body)

    # ─── 내부 ─────────────────────────────────────────────────────────────────

    def _request(
        self,
        method:        str,
        path:          str,
        body:          Any = None,
        params:        dict | None = None,
        extra_headers: dict | None = None,
    ) -> dict:
        # 쿼리스트링 포함 전체 경로 (서명 대상)
        if params:
            qs = "&".join(f"{k}={v}" for k, v in params.items())
            signed_path = f"{path}?{qs}"
        else:
            signed_path = path

        # 요청 바디 결정: encrypt_requests 시 POST 바디를 암호화
        body_data: bytes | None = None  # 네트워크로 보낼 바이트
        body_for_sign: bytes    = b""   # HMAC 서명 대상
        content_type_header     = "application/json"

        if body is not None:
            json_bytes = json.dumps(body, ensure_ascii=False).encode("utf-8")
            if self.encrypt_requests or self._packet_encryption:
                encrypted = self._encrypt_packet(json_bytes)
                body_data       = encrypted
                body_for_sign   = encrypted
                content_type_header = "application/octet-stream"
            else:
                body_data     = json_bytes
                body_for_sign = json_bytes

        is_hmac_mode = bool(self.api_key and self.hmac_secret)

        headers: dict = {"Content-Type": content_type_header}
        if is_hmac_mode:
            timestamp = str(int(time.time()))
            nonce     = str(uuid.uuid4())
            signature = self._sign(method, signed_path, timestamp, nonce, body_for_sign)
            headers["X-API-Key"]   = self.api_key
            headers["X-Timestamp"] = timestamp
            headers["X-Nonce"]     = nonce
            headers["X-Signature"] = signature
        elif self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if extra_headers:
            headers.update(extra_headers)

        url  = self.base_url + path
        resp = self._session.request(
            method=method,
            url=url,
            headers=headers,
            data=body_data,
            params=params,
            timeout=self.timeout,
        )

        # 패킷 암호화 응답: application/octet-stream → 복호화
        ct = resp.headers.get("Content-Type", "")
        if "application/octet-stream" in ct:
            data = json.loads(self._decrypt_packet(resp.content))
        else:
            data = resp.json()

        if not data.get("ok"):
            raise RuntimeError(f"EntityServer error: {data.get('message', 'Unknown')} (HTTP {resp.status_code})")

        return data

    def _derive_packet_key(self) -> bytes:
        """
        패킷 암호화 키를 유도합니다.
        - HMAC 모드: HKDF-SHA256(hmac_secret, "entity-server:packet-encryption")
        - JWT  모드: SHA256(token)
        """
        if self.token and not self.hmac_secret:
            return hashlib.sha256(self.token.encode("utf-8")).digest()
        h = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"entity-server:hkdf:v1",
            info=b"entity-server:packet-encryption",
        )
        return h.derive(self.hmac_secret.encode("utf-8"))

    def _encrypt_packet(self, plaintext: bytes) -> bytes:
        """
        XChaCha20-Poly1305 패킷 암호화
        포맷: [magic:magic_len][nonce:24][ciphertext+tag]
        magic_len: 2 + key[31] % 14  (패킷 키에서 자동 파생)
        """
        key   = self._derive_packet_key()
        magic_len = 2 + key[31] % 14
        magic = _secrets.token_bytes(magic_len)
        nonce = _secrets.token_bytes(24)
        ct    = XChaCha20Poly1305(key).encrypt(nonce, plaintext, b"")
        return magic + nonce + ct

    def _decrypt_packet(self, data: bytes) -> bytes:
        """
        XChaCha20-Poly1305 패킷 복호화
        포맷: [magic:magic_len][nonce:24][ciphertext+tag]
        키: HKDF-SHA256(hmac_secret, "entity-server:packet-encryption")
        """
        key        = self._derive_packet_key()
        magic_len  = 2 + key[31] % 14
        nonce      = data[magic_len : magic_len + 24]
        ciphertext = data[magic_len + 24 :]
        return XChaCha20Poly1305(key).decrypt(nonce, ciphertext, b"")

    def _sign(self, method: str, path: str, timestamp: str, nonce: str, body: bytes | str) -> str:
        """
        HMAC-SHA256 서명.
        body 는 bytes(암호화된 바디 포함) 또는 str 모두 지원합니다.
        """
        prefix = f"{method}|{path}|{timestamp}|{nonce}|".encode("utf-8")
        h = hmac.new(key=self.hmac_secret.encode("utf-8"), digestmod=hashlib.sha256)
        h.update(prefix)
        if isinstance(body, bytes):
            if body:
                h.update(body)
        elif body:
            h.update(body.encode("utf-8"))
        return h.hexdigest()
