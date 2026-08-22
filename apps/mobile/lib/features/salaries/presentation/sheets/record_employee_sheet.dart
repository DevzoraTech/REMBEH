import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../../domain/models/salary_models.dart';
import '../utils/salary_formatters.dart';

const _employeeRoleOptions = ['Field Officer', 'Cashier', 'Manager'];

class RecordEmployeeSheet extends StatefulWidget {
  const RecordEmployeeSheet({
    super.key,
    required this.agentCandidates,
    this.initialEmployee,
    this.branchId,
  });

  final List<SalaryAgentCandidate> agentCandidates;
  final SalaryEmployee? initialEmployee;
  final String? branchId;

  @override
  State<RecordEmployeeSheet> createState() => _RecordEmployeeSheetState();
}

class _RecordEmployeeSheetState extends State<RecordEmployeeSheet> {
  late final TextEditingController _fullName;
  late final TextEditingController _phone;
  late final TextEditingController _email;
  late final TextEditingController _nin;
  late final TextEditingController _role;
  late final TextEditingController _monthlySalary;
  late final TextEditingController _paymentProvider;
  late final TextEditingController _paymentAccountName;
  late final TextEditingController _paymentAccountNumber;
  late final TextEditingController _notes;

  final _formKey = GlobalKey<FormState>();

  DateTime _dateJoined = DateTime.now();

  String _status = 'ACTIVE';
  String _paymentMethod = 'CASH';

  SalaryAgentCandidate? _matchedAgent;

  bool get _editing => widget.initialEmployee != null;

  @override
  void initState() {
    super.initState();

    final employee = widget.initialEmployee;

    _fullName = TextEditingController(text: employee?.fullName ?? '');

    _phone = TextEditingController(text: _displayPhone(employee?.phone));

    _email = TextEditingController(text: employee?.email ?? '');

    _nin = TextEditingController(text: employee?.ninNumber ?? '');

    _role = TextEditingController(
      text: _roleOptionFrom(employee?.roleName) ?? '',
    );

    _monthlySalary = TextEditingController(
      text: employee == null || employee.monthlySalary <= 0
          ? ''
          : employee.monthlySalary.round().toString(),
    );

    _paymentProvider = TextEditingController(
      text: employee?.paymentProvider ?? '',
    );

    _paymentAccountName = TextEditingController(
      text: employee?.paymentAccountName ?? '',
    );

    _paymentAccountNumber = TextEditingController(
      text: employee?.paymentAccountNumber ?? '',
    );

    _notes = TextEditingController(text: employee?.notes ?? '');

    _dateJoined = employee?.dateJoined ?? DateTime.now();

    _status = employee?.status.toUpperCase() ?? 'ACTIVE';
    _paymentMethod = employee?.paymentMethod?.toUpperCase() ?? 'CASH';
  }

  @override
  void dispose() {
    _fullName.dispose();
    _phone.dispose();
    _email.dispose();
    _nin.dispose();
    _role.dispose();
    _monthlySalary.dispose();
    _paymentProvider.dispose();
    _paymentAccountName.dispose();
    _paymentAccountNumber.dispose();
    _notes.dispose();

    super.dispose();
  }

  // ===========================================================================
  // IDENTITY LOOKUP
  // ===========================================================================

  void _identityChanged() {
    if (_editing || _matchedAgent == null) {
      return;
    }

    setState(() {
      _matchedAgent = null;
    });
  }

  void _applyMatchedAgent(SalaryAgentCandidate candidate) {
    _fullName.text = candidate.name;

    if ((candidate.phone ?? '').trim().isNotEmpty) {
      _phone.text = _displayPhone(candidate.phone);
    }

    if ((candidate.email ?? '').trim().isNotEmpty) {
      _email.text = candidate.email!.trim();
    }

    final role = _roleOptionFrom(candidate.roleName);

    if (role != null) {
      _role.text = role;
    }
  }

  void _selectAgentCandidate(SalaryAgentCandidate? candidate) {
    setState(() {
      _matchedAgent = candidate;
    });

    if (candidate != null) {
      _applyMatchedAgent(candidate);
    }
  }

  // ===========================================================================
  // DATE
  // ===========================================================================

  Future<void> _pickJoinedDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dateJoined,
      firstDate: DateTime(1980),
      lastDate: DateTime.now(),
    );

    if (picked == null || !mounted) {
      return;
    }

    setState(() {
      _dateJoined = picked;
    });
  }

  // ===========================================================================
  // SAVE
  // ===========================================================================

  void _save() {
    FocusScope.of(context).unfocus();

    if (!_formKey.currentState!.validate()) {
      return;
    }

    final salary = num.tryParse(_monthlySalary.text.replaceAll(',', '').trim());

    if (salary == null || salary <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid monthly salary.')),
      );
      return;
    }

    final phone = _apiPhone(_phone.text);

    Navigator.of(context).pop(<String, dynamic>{
      if (_matchedAgent != null) 'agentUserId': _matchedAgent!.id,

      if (!_editing && (widget.branchId ?? '').trim().isNotEmpty)
        'branchId': widget.branchId!.trim(),

      'fullName': _fullName.text.trim(),

      'phone': phone,

      if (_email.text.trim().isNotEmpty) 'email': _email.text.trim(),

      if (_nin.text.trim().isNotEmpty) 'ninNumber': _nin.text.trim(),

      if (_role.text.trim().isNotEmpty) 'roleName': _role.text.trim(),

      'monthlySalary': salary,

      'dateJoined': _dateOnly(_dateJoined),

      'status': _status,

      'paymentMethod': _paymentMethod,

      if (_paymentProvider.text.trim().isNotEmpty)
        'paymentProvider': _paymentProvider.text.trim(),

      if (_paymentAccountName.text.trim().isNotEmpty)
        'paymentAccountName': _paymentAccountName.text.trim(),

      if (_paymentAccountNumber.text.trim().isNotEmpty)
        'paymentAccountNumber': _paymentAccountNumber.text.trim(),

      if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
    });
  }

  // ===========================================================================
  // BUILD
  // ===========================================================================

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,

      appBar: AppBar(
        automaticallyImplyLeading: false,
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        toolbarHeight: 66,

        leading: IconButton(
          onPressed: () {
            Navigator.of(context).maybePop();
          },
          icon: const Icon(
            Icons.arrow_back_rounded,
            color: midnightNavy,
            size: 24,
          ),
        ),

        titleSpacing: 2,

        title: Text(
          _editing ? 'Edit Employee' : 'Record Employee',
          style: const TextStyle(
            color: midnightNavy,
            fontSize: 18,
            fontWeight: FontWeight.w900,
          ),
        ),

        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: line),
        ),
      ),

      body: SafeArea(
        top: false,
        child: Form(
          key: _formKey,
          child: ListView(
            padding: EdgeInsets.fromLTRB(
              20,
              20,
              20,
              MediaQuery.of(context).viewInsets.bottom + 24,
            ),
            children: [
              const _SectionTitle(title: 'Identity details'),

              const SizedBox(height: 12),

              if (!_editing) ...[
                const _FieldLabel(
                  label: 'Select existing field officer (optional)',
                ),

                const SizedBox(height: 6),

                DropdownButtonFormField<SalaryAgentCandidate?>(
                  key: ValueKey(_matchedAgent?.id ?? 'new-employee'),
                  initialValue: _matchedAgent,
                  isExpanded: true,
                  decoration: _fieldDecoration(
                    hint: widget.agentCandidates.isEmpty
                        ? 'No available field officers to link'
                        : 'Choose a field officer to link',
                    prefixIcon: Icons.people_alt_outlined,
                  ),
                  icon: const Icon(Icons.keyboard_arrow_down_rounded),
                  items: [
                    for (final candidate in widget.agentCandidates)
                      DropdownMenuItem<SalaryAgentCandidate?>(
                        value: candidate,
                        child: Text(
                          [
                            candidate.name,
                            if ((candidate.phone ?? '').trim().isNotEmpty)
                              _displayPhone(candidate.phone),
                          ].join(' - '),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                  ],
                  onChanged: widget.agentCandidates.isEmpty
                      ? null
                      : _selectAgentCandidate,
                ),

                const SizedBox(height: 12),

                const _OrDivider(),

                const SizedBox(height: 12),

                const _CreateNewEmployeePrompt(),

                const SizedBox(height: 16),
              ],

              _RequiredLabel(label: 'Full name'),

              const SizedBox(height: 6),

              TextFormField(
                controller: _fullName,
                onChanged: (_) {
                  _identityChanged();
                },
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                decoration: _fieldDecoration(hint: 'Enter full name'),
                validator: (value) {
                  if ((value ?? '').trim().length < 2) {
                    return 'Enter the employee name.';
                  }

                  return null;
                },
              ),

              const SizedBox(height: 15),

              const _RequiredLabel(label: 'Phone number'),

              const SizedBox(height: 6),

              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    height: 48,
                    padding: const EdgeInsets.symmetric(horizontal: 11),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border.all(color: line),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Row(
                      children: [
                        Text(
                          '+256',
                          style: TextStyle(
                            color: midnightNavy,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        SizedBox(width: 5),
                        Icon(
                          Icons.keyboard_arrow_down_rounded,
                          size: 17,
                          color: slateText,
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(width: 8),

                  Expanded(
                    child: TextFormField(
                      controller: _phone,
                      onChanged: (_) {
                        _identityChanged();
                      },
                      keyboardType: TextInputType.phone,
                      textInputAction: TextInputAction.next,
                      decoration: _fieldDecoration(hint: 'Enter phone number'),
                      validator: (value) {
                        final normalized = _normalizePhone(value ?? '');

                        if (normalized.length < 9) {
                          return 'Enter a valid phone number.';
                        }

                        return null;
                      },
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 15),

              const _FieldLabel(label: 'Email (optional)'),

              const SizedBox(height: 6),

              TextFormField(
                controller: _email,
                onChanged: (_) {
                  _identityChanged();
                },
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                decoration: _fieldDecoration(
                  hint: 'Enter email address',
                  prefixIcon: Icons.mail_outline_rounded,
                ),
                validator: (value) {
                  final email = (value ?? '').trim();

                  if (email.isEmpty) {
                    return null;
                  }

                  if (!email.contains('@') || !email.contains('.')) {
                    return 'Enter a valid email address.';
                  }

                  return null;
                },
              ),

              const SizedBox(height: 15),

              const _RequiredLabel(label: 'NIN number'),

              const SizedBox(height: 6),

              TextFormField(
                controller: _nin,
                onChanged: (_) {
                  _identityChanged();
                },
                textCapitalization: TextCapitalization.characters,
                textInputAction: TextInputAction.done,
                decoration: _fieldDecoration(
                  hint: 'Enter NIN number',
                  prefixIcon: Icons.badge_outlined,
                ),
                validator: (value) {
                  if ((value ?? '').trim().length < 5) {
                    return 'Enter the NIN number.';
                  }

                  return null;
                },
              ),

              const SizedBox(height: 18),

              const _SectionTitle(title: 'Employment details'),

              const SizedBox(height: 12),

              const _RequiredLabel(label: 'Date joined'),

              const SizedBox(height: 6),

              _DateField(
                value: salaryDate(_dateJoined),
                onTap: _pickJoinedDate,
              ),

              const SizedBox(height: 15),

              const _RequiredLabel(label: 'Role / app access'),

              const SizedBox(height: 6),

              DropdownButtonFormField<String>(
                key: ValueKey('employee-role-${_role.text}'),
                initialValue: _roleOptionFrom(_role.text),
                isExpanded: true,
                decoration: _fieldDecoration(
                  hint: 'Select app access role',
                  prefixIcon: Icons.work_outline_rounded,
                ),
                icon: const Icon(Icons.keyboard_arrow_down_rounded),
                items: _employeeRoleOptions
                    .map(
                      (role) =>
                          DropdownMenuItem(value: role, child: Text(role)),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value == null) {
                    return;
                  }

                  setState(() {
                    _role.text = value;
                  });
                },
                validator: (value) {
                  if (_roleOptionFrom(value) == null) {
                    return 'Select the employee app access role.';
                  }

                  return null;
                },
              ),

              const SizedBox(height: 15),

              const _RequiredLabel(label: 'Monthly salary'),

              const SizedBox(height: 6),

              TextFormField(
                controller: _monthlySalary,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.next,
                decoration: _fieldDecoration(
                  hint: 'Enter monthly salary',
                  prefixText: 'UGX  ',
                ),
                validator: (value) {
                  final amount = num.tryParse(
                    (value ?? '').replaceAll(',', '').trim(),
                  );

                  if (amount == null || amount <= 0) {
                    return 'Enter a valid monthly salary.';
                  }

                  return null;
                },
              ),

              const SizedBox(height: 15),

              const _FieldLabel(label: 'Payment method'),

              const SizedBox(height: 6),

              DropdownButtonFormField<String>(
                initialValue: _paymentMethod,
                decoration: _fieldDecoration(
                  prefixIcon: Icons.account_balance_wallet_outlined,
                ),
                icon: const Icon(Icons.keyboard_arrow_down_rounded),
                items: const [
                  DropdownMenuItem(value: 'CASH', child: Text('Cash')),
                  DropdownMenuItem(
                    value: 'MOBILE_MONEY',
                    child: Text('Mobile Money'),
                  ),
                  DropdownMenuItem(
                    value: 'BANK_TRANSFER',
                    child: Text('Bank transfer'),
                  ),
                  DropdownMenuItem(value: 'OTHER', child: Text('Other')),
                ],
                onChanged: (value) {
                  if (value == null) {
                    return;
                  }

                  setState(() {
                    _paymentMethod = value;
                  });
                },
              ),

              const SizedBox(height: 15),

              if (_paymentMethod != 'CASH') ...[
                const _FieldLabel(label: 'Payment provider (optional)'),

                const SizedBox(height: 6),

                TextFormField(
                  controller: _paymentProvider,
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.next,
                  decoration: _fieldDecoration(
                    hint: _paymentProviderHint(_paymentMethod),
                    prefixIcon: Icons.business_outlined,
                  ),
                ),

                const SizedBox(height: 15),

                const _FieldLabel(label: 'Account name (optional)'),

                const SizedBox(height: 6),

                TextFormField(
                  controller: _paymentAccountName,
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.next,
                  decoration: _fieldDecoration(
                    hint: 'Enter account holder name',
                    prefixIcon: Icons.person_outline_rounded,
                  ),
                ),

                const SizedBox(height: 15),

                const _FieldLabel(label: 'Account number (optional)'),

                const SizedBox(height: 6),

                TextFormField(
                  controller: _paymentAccountNumber,
                  keyboardType: TextInputType.text,
                  textInputAction: TextInputAction.next,
                  decoration: _fieldDecoration(
                    hint: 'Enter phone, bank account, or wallet number',
                    prefixIcon: Icons.numbers_rounded,
                  ),
                ),

                const SizedBox(height: 15),
              ],

              const _FieldLabel(label: 'Notes (optional)'),

              const SizedBox(height: 6),

              TextFormField(
                controller: _notes,
                textCapitalization: TextCapitalization.sentences,
                textInputAction: TextInputAction.newline,
                minLines: 2,
                maxLines: 4,
                decoration: _fieldDecoration(
                  hint: 'Enter salary or payment notes',
                  prefixIcon: Icons.notes_outlined,
                ),
              ),

              const SizedBox(height: 15),

              const _RequiredLabel(label: 'Employment status'),

              const SizedBox(height: 6),

              DropdownButtonFormField<String>(
                initialValue: _status,
                decoration: _fieldDecoration(),
                icon: const Icon(Icons.keyboard_arrow_down_rounded),
                items: const [
                  DropdownMenuItem(
                    value: 'ACTIVE',
                    child: Row(
                      children: [
                        _StatusDot(color: forestEmerald),
                        SizedBox(width: 8),
                        Text('Active'),
                      ],
                    ),
                  ),
                  DropdownMenuItem(
                    value: 'INACTIVE',
                    child: Row(
                      children: [
                        _StatusDot(color: Color(0xFFF79009)),
                        SizedBox(width: 8),
                        Text('Inactive'),
                      ],
                    ),
                  ),
                  DropdownMenuItem(
                    value: 'SUSPENDED',
                    child: Row(
                      children: [
                        _StatusDot(color: Color(0xFFD92D20)),
                        SizedBox(width: 8),
                        Text('Suspended'),
                      ],
                    ),
                  ),
                ],
                onChanged: (value) {
                  if (value == null) {
                    return;
                  }

                  setState(() {
                    _status = value;
                  });
                },
              ),

              const SizedBox(height: 24),

              SizedBox(
                height: 48,
                child: FilledButton(
                  onPressed: _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF075CD8),
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: const Color(0xFFE5E7EB),
                    disabledForegroundColor: const Color(0xFF98A2B3),
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(7),
                    ),
                  ),
                  child: Text(
                    _editing ? 'Save changes' : 'Save employee',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// MANUAL CREATION CUE
// =============================================================================

class _OrDivider extends StatelessWidget {
  const _OrDivider();

  @override
  Widget build(BuildContext context) {
    return const Row(
      children: [
        Expanded(child: Divider(height: 1, color: line)),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: 10),
          child: Text(
            'or',
            style: TextStyle(
              color: slateText,
              fontSize: 9,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        Expanded(child: Divider(height: 1, color: line)),
      ],
    );
  }
}

class _CreateNewEmployeePrompt extends StatelessWidget {
  const _CreateNewEmployeePrompt();

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 30,
          height: 30,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: const Color(0xFFF2F6FF),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Icon(
            Icons.person_add_alt_1_outlined,
            color: Color(0xFF175CD3),
            size: 16,
          ),
        ),
        const SizedBox(width: 9),
        const Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Create new employee',
                style: TextStyle(
                  color: midnightNavy,
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                ),
              ),
              SizedBox(height: 2),
              Text(
                'Leave the selector empty to create a new employee record.',
                style: TextStyle(
                  color: slateText,
                  fontSize: 8.5,
                  height: 1.3,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// =============================================================================
// COMMON UI
// =============================================================================

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(
        color: Color(0xFF175CD3),
        fontSize: 10,
        fontWeight: FontWeight.w900,
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: const TextStyle(
        color: midnightNavy,
        fontSize: 9,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

class _RequiredLabel extends StatelessWidget {
  const _RequiredLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(
            text: label,
            style: const TextStyle(
              color: midnightNavy,
              fontSize: 9,
              fontWeight: FontWeight.w700,
            ),
          ),

          const TextSpan(
            text: ' *',
            style: TextStyle(
              color: Color(0xFFD92D20),
              fontSize: 9,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({required this.value, required this.onTap});

  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          height: 48,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            border: Border.all(color: line),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              const Icon(
                Icons.calendar_today_outlined,
                color: slateText,
                size: 17,
              ),

              const SizedBox(width: 10),

              Expanded(
                child: Text(
                  value,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),

              const Icon(Icons.close_rounded, color: slateText, size: 16),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 7,
      height: 7,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}

InputDecoration _fieldDecoration({
  String? hint,
  IconData? prefixIcon,
  String? prefixText,
}) {
  return InputDecoration(
    hintText: hint,
    hintStyle: const TextStyle(
      color: Color(0xFF98A2B3),
      fontSize: 9.5,
      fontWeight: FontWeight.w500,
    ),
    prefixIcon: prefixIcon == null
        ? null
        : Icon(prefixIcon, color: slateText, size: 17),
    prefixText: prefixText,
    prefixStyle: const TextStyle(
      color: midnightNavy,
      fontSize: 10,
      fontWeight: FontWeight.w700,
    ),
    filled: true,
    fillColor: Colors.white,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(color: line),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(color: Color(0xFF175CD3), width: 1.2),
    ),
    errorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(color: Color(0xFFD92D20)),
    ),
    focusedErrorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(color: Color(0xFFD92D20)),
    ),
    errorStyle: const TextStyle(fontSize: 8),
  );
}

// =============================================================================
// HELPERS
// =============================================================================

String _normalizePhone(String value) {
  var digits = value.replaceAll(RegExp(r'[^0-9]'), '');

  if (digits.startsWith('256')) {
    digits = digits.substring(3);
  }

  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  return digits;
}

String _apiPhone(String value) {
  final local = _normalizePhone(value);

  if (local.isEmpty) {
    return '';
  }

  return '+256$local';
}

String _paymentProviderHint(String method) {
  return switch (method) {
    'MOBILE_MONEY' => 'e.g. MTN Mobile Money or Airtel Money',
    'BANK_TRANSFER' => 'e.g. Stanbic, Centenary, Equity',
    _ => 'Enter provider',
  };
}

String _displayPhone(String? value) {
  if (value == null || value.trim().isEmpty) {
    return '';
  }

  return _normalizePhone(value);
}

String _dateOnly(DateTime value) {
  final year = value.year.toString().padLeft(4, '0');
  final month = value.month.toString().padLeft(2, '0');
  final day = value.day.toString().padLeft(2, '0');

  return '$year-$month-$day';
}

String? _roleOptionFrom(String? value) {
  final clean = value?.trim();

  if (clean == null || clean.isEmpty) {
    return null;
  }

  final normalized = clean.toLowerCase();

  if (normalized == 'field officer' ||
      normalized == 'field agent' ||
      normalized == 'agent' ||
      normalized == 'loan officer' ||
      normalized == 'recovery officer') {
    return 'Field Officer';
  }

  if (normalized == 'cashier') {
    return 'Cashier';
  }

  if (normalized == 'manager' || normalized == 'branch manager') {
    return 'Manager';
  }

  return null;
}
