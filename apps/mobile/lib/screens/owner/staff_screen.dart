import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../services/session_store.dart';
import '../../theme.dart';
import '../../utils/friendly_errors.dart';

class OwnerStaffScreen extends StatefulWidget {
  const OwnerStaffScreen({super.key, required this.session});

  final RembehSession session;

  @override
  State<OwnerStaffScreen> createState() => _OwnerStaffScreenState();
}

class _StaffMember {
  const _StaffMember({
    required this.id,
    required this.name,
    required this.roleName,
    required this.branchId,
    required this.branchName,
    required this.inviteStatus,
  });

  final String id;
  final String name;
  final String roleName;
  final String branchId;
  final String branchName;
  final String inviteStatus;
}

class _StaffTransfer {
  const _StaffTransfer({
    required this.id,
    required this.staffName,
    required this.roleName,
    required this.fromBranchName,
    required this.toBranchName,
    required this.transferredByName,
    required this.transferredAt,
    this.reason,
  });

  final String id;
  final String staffName;
  final String roleName;
  final String fromBranchName;
  final String toBranchName;
  final String transferredByName;
  final DateTime? transferredAt;
  final String? reason;
}

class _OwnerStaffScreenState extends State<OwnerStaffScreen> {
  final _api = ApiClient(SessionStore());
  List<_StaffMember> _staff = const [];
  List<_OwnerOption> _branches = const [];
  List<_StaffTransfer> _transfers = const [];
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
      final branchPayload = await _api.listBranches(widget.session);
      final transferPayload = await _api.listStaffTransfers(widget.session);
      final rawBranches =
          branchPayload['branches'] as List<dynamic>? ?? const [];
      final branches = <_OwnerOption>[];
      final staff = <_StaffMember>[];
      for (final raw in rawBranches.whereType<Map>()) {
        final branchId = raw['id'] as String? ?? '';
        final branchName = raw['name'] as String? ?? 'Branch';
        if (branchId.isEmpty) continue;
        branches.add(_OwnerOption(id: branchId, name: branchName));
        final members = raw['staff'] as List<dynamic>? ?? const [];
        for (final member in members.whereType<Map>()) {
          final id = member['id'] as String? ?? '';
          if (id.isEmpty) continue;
          final roleName = member['roleName'] as String? ?? 'Staff';
          if (roleName.toLowerCase() == 'owner') continue;
          staff.add(
            _StaffMember(
              id: id,
              name: member['name'] as String? ?? 'Staff',
              roleName: roleName,
              branchId: member['branchId'] as String? ?? branchId,
              branchName: branchName,
              inviteStatus: member['inviteStatus'] as String? ?? '',
            ),
          );
        }
      }
      staff.sort((a, b) => a.name.compareTo(b.name));
      branches.sort((a, b) => a.name.compareTo(b.name));

      final rawTransfers =
          transferPayload['transfers'] as List<dynamic>? ?? const [];
      final transfers = rawTransfers.whereType<Map>().map((row) {
        final at = row['transferredAt'] as String?;
        return _StaffTransfer(
          id: row['id'] as String? ?? '',
          staffName: row['staffName'] as String? ?? 'Staff',
          roleName: row['roleName'] as String? ?? 'Staff',
          fromBranchName: row['fromBranchName'] as String? ?? 'Previous branch',
          toBranchName: row['toBranchName'] as String? ?? 'New branch',
          transferredByName: row['transferredByName'] as String? ?? 'Owner',
          transferredAt: at == null ? null : DateTime.tryParse(at),
          reason: row['reason'] as String?,
        );
      }).toList();

      if (!mounted) return;
      setState(() {
        _branches = branches;
        _staff = staff;
        _transfers = transfers;
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

  Future<void> _openTransfer(_StaffMember member) async {
    final destinations =
        _branches.where((branch) => branch.id != member.branchId).toList();
    if (destinations.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add another branch before transferring.')),
      );
      return;
    }
    final result = await showModalBottomSheet<_TransferResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
      builder: (_) => _TransferSheet(
        member: member,
        destinations: destinations,
      ),
    );
    if (result == null || !mounted) return;
    try {
      await _api.transferStaff(
        session: widget.session,
        userId: member.id,
        targetBranchId: result.branchId,
        reason: result.reason,
      );
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${member.name} now works only at the new branch.',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(friendlyErrorMessage(error))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: midnightNavy,
        elevation: 0,
        title: const Text(
          'Staff',
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
        ),
      ),
      body: _loading && _staff.isEmpty
          ? const Center(
              child: CircularProgressIndicator(color: forestEmerald),
            )
          : RefreshIndicator(
              color: forestEmerald,
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
                children: [
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        _error!,
                        style: const TextStyle(
                          color: Color(0xFFB42318),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  const Text(
                    'Managers and field officers keep the same login after a transfer, and they can no longer open the previous branch.',
                    style: TextStyle(
                      color: slateText,
                      fontSize: 12,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 14),
                  _SectionCard(
                    title: 'People',
                    child: _staff.isEmpty
                        ? const Padding(
                            padding: EdgeInsets.all(16),
                            child: Text(
                              'No managers or field officers yet.',
                              style: TextStyle(color: slateText, fontSize: 12),
                            ),
                          )
                        : Column(
                            children: [
                              for (var index = 0; index < _staff.length; index++)
                                _StaffTile(
                                  member: _staff[index],
                                  showDivider: index < _staff.length - 1,
                                  onTransfer: _staff[index].inviteStatus ==
                                          'ACTIVE'
                                      ? () => _openTransfer(_staff[index])
                                      : null,
                                ),
                            ],
                          ),
                  ),
                  const SizedBox(height: 14),
                  _SectionCard(
                    title: 'Transfer audit',
                    child: _transfers.isEmpty
                        ? const Padding(
                            padding: EdgeInsets.all(16),
                            child: Text(
                              'No staff transfers yet.',
                              style: TextStyle(color: slateText, fontSize: 12),
                            ),
                          )
                        : Column(
                            children: [
                              for (var index = 0;
                                  index < _transfers.length;
                                  index++)
                                _TransferTile(
                                  transfer: _transfers[index],
                                  showDivider:
                                      index < _transfers.length - 1,
                                ),
                            ],
                          ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _OwnerOption {
  const _OwnerOption({required this.id, required this.name});

  final String id;
  final String name;
}

class _TransferResult {
  const _TransferResult({required this.branchId, this.reason});

  final String branchId;
  final String? reason;
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
            child: Text(
              title,
              style: const TextStyle(
                color: slateText,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          child,
        ],
      ),
    );
  }
}

class _StaffTile extends StatelessWidget {
  const _StaffTile({
    required this.member,
    required this.showDivider,
    this.onTransfer,
  });

  final _StaffMember member;
  final bool showDivider;
  final VoidCallback? onTransfer;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      member.name,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${member.roleName} · ${member.branchName}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              if (onTransfer != null)
                TextButton(
                  onPressed: onTransfer,
                  child: const Text('Transfer'),
                ),
            ],
          ),
        ),
        if (showDivider)
          const Padding(
            padding: EdgeInsets.only(left: 14),
            child: Divider(height: 1, color: line),
          ),
      ],
    );
  }
}

class _TransferTile extends StatelessWidget {
  const _TransferTile({
    required this.transfer,
    required this.showDivider,
  });

  final _StaffTransfer transfer;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final when = transfer.transferredAt;
    final stamp = when == null
        ? ''
        : '${when.day.toString().padLeft(2, '0')}/${when.month.toString().padLeft(2, '0')}/${when.year}';
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${transfer.staffName} · ${transfer.roleName}',
                style: const TextStyle(
                  color: midnightNavy,
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '${transfer.fromBranchName} → ${transfer.toBranchName}',
                style: const TextStyle(color: slateText, fontSize: 11),
              ),
              Text(
                [
                  transfer.transferredByName,
                  if (stamp.isNotEmpty) stamp,
                  if ((transfer.reason ?? '').isNotEmpty) transfer.reason!,
                ].join(' · '),
                style: const TextStyle(color: slateText, fontSize: 11),
              ),
            ],
          ),
        ),
        if (showDivider)
          const Padding(
            padding: EdgeInsets.only(left: 14),
            child: Divider(height: 1, color: line),
          ),
      ],
    );
  }
}

class _TransferSheet extends StatefulWidget {
  const _TransferSheet({
    required this.member,
    required this.destinations,
  });

  final _StaffMember member;
  final List<_OwnerOption> destinations;

  @override
  State<_TransferSheet> createState() => _TransferSheetState();
}

class _TransferSheetState extends State<_TransferSheet> {
  late String _branchId = widget.destinations.first.id;
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + inset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Transfer ${widget.member.name}',
            style: const TextStyle(
              color: midnightNavy,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'They keep the same account, then work only at the new branch.',
            style: TextStyle(color: slateText, fontSize: 12),
          ),
          const SizedBox(height: 14),
          DropdownButtonFormField<String>(
            initialValue: _branchId,
            decoration: const InputDecoration(
              labelText: 'Move to',
            ),
            items: [
              for (final branch in widget.destinations)
                DropdownMenuItem(
                  value: branch.id,
                  child: Text(branch.name),
                ),
            ],
            onChanged: (value) {
              if (value == null) return;
              _branchId = value;
            },
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _reason,
            minLines: 2,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Reason (optional)',
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () {
              Navigator.of(context).pop(
                _TransferResult(
                  branchId: _branchId,
                  reason: _reason.text.trim().isEmpty
                      ? null
                      : _reason.text.trim(),
                ),
              );
            },
            style: FilledButton.styleFrom(backgroundColor: forestEmerald),
            child: const Text('Transfer'),
          ),
        ],
      ),
    );
  }
}
