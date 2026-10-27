/**
 * Entity Server 클라이언트 (Node.js)
 *
 * 의존성: Node.js 18+, @noble/ciphers, @noble/hashes
 *   npm install @noble/ciphers @noble/hashes
 *
 * 환경변수:
 *   ENTITY_SERVER_URL          http://localhost:47200
 *   ENTITY_SERVER_API_KEY      your-api-key        (HMAC 모드)
 *   ENTITY_SERVER_HMAC_SECRET  your-hmac-secret    (HMAC 모드)
 *   ENTITY_SERVER_TOKEN        your-jwt-token      (JWT 모드)
 *
 * 사용 예:
 *   const es = new EntityServerClient();
 *   const list = await es.list('account', { page: 1, limit: 20 });
 *   const seq  = await es.submit('account', { name: '홍길동' });
 *
 * 트랜잭션 사용 예:
 *   await es.transStart();
 *   try {
 *     const orderRef  = await es.submit('order', { ... });         // seq: "$tx.0"
 *     await es.submit('order_item', { order_seq: orderRef.seq });  // "$tx.0" 자동 치환
 *     const result = await es.transCommit();
 *     const orderSeq = result.results[0].seq;  // 실제 seq
 *   } catch (e) {
 *     await es.transRollback();
 *   }
 */

import { createHmac, randomFillSync, randomUUID } from "crypto";
import { xchacha20_poly1305 } from "@noble/ciphers/chacha";
import { sha256 } from "@noble/hashes/sha2";
import { hkdf } from "@noble/hashes/hkdf";

export class EntityServerClient {
    #baseUrl;
    #apiKey;
    #hmacSecret;
    #token;
    #encryptRequests;
    #packetEncryption = false;
    #activeTxId = null;

    /**
     * @param {Object} [opts]
     * @param {string}  [opts.baseUrl]         ENTITY_SERVER_URL 환경변수 또는 기본값
     * @param {string}  [opts.apiKey]          X-API-Key 헤더값 (HMAC 모드)
     * @param {string}  [opts.hmacSecret]      HMAC 서명 시크릿 (HMAC 모드)
     * @param {string}  [opts.token]           JWT Bearer 토큰 (JWT 모드)
     * @param {boolean} [opts.encryptRequests] true 이면 POST 요청 바디를 XChaCha20-Poly1305로 암호화
     */
    constructor({
        baseUrl = process.env.ENTITY_SERVER_URL ?? "http://localhost:47200",
        apiKey = process.env.ENTITY_SERVER_API_KEY ?? "",
        hmacSecret = process.env.ENTITY_SERVER_HMAC_SECRET ?? "",
        token = process.env.ENTITY_SERVER_TOKEN ?? "",
        encryptRequests = false,
    } = {}) {
        this.#baseUrl = baseUrl.replace(/\/$/, "");
        this.#apiKey = apiKey;
        this.#hmacSecret = hmacSecret;
        this.#token = token;
        this.#encryptRequests = encryptRequests;
    }

    /** JWT Bearer 토큰을 설정합니다. HMAC 모드와 배타적으로 사용합니다. */
    setToken(token) {
        this.#token = token;
    }

    /**
     * 서버 헬스 체크를 수행하고 패킷 암호화 활성 여부를 자동으로 감지합니다.
     * 서버가 packet_encryption: true 를 응답하면 이후 모든 요청에 암호화가 자동 적용됩니다.
     * @returns {Promise<{ok: boolean, packet_encryption?: boolean}>}
     */
    async checkHealth() {
        const res = await fetch(this.#baseUrl + "/v1/health");
        const data = await res.json();
        if (data.packet_encryption) {
            this.#packetEncryption = true;
        }
        return data;
    }

    // ─── 트랜잭션 ─────────────────────────────────────────────────────────────

    /**
     * 트랜잭션 시작 — 서버에 트랜잭션 큐를 등록하고 transaction_id 를 반환합니다.
     * 이후 submit / delete 가 서버 큐에 쌓이고 transCommit() 시 일괄 처리됩니다.
     * @returns {Promise<string>} transaction_id
     */
    async transStart() {
        const res = await this.#request("POST", "/v1/transaction/start");
        this.#activeTxId = res.transaction_id;
        return this.#activeTxId;
    }

    /**
     * 트랜잭션 단위로 변경사항을 롤백합니다.
     * @param {string} [transactionId]  생략 시 transStart() 로 시작한 활성 트랜잭션 사용
     */
    transRollback(transactionId) {
        const txId = transactionId ?? this.#activeTxId;
        if (!txId)
            throw new Error("No active transaction. Call transStart() first.");
        this.#activeTxId = null;
        return this.#request("POST", `/v1/transaction/rollback/${txId}`);
    }

    /**
     * 트랜잭션 커밋 — 서버 큐에 쌓인 작업들을 단일 DB 트랜잭션으로 일괄 처리합니다.
     * @param {string} [transactionId]  생략 시 transStart() 로 시작한 활성 트랜잭션 사용
     */
    transCommit(transactionId) {
        const txId = transactionId ?? this.#activeTxId;
        if (!txId)
            throw new Error("No active transaction. Call transStart() first.");
        this.#activeTxId = null;
        return this.#request("POST", `/v1/transaction/commit/${txId}`);
    }

    // ─── CRUD ────────────────────────────────────────────────────────────────

    /**
     * 단건 조회
     * @param {Object} [opts]
     * @param {boolean} [opts.skipHooks]  true 이면 after_get 훅 미실행
     */
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
     * 목록 조회 (POST + conditions body)
     *
     * @param {Object} [opts]
     * @param {number}   [opts.page]        페이지 번호 (기본 1)
     * @param {number}   [opts.limit]       페이지당 건수 (기본 20, 최대 1000)
     * @param {string}   [opts.orderBy]     정렬 기준 필드명 (- 접두사로 내림차순)
     * @param {string}   [opts.orderDir]    정렬 방향 ('ASC'|'DESC')
     * @param {string[]} [opts.fields]      반환 필드 목록. 미지정 시 인덱스 필드만 반환 (기본, 가장 빠름). '*' 지정 시 전체 필드 반환
     * @param {Object}   [opts.conditions]  필터 조건. index/hash/unique 필드만 사용 가능
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

    /**
     * 건수 조회
     * @param {Object} [conditions]  필터 조건 (list() 와 동일 규칙)
     */
    count(entity, conditions) {
        return this.#request(
            "POST",
            `/v1/entity/${entity}/count`,
            conditions ?? {},
        );
    }

    /**
     * 커스텀 SQL 조회 (SELECT 전용, 인덱스 테이블만, JOIN 지원)
     *
     * @param {Object}   req
     * @param {string}   req.sql      SELECT SQL문. 사용자 입력은 반드시 params 로 바인딩 (SQL Injection 방지)
     * @param {Array}    [req.params] ? 플레이스홀더 바인딩 값
     * @param {number}   [req.limit]  최대 반환 건수 (최대 1000)
     *
     * @example
     * es.query('order', {
     *   sql: 'SELECT o.seq, u.name FROM order o JOIN account u ON u.data_seq = o.account_seq WHERE o.status = ?',
     *   params: ['pending'],
     *   limit: 100,
     * });
     */
    query(entity, { sql, params = [], limit } = {}) {
        const body = { sql, params };
        if (limit != null) body.limit = limit;
        return this.#request("POST", `/v1/entity/${entity}/query`, body);
    }

    /**
     * 생성 또는 수정
     * body에 seq 포함 시 수정, 없으면 생성
     * @param {string} entity
     * @param {Object} data
     * @param {Object} [opts]
     * @param {string} [opts.transactionId]  transStart() 가 반환한 ID (생략 시 활성 트랜잭션 자동 사용)
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
     * @param {string} entity
     * @param {number} seq
     * @param {Object} [opts]
     * @param {string} [opts.transactionId]  transStart() 가 반환한 ID (생략 시 활성 트랜잭션 자동 사용)
     * @param {boolean} [opts.hard]           하드 삭제 여부 (기본 false)
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

    /** history seq 단위 롤백 (단건) */
    rollback(entity, historySeq) {
        return this.#request(
            "POST",
            `/v1/entity/${entity}/rollback/${historySeq}`,
        );
    }

    /** 푸시 발송 트리거 엔티티에 submit합니다. */
    push(pushEntity, payload, { transactionId } = {}) {
        return this.submit(pushEntity, payload, { transactionId });
    }

    /** push_log 목록 조회 헬퍼 */
    pushLogList({ page = 1, limit = 20, orderBy } = {}) {
        return this.list("push_log", { page, limit, orderBy });
    }

    /** account_device 디바이스 등록/갱신 헬퍼 (push_token 단일 필드) */
    registerPushDevice(
        accountSeq,
        deviceId,
        pushToken,
        {
            platform,
            deviceType,
            browser,
            browserVersion,
            pushEnabled = true,
            transactionId,
        } = {},
    ) {
        return this.submit(
            "account_device",
            {
                id: deviceId,
                account_seq: accountSeq,
                push_token: pushToken,
                push_enabled: pushEnabled,
                ...(platform ? { platform } : {}),
                ...(deviceType ? { device_type: deviceType } : {}),
                ...(browser ? { browser } : {}),
                ...(browserVersion ? { browser_version: browserVersion } : {}),
            },
            { transactionId },
        );
    }

    /** account_device.seq 기준 push_token 갱신 헬퍼 */
    updatePushDeviceToken(
        deviceSeq,
        pushToken,
        { pushEnabled = true, transactionId } = {},
    ) {
        return this.submit(
            "account_device",
            {
                seq: deviceSeq,
                push_token: pushToken,
                push_enabled: pushEnabled,
            },
            { transactionId },
        );
    }

    /** account_device.seq 기준 푸시 수신 비활성화 헬퍼 */
    disablePushDevice(deviceSeq, { transactionId } = {}) {
        return this.submit(
            "account_device",
            {
                seq: deviceSeq,
                push_enabled: false,
            },
            { transactionId },
        );
    }

    /**
     * 요청 본문을 읽어 JSON으로 반환합니다.
     * - application/octet-stream: 암호 패킷 복호화
     * - 그 외: 평문 JSON 파싱
     */
    readRequestBody(
        body,
        contentType = "application/json",
        { requireEncrypted = false } = {},
    ) {
        const lowered = String(contentType || "").toLowerCase();
        const isEncrypted = lowered.includes("application/octet-stream");

        if (requireEncrypted && !isEncrypted) {
            throw new Error(
                "Encrypted request required: Content-Type must be application/octet-stream",
            );
        }

        if (isEncrypted) {
            if (body == null) {
                throw new Error("Encrypted request body is empty");
            }

            if (body instanceof ArrayBuffer) {
                return this.#decryptPacket(body);
            }

            if (ArrayBuffer.isView(body)) {
                const view = body;
                const sliced = view.buffer.slice(
                    view.byteOffset,
                    view.byteOffset + view.byteLength,
                );
                return this.#decryptPacket(sliced);
            }

            throw new Error(
                "Encrypted request body must be ArrayBuffer, Buffer, or Uint8Array",
            );
        }

        if (body == null || body === "") return {};
        if (typeof body === "object") return body;
        return JSON.parse(String(body));
    }

    // ─── 내부 ─────────────────────────────────────────────────────────────────

    async #request(method, path, body, extraHeaders = {}) {
        // 요청 바디 결정: encryptRequests 시 POST 바디를 암호화합니다.
        let bodyData = null; // string | Buffer | null
        if (body != null) {
            if (this.#encryptRequests || this.#packetEncryption) {
                const plaintext = Buffer.from(JSON.stringify(body));
                bodyData = this.#encryptPacket(plaintext); // Buffer
            } else {
                bodyData = JSON.stringify(body);
            }
        }

        const isHmacMode = !!(this.#apiKey && this.#hmacSecret);

        const contentType =
            (this.#encryptRequests || this.#packetEncryption) &&
            bodyData instanceof Buffer
                ? "application/octet-stream"
                : "application/json";

        const headers = { "Content-Type": contentType };

        if (isHmacMode) {
            const timestamp = String(Math.floor(Date.now() / 1000));
            const nonce = randomUUID();
            const signature = this.#sign(
                method,
                path,
                timestamp,
                nonce,
                bodyData ?? "",
            );
            headers["X-API-Key"] = this.#apiKey;
            headers["X-Timestamp"] = timestamp;
            headers["X-Nonce"] = nonce;
            headers["X-Signature"] = signature;
        } else if (this.#token) {
            headers["Authorization"] = `Bearer ${this.#token}`;
        }

        Object.assign(headers, extraHeaders);

        const res = await fetch(this.#baseUrl + path, {
            method,
            headers,
            ...(bodyData != null ? { body: bodyData } : {}),
        });

        const contentType = res.headers.get("Content-Type") ?? "";

        // 패킷 암호화 응답: application/octet-stream → 복호화
        if (contentType.includes("application/octet-stream")) {
            const buffer = await res.arrayBuffer();
            return this.#decryptPacket(buffer);
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
     * 패킷 암호화 키를 유도합니다.
     * - HMAC 모드: HKDF-SHA256(hmac_secret, "entity-server:packet-encryption")
     * - JWT  모드: SHA256(token)
     */
    #derivePacketKey() {
        if (this.#token && !this.#hmacSecret) {
            return sha256(new TextEncoder().encode(this.#token));
        }
        const salt = new TextEncoder().encode("entity-server:hkdf:v1");
        const info = new TextEncoder().encode(
            "entity-server:packet-encryption",
        );
        return hkdf(
            sha256,
            new TextEncoder().encode(this.#hmacSecret),
            salt,
            info,
            32,
        );
    }

    /**
     * XChaCha20-Poly1305 패킷 암호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * magicLen: 패킷 키의 마지막 바이트에서 파생 (2 + key[31] % 14)
     * @param {Buffer} plaintext
     * @returns {Buffer}
     */
    #encryptPacket(plaintext) {
        const key = this.#derivePacketKey();
        const magicLen = 2 + (key[31] % 14);
        const magic = Buffer.allocUnsafe(magicLen);
        const nonce = Buffer.allocUnsafe(24);
        randomFillSync(magic);
        randomFillSync(nonce);
        const cipher = xchacha20_poly1305(key, nonce);
        const ciphertext = cipher.encrypt(
            plaintext instanceof Uint8Array
                ? plaintext
                : new Uint8Array(plaintext),
        );
        return Buffer.concat([magic, nonce, Buffer.from(ciphertext)]);
    }

    /**
     * XChaCha20-Poly1305 패킷 복호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * 키: HKDF-SHA256(hmac_secret, "entity-server:packet-encryption")
     */
    #decryptPacket(buffer) {
        const key = this.#derivePacketKey();
        const magicLen = 2 + (key[31] % 14);
        const data = new Uint8Array(buffer);
        const nonce = data.slice(magicLen, magicLen + 24);
        const ciphertext = data.slice(magicLen + 24);
        const cipher = xchacha20_poly1305(key, nonce);
        const plaintext = cipher.decrypt(ciphertext);
        return JSON.parse(new TextDecoder().decode(plaintext));
    }

    /**
     * HMAC-SHA256 서명
     * body 는 문자열(JSON) 또는 Buffer(암호화된 바디) 모두 지원합니다.
     */
    #sign(method, path, timestamp, nonce, body) {
        const mac = createHmac("sha256", this.#hmacSecret);
        const prefix = `${method}|${path}|${timestamp}|${nonce}|`;
        mac.update(prefix);
        if (body != null && body !== "") {
            // Buffer(binary) 또는 string 모두 처리 — Go 서버의 string(c.Body()) 와 동일한 바이트
            mac.update(typeof body === "string" ? body : Buffer.from(body));
        }
        return mac.digest("hex");
    }
}

export default EntityServerClient;
