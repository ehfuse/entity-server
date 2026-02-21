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
///   magicLen:   4,   // 서버 packet_magic_len 과 동일
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
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

class EntityServerClient {
  final String baseUrl;
  final String apiKey;
  final String hmacSecret;
  final int magicLen;

  final _uuid = const Uuid();
  String? _activeTxId;

  EntityServerClient({
    this.baseUrl = 'http://localhost:47200',
    this.apiKey = '',
    this.hmacSecret = '',
    this.magicLen = 4,
  });

  // ─── CRUD ─────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> get(String entity, int seq) =>
      _request('GET', '/v1/entity/$entity/$seq');

  Future<Map<String, dynamic>> list(String entity, {int page = 1, int limit = 20}) =>
      _request('GET', '/v1/entity/$entity/list?page=$page&limit=$limit');

  Future<Map<String, dynamic>> count(String entity) =>
      _request('GET', '/v1/entity/$entity/count');

  Future<Map<String, dynamic>> query(
    String entity,
    List<Map<String, dynamic>> filter, {
    int page = 1,
    int limit = 20,
  }) =>
      _request('POST', '/v1/entity/$entity/query?page=$page&limit=$limit',
          body: filter);

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
  }) {
    final txId = transactionId ?? _activeTxId;
    return _request('POST', '/v1/entity/$entity/submit',
        body: data,
        extraHeaders: txId != null ? {'X-Transaction-ID': txId} : null);
  }

  Future<Map<String, dynamic>> delete(String entity, int seq,
      {String? transactionId, bool hard = false}) {
    final q = hard ? '?hard=true' : '';
    final txId = transactionId ?? _activeTxId;
    return _request('DELETE', '/v1/entity/$entity/delete/$seq$q',
        extraHeaders: txId != null ? {'X-Transaction-ID': txId} : null);
  }

  Future<Map<String, dynamic>> history(String entity, int seq,
          {int page = 1, int limit = 50}) =>
      _request('GET', '/v1/entity/$entity/history/$seq?page=$page&limit=$limit');

  Future<Map<String, dynamic>> rollback(String entity, int historySeq) =>
      _request('POST', '/v1/entity/$entity/rollback/$historySeq');

  // ─── 내부 ─────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Object? body,
    Map<String, String>? extraHeaders,
  }) async {
    final bodyStr = body != null ? jsonEncode(body) : '';
    final timestamp =
        (DateTime.now().millisecondsSinceEpoch ~/ 1000).toString();
    final nonce = _uuid.v4();
    final signature = await _sign(method, path, timestamp, nonce, bodyStr);

    final uri = Uri.parse('${baseUrl.replaceAll(RegExp(r'/$'), '')}$path');
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature,
      if (extraHeaders != null) ...extraHeaders,
    };

    final http.Response res;
    switch (method.toUpperCase()) {
      case 'GET':
        res = await http.get(uri, headers: headers);
        break;
      case 'DELETE':
        res = await http.delete(uri, headers: headers,
            body: bodyStr.isNotEmpty ? bodyStr : null);
        break;
      default:
        res = await http.post(uri, headers: headers,
            body: bodyStr.isNotEmpty ? bodyStr : null);
    }

    final contentType = res.headers['content-type'] ?? '';

    // 패킷 암호화 응답: application/octet-stream → 복호화
    if (contentType.contains('application/octet-stream')) {
      return await _decryptPacket(res.bodyBytes);
    }

    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (data['ok'] != true) {
      throw Exception('EntityServer error: ${data['message']} (HTTP ${res.statusCode})');
    }
    return data;
  }

  /// XChaCha20-Poly1305 패킷 복호화
  /// 포맷: [magic:magicLen][nonce:24][ciphertext+tag:...]
  /// 키: sha256(hmac_secret)
  Future<Map<String, dynamic>> _decryptPacket(Uint8List data) async {
    // 키 유도: sha256(hmac_secret)
    final sha256 = Sha256();
    final keyHash = await sha256.hash(utf8.encode(hmacSecret));
    final key = SecretKey(keyHash.bytes);

    final nonce = data.sublist(magicLen, magicLen + 24);
    // ciphertext 마지막 16바이트가 Poly1305 MAC
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

  /// HMAC-SHA256 서명
  Future<String> _sign(
    String method,
    String path,
    String timestamp,
    String nonce,
    String body,
  ) async {
    final payload = [method, path, timestamp, nonce, body].join('|');
    final algorithm = Hmac.sha256();
    final key = SecretKey(utf8.encode(hmacSecret));
    final mac = await algorithm.calculateMac(utf8.encode(payload), secretKey: key);
    return mac.bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }
}
