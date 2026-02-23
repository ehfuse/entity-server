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
 *   ENTITY_PACKET_MAGIC_LEN=4
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
    private int     $timeout;
    private int     $magicLen;
    private bool    $requireEncryptedRequest;
    private ?string $activeTxId = null;

    public function __construct(
        ?string $baseUrl    = null,
        ?string $apiKey     = null,
        ?string $hmacSecret = null,
        ?int    $timeout    = null,
        ?int    $magicLen   = null,
        ?bool   $requireEncryptedRequest = null
    ) {
        $config = class_exists(EntityServerConfig::class) ? new EntityServerConfig() : null;

        $configBaseUrl = $config?->baseUrl ?? env('ENTITY_SERVER_URL', 'http://localhost:47200');
        $configApiKey = $config?->apiKey ?? env('ENTITY_SERVER_API_KEY', '');
        $configHmacSecret = $config?->hmacSecret ?? env('ENTITY_SERVER_HMAC_SECRET', '');
        $configTimeout = $config?->timeout ?? (int) env('ENTITY_SERVER_TIMEOUT', 10);
        $configMagicLen = $config?->magicLen ?? (int) env('ENTITY_PACKET_MAGIC_LEN', 4);
        $configRequireEncrypted = $config?->requireEncryptedRequest ?? true;

        $this->baseUrl = rtrim($baseUrl ?? (string) $configBaseUrl, '/');
        $this->apiKey = (string) ($apiKey ?? $configApiKey);
        $this->hmacSecret = (string) ($hmacSecret ?? $configHmacSecret);
        $this->timeout = (int) ($timeout ?? $configTimeout);
        $this->magicLen = (int) ($magicLen ?? $configMagicLen);
        $this->requireEncryptedRequest = (bool) ($requireEncryptedRequest ?? $configRequireEncrypted);
    }

    // ─── CRUD ────────────────────────────────────────────────────────────────

    /** 단건 조회 */
    public function get(string $entity, int $seq): array
    {
        return $this->request('GET', "/v1/entity/{$entity}/{$seq}");
    }

    /** 목록 조회 */
    public function list(string $entity, array $params = []): array
    {
        $query = http_build_query(array_merge(['page' => 1, 'limit' => 20], $params));
        return $this->request('GET', "/v1/entity/{$entity}/list?{$query}");
    }

    /** 건수 조회 */
    public function count(string $entity): array
    {
        return $this->request('GET', "/v1/entity/{$entity}/count");
    }

    /**
     * 필터 검색
     *
     * @param array $filter  예: [['field' => 'status', 'op' => 'eq', 'value' => 'active']]
     * @param array $params  예: ['page' => 1, 'limit' => 20, 'order_by' => 'name']
     */
    public function query(string $entity, array $filter = [], array $params = []): array
    {
        $query = http_build_query(array_merge(['page' => 1, 'limit' => 20], $params));
        return $this->request('POST', "/v1/entity/{$entity}/query?{$query}", $filter);
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
     * @param string|null $transactionId transStart() 로 얻은 ID (생략 시 활성 트랜잭션 자동 사용)
     */
    public function submit(string $entity, array $data, ?string $transactionId = null): array
    {
        $txId  = $transactionId ?? $this->activeTxId;
        $extra = $txId ? ['X-Transaction-ID: ' . $txId] : [];
        return $this->request('POST', "/v1/entity/{$entity}/submit", $data, $extra);
    }

    /**
     * 삭제
     * @param bool        $hard          true 이면 물리 삭제
     * @param string|null $transactionId transStart() 로 얻은 ID (생략 시 활성 트랜잭션 자동 사용)
     */
    public function delete(string $entity, int $seq, ?string $transactionId = null, bool $hard = false): array
    {
        $q     = $hard ? '?hard=true' : '';
        $txId  = $transactionId ?? $this->activeTxId;
        $extra = $txId ? ['X-Transaction-ID: ' . $txId] : [];
        return $this->request('DELETE', "/v1/entity/{$entity}/delete/{$seq}{$q}", [], $extra);
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
        $bodyJson  = empty($body) ? '' : json_encode($body, JSON_UNESCAPED_UNICODE);
        $timestamp = (string) time();
        $nonce     = $this->generateNonce();
        $signature = $this->sign($method, $path, $timestamp, $nonce, $bodyJson);

        $headers = array_merge([
            'Content-Type: application/json',
            'X-API-Key: '   . $this->apiKey,
            'X-Timestamp: ' . $timestamp,
            'X-Nonce: '     . $nonce,
            'X-Signature: ' . $signature,
        ], $extraHeaders);

        $url = $this->baseUrl . $path;
        $ch  = curl_init($url);

        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $this->timeout,
        ]);

        if ($bodyJson !== '') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $bodyJson);
        }

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?? '';
        $error    = curl_error($ch);
        curl_close($ch);

        if ($error) {
            throw new \RuntimeException("EntityServer curl error: {$error}");
        }

        // 패킷 암호화 응답: application/octet-stream → 복호화
        if (str_contains($contentType, 'application/octet-stream')) {
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
     * XChaCha20-Poly1305 패킷 복호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * 키: sha256(hmac_secret)
     *
     * ext-sodium 사용 (PHP 7.2+ 내장)
     */
    private function decryptPacket(string $data): string
    {
        $key        = hash('sha256', $this->hmacSecret, true);
        $nonce      = substr($data, $this->magicLen, 24);
        $ciphertext = substr($data, $this->magicLen + 24);

        $plaintext = sodium_crypto_aead_xchacha20poly1305_ietf_decrypt($ciphertext, '', $nonce, $key);
        if ($plaintext === false) {
            throw new \RuntimeException('Packet decryption failed: authentication tag mismatch');
        }
        return $plaintext;
    }

    /** HMAC-SHA256 서명 */
    private function sign(string $method, string $path, string $timestamp, string $nonce, string $body): string
    {
        // PATH는 쿼리스트링 포함한 전체 경로
        $payload = implode('|', [$method, $path, $timestamp, $nonce, $body]);
        return hash_hmac('sha256', $payload, $this->hmacSecret);
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
