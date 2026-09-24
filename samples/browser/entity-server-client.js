/**
 * EntityServerClient — 브라우저 전용 ES Module
 *
 * 빌드 도구 불필요. 브라우저에서 직접 import map 또는 CDN URL로 사용합니다.
 *
 * 의존성: @noble/ciphers (XChaCha20-Poly1305, 패킷 암호화 기능 사용 시에만 필요)
 *   https://cdn.jsdelivr.net/npm/@noble/ciphers@1/chacha.js
 *
 * 패킷 암호화/복호화는 Web Crypto API + @noble/ciphers를 조합합니다.
 * HMAC 서명, HKDF 키 유도, SHA-256은 Web Crypto API만으로 구현합니다.
 *
 * 사용 예:
 *   const es = new EntityServerClient({ baseUrl: 'http://localhost:47200', token: '...' });
 *   const list  = await es.list('product', { page: 1, limit: 10 });
 *   const seq   = await es.submit('product', { name: '키보드', price: 89000 });
 *   await es.delete('product', seq);
 *
 * 트랜잭션 사용 예:
 *   await es.transStart();
 *   try {
 *     const order = await es.submit('order', { ... });
 *     await es.submit('order_item', { order_seq: order.seq });
 *     await es.transCommit();
 *   } catch (e) {
 *     await es.transRollback();
 *   }
 */

// XChaCha20-Poly1305: 패킷 암호화 기능이 필요 없으면 이 import를 제거해도 됩니다.
import { xchacha20_poly1305 } from "https://cdn.jsdelivr.net/npm/@noble/ciphers@1/chacha.js";

export class EntityServerClient {
    #baseUrl;
    #apiKey;
    #hmacSecret;
    #token;
    #encryptRequests;
    #packetEncryption = false;
    #activeTxId = null;

    /**
     * @param {Object} opts
     * @param {string}  opts.baseUrl           서버 URL (예: "http://localhost:47200")
     * @param {string}  [opts.apiKey]          X-API-Key (HMAC 모드)
     * @param {string}  [opts.hmacSecret]      HMAC 서명 시크릿 (HMAC 모드)
     * @param {string}  [opts.token]           JWT Bearer 토큰 (JWT 모드)
     * @param {boolean} [opts.encryptRequests] true이면 POST 바디를 XChaCha20-Poly1305로 암호화
     */
    constructor({
        baseUrl = "http://localhost:47200",
        apiKey = "",
        hmacSecret = "",
        token = "",
        encryptRequests = false,
    } = {}) {
        this.#baseUrl = baseUrl.replace(/\/$/, "");
        this.#apiKey = apiKey;
        this.#hmacSecret = hmacSecret;
        this.#token = token;
        this.#encryptRequests = encryptRequests;
    }

    /** JWT Bearer 토큰을 설정합니다. */
    setToken(token) {
        this.#token = token;
    }

    /**
     * 서버 헬스 체크. packet_encryption이 활성화되어 있으면 이후 모든 요청에 암호화가 자동 적용됩니다.
     * @returns {Promise<{ok: boolean, packet_encryption?: boolean}>}
     */
    async checkHealth() {
        const res = await fetch(this.#baseUrl + "/v1/health");
        const data = await res.json();
        if (data.packet_encryption) this.#packetEncryption = true;
        return data;
    }

    // ─── 트랜잭션 ─────────────────────────────────────────────────────────────

    async transStart() {
        const res = await this.#request("POST", "/v1/transaction/start");
        this.#activeTxId = res.transaction_id;
        return this.#activeTxId;
    }

    transRollback(transactionId) {
        const txId = transactionId ?? this.#activeTxId;
        if (!txId)
            throw new Error("No active transaction. Call transStart() first.");
        this.#activeTxId = null;
        return this.#request("POST", `/v1/transaction/rollback/${txId}`);
    }

    transCommit(transactionId) {
        const txId = transactionId ?? this.#activeTxId;
        if (!txId)
            throw new Error("No active transaction. Call transStart() first.");
        this.#activeTxId = null;
        return this.#request("POST", `/v1/transaction/commit/${txId}`);
    }

    // ─── CRUD ─────────────────────────────────────────────────────────────────

    /** 단건 조회 */
    get(entity, seq, { skipHooks = false } = {}) {
        const q = skipHooks ? "?skipHooks=true" : "";
        return this.#request("GET", `/v1/entity/${entity}/${seq}${q}`);
    }

    /**
     * 조건으로 단건 조회 (POST + conditions body)
     *
     * @param {string} entity      엔티티 이름
     * @param {Object} conditions  필터 조건. index/hash/unique 필드만 사용 가능
     * @param {Object} [opts]
     * @param {boolean} [opts.skipHooks]  after_find 훅 미실행 여부 (기본 false)
     */
    find(entity, conditions, { skipHooks = false } = {}) {
        const q = skipHooks ? "?skipHooks=true" : "";
        return this.#request(
            "POST",
            `/v1/entity/${entity}/find${q}`,
            conditions ?? {},
        );
    }

    /**
     * 목록 조회
     * @param {Object} [opts]
     * @param {number}   [opts.page]       페이지 번호 (기본 1)
     * @param {number}   [opts.limit]      페이지당 건수 (기본 20, 최대 1000)
     * @param {string}   [opts.orderBy]    정렬 필드명 (- 접두사로 내림차순)
     * @param {string}   [opts.orderDir]   정렬 방향 ('ASC'|'DESC')
     * @param {string[]} [opts.fields]     반환 필드 목록. 미지정 시 인덱스 필드만 반환. '*' 시 전체 반환
     * @param {Object}   [opts.conditions] 필터 조건 (index/hash/unique 필드 한정)
     */
    list(
        entity,
        { page = 1, limit = 20, orderBy, orderDir, fields, conditions } = {},
    ) {
        const qParams = { page, limit };
        if (orderBy)
            qParams.order_by = orderDir === "DESC" ? `-${orderBy}` : orderBy;
        if (fields?.length) qParams.fields = fields.join(",");
        const q = new URLSearchParams(qParams);
        return this.#request(
            "POST",
            `/v1/entity/${entity}/list?${q}`,
            conditions ?? {},
        );
    }

    /** 건수 조회 */
    count(entity, conditions) {
        return this.#request(
            "POST",
            `/v1/entity/${entity}/count`,
            conditions ?? {},
        );
    }

    /**
     * 커스텀 SQL 조회 (SELECT 전용, 인덱스 테이블만 접근 가능)
     * @param {Object}  req
     * @param {string}  req.sql       SELECT SQL (파라미터는 반드시 params 로 바인딩)
     * @param {Array}   [req.params]  ? 플레이스홀더 바인딩 값
     * @param {number}  [req.limit]   최대 반환 건수 (최대 1000)
     */
    query(entity, { sql, params = [], limit } = {}) {
        const body = { sql, params };
        if (limit != null) body.limit = limit;
        return this.#request("POST", `/v1/entity/${entity}/query`, body);
    }

    /**
     * 생성 또는 수정 (seq 포함 시 수정, 없으면 생성)
     */
    submit(entity, data, { transactionId, skipHooks = false } = {}) {
        const txId = transactionId ?? this.#activeTxId;
        const extra = txId ? { "X-Transaction-ID": txId } : {};
        const q = skipHooks ? "?skipHooks=true" : "";
        return this.#request(
            "POST",
            `/v1/entity/${entity}/submit${q}`,
            data,
            extra,
        );
    }

    /**
     * 삭제
     */
    delete(
        entity,
        seq,
        { transactionId, hard = false, skipHooks = false } = {},
    ) {
        const params = new URLSearchParams();
        if (hard) params.set("hard", "true");
        if (skipHooks) params.set("skipHooks", "true");
        const q = params.size ? `?${params}` : "";
        const txId = transactionId ?? this.#activeTxId;
        const extra = txId ? { "X-Transaction-ID": txId } : {};
        return this.#request(
            "POST",
            `/v1/entity/${entity}/delete/${seq}${q}`,
            null,
            extra,
        );
    }

    /** 변경 이력 조회 */
    history(entity, seq, { page = 1, limit = 50 } = {}) {
        return this.#request(
            "GET",
            `/v1/entity/${entity}/history/${seq}?page=${page}&limit=${limit}`,
        );
    }

    /** history seq 단위 롤백 */
    rollback(entity, historySeq) {
        return this.#request(
            "POST",
            `/v1/entity/${entity}/rollback/${historySeq}`,
        );
    }

    // ─── 푸시 헬퍼 ────────────────────────────────────────────────────────────

    /**
     * Web Push (브라우저) 디바이스를 등록/갱신합니다.
     * @param {number} accountSeq
     * @param {string} deviceId     브라우저 고유 식별자 (예: localStorage UUID)
     * @param {string} pushToken    PushSubscription을 JSON.stringify한 값
     * @param {Object} [opts]
     * @param {string} [opts.browser]         브라우저명 (예: "chrome", "firefox")
     * @param {string} [opts.browserVersion]  브라우저 버전
     * @param {boolean} [opts.pushEnabled]    수신 활성화 여부 (기본 true)
     */
    registerWebPushDevice(
        accountSeq,
        deviceId,
        pushToken,
        { browser, browserVersion, pushEnabled = true, transactionId } = {},
    ) {
        return this.submit(
            "account_device",
            {
                id: deviceId,
                account_seq: accountSeq,
                push_token: pushToken,
                platform: "web",
                device_type: "browser",
                push_enabled: pushEnabled,
                ...(browser ? { browser } : {}),
                ...(browserVersion ? { browser_version: browserVersion } : {}),
            },
            { transactionId },
        );
    }

    /** 푸시 수신 비활성화 */
    disablePushDevice(deviceSeq, { transactionId } = {}) {
        return this.submit(
            "account_device",
            { seq: deviceSeq, push_enabled: false },
            { transactionId },
        );
    }

    // ─── 내부 구현 ────────────────────────────────────────────────────────────

    async #request(method, path, body, extraHeaders = {}) {
        const useEncryption = this.#encryptRequests || this.#packetEncryption;
        const isHmacMode = !!(this.#apiKey && this.#hmacSecret);

        // 바디 직렬화 / 암호화
        let bodyBytes = null; // Uint8Array | null (암호화 시)
        let bodyString = null; // string | null (평문 시)
        let contentType = "application/json";

        if (body != null) {
            const json = JSON.stringify(body);
            if (useEncryption) {
                bodyBytes = await this.#encryptPacket(
                    new TextEncoder().encode(json),
                );
                contentType = "application/octet-stream";
            } else {
                bodyString = json;
            }
        }

        const headers = { "Content-Type": contentType };

        if (isHmacMode) {
            const timestamp = String(Math.floor(Date.now() / 1000));
            const nonce = crypto.randomUUID();
            const rawBody = bodyBytes ?? bodyString ?? "";
            const signature = await this.#sign(
                method,
                path,
                timestamp,
                nonce,
                rawBody,
            );
            Object.assign(headers, {
                "X-API-Key": this.#apiKey,
                "X-Timestamp": timestamp,
                "X-Nonce": nonce,
                "X-Signature": signature,
            });
        } else if (this.#token) {
            headers["Authorization"] = `Bearer ${this.#token}`;
        }

        Object.assign(headers, extraHeaders);

        const fetchBody = bodyBytes ?? bodyString ?? undefined;
        const res = await fetch(this.#baseUrl + path, {
            method,
            headers,
            ...(fetchBody != null ? { body: fetchBody } : {}),
        });

        const ct = res.headers.get("Content-Type") ?? "";
        if (ct.includes("application/octet-stream")) {
            const buf = await res.arrayBuffer();
            return this.#decryptPacket(new Uint8Array(buf));
        }

        const data = await res.json();
        if (!data.ok) {
            throw new Error(
                `EntityServer error: ${data.message ?? "Unknown"} (HTTP ${res.status})`,
            );
        }
        return data;
    }

    /**
     * HMAC-SHA256 서명 (Web Crypto API)
     * 서명 대상: prefix("METHOD|/path|ts|nonce|") + body 바이트
     */
    async #sign(method, path, timestamp, nonce, body) {
        const enc = new TextEncoder();
        const keyBytes = enc.encode(this.#hmacSecret);

        const cryptoKey = await crypto.subtle.importKey(
            "raw",
            keyBytes,
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
        );

        const prefix = enc.encode(`${method}|${path}|${timestamp}|${nonce}|`);

        let msgBytes;
        if (body != null && body !== "") {
            const bodyBytes =
                typeof body === "string" ? enc.encode(body) : body; // Uint8Array
            msgBytes = new Uint8Array(prefix.length + bodyBytes.length);
            msgBytes.set(prefix);
            msgBytes.set(bodyBytes, prefix.length);
        } else {
            msgBytes = prefix;
        }

        const sigBuf = await crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
        return Array.from(new Uint8Array(sigBuf))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }

    /**
     * 패킷 암호화 키 유도 (Web Crypto API)
     * - HMAC 모드: HKDF-SHA256(hmacSecret, salt, info) → 32 bytes
     * - JWT 모드:  SHA-256(token) → 32 bytes
     * @returns {Promise<Uint8Array>}
     */
    async #derivePacketKey() {
        const enc = new TextEncoder();

        if (this.#token && !this.#hmacSecret) {
            const buf = await crypto.subtle.digest(
                "SHA-256",
                enc.encode(this.#token),
            );
            return new Uint8Array(buf);
        }

        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            enc.encode(this.#hmacSecret),
            "HKDF",
            false,
            ["deriveBits"],
        );
        const bits = await crypto.subtle.deriveBits(
            {
                name: "HKDF",
                hash: "SHA-256",
                salt: enc.encode("entity-server:hkdf:v1"),
                info: enc.encode("entity-server:packet-encryption"),
            },
            keyMaterial,
            256, // 32 bytes
        );
        return new Uint8Array(bits);
    }

    /**
     * XChaCha20-Poly1305 패킷 암호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * magicLen: 패킷 키의 마지막 바이트에서 파생 (2 + key[31] % 14)
     * @param {Uint8Array} plaintext
     * @returns {Promise<Uint8Array>}
     */
    async #encryptPacket(plaintext) {
        const key = await this.#derivePacketKey();
        const magicLen = 2 + (key[31] % 14);
        const magic = crypto.getRandomValues(new Uint8Array(magicLen));
        const nonce = crypto.getRandomValues(new Uint8Array(24));
        const cipher = xchacha20_poly1305(key, nonce);
        const ciphertext = cipher.encrypt(plaintext);
        const out = new Uint8Array(
            magic.length + nonce.length + ciphertext.length,
        );
        out.set(magic);
        out.set(nonce, magic.length);
        out.set(ciphertext, magic.length + nonce.length);
        return out;
    }

    /**
     * XChaCha20-Poly1305 패킷 복호화
     * @param {Uint8Array} data
     * @returns {Promise<any>}
     */
    async #decryptPacket(data) {
        const key = await this.#derivePacketKey();
        const magicLen = 2 + (key[31] % 14);
        const nonce = data.slice(magicLen, magicLen + 24);
        const ciphertext = data.slice(magicLen + 24);
        const cipher = xchacha20_poly1305(key, nonce);
        const plaintext = cipher.decrypt(ciphertext);
        return JSON.parse(new TextDecoder().decode(plaintext));
    }
}

export default EntityServerClient;
