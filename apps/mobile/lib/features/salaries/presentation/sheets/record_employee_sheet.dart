import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../../domain/models/salary_models.dart';
import '../utils/salary_formatters.dart';
import '../widgets/salary_avatar.dart';

class RecordEmployeeSheet extends StatefulWidget {
  const RecordEmployeeSheet({
    super.key,
    required this.agentCandidates,
    this.initialEmployee,
  });

  final List<SalaryAgentCandidate> agentCandidates;
  final SalaryEmployee? initialEmployee;

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

  final _formKey = GlobalKey<FormState>();

  DateTime _dateJoined = DateTime.now();

  String _status = 'ACTIVE';

  SalaryAgentCandidate? _matchedAgent;

  bool _lookupCompleted = false;
  bool _checking = false;

  bool get _editing => widget.initialEmployee != null;

  bool get _hasExistingMatch => _matchedAgent != null;

  @override
  void initState() {
    super.initState();

    final employee = widget.initialEmployee;

    _fullName = TextEditingController(
      text: employee?.fullName ?? '',
    );

    _phone = TextEditingController(
      text: _displayPhone(employee?.phone),
    );

    _email = TextEditingController(
      text: employee?.email ?? '',
    );

    _nin = TextEditingController(
      text: employee?.ninNumber ?? '',
    );

    _role = TextEditingController(
      text: employee?.roleName ?? '',
    );

    _monthlySalary = TextEditingController(
      text: employee == null || employee.monthlySalary <= 0
          ? ''
          : employee.monthlySalary.round().toString(),
    );

    _dateJoined = employee?.dateJoined ?? DateTime.now();

    _status = employee?.status.toUpperCase() ?? 'ACTIVE';

    if (_editing) {
      _lookupCompleted = true;
    }
  }

  @override
  void dispose() {
    _fullName.dispose();
    _phone.dispose();
    _email.dispose();
    _nin.dispose();
    _role.dispose();
    _monthlySalary.dispose();

    super.dispose();
  }

  // ===========================================================================
  // IDENTITY LOOKUP
  // ===========================================================================

  void _identityChanged() {
    if (_editing) {
      return;
    }

    if (!_lookupCompleted && _matchedAgent == null) {
      return;
    }

    setState(() {
      _lookupCompleted = false;
      _matchedAgent = null;
    });
  }

  Future<void> _checkIdentity() async {
    FocusScope.of(context).unfocus();

    if (!_identityFieldsValid()) {
      setState(() {});
      return;
    }

    setState(() {
      _checking = true;
    });

    await Future<void>.delayed(
      const Duration(milliseconds: 180),
    );

    final enteredName = _normalizeText(_fullName.text);
    final enteredPhone = _normalizePhone(_phone.text);
    final enteredEmail = _email.text.trim().toLowerCase();

    SalaryAgentCandidate? exactMatch;

    for (final candidate in widget.agentCandidates) {
      final candidateName = _normalizeText(candidate.name);
      final candidatePhone = _normalizePhone(candidate.phone ?? '');
      final candidateEmail = (candidate.email ?? '').trim().toLowerCase();

      final nameMatches = candidateName == enteredName;

      final phoneMatches =
          enteredPhone.isNotEmpty &&
          candidatePhone.isNotEmpty &&
          candidatePhone == enteredPhone;

      final emailMatches =
          enteredEmail.isNotEmpty &&
          candidateEmail.isNotEmpty &&
          candidateEmail == enteredEmail;

      /*
       * Phone is the strongest identity signal currently exposed by the
       * salary agent-candidate API.
       *
       * We deliberately do not match on name alone because doing so can
       * produce incorrect employee recommendations.
       */
      if (phoneMatches && (nameMatches || emailMatches || enteredEmail.isEmpty)) {
        exactMatch = candidate;
        break;
      }
    }

    if (!mounted) {
      return;
    }

    setState(() {
      _checking = false;
      _lookupCompleted = true;
      _matchedAgent = exactMatch;
    });

    if (exactMatch != null) {
      _applyMatchedAgent(exactMatch);
    }
  }

  bool _identityFieldsValid() {
    final nameValid = _fullName.text.trim().length >= 2;
    final phoneValid = _normalizePhone(_phone.text).length >= 9;
    final ninValid = _nin.text.trim().length >= 5;

    return nameValid && phoneValid && ninValid;
  }

  void _applyMatchedAgent(
    SalaryAgentCandidate candidate,
  ) {
    _fullName.text = candidate.name;

    if ((candidate.phone ?? '').trim().isNotEmpty) {
      _phone.text = _displayPhone(candidate.phone);
    }

    if ((candidate.email ?? '').trim().isNotEmpty) {
      _email.text = candidate.email!.trim();
    }

    if ((candidate.roleName ?? '').trim().isNotEmpty) {
      _role.text = candidate.roleName!.trim();
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

    if (!_editing && !_lookupCompleted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Check the employee identity before continuing.',
          ),
        ),
      );
      return;
    }

    if (!_formKey.currentState!.validate()) {
      return;
    }

    final salary = num.tryParse(
      _monthlySalary.text
          .replaceAll(',', '')
          .trim(),
    );

    if (salary == null || salary <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Enter a valid monthly salary.',
          ),
        ),
      );
      return;
    }

    final phone = _apiPhone(_phone.text);

    Navigator.of(context).pop(
      <String, dynamic>{
        if (_matchedAgent != null)
          'agentUserId': _matchedAgent!.id,

        'fullName': _fullName.text.trim(),

        'phone': phone,

        if (_email.text.trim().isNotEmpty)
          'email': _email.text.trim(),

        if (_nin.text.trim().isNotEmpty)
          'ninNumber': _nin.text.trim(),

        if (_role.text.trim().isNotEmpty)
          'roleName': _role.text.trim(),

        'monthlySalary': salary,

        'dateJoined': _dateOnly(
          _dateJoined,
        ),

        'status': _status,
      },
    );
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
          _editing
              ? 'Edit Employee'
              : 'Record Employee',
          style: const TextStyle(
            color: midnightNavy,
            fontSize: 18,
            fontWeight: FontWeight.w900,
          ),
        ),

        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(
            height: 1,
            color: line,
          ),
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
              const _SectionTitle(
                title: 'Identity details',
              ),

              const SizedBox(height: 12),

              _RequiredLabel(
                label: 'Full name',
              ),

              const SizedBox(height: 6),

              TextFormField(
                controller: _fullName,
                onChanged: (_) {
                  _identityChanged();
                },
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                decoration: _fieldDecoration(
                  hint: 'Enter full name',
                ),
                validator: (value) {
                  if ((value ?? '').trim().length < 2) {
                    return 'Enter the employee name.';
                  }

                  return null;
                },
              ),

              const SizedBox(height: 15),

              const _RequiredLabel(
                label: 'Phone number',
              ),

              const SizedBox(height: 6),

              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    height: 48,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 11,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border.all(
                        color: line,
                      ),
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
                      decoration: _fieldDecoration(
                        hint: 'Enter phone number',
                      ),
                      validator: (value) {
                        final normalized = _normalizePhone(
                          value ?? '',
                        );

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

              const _FieldLabel(
                label: 'Email (optional)',
              ),

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

                  if (!email.contains('@') ||
                      !email.contains('.')) {
                    return 'Enter a valid email address.';
                  }

                  return null;
                },
              ),

              const SizedBox(height: 15),

              const _RequiredLabel(
                label: 'NIN number',
              ),

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

              const SizedBox(height: 14),

              if (!_editing) ...[
                if (!_lookupCompleted)
                  const _LookupInformationCard(),

                if (_lookupCompleted &&
                    _hasExistingMatch)
                  _ExistingRecordCard(
                    candidate: _matchedAgent!,
                  ),

                if (_lookupCompleted &&
                    !_hasExistingMatch)
                  const _NoRecordCard(),

                const SizedBox(height: 18),
              ],

              if (_editing ||
                  _lookupCompleted) ...[
                const _SectionTitle(
                  title: 'Employment details',
                ),

                const SizedBox(height: 12),

                const _RequiredLabel(
                  label: 'Date joined',
                ),

                const SizedBox(height: 6),

                _DateField(
                  value: salaryDate(
                    _dateJoined,
                  ),
                  onTap: _pickJoinedDate,
                ),

                const SizedBox(height: 15),

                const _RequiredLabel(
                  label: 'Role / Position',
                ),

                const SizedBox(height: 6),

                TextFormField(
                  controller: _role,
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.next,
                  decoration: _fieldDecoration(
                    hint: 'Enter role or position',
                  ),
                  validator: (value) {
                    if ((value ?? '').trim().isEmpty) {
                      return 'Enter the employee role.';
                    }

                    return null;
                  },
                ),

                const SizedBox(height: 15),

                const _RequiredLabel(
                  label: 'Monthly salary',
                ),

                const SizedBox(height: 6),

                TextFormField(
                  controller: _monthlySalary,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.done,
                  decoration: _fieldDecoration(
                    hint: 'Enter monthly salary',
                    prefixText: 'UGX  ',
                  ),
                  validator: (value) {
                    final amount = num.tryParse(
                      (value ?? '')
                          .replaceAll(',', '')
                          .trim(),
                    );

                    if (amount == null ||
                        amount <= 0) {
                      return 'Enter a valid monthly salary.';
                    }

                    return null;
                  },
                ),

                const SizedBox(height: 15),

                const _RequiredLabel(
                  label: 'Employment status',
                ),

                const SizedBox(height: 6),

                DropdownButtonFormField<String>(
                  initialValue: _status,
                  decoration: _fieldDecoration(),
                  icon: const Icon(
                    Icons.keyboard_arrow_down_rounded,
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: 'ACTIVE',
                      child: Row(
                        children: [
                          _StatusDot(
                            color: forestEmerald,
                          ),
                          SizedBox(width: 8),
                          Text('Active'),
                        ],
                      ),
                    ),
                    DropdownMenuItem(
                      value: 'INACTIVE',
                      child: Row(
                        children: [
                          _StatusDot(
                            color: Color(0xFFF79009),
                          ),
                          SizedBox(width: 8),
                          Text('Inactive'),
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
              ],

              SizedBox(
                height: 48,
                child: FilledButton(
                  onPressed: _checking
                      ? null
                      : (!_editing && !_lookupCompleted)
                      ? _identityFieldsValid()
                            ? _checkIdentity
                            : null
                      : _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(
                      0xFF075CD8,
                    ),
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: const Color(
                      0xFFE5E7EB,
                    ),
                    disabledForegroundColor: const Color(
                      0xFF98A2B3,
                    ),
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(7),
                    ),
                  ),
                  child: _checking
                      ? const SizedBox(
                          width: 19,
                          height: 19,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              !_editing &&
                                      !_lookupCompleted
                                  ? 'Check & Continue'
                                  : _editing
                                  ? 'Save changes'
                                  : 'Save employee',
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                              ),
                            ),

                            const Spacer(),

                            const Icon(
                              Icons.arrow_forward_rounded,
                              size: 18,
                            ),
                          ],
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
// LOOKUP STATES
// =============================================================================

class _LookupInformationCard extends StatelessWidget {
  const _LookupInformationCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF2F6FF),
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.info_outline_rounded,
            color: Color(0xFF175CD3),
            size: 18,
          ),

          SizedBox(width: 9),

          Expanded(
            child: Text(
              'We will check whether this person already exists as an agent before you create the employee record.',
              style: TextStyle(
                color: Color(0xFF344054),
                fontSize: 9,
                height: 1.35,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ExistingRecordCard extends StatelessWidget {
  const _ExistingRecordCard({
    required this.candidate,
  });

  final SalaryAgentCandidate candidate;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFFECF8EF),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.check_circle_outline_rounded,
                color: forestEmerald,
                size: 18,
              ),

              SizedBox(width: 9),

              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Existing record found',
                      style: TextStyle(
                        color: forestEmerald,
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    SizedBox(height: 3),
                    Text(
                      'This person is already registered as an agent. You can link them as an employee.',
                      style: TextStyle(
                        color: Color(0xFF40624A),
                        fontSize: 8.5,
                        height: 1.3,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 8),

        Container(
          padding: const EdgeInsets.all(11),
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(
              color: line,
            ),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              SalaryAvatar(
                name: candidate.name,
                photoUrl: candidate.photoUrl,
                radius: 23,
              ),

              const SizedBox(width: 10),

              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      candidate.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                      ),
                    ),

                    const SizedBox(height: 3),

                    Text(
                      candidate.roleName?.trim().isNotEmpty == true
                          ? candidate.roleName!
                          : 'Agent',
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 8.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),

              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFFEAF5ED),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'Active',
                  style: TextStyle(
                    color: forestEmerald,
                    fontSize: 8,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _NoRecordCard extends StatelessWidget {
  const _NoRecordCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF5E9),
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.search_off_rounded,
            color: Color(0xFFD97706),
            size: 18,
          ),

          SizedBox(width: 9),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'No existing record found',
                  style: TextStyle(
                    color: Color(0xFFB45309),
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                  ),
                ),

                SizedBox(height: 3),

                Text(
                  'No available agent with these details was found. You can create a new employee.',
                  style: TextStyle(
                    color: Color(0xFF7C4A15),
                    fontSize: 8.5,
                    height: 1.3,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// COMMON UI
// =============================================================================

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({
    required this.title,
  });

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
  const _FieldLabel({
    required this.label,
  });

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
  const _RequiredLabel({
    required this.label,
  });

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
  const _DateField({
    required this.value,
    required this.onTap,
  });

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
          padding: const EdgeInsets.symmetric(
            horizontal: 12,
          ),
          decoration: BoxDecoration(
            border: Border.all(
              color: line,
            ),
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

              const Icon(
                Icons.close_rounded,
                color: slateText,
                size: 16,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({
    required this.color,
  });

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 7,
      height: 7,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
      ),
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
        : Icon(
            prefixIcon,
            color: slateText,
            size: 17,
          ),
    prefixText: prefixText,
    prefixStyle: const TextStyle(
      color: midnightNavy,
      fontSize: 10,
      fontWeight: FontWeight.w700,
    ),
    filled: true,
    fillColor: Colors.white,
    contentPadding: const EdgeInsets.symmetric(
      horizontal: 12,
      vertical: 13,
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(
        color: line,
      ),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(
        color: Color(0xFF175CD3),
        width: 1.2,
      ),
    ),
    errorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(
        color: Color(0xFFD92D20),
      ),
    ),
    focusedErrorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(
        color: Color(0xFFD92D20),
      ),
    ),
    errorStyle: const TextStyle(
      fontSize: 8,
    ),
  );
}

// =============================================================================
// HELPERS
// =============================================================================

String _normalizeText(String value) {
  return value
      .trim()
      .toLowerCase()
      .replaceAll(
        RegExp(r'\s+'),
        ' ',
      );
}

String _normalizePhone(String value) {
  var digits = value.replaceAll(
    RegExp(r'[^0-9]'),
    '',
  );

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