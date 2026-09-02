import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../services/session_store.dart';
import '../../theme.dart';
import '../../utils/friendly_errors.dart';

class VoidedClientsScreen extends StatefulWidget {
  const VoidedClientsScreen({super.key, required this.session});

  final RembehSession session;

  @override
  State<VoidedClientsScreen> createState() => _VoidedClientsScreenState();
}

class _VoidedClientsScreenState extends State<VoidedClientsScreen> {
  final _api = ApiClient(SessionStore());
  List<Map<String, dynamic>> _customers = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final customers = await _api.listCustomers(widget.session);
      if (!mounted) return;
      setState(() {
        _customers = customers;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = friendlyErrorMessage(error);
        _loading = false;
      });
    }
  }

  List<Map<String, dynamic>> get _voided => _customers
      .where((item) => (item['voidedAt'] as String?)?.isNotEmpty == true)
      .toList();

  List<Map<String, dynamic>> get _active => _customers
      .where((item) => (item['voidedAt'] as String?)?.isNotEmpty != true)
      .toList();

  Future<void> _voidClient(Map<String, dynamic> customer) async {
    final result = await showModalBottomSheet<Map<String, String>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
      builder: (_) => _VoidDispositionSheet(
        name: customer['fullName'] as String? ?? 'this client',
      ),
    );
    if (result == null || !mounted) return;
    try {
      await _api.voidCustomer(
        session: widget.session,
        customerId: customer['id'] as String,
        disposition: result['disposition']!,
        reason: result['reason'],
      );
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Client set aside from daily collections.')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(friendlyErrorMessage(error))),
      );
    }
  }

  Future<void> _restore(Map<String, dynamic> customer) async {
    try {
      await _api.restoreCustomer(
        session: widget.session,
        customerId: customer['id'] as String,
      );
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Client restored to collections.')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(friendlyErrorMessage(error))),
      );
    }
  }

  Future<void> _pickClientToVoid() async {
    final selected = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
      builder: (_) => _PickClientSheet(customers: _active),
    );
    if (selected == null || !mounted) return;
    await _voidClient(selected);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(title: const Text('Voided clients')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _active.isEmpty ? null : _pickClientToVoid,
        backgroundColor: forestEmerald,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.person_off_outlined),
        label: const Text('Void a client'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: forestEmerald))
          : _error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_error!, textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    TextButton(onPressed: _load, child: const Text('Try again')),
                  ],
                ),
              ),
            )
          : RefreshIndicator(
              color: forestEmerald,
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                children: [
                  Text(
                    'Voided clients are set aside from daily collections. '
                    'Blacklisted clients cannot receive a new loan. Warning is a caution flag.',
                    style: TextStyle(
                      color: slateText.withValues(alpha: 0.75),
                      fontSize: 13,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (_voided.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        border: Border.all(color: line),
                        borderRadius: rembehBorderRadius(rembehRadiusLg),
                      ),
                      child: const Text(
                        'No clients are set aside yet.',
                        style: TextStyle(color: slateText),
                      ),
                    )
                  else
                    ..._voided.map((customer) {
                      final blacklisted =
                          customer['voidDisposition'] == 'BLACKLISTED';
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Material(
                          color: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: rembehBorderRadius(rembehRadiusLg),
                            side: const BorderSide(color: line),
                          ),
                          child: ListTile(
                            title: Text(
                              customer['fullName'] as String? ?? 'Client',
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                color: midnightNavy,
                              ),
                            ),
                            subtitle: Text(
                              [
                                blacklisted ? 'Blacklisted' : 'Warning',
                                customer['phone'] as String? ?? '',
                                customer['voidReason'] as String? ?? '',
                              ].where((item) => item.isNotEmpty).join(' · '),
                              style: const TextStyle(fontSize: 12),
                            ),
                            trailing: TextButton(
                              onPressed: () => _restore(customer),
                              child: const Text('Restore'),
                            ),
                          ),
                        ),
                      );
                    }),
                ],
              ),
            ),
    );
  }
}

class _PickClientSheet extends StatefulWidget {
  const _PickClientSheet({required this.customers});

  final List<Map<String, dynamic>> customers;

  @override
  State<_PickClientSheet> createState() => _PickClientSheetState();
}

class _PickClientSheetState extends State<_PickClientSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final needle = _query.trim().toLowerCase();
    final matches = widget.customers.where((customer) {
      if (needle.isEmpty) return true;
      final haystack = [
        customer['fullName'],
        customer['phone'],
        customer['nationalId'],
      ].join(' ').toLowerCase();
      return haystack.contains(needle);
    }).toList();

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.72,
        child: Column(
          children: [
            const SizedBox(height: 8),
            Container(width: 40, height: 4, color: line),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
              child: TextField(
                autofocus: true,
                onChanged: (value) => setState(() => _query = value),
                decoration: const InputDecoration(
                  hintText: 'Search client to void',
                  prefixIcon: Icon(Icons.search),
                ),
              ),
            ),
            Expanded(
              child: ListView.builder(
                itemCount: matches.length,
                itemBuilder: (context, index) {
                  final customer = matches[index];
                  return ListTile(
                    title: Text(customer['fullName'] as String? ?? 'Client'),
                    subtitle: Text(customer['phone'] as String? ?? ''),
                    onTap: () => Navigator.of(context).pop(customer),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _VoidDispositionSheet extends StatefulWidget {
  const _VoidDispositionSheet({required this.name});

  final String name;

  @override
  State<_VoidDispositionSheet> createState() => _VoidDispositionSheetState();
}

class _VoidDispositionSheetState extends State<_VoidDispositionSheet> {
  String _disposition = 'WARNING';
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        12,
        16,
        16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(child: Container(width: 40, height: 4, color: line)),
          const SizedBox(height: 14),
          Text(
            'Void ${widget.name}',
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: midnightNavy,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Set this client aside from daily collections and mark them.',
            style: TextStyle(color: slateText, fontSize: 13),
          ),
          const SizedBox(height: 12),
          _DispositionOption(
            selected: _disposition == 'WARNING',
            title: 'Warning',
            subtitle: 'Caution flag. Hidden from daily due lists.',
            onTap: () => setState(() => _disposition = 'WARNING'),
          ),
          _DispositionOption(
            selected: _disposition == 'BLACKLISTED',
            title: 'Blacklisted',
            subtitle: 'Block new loans and hide from daily due lists.',
            onTap: () => setState(() => _disposition = 'BLACKLISTED'),
          ),
          TextField(
            controller: _reason,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: 'Reason (optional)',
            ),
          ),
          const SizedBox(height: 14),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop({
              'disposition': _disposition,
              'reason': _reason.text,
            }),
            style: ElevatedButton.styleFrom(
              backgroundColor: forestEmerald,
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(46),
            ),
            child: const Text('Void client'),
          ),
        ],
      ),
    );
  }
}

class _DispositionOption extends StatelessWidget {
  const _DispositionOption({
    required this.selected,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final bool selected;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: selected ? sage : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: rembehBorderRadius(rembehRadiusMd),
          side: BorderSide(color: selected ? forestEmerald : line),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: rembehBorderRadius(rembehRadiusMd),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Icon(
                  selected
                      ? Icons.radio_button_checked
                      : Icons.radio_button_off,
                  color: forestEmerald,
                  size: 20,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          color: midnightNavy,
                        ),
                      ),
                      Text(
                        subtitle,
                        style: const TextStyle(fontSize: 12, color: slateText),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
