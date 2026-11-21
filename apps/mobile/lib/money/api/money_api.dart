import 'dart:convert';
import 'dart:typed_data';
import '../../auth/auth_controller.dart';

typedef Json = Map<String, dynamic>;
typedef MoneyRequest =
    Future<Json> Function(String path, {String method, Json? body});

List<Json> itemsOf(Json response, [String key = 'items']) =>
    (response[key] as List? ?? const [])
        .whereType<Map>()
        .map((entry) => Map<String, dynamic>.from(entry))
        .toList();

String _query(Map<String, Object?> values) {
  final parts = [
    for (final entry in values.entries)
      if (entry.value != null && '${entry.value}'.isNotEmpty)
        '${entry.key}=${Uri.encodeQueryComponent('${entry.value}')}',
  ];
  return parts.isEmpty ? '' : '?${parts.join('&')}';
}

/// Client for `/api/money` (docs/MONEY.md §4). Every amount is integer paise.
class MoneyApi {
  MoneyApi(this._request, {Future<Uint8List> Function(String path)? bytes})
    : _bytes = bytes;
  factory MoneyApi.of(AuthController auth) =>
      MoneyApi(auth.moneyRequest, bytes: auth.moneyBytes);

  final MoneyRequest _request;
  final Future<Uint8List> Function(String path)? _bytes;

  Future<Json> _get(String path) => _request(path);
  Future<Json> _post(String path, [Json? body]) =>
      _request(path, method: 'POST', body: body ?? {});
  Future<Json> _patch(String path, Json body) =>
      _request(path, method: 'PATCH', body: body);
  Future<Json> _put(String path, Json body) =>
      _request(path, method: 'PUT', body: body);
  Future<Json> _delete(String path) => _request(path, method: 'DELETE');

  // Overview
  Future<Json> overview(String month) =>
      _get('/overview${_query({'month': month})}');

  // Transactions
  Future<Json> txns({
    String? from,
    String? to,
    String? q,
    String? category,
    String? accountId,
    String? direction,
    String? source,
    String? status,
    bool review = false,
    bool left = false,
    int? limit,
    String? cursor,
  }) => _get(
    '/txns${_query({'from': from, 'to': to, 'q': q, 'category': category, 'accountId': accountId, 'direction': direction, 'source': source, 'status': status, 'review': review ? '1' : null, 'left': left ? '1' : null, 'limit': limit, 'cursor': cursor})}',
  );
  Future<Json> addTxn(Json values) => _post('/txns', values);
  Future<Json> editTxn(String id, Json values) => _patch('/txns/$id', values);
  Future<Json> deleteTxn(String id) => _delete('/txns/$id');
  Future<Json> ingest(List<Json> items) =>
      _post('/txns/ingest', {'items': items});
  Future<Json> setPeer(
    String id, {
    required String? peerTag,
    String? contactName,
    String? contactId,
    int? splitPeople,
  }) => _post('/txns/$id/peer', {
    'peerTag': peerTag,
    'contactName': ?contactName,
    'contactId': ?contactId,
    'splitPeople': ?splitPeople,
  });
  Future<Json> refundOf(String id, String? originalId) =>
      _post('/txns/$id/refund-of', {'originalId': originalId});
  Future<Json> linkTransfer(String id, String otherId) =>
      _post('/txns/$id/transfer', {'otherId': otherId});
  Future<Json> untrackedTransfer(String id) =>
      _post('/txns/$id/transfer', {'untracked': true});
  Future<Json> unlinkTransfer(String id) => _delete('/txns/$id/transfer');
  Future<Json> transferSuggestions() => _get('/transfers/suggestions');
  Future<Json> claim(String id, {int? amountMinor}) =>
      _post('/txns/$id/reimburse/claim', {'amountMinor': ?amountMinor});
  Future<Json> unclaim(String id) => _delete('/txns/$id/reimburse/claim');
  Future<Json> received(String id, List<String> claimIds) =>
      _post('/txns/$id/reimburse/received', {'claimIds': claimIds});
  Future<Json> receivedPreview(String id, List<String> claimIds) =>
      _post('/txns/$id/reimburse/preview', {'claimIds': claimIds});
  Future<Json> undoReceived(String id) =>
      _delete('/txns/$id/reimburse/received');
  Future<Json> reimbursements() => _get('/reimbursements');

  // Accounts
  Future<Json> accounts() => _get('/accounts');
  Future<Json> addAccount(Json values) => _post('/accounts', values);
  Future<Json> editAccount(String id, Json values) =>
      _patch('/accounts/$id', values);
  Future<Json> deleteAccount(String id) => _delete('/accounts/$id');
  Future<Json> matchBank(String id) => _post('/accounts/$id/match-bank');
  Future<Json> billPaid(String id) => _post('/accounts/$id/bill-paid');

  // Khata
  Future<Json> khata() => _get('/khata');
  Future<Json> addContact(Json values) => _post('/khata/contacts', values);
  Future<Json> editContact(String id, Json values) =>
      _patch('/khata/contacts/$id', values);
  Future<Json> deleteContact(String id) => _delete('/khata/contacts/$id');
  Future<Json> contact(String id) => _get('/khata/contacts/$id');
  Future<Json> addEntry(String contactId, Json values) =>
      _post('/khata/contacts/$contactId/entries', values);
  Future<Json> editEntry(String id, Json values) =>
      _patch('/khata/entries/$id', values);
  Future<Json> deleteEntry(String id) => _delete('/khata/entries/$id');
  Future<Json> addAdjustment(String contactId, Json values) =>
      _post('/khata/contacts/$contactId/adjustments', values);
  Future<Json> setAdjustmentActive(String id, bool active) =>
      _patch('/khata/adjustments/$id', {'active': active});
  Future<Json> deleteAdjustment(String id) => _delete('/khata/adjustments/$id');
  Future<Json> swap(String contactId) =>
      _post('/khata/contacts/$contactId/swap');
  Future<Json> importParse(String text, {required String mode}) =>
      _post('/khata/import/parse', {'text': text, 'mode': mode});
  Future<Json> importSave(List<Json> people, {List<String>? photoIds}) =>
      _post('/khata/import/save', {
        'people': people,
        if (photoIds != null && photoIds.isNotEmpty) 'photoIds': photoIds,
      });

  // Photos
  Future<String> uploadPhoto({
    required String ownerType,
    String? ownerId,
    required Uint8List jpeg,
    String mime = 'image/jpeg',
    String caption = '',
  }) async {
    final result = await _post('/photos', {
      'ownerType': ownerType,
      'ownerId': ownerId,
      'mime': mime,
      'data': base64Encode(jpeg),
      'caption': caption,
    });
    return '${result['id']}';
  }

  Future<Uint8List> photo(String id) {
    final bytes = _bytes;
    if (bytes == null) throw StateError('Photos are not available here.');
    return bytes('/photos/$id');
  }

  Future<Json> deletePhoto(String id) => _delete('/photos/$id');

  // Lists
  Future<Json> subscriptions() => _get('/subscriptions');
  Future<Json> budgets(String month) =>
      _get('/budgets${_query({'month': month})}');
  Future<Json> putBudget(String month, String category, int limitMinor) => _put(
    '/budgets',
    {'month': month, 'category': category, 'limitMinor': limitMinor},
  );
  Future<Json> deleteBudget(String id) => _delete('/budgets/$id');
}
