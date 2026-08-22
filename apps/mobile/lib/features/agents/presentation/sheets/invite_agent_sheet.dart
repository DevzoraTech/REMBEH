import 'package:flutter/material.dart';

import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../../../utils/friendly_errors.dart';
import '../../application/invite_agent.dart';

class InviteAgentSheet extends StatefulWidget {
  const InviteAgentSheet({
    super.key,
    required this.session,
    required this.branchId,
    required this.inviteAgent,
  });

  final RembehSession session;
  final String branchId;
  final InviteAgent inviteAgent;

  @override
  State<InviteAgentSheet> createState() => _InviteAgentSheetState();
}

class _InviteAgentSheetState extends State<InviteAgentSheet> {
  final _nameController = TextEditingController();

  final _emailController = TextEditingController();

  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();

    super.dispose();
  }

  Future<void> _submit() async {
    if (_saving) {
      return;
    }

    final name = _nameController.text.trim();

    final email = _emailController.text.trim();

    if (name.length < 2) {
      setState(() {
        _error = 'Enter the agent’s name.';
      });

      return;
    }

    if (!_looksLikeEmail(email)) {
      setState(() {
        _error = 'Enter a valid email address.';
      });

      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await widget.inviteAgent(
        session: widget.session,
        branchId: widget.branchId,
        displayName: name,
        email: email,
      );

      if (!mounted) {
        return;
      }

      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = friendlyErrorMessage(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 14,
          bottom: MediaQuery.of(context).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: line,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),

            const SizedBox(height: 18),

            Row(
              children: [
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Add agent',
                        style: TextStyle(
                          color: midnightNavy,
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      SizedBox(height: 3),
                      Text(
                        'Send an invitation to join this branch.',
                        style: TextStyle(
                          color: slateText,
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: _saving
                      ? null
                      : () {
                          Navigator.of(context).pop();
                        },
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),

            const SizedBox(height: 18),

            TextField(
              controller: _nameController,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Full name',
                hintText: 'Enter agent name',
              ),
            ),

            const SizedBox(height: 12),

            TextField(
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) {
                _submit();
              },
              decoration: const InputDecoration(
                labelText: 'Email address',
                hintText: 'agent@example.com',
              ),
            ),

            const SizedBox(height: 8),

            const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.mail_outline_rounded, size: 15, color: slateText),
                SizedBox(width: 7),
                Expanded(
                  child: Text(
                    'The agent will receive an email with instructions to set up their account.',
                    style: TextStyle(
                      color: slateText,
                      fontSize: 10,
                      height: 1.4,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),

            if (_error != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(11),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF3F2),
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(
                    color: Color(0xFFB42318),
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],

            const SizedBox(height: 18),

            SizedBox(
              height: 48,
              child: FilledButton(
                onPressed: _saving ? null : _submit,
                child: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Send invite'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

bool _looksLikeEmail(String value) {
  final email = value.trim();

  return email.contains('@') &&
      email.contains('.') &&
      !email.startsWith('@') &&
      !email.endsWith('@');
}
