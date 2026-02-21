"""
Entity Server 클라이언트 (Python)

의존성:
    pip install requests cryptography

환경변수:
    ENTITY_SERVER_URL          http://localhost:47200
    ENTITY_SERVER_API_KEY      your-api-key
    ENTITY_SERVER_HMAC_SECRET  your-hmac-secret
    ENTITY_PACKET_MAGIC_LEN    4   (서버 packet_magic_len 과 동일)

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


class EntityServerClient:
    def __init__(
        self,
        base_url:    str = "",
        api_key:     str = "",
        hmac_secret: str = "",
        timeout:     int = 10,
        magic_len:   int = 4,
    ) -> None:
        self.base_url    = (base_url    or os.getenv("ENTITY_SERVER_URL",          "http://localhost:47200")).rstrip("/")
        self.api_key     = api_key     or os.getenv("ENTITY_SERVER_API_KEY",     "")
        self.hmac_secret = hmac_secret or os.getenv("ENTITY_SERVER_HMAC_SECRET", "")
        self.timeout     = timeout
        self.magic_len   = int(os.getenv("ENTITY_PACKET_MAGIC_LEN", magic_len))
        self._session    = requests.Session()
        self._active_tx_id: str | None = None

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

    def get(self, entity: str, seq: int) -> dict:
        """단건 조회"""
        return self._request("GET", f"/v1/entity/{entity}/{seq}")

    def list(self, entity: str, page: int = 1, limit: int = 20, order_by: str | None = None) -> dict:
        """목록 조회"""
        params: dict = {"page": page, "limit": limit}
        if order_by:
            params["order_by"] = order_by
        return self._request("GET", f"/v1/entity/{entity}/list", params=params)

    def count(self, entity: str) -> dict:
        """건수 조회"""
        return self._request("GET", f"/v1/entity/{entity}/count")

    def query(
        self,
        entity:   str,
        filter:   list[dict] | None = None,
        page:     int = 1,
        limit:    int = 20,
        order_by: str | None = None,
    ) -> dict:
        """
        필터 검색
        filter 예: [{"field": "status", "op": "eq", "value": "active"}]
        """
        params: dict = {"page": page, "limit": limit}
        if order_by:
            params["order_by"] = order_by
        return self._request("POST", f"/v1/entity/{entity}/query", body=filter or [], params=params)

    def submit(self, entity: str, data: dict, *, transaction_id: str | None = None) -> dict:
        """
        생성 또는 수정
        data에 'seq' 포함 시 수정, 없으면 생성
        :param transaction_id: trans_start() 가 반환한 ID (생략 시 활성 트랜잭션 자동 사용)
        """
        tx_id = transaction_id or self._active_tx_id
        extra = {"X-Transaction-ID": tx_id} if tx_id else {}
        return self._request("POST", f"/v1/entity/{entity}/submit", body=data, extra_headers=extra)

    def delete(self, entity: str, seq: int, *, transaction_id: str | None = None, hard: bool = False) -> dict:
        """삭제
        :param transaction_id: trans_start() 가 반환한 ID (생략 시 활성 트랜잭션 자동 사용)
        :param hard: True 시 하드 삭제
        """
        params = {"hard": "true"} if hard else {}
        tx_id = transaction_id or self._active_tx_id
        extra = {"X-Transaction-ID": tx_id} if tx_id else {}
        return self._request("DELETE", f"/v1/entity/{entity}/delete/{seq}", params=params, extra_headers=extra)

    def history(self, entity: str, seq: int, page: int = 1, limit: int = 50) -> dict:
        """변경 이력 조회"""
        return self._request("GET", f"/v1/entity/{entity}/history/{seq}", params={"page": page, "limit": limit})

    def rollback(self, entity: str, history_seq: int) -> dict:
        """history seq 단위 롤백 (단건)"""
        return self._request("POST", f"/v1/entity/{entity}/rollback/{history_seq}")

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

        body_str  = json.dumps(body, ensure_ascii=False) if body is not None else ""
        timestamp = str(int(time.time()))
        nonce     = str(uuid.uuid4())
        signature = self._sign(method, signed_path, timestamp, nonce, body_str)

        headers: dict = {
            "Content-Type": "application/json",
            "X-API-Key":    self.api_key,
            "X-Timestamp":  timestamp,
            "X-Nonce":      nonce,
            "X-Signature":  signature,
        }
        if extra_headers:
            headers.update(extra_headers)

        url  = self.base_url + path
        resp = self._session.request(
            method=method,
            url=url,
            headers=headers,
            data=body_str.encode("utf-8") if body_str else None,
            params=params,
            timeout=self.timeout,
        )

        # 패킷 암호화 응답: application/octet-stream → 복호화
        content_type = resp.headers.get("Content-Type", "")
        if "application/octet-stream" in content_type:
            data = json.loads(self._decrypt_packet(resp.content))
        else:
            data = resp.json()

        if not data.get("ok"):
            raise RuntimeError(f"EntityServer error: {data.get('message', 'Unknown')} (HTTP {resp.status_code})")

        return data

    def _decrypt_packet(self, data: bytes) -> bytes:
        """
        XChaCha20-Poly1305 패킷 복호화
        포맷: [magic:magic_len][nonce:24][ciphertext+tag]
        키: sha256(hmac_secret)
        """
        key        = hashlib.sha256(self.hmac_secret.encode("utf-8")).digest()
        nonce      = data[self.magic_len : self.magic_len + 24]
        ciphertext = data[self.magic_len + 24 :]
        return XChaCha20Poly1305(key).decrypt(nonce, ciphertext, b"")

    def _sign(self, method: str, path: str, timestamp: str, nonce: str, body: str) -> str:
        """HMAC-SHA256 서명"""
        payload = "|".join([method, path, timestamp, nonce, body])
        return hmac.new(
            key=self.hmac_secret.encode("utf-8"),
            msg=payload.encode("utf-8"),
            digestmod=hashlib.sha256,
        ).hexdigest()
