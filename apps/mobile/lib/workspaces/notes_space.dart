import 'package:flutter/material.dart';
import 'workspace_controller.dart';
import 'shared.dart';
import 'utils.dart';

class NotesSpace extends StatefulWidget {
  const NotesSpace({super.key, required this.store});
  final WorkspaceController store;
  @override
  State<NotesSpace> createState() => _NotesSpaceState();
}

class _NotesSpaceState extends State<NotesSpace> {
  String _filter = 'All';
  String _query = '';
  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final notes = store.data['notes']!;
    final visible =
        notes.where((entry) {
          if (_filter == 'Archived'
              ? entry['archived'] != true
              : entry['archived'] == true) {
            return false;
          }
          if (_filter == 'Notes' && entry['kind'] != 'note') return false;
          if (_filter == 'Reminders' && entry['kind'] != 'reminder') {
            return false;
          }
          if (_filter == 'Pinned' && entry['pinned'] != true) return false;
          return '${entry['title']} ${entry['body']} ${entry['tag']}'
              .toLowerCase()
              .contains(_query.toLowerCase());
        }).toList()..sort((first, second) {
          final pinned =
              (second['pinned'] == true ? 1 : 0) -
              (first['pinned'] == true ? 1 : 0);
          return pinned != 0
              ? pinned
              : '${second['updatedAt']}'.compareTo('${first['updatedAt']}');
        });
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SpaceHeading(
          title: 'Notes & reminders',
          description: 'Catch an idea. Clear your head. Remember what matters.',
          action: 'New note',
          onAction: () => openEditor(context, store, 'notes'),
        ),
        SpaceStats(
          stats: [
            (
              'Notes',
              '${notes.where((entry) => entry['kind'] == 'note' && entry['archived'] != true).length}',
            ),
            (
              'Due now',
              '${notes.where((entry) => entry['kind'] == 'reminder' && entry['completed'] != true && entry['archived'] != true && (entry['dueDate'] as String).compareTo(dateKey()) <= 0).length}',
            ),
            (
              'Pinned',
              '${notes.where((entry) => entry['pinned'] == true && entry['archived'] != true).length}',
            ),
          ],
        ),
        TextField(
          decoration: const InputDecoration(
            labelText: 'Search notes',
            prefixIcon: Icon(Icons.search),
          ),
          onChanged: (value) => setState(() => _query = value),
        ),
        const SizedBox(height: 18),
        SpaceFilter(
          options: const ['All', 'Notes', 'Reminders', 'Pinned', 'Archived'],
          selected: _filter,
          onChange: (value) => setState(() => _filter = value),
        ),
        for (final entry in visible)
          SpaceCard(
            tone: entry['pinned'] == true ? const Color(0xFFF5F7EC) : null,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${entry['tag']} · ${entry['kind']}',
                        style: const TextStyle(color: muted, fontSize: 11),
                      ),
                    ),
                    if (entry['pinned'] == true)
                      const Icon(
                        Icons.push_pin_outlined,
                        size: 16,
                        color: muted,
                      ),
                    EntryMenu(
                      title: entry['title'],
                      saving: store.saving,
                      onEdit: () =>
                          openEditor(context, store, 'notes', entry: entry),
                      onDelete: () =>
                          deleteEntry(context, store, 'notes', entry),
                      extra: {
                        'pin': entry['pinned'] == true ? 'Unpin' : 'Pin',
                        'archive': entry['archived'] == true
                            ? 'Restore'
                            : 'Archive',
                      },
                      onExtra: (value) => store.save('notes', {
                        value == 'pin' ? 'pinned' : 'archived':
                            !(entry[value == 'pin' ? 'pinned' : 'archived'] ==
                                true),
                      }, id: entry['id']),
                    ),
                  ],
                ),
                Text(
                  entry['title'],
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: ink,
                    decoration: entry['completed'] == true
                        ? TextDecoration.lineThrough
                        : null,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  entry['body'] == ''
                      ? 'A little thought, safely kept.'
                      : entry['body'],
                  maxLines: 8,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: muted,
                    height: 1.8,
                    fontSize: 13,
                  ),
                ),
                if (entry['kind'] == 'reminder') ...[
                  const SizedBox(height: 14),
                  Text(
                    '${entry['completed'] == true
                        ? 'Completed'
                        : (entry['dueDate'] as String).compareTo(dateKey()) < 0
                        ? 'Overdue'
                        : 'Due'} · ${entry['dueDate']}',
                    style: const TextStyle(color: muted, fontSize: 11),
                  ),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: store.saving
                          ? null
                          : () => store.save('notes', {
                              'completed': entry['completed'] != true,
                            }, id: entry['id']),
                      icon: const Icon(Icons.check, size: 16),
                      label: Text(
                        entry['completed'] == true
                            ? 'Reopen reminder'
                            : 'Complete reminder',
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        if (visible.isEmpty)
          const SpaceEmpty(
            title: 'A calmer mind starts with one note.',
            detail:
                'Write a thought, make a reminder, or pin something important.',
          ),
        const Text(
          'Reminders appear here and on Today. Device notifications are not enabled.',
          style: TextStyle(color: muted, fontSize: 11, height: 1.8),
        ),
      ],
    );
  }
}
