import 'package:flutter/material.dart';

import 'flat_loan_amount.dart';
import 'onboarding_date.dart';
import '../../core/di/loan_application_locator.dart';
import '../../utils/friendly_errors.dart';

String _displayAmount(String value) {
  final parts = value.split('.');
  final whole = parts.first.replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => ',',
  );
  return parts.length == 2 ? '$whole.${parts[1]}' : whole;
}

Future<bool?> showLoanDetailsSheet(
  BuildContext context, {
  String? borrowerName,
  String? savedRepayable,
  String? issueDate,
  List<LoanProductTemplateOption> products = const [],
  required Future<void> Function(Map<String, dynamic>) onSave,
}) => showModalBottomSheet<bool>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  showDragHandle: true,
  isDismissible: false,
  enableDrag: false,
  builder: (_) => _LoanDetailsSheet(
    borrowerName: borrowerName,
    savedRepayable: savedRepayable,
    issueDate: issueDate,
    products: products,
    onSave: onSave,
  ),
);

class _LoanDetailsSheet extends StatefulWidget {
  const _LoanDetailsSheet({
    this.borrowerName,
    this.savedRepayable,
    this.issueDate,
    required this.products,
    required this.onSave,
  });
  final String? borrowerName;
  final String? savedRepayable;
  final String? issueDate;
  final List<LoanProductTemplateOption> products;
  final Future<void> Function(Map<String, dynamic>) onSave;

  @override
  State<_LoanDetailsSheet> createState() => _LoanDetailsSheetState();
}

class _LoanDetailsSheetState extends State<_LoanDetailsSheet> {
  final _form = GlobalKey<FormState>();
  final _principal = TextEditingController();
  final _rate = TextEditingController();
  final _duration = TextEditingController();
  final _start = TextEditingController();
  String? _frequency;
  String? _productId;
  bool _saving = false;
  String? _error;

  void _updatePrincipalFromTotal() {
    final principal = flatLoanPrincipal(
      widget.savedRepayable ?? '',
      _rate.text,
    );
    if (principal != null) _principal.text = principal;
  }

  void _selectProduct(String? id) {
    final product = widget.products.where((item) => item.id == id).firstOrNull;
    if (product == null) return;
    setState(() {
      _productId = product.id;
      _rate.text = product.interestRatePercent.toString();
      _duration.text = product.durationDays.toString();
      _frequency = product.repaymentFrequency;
      final issued = DateTime.tryParse(widget.issueDate ?? '');
      if (issued != null) {
        final date = product.computePaymentStartDate(issued);
        _start.text = onboardingDateDisplay(date);
      }
      _updatePrincipalFromTotal();
    });
  }

  @override
  void dispose() {
    _principal.dispose();
    _rate.dispose();
    _duration.dispose();
    _start.dispose();
    super.dispose();
  }

  Future<void> _pickStart() async {
    final now = DateTime.now();
    final issued = DateTime.tryParse(widget.issueDate ?? '');
    final first = issued == null
        ? DateTime(1900)
        : DateTime(issued.year, issued.month, issued.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: now.isBefore(first) ? first : now,
      firstDate: first,
      lastDate: DateTime(2100),
    );
    if (!mounted || picked == null) return;
    _start.text = onboardingDateDisplay(picked);
  }

  @override
  Widget build(BuildContext context) {
    final total = flatLoanRepayable(_principal.text, _rate.text);
    final saved = widget.savedRepayable;
    final mismatch =
        total != null &&
        saved != null &&
        !flatLoanMatchesRepayable(_principal.text, _rate.text, saved);
    final inputBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
    );
    return PopScope(
      canPop: !_saving,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * .82,
          ),
          child: Form(
            key: _form,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Complete loan details',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: Color(0xff111d35),
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Close',
                        onPressed: _saving
                            ? null
                            : () => Navigator.pop(context),
                        icon: const Icon(Icons.close),
                      ),
                    ],
                  ),
                ),
                Flexible(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (widget.borrowerName != null &&
                            widget.borrowerName!.isNotEmpty) ...[
                          Text(
                            widget.borrowerName!,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 14),
                        ],
                        if (widget.products.isNotEmpty) ...[
                          DropdownButtonFormField<String>(
                            initialValue: _productId,
                            decoration: InputDecoration(
                              labelText: 'Loan type',
                              border: inputBorder,
                              isDense: true,
                            ),
                            items: [
                              for (final product in widget.products)
                                DropdownMenuItem(
                                  value: product.id,
                                  child: Text(
                                    product.name,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                            ],
                            onChanged: _selectProduct,
                            validator: (value) =>
                                value == null ? 'Select a loan type.' : null,
                          ),
                          const SizedBox(height: 12),
                        ] else ...[
                          const Text(
                            'No flat-rate loan types are available. Set one up in loan products, or enter the historical terms below.',
                            style: TextStyle(
                              color: Color(0xff69768b),
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(height: 12),
                        ],
                        TextFormField(
                          controller: _principal,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: InputDecoration(
                            labelText: 'Loan amount',
                            prefixText: 'UGX ',
                            border: inputBorder,
                            isDense: true,
                          ),
                          onChanged: (_) => setState(() {}),
                          validator: (value) =>
                              flatLoanRepayable(value ?? '', '0') == null
                              ? 'Enter a valid loan amount.'
                              : null,
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _rate,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: InputDecoration(
                            labelText: 'Flat interest rate',
                            suffixText: '%',
                            border: inputBorder,
                            isDense: true,
                          ),
                          onChanged: (_) => setState(() {
                            if (_productId != null) _updatePrincipalFromTotal();
                          }),
                          validator: (value) =>
                              flatLoanRepayable(_principal.text, value ?? '') ==
                                  null
                              ? 'Enter a valid interest rate.'
                              : null,
                        ),
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xffeef5ff),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            children: [
                              const Expanded(
                                child: Text(
                                  'Repayable amount',
                                  style: TextStyle(fontWeight: FontWeight.w600),
                                ),
                              ),
                              Flexible(
                                child: FittedBox(
                                  fit: BoxFit.scaleDown,
                                  child: Text(
                                    total == null
                                        ? '—'
                                        : 'UGX ${_displayAmount(total)}',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      color: Color(0xff186df2),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (saved != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(
                              'Previously recorded: UGX ${_displayAmount(saved)}',
                              style: const TextStyle(
                                color: Color(0xff69768b),
                                fontSize: 12,
                              ),
                            ),
                          ),
                        if (mismatch)
                          const Padding(
                            padding: EdgeInsets.only(top: 8),
                            child: Text(
                              'The calculated amount differs from the recorded total. Review the values before saving.',
                              style: TextStyle(
                                color: Color(0xffb3261e),
                                fontSize: 12,
                              ),
                            ),
                          ),
                        if (_error != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(
                              _error!,
                              style: const TextStyle(
                                color: Color(0xffb3261e),
                                fontSize: 12,
                              ),
                            ),
                          ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _duration,
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(
                            labelText: 'Duration in days',
                            border: inputBorder,
                            isDense: true,
                          ),
                          validator: (value) {
                            final days = int.tryParse(value?.trim() ?? '');
                            return days == null || days < 1 || days > 3650
                                ? 'Enter a valid duration.'
                                : null;
                          },
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _start,
                          keyboardType: TextInputType.number,
                          inputFormatters: [OnboardingDateFormatter()],
                          decoration: InputDecoration(
                            labelText: 'Repayment start date',
                            hintText: 'DD-MM-YY',
                            suffixIcon: IconButton(
                              tooltip: 'Choose repayment start date',
                              onPressed: _pickStart,
                              icon: const Icon(
                                Icons.calendar_today_outlined,
                                size: 19,
                              ),
                            ),
                            border: inputBorder,
                            isDense: true,
                          ),
                          validator: (value) {
                            final date = parseOnboardingDate(value ?? '');
                            if (date == null)
                              return 'Enter a valid date as DD-MM-YY.';
                            final issued = DateTime.tryParse(
                              widget.issueDate ?? '',
                            );
                            return issued != null &&
                                    date.isBefore(
                                      DateTime(
                                        issued.year,
                                        issued.month,
                                        issued.day,
                                      ),
                                    )
                                ? 'Repayment cannot start before the issue date.'
                                : null;
                          },
                        ),
                        const SizedBox(height: 12),
                        DropdownButtonFormField<String>(
                          key: ValueKey('frequency-$_productId'),
                          initialValue: _frequency,
                          decoration: InputDecoration(
                            labelText: 'Repayment frequency',
                            border: inputBorder,
                            isDense: true,
                          ),
                          items: const [
                            DropdownMenuItem(
                              value: 'DAILY',
                              child: Text('Daily'),
                            ),
                            DropdownMenuItem(
                              value: 'WEEKLY',
                              child: Text('Weekly'),
                            ),
                            DropdownMenuItem(
                              value: 'BIWEEKLY',
                              child: Text('Fortnightly'),
                            ),
                            DropdownMenuItem(
                              value: 'MONTHLY',
                              child: Text('Monthly'),
                            ),
                            DropdownMenuItem(
                              value: 'LUMP_SUM',
                              child: Text('Lump sum'),
                            ),
                          ],
                          onChanged: (value) =>
                              setState(() => _frequency = value),
                          validator: (value) =>
                              value == null ? 'Select a frequency.' : null,
                        ),
                        const SizedBox(height: 16),
                      ],
                    ),
                  ),
                ),
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                    child: SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _saving
                            ? null
                            : () async {
                                if (!(_form.currentState?.validate() ?? false))
                                  return;
                                if (mismatch) {
                                  final confirmed = await showDialog<bool>(
                                    context: context,
                                    builder: (dialogContext) => AlertDialog(
                                      scrollable: true,
                                      title: const Text(
                                        'Update recorded total?',
                                      ),
                                      content: Text(
                                        'The recorded repayable amount will change from UGX ${_displayAmount(saved!)} to UGX ${_displayAmount(total!)}. The outstanding balance will stay the same, so the amount shown as already paid will change. Confirm only if the new total is correct.',
                                      ),
                                      actions: [
                                        TextButton(
                                          onPressed: () => Navigator.pop(
                                            dialogContext,
                                            false,
                                          ),
                                          child: const Text('Review'),
                                        ),
                                        FilledButton(
                                          onPressed: () => Navigator.pop(
                                            dialogContext,
                                            true,
                                          ),
                                          child: const Text('Confirm update'),
                                        ),
                                      ],
                                    ),
                                  );
                                  if (!mounted || confirmed != true) return;
                                }
                                setState(() {
                                  _saving = true;
                                  _error = null;
                                });
                                try {
                                  await widget.onSave({
                                    if (_productId != null)
                                      'loanProductTemplateId': _productId,
                                    if (_productId != null)
                                      'loanProductName': widget.products
                                          .firstWhere(
                                            (item) => item.id == _productId,
                                          )
                                          .name,
                                    'principal': _principal.text.trim(),
                                    'flatInterestPercent': _rate.text.trim(),
                                    'durationDays': int.parse(
                                      _duration.text.trim(),
                                    ),
                                    'paymentStartDate': onboardingDateIso(
                                      parseOnboardingDate(_start.text)!,
                                    ),
                                    'repaymentFrequency': _frequency,
                                    if (mismatch) 'repayable': total,
                                    if (mismatch) 'expectedRepayable': saved,
                                    if (mismatch)
                                      'confirmRepayableCorrection': true,
                                  });
                                  if (!mounted) return;
                                  setState(() => _saving = false);
                                  await WidgetsBinding.instance.endOfFrame;
                                  if (context.mounted)
                                    Navigator.pop(context, true);
                                } catch (error) {
                                  if (!mounted) return;
                                  final text = error.toString();
                                  setState(
                                    () => _error =
                                        text.contains(
                                          'repayable amount do not agree',
                                        )
                                        ? 'The amount and interest do not match the previously recorded repayment total. Check the values.'
                                        : friendlyErrorMessage(error),
                                  );
                                } finally {
                                  if (mounted) setState(() => _saving = false);
                                }
                              },
                        child: Text(
                          _saving ? 'Saving...' : 'Save loan details',
                        ),
                      ),
                    ),
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
