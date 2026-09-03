import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../../theme.dart';
import '../../domain/models/salary_models.dart';
import '../utils/salary_formatters.dart';
import '../widgets/salary_avatar.dart';

const _salaryBlue = Color(0xFF175CD3);
const _salaryBlueSoft = Color(0xFFF5F7FF);
const _salaryBlueBorder = Color(0xFFE1E7F5);
const _salaryRed = Color(0xFFD92D20);

class RecordSalaryPaymentSheet extends StatefulWidget {
  const RecordSalaryPaymentSheet({
    super.key,
    required this.employee,
    required this.cycleLabel,
    this.openCashDay,
  });

  final SalaryEmployee employee;
  final String cycleLabel;
  final SalaryOpenCashDay? openCashDay;

  @override
  State<RecordSalaryPaymentSheet> createState() =>
      _RecordSalaryPaymentSheetState();
}

class _RecordSalaryPaymentSheetState extends State<RecordSalaryPaymentSheet> {
  late final TextEditingController _amountController;
  late final TextEditingController _shortageSettlementController;
  late final TextEditingController _referenceController;

  String? _paymentMethod = 'CASH';

  String? _amountError;
  String? _shortageSettlementError;
  String? _methodError;
  String? _cashDayError;

  @override
  void initState() {
    super.initState();

    _amountController = TextEditingController();
    _shortageSettlementController = TextEditingController();
    _referenceController = TextEditingController();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _shortageSettlementController.dispose();
    _referenceController.dispose();

    super.dispose();
  }

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  void _close() {
    Navigator.of(context).maybePop();
  }

  void _save() {
    final amount = _parseAmount(_amountController.text);
    final shortageSettlement = _parseAmount(_shortageSettlementController.text);

    String? amountError;
    String? shortageSettlementError;
    String? methodError;
    String? cashDayError;

    final openCashDay = widget.openCashDay;
    if (openCashDay == null) {
      cashDayError =
          'Open the branch day before paying salary. The amount is taken from that day’s cash.';
    }

    if (amount == null || amount <= 0) {
      amountError = 'Enter a valid payment amount.';
    } else if (amount > widget.employee.outstanding) {
      amountError =
          'Payment cannot exceed ${salaryMoney(widget.employee.outstanding)}.';
    } else if (openCashDay != null &&
        amount > openCashDay.branchCashRemaining + 0.001) {
      amountError =
          'Payment cannot exceed remaining branch cash (${salaryMoney(openCashDay.branchCashRemaining)}).';
    }

    if (shortageSettlement != null &&
        shortageSettlement > widget.employee.shortageOutstanding) {
      shortageSettlementError =
          'Settlement cannot exceed ${salaryMoney(widget.employee.shortageOutstanding)}.';
    }

    if (_paymentMethod == null) {
      methodError = 'Select a payment method.';
    }

    if (amountError != null ||
        shortageSettlementError != null ||
        methodError != null ||
        cashDayError != null) {
      setState(() {
        _amountError = amountError;
        _shortageSettlementError = shortageSettlementError;
        _methodError = methodError;
        _cashDayError = cashDayError;
      });

      return;
    }

    setState(() {
      _amountError = null;
      _shortageSettlementError = null;
      _methodError = null;
      _cashDayError = null;
    });

    final cleanAmount = amount ?? 0;
    final cleanShortageSettlement = shortageSettlement ?? 0;

    Navigator.of(context).pop(<String, dynamic>{
      'amount': cleanAmount,
      'method': _paymentMethod!,
      if (_referenceController.text.trim().isNotEmpty)
        'referenceNote': _referenceController.text.trim(),
      if (cleanShortageSettlement > 0) ...{
        'shortageSettlementAmount': cleanShortageSettlement,
        'shortageSettlementNote': 'Recovered while recording salary payment.',
      },
    });
  }

  num? _parseAmount(String value) {
    final raw = value.replaceAll(',', '').replaceAll('UGX', '').trim();

    if (raw.isEmpty) {
      return null;
    }

    return num.tryParse(raw);
  }

  void _setAmount(
    TextEditingController controller,
    num amount, {
    VoidCallback? clearError,
  }) {
    if (amount <= 0) {
      return;
    }

    final text = amount % 1 == 0
        ? amount.toInt().toString()
        : amount.toStringAsFixed(2);

    controller.value = TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );

    clearError?.call();
  }

  void _clearSalaryAmountError() {
    if (_amountError != null) {
      setState(() {
        _amountError = null;
      });
    }
  }

  void _clearShortageSettlement() {
    _shortageSettlementController.clear();

    if (_shortageSettlementError != null) {
      setState(() {
        _shortageSettlementError = null;
      });
    }
  }

  // ===========================================================================
  // BUILD
  // ===========================================================================

  @override
  Widget build(BuildContext context) {
    final keyboardInset = MediaQuery.viewInsetsOf(context).bottom;

    return Material(
      color: Colors.transparent,
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.94,
        ),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: EdgeInsets.only(bottom: keyboardInset),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // =============================================================
                // DRAG HANDLE
                // =============================================================
                const SizedBox(height: 8),

                Container(
                  width: 38,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFF9098A7),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),

                // =============================================================
                // HEADER
                // =============================================================
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 8, 10, 0),
                  child: SizedBox(
                    height: 48,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        const Center(
                          child: Text(
                            'Record Salary Payment',
                            style: TextStyle(
                              color: midnightNavy,
                              fontSize: 16,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.2,
                            ),
                          ),
                        ),

                        Align(
                          alignment: Alignment.centerRight,
                          child: IconButton(
                            onPressed: _close,
                            tooltip: 'Close',
                            icon: const Icon(
                              Icons.close_rounded,
                              color: slateText,
                              size: 22,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // =============================================================
                // CONTENT
                // =============================================================
                Flexible(
                  child: SingleChildScrollView(
                    physics: const ClampingScrollPhysics(),
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.fromLTRB(20, 6, 20, 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // =====================================================
                        // EMPLOYEE
                        // =====================================================
                        _EmployeeSummary(
                          employee: widget.employee,
                          cycleLabel: widget.cycleLabel,
                        ),

                        const SizedBox(height: 18),

                        // =====================================================
                        // OUTSTANDING BALANCE
                        // =====================================================
                        _OutstandingBalanceCard(
                          amount: widget.employee.outstanding,
                        ),

                        if (widget.employee.hasShortage) ...[
                          const SizedBox(height: 10),
                          _ShortagePaymentNotice(
                            employee: widget.employee,
                            onPayOutstanding: () {
                              _setAmount(
                                _amountController,
                                widget.employee.outstanding,
                                clearError: _clearSalaryAmountError,
                              );
                            },
                            onHoldShortage: () {
                              _setAmount(
                                _amountController,
                                widget.employee.outstanding -
                                    widget.employee.shortageOutstanding,
                                clearError: _clearSalaryAmountError,
                              );
                            },
                          ),
                        ],

                        const SizedBox(height: 17),

                        // =====================================================
                        // AMOUNT
                        // =====================================================
                        const _FieldLabel(label: 'Amount paid', required: true),

                        const SizedBox(height: 6),

                        _AmountField(
                          controller: _amountController,
                          errorText: _amountError,
                          onChanged: (value) {
                            if (_amountError != null) {
                              setState(() {
                                _amountError = null;
                              });
                            }
                          },
                        ),

                        if (widget.employee.hasShortage) ...[
                          const SizedBox(height: 14),

                          const _FieldLabel(
                            label: 'Shortage settlement (optional)',
                          ),

                          const SizedBox(height: 6),

                          _AmountField(
                            controller: _shortageSettlementController,
                            fieldKey: const ValueKey(
                              'salary-payment-shortage-settlement-field',
                            ),
                            errorText: _shortageSettlementError,
                            onChanged: (value) {
                              if (_shortageSettlementError != null) {
                                setState(() {
                                  _shortageSettlementError = null;
                                });
                              }
                            },
                          ),

                          const SizedBox(height: 8),

                          Row(
                            children: [
                              Expanded(
                                child: _AmountChoiceButton(
                                  label: 'Settle full shortage',
                                  value: salaryMoney(
                                    widget.employee.shortageOutstanding,
                                  ),
                                  onTap: () {
                                    _setAmount(
                                      _shortageSettlementController,
                                      widget.employee.shortageOutstanding,
                                      clearError: () {
                                        if (_shortageSettlementError != null) {
                                          setState(() {
                                            _shortageSettlementError = null;
                                          });
                                        }
                                      },
                                    );
                                  },
                                ),
                              ),

                              const SizedBox(width: 8),

                              Expanded(
                                child: _AmountChoiceButton(
                                  label: 'Do not settle now',
                                  value: 'UGX 0',
                                  onTap: _clearShortageSettlement,
                                ),
                              ),
                            ],
                          ),
                        ],

                        const SizedBox(height: 14),

                        // =====================================================
                        // PAYMENT METHOD
                        // =====================================================
                        const _FieldLabel(
                          label: 'Payment method',
                          required: true,
                        ),

                        const SizedBox(height: 6),

                        _PaymentMethodField(
                          value: _paymentMethod,
                          errorText: _methodError,
                          onChanged: (value) {
                            setState(() {
                              _paymentMethod = value;
                              _methodError = null;
                            });
                          },
                        ),

                        const SizedBox(height: 14),

                        _CashDayNotice(
                          openCashDay: widget.openCashDay,
                          errorText: _cashDayError,
                        ),

                        const SizedBox(height: 14),

                        // =====================================================
                        // REFERENCE
                        // =====================================================
                        const _FieldLabel(label: 'Reference / Note (optional)'),

                        const SizedBox(height: 6),

                        TextField(
                          controller: _referenceController,
                          minLines: 3,
                          maxLines: 4,
                          textCapitalization: TextCapitalization.sentences,
                          style: const TextStyle(
                            color: midnightNavy,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                          decoration: _fieldDecoration(
                            hintText: 'Enter reference or note',
                            alignLabelWithHint: true,
                          ),
                        ),

                        const SizedBox(height: 24),

                        // =====================================================
                        // BUTTONS
                        // =====================================================
                        Row(
                          children: [
                            Expanded(
                              child: SizedBox(
                                height: 46,
                                child: OutlinedButton(
                                  onPressed: _close,
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: _salaryBlue,
                                    backgroundColor: Colors.white,
                                    side: const BorderSide(color: _salaryBlue),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(7),
                                    ),
                                  ),
                                  child: const Text(
                                    'Cancel',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ),
                            ),

                            const SizedBox(width: 10),

                            Expanded(
                              child: SizedBox(
                                height: 46,
                                child: FilledButton(
                                  onPressed: _save,
                                  style: FilledButton.styleFrom(
                                    backgroundColor: _salaryBlue,
                                    foregroundColor: Colors.white,
                                    elevation: 0,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(7),
                                    ),
                                  ),
                                  child: const Text(
                                    'Record payment',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),

                        const SizedBox(height: 4),
                      ],
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

// =============================================================================
// EMPLOYEE SUMMARY
// =============================================================================

class _EmployeeSummary extends StatelessWidget {
  const _EmployeeSummary({required this.employee, required this.cycleLabel});

  final SalaryEmployee employee;
  final String cycleLabel;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SalaryAvatar(
          name: employee.fullName,
          photoUrl: employee.photoUrl,
          radius: 25,
        ),

        const SizedBox(width: 12),

        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                employee.fullName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: midnightNavy,
                  fontSize: 14,
                  height: 1.1,
                  fontWeight: FontWeight.w900,
                ),
              ),

              const SizedBox(height: 4),

              Text(
                salaryRoleLabel(employee.roleName),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: slateText,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                ),
              ),

              const SizedBox(height: 2),

              Text(
                'Cycle: $cycleLabel',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: slateText,
                  fontSize: 10,
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
// OUTSTANDING BALANCE
// =============================================================================

class _OutstandingBalanceCard extends StatelessWidget {
  const _OutstandingBalanceCard({required this.amount});

  final num amount;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: _salaryBlueSoft,
        border: Border.all(color: _salaryBlueBorder),
        borderRadius: BorderRadius.circular(7),
      ),
      child: Column(
        children: [
          const Text(
            'Outstanding balance',
            style: TextStyle(
              color: slateText,
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),

          const SizedBox(height: 5),

          Text(
            salaryMoney(amount),
            style: const TextStyle(
              color: midnightNavy,
              fontSize: 18,
              height: 1,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// SHORTAGE NOTICE
// =============================================================================

class _ShortagePaymentNotice extends StatelessWidget {
  const _ShortagePaymentNotice({
    required this.employee,
    required this.onPayOutstanding,
    required this.onHoldShortage,
  });

  final SalaryEmployee employee;
  final VoidCallback onPayOutstanding;
  final VoidCallback onHoldShortage;

  @override
  Widget build(BuildContext context) {
    final netAmount = employee.outstanding - employee.shortageOutstanding;
    final canHoldShortage = netAmount > 0;

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF8F2),
        border: Border.all(color: const Color(0xFFF6D9C1)),
        borderRadius: BorderRadius.circular(7),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: const Color(0xFFE86A13).withValues(alpha: 0.10),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.warning_amber_rounded,
                  color: Color(0xFFE86A13),
                  size: 17,
                ),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Outstanding shortage: ${salaryMoney(employee.shortageOutstanding)}',
                      style: const TextStyle(
                        color: midnightNavy,
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Shortages are not deducted automatically. Enter a settlement below only if part or all of the shortage is being recovered with this payment.',
                      style: TextStyle(
                        color: slateText,
                        fontSize: 8.5,
                        height: 1.25,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _AmountChoiceButton(
                  label: 'Pay full salary',
                  value: salaryMoney(employee.outstanding),
                  onTap: onPayOutstanding,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _AmountChoiceButton(
                  label: 'Hold shortage',
                  value: salaryMoney(netAmount < 0 ? 0 : netAmount),
                  onTap: canHoldShortage ? onHoldShortage : null,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AmountChoiceButton extends StatelessWidget {
  const _AmountChoiceButton({
    required this.label,
    required this.value,
    required this.onTap,
  });

  final String label;
  final String value;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        foregroundColor: _salaryBlue,
        disabledForegroundColor: slateText,
        backgroundColor: Colors.white,
        side: BorderSide(color: onTap == null ? line : const Color(0xFFD6E1F5)),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        minimumSize: const Size(0, 44),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(7)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 8.5, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w900),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// FIELD LABEL
// =============================================================================

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.label, this.required = false});

  final String label;
  final bool required;

  @override
  Widget build(BuildContext context) {
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(text: label),
          if (required)
            const TextSpan(
              text: ' *',
              style: TextStyle(color: _salaryRed),
            ),
        ],
      ),
      style: const TextStyle(
        color: midnightNavy,
        fontSize: 10,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

// =============================================================================
// AMOUNT FIELD
// =============================================================================

class _AmountField extends StatelessWidget {
  const _AmountField({
    required this.controller,
    required this.onChanged,
    this.fieldKey = const ValueKey('salary-payment-amount-field'),
    this.errorText,
  });

  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final Key fieldKey;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    return TextField(
      key: fieldKey,
      controller: controller,
      autofocus: false,
      keyboardType: const TextInputType.numberWithOptions(
        decimal: false,
        signed: false,
      ),
      textInputAction: TextInputAction.done,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      onChanged: onChanged,
      style: const TextStyle(
        color: midnightNavy,
        fontSize: 12,
        fontWeight: FontWeight.w600,
      ),
      decoration: _fieldDecoration(
        hintText: 'Enter amount',
        errorText: errorText,
        prefixText: 'UGX ',
      ),
    );
  }
}
// =============================================================================
// PAYMENT METHOD
// =============================================================================

class _PaymentMethodField extends StatelessWidget {
  const _PaymentMethodField({
    required this.value,
    required this.onChanged,
    this.errorText,
  });

  final String? value;
  final ValueChanged<String?> onChanged;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      isExpanded: true,
      icon: const Icon(
        Icons.keyboard_arrow_down_rounded,
        color: slateText,
        size: 20,
      ),
      hint: const Row(
        children: [
          Icon(
            Icons.account_balance_wallet_outlined,
            color: slateText,
            size: 17,
          ),
          SizedBox(width: 10),
          Text(
            'Select payment method',
            style: TextStyle(
              color: slateText,
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
      items: const [
        DropdownMenuItem(
          value: 'CASH',
          child: _MethodOption(icon: Icons.payments_outlined, label: 'Cash'),
        ),
        DropdownMenuItem(
          value: 'MOBILE_MONEY',
          child: _MethodOption(
            icon: Icons.phone_android_rounded,
            label: 'Mobile Money',
          ),
        ),
        DropdownMenuItem(
          value: 'BANK_TRANSFER',
          child: _MethodOption(
            icon: Icons.account_balance_outlined,
            label: 'Bank transfer',
          ),
        ),
        DropdownMenuItem(
          value: 'OTHER',
          child: _MethodOption(icon: Icons.wallet_outlined, label: 'Other'),
        ),
      ],
      onChanged: onChanged,
      decoration: _fieldDecoration(errorText: errorText),
    );
  }
}

class _MethodOption extends StatelessWidget {
  const _MethodOption({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 17, color: slateText),
        const SizedBox(width: 10),
        Text(
          label,
          style: const TextStyle(
            color: midnightNavy,
            fontSize: 11,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

// =============================================================================
// DATE FIELD
// =============================================================================

class _CashDayNotice extends StatelessWidget {
  const _CashDayNotice({required this.openCashDay, this.errorText});

  final SalaryOpenCashDay? openCashDay;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    final open = openCashDay != null;
    final color = errorText != null || !open ? _salaryRed : _salaryBlue;
    final background = errorText != null || !open
        ? const Color(0xFFFFF5F5)
        : _salaryBlueSoft;
    final border = errorText != null || !open
        ? const Color(0xFFF2C7C7)
        : _salaryBlueBorder;

    final title = open
        ? 'Taken from today’s branch cash'
        : 'Open the branch day first';

    final body = errorText ??
        (open
            ? 'This payment leaves the till for ${salaryDate(openCashDay!.operationDate)}. Remaining cash: ${salaryMoney(openCashDay!.branchCashRemaining)}.'
            : 'Salary is paid from the open branch day’s cash, the same way expenses are. Open the day before recording a payment.');

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 11),
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            open ? Icons.account_balance_wallet_outlined : Icons.info_outline,
            color: color,
            size: 18,
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: color,
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  body,
                  style: TextStyle(
                    color: color,
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
// FIELD DECORATION
// =============================================================================

InputDecoration _fieldDecoration({
  String? hintText,
  String? prefixText,
  String? errorText,
  bool alignLabelWithHint = false,
}) {
  const defaultBorderColor = Color(0xFFD7DCE4);

  return InputDecoration(
    hintText: hintText,
    errorText: errorText,
    alignLabelWithHint: alignLabelWithHint,
    hintStyle: const TextStyle(
      color: Color(0xFF9299A6),
      fontSize: 11,
      fontWeight: FontWeight.w500,
    ),
    prefixText: prefixText,
    prefixStyle: const TextStyle(
      color: midnightNavy,
      fontSize: 12,
      fontWeight: FontWeight.w800,
    ),
    filled: true,
    fillColor: Colors.white,
    isDense: true,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(7),
      borderSide: const BorderSide(color: defaultBorderColor),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(7),
      borderSide: const BorderSide(color: _salaryBlue, width: 1.2),
    ),
    errorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(7),
      borderSide: const BorderSide(color: _salaryRed),
    ),
    focusedErrorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(7),
      borderSide: const BorderSide(color: _salaryRed, width: 1.2),
    ),
    errorStyle: const TextStyle(
      color: _salaryRed,
      fontSize: 9,
      fontWeight: FontWeight.w600,
    ),
  );
}
