String dateKey([DateTime? value]) {
  final date = value ?? DateTime.now();
  return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
}

List<String> recentDays([int count = 7]) {
  final today = DateTime.now();
  return List.generate(
    count,
    (index) => dateKey(
      DateTime(today.year, today.month, today.day - count + index + 1, 12),
    ),
  );
}

bool dueOn(Map<String, dynamic> routine, String date) =>
    (routine['days'] as List).contains(DateTime.parse(date).weekday % 7);
bool isDone(Map<String, dynamic> routine, String date) =>
    (routine['completedDates'] as List? ?? []).contains(date);
int routineStreak(Map<String, dynamic> routine) {
  final today = DateTime.now();
  var date = DateTime(today.year, today.month, today.day, 12);
  if (dueOn(routine, dateKey(date)) && !isDone(routine, dateKey(date))) {
    date = date.subtract(const Duration(days: 1));
  }
  var total = 0;
  for (var offset = 0; offset < 366; offset++) {
    if (dueOn(routine, dateKey(date))) {
      if (!isDone(routine, dateKey(date))) break;
      total++;
    }
    date = date.subtract(const Duration(days: 1));
  }
  return total;
}

String money(num minor) => '₹${(minor / 100).toStringAsFixed(2)}';
int? parseMoney(String value) {
  if (!RegExp(r'^\d{1,8}(?:\.\d{1,2})?$').hasMatch(value.trim())) return null;
  final parts = value.trim().split('.');
  final result =
      int.parse(parts[0]) * 100 +
      int.parse((parts.length == 2 ? parts[1] : '').padRight(2, '0'));
  return result > 0 && result <= 9999999999 ? result : null;
}

const expenseCategories = [
  'Food',
  'Travel',
  'Shopping',
  'Bills',
  'Health',
  'Other',
];
const routineCategories = ['Medicine', 'Skin care', 'Water', 'Other'];
const workoutTypes = ['Strength', 'Cardio', 'Mobility', 'Other'];
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
