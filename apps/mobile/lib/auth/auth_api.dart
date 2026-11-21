import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  const ApiException(this.message, {this.status = 0});
  final String message;
  final int status;
}

class Account {
  const Account({
    required this.id,
    required this.name,
    required this.email,
    this.provider = 'password',
  });
  final String id;
  final String name;
  final String email;
  final String provider;
  factory Account.fromJson(Map<String, dynamic> json) => Account(
    id: json['id'] as String,
    name: json['name'] as String,
    email: json['email'] as String,
    provider: json['provider'] as String? ?? 'password',
  );
}

class AuthSession {
  const AuthSession({required this.token, required this.account});
  final String token;
  final Account account;
  factory AuthSession.fromJson(Map<String, dynamic> json) => AuthSession(
    token: json['token'] as String,
    account: Account.fromJson(json['user'] as Map<String, dynamic>),
  );
}

class AuthApi {
  AuthApi({required this.baseUrl, http.Client? client})
    : _client = client ?? http.Client();
  final String baseUrl;
  final http.Client _client;

  static const loginTimeout = Duration(seconds: 90);

  String get _connectionError {
    final host = Uri.parse(baseUrl).host;
    if (host == '10.0.2.2') {
      return 'This app uses $baseUrl, which only works in an Android emulator. For a real phone, configure an online HTTPS backend and rebuild the app.';
    }
    if (['localhost', '127.0.0.1', '::1'].contains(host)) {
      return 'Cannot reach $baseUrl. This address points to this device, not an online backend. Configure your server address and rebuild the app.';
    }
    return 'Cannot reach $baseUrl. Check your internet connection and that the backend is online.';
  }

  Future<Map<String, dynamic>> workspace(
    String path,
    String token, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) => _request('/workspaces$path', method: method, body: body, token: token);

  Future<Map<String, dynamic>> ai(
    String path,
    String token, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) => _request(
    '/ai$path',
    method: method,
    body: body,
    token: token,
    timeout: const Duration(seconds: 130),
  );

  /// LifeOS Money v2 (docs/MONEY.md §4). Lists come back as `{items: [...]}`.
  Future<Map<String, dynamic>> money(
    String path,
    String token, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) => _request(
    '/money$path',
    method: method,
    body: body,
    token: token,
    timeout: const Duration(seconds: 30),
  );

  /// Raw bytes (receipt and old-khata photos).
  Future<Uint8List> moneyBytes(String path, String token) async {
    try {
      final response = await _client
          .get(
            Uri.parse('$baseUrl/money$path'),
            headers: {
              'X-Client-Type': 'mobile',
              'Authorization': 'Bearer $token',
            },
          )
          .timeout(const Duration(seconds: 30));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw ApiException(
          'This photo could not load.',
          status: response.statusCode,
        );
      }
      return response.bodyBytes;
    } on TimeoutException {
      throw const ApiException('This photo took too long to load.');
    } on SocketException {
      throw ApiException(_connectionError);
    } on http.ClientException {
      throw ApiException(_connectionError);
    }
  }

  Future<Map<String, dynamic>> _request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? token,
    Duration timeout = const Duration(seconds: 15),
  }) async {
    try {
      final request = http.Request(method, Uri.parse('$baseUrl$path'));
      request.headers.addAll({
        'Content-Type': 'application/json',
        'X-Client-Type': 'mobile',
        if (token != null) 'Authorization': 'Bearer $token',
      });
      if (body != null) request.body = jsonEncode(body);
      final response = await _client
          .send(request)
          .then(http.Response.fromStream)
          .timeout(timeout);
      if (response.statusCode == 204 || response.body.trim().isEmpty) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          return {};
        }
      }
      final decoded = response.body.trim().isEmpty
          ? <String, dynamic>{}
          : jsonDecode(response.body);
      final data = decoded is List
          ? <String, dynamic>{'items': decoded}
          : decoded is Map
          ? Map<String, dynamic>.from(decoded)
          : throw const FormatException();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw ApiException(
          data['message'] as String? ??
              data['error'] as String? ??
              'The server could not complete your request.',
          status: response.statusCode,
        );
      }
      return data;
    } on TimeoutException {
      throw const ApiException(
        'The server took too long to respond. Please try again.',
      );
    } on SocketException {
      throw ApiException(_connectionError);
    } on http.ClientException {
      throw ApiException(_connectionError);
    } on FormatException {
      throw const ApiException('The server returned an unexpected response.');
    }
  }

  Future<AuthSession> login(
    String identifier,
    String password, {
    String? token,
  }) async => AuthSession.fromJson(
    await _request(
      '/auth/login',
      method: 'POST',
      body: {'identifier': identifier.trim(), 'password': password},
      token: token,
      timeout: loginTimeout,
    ),
  );
  Future<AuthSession> googleLogin(String idToken, {String? token}) async =>
      AuthSession.fromJson(
        await _request(
          '/auth/google',
          method: 'POST',
          body: {'idToken': idToken},
          token: token,
          timeout: loginTimeout,
        ),
      );
  Future<AuthSession> register(
    String name,
    String email,
    String password,
    String confirmPassword, {
    String? token,
  }) async => AuthSession.fromJson(
    await _request(
      '/auth/register',
      method: 'POST',
      body: {
        'name': name.trim(),
        'email': email.trim(),
        'password': password,
        'confirmPassword': confirmPassword,
      },
      token: token,
      timeout: loginTimeout,
    ),
  );
  Future<Account> me(String token) async {
    final result = await _request(
      '/auth/me',
      token: token,
      timeout: loginTimeout,
    );
    return Account.fromJson(result['user'] as Map<String, dynamic>);
  }

  Future<void> logout(String token) async {
    await _request('/auth/logout', method: 'POST', token: token);
  }

  Future<void> deleteAccount(
    String token, {
    String? password,
    String? idToken,
  }) async {
    await _request(
      '/auth/account',
      method: 'DELETE',
      token: token,
      body: {
        'confirmation': 'DELETE',
        'password': ?password,
        'idToken': ?idToken,
      },
      timeout: loginTimeout,
    );
  }

  void close() => _client.close();
}
