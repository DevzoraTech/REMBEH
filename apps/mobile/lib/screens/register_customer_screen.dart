import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../services/session_store.dart';

class RegisterCustomerScreen extends StatefulWidget {
  const RegisterCustomerScreen({super.key, required this.session});

  final RembehSession session;

  @override
  State<RegisterCustomerScreen> createState() => _RegisterCustomerScreenState();
}

class _RegisterCustomerScreenState extends State<RegisterCustomerScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _nationalId = TextEditingController();
  final _api = ApiClient(SessionStore());

  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _nationalId.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final phone = _phone.text.trim();
    if (_name.text.trim().isEmpty) {
      setState(() => _error = 'Name is required.');
      return;
    }
    if (!phone.startsWith('+') || phone.length < 10) {
      setState(() => _error = 'Use international phone, e.g. +2567...');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await _api.createCustomer(
        session: widget.session,
        fullName: _name.text,
        phone: phone,
        nationalId: _nationalId.text,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New customer')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Full name'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Phone (+256...)'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _nationalId,
            decoration: const InputDecoration(labelText: 'National ID (optional)'),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              color: const Color(0xFFFFEBEE),
              child: Text(_error!, style: const TextStyle(color: Color(0xFFB71C1C))),
            ),
          ],
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _loading ? null : _submit,
            child: _loading
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('Save customer'),
          ),
        ],
      ),
    );
  }
}
