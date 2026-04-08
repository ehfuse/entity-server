<?php

namespace App\Libraries;

use Config\EntityServer as EntityServerConfig;

/**
 * Entity Server 클라이언트 라이브러리 (CodeIgniter 4)
 *
 * 필요 확장: ext-sodium (PHP 7.2+ 기본 내장) — XChaCha20-Poly1305 복호화
 *
 * 설치: app/Libraries/EntityServer.php 에 배치
 *
 * 설정: app/Config/EntityServer.php 우선 (필요시 .env fallback)
 *   ENTITY_SERVER_URL=http://localhost:47200
 *   ENTITY_SERVER_API_KEY=your-api-key
 *   ENTITY_SERVER_HMAC_SECRET=your-hmac-secret

 *
 * 컨트롤러 사용법:
 *   $es = new \App\Libraries\EntityServer();
 *   $result = $es->get('account', 1);
 *   $list   = $es->list('account', ['page' => 1, 'limit' => 20]);
 *   $seq    = $es->submit('account', ['name' => '홍길동', 'email' => 'hong@example.com']);
 */
class EntityServer
{
    private string  $baseUrl;
    private string  $apiKey;
    private string  $hmacSecret;
    private string  $token = '';
    private int     $timeout;
    private bool    $requireEncryptedRequest;
    private bool    $encryptRequests;
    private bool    $packetEncryption = false;
    private ?string $activeTxId = null;

    public function __construct(
        ?string $baseUrl    = null,
        ?string $apiKey     = null,
        ?string $hmacSecret = null,
        ?string $token      = null,
        ?int    $timeout    = null,
        ?bool   $requireEncryptedRequest = null,
        ?bool   $encryptRequests = null
    ) {
        $config = class_exists(EntityServerConfig::class) ? new EntityServerConfig() : null;

        $configBaseUrl = $config?->baseUrl ?? env('ENTITY_SERVER_URL', 'http://localhost:47200');
        $configApiKey = $config?->apiKey ?? env('ENTITY_SERVER_API_KEY', '');
        $configHmacSecret = $config?->hmacSecret ?? env('ENTITY_SERVER_HMAC_SECRET', '');
        $configToken = $config?->token ?? env('ENTITY_SERVER_TOKEN', '');
        $configTimeout = $config?->timeout ?? (int) env('ENTITY_SERVER_TIMEOUT', 10);
        $configRequireEncrypted = $config?->requireEncryptedRequest ?? true;
        $configEncryptRequests  = $config?->encryptRequests ?? false;

        $this->baseUrl = rtrim($baseUrl ?? (string) $configBaseUrl, '/');
        $this->apiKey = (string) ($apiKey ?? $configApiKey);
        $this->hmacSecret = (string) ($hmacSecret ?? $configHmacSecret);
        $this->token = (string) ($token ?? $configToken);
        $this->timeout = (int) ($timeout ?? $configTimeout);
        $this->requireEncryptedRequest = (bool) ($requireEncryptedRequest ?? $configRequireEncrypted);
        $this->encryptRequests = (bool) ($encryptRequests ?? $configEncryptRequests);
    }

    /** JWT Bearer 토큰을 설정합니다. HMAC 모드와 배타적으로 사용합니다. */
    public function setToken(string $token): void
    {
        $this->token = $token;
    }

    // ─── CRUD ────────────────────────────────────────────────────────────────

    /**     * 서버 헬스 체크를 수행하고 패킷 암호화 활성 여부를 자동으로 감지합니다.
     * 서버가 packet_encryption: true 를 응답하면 이후 모든 요청에 암호화가 자동 적용됩니다.
     */
    public function checkHealth(): array
    {
        $ch = curl_init($this->baseUrl . '/v1/health');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $this->timeout,
        ]);
        $response = curl_exec($ch);
        curl_close($ch);
        $decoded = json_decode($response, true) ?? [];
        if (!empty($decoded['packet_encryption'])) {
            $this->packetEncryption = true;
        }
        return $decoded;
    }

    /**     * 단건 조회
     *
     * @param bool $skipHooks true 이면 after_get 훅 미실행
     */
    public function get(string $entity, int $seq, bool $skipHooks = false): array
    {
        $q = $skipHooks ? '?skipHooks=true' : '';
        return $this->request('GET', "/v1/entity/{$entity}/{$seq}{$q}");
    }

    /**
     * 조건으로 단건 조회 (POST + conditions body)
     *
     * @param array $conditions 필터 조건. index/hash/unique 필드만 사용 가능.
     *                          예: ['email' => 'user@example.com']
     * @param bool  $skipHooks  true 이면 after_find 훅 미실행
     */
    public function find(string $entity, array $conditions, bool $skipHooks = false): array
    {
        $q = $skipHooks ? '?skipHooks=true' : '';
        return $this->request('POST', "/v1/entity/{$entity}/find{$q}", $conditions);
    }

    /**
     * 목록 조회
     *
     * @param array $params     페이지/정렬 파라미터 (page, limit, orderBy, orderDir, fields)
     * @param array $conditions 필터 조건 POST body. index/hash/unique 필드만 사용 가능.
     *                          예: ['status' => 'active']
     *                          fields 예: ['*'] 시 전체 필드 반환, 미지정 시 인덱스 필드만 반환 (기본, 가장 빠름)
     *                          fields 예: ['name','email'] 또는 미지정
     */
    public function list(string $entity, array $params = [], array $conditions = []): array
    {
        $queryParams = array_merge(['page' => 1, 'limit' => 20], $params);

        // orderBy + orderDir → orderBy 앞에 - 접두사 방식으로 변환
        if (isset($queryParams['orderDir'])) {
            $dir = strtoupper((string) $queryParams['orderDir']);
            $orderBy = (string) ($queryParams['orderBy'] ?? '');
            if ($dir === 'DESC' && $orderBy !== '') {
                $queryParams['orderBy'] = '-' . ltrim($orderBy, '-');
            }
            unset($queryParams['orderDir']);
        }

        // fields 배열 → 쉼표 구분 문자열
        if (isset($queryParams['fields']) && is_array($queryParams['fields'])) {
            $queryParams['fields'] = implode(',', $queryParams['fields']);
        }

        $query = http_build_query($queryParams);
        return $this->request('POST', "/v1/entity/{$entity}/list?{$query}", $conditions);
    }

    /**
     * 건수 조회
     *
     * @param array $conditions 필터 조건 (list()와 동일 규칙)
     */
    public function count(string $entity, array $conditions = []): array
    {
        return $this->request('POST', "/v1/entity/{$entity}/count", $conditions);
    }

    /**
     * 커스텀 SQL 조회 (SELECT 전용, 인덱스 테이블만)
     *
     * - SELECT 쿼리만 허용 (INSERT/UPDATE/DELETE 불가)
     * - 인덱스 테이블(`entity_idx_*`)만 접근 가능. SELECT * 불가
     * - JOIN 지원. 최대 반환 건수 1000
     * - 사용자 입력은 반드시 params 로 바인딩 (SQL Injection 방지)
     *
     * @param string   $entity  URL 라우트용 기본 엔티티명
     * @param string   $sql     SELECT SQL
     * @param array    $params  ? 플레이스홀더 바인딩 값
     * @param int|null $limit   최대 반환 건수 (최대 1000)
     *
     * 예:
     *   $es->query('order',
     *       'SELECT o.seq, o.status, u.name FROM order o JOIN account u ON u.data_seq = o.account_seq WHERE o.status = ?',
     *       ['pending'], 100);
     */
    public function query(string $entity, string $sql, array $params = [], ?int $limit = null): array
    {
        $body = ['sql' => $sql, 'params' => $params];
        if ($limit !== null) {
            $body['limit'] = $limit;
        }
        return $this->request('POST', "/v1/entity/{$entity}/query", $body);
    }

    /**
     * 트랜잭션 시작 — 서버에 큐를 등록하고 txId 를 저장합니다.
     * 이후 submit / delete 가 실제 실행되지 않고 서버 큐에 쌓입니다.
     * transCommit() 시 한 번에 DB 트랜잭션으로 실행됩니다.
     */
    public function transStart(): string
    {
        $result = $this->request('POST', '/v1/transaction/start');
        $this->activeTxId = $result['transaction_id'];
        return $this->activeTxId;
    }

    /**
     * 트랜잭션 전체 롤백
     * $transactionId 생략 시 transStart() 로 시작한 활성 트랜잭션을 롤백합니다.
     */
    public function transRollback(?string $transactionId = null): array
    {
        $txId = $transactionId ?? $this->activeTxId;
        if ($txId === null) {
            throw new \RuntimeException('No active transaction. Call transStart() first.');
        }
        $this->activeTxId = null;
        return $this->request('POST', "/v1/transaction/rollback/{$txId}");
    }

    /**
     * 트랜잭션 커밋 — 큐에 쌓인 모든 작업을 단일 DB 트랜잭션으로 일괄 실행합니다.
     * 하나라도 실패하면 전체가 ROLLBACK 됩니다.
     */
    public function transCommit(): array
    {
        $txId = $this->activeTxId;
        if ($txId === null) {
            throw new \RuntimeException('No active transaction. Call transStart() first.');
        }
        $this->activeTxId = null;
        return $this->request('POST', "/v1/transaction/commit/{$txId}");
    }

    /**
     * 생성 또는 수정
     * - body에 'seq' 포함 → 수정
     * - body에 'seq' 없음  → 생성 (seq 반환)
     * - unique 필드 기준 중복 시 자동 UPDATE (upsert)
     *
     * @param string|null $transactionId transStart() 로 얻은 ID (생략 시 활성 트랜잭션 자동 사용)
     * @param bool        $skipHooks     true 이면 before/after_insert, before/after_update 훅 미실행
     */
    public function submit(string $entity, array $data, ?string $transactionId = null, bool $skipHooks = false): array
    {
        $txId  = $transactionId ?? $this->activeTxId;
        $extra = $txId ? ['X-Transaction-ID: ' . $txId] : [];
        $q     = $skipHooks ? '?skipHooks=true' : '';
        return $this->request('POST', "/v1/entity/{$entity}/submit{$q}", $data, $extra);
    }

    /**
     * 삭제 (서버는 POST /delete/:seq 로만 처리)
     *
     * @param bool        $hard          true 이면 하드(물리) 삭제. false(기본) 이면 소프트 삭제 (rollback 으로 복원 가능)
     * @param string|null $transactionId transStart() 로 얻은 ID (생략 시 활성 트랜잭션 자동 사용)
     * @param bool        $skipHooks     true 이면 before/after_delete 훅 미실행
     */
    public function delete(string $entity, int $seq, ?string $transactionId = null, bool $hard = false, bool $skipHooks = false): array
    {
        $queryParams = [];
        if ($hard) {
            $queryParams[] = 'hard=true';
        }
        if ($skipHooks) {
            $queryParams[] = 'skipHooks=true';
        }
        $q     = $queryParams ? '?' . implode('&', $queryParams) : '';
        $txId  = $transactionId ?? $this->activeTxId;
        $extra = $txId ? ['X-Transaction-ID: ' . $txId] : [];
        return $this->request('POST', "/v1/entity/{$entity}/delete/{$seq}{$q}", [], $extra);
    }

    /** 변경 이력 조회 */
    public function history(string $entity, int $seq, int $page = 1, int $limit = 50): array
    {
        return $this->request('GET', "/v1/entity/{$entity}/history/{$seq}?page={$page}&limit={$limit}");
    }

    /** 트랜잭션 롤백 */
    public function rollback(string $entity, int $historySeq): array
    {
        return $this->request('POST', "/v1/entity/{$entity}/rollback/{$historySeq}");
    }

    /**
     * 푸시 발송 트리거 엔티티에 submit합니다.
     */
    public function push(string $pushEntity, array $payload, ?string $transactionId = null): array
    {
        return $this->submit($pushEntity, $payload, $transactionId);
    }

    /**
     * push_log 목록 조회 헬퍼
     */
    public function pushLogList(array $params = []): array
    {
        return $this->list('push_log', $params);
    }

    /**
     * 디바이스 등록/갱신 헬퍼 (push_token 단일 필드)
     *
     * - 기본 대상 엔티티: account_device
     * - 신규 등록: seq 미전달
     * - 기존 레코드 갱신: options['seq'] 전달
     *
     * @param int         $accountSeq    계정 seq
     * @param string      $deviceId      디바이스 고유 ID (account_device.id)
     * @param string      $pushToken     푸시 디바이스 토큰
     * @param array       $options       추가 필드 (예: platform, device_type, browser, push_enabled, seq)
     * @param string|null $transactionId transStart()로 얻은 트랜잭션 ID
     */
    public function registerPushDevice(
        int $accountSeq,
        string $deviceId,
        string $pushToken,
        array $options = [],
        ?string $transactionId = null
    ): array {
        $payload = array_merge([
            'id' => $deviceId,
            'account_seq' => $accountSeq,
            'push_token' => $pushToken,
            'push_enabled' => true,
        ], $options);

        return $this->submit('account_device', $payload, $transactionId);
    }

    /**
     * account_device.seq 기준으로 push_token 갱신
     */
    public function updatePushDeviceToken(
        int $deviceSeq,
        string $pushToken,
        bool $pushEnabled = true,
        ?string $transactionId = null
    ): array {
        return $this->submit('account_device', [
            'seq' => $deviceSeq,
            'push_token' => $pushToken,
            'push_enabled' => $pushEnabled,
        ], $transactionId);
    }

    /**
     * account_device.seq 기준으로 푸시 수신 비활성화
     */
    public function disablePushDevice(
        int $deviceSeq,
        ?string $transactionId = null
    ): array {
        return $this->submit('account_device', [
            'seq' => $deviceSeq,
            'push_enabled' => false,
        ], $transactionId);
    }

    /**
     * CI4 IncomingRequest에서 암호화 패킷을 읽어 JSON 배열로 복호화합니다.
     *
     * @param object $request CodeIgniter\HTTP\IncomingRequest
     * @param bool   $requireEncrypted true면 평문 JSON 요청을 거부합니다.
     */
    public function readRequestBody(object $request, ?bool $requireEncrypted = null): array
    {
        $requireEncrypted = $requireEncrypted ?? $this->requireEncryptedRequest;

        $contentType = '';
        if (method_exists($request, 'getHeaderLine')) {
            $contentType = strtolower((string) $request->getHeaderLine('Content-Type'));
        }

        $rawBody = '';
        if (method_exists($request, 'getBody')) {
            $rawBody = (string) $request->getBody();
        }

        $isEncryptedPacket = str_contains($contentType, 'application/octet-stream');

        if ($requireEncrypted && !$isEncryptedPacket) {
            throw new \RuntimeException('Encrypted request required: Content-Type must be application/octet-stream');
        }

        if ($isEncryptedPacket) {
            if ($rawBody === '') {
                throw new \RuntimeException('Encrypted request body is empty');
            }

            $jsonStr = $this->decryptPacket($rawBody);
            $decoded = json_decode($jsonStr, true);
            if (!is_array($decoded)) {
                throw new \RuntimeException('Invalid encrypted JSON payload');
            }
            return $decoded;
        }

        // 선택적으로 평문 허용할 때만 fallback
        if ($rawBody === '') {
            return [];
        }
        $decoded = json_decode($rawBody, true);
        if (!is_array($decoded)) {
            throw new \RuntimeException('Invalid JSON payload');
        }
        return $decoded;
    }

    // ─── 내부 ─────────────────────────────────────────────────────────────────

    private function request(string $method, string $path, array $body = [], array $extraHeaders = []): array
    {
        // 요청 바디 결정: encryptRequests 시 POST 바디를 암호화
        $bodyJson    = empty($body) ? '' : json_encode($body, JSON_UNESCAPED_UNICODE);
        $bodyData    = $bodyJson;
        $contentType = 'application/json';
        if (($this->encryptRequests || $this->packetEncryption) && $bodyJson !== '') {
            $bodyData    = $this->encryptPacket($bodyJson);
            $contentType = 'application/octet-stream';
        }

        $isHmacMode = $this->apiKey !== '' && $this->hmacSecret !== '';

        $headers = ["Content-Type: {$contentType}"];
        if ($isHmacMode) {
            $timestamp = (string) time();
            $nonce     = $this->generateNonce();
            $signature = $this->sign($method, $path, $timestamp, $nonce, $bodyData);
            $headers = array_merge($headers, [
                'X-API-Key: '   . $this->apiKey,
                'X-Timestamp: ' . $timestamp,
                'X-Nonce: '     . $nonce,
                'X-Signature: ' . $signature,
            ]);
        } elseif ($this->token !== '') {
            $headers[] = 'Authorization: Bearer ' . $this->token;
        }
        $headers = array_merge($headers, $extraHeaders);

        $url = $this->baseUrl . $path;
        $ch  = curl_init($url);

        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $this->timeout,
        ]);

        if ($bodyData !== '') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $bodyData);
        }

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $respContentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?? '';
        $error    = curl_error($ch);
        curl_close($ch);

        if ($error) {
            throw new \RuntimeException("EntityServer curl error: {$error}");
        }

        // 패킷 암호화 응답: application/octet-stream → 복호화
        if (str_contains($respContentType, 'application/octet-stream')) {
            $jsonStr = $this->decryptPacket($response);
            $decoded = json_decode($jsonStr, true);
        } else {
            $decoded = json_decode($response, true);
        }

        if ($decoded === null) {
            throw new \RuntimeException("EntityServer invalid JSON response (HTTP {$httpCode})");
        }

        if (!($decoded['ok'] ?? false)) {
            throw new \RuntimeException("EntityServer error: " . ($decoded['message'] ?? 'Unknown') . " (HTTP {$httpCode})");
        }

        return $decoded;
    }

    /**
     * 패킷 암호화 키를 유도합니다.
     * - HMAC 모드: HKDF-SHA256(hmac_secret, "entity-server:packet-encryption")
     * - JWT  모드: SHA256(token)
     */
    private function derivePacketKey(): string
    {
        if ($this->token !== '' && $this->hmacSecret === '') {
            return hash('sha256', $this->token, true);
        }
        $salt = 'entity-server:hkdf:v1';
        $info = 'entity-server:packet-encryption';
        // HKDF-Extract: PRK = HMAC-SHA256(salt, IKM)
        $prk  = hash_hmac('sha256', $this->hmacSecret, $salt, true);
        // HKDF-Expand(PRK, info, 32): T(1) = HMAC-SHA256(PRK, info || 0x01)
        return substr(hash_hmac('sha256', $info . chr(1), $prk, true), 0, 32);
    }

    /**
     * XChaCha20-Poly1305 패킷 암호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     */
    private function encryptPacket(string $plaintext): string
    {
        $key   = $this->derivePacketKey();
        $magicLen = 2 + (ord($key[31]) % 14);
        $magic = random_bytes($magicLen);
        $nonce = random_bytes(SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES); // 24
        $ct    = sodium_crypto_aead_xchacha20poly1305_ietf_encrypt($plaintext, '', $nonce, $key);
        return $magic . $nonce . $ct;
    }

    /**
     * XChaCha20-Poly1305 패킷 복호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * 키: HKDF-SHA256(hmac_secret, "entity-server:packet-encryption")
     *
     * ext-sodium 사용 (PHP 7.2+ 내장)
     */
    private function decryptPacket(string $data): string
    {
        $key        = $this->derivePacketKey();
        $magicLen   = 2 + (ord($key[31]) % 14);
        $nonce      = substr($data, $magicLen, 24);
        $ciphertext = substr($data, $magicLen + 24);

        $plaintext = sodium_crypto_aead_xchacha20poly1305_ietf_decrypt($ciphertext, '', $nonce, $key);
        if ($plaintext === false) {
            throw new \RuntimeException('Packet decryption failed: authentication tag mismatch');
        }
        return $plaintext;
    }

    /**
     * HMAC-SHA256 서명. $body 는 JSON 스트링 또는 바이너리 암호화 페이로드 모두 지원합니다.
     * prefix = "METHOD|path|timestamp|nonce|" 뒤에 $body 를 바로 이어 붙여 서명합니다.
     */
    private function sign(string $method, string $path, string $timestamp, string $nonce, string $body): string
    {
        $prefix = implode('|', [$method, $path, $timestamp, $nonce]) . '|';
        return hash_hmac('sha256', $prefix . $body, $this->hmacSecret);
    }

    private function generateNonce(): string
    {
        return sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff)
        );
    }
}
