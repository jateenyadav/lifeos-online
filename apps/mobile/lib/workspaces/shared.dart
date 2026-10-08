import 'package:flutter/material.dart';
import 'workspace_controller.dart';
import 'entry_editor.dart';

const ink = Color(0xFF263E34);
const muted = Color(0xFF74816A);

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
      Text(
        title,
        style: const TextStyle(
          fontSize: 28,
          fontWeight: FontWeight.w600,
          color: ink,
          letterSpacing: -0.8,
        ),
      ),
      const SizedBox(height: 8),
      Text(
        description,
        style: const TextStyle(color: muted, height: 1.7, fontSize: 13),
      ),
      if (action != null) ...[
        const SizedBox(height: 16),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: onAction,
            icon: const Icon(Icons.add, size: 18),
            label: Text(action!),
          ),
        ),
      ],
      const SizedBox(height: 22),
    ],
  );
}

class SpaceStats extends StatelessWidget {
  const SpaceStats({super.key, required this.stats});
  final List<(String, String)> stats;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final minimum = 120 * MediaQuery.textScalerOf(context).scale(1);
      final columns = (constraints.maxWidth / minimum).floor().clamp(
        1,
        stats.length,
      );
      return Padding(
        padding: const EdgeInsets.only(bottom: 22),
        child: Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final stat in stats)
              SizedBox(
                width: (constraints.maxWidth - (columns - 1) * 10) / columns,
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFFEFA),
                    border: Border.all(color: const Color(0xFFE3E8DC)),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        stat.$1,
                        style: const TextStyle(fontSize: 11, color: muted),
                      ),
                      const SizedBox(height: 9),
                      Text(
                        stat.$2,
                        style: const TextStyle(
                          fontSize: 22,
                          color: ink,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      );
    },
  );
}

class SpaceCard extends StatelessWidget {
  const SpaceCard({super.key, required this.child, this.tone});
  final Widget child;
  final Color? tone;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(18),
    margin: const EdgeInsets.only(bottom: 12),
    decoration: BoxDecoration(
      color: tone ?? const Color(0xFFFFFEFA),
      border: Border.all(color: const Color(0xFFE3E8DC)),
      borderRadius: BorderRadius.circular(13),
    ),
    child: child,
  );
}

class SpaceEmpty extends StatelessWidget {
  const SpaceEmpty({super.key, required this.title, required this.detail});
  final String title;
  final String detail;
  @override
  Widget build(BuildContext context) => SpaceCard(
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 22),
      child: Column(
        children: [
          const Icon(Icons.eco_outlined, color: Color(0xFF91A876), size: 30),
          const SizedBox(height: 14),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: ink,
              fontSize: 17,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 9),
          Text(
            detail,
            textAlign: TextAlign.center,
            style: const TextStyle(color: muted, fontSize: 12, height: 1.8),
          ),
        ],
      ),
    ),
  );
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
    padding: const EdgeInsets.only(bottom: 18),
    child: LayoutBuilder(
      builder: (context, constraints) => Wrap(
        spacing: 7,
        runSpacing: 7,
        children: [
          for (final option in options)
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: constraints.maxWidth),
              child: ChoiceChip(
                label: Text(option),
                selected: option == selected,
                showCheckmark: false,
                onSelected: (_) => onChange(option),
                selectedColor: const Color(0xFFE4ECDA),
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
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Delete this entry?'),
      content: Text(
        '“${entry['title']}” will be removed. This cannot be undone.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Delete'),
        ),
      ],
    ),
  );
  if (confirmed == true) await store.remove(collection, entry['id'] as String);
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
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 12, bottom: 14),
    child: Text(
      title,
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: ink,
      ),
    ),
  );
}
