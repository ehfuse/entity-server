/// Entity Server 클라이언트 (Flutter / Dart)
///
/// 의존성 (pubspec.yaml):
///   dependencies:
///     http: ^1.2.1
///     cryptography: ^2.7.0
///     uuid: ^4.4.0
///
/// HMAC API Key 인증 방식 사용 예:
/// ```dart
/// final client = EntityServerClient(
///   baseUrl:    'http://your-server:47200',
///   apiKey:     'your-api-key',
///   hmacSecret: 'your-hmac-secret',
/// );
/// final result = await client.list('product');
/// ```
///
/// 트랜잭션 사용 예:
/// ```dart
/// await client.transStart();
/// try {
///   final orderRef  = await client.submit('order', {'user_seq': 1, 'total': 9900});        // seq: "\$tx.0"
///   await client.submit('order_item', {'order_seq': orderRef['seq'], 'item_seq': 5});       // "\$tx.0" 자동 치환
///   final result    = await client.transCommit();
///   final orderSeq  = (result['results'] as List)[0]['seq'];                                // 실제 seq
/// } catch (e) {
///   await client.transRollback();
/// }
/// ```

import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

class EntityServerClient {
  final String baseUrl;
  final String apiKey;
  final String hmacSecret;
  String token;
  final int magicLen;
  /// true 이면 POST 요청 바디를 XChaCha20-Poly1305로 암호화합니다.
  final bool encryptRequests;

  final _uuid = const Uuid();
  String? _activeTxId;
  bool _packetEncryption = false;

  EntityServerClient({
    this.baseUrl = 'http://localhost:47200',
    this.apiKey = '',
    this.hmacSecret = '',
    this.token = '',
    this.encryptRequests = false,
  });

  /// JWT Bearer 토큰을 설정합니다. HMAC 모드와 배타적으로 사용합니다.
  void setToken(String newToken) => token = newToken;

  // ─── Health Check ──────────────────────────────────────────────

  /// 서버 헬스 체크를 수행하고 패킷 암호화 활성 여부를 자동으로 감지합니다.
  /// 서버가 packet_encryption: true 를 응답하면 이후 모든 요청에 암호화가 자동 적용됩니다.
  Future<Map<String, dynamic>> checkHealth() async {
    final uri = Uri.parse('${baseUrl.replaceAll(RegExp(r'/$'), '')}/v1/health');
    final res = await http.get(uri);
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (data['packet_encryption'] == true) {
      _packetEncryption = true;
    }
    return data;
  }

  // ─── CRUD ─────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> get(String entity, int seq, {bool skipHooks = false}) =>
      _request('GET', '/v1/entity/$entity/$seq${skipHooks ? "?skipHooks=true" : ""}');

  /// 조건으로 단건 조회 (POST + conditions body)
  ///
  /// [conditions] 는 index/hash/unique 필드에만 사용 가능합니다.
  /// 조건에 맞는 행이 없으면 예외가 발생합니다 (404).
  Future<Map<String, dynamic>> find(
    String entity,
    Map<String, dynamic> conditions, {
    bool skipHooks = false,
  }) =>
      _request('POST', '/v1/entity/$entity/find${skipHooks ? "?skipHooks=true" : ""}',
          body: conditions);

  /// 목록 조회 (POST + conditions body)
  ///
  /// [fields] 를 미지정하면 기본적으로 인덱스 필드만 반환합니다 (가장 빠름).
  /// 전체 필드 반환이 필요하면 `['*']` 를 지정하세요.
  /// [conditions] 는 index/hash/unique 필드에만 사용 가능합니다.
  Future<Map<String, dynamic>> list(
    String entity, {
    int page = 1,
    int limit = 20,
    String? orderBy,
    List<String>? fields,
    Map<String, dynamic>? conditions,
  }) {
    final qParts = <String>['page=$page', 'limit=$limit'];
    if (orderBy != null) qParts.add('order_by=$orderBy');
    if (fields != null && fields.isNotEmpty) qParts.add('fields=${fields.join(",")}');
    return _request('POST', '/v1/entity/$entity/list?${qParts.join("&")}',
        body: conditions ?? {});
  }

  /// 건수 조회
  Future<Map<String, dynamic>> count(String entity, {Map<String, dynamic>? conditions}) =>
      _request('POST', '/v1/entity/$entity/count', body: conditions ?? {});

  /// 커스텀 SQL 조회 (SELECT 전용, 인덱스 테이블만, JOIN 지원)
  ///
  /// [sql] 은 SELECT 쿼리만 허용합니다. 사용자 입력은 반드시 [params] 로 바인딩하세요.
  Future<Map<String, dynamic>> query(
    String entity,
    String sql, {
    List<dynamic>? params,
    int? limit,
  }) {
    final body = <String, dynamic>{'sql': sql, 'params': params ?? []};
    if (limit != null) body['limit'] = limit;
    return _request('POST', '/v1/entity/$entity/query', body: body);
  }

  /// 트랜잭션 시작 — 서버에 트랜잭션 큐를 등록하고 transaction_id 를 반환합니다.
  /// 이후 submit / delete 가 서버 큐에 쌓이고 transCommit() 시 일괄 처리됩니다.
  Future<String> transStart() async {
    final res = await _request('POST', '/v1/transaction/start');
    _activeTxId = res['transaction_id'] as String;
    return _activeTxId!;
  }

  /// 트랜잭션 전체 롤백
  /// [transactionId] 생략 시 transStart() 로 시작한 활성 트랜잭션을 롤백합니다.
  Future<Map<String, dynamic>> transRollback([String? transactionId]) {
    final txId = transactionId ?? _activeTxId;
    if (txId == null) throw StateError('No active transaction. Call transStart() first.');
    _activeTxId = null;
    return _request('POST', '/v1/transaction/rollback/$txId');
  }

  /// 트랜잭션 커밋 — 서버 큐에 쌓인 작업을 단일 DB 트랜잭션으로 일괄 처리합니다.
  /// [transactionId] 생략 시 transStart() 로 시작한 활성 트랜잭션을 사용합니다.
  Future<Map<String, dynamic>> transCommit([String? transactionId]) {
    final txId = transactionId ?? _activeTxId;
    if (txId == null) throw StateError('No active transaction. Call transStart() first.');
    _activeTxId = null;
    return _request('POST', '/v1/transaction/commit/$txId');
  }

  Future<Map<String, dynamic>> submit(
    String entity,
    Map<String, dynamic> data, {
    String? transactionId,
    bool skipHooks = false,
  }) {
    final txId = transactionId ?? _activeTxId;
    final q = skipHooks ? '?skipHooks=true' : '';
    return _request('POST', '/v1/entity/$entity/submit$q',
        body: data,
        extraHeaders: txId != null ? {'X-Transaction-ID': txId} : null);
  }

  /// 삭제. 서버는 POST /delete/:seq 로만 처리합니다.
  Future<Map<String, dynamic>> delete(String entity, int seq,
      {String? transactionId, bool hard = false, bool skipHooks = false}) {
    final qParts = <String>[];
    if (hard) qParts.add('hard=true');
    if (skipHooks) qParts.add('skipHooks=true');
    final q = qParts.isNotEmpty ? '?${qParts.join("&")}' : '';
    final txId = transactionId ?? _activeTxId;
    return _request('POST', '/v1/entity/$entity/delete/$seq$q',
        extraHeaders: txId != null ? {'X-Transaction-ID': txId} : null);
  }

  Future<Map<String, dynamic>> history(String entity, int seq,
          {int page = 1, int limit = 50}) =>
      _request('GET', '/v1/entity/$entity/history/$seq?page=$page&limit=$limit');

  Future<Map<String, dynamic>> rollback(String entity, int historySeq) =>
      _request('POST', '/v1/entity/$entity/rollback/$historySeq');

  /// 푸시 발송 트리거 엔티티에 submit합니다.
  Future<Map<String, dynamic>> push(
    String pushEntity,
    Map<String, dynamic> payload, {
    String? transactionId,
  }) =>
      submit(pushEntity, payload, transactionId: transactionId);

  /// push_log 목록 조회 헬퍼
  Future<Map<String, dynamic>> pushLogList({int page = 1, int limit = 20}) =>
      list('push_log', page: page, limit: limit);

  /// account_device 디바이스 등록/갱신 헬퍼 (push_token 단일 필드)
  Future<Map<String, dynamic>> registerPushDevice(
    int accountSeq,
    String deviceId,
    String pushToken, {
    String? platform,
    String? deviceType,
    String? browser,
    String? browserVersion,
    bool pushEnabled = true,
    String? transactionId,
  }) {
    final payload = <String, dynamic>{
      'id': deviceId,
      'account_seq': accountSeq,
      'push_token': pushToken,
      'push_enabled': pushEnabled,
      if (platform != null && platform.isNotEmpty) 'platform': platform,
      if (deviceType != null && deviceType.isNotEmpty)
        'device_type': deviceType,
      if (browser != null && browser.isNotEmpty) 'browser': browser,
      if (browserVersion != null && browserVersion.isNotEmpty)
        'browser_version': browserVersion,
    };
    return submit('account_device', payload, transactionId: transactionId);
  }

  /// account_device.seq 기준 push_token 갱신 헬퍼
  Future<Map<String, dynamic>> updatePushDeviceToken(
    int deviceSeq,
    String pushToken, {
    bool pushEnabled = true,
    String? transactionId,
  }) {
    return submit('account_device', {
      'seq': deviceSeq,
      'push_token': pushToken,
      'push_enabled': pushEnabled,
    }, transactionId: transactionId);
  }

  /// account_device.seq 기준 푸시 수신 비활성화 헬퍼
  Future<Map<String, dynamic>> disablePushDevice(
    int deviceSeq, {
    String? transactionId,
  }) {
    return submit('account_device', {
      'seq': deviceSeq,
      'push_enabled': false,
    }, transactionId: transactionId);
  }

  /// 요청 본문을 읽어 JSON으로 반환합니다.
  /// - application/octet-stream: 암호 패킷 복호화
  /// - 그 외: 평문 JSON 파싱
  Future<Map<String, dynamic>> readRequestBody(
    Uint8List rawBody, {
    String contentType = 'application/json',
    bool requireEncrypted = false,
  }) async {
    final lowered = contentType.toLowerCase();
    final isEncrypted = lowered.contains('application/octet-stream');

    if (requireEncrypted && !isEncrypted) {
      throw Exception(
          'Encrypted request required: Content-Type must be application/octet-stream');
    }

    if (isEncrypted) {
      if (rawBody.isEmpty) {
        throw Exception('Encrypted request body is empty');
      }
      return await _decryptPacket(rawBody);
    }

    if (rawBody.isEmpty) return {};
    return jsonDecode(utf8.decode(rawBody)) as Map<String, dynamic>;
  }

  // ─── 내부 ─────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Object? body,
    Map<String, String>? extraHeaders,
  }) async {
    // 요청 바디 결정: encryptRequests 시 POST 바디를 암호화
    Uint8List? bodyBytes;
    String contentType = 'application/json';
    if (body != null) {
      final jsonBytes = Uint8List.fromList(utf8.encode(jsonEncode(body)));
      if (encryptRequests || _packetEncryption) {
        bodyBytes   = await _encryptPacket(jsonBytes);
        contentType = 'application/octet-stream';
      } else {
        bodyBytes = jsonBytes;
      }
    }

    final isHmacMode = apiKey.isNotEmpty && hmacSecret.isNotEmpty;

    final uri = Uri.parse('${baseUrl.replaceAll(RegExp(r'/$'), '')}$path');
    final headers = <String, String>{'Content-Type': contentType};

    if (isHmacMode) {
      final timestamp =
          (DateTime.now().millisecondsSinceEpoch ~/ 1000).toString();
      final nonce = _uuid.v4();
      final signature = await _sign(method, path, timestamp, nonce, bodyBytes ?? Uint8List(0));
      headers['X-API-Key']   = apiKey;
      headers['X-Timestamp'] = timestamp;
      headers['X-Nonce']     = nonce;
      headers['X-Signature'] = signature;
    } else if (token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    if (extraHeaders != null) headers.addAll(extraHeaders);

    final http.Response res;
    switch (method.toUpperCase()) {
      case 'GET':
        res = await http.get(uri, headers: headers);
        break;
      case 'DELETE':
        res = await http.delete(uri, headers: headers,
            body: bodyBytes != null && bodyBytes.isNotEmpty ? bodyBytes : null);
        break;
      default:
        res = await http.post(uri, headers: headers,
            body: bodyBytes != null && bodyBytes.isNotEmpty ? bodyBytes : null);
    }

    final ct = res.headers['content-type'] ?? '';

    // 패킷 암호화 응답: application/octet-stream → 복호화
    if (ct.contains('application/octet-stream')) {
      return await _decryptPacket(res.bodyBytes);
    }

    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (data['ok'] != true) {
      throw Exception('EntityServer error: \${data['message']} (HTTP \${res.statusCode})');
    }
    return data;
  }

  /// 패킷 암호화 키를 유도합니다.
  /// - HMAC 모드: HKDF-SHA256(hmac_secret, "entity-server:packet-encryption")
  /// - JWT  모드: SHA256(token)
  Future<Uint8List> _derivePacketKey() async {
    if (token.isNotEmpty && hmacSecret.isEmpty) {
      final sha = Sha256();
      final hash = await sha.hash(utf8.encode(token));
      return Uint8List.fromList(hash.bytes);
    }
    final hkdf = Hkdf(hmac: Hmac.sha256(), outputLength: 32);
    final output = await hkdf.deriveKey(
      secretKey: SecretKey(utf8.encode(hmacSecret)),
      nonce: utf8.encode('entity-server:hkdf:v1'),
      info: utf8.encode('entity-server:packet-encryption'),
    );
    return Uint8List.fromList(await output.extractBytes());
  }

  static Uint8List _randomBytes(int count) {
    final rng = Random.secure();
    return Uint8List.fromList(List.generate(count, (_) => rng.nextInt(256)));
  }

  /// XChaCha20-Poly1305 패킷 암호화
  /// 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
  /// magicLen: 2 + keyBytes[31] % 14
  Future<Uint8List> _encryptPacket(Uint8List plaintext) async {
    final keyBytes = await _derivePacketKey();
    final key   = SecretKey(keyBytes);
    final magicLen = 2 + keyBytes[31] % 14;
    final magic = _randomBytes(magicLen);
    final nonce = _randomBytes(24);

    final algorithm = Xchacha20.poly1305Aead();
    final secretBox = await algorithm.encrypt(plaintext, secretKey: key, nonce: nonce);
    // 포맷: ciphertext + mac(16)
    final cipherBytes = Uint8List.fromList([
      ...secretBox.cipherText,
      ...secretBox.mac.bytes,
    ]);
    return Uint8List.fromList([...magic, ...nonce, ...cipherBytes]);
  }

  /// XChaCha20-Poly1305 패킷 복호화
  /// 포맷: [magic:magicLen][nonce:24][ciphertext+tag:...]
  /// 키: HKDF-SHA256(hmac_secret, "entity-server:packet-encryption")
  Future<Map<String, dynamic>> _decryptPacket(Uint8List data) async {
    final keyBytes = await _derivePacketKey();
    final key = SecretKey(keyBytes);
    final magicLen = 2 + keyBytes[31] % 14;
    final nonce = data.sublist(magicLen, magicLen + 24);
    final ciphertextWithMac = data.sublist(magicLen + 24);

    final algorithm = Xchacha20.poly1305Aead();
    final secretBox = SecretBox(
      ciphertextWithMac.sublist(0, ciphertextWithMac.length - 16),
      nonce: nonce,
      mac: Mac(ciphertextWithMac.sublist(ciphertextWithMac.length - 16)),
    );

    final plaintext = await algorithm.decrypt(secretBox, secretKey: key);
    return jsonDecode(utf8.decode(plaintext)) as Map<String, dynamic>;
  }

  /// HMAC-SHA256 서명. bodyBytes 는 JSON 또는 암호화된 바이너리 모두 지원합니다.
  Future<String> _sign(
    String method,
    String path,
    String timestamp,
    String nonce,
    Uint8List bodyBytes,
  ) async {
    final algorithm = Hmac.sha256();
    final secretKey = SecretKey(utf8.encode(hmacSecret));
    final prefix    = utf8.encode('\$method|\$path|\$timestamp|\$nonce|');
    final mac = await algorithm.calculateMac(
      Uint8List.fromList([...prefix, ...bodyBytes]),
      secretKey: secretKey,
    );
    return mac.bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }
}
