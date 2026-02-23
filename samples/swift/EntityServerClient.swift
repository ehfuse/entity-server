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
 *       hmacSecret: "your-hmac-secret",
 *       magicLen:   4   // 서버 packet_magic_len 과 동일
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
    private let magicLen: Int
    private let session: URLSession
    private var activeTxId: String? = nil

    public init(
        baseUrl: String = "http://localhost:47200",
        apiKey: String = "",
        hmacSecret: String = "",
        magicLen: Int = 4,
        session: URLSession = .shared
    ) {
        self.baseURL = URL(string: baseUrl.removingSuffix("/"))!
        self.apiKey = apiKey
        self.hmacSecret = hmacSecret
        self.magicLen = magicLen
        self.session = session
    }

    // ─── CRUD ─────────────────────────────────────────────────────────

    public func get(entity: String, seq: Int64) async throws -> [String: Any] {
        try await request(method: "GET", path: "/v1/entity/\(entity)/\(seq)")
    }

    public func list(entity: String, page: Int = 1, limit: Int = 20) async throws -> [String: Any] {
        try await request(method: "GET", path: "/v1/entity/\(entity)/list?page=\(page)&limit=\(limit)")
    }

    public func count(entity: String) async throws -> [String: Any] {
        try await request(method: "GET", path: "/v1/entity/\(entity)/count")
    }

    public func query(entity: String, filter: [[String: Any]], page: Int = 1, limit: Int = 20) async throws -> [String: Any] {
        let body = try JSONSerialization.data(withJSONObject: filter)
        return try await request(method: "POST", path: "/v1/entity/\(entity)/query?page=\(page)&limit=\(limit)", body: body)
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

    public func submit(entity: String, data: [String: Any], transactionId: String? = nil) async throws -> [String: Any] {
        let body = try JSONSerialization.data(withJSONObject: data)
        var extra: [String: String] = [:]
        if let txId = transactionId ?? activeTxId { extra["X-Transaction-ID"] = txId }
        return try await request(method: "POST", path: "/v1/entity/\(entity)/submit", body: body, extraHeaders: extra)
    }

    public func delete(entity: String, seq: Int64, transactionId: String? = nil, hard: Bool = false) async throws -> [String: Any] {
        let q = hard ? "?hard=true" : ""
        var extra: [String: String] = [:]
        if let txId = transactionId ?? activeTxId { extra["X-Transaction-ID"] = txId }
        return try await request(method: "DELETE", path: "/v1/entity/\(entity)/delete/\(seq)\(q)", extraHeaders: extra)
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

        let bodyStr = body.map { String(data: $0, encoding: .utf8) ?? "" } ?? ""
        let timestamp = String(Int(Date().timeIntervalSince1970))
        let nonce = UUID().uuidString
        let signature = try sign(method: method, path: path, timestamp: timestamp, nonce: nonce, body: bodyStr)

        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
        req.setValue(timestamp, forHTTPHeaderField: "X-Timestamp")
        req.setValue(nonce, forHTTPHeaderField: "X-Nonce")
        req.setValue(signature, forHTTPHeaderField: "X-Signature")
        extraHeaders.forEach { req.setValue($0.value, forHTTPHeaderField: $0.key) }
        req.httpBody = body

        let (data, response) = try await session.data(for: req)
        let http = response as! HTTPURLResponse
        let contentType = http.value(forHTTPHeaderField: "Content-Type") ?? ""

        // 패킷 암호화 응답: application/octet-stream → 복호화
        if contentType.contains("application/octet-stream") {
            return try decryptPacket(data)
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw EntityServerError.invalidResponse
        }
        return json
    }

    /**
     * XChaCha20-Poly1305 패킷 복호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * 키: sha256(hmac_secret)
     */
    private func decryptPacket(_ data: Data) throws -> [String: Any] {
        let key = Array(SHA2(variant: .sha256).calculate(for: Array(hmacSecret.utf8)))
        let bytes = Array(data)
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

    /** HMAC-SHA256 서명 */
    private func sign(method: String, path: String, timestamp: String, nonce: String, body: String) throws -> String {
        let payload = [method, path, timestamp, nonce, body].joined(separator: "|")
        let mac = try HMAC(key: Array(hmacSecret.utf8), variant: .sha256).authenticate(Array(payload.utf8))
        return mac.map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - XChaCha20Poly1305 helper (CryptoSwift wrapper)
private struct XChaCha20Poly1305 {
    let key: [UInt8]
    let iv: [UInt8]
    let aad: [UInt8]

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
