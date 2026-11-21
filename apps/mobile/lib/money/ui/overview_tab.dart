import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../api/money_api.dart';
import '../core/money.dart';
import 'lists_screens.dart';
import 'money_store.dart';

class OverviewTab extends StatelessWidget {
  const OverviewTab({
    super.key,
    required this.store,
    required this.onOpenTab,
    this.onOpenCapture,
  });
  final MoneyStore store;
  final ValueChanged<int> onOpenTab;
  final VoidCallback? onOpenCapture;

  @override
  Widget build(BuildContext context) => MoneyLoader<Json>(
    store: store,
    watchMonth: true,
    load: () => store.api.overview(store.month),
    builder: (context, data) => _OverviewBody(
      store: store,
      data: data,
      onOpenTab: onOpenTab,
      onOpenCapture: onOpenCapture,
    ),
  );
}

class MonthSwitcher extends StatelessWidget {
  const MonthSwitcher({super.key, required this.store});
  final MoneyStore store;
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: store,
    builder: (context, _) => Row(
      children: [
        IconButton(
          tooltip: 'Previous month',
          onPressed: () => store.setMonth(shiftMonth(store.month, -1)),
          icon: const Icon(Icons.chevron_left),
        ),
        Expanded(
          child: Text(
            monthLabel(store.month),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        IconButton(
          tooltip: 'Next month',
          onPressed: store.month.compareTo(monthKey(DateTime.now())) >= 0
              ? null
              : () => store.setMonth(shiftMonth(store.month, 1)),
          icon: const Icon(Icons.chevron_right),
        ),
      ],
    ),
  );
}

class _OverviewBody extends StatelessWidget {
  const _OverviewBody({
    required this.store,
    required this.data,
    required this.onOpenTab,
    this.onOpenCapture,
  });
  final MoneyStore store;
  final Json data;
  final ValueChanged<int> onOpenTab;
  final VoidCallback? onOpenCapture;

  void _push(BuildContext context, Widget screen) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));

  @override
  Widget build(BuildContext context) {
    final c = context.lc;
    final spent = asInt(data['spentMinor']);
    final income = asInt(data['incomeMinor']);
    final net = asInt(data['netMinor']);
    final budget = data['budget'] as Map?;
    final khata = data['khata'] as Map? ?? const {};
    final reimburse = data['reimburse'] as Map? ?? const {};
    final review = asInt(data['reviewCount']);
    final left = asInt(data['leftCount']);
    final byCategory = itemsOf(data, 'byCategory')
      ..sort((a, b) => asInt(b['minor']).compareTo(asInt(a['minor'])));
    final daily = itemsOf(data, 'daily');
    final trend = itemsOf(data, 'trend');
    final merchants = itemsOf(data, 'topMerchants');
    final coming = itemsOf(data, 'comingUp');
    return ListView(
      key: const Key('money_overview'),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
      children: [
        MonthSwitcher(store: store),
        LCard(
          hero: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Spent in ${monthLabel(asString(data['month'], store.month))}',
                style: Theme.of(context).textTheme.labelMedium,
              ),
              const SizedBox(height: 6),
              CountUpMoney(spent, key: const Key('overview_spent')),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: _Mini(
                      label: 'Income',
                      value: Money.format(income),
                      color: c.moneyIn,
                    ),
                  ),
                  Expanded(
                    child: _Mini(
                      label: 'Net',
                      value: Money.format(net, signed: true),
                      color: net >= 0 ? c.moneyIn : c.moneyOut,
                    ),
                  ),
                  Expanded(
                    child: _Mini(
                      label: 'Net worth',
                      value: Money.compact(asInt(data['netWorthMinor'])),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        _BudgetCard(store: store, budget: budget),
        StatGrid(
          minWidth: 150,
          children: [
            _Tile(
              key: const Key('tile_review'),
              icon: Icons.fact_check_outlined,
              color: c.warn,
              label: 'To review',
              value: '$review',
              onTap: () => _push(context, ReviewScreen(store: store)),
            ),
            _Tile(
              key: const Key('tile_left'),
              icon: Icons.inventory_2_outlined,
              color: c.info,
              label: 'Left for later',
              value: '$left',
              onTap: () => onOpenTab(2),
            ),
            _Tile(
              key: const Key('tile_reimburse'),
              icon: Icons.currency_exchange,
              color: LifeColors.money,
              label: 'Getting money back',
              value: Money.format(asInt(reimburse['waitingMinor'])),
              onTap: () => _push(context, ReimbursementsScreen(store: store)),
            ),
            _Tile(
              key: const Key('tile_khata'),
              icon: Icons.people_outline,
              color: c.primary,
              label: 'Owed to me · I owe',
              value:
                  '${Money.compact(asInt(khata['owedToMeMinor']))} · ${Money.compact(asInt(khata['iOweMinor']))}',
              onTap: () => onOpenTab(2),
            ),
          ],
        ),
        if (daily.isNotEmpty)
          LCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Spending by day',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 14),
                SizedBox(height: 150, child: DailyBars(daily: daily)),
              ],
            ),
          ),
        if (byCategory.isNotEmpty)
          LCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Where it went',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 12),
                CategoryDonut(rows: byCategory),
              ],
            ),
          ),
        if (trend.isNotEmpty)
          LCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Last 12 months',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    _Legend(color: c.moneyOut, label: 'Spent'),
                    const SizedBox(width: 14),
                    _Legend(color: c.moneyIn, label: 'Income'),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(height: 160, child: TrendChart(trend: trend)),
              ],
            ),
          ),
        if (merchants.isNotEmpty) ...[
          const SectionHeader('Top places'),
          LCard(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Column(
              children: [
                for (final row in merchants.take(5))
                  ListTile(
                    title: Text(
                      asString(row['title']),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    subtitle: Text('${asInt(row['count'])} payments'),
                    trailing: MoneyText(asInt(row['minor'])),
                  ),
              ],
            ),
          ),
        ],
        if (coming.isNotEmpty) ...[
          const SectionHeader('Coming up'),
          LCard(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Column(
              children: [
                for (final row in coming.take(6))
                  ListTile(
                    leading: Icon(switch (row['kind']) {
                      'card_bill' => Icons.credit_card,
                      'subscription' => Icons.autorenew,
                      _ => Icons.people_outline,
                    }),
                    title: Text(asString(row['title'])),
                    subtitle: Text(prettyDate(asString(row['date']))),
                    trailing: MoneyText(asInt(row['amountMinor'])),
                  ),
              ],
            ),
          ),
        ],
        const SectionHeader('More'),
        LCard(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.autorenew),
                title: const Text('Subscriptions'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _push(context, SubscriptionsScreen(store: store)),
              ),
              ListTile(
                leading: const Icon(Icons.savings_outlined),
                title: const Text('Budgets'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _push(context, BudgetsScreen(store: store)),
              ),
              ListTile(
                leading: const Icon(Icons.currency_exchange),
                title: const Text('Reimbursements'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _push(context, ReimbursementsScreen(store: store)),
              ),
              if (onOpenCapture != null)
                ListTile(
                  leading: const Icon(Icons.sms_outlined),
                  title: const Text('Automatic tracking'),
                  subtitle: const Text('Bank SMS, payment alerts, screenshots'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: onOpenCapture,
                ),
            ],
          ),
        ),
      ],
    );
  }
}

String asString(Object? value, [String fallback = '']) =>
    value is String ? value : (value?.toString() ?? fallback);

class _Mini extends StatelessWidget {
  const _Mini({required this.label, required this.value, this.color});
  final String label;
  final String value;
  final Color? color;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: Theme.of(context).textTheme.labelSmall),
      const SizedBox(height: 2),
      FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Text(
          value,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontFeatures: tabular,
            color: color,
          ),
        ),
      ),
    ],
  );
}

class _Tile extends StatelessWidget {
  const _Tile({
    super.key,
    required this.icon,
    required this.color,
    required this.label,
    required this.value,
    this.onTap,
  });
  final IconData icon;
  final Color color;
  final String label;
  final String value;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => LCard(
    margin: EdgeInsets.zero,
    padding: const EdgeInsets.all(14),
    onTap: onTap,
    child: Row(
      children: [
        IconTile(icon, color: color, size: 36),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: Theme.of(context).textTheme.labelSmall,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  value,
                  style: Theme.of(
                    context,
                  ).textTheme.titleMedium?.copyWith(fontFeatures: tabular),
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _Legend extends StatelessWidget {
  const _Legend({required this.color, required this.label});
  final Color color;
  final String label;
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(3),
        ),
      ),
      const SizedBox(width: 6),
      Text(label, style: Theme.of(context).textTheme.bodySmall),
    ],
  );
}

class _BudgetCard extends StatelessWidget {
  const _BudgetCard({required this.store, required this.budget});
  final MoneyStore store;
  final Map? budget;
  @override
  Widget build(BuildContext context) {
    final c = context.lc;
    if (budget == null) {
      return LCard(
        onTap: () => editBudget(context, store, '*'),
        child: Row(
          children: [
            IconTile(Icons.savings_outlined, color: c.primary, size: 36),
            const SizedBox(width: 12),
            const Expanded(child: Text('Set a budget for this month')),
            const Icon(Icons.add),
          ],
        ),
      );
    }
    final limit = asInt(budget!['limitMinor']);
    final used = asInt(budget!['usedMinor']);
    final ratio = limit <= 0 ? 0.0 : used / limit;
    final over = used > limit;
    return LCard(
      key: const Key('overview_budget'),
      onTap: () => editBudget(context, store, '*', current: limit),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Budget',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              Text(
                '${Money.format(used)} of ${Money.format(limit)}',
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(fontFeatures: tabular),
              ),
            ],
          ),
          const SizedBox(height: 10),
          LinearProgressIndicator(
            value: ratio.clamp(0, 1).toDouble(),
            minHeight: 8,
            borderRadius: BorderRadius.circular(8),
            color: over ? c.danger : (ratio > .85 ? c.warn : c.primary),
          ),
          const SizedBox(height: 8),
          Text(
            over
                ? 'Over by ${Money.format(used - limit)}'
                : '${Money.format(limit - used)} left',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class DailyBars extends StatelessWidget {
  const DailyBars({super.key, required this.daily});
  final List<Json> daily;
  @override
  Widget build(BuildContext context) {
    final c = context.lc;
    final maxY = daily.fold<int>(1, (m, row) {
      final v = asInt(row['minor']);
      return v > m ? v : m;
    });
    return BarChart(
      duration: context.reduceMotion
          ? Duration.zero
          : const Duration(milliseconds: 250),
      BarChartData(
        maxY: maxY * 1.1,
        alignment: BarChartAlignment.spaceBetween,
        gridData: const FlGridData(show: false),
        borderData: FlBorderData(show: false),
        barTouchData: BarTouchData(
          touchTooltipData: BarTouchTooltipData(
            getTooltipColor: (_) => c.surface2,
            getTooltipItem: (group, _, rod, _) => BarTooltipItem(
              '${asString(daily[group.x]['date']).substring(8)}: ${Money.format(rod.toY.round())}',
              TextStyle(color: c.text, fontWeight: FontWeight.w600),
            ),
          ),
        ),
        titlesData: FlTitlesData(
          leftTitles: const AxisTitles(),
          rightTitles: const AxisTitles(),
          topTitles: const AxisTitles(),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 20,
              getTitlesWidget: (value, meta) {
                final index = value.toInt();
                if (index % 5 != 0 || index >= daily.length) {
                  return const SizedBox.shrink();
                }
                return Text(
                  asString(daily[index]['date']).substring(8),
                  style: Theme.of(context).textTheme.labelSmall,
                );
              },
            ),
          ),
        ),
        barGroups: [
          for (var i = 0; i < daily.length; i++)
            BarChartGroupData(
              x: i,
              barRods: [
                BarChartRodData(
                  toY: asInt(daily[i]['minor']).toDouble(),
                  color: c.moneyOut,
                  width: 5,
                  borderRadius: BorderRadius.circular(3),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class CategoryDonut extends StatelessWidget {
  const CategoryDonut({super.key, required this.rows});
  final List<Json> rows;
  @override
  Widget build(BuildContext context) {
    final total = rows.fold<int>(0, (sum, row) => sum + asInt(row['minor']));
    final shown = rows.take(8).toList();
    final rest =
        total - shown.fold<int>(0, (s, row) => s + asInt(row['minor']));
    final parts = [
      for (final row in shown) (asString(row['category']), asInt(row['minor'])),
      if (rest > 0) ('Other', rest),
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        final chart = SizedBox(
          width: 150,
          height: 150,
          child: Stack(
            alignment: Alignment.center,
            children: [
              PieChart(
                duration: context.reduceMotion
                    ? Duration.zero
                    : const Duration(milliseconds: 250),
                PieChartData(
                  centerSpaceRadius: 46,
                  sectionsSpace: 2,
                  sections: [
                    for (var i = 0; i < parts.length; i++)
                      PieChartSectionData(
                        value: parts[i].$2.toDouble(),
                        color: LifeColors.chart[i % LifeColors.chart.length],
                        radius: 22,
                        showTitle: false,
                      ),
                  ],
                ),
              ),
              Text(
                Money.compact(total),
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontFeatures: tabular),
              ),
            ],
          ),
        );
        final legend = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var i = 0; i < parts.length; i++)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: [
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: LifeColors.chart[i % LifeColors.chart.length],
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        parts[i].$1,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Text(
                      '${total == 0 ? 0 : (parts[i].$2 * 100 / total).round()}%',
                      style: Theme.of(
                        context,
                      ).textTheme.bodySmall?.copyWith(fontFeatures: tabular),
                    ),
                  ],
                ),
              ),
          ],
        );
        if (constraints.maxWidth < 330) {
          return Column(children: [chart, const SizedBox(height: 12), legend]);
        }
        return Row(
          children: [
            chart,
            const SizedBox(width: 16),
            Expanded(child: legend),
          ],
        );
      },
    );
  }
}

class TrendChart extends StatelessWidget {
  const TrendChart({super.key, required this.trend});
  final List<Json> trend;
  @override
  Widget build(BuildContext context) {
    final c = context.lc;
    LineChartBarData line(String key, Color color) => LineChartBarData(
      spots: [
        for (var i = 0; i < trend.length; i++)
          FlSpot(i.toDouble(), asInt(trend[i][key]) / 100),
      ],
      isCurved: true,
      preventCurveOverShooting: true,
      color: color,
      barWidth: 3,
      dotData: const FlDotData(show: false),
      belowBarData: BarAreaData(
        show: true,
        color: color.withValues(alpha: .08),
      ),
    );
    return LineChart(
      duration: context.reduceMotion
          ? Duration.zero
          : const Duration(milliseconds: 250),
      LineChartData(
        gridData: const FlGridData(show: false),
        borderData: FlBorderData(show: false),
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            getTooltipColor: (_) => c.surface2,
            getTooltipItems: (spots) => [
              for (final spot in spots)
                LineTooltipItem(
                  Money.format((spot.y * 100).round()),
                  TextStyle(color: spot.bar.color, fontWeight: FontWeight.w700),
                ),
            ],
          ),
        ),
        titlesData: FlTitlesData(
          leftTitles: const AxisTitles(),
          rightTitles: const AxisTitles(),
          topTitles: const AxisTitles(),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 20,
              interval: 1,
              getTitlesWidget: (value, meta) {
                final index = value.toInt();
                if (index < 0 || index >= trend.length || index.isOdd) {
                  return const SizedBox.shrink();
                }
                return Text(
                  shortMonth(asString(trend[index]['month'])),
                  style: Theme.of(context).textTheme.labelSmall,
                );
              },
            ),
          ),
        ),
        lineBarsData: [
          line('spentMinor', c.moneyOut),
          line('incomeMinor', c.moneyIn),
        ],
      ),
    );
  }
}
