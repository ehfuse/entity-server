/**
 * Entity Server 클라이언트 (Swift / iOS)
 *
 * 의존성 (Package.swift / SPM):
 *   .package(url: "https://github.com/krzyzanowskim/CryptoSwift.git", from: "1.8.0")
 *
 * HMAC API Key 인증 방식 사용 예:
 *   let client = EntityServerClient(
 *       baseUrl:    "http://your-server:47200",
 *       apiKey:     "your-api-key",
 *       hmacSecret: "your-hmac-secret"
 *   )
 *   let result = try await client.list("product")
 *
 * 트랜잭션 사용 예:
 *   try await es.transStart()
 *   do {
 *     let orderRef  = try await es.submit(entity: "order", data: ["user_seq": 1, "total": 9900])  // seq: "$tx.0"
 *     try await es.submit(entity: "order_item",
 *         data: ["order_seq": orderRef["seq"] as Any, "item_seq": 5])                            // "$tx.0" 자동 치환
 *     let result    = try await es.transCommit()
 *     let orderSeq  = (result["results"] as? [[String: Any]])?[0]["seq"]                        // 실제 seq
 *   } catch {
 *     try? await es.transRollback()
 *   }
 */

import CryptoSwift
import Foundation

public final class EntityServerClient {
    private let baseURL: URL
    private let apiKey: String
    private let hmacSecret: String
    private var token: String
    private let encryptRequests: Bool
    private let session: URLSession
    private var activeTxId: String? = nil

    public init(
        baseUrl: String = "http://localhost:47200",
        apiKey: String = "",
        hmacSecret: String = "",
        token: String = "",
        /// true 이면 POST 요청 바디를 XChaCha20-Poly1305로 암호화합니다.
        encryptRequests: Bool = false,
        session: URLSession = .shared
    ) {
        self.baseURL = URL(string: baseUrl.removingSuffix("/"))!
        self.apiKey = apiKey
        self.hmacSecret = hmacSecret
        self.token = token
        self.encryptRequests = encryptRequests
        self.session = session
    }

    /** JWT Bearer 토큰을 설정합니다. HMAC 모드와 배타적으로 사용합니다. */
    public func setToken(_ newToken: String) { token = newToken }

    // ─── CRUD ─────────────────────────────────────────────────────────

    public func get(entity: String, seq: Int64, skipHooks: Bool = false) async throws -> [String: Any] {
        let q = skipHooks ? "?skipHooks=true" : ""
        return try await request(method: "GET", path: "/v1/entity/\(entity)/\(seq)\(q)")
    }

    /// 조건으로 단건 조회 (POST + conditions body)
    ///
    /// `conditions` 는 index/hash/unique 필드에만 사용 가능합니다.
    /// 조건에 맞는 행이 없으면 404 오류가 발생합니다.
    public func find(entity: String, conditions: [String: Any], skipHooks: Bool = false) async throws -> [String: Any] {
        let q = skipHooks ? "?skipHooks=true" : ""
        let body = try JSONSerialization.data(withJSONObject: conditions)
        return try await request(method: "POST", path: "/v1/entity/\(entity)/find\(q)", body: body)
    }

    /// 목록 조회 (POST + conditions body)
    ///
    /// `fields`를 미지정하면 기본적으로 인덱스 필드만 반환합니다 (가장 빠름).
    /// 전체 필드 반환이 필요하면 `fields: ["*"]` 를 지정하세요.
    /// `conditions` 는 index/hash/unique 필드에만 사용 가능합니다.
    public func list(
        entity: String,
        page: Int = 1,
        limit: Int = 20,
        orderBy: String? = nil,
        fields: [String]? = nil,
        conditions: [String: Any]? = nil
    ) async throws -> [String: Any] {
        var qParts = ["page=\(page)", "limit=\(limit)"]
        if let orderBy = orderBy { qParts.append("order_by=\(orderBy)") }
        if let fields = fields, !fields.isEmpty { qParts.append("fields=\(fields.joined(separator: ","))") }
        let body = try JSONSerialization.data(withJSONObject: conditions ?? [:])
        return try await request(method: "POST", path: "/v1/entity/\(entity)/list?\(qParts.joined(separator: "&"))", body: body)
    }

    /// 건수 조회
    public func count(entity: String, conditions: [String: Any]? = nil) async throws -> [String: Any] {
        let body = try JSONSerialization.data(withJSONObject: conditions ?? [:])
        return try await request(method: "POST", path: "/v1/entity/\(entity)/count", body: body)
    }

    /// 커스텀 SQL 조회 (SELECT 전용, 인덱스 테이블만, JOIN 지원)
    /// 사용자 입력은 반드시 `params` 로 바인딩하세요 (SQL Injection 방지).
    public func query(
        entity: String,
        sql: String,
        params: [Any]? = nil,
        limit: Int? = nil
    ) async throws -> [String: Any] {
        var bodyDict: [String: Any] = ["sql": sql, "params": params ?? []]
        if let limit = limit { bodyDict["limit"] = limit }
        let body = try JSONSerialization.data(withJSONObject: bodyDict)
        return try await request(method: "POST", path: "/v1/entity/\(entity)/query", body: body)
    }

    /// 트랜잭션 시작 — 서버에 트랜잭션 큐를 등록하고 transaction_id 를 반환합니다.
    /// 이후 submit / delete 가 서버 큐에 쌓이고 transCommit() 시 일괄 처리됩니다.
    public func transStart() async throws -> String {
        let res = try await request(method: "POST", path: "/v1/transaction/start")
        guard let txId = res["transaction_id"] as? String else {
            throw NSError(domain: "EntityServerClient", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "transStart: server did not return transaction_id"])
        }
        activeTxId = txId
        return txId
    }

    /// 트랜잭션 전체 롤백
    /// transactionId 생략 시 transStart() 로 시작한 활성 트랜잭션을 롤백합니다.
    public func transRollback(transactionId: String? = nil) async throws -> [String: Any] {
        guard let txId = transactionId ?? activeTxId else {
            throw NSError(domain: "EntityServerClient", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "No active transaction. Call transStart() first."])
        }
        activeTxId = nil
        return try await request(method: "POST", path: "/v1/transaction/rollback/\(txId)")
    }

    /// 트랜잭션 커밋 — 서버 큐에 쌓인 작업을 단일 DB 트랜잭션으로 일괄 처리합니다.
    /// transactionId 생략 시 transStart() 로 시작한 활성 트랜잭션을 사용합니다.
    public func transCommit(transactionId: String? = nil) async throws -> [String: Any] {
        guard let txId = transactionId ?? activeTxId else {
            throw NSError(domain: "EntityServerClient", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "No active transaction. Call transStart() first."])
        }
        activeTxId = nil
        return try await request(method: "POST", path: "/v1/transaction/commit/\(txId)")
    }

    public func submit(entity: String, data: [String: Any], transactionId: String? = nil, skipHooks: Bool = false) async throws -> [String: Any] {
        let body = try JSONSerialization.data(withJSONObject: data)
        var extra: [String: String] = [:]
        if let txId = transactionId ?? activeTxId { extra["X-Transaction-ID"] = txId }
        let q = skipHooks ? "?skipHooks=true" : ""
        return try await request(method: "POST", path: "/v1/entity/\(entity)/submit\(q)", body: body, extraHeaders: extra)
    }

    /// 삭제. 서버는 POST /delete/:seq 로만 처리합니다.
    public func delete(entity: String, seq: Int64, transactionId: String? = nil, hard: Bool = false, skipHooks: Bool = false) async throws -> [String: Any] {
        var qParts: [String] = []
        if hard { qParts.append("hard=true") }
        if skipHooks { qParts.append("skipHooks=true") }
        let q = qParts.isEmpty ? "" : "?" + qParts.joined(separator: "&")
        var extra: [String: String] = [:]
        if let txId = transactionId ?? activeTxId { extra["X-Transaction-ID"] = txId }
        return try await request(method: "POST", path: "/v1/entity/\(entity)/delete/\(seq)\(q)", extraHeaders: extra)
    }

    public func history(entity: String, seq: Int64, page: Int = 1, limit: Int = 50) async throws -> [String: Any] {
        try await request(method: "GET", path: "/v1/entity/\(entity)/history/\(seq)?page=\(page)&limit=\(limit)")
    }

    public func rollback(entity: String, historySeq: Int64) async throws -> [String: Any] {
        try await request(method: "POST", path: "/v1/entity/\(entity)/rollback/\(historySeq)")
    }

    /// 푸시 발송 트리거 엔티티에 submit합니다.
    public func push(pushEntity: String, payload: [String: Any], transactionId: String? = nil) async throws -> [String: Any] {
        try await submit(entity: pushEntity, data: payload, transactionId: transactionId)
    }

    /// push_log 목록 조회 헬퍼
    public func pushLogList(page: Int = 1, limit: Int = 20) async throws -> [String: Any] {
        try await list(entity: "push_log", page: page, limit: limit)
    }

    /// account_device 디바이스 등록/갱신 헬퍼 (push_token 단일 필드)
    public func registerPushDevice(
        accountSeq: Int64,
        deviceId: String,
        pushToken: String,
        platform: String? = nil,
        deviceType: String? = nil,
        browser: String? = nil,
        browserVersion: String? = nil,
        pushEnabled: Bool = true,
        transactionId: String? = nil
    ) async throws -> [String: Any] {
        var payload: [String: Any] = [
            "id": deviceId,
            "account_seq": accountSeq,
            "push_token": pushToken,
            "push_enabled": pushEnabled,
        ]
        if let platform { payload["platform"] = platform }
        if let deviceType { payload["device_type"] = deviceType }
        if let browser { payload["browser"] = browser }
        if let browserVersion { payload["browser_version"] = browserVersion }
        return try await submit(entity: "account_device", data: payload, transactionId: transactionId)
    }

    /// account_device.seq 기준 push_token 갱신 헬퍼
    public func updatePushDeviceToken(
        deviceSeq: Int64,
        pushToken: String,
        pushEnabled: Bool = true,
        transactionId: String? = nil
    ) async throws -> [String: Any] {
        try await submit(
            entity: "account_device",
            data: [
                "seq": deviceSeq,
                "push_token": pushToken,
                "push_enabled": pushEnabled,
            ],
            transactionId: transactionId
        )
    }

    /// account_device.seq 기준 푸시 수신 비활성화 헬퍼
    public func disablePushDevice(
        deviceSeq: Int64,
        transactionId: String? = nil
    ) async throws -> [String: Any] {
        try await submit(
            entity: "account_device",
            data: [
                "seq": deviceSeq,
                "push_enabled": false,
            ],
            transactionId: transactionId
        )
    }

    /// 요청 본문을 읽어 JSON으로 반환합니다.
    /// - application/octet-stream: 암호 패킷 복호화
    /// - 그 외: 평문 JSON 파싱
    public func readRequestBody(
        _ rawBody: Data,
        contentType: String = "application/json",
        requireEncrypted: Bool = false
    ) throws -> [String: Any] {
        let lowered = contentType.lowercased()
        let isEncrypted = lowered.contains("application/octet-stream")

        if requireEncrypted && !isEncrypted {
            throw NSError(
                domain: "EntityServerClient",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Encrypted request required: Content-Type must be application/octet-stream"]
            )
        }

        if isEncrypted {
            if rawBody.isEmpty {
                throw NSError(
                    domain: "EntityServerClient",
                    code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Encrypted request body is empty"]
                )
            }
            return try decryptPacket(rawBody)
        }

        if rawBody.isEmpty { return [:] }
        guard let json = try JSONSerialization.jsonObject(with: rawBody) as? [String: Any] else {
            throw EntityServerError.invalidResponse
        }
        return json
    }

    // ─── 내부 ─────────────────────────────────────────────────────────

    private func request(method: String, path: String, body: Data? = nil, extraHeaders: [String: String] = [:]) async throws -> [String: Any] {
        let url = baseURL.appendingPathComponent(path, isDirectory: false)
        var req = URLRequest(url: url)
        req.httpMethod = method

        // 요청 바디 결정: encryptRequests 시 POST 바디를 암호화합니다.
        var requestBody = body
        var requestContentType = "application/json"
        if let body = body, encryptRequests || packetEncryption {
            requestBody = try encryptPacket(body)
            requestContentType = "application/octet-stream"
        }

        let bodyForSign = requestBody ?? Data()
        let isHmacMode = !apiKey.isEmpty && !hmacSecret.isEmpty

        req.setValue(requestContentType, forHTTPHeaderField: "Content-Type")
        if isHmacMode {
            let timestamp = String(Int(Date().timeIntervalSince1970))
            let nonce = UUID().uuidString
            let signature = try sign(method: method, path: path, timestamp: timestamp, nonce: nonce, bodyData: bodyForSign)
            req.setValue(apiKey,     forHTTPHeaderField: "X-API-Key")
            req.setValue(timestamp,  forHTTPHeaderField: "X-Timestamp")
            req.setValue(nonce,      forHTTPHeaderField: "X-Nonce")
            req.setValue(signature,  forHTTPHeaderField: "X-Signature")
        } else if !token.isEmpty {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        extraHeaders.forEach { req.setValue($0.value, forHTTPHeaderField: $0.key) }
        req.httpBody = requestBody

        let (data, response) = try await session.data(for: req)
        let http = response as! HTTPURLResponse
        let respContentType = http.value(forHTTPHeaderField: "Content-Type") ?? ""

        // 패킷 암호화 응답: application/octet-stream → 복호화
        if respContentType.contains("application/octet-stream") {
            return try decryptPacket(data)
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw EntityServerError.invalidResponse
        }
        return json
    }

    /**
     * 패킷 암호화 키를 유도합니다.
     * - HMAC 모드: HKDF-SHA256(hmac_secret, "entity-server:packet-encryption")
     * - JWT  모드: SHA256(token)
     */
    private func derivePacketKey() throws -> [UInt8] {
        if !token.isEmpty && hmacSecret.isEmpty {
            return Digest.sha256(Array(token.utf8))
        }
        return try HKDF(
            password: Array(hmacSecret.utf8),
            salt: Array("entity-server:hkdf:v1".utf8),
            info: Array("entity-server:packet-encryption".utf8),
            keyLength: 32,
            variant: .sha256
        ).calculate()
    }

    /**
     * XChaCha20-Poly1305 패킷 암호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * 키: HKDF-SHA256(hmac_secret, "entity-server:packet-encryption")
     * magicLen: 2 + key[31] % 14
     */
    private func encryptPacket(_ data: Data) throws -> Data {
        let key = try derivePacketKey()
        var generator = SystemRandomNumberGenerator()
        let magicLen = 2 + Int(key[31]) % 14
        let magic = (0..<magicLen).map { _ in generator.next() as UInt8 }
        let nonce  = (0..<24).map     { _ in generator.next() as UInt8 }
        let xchacha = XChaCha20Poly1305(key: key, iv: nonce, aad: [])
        let ciphertext = try xchacha.encrypt(Array(data))
        return Data(magic + nonce + ciphertext)
    }

    /**
     * XChaCha20-Poly1305 패킷 복호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * 키: HKDF-SHA256(hmac_secret, "entity-server:packet-encryption")
     */
    private func decryptPacket(_ data: Data) throws -> [String: Any] {
        let key = try derivePacketKey()
        let bytes = Array(data)
        let magicLen = 2 + Int(key[31]) % 14
        let nonce = Array(bytes[magicLen..<(magicLen + 24)])
        let ciphertext = Array(bytes[(magicLen + 24)...])

        // XChaCha20-Poly1305 복호화 (tag는 ciphertext 마지막 16바이트)
        let xchacha = XChaCha20Poly1305(key: key, iv: nonce, aad: [])
        let plaintext = try xchacha.decrypt(ciphertext)

        guard let json = try JSONSerialization.jsonObject(with: Data(plaintext)) as? [String: Any] else {
            throw EntityServerError.decryptionFailed
        }
        return json
    }

    /** HMAC-SHA256 서명. bodyData 는 JSON 또는 암호화된 바이너리 모두 지원합니다. */
    private func sign(method: String, path: String, timestamp: String, nonce: String, bodyData: Data) throws -> String {
        var payload = "\(method)|\(path)|\(timestamp)|\(nonce)|".data(using: .utf8)!
        payload.append(bodyData)
        let mac = try HMAC(key: Array(hmacSecret.utf8), variant: .sha256).authenticate(Array(payload))
        return mac.map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - XChaCha20Poly1305 helper (CryptoSwift wrapper)
private struct XChaCha20Poly1305 {
    let key: [UInt8]
    let iv: [UInt8]
    let aad: [UInt8]

    func encrypt(_ plaintext: [UInt8]) throws -> [UInt8] {
        let chacha = try ChaCha20(key: key, iv: iv)
        let ct = try chacha.encrypt(plaintext)
        let poly = try Poly1305(key: chacha.keystream().prefix(32)).authenticate(ct + aad)
        return ct + poly
    }

    func decrypt(_ ciphertext: [UInt8]) throws -> [UInt8] {
        // CryptoSwift ChaCha20.Poly1305 AEAD - tag는 마지막 16바이트
        let tag = Array(ciphertext.suffix(16))
        let ct  = Array(ciphertext.dropLast(16))
        let chacha = try ChaCha20(key: key, iv: iv)
        let decrypted = try chacha.decrypt(ct)
        // Poly1305 태그 검증
        let poly = try Poly1305(key: chacha.keystream().prefix(32)).authenticate(ct + aad)
        guard poly == tag else { throw EntityServerError.decryptionFailed }
        return decrypted
    }
}

public enum EntityServerError: Error {
    case invalidResponse
    case decryptionFailed
}

private extension String {
    func removingSuffix(_ suffix: String) -> String {
        hasSuffix(suffix) ? String(dropLast(suffix.count)) : self
    }
}
