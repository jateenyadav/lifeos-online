import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../../auth/auth_api.dart';
import '../api/money_api.dart';
import '../core/money.dart';

const expenseCategories = [
  'Food',
  'Groceries',
  'Travel',
  'Fuel',
  'Shopping',
  'Bills',
  'Rent',
  'Health',
  'Entertainment',
  'Education',
  'Investments',
  'Other',
];
const incomeCategories = [
  'Salary',
  'Refund',
  'Interest',
  'Gift',
  'Other income',
];
const purposeIdeas = [
  'Flight',
  'Train',
  'Cab',
  'Food',
  'Groceries',
  'Shopping',
  'Bills',
  'Rent',
  'Medicine',
  'Fuel',
  'Gift',
  'Family',
  'EMI',
  'Fees',
];
const channels = ['UPI', 'Card', 'NetBanking', 'Wallet', 'Cash', 'Other'];

IconData categoryIcon(String? category) => switch (category) {
  'Food' => Icons.restaurant_outlined,
  'Groceries' => Icons.shopping_basket_outlined,
  'Travel' => Icons.flight_takeoff_outlined,
  'Fuel' => Icons.local_gas_station_outlined,
  'Shopping' => Icons.shopping_bag_outlined,
  'Bills' => Icons.receipt_long_outlined,
  'Rent' => Icons.home_outlined,
  'Health' => Icons.favorite_outline,
  'Entertainment' => Icons.movie_outlined,
  'Education' => Icons.school_outlined,
  'Investments' => Icons.trending_up,
  'Salary' => Icons.work_outline,
  'Refund' => Icons.undo,
  'Interest' => Icons.savings_outlined,
  'Gift' => Icons.card_giftcard,
  _ => Icons.category_outlined,
};

String _two(int value) => value.toString().padLeft(2, '0');
String monthKey(DateTime date) => '${date.year}-${_two(date.month)}';
String dayKey(DateTime date) =>
    '${date.year}-${_two(date.month)}-${_two(date.day)}';
const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
String monthLabel(String month) {
  final parts = month.split('-');
  if (parts.length < 2) return month;
  return '${_months[int.parse(parts[1]) - 1]} ${parts[0]}';
}

String shortMonth(String month) {
  final parts = month.split('-');
  return parts.length < 2 ? month : _months[int.parse(parts[1]) - 1];
}

String prettyDate(String? date) {
  if (date == null || date.length < 10) return date ?? '';
  final parsed = DateTime.tryParse(date);
  if (parsed == null) return date;
  final today = DateTime.now();
  if (dayKey(today) == date) return 'Today';
  if (dayKey(today.subtract(const Duration(days: 1))) == date) {
    return 'Yesterday';
  }
  final year = parsed.year == today.year ? '' : ' ${parsed.year}';
  return '${parsed.day} ${_months[parsed.month - 1]}$year';
}

String shiftMonth(String month, int delta) {
  final parts = month.split('-');
  final date = DateTime(int.parse(parts[0]), int.parse(parts[1]) + delta);
  return monthKey(date);
}

(String, String) monthRange(String month) {
  final parts = month.split('-');
  final last = DateTime(int.parse(parts[0]), int.parse(parts[1]) + 1, 0);
  return ('$month-01', dayKey(last));
}

String rupees(int paise) => Money.format(paise);

/// "1,234.50" / "450" → paise. Null when it is not a positive amount.
int? parseRupees(String input) {
  final text = input.trim().replaceAll(',', '').replaceAll('₹', '');
  if (!RegExp(r'^\d{1,9}(\.\d{1,2})?$').hasMatch(text)) return null;
  final parts = text.split('.');
  final value =
      int.parse(parts[0]) * 100 +
      int.parse((parts.length == 2 ? parts[1] : '').padRight(2, '0'));
  return value > 0 ? value : null;
}

String paiseInput(int paise) {
  final rest = paise % 100;
  return rest == 0
      ? '${paise ~/ 100}'
      : '${paise ~/ 100}.${rest.toString().padLeft(2, '0')}';
}

int asInt(Object? value) => value is num ? value.toInt() : 0;

/// Shared state for the Money space: the selected month, a revision counter
/// every screen listens to (bumped after any change), and a photo cache.
class MoneyStore extends ChangeNotifier {
  MoneyStore(this.api, {DateTime Function()? now})
    : month = monthKey((now ?? DateTime.now)());
  final MoneyApi api;
  String month;
  int revision = 0;
  final Map<String, Uint8List> _photos = {};

  void changed() {
    revision++;
    notifyListeners();
  }

  void setMonth(String value) {
    month = value;
    notifyListeners();
  }

  Future<Uint8List> photo(String id) async =>
      _photos[id] ??= await api.photo(id);

  /// Runs a change, shows the server's plain-sentence error on failure.
  Future<T?> run<T>(
    BuildContext context,
    Future<T> Function() action, {
    String? done,
  }) async {
    final messenger = ScaffoldMessenger.maybeOf(context);
    try {
      final result = await action();
      changed();
      if (done != null) {
        messenger?.hideCurrentSnackBar();
        messenger?.showSnackBar(SnackBar(content: Text(done)));
      }
      return result;
    } on ApiException catch (failure) {
      messenger?.hideCurrentSnackBar();
      messenger?.showSnackBar(SnackBar(content: Text(failure.message)));
      return null;
    } catch (_) {
      messenger?.hideCurrentSnackBar();
      messenger?.showSnackBar(
        const SnackBar(content: Text('Could not save. Please try again.')),
      );
      return null;
    }
  }
}

/// Loads data for a screen and reloads whenever the store changes.
class MoneyLoader<T> extends StatefulWidget {
  const MoneyLoader({
    super.key,
    required this.store,
    required this.load,
    required this.builder,
    this.watchMonth = false,
  });
  final MoneyStore store;
  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data) builder;
  final bool watchMonth;
  @override
  State<MoneyLoader<T>> createState() => _MoneyLoaderState<T>();
}

class _MoneyLoaderState<T> extends State<MoneyLoader<T>> {
  T? _data;
  String? _error;
  bool _loading = true;
  late int _revision = widget.store.revision;
  late String _month = widget.store.month;

  @override
  void initState() {
    super.initState();
    widget.store.addListener(_changed);
    _load();
  }

  @override
  void dispose() {
    widget.store.removeListener(_changed);
    super.dispose();
  }

  void _changed() {
    if (widget.store.revision != _revision ||
        (widget.watchMonth && widget.store.month != _month)) {
      _revision = widget.store.revision;
      _month = widget.store.month;
      _load();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await widget.load();
      if (mounted) setState(() => _data = data);
    } on ApiException catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'This could not load. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_data == null) {
      if (_loading) {
        return const Padding(
          padding: EdgeInsets.symmetric(vertical: 80),
          child: Center(child: CircularProgressIndicator()),
        );
      }
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Text(_error ?? 'Nothing to show yet.', textAlign: TextAlign.center),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _load, child: const Text('Try again')),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: widget.builder(context, _data as T),
    );
  }
}
