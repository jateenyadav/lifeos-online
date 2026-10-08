import 'package:flutter/material.dart';
import '../auth/auth_api.dart';
import '../auth/auth_controller.dart';
import 'shared.dart';

const _topicLabels = {
  'workouts': 'Workouts',
  'routines': 'Routines & skin care',
  'spending': 'Spending',
};

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
  final _model = TextEditingController(text: 'llama3.2:3b');
  final _apiKey = TextEditingController();
  final _region = TextEditingController(text: 'us-east-1');
  final _accessKey = TextEditingController();
  final _secretKey = TextEditingController();
  final _sessionToken = TextEditingController();
  final _title = TextEditingController();
  final _content = TextEditingController();
  final Set<String> _topics = _topicLabels.keys.toSet();
  List<Map<String, dynamic>> _documents = [];
  final List<Map<String, dynamic>> _messages = [];
  String _provider = 'local';
  String _knowledgeTopic = 'workouts';
  String _status = 'Checking local AI...';
  List<String> _models = [];
  bool _consent = false;
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
      final local = results[0]['local'] as Map;
      setState(() {
        _status = local['message'] as String;
        _models = List<String>.from(local['models'] as List);
        _model.text = results[0]['defaultModel'] as String;
        _documents = (results[1]['documents'] as List)
            .map((entry) => Map<String, dynamic>.from(entry as Map))
            .toList();
      });
    } on ApiException catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Could not load Personal AI. Restart the updated server.',
        );
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
        setState(
          () => _error = 'AI request failed. Check the server and try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _changeProvider(String? value) {
    if (value == null) return;
    setState(() {
      _provider = value;
      _apiKey.clear();
      _accessKey.clear();
      _secretKey.clear();
      _sessionToken.clear();
      _consent = false;
      _messages.clear();
      _error = null;
      _model.text = switch (value) {
        'local' => 'llama3.2:3b',
        'openai' => 'gpt-4.1-mini',
        _ => '',
      };
    });
  }

  Future<void> _ask() async {
    if (_provider != 'local' && !widget.auth.api.supportsCloudKeys) {
      setState(
        () => _error =
            'Cloud keys are disabled on this HTTP connection. Use local AI or an HTTPS backend.',
      );
      return;
    }
    if (!_chatForm.currentState!.validate()) return;
    if (_topics.isEmpty || (_provider != 'local' && !_consent)) {
      setState(
        () => _error =
            'Choose a data topic and approve cloud sharing when using cloud AI.',
      );
      return;
    }
    final question = _question.text.trim();
    final body = <String, dynamic>{
      'provider': _provider,
      'model': _model.text.trim(),
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
      if (_provider != 'local') 'cloudConsent': true,
      if (_provider == 'openai') 'credentials': {'apiKey': _apiKey.text.trim()},
      if (_provider == 'bedrock')
        'credentials': {
          'region': _region.text.trim(),
          'accessKeyId': _accessKey.text.trim(),
          'secretAccessKey': _secretKey.text.trim(),
          if (_sessionToken.text.trim().isNotEmpty)
            'sessionToken': _sessionToken.text.trim(),
        },
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
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete knowledge?'),
        content: Text(entry['title'] as String),
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
    if (confirmed != true || !mounted) return;
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
    bool secret = false,
    bool required = true,
    int lines = 1,
    int maxLength = 300,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: TextFormField(
      controller: controller,
      enabled:
          !_busy && !_loading && (!secret || widget.auth.api.supportsCloudKeys),
      obscureText: secret,
      enableSuggestions: !secret,
      autocorrect: !secret,
      maxLines: lines,
      maxLength: maxLength,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
        counterText: '',
      ),
      validator: (value) => required && (value == null || value.trim().isEmpty)
          ? 'Enter $label.'
          : null,
    ),
  );

  @override
  void dispose() {
    for (final controller in [
      _question,
      _model,
      _apiKey,
      _region,
      _accessKey,
      _secretKey,
      _sessionToken,
      _title,
      _content,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Text(
        'Personal AI',
        style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: ink),
      ),
      const SizedBox(height: 10),
      const Text(
        'Ask about your workouts, routines, skin care, and spending. Local AI is the default.',
      ),
      const SizedBox(height: 14),
      const Text(
        'The model reads relevant saved data for each question. This is not model retraining. Chats are not saved.',
      ),
      if (_loading)
        const Padding(
          padding: EdgeInsets.all(18),
          child: LinearProgressIndicator(),
        ),
      if (_error != null)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Text(_error!, style: const TextStyle(color: Colors.red)),
        ),
      if (_notice != null)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Text(_notice!),
        ),
      const SizedBox(height: 20),
      Form(
        key: _chatForm,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _provider,
              decoration: const InputDecoration(
                labelText: 'AI connection',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(
                  value: 'local',
                  child: Text('Local AI (Ollama, no key)'),
                ),
                DropdownMenuItem(
                  value: 'openai',
                  child: Text('OpenAI API key (cloud)'),
                ),
                DropdownMenuItem(
                  value: 'bedrock',
                  child: Text('AWS Bedrock (cloud)'),
                ),
              ],
              onChanged: _busy || _loading ? null : _changeProvider,
            ),
            const SizedBox(height: 14),
            if (_provider == 'local') ...[
              Text(_status),
              const SelectableText('ollama pull llama3.2:3b'),
              const Text(
                'Run Ollama with OLLAMA_NO_CLOUD=1 on your backend computer. Keep MongoDB local too.',
              ),
              TextButton(
                onPressed: _busy || _loading
                    ? null
                    : () => _perform(() async {
                        final result = await widget.auth.aiRequest('/status');
                        if (mounted) {
                          setState(() {
                            _status =
                                (result['local'] as Map)['message'] as String;
                            _models = List<String>.from(
                              (result['local'] as Map)['models'] as List,
                            );
                          });
                        }
                      }),
                child: const Text('Check local AI'),
              ),
              if (_models.isNotEmpty)
                Wrap(
                  spacing: 6,
                  children: _models
                      .map(
                        (model) => ActionChip(
                          label: Text(model),
                          onPressed: _busy
                              ? null
                              : () => setState(() => _model.text = model),
                        ),
                      )
                      .toList(),
                ),
            ],
            _field('Model ID', _model),
            if (_provider == 'openai')
              _field('OpenAI API key', _apiKey, secret: true, maxLength: 500),
            if (_provider == 'bedrock') ...[
              _field('AWS region', _region),
              _field(
                'AWS access key ID',
                _accessKey,
                secret: true,
                maxLength: 128,
              ),
              _field(
                'AWS secret access key',
                _secretKey,
                secret: true,
                maxLength: 200,
              ),
              _field(
                'AWS session token (optional)',
                _sessionToken,
                secret: true,
                required: false,
                maxLength: 4000,
              ),
            ],
            if (_provider != 'local')
              const Text(
                'Cloud mode sends your question, recent chat, and selected data excerpts to the chosen provider. Charges may apply. Keys stay in memory. They clear when you leave AI or switch provider. Real phones need HTTPS for cloud keys.',
              ),
            const SizedBox(height: 14),
            const Text(
              'Data the AI may read',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
            for (final entry in _topicLabels.entries)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(entry.value),
                value: _topics.contains(entry.key),
                onChanged: _busy || _loading
                    ? null
                    : (checked) => setState(() {
                        checked == true
                            ? _topics.add(entry.key)
                            : _topics.remove(entry.key);
                        _consent = false;
                        _messages.clear();
                      }),
              ),
            if (_provider != 'local')
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text(
                  'I agree to send selected data and chat to this cloud provider.',
                ),
                value: _consent,
                onChanged: _busy || _loading
                    ? null
                    : (checked) => setState(() => _consent = checked == true),
              ),
            _field('Your question', _question, lines: 3, maxLength: 2000),
            FilledButton.icon(
              onPressed: _busy || _loading ? null : _ask,
              icon: const Icon(Icons.send_outlined),
              label: Text(_busy ? 'AI is thinking...' : 'Ask AI'),
            ),
          ],
        ),
      ),
      if (_busy)
        const Padding(
          padding: EdgeInsets.all(12),
          child: Text('Working... A local answer can take up to two minutes.'),
        ),
      for (final entry in _messages)
        Card(
          margin: const EdgeInsets.only(top: 14),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry['role'] == 'user'
                      ? 'You'
                      : '${entry['provider']} · ${entry['model']}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                SelectableText(entry['content'] as String),
                if (entry['sources'] != null)
                  ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: const Text('Data provided to the AI'),
                    children: [
                      for (final source in entry['sources'] as List)
                        ListTile(
                          title: Text(
                            '[${source['label']}] ${source['title']}',
                          ),
                          subtitle: Text(source['kind'] as String),
                        ),
                    ],
                  ),
                if (entry['limited'] == true)
                  const Text(
                    'Only the latest 2,000 records per data type were scanned.',
                  ),
              ],
            ),
          ),
        ),
      TextButton(
        onPressed: _busy || _messages.isEmpty
            ? null
            : () => setState(() {
                _messages.clear();
                _consent = false;
              }),
        child: const Text('Clear chat'),
      ),
      const Text(
        'AI can be wrong. Check its sources. This is not medical or financial advice.',
      ),
      const SizedBox(height: 28),
      const Text(
        'Add your own knowledge',
        style: TextStyle(fontSize: 21, fontWeight: FontWeight.w700),
      ),
      const SizedBox(height: 8),
      const Text(
        'Paste a gym plan, skin care details, or spending rules. Tracker data is already included. Up to 100 entries.',
      ),
      const SizedBox(height: 14),
      Form(
        key: _knowledgeForm,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _field('Knowledge title', _title, maxLength: 120),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _knowledgeTopic,
              decoration: const InputDecoration(
                labelText: 'Knowledge topic',
                border: OutlineInputBorder(),
              ),
              items: _topicLabels.entries
                  .map(
                    (entry) => DropdownMenuItem(
                      value: entry.key,
                      child: Text(entry.value),
                    ),
                  )
                  .toList(),
              onChanged: _busy || _loading
                  ? null
                  : (value) => setState(() => _knowledgeTopic = value!),
            ),
            const SizedBox(height: 14),
            _field('Knowledge text', _content, lines: 5, maxLength: 10000),
            FilledButton(
              onPressed: _busy || _loading ? null : _saveKnowledge,
              child: const Text('Save knowledge'),
            ),
          ],
        ),
      ),
      for (final entry in _documents)
        Card(
          margin: const EdgeInsets.only(top: 14),
          child: ExpansionTile(
            title: Text(entry['title'] as String),
            subtitle: Text(_topicLabels[entry['topic']]!),
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: SelectableText(entry['content'] as String),
              ),
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
