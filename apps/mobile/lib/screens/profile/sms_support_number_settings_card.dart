import 'package:flutter/material.dart';

import '../../../services/api_client.dart';
import '../../../services/session_store.dart';
import '../../../theme.dart';
import '../../../utils/friendly_errors.dart';

/// Owner-only: choose the support phone used in borrower SMS.
class SmsSupportNumberSettingsCard extends StatefulWidget {
  const SmsSupportNumberSettingsCard({super.key, required this.session});

  final RembehSession session;

  @override
  State<SmsSupportNumberSettingsCard> createState() =>
      _SmsSupportNumberSettingsCardState();
}

class _SmsSupportNumberSettingsCardState
    extends State<SmsSupportNumberSettingsCard> {
  final _phoneController = TextEditingController();
  final _api = ApiClient(SessionStore());

  bool _loading = true;
  bool _saving = false;
  bool _usingCustom = false;
  bool _canEdit = false;
  String? _ownerPhone;
  String? _resolvedPhone;
  String? _error;
  String? _notice;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final payload = await _api.getSmsNotificationSettings(
        session: widget.session,
      );
      final support = payload['supportContact'];
      final supportMap = support is Map
          ? Map<String, dynamic>.from(support)
          : <String, dynamic>{};
      final ownerPhone = (supportMap['ownerPhone'] as String?)?.trim();
      final custom = (payload['supportPhone'] as String?)?.trim();
      final resolved = (supportMap['resolvedPhone'] as String?)?.trim();
      if (!mounted) return;
      setState(() {
        _ownerPhone = (ownerPhone != null && ownerPhone.isNotEmpty)
            ? ownerPhone
            : null;
        _resolvedPhone = (resolved != null && resolved.isNotEmpty)
            ? resolved
            : null;
        _usingCustom = supportMap['usingCustomPhone'] == true;
        _canEdit = supportMap['canEditPhone'] == true;
        _phoneController.text =
            (custom != null && custom.isNotEmpty)
            ? custom
            : (_ownerPhone ?? '');
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = friendlyErrorMessage(error);
      });
    }
  }

  Future<void> _save({required bool clear}) async {
    if (_saving || !_canEdit) return;
    setState(() {
      _saving = true;
      _error = null;
      _notice = null;
    });
    try {
      final payload = await _api.updateSmsNotificationSettings(
        session: widget.session,
        clearSupportPhone: clear,
        supportPhone: clear ? null : _phoneController.text.trim(),
      );
      final support = payload['supportContact'];
      final supportMap = support is Map
          ? Map<String, dynamic>.from(support)
          : <String, dynamic>{};
      final ownerPhone = (supportMap['ownerPhone'] as String?)?.trim();
      final custom = (payload['supportPhone'] as String?)?.trim();
      final resolved = (supportMap['resolvedPhone'] as String?)?.trim();
      if (!mounted) return;
      setState(() {
        _ownerPhone = (ownerPhone != null && ownerPhone.isNotEmpty)
            ? ownerPhone
            : null;
        _resolvedPhone = (resolved != null && resolved.isNotEmpty)
            ? resolved
            : null;
        _usingCustom = supportMap['usingCustomPhone'] == true;
        _phoneController.text =
            (custom != null && custom.isNotEmpty)
            ? custom
            : (_ownerPhone ?? '');
        _notice = clear
            ? 'Support number reset to your owner phone.'
            : 'Support number saved.';
        _saving = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = friendlyErrorMessage(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE6EBF0)),
      ),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: const Color(0xFFEDF4FF),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.phone_in_talk_rounded,
                  color: Color(0xFF3475DE),
                  size: 18,
                ),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Client SMS support number',
                      style: TextStyle(
                        color: midnightNavy,
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Shown in loan and payment messages to new clients.',
                      style: TextStyle(
                        color: slateText,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (_loading) ...[
            const SizedBox(height: 14),
            const Center(
              child: SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2.4),
              ),
            ),
          ] else ...[
            const SizedBox(height: 12),
            Text(
              _ownerPhone == null
                  ? 'Default: your owner account phone'
                  : 'Default: your owner phone ($_ownerPhone)',
              style: TextStyle(
                color: slateText.withValues(alpha: 0.85),
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _phoneController,
              enabled: _canEdit && !_saving,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Number shown to clients',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: !_canEdit || _saving
                        ? null
                        : () => _save(clear: false),
                    style: FilledButton.styleFrom(
                      backgroundColor: forestEmerald,
                      foregroundColor: Colors.white,
                    ),
                    child: Text(_saving ? 'Saving…' : 'Save number'),
                  ),
                ),
                if (_usingCustom) ...[
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: !_canEdit || _saving
                          ? null
                          : () => _save(clear: true),
                      child: const Text('Use my number'),
                    ),
                  ),
                ],
              ],
            ),
            if (_resolvedPhone != null) ...[
              const SizedBox(height: 8),
              Text(
                'Currently used: $_resolvedPhone'
                '${_usingCustom ? ' · custom' : ' · owner default'}',
                style: const TextStyle(
                  color: midnightNavy,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
            if (!_canEdit) ...[
              const SizedBox(height: 8),
              const Text(
                'Only the organisation owner can change this number.',
                style: TextStyle(
                  color: Color(0xFFB54708),
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ],
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: const TextStyle(
                color: Color(0xFFB42318),
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          if (_notice != null) ...[
            const SizedBox(height: 8),
            Text(
              _notice!,
              style: const TextStyle(
                color: forestEmerald,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
