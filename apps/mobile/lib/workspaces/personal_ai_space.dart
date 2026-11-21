import 'package:flutter/material.dart';
import '../auth/auth_api.dart';
import '../auth/auth_controller.dart';
import '../theme/tokens.dart';
import '../widgets/ui.dart';

const _topicLabels = {
  'workouts': 'Workouts',
  'routines': 'Routines & skin care',
  'spending': 'Spending',
};

/// Free "LifeOS AI" only. (Local Ollama and bring-your-own-key were removed:
/// they never worked on the live site.) The shell hides this space while
/// `/api/ai/status` says LifeOS AI is not set up.
class PersonalAiSpace extends StatefulWidget {
  const PersonalAiSpace({super.key, required this.auth});
  final AuthController auth;
  @override
  State<PersonalAiSpace> createState() => _PersonalAiSpaceState();
}

class _PersonalAiSpaceState extends State<PersonalAiSpace> {
  final _chatForm = GlobalKey<FormState>();
  final _knowledgeForm = GlobalKey<FormState>();
  final _question = TextEditingController();
  final _title = TextEditingController();
  final _content = TextEditingController();
  final Set<String> _topics = _topicLabels.keys.toSet();
  List<Map<String, dynamic>> _documents = [];
  final List<Map<String, dynamic>> _messages = [];
  String _knowledgeTopic = 'workouts';
  String _status = 'Checking LifeOS AI…';
  bool _available = false;
  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _notice;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        widget.auth.aiRequest('/status'),
        widget.auth.aiRequest('/knowledge'),
      ]);
      if (!mounted) return;
      final lifeos = results[0]['lifeos'] as Map? ?? const {};
      setState(() {
        _available = lifeos['available'] == true;
        _status =
            lifeos['message'] as String? ??
            (_available
                ? 'LifeOS AI is ready. Free, no key needed.'
                : 'LifeOS AI is not set up on this server yet.');
        _documents = (results[1]['documents'] as List? ?? const [])
            .map((entry) => Map<String, dynamic>.from(entry as Map))
            .toList();
      });
    } on ApiException catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not load LifeOS AI. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _perform(Future<void> Function() action) async {
    if (_busy || _loading) return;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      await action();
    } on ApiException catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'AI request failed. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _ask() async {
    if (!_chatForm.currentState!.validate()) return;
    if (_topics.isEmpty) {
      setState(() => _error = 'Choose at least one data topic.');
      return;
    }
    final question = _question.text.trim();
    final body = <String, dynamic>{
      'provider': 'lifeos',
      'cloudConsent': true,
      'question': question,
      'topics': _topics.toList(),
      'history': _messages
          .skip(_messages.length > 6 ? _messages.length - 6 : 0)
          .map((entry) {
            final content = entry['content'] as String;
            return {
              'role': entry['role'],
              'content': content.length > 1000
                  ? content.substring(0, 1000)
                  : content,
            };
          })
          .toList(),
    };
    await _perform(() async {
      final result = await widget.auth.aiRequest(
        '/chat',
        method: 'POST',
        body: body,
      );
      if (!mounted) return;
      setState(() {
        _messages.add({'role': 'user', 'content': question});
        _messages.add({
          ...result,
          'role': 'assistant',
          'content': result['answer'],
        });
        _question.clear();
      });
    });
  }

  Future<void> _saveKnowledge() async {
    if (!_knowledgeForm.currentState!.validate()) return;
    await _perform(() async {
      final result = await widget.auth.aiRequest(
        '/knowledge',
        method: 'POST',
        body: {
          'title': _title.text.trim(),
          'topic': _knowledgeTopic,
          'content': _content.text.trim(),
        },
      );
      if (!mounted) return;
      setState(() {
        _documents.insert(
          0,
          Map<String, dynamic>.from(result['document'] as Map),
        );
        _messages.clear();
        _title.clear();
        _content.clear();
        _notice = 'Knowledge saved. Your next question can use it.';
      });
    });
  }

  Future<void> _deleteKnowledge(Map<String, dynamic> entry) async {
    if (!await confirm(
          context,
          title: 'Delete knowledge?',
          body: entry['title'] as String,
        ) ||
        !mounted) {
      return;
    }
    await _perform(() async {
      await widget.auth.aiRequest(
        '/knowledge/${entry['id']}',
        method: 'DELETE',
      );
      if (mounted) {
        setState(() {
          _documents.removeWhere((document) => document['id'] == entry['id']);
          _messages.clear();
        });
      }
    });
  }

  Widget _field(
    String label,
    TextEditingController controller, {
    int lines = 1,
    int maxLength = 300,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: TextFormField(
      controller: controller,
      enabled: !_busy && !_loading,
      maxLines: lines,
      maxLength: maxLength,
      decoration: InputDecoration(labelText: label, counterText: ''),
      validator: (value) =>
          value == null || value.trim().isEmpty ? 'Enter $label.' : null,
    ),
  );

  @override
  void dispose() {
    for (final controller in [_question, _title, _content]) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final c = context.lc;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LargeTitle(
          'LifeOS AI',
          subtitle:
              'Ask about your workouts, routines, skin care and spending. Free, no key needed.',
        ),
        LCard(
          hero: true,
          child: Row(
            children: [
              IconTile(Icons.auto_awesome, color: LifeColors.ai),
              const SizedBox(width: 12),
              Expanded(child: Text(_status, style: t.bodyMedium)),
            ],
          ),
        ),
        Text(
          'Your question and the saved entries for the topics you pick are sent to LifeOS AI to answer. Nothing is used for training. It does not give medical or investment advice.',
          style: t.bodySmall,
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final entry in _topicLabels.entries)
              FilterChip(
                label: Text(entry.value),
                selected: _topics.contains(entry.key),
                onSelected: _busy
                    ? null
                    : (selected) => setState(() {
                        selected
                            ? _topics.add(entry.key)
                            : _topics.remove(entry.key);
                        _messages.clear();
                      }),
              ),
          ],
        ),
        const SizedBox(height: 14),
        Form(
          key: _chatForm,
          child: _field('Your question', _question, lines: 3, maxLength: 2000),
        ),
        FilledButton.icon(
          onPressed: _busy || _loading || !_available ? null : _ask,
          icon: const Icon(Icons.send),
          label: Text(_busy ? 'AI is thinking…' : 'Ask AI'),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Banner2(text: _error!, tone: c.danger, icon: Icons.error_outline),
        ],
        if (_notice != null) ...[
          const SizedBox(height: 12),
          Banner2(
            text: _notice!,
            tone: c.primary,
            icon: Icons.check_circle_outline,
          ),
        ],
        const SizedBox(height: 12),
        for (final entry in _messages)
          LCard(
            color: entry['role'] == 'user' ? c.surface2 : null,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry['role'] == 'user' ? 'You' : 'LifeOS AI',
                  style: t.labelMedium,
                ),
                const SizedBox(height: 6),
                SelectableText(entry['content'] as String),
                if (entry['role'] == 'assistant' &&
                    (entry['sources'] as List?)?.isNotEmpty == true)
                  ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: const Text('Data provided to the AI'),
                    children: [
                      for (final source in entry['sources'] as List)
                        ListTile(
                          dense: true,
                          title: Text(
                            '[${source['label']}] ${source['title']}',
                          ),
                          subtitle: Text(source['kind'] as String),
                        ),
                    ],
                  ),
              ],
            ),
          ),
        if (_messages.isNotEmpty)
          TextButton(
            onPressed: _busy ? null : () => setState(_messages.clear),
            child: const Text('Clear chat'),
          ),
        const SectionHeader('What the AI should know'),
        Text(
          'Short notes the AI can use, like your gym plan or skin type.',
          style: t.bodySmall,
        ),
        const SizedBox(height: 10),
        Form(
          key: _knowledgeForm,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _field('Knowledge title', _title, maxLength: 120),
              DropdownButtonFormField<String>(
                initialValue: _knowledgeTopic,
                decoration: const InputDecoration(labelText: 'Knowledge topic'),
                items: [
                  for (final entry in _topicLabels.entries)
                    DropdownMenuItem(
                      value: entry.key,
                      child: Text(entry.value),
                    ),
                ],
                onChanged: _busy
                    ? null
                    : (value) => setState(
                        () => _knowledgeTopic = value ?? _knowledgeTopic,
                      ),
              ),
              const SizedBox(height: 14),
              _field('Knowledge text', _content, lines: 4, maxLength: 10000),
              OutlinedButton(
                onPressed: _busy || _loading ? null : _saveKnowledge,
                child: const Text('Save knowledge'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        for (final entry in _documents)
          LCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(entry['title'] as String, style: t.titleSmall),
                Text(
                  _topicLabels[entry['topic']] ?? '${entry['topic']}',
                  style: t.bodySmall,
                ),
                const SizedBox(height: 6),
                SelectableText(entry['content'] as String),
                TextButton.icon(
                  onPressed: _busy ? null : () => _deleteKnowledge(entry),
                  icon: const Icon(Icons.delete_outline),
                  label: const Text('Delete knowledge'),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
