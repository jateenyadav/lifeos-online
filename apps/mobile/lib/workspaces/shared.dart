import 'package:flutter/material.dart';
import '../theme/tokens.dart';
import '../widgets/ui.dart';
import 'workspace_controller.dart';
import 'entry_editor.dart';

/// Large title + description (+ optional add button) for a space.
class SpaceHeading extends StatelessWidget {
  const SpaceHeading({
    super.key,
    required this.title,
    required this.description,
    this.action,
    this.onAction,
  });
  final String title;
  final String description;
  final String? action;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      LargeTitle(title, subtitle: description),
      if (action != null) ...[
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: onAction,
            icon: const Icon(Icons.add, size: 18),
            label: Text(action!),
          ),
        ),
        const SizedBox(height: 16),
      ],
    ],
  );
}

class SpaceStats extends StatelessWidget {
  const SpaceStats({super.key, required this.stats});
  final List<(String, String)> stats;
  @override
  Widget build(BuildContext context) => StatGrid(
    children: [
      for (final stat in stats) StatTile(label: stat.$1, value: stat.$2),
    ],
  );
}

class SpaceCard extends StatelessWidget {
  const SpaceCard({super.key, required this.child, this.highlight = false});
  final Widget child;
  final bool highlight;
  @override
  Widget build(BuildContext context) => LCard(
    color: highlight
        ? Color.alphaBlend(
            context.lc.primary.withValues(alpha: .08),
            context.lc.surface,
          )
        : null,
    child: child,
  );
}

class SpaceEmpty extends StatelessWidget {
  const SpaceEmpty({super.key, required this.title, required this.detail});
  final String title;
  final String detail;
  @override
  Widget build(BuildContext context) =>
      EmptyState(title: title, detail: detail);
}

class SpaceFilter extends StatelessWidget {
  const SpaceFilter({
    super.key,
    required this.options,
    required this.selected,
    required this.onChange,
  });
  final List<String> options;
  final String selected;
  final ValueChanged<String> onChange;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: LayoutBuilder(
      builder: (context, constraints) => Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final option in options)
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: constraints.maxWidth),
              child: ChoiceChip(
                label: Text(option),
                selected: option == selected,
                showCheckmark: false,
                onSelected: (_) => onChange(option),
              ),
            ),
        ],
      ),
    ),
  );
}

Future<void> openEditor(
  BuildContext context,
  WorkspaceController store,
  String collection, {
  Map<String, dynamic>? entry,
}) => Navigator.of(context).push<void>(
  MaterialPageRoute(
    builder: (_) =>
        EntryEditor(store: store, collection: collection, entry: entry),
  ),
);

Future<void> deleteEntry(
  BuildContext context,
  WorkspaceController store,
  String collection,
  Map<String, dynamic> entry,
) async {
  final confirmed = await confirm(
    context,
    title: 'Delete this entry?',
    body: '“${entry['title']}” will be removed. This cannot be undone.',
  );
  if (confirmed) await store.remove(collection, entry['id'] as String);
}

class EntryMenu extends StatelessWidget {
  const EntryMenu({
    super.key,
    required this.title,
    required this.saving,
    required this.onEdit,
    required this.onDelete,
    this.extra = const {},
    this.onExtra,
  });
  final String title;
  final bool saving;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final Map<String, String> extra;
  final ValueChanged<String>? onExtra;
  @override
  Widget build(BuildContext context) => PopupMenuButton<String>(
    tooltip: 'Actions for $title',
    enabled: !saving,
    onSelected: (value) {
      if (value == 'edit') {
        onEdit();
      } else if (value == 'delete') {
        onDelete();
      } else {
        onExtra?.call(value);
      }
    },
    itemBuilder: (_) => [
      const PopupMenuItem(value: 'edit', child: Text('Edit')),
      for (final item in extra.entries)
        PopupMenuItem(value: item.key, child: Text(item.value)),
      const PopupMenuItem(value: 'delete', child: Text('Delete')),
    ],
  );
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key});
  final String title;
  @override
  Widget build(BuildContext context) => SectionHeader(title);
}
