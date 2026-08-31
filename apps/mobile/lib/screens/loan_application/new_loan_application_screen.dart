import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../core/database/models/customer_local.dart';
import '../../core/database/repositories/customers_repository.dart';
import '../../core/di/loan_application_locator.dart';
import '../../core/network/phone_normalize.dart';
import '../../features/agent_day/data/agent_day_status_store.dart';
import '../../features/loan_application/domain/entities/loan_application.dart';
import '../../features/loan_application/domain/failures.dart';
import '../../features/locations/data/uganda_locations_repository.dart';
import '../../features/locations/domain/uganda_location.dart';
import '../../services/api_client.dart';
import '../../services/network_status_store.dart';
import '../../services/session_store.dart';
import '../../shared/camera_capture/camera_capture.dart';
import '../../shared/permissions/rembeh_permission_gate.dart';
import '../../shared/signature_pad/electronic_signature_screen.dart';
import '../../theme.dart';
import '../../utils/friendly_errors.dart';
import '../../utils/money.dart';
import 'loan_application_draft.dart';
import 'loan_form_controls.dart';

class NewLoanApplicationScreen extends StatefulWidget {
  const NewLoanApplicationScreen({super.key, required this.session});

  final RembehSession session;

  @override
  State<NewLoanApplicationScreen> createState() =>
      _NewLoanApplicationScreenState();
}

class _NewLoanApplicationScreenState extends State<NewLoanApplicationScreen> {
  static const _totalSteps = 7;

  final _locator = LoanApplicationLocator.instance;
  final _customersRepository = CustomersRepository();
  final _dayStore = AgentDayStatusStore.instance;
  final _locationsRepository = UgandaLocationsRepository.instance;
  final _draft = LoanApplicationDraft();

  late final ApiClient _api;

  final _borrowerSearch = TextEditingController();
  final _surname = TextEditingController();
  final _givenNames = TextEditingController();
  final _phone = TextEditingController();
  final _nationalId = TextEditingController();
  final _principal = TextEditingController();
  final _initialDisbursement = TextEditingController();
  final _repaymentsUsed = TextEditingController();
  final _processingFee = TextEditingController();
  final _guarantorName = TextEditingController();
  final _guarantorPhone = TextEditingController();

  Timer? _borrowerSearchDebounce;
  int _borrowerSearchGeneration = 0;

  List<CustomerLocal> _borrowerResults = const [];
  CustomerLocal? _selectedBorrower;
  bool _borrowersLoading = false;
  String? _borrowerError;

  String? _applicationId;
  int _step = 1;

  bool _verifying = false;
  bool _busy = false;
  bool _bootstrapping = false;
  String? _bootError;
  bool _returnToReviewAfterEdit = false;

  List<LoanProductTemplateOption> _templates = const [];
  String? _productsError;

  UgandaLocationCatalog? _locationCatalog;
  bool _locationsLoading = true;
  String? _locationsError;

  bool _repaymentsUsedEdited = false;

  @override
  void initState() {
    super.initState();

    _api = ApiClient(_locator.sessionStore);

    _dayStore.addListener(_onDayStatusChanged);

    if (_dayStore.status == null) {
      // ignore: discarded_futures
      _dayStore.start(widget.session);
    } else {
      // ignore: discarded_futures
      _dayStore.refresh();
    }

    // ignore: discarded_futures
    _loadLoanProducts();

    // ignore: discarded_futures
    _loadLocations();
  }

  void _onDayStatusChanged() {
    if (!mounted) return;

    _syncRepaymentsUsedFromFloat();

    setState(() {});
  }

  Future<void> _loadLoanProducts() async {
    try {
      final catalog = await _locator.loadLoanProducts();

      if (!mounted) return;

      setState(() {
        _templates = catalog.templates;
        _productsError = catalog.templates.isEmpty
            ? 'Ask your branch manager to configure loan type templates.'
            : null;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _productsError = 'Could not load loan products.';
      });
    }
  }

  Future<void> _loadLocations() async {
    try {
      final catalog = await _locationsRepository.load();

      if (!mounted) return;

      setState(() {
        _locationCatalog = catalog;
        _locationsLoading = false;
        _locationsError = null;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _locationsLoading = false;
        _locationsError = 'Could not load Uganda locations.';
      });
    }
  }

  // ---------------------------------------------------------------------------
  // EXISTING BORROWER SEARCH
  // ---------------------------------------------------------------------------

  Future<void> _loadExistingBorrowers() async {
    await _performBorrowerSearch('');
  }

  void _searchExistingBorrowers(String rawQuery) {
    _borrowerSearchDebounce?.cancel();

    final query = rawQuery.trim();

    if (mounted) {
      setState(() {});
    }

    _borrowerSearchDebounce = Timer(const Duration(milliseconds: 300), () {
      if (!mounted) return;

      // ignore: discarded_futures
      _performBorrowerSearch(query);
    });
  }

  Future<void> _performBorrowerSearch(String query) async {
    final normalizedQuery = query.trim();
    final generation = ++_borrowerSearchGeneration;

    if (normalizedQuery.isNotEmpty && normalizedQuery.length < 2) {
      if (!mounted) return;

      setState(() {
        _borrowerResults = const [];
        _borrowersLoading = false;
        _borrowerError = 'Enter at least 2 characters.';
      });

      return;
    }

    if (!mounted) return;

    setState(() {
      _borrowersLoading = true;
      _borrowerError = null;
    });

    try {
      List<CustomerLocal> results;

      if (NetworkStatusStore.instance.isOffline) {
        results = await _searchBorrowersOffline(normalizedQuery);
      } else {
        try {
          results = await _searchBorrowersOnline(normalizedQuery);
        } catch (_) {
          results = await _searchBorrowersOffline(normalizedQuery);
        }
      }

      if (!mounted || generation != _borrowerSearchGeneration) {
        return;
      }

      setState(() {
        _borrowersLoading = false;
        _borrowerResults = results;

        if (results.isEmpty) {
          _borrowerError = NetworkStatusStore.instance.isOffline
              ? 'No borrower found in the offline records on this device.'
              : 'No borrower found.';
        } else {
          _borrowerError = null;
        }
      });
    } catch (error) {
      if (!mounted || generation != _borrowerSearchGeneration) {
        return;
      }

      setState(() {
        _borrowersLoading = false;
        _borrowerResults = const [];
        _borrowerError = friendlyErrorMessage(error);
      });
    }
  }

  Future<List<CustomerLocal>> _searchBorrowersOffline(String query) async {
    final rawBranchId = widget.session.branchId?.trim();
    final branchId = rawBranchId == null || rawBranchId.isEmpty
        ? null
        : rawBranchId;

    if (query.isEmpty) {
      final borrowers = await _customersRepository.getAll(branchId: branchId);

      return borrowers.take(50).toList(growable: false);
    }

    return _customersRepository.search(query, branchId: branchId);
  }

  Future<List<CustomerLocal>> _searchBorrowersOnline(String query) async {
    final rows = await _api.listCustomers(widget.session);

    final rawBranchId = widget.session.branchId?.trim();
    final sessionBranchId = rawBranchId == null || rawBranchId.isEmpty
        ? null
        : rawBranchId;

    final customers = <CustomerLocal>[];

    for (final row in rows) {
      final rowBranchId = _textValue(row['branchId']);

      if (sessionBranchId != null &&
          rowBranchId != null &&
          rowBranchId != sessionBranchId) {
        continue;
      }

      final customer = _customerFromApiRow(row);

      if (customer != null) {
        customers.add(customer);
      }
    }

    if (query.isEmpty) {
      customers.sort(
        (a, b) => a.fullName.toLowerCase().compareTo(b.fullName.toLowerCase()),
      );

      return customers.take(50).toList(growable: false);
    }

    final normalizedQuery = query.toLowerCase();
    final queryDigits = query.replaceAll(RegExp(r'\D'), '');

    final matches = customers
        .where((customer) {
          final fullName = customer.fullName.toLowerCase();
          final firstName = customer.firstName.toLowerCase();
          final lastName = customer.lastName.toLowerCase();
          final phone = customer.phone.toLowerCase();
          final phoneDigits = customer.phone.replaceAll(RegExp(r'\D'), '');
          final nin = customer.nin?.toLowerCase() ?? '';

          final nameMatch =
              fullName.contains(normalizedQuery) ||
              firstName.contains(normalizedQuery) ||
              lastName.contains(normalizedQuery);

          final phoneMatch =
              phone.contains(normalizedQuery) ||
              (queryDigits.isNotEmpty && phoneDigits.contains(queryDigits));

          final ninMatch =
              normalizedQuery.length >= 4 && nin.contains(normalizedQuery);

          return nameMatch || phoneMatch || ninMatch;
        })
        .toList(growable: false);

    matches.sort((a, b) {
      final aName = a.fullName.toLowerCase();
      final bName = b.fullName.toLowerCase();

      final aStarts = aName.startsWith(normalizedQuery);
      final bStarts = bName.startsWith(normalizedQuery);

      if (aStarts != bStarts) {
        return aStarts ? -1 : 1;
      }

      return aName.compareTo(bName);
    });

    return matches.take(50).toList(growable: false);
  }

  CustomerLocal? _customerFromApiRow(Map<String, dynamic> row) {
    final id = _textValue(row['id']);

    final tenantId =
        _textValue(row['tenantId']) ?? widget.session.tenantId?.trim();

    final branchId =
        _textValue(row['branchId']) ?? widget.session.branchId?.trim();

    if (id == null ||
        tenantId == null ||
        tenantId.isEmpty ||
        branchId == null ||
        branchId.isEmpty) {
      return null;
    }

    final fullName =
        _textValue(row['fullName']) ??
        [
          _textValue(row['firstName']),
          _textValue(row['lastName']),
        ].whereType<String>().join(' ').trim();

    final names = _splitBorrowerName(fullName);

    final createdAt =
        DateTime.tryParse(_textValue(row['createdAt']) ?? '') ??
        DateTime.fromMillisecondsSinceEpoch(0);

    final updatedAt =
        DateTime.tryParse(_textValue(row['updatedAt']) ?? '') ?? createdAt;

    return CustomerLocal(
      id: id,
      tenantId: tenantId,
      branchId: branchId,
      nin: _textValue(row['nationalId']) ?? _textValue(row['nin']),
      firstName: _textValue(row['firstName']) ?? names.$1,
      lastName: _textValue(row['lastName']) ?? names.$2,
      phone: _textValue(row['phone']) ?? '',
      email: _textValue(row['email']),
      village: _textValue(row['village']),
      subCounty: _textValue(row['subCounty']),
      district: _textValue(row['district']),
      parish: _textValue(row['parish']),
      dateOfBirth: _dateValue(row['dateOfBirth']),
      gender: _textValue(row['gender']),
      createdAt: createdAt,
      updatedAt: updatedAt,
    );
  }

  Future<void> _selectExistingBorrowerMode() async {
    if (_draft.existingBorrower) return;

    _borrowerSearchDebounce?.cancel();
    _borrowerSearchGeneration++;

    setState(() {
      _draft
        ..existingBorrower = true
        ..customerId = null
        ..verified = false
        ..verificationCode = null
        ..verifiedAt = null
        ..verifyError = null
        ..surname = ''
        ..givenNames = ''
        ..phone = ''
        ..nationalId = ''
        ..gender = null
        ..dateOfBirth = null
        ..district = null
        ..subCounty = null
        ..parish = null
        ..village = null;

      _selectedBorrower = null;
      _applicationId = null;
      _bootError = null;

      _borrowerSearch.clear();
      _borrowerResults = const [];
      _borrowerError = null;

      _surname.clear();
      _givenNames.clear();
      _phone.clear();
      _nationalId.clear();
    });

    await _loadExistingBorrowers();
  }

  void _selectNewBorrowerMode() {
    if (!_draft.existingBorrower) return;

    _borrowerSearchDebounce?.cancel();
    _borrowerSearchGeneration++;

    setState(() {
      _draft
        ..existingBorrower = false
        ..customerId = null
        ..verified = false
        ..verificationCode = null
        ..verifiedAt = null
        ..verifyError = null
        ..surname = ''
        ..givenNames = ''
        ..phone = ''
        ..nationalId = ''
        ..gender = null
        ..dateOfBirth = null
        ..district = null
        ..subCounty = null
        ..parish = null
        ..village = null;

      _selectedBorrower = null;
      _applicationId = null;
      _bootError = null;

      _borrowerSearch.clear();
      _borrowerResults = const [];
      _borrowerError = null;

      _surname.clear();
      _givenNames.clear();
      _phone.clear();
      _nationalId.clear();
    });
  }

  Future<void> _chooseExistingBorrower(CustomerLocal borrower) async {
    if (_busy) return;

    if (NetworkStatusStore.instance.isOffline) {
      _showSnack(
        'You can search borrower records offline, but starting a new loan for an existing borrower currently requires internet.',
      );
      return;
    }

    setState(() {
      _busy = true;
      _borrowerError = null;
      _draft.verifyError = null;
    });

    try {
      final application = await _locator.createDraftFromCustomer(borrower.id);

      if (!mounted) return;

      _borrowerSearchDebounce?.cancel();
      _borrowerSearchGeneration++;

      final applicationSurname = application.surname?.trim().isNotEmpty == true
          ? application.surname!.trim()
          : borrower.lastName.trim();

      final applicationGivenNames =
          application.givenNames?.trim().isNotEmpty == true
          ? application.givenNames!.trim()
          : borrower.firstName.trim();

      final applicationPhone = application.phone?.trim().isNotEmpty == true
          ? application.phone!.trim()
          : borrower.phone.trim();

      final applicationNationalId =
          application.nationalId?.trim().isNotEmpty == true
          ? application.nationalId!.trim()
          : borrower.nin?.trim() ?? '';

      setState(() {
        _applicationId = application.id;
        _selectedBorrower = borrower;

        _draft
          ..existingBorrower = true
          ..customerId = application.customerId ?? borrower.id
          ..surname = applicationSurname
          ..givenNames = applicationGivenNames
          ..phone = applicationPhone
          ..nationalId = applicationNationalId
          ..gender = application.gender ?? borrower.gender
          ..dateOfBirth = application.dateOfBirth ?? borrower.dateOfBirth
          ..district = application.district ?? borrower.district
          ..subCounty = application.subCounty ?? borrower.subCounty
          ..parish = application.parish ?? borrower.parish
          ..village = application.village ?? borrower.village
          ..verified = application.isVerified
          ..verificationCode = application.verificationCode
          ..verifiedAt = application.verifiedAt
          ..verifyError = null;

        _surname.text = _draft.surname;
        _givenNames.text = _draft.givenNames;
        _phone.text = _draft.phone;
        _nationalId.text = _draft.nationalId;

        _borrowerSearch.clear();
        _borrowerResults = const [];
      });

      await _persistBorrowerProfileStep();

      if (!mounted) return;

      setState(() {
        _step = 3;
        _returnToReviewAfterEdit = false;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _borrowerError = error is LoanApplicationFailure
            ? error.message
            : friendlyErrorMessage(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  void _changeExistingBorrower() {
    _borrowerSearchDebounce?.cancel();
    _borrowerSearchGeneration++;

    setState(() {
      _selectedBorrower = null;
      _applicationId = null;

      _draft
        ..customerId = null
        ..verified = false
        ..verificationCode = null
        ..verifiedAt = null
        ..verifyError = null
        ..surname = ''
        ..givenNames = ''
        ..phone = ''
        ..nationalId = ''
        ..gender = null
        ..dateOfBirth = null
        ..district = null
        ..subCounty = null
        ..parish = null
        ..village = null;

      _surname.clear();
      _givenNames.clear();
      _phone.clear();
      _nationalId.clear();

      _borrowerSearch.clear();
      _borrowerResults = const [];
      _borrowerError = null;
    });

    // ignore: discarded_futures
    _loadExistingBorrowers();
  }

  Future<String?> _ensureNewBorrowerDraft() async {
    if (_applicationId != null) {
      return _applicationId;
    }

    if (_draft.existingBorrower) {
      setState(() {
        _draft.verifyError = 'Select an existing borrower first.';
      });

      return null;
    }

    setState(() {
      _bootstrapping = true;
      _bootError = null;
    });

    try {
      final application = await _locator.createDraft();

      if (!mounted) return null;

      setState(() {
        _applicationId = application.id;
        _bootstrapping = false;
      });

      return application.id;
    } catch (error) {
      if (!mounted) return null;

      setState(() {
        _bootstrapping = false;
        _bootError = friendlyErrorMessage(error);
      });

      return null;
    }
  }

  UgandaDistrict? _selectedDistrictLocation() {
    return _locationCatalog?.district(_draft.district);
  }

  UgandaSubCounty? _selectedSubCountyLocation() {
    return _selectedDistrictLocation()?.subCounty(_draft.subCounty);
  }

  UgandaParish? _selectedParishLocation() {
    return _selectedSubCountyLocation()?.parish(_draft.parish);
  }

  List<String> _districtOptions() {
    return _locationCatalog?.districtNames ?? const [];
  }

  List<String> _subCountyOptions() {
    return _selectedDistrictLocation()?.subCountyNames ?? const [];
  }

  List<String> _parishOptions() {
    return _selectedSubCountyLocation()?.parishNames ?? const [];
  }

  List<String> _villageOptions() {
    return _selectedParishLocation()?.villages ?? const [];
  }

  LoanProductTemplateOption? _selectedTemplate() {
    final id = _draft.loanProductTemplateId;

    if (id == null) return null;

    for (final template in _templates) {
      if (template.id == id) {
        return template;
      }
    }

    return null;
  }

  void _applyTemplate(LoanProductTemplateOption template) {
    final principal = double.tryParse(_principal.text.replaceAll(',', '')) ?? 0;

    final fee = template.processingFeeForPrincipal(principal);
    final paymentStart = template.computePaymentStartDate();

    setState(() {
      _draft
        ..loanProductTemplateId = template.id
        ..loanProductTemplateName = template.name
        ..interestRate = '${template.interestRatePercent}%'
        ..loanDurationDays = template.termLabel
        ..repaymentFrequencyLabel = template.repaymentLabel
        ..processingFee = fee.toStringAsFixed(0)
        ..paymentStartDate = paymentStart;

      _processingFee.text = fee.toStringAsFixed(0);
    });
  }

  void _recomputeFeeFromTemplate() {
    final template = _selectedTemplate();

    if (template == null) return;

    final principal = double.tryParse(_principal.text.replaceAll(',', '')) ?? 0;

    if (principal <= 0) return;

    final fee = template.processingFeeForPrincipal(principal);

    _processingFee.text = fee.toStringAsFixed(0);
    _draft.processingFee = _processingFee.text;
  }

  double _currentPrincipalAmount() {
    return double.tryParse(_principal.text.replaceAll(',', '')) ?? 0;
  }

  double _currentInitialDisbursementAmount() {
    final principal = _currentPrincipalAmount();

    if (!_draft.partialDisbursement) {
      return principal;
    }

    return double.tryParse(_initialDisbursement.text.replaceAll(',', '')) ?? 0;
  }

  double _currentRepaymentsUsedAmount() {
    return double.tryParse(_repaymentsUsed.text.replaceAll(',', '')) ?? 0;
  }

  double _currentPendingDisbursementAmount() {
    final remaining =
        _currentPrincipalAmount() - _currentInitialDisbursementAmount();

    return remaining <= 0 ? 0 : remaining;
  }

  int? _remainingFloatForLoan() {
    final status = _dayStore.status;

    if (status == null) return null;

    return status.float.unusedFloat < 0 ? 0 : status.float.unusedFloat;
  }

  int _collectedRepaymentsAvailableForLoan() {
    final status = _dayStore.status;

    if (status == null) return 0;

    final available = status.float.collectedRepaymentsAvailable;

    return available < 0 ? 0 : available;
  }

  bool _needsRepaymentFundingForLoan(double amountGivenNow) {
    final remaining = _remainingFloatForLoan();

    return amountGivenNow > 0 &&
        remaining != null &&
        amountGivenNow > remaining;
  }

  double _recommendedRepaymentsForLoan(double amountGivenNow) {
    final remaining = _remainingFloatForLoan();

    if (remaining == null || amountGivenNow <= remaining) {
      return 0;
    }

    final shortfall = amountGivenNow - remaining;
    final available = _collectedRepaymentsAvailableForLoan().toDouble();

    if (available <= 0) {
      return 0;
    }

    return shortfall > available ? available : shortfall;
  }

  void _syncRepaymentsUsedFromFloat() {
    final amountGivenNow = _currentInitialDisbursementAmount();

    if (!_needsRepaymentFundingForLoan(amountGivenNow)) {
      _repaymentsUsedEdited = false;
      _setRepaymentsUsedAmount(0);
      return;
    }

    if (_repaymentsUsedEdited) return;

    _setRepaymentsUsedAmount(_recommendedRepaymentsForLoan(amountGivenNow));
  }

  void _setRepaymentsUsedAmount(double value) {
    final text = value <= 0 ? '' : value.toStringAsFixed(0);

    if (_repaymentsUsed.text == text) return;

    _repaymentsUsed.value = TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }

  String? _floatMessageForDisbursement({
    required double amountGivenNow,
    required double collectedRepaymentsAmount,
  }) {
    final status = _dayStore.status;

    if (status == null || amountGivenNow <= 0) {
      return null;
    }

    if (collectedRepaymentsAmount < 0) {
      return 'Repayments used cannot be negative.';
    }

    if (collectedRepaymentsAmount > amountGivenNow) {
      return 'Repayments used cannot exceed the amount given now.';
    }

    final collectedAvailable = _collectedRepaymentsAvailableForLoan();

    if (collectedRepaymentsAmount > collectedAvailable) {
      return 'Repayments available: UGX ${formatMoney(collectedAvailable)}.';
    }

    final assignedFloatNeeded = amountGivenNow - collectedRepaymentsAmount;

    if (assignedFloatNeeded <= 0) {
      return null;
    }

    if (status.float.amountReceived <= 0) {
      return 'You need float assigned before issuing a loan.';
    }

    final remaining = _remainingFloatForLoan() ?? 0;

    if (assignedFloatNeeded > remaining) {
      return 'Loan amount exceeds your remaining float. Available: UGX ${formatMoney(remaining)}.';
    }

    return null;
  }

  @override
  void dispose() {
    _dayStore.removeListener(_onDayStatusChanged);

    _borrowerSearchDebounce?.cancel();

    _borrowerSearch.dispose();
    _surname.dispose();
    _givenNames.dispose();
    _phone.dispose();
    _nationalId.dispose();
    _principal.dispose();
    _initialDisbursement.dispose();
    _repaymentsUsed.dispose();
    _processingFee.dispose();
    _guarantorName.dispose();
    _guarantorPhone.dispose();

    super.dispose();
  }

  Future<bool> _confirmDiscard() async {
    if (!_draft.hasProgress && _step == 1) {
      return true;
    }

    final result = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: rembehBorderRadius(rembehRadiusLg),
          ),
          contentPadding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 52,
                height: 52,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFEBEE),
                  border: Border.all(color: const Color(0xFFFFCDD2)),
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
                child: const Icon(
                  Icons.warning_amber_rounded,
                  color: Color(0xFFC62828),
                  size: 28,
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'Discard loan application?',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: midnightNavy,
                  fontWeight: FontWeight.w800,
                  fontSize: 18,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'All information entered for this application will be lost if you exit now.',
                textAlign: TextAlign.center,
                style: TextStyle(color: slateText, fontSize: 13),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () {
                    Navigator.of(context).pop(false);
                  },
                  style: OutlinedButton.styleFrom(
                    foregroundColor: forestEmerald,
                    side: const BorderSide(color: forestEmerald),
                  ),
                  child: const Text('Continue Editing'),
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.of(context).pop(true);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFC62828),
                  ),
                  child: const Text('Discard'),
                ),
              ),
            ],
          ),
        );
      },
    );

    return result == true;
  }

  Future<void> _handleClose() async {
    if (await _confirmDiscard() && mounted) {
      Navigator.of(context).pop();
    }
  }

  String _formatDateOfBirth(DateTime date) {
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');

    return '${date.year}-$month-$day';
  }

  String? _genderLabel(String? code) {
    switch (code) {
      case 'MALE':
        return 'Male';
      case 'FEMALE':
        return 'Female';
      case 'OTHER':
        return 'Other';
      default:
        return null;
    }
  }

  String? _genderCode(String? label) {
    switch (label) {
      case 'Male':
        return 'MALE';
      case 'Female':
        return 'FEMALE';
      case 'Other':
        return 'OTHER';
      default:
        return null;
    }
  }

  Future<void> _pickDateOfBirth() async {
    if (_draft.verified) return;

    final now = DateTime.now();

    final initial =
        _draft.dateOfBirth ?? DateTime(now.year - 25, now.month, now.day);

    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(1920),
      lastDate: now,
    );

    if (picked == null || !mounted) return;

    setState(() {
      _draft.dateOfBirth = picked;
    });
  }

  Future<void> _verifyApplicant() async {
    final surname = _surname.text.trim();
    final given = _givenNames.text.trim();
    final phone = normalizePhoneForApi(_phone.text);
    final nin = _nationalId.text.trim();
    final gender = _draft.gender;
    final dob = _draft.dateOfBirth;

    var id = _applicationId;

    id ??= await _ensureNewBorrowerDraft();

    if (id == null) {
      if (mounted && _draft.verifyError == null) {
        setState(() {
          _draft.verifyError = 'Application draft is not ready.';
        });
      }

      return;
    }

    if (surname.isEmpty ||
        given.isEmpty ||
        phone.isEmpty ||
        nin.isEmpty ||
        gender == null ||
        dob == null) {
      setState(() {
        _draft.verifyError = 'Fill all required fields to verify.';
      });

      return;
    }

    setState(() {
      _verifying = true;
      _draft.verifyError = null;
    });

    try {
      final application = await _locator.verifyApplicant(
        id: id,
        surname: surname,
        givenNames: given,
        phone: phone,
        nationalId: nin,
        gender: gender,
        dateOfBirth: _formatDateOfBirth(dob),
      );

      if (!mounted) return;

      setState(() {
        _verifying = false;

        _draft
          ..surname = surname
          ..givenNames = given
          ..phone = phone
          ..nationalId = nin
          ..gender = gender
          ..dateOfBirth = dob
          ..verified = application.isVerified
          ..verificationCode = application.verificationCode
          ..verifiedAt = application.verifiedAt ?? DateTime.now()
          ..verifyError = null;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _verifying = false;
        _draft.verified = false;
        _draft.verifyError = error is LoanApplicationFailure
            ? error.message
            : friendlyErrorMessage(error);
      });
    }
  }

  Future<void> _persistCurrentStep() async {
    final id = _applicationId;

    if (id == null) return;

    if (_step == 1) {
      await _persistBorrowerProfileStep();
      return;
    }

    if (_step == 3) {
      final template = _selectedTemplate();

      final principal =
          double.tryParse(_principal.text.replaceAll(',', '')) ?? 0;

      if (template == null) {
        throw LoanApplicationFailure('Select a loan type first.');
      }

      if (template.minLoanAmount != null &&
          principal < template.minLoanAmount!) {
        throw LoanApplicationFailure(
          'Principal must be at least ${template.minLoanAmount!.toStringAsFixed(0)}.',
        );
      }

      if (template.maxLoanAmount != null &&
          principal > template.maxLoanAmount!) {
        throw LoanApplicationFailure(
          'Principal must be at most ${template.maxLoanAmount!.toStringAsFixed(0)}.',
        );
      }

      final amountGivenNow = _currentInitialDisbursementAmount();

      final repaymentsUsed = _currentRepaymentsUsedAmount();

      final floatMessage = _floatMessageForDisbursement(
        amountGivenNow: amountGivenNow,
        collectedRepaymentsAmount: repaymentsUsed,
      );

      if (floatMessage != null) {
        throw LoanApplicationFailure(floatMessage);
      }

      await _locator.saveStep(
        id: id,
        payload: {
          'loanProductTemplateId': template.id,
          'principalAmount': principal,
          'processingFee':
              double.tryParse(_processingFee.text.replaceAll(',', '')) ?? 0,
          'collateralType': _draft.collateralType,
        },
      );

      _draft
        ..principalAmount = _principal.text.trim()
        ..initialDisbursementAmount = _draft.partialDisbursement
            ? _initialDisbursement.text.trim()
            : _principal.text.trim()
        ..collectedRepaymentsAmount = _repaymentsUsed.text.trim()
        ..processingFee = _processingFee.text.trim();

      return;
    }

    if (_step == 4) {
      await _locator.saveStep(
        id: id,
        payload: {
          'guarantor': {
            'fullName': _guarantorName.text.trim(),
            'phone': normalizePhoneForApi(_guarantorPhone.text),
          },
        },
      );

      _draft
        ..guarantorName = _guarantorName.text.trim()
        ..guarantorPhone = _guarantorPhone.text.trim();

      return;
    }

    if (_step == 6) {
      await _locator.saveStep(
        id: id,
        payload: {'termsConfirmed': _draft.termsConfirmed},
      );
    }
  }

  Future<void> _persistBorrowerProfileStep() async {
    final id = _applicationId;

    if (id == null) return;

    final surname = _surname.text.trim();
    final givenNames = _givenNames.text.trim();
    final phone = normalizePhoneForApi(_phone.text);
    final nationalId = _nationalId.text.trim();

    await _locator.saveStep(
      id: id,
      payload: {
        'surname': surname,
        'givenNames': givenNames,
        'phone': phone,
        'nationalId': nationalId,
        if (_draft.gender != null) 'gender': _draft.gender,
        if (_draft.dateOfBirth != null)
          'dateOfBirth': _formatDateOfBirth(_draft.dateOfBirth!),
        'district': _draft.district,
        'subCounty': _draft.subCounty,
        'parish': _draft.parish,
        'village': _draft.village,
      },
    );

    _draft
      ..surname = surname
      ..givenNames = givenNames
      ..phone = phone
      ..nationalId = nationalId;
  }

  Map<String, double>? _pricingPreview() {
    final principal = double.tryParse(_principal.text.replaceAll(',', '')) ?? 0;

    final template = _selectedTemplate();

    if (template == null || principal <= 0) {
      return null;
    }

    final interest =
        (principal * (template.interestRatePercent / 100) * 100).round() / 100;

    final total = ((principal + interest) * 100).round() / 100;

    return {'interest': interest, 'total': total};
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _captureAndUpload(String mediaType) async {
    final id = _applicationId;

    if (id == null) return;

    setState(() {
      _busy = true;
    });

    try {
      final captured = await captureImageWithPermission(context);

      if (captured == null) return;

      final application = await _locator.uploadMedia(
        id: id,
        mediaType: mediaType,
        bytes: captured.bytes,
        mimeType: captured.mimeType,
        fileName: captured.fileName,
      );

      if (!mounted) return;

      setState(() {
        _draft.mediaPreviews[mediaType] = captured.bytes;

        _applyMediaFlags(application.mediaTypes);
      });
    } catch (error) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  Future<void> _pickAndUploadDoc(String mediaType) async {
    final id = _applicationId;

    if (id == null) return;

    final allowed = await ensureRembehPermission(
      context,
      RembehPermissionKind.files,
    );

    if (!allowed) return;

    setState(() {
      _busy = true;
    });

    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png'],
        withData: true,
      );

      if (result == null || result.files.isEmpty) {
        return;
      }

      final file = result.files.first;
      final bytes = file.bytes;

      if (bytes == null) {
        throw LoanApplicationFailure('Could not read selected file.');
      }

      final mimeType = file.extension?.toLowerCase() == 'pdf'
          ? 'application/pdf'
          : file.extension?.toLowerCase() == 'png'
          ? 'image/png'
          : 'image/jpeg';

      final application = await _locator.uploadMedia(
        id: id,
        mediaType: mediaType,
        bytes: bytes,
        mimeType: mimeType,
        fileName: file.name,
      );

      if (!mounted) return;

      setState(() {
        if (mimeType.startsWith('image/')) {
          _draft.mediaPreviews[mediaType] = bytes;
        }

        _applyMediaFlags(application.mediaTypes);

        if (mediaType == 'COLLATERAL_DOC') {
          _draft.collateralDocName = file.name;
        } else if (mediaType == 'SUPPORTING_DOC') {
          _draft.supportingDocName = file.name;
        } else if (mediaType == 'OTHER_DOC') {
          _draft.otherDocName = file.name;
        }
      });
    } catch (error) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  Future<void> _captureSignature({
    required String signerRole,
    required String title,
    required String signerName,
  }) async {
    final id = _applicationId;

    if (id == null) return;

    final capture = await openElectronicSignatureScreen(
      context,
      title: title,
      signerName: signerName,
      signerRole: signerRole,
      loanApplicationId: id,
    );

    if (capture == null) return;

    setState(() {
      _busy = true;
    });

    try {
      final application = await _locator.uploadSignature(
        id: id,
        signerRole: signerRole,
        capture: capture,
      );

      if (!mounted) return;

      setState(() {
        _applyApplicationFlags(application);
      });
    } catch (error) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  void _applyMediaFlags(Set<String> mediaTypes) {
    _draft
      ..passportCaptured = mediaTypes.contains('PASSPORT')
      ..ninFrontCaptured = mediaTypes.contains('NIN_FRONT')
      ..ninBackCaptured = mediaTypes.contains('NIN_BACK')
      ..guarantorNinFrontCaptured = mediaTypes.contains('GUARANTOR_NIN_FRONT')
      ..guarantorNinBackCaptured = mediaTypes.contains('GUARANTOR_NIN_BACK')
      ..collateralDocUploaded = mediaTypes.contains('COLLATERAL_DOC')
      ..supportingDocUploaded = mediaTypes.contains('SUPPORTING_DOC')
      ..otherDocUploaded = mediaTypes.contains('OTHER_DOC')
      ..applicantSigned = mediaTypes.contains('SIGNATURE_APPLICANT')
      ..guarantorSigned = mediaTypes.contains('SIGNATURE_GUARANTOR')
      ..officerSigned = mediaTypes.contains('SIGNATURE_OFFICER');
  }

  void _applyApplicationFlags(LoanApplication application) {
    _applyMediaFlags(application.mediaTypes);

    final latest = <String, LoanApplicationSignatureSummary>{};

    for (final sig in application.signatures) {
      final existing = latest[sig.signerRole];

      if (existing == null || sig.version >= existing.version) {
        latest[sig.signerRole] = sig;
      }
    }

    final applicant = latest['APPLICANT'];
    final guarantor = latest['GUARANTOR'];
    final officer = latest['OFFICER'];

    _draft
      ..applicantSigned = applicant?.locked == true
      ..guarantorSigned = guarantor?.locked == true
      ..officerSigned = officer?.locked == true
      ..applicantSignatureVersion = applicant?.version
      ..guarantorSignatureVersion = guarantor?.version
      ..officerSignatureVersion = officer?.version;
  }

  bool _canContinue() {
    switch (_step) {
      case 1:
        if (_draft.existingBorrower && _selectedBorrower == null) {
          return false;
        }

        if (_draft.existingBorrower && _selectedBorrower != null) {
          return true;
        }

        return _draft.verified &&
            _draft.district != null &&
            _draft.subCounty != null &&
            _draft.parish != null &&
            _draft.village != null;

      case 2:
        return _draft.passportCaptured &&
            _draft.ninFrontCaptured &&
            _draft.ninBackCaptured;

      case 3:
        final principal = _currentPrincipalAmount();
        final amountGivenNow = _currentInitialDisbursementAmount();
        final repaymentsUsed = _currentRepaymentsUsedAmount();

        final partialValid =
            !_draft.partialDisbursement ||
            (amountGivenNow > 0 && amountGivenNow < principal);

        return _draft.loanProductTemplateId != null &&
            _principal.text.trim().isNotEmpty &&
            principal > 0 &&
            partialValid &&
            _processingFee.text.trim().isNotEmpty &&
            _draft.collateralType != null &&
            _floatMessageForDisbursement(
                  amountGivenNow: amountGivenNow,
                  collectedRepaymentsAmount: repaymentsUsed,
                ) ==
                null;

      case 4:
        return _guarantorName.text.trim().isNotEmpty &&
            _guarantorPhone.text.trim().isNotEmpty &&
            _draft.guarantorNinFrontCaptured &&
            _draft.guarantorNinBackCaptured;

      case 5:
        return true;

      case 6:
        return _draft.applicantSigned &&
            _draft.guarantorSigned &&
            _draft.officerSigned &&
            _draft.termsConfirmed;

      case 7:
        return true;

      default:
        return false;
    }
  }

  Future<void> _goNext() async {
    if (_step == 1) {
      if (_draft.existingBorrower && _selectedBorrower == null) {
        _showSnack('Select an existing borrower first.');
        return;
      }

      if (!_draft.existingBorrower && !_draft.verified) {
        await _verifyApplicant();
        return;
      }
    }

    if (!_canContinue()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Complete the required fields to continue.'),
        ),
      );

      return;
    }

    if (_step == 3) {
      _draft
        ..principalAmount = _principal.text.trim()
        ..initialDisbursementAmount = _draft.partialDisbursement
            ? _initialDisbursement.text.trim()
            : _principal.text.trim()
        ..collectedRepaymentsAmount = _repaymentsUsed.text.trim()
        ..processingFee = _processingFee.text.trim();
    }

    if (_step == 4) {
      _draft
        ..guarantorName = _guarantorName.text.trim()
        ..guarantorPhone = _guarantorPhone.text.trim();
    }

    if (_step >= _totalSteps) {
      await _submit();
      return;
    }

    setState(() {
      _busy = true;
    });

    try {
      await _persistCurrentStep();

      if (!mounted) return;

      setState(() {
        _step = _nextStepAfterCurrent();
        _returnToReviewAfterEdit = false;
      });
    } catch (error) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  void _goBack() {
    if (_returnToReviewAfterEdit && _step != _totalSteps) {
      setState(() {
        _step = _totalSteps;
        _returnToReviewAfterEdit = false;
      });
      return;
    }

    if (_step <= 1) {
      // ignore: discarded_futures
      _handleClose();
      return;
    }

    setState(() {
      _step = _step == 3 && _draft.existingBorrower ? 1 : _step - 1;
    });
  }

  Future<void> _submit() async {
    final id = _applicationId;

    if (id == null) return;

    final floatMessage = _floatMessageForDisbursement(
      amountGivenNow: _currentInitialDisbursementAmount(),
      collectedRepaymentsAmount: _currentRepaymentsUsedAmount(),
    );

    if (floatMessage != null) {
      _showSnack(floatMessage);
      return;
    }

    setState(() {
      _busy = true;
    });

    try {
      await _persistCurrentStep();

      await _locator.submit(
        id,
        initialDisbursementAmount: _currentInitialDisbursementAmount(),
        collectedRepaymentsAmount: _currentRepaymentsUsedAmount(),
        disbursementNote: _draft.partialDisbursement
            ? 'Initial partial disbursement recorded from mobile.'
            : null,
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Loan application submitted.')),
      );

      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  int _nextStepAfterCurrent() {
    if (_returnToReviewAfterEdit) {
      return _totalSteps;
    }

    if (_step == 1 && _draft.existingBorrower && _selectedBorrower != null) {
      return 3;
    }

    final next = _step + 1;
    return next > _totalSteps ? _totalSteps : next;
  }

  void _jumpToStep(int step, {bool returnToReview = false}) {
    setState(() {
      _step = step < 1
          ? 1
          : step > _totalSteps
          ? _totalSteps
          : step;
      _returnToReviewAfterEdit = returnToReview;
    });
  }

  String _primaryButtonText() {
    if (_step == _totalSteps) {
      return 'Submit Application';
    }

    if (_step == 1 && !_draft.verified) {
      return _draft.existingBorrower && _selectedBorrower == null
          ? 'Select Borrower'
          : 'Verify Applicant';
    }

    return 'Continue';
  }

  @override
  Widget build(BuildContext context) {
    if (_bootstrapping) {
      return const Scaffold(
        backgroundColor: softIvory,
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_bootError != null) {
      return Scaffold(
        backgroundColor: softIvory,
        appBar: AppBar(
          title: const Text('New Loan Application'),
          leading: IconButton(
            onPressed: () {
              Navigator.of(context).pop();
            },
            icon: const Icon(Icons.close),
          ),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              _bootError!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Color(0xFFC62828)),
            ),
          ),
        ),
      );
    }

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;

        await _handleClose();
      },
      child: Scaffold(
        backgroundColor: softIvory,
        appBar: AppBar(
          backgroundColor: Colors.white,
          foregroundColor: midnightNavy,
          elevation: 0,
          centerTitle: true,
          leading: _step > 1
              ? IconButton(
                  onPressed: _goBack,
                  icon: const Icon(Icons.arrow_back),
                )
              : const SizedBox.shrink(),
          title: const Text(
            'New Loan Application',
            style: TextStyle(
              color: midnightNavy,
              fontWeight: FontWeight.w800,
              fontSize: 16,
            ),
          ),
          actions: [
            IconButton(onPressed: _handleClose, icon: const Icon(Icons.close)),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(40),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: Column(
                children: [
                  ClipRRect(
                    borderRadius: rembehBorderRadius(rembehRadiusSm),
                    child: LinearProgressIndicator(
                      value: _step / _totalSteps,
                      minHeight: 6,
                      backgroundColor: line,
                      color: forestEmerald,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Step $_step of $_totalSteps',
                    style: const TextStyle(
                      color: forestEmerald,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        body: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
                children: _buildStepBody(),
              ),
            ),
            Container(
              color: Colors.white,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
              child: SafeArea(
                top: false,
                child: Column(
                  children: [
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton(
                        onPressed: (_verifying || _busy)
                            ? null
                            : _draft.existingBorrower &&
                                  _step == 1 &&
                                  _selectedBorrower == null
                            ? null
                            : _goNext,
                        child: (_verifying || _busy)
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  if (_step == _totalSteps) ...[
                                    const Icon(Icons.send_outlined, size: 18),
                                    const SizedBox(width: 8),
                                  ],
                                  Text(_primaryButtonText()),
                                  if (_step != _totalSteps &&
                                      !(_step == 1 && !_draft.verified)) ...[
                                    const SizedBox(width: 8),
                                    const Icon(Icons.arrow_forward, size: 18),
                                  ],
                                ],
                              ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    const LoanSecureFooter(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildStepBody() {
    switch (_step) {
      case 1:
        return _stepBasic();
      case 2:
        return _stepIdentity();
      case 3:
        return _stepLoanDetails();
      case 4:
        return _stepGuarantor();
      case 5:
        return _stepSecurity();
      case 6:
        return _stepSignatures();
      case 7:
        return _stepReview();
      default:
        return const [];
    }
  }

  List<Widget> _stepBasic() {
    final selectedBorrower = _selectedBorrower;

    return [
      const Text(
        'Basic Information',
        style: TextStyle(
          color: midnightNavy,
          fontWeight: FontWeight.w800,
          fontSize: 22,
        ),
      ),
      const SizedBox(height: 6),
      const Text(
        'Choose whether this loan is for a new borrower or someone already registered.',
        style: TextStyle(color: slateText, fontSize: 13, height: 1.35),
      ),
      const SizedBox(height: 16),
      Row(
        children: [
          Expanded(
            child: _BorrowerModeButton(
              selected: !_draft.existingBorrower,
              icon: Icons.person_add_alt_1_outlined,
              title: 'New borrower',
              onTap: _selectNewBorrowerMode,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _BorrowerModeButton(
              selected: _draft.existingBorrower,
              icon: Icons.person_search_outlined,
              title: 'Existing borrower',
              onTap: () {
                // ignore: discarded_futures
                _selectExistingBorrowerMode();
              },
            ),
          ),
        ],
      ),
      if (_draft.existingBorrower && selectedBorrower == null) ...[
        const SizedBox(height: 16),
        const LoanFieldLabel(label: 'Find borrower'),
        const SizedBox(height: 6),
        TextField(
          controller: _borrowerSearch,
          textInputAction: TextInputAction.search,
          onChanged: _searchExistingBorrowers,
          onSubmitted: (value) {
            _borrowerSearchDebounce?.cancel();

            // ignore: discarded_futures
            _performBorrowerSearch(value.trim());
          },
          decoration: InputDecoration(
            hintText: 'Search by name or phone number',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: _borrowerSearch.text.isNotEmpty
                ? IconButton(
                    onPressed: () {
                      _borrowerSearchDebounce?.cancel();

                      _borrowerSearch.clear();

                      setState(() {});

                      // ignore: discarded_futures
                      _loadExistingBorrowers();
                    },
                    icon: const Icon(Icons.close, size: 18),
                  )
                : null,
          ),
        ),
        const SizedBox(height: 10),
        if (_borrowerError != null)
          LoanHint(text: _borrowerError!, warning: true),
        if (_borrowersLoading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 22),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (_borrowerResults.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: line),
              borderRadius: rembehBorderRadius(rembehRadiusMd),
            ),
            child: const Column(
              children: [
                Icon(Icons.person_search_outlined, color: slateText, size: 28),
                SizedBox(height: 8),
                Text(
                  'No borrowers found',
                  style: TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                  ),
                ),
                SizedBox(height: 3),
                Text(
                  'Try another name or phone number.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: slateText, fontSize: 12),
                ),
              ],
            ),
          )
        else
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: line),
              borderRadius: rembehBorderRadius(rembehRadiusMd),
            ),
            child: Column(
              children: [
                for (
                  var index = 0;
                  index < _borrowerResults.length;
                  index++
                ) ...[
                  _ExistingBorrowerRow(
                    borrower: _borrowerResults[index],
                    onTap: () {
                      // ignore: discarded_futures
                      _chooseExistingBorrower(_borrowerResults[index]);
                    },
                  ),
                  if (index != _borrowerResults.length - 1)
                    const Divider(height: 1, color: line),
                ],
              ],
            ),
          ),
      ],
      if (_draft.existingBorrower && selectedBorrower != null) ...[
        const SizedBox(height: 16),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: forestEmerald.withValues(alpha: 0.06),
            border: Border.all(color: forestEmerald.withValues(alpha: 0.25)),
            borderRadius: rembehBorderRadius(rembehRadiusMd),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: sage,
                  shape: BoxShape.circle,
                ),
                child: Text(
                  _initials(selectedBorrower.fullName),
                  style: const TextStyle(
                    color: forestEmerald,
                    fontWeight: FontWeight.w900,
                    fontSize: 13,
                  ),
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Existing borrower selected',
                      style: TextStyle(
                        color: forestEmerald,
                        fontWeight: FontWeight.w800,
                        fontSize: 11,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      selectedBorrower.fullName,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w900,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      selectedBorrower.phone,
                      style: const TextStyle(color: slateText, fontSize: 12),
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: _busy ? null : _changeExistingBorrower,
                child: const Text('Change'),
              ),
            ],
          ),
        ),
      ],
      if (!_draft.existingBorrower || selectedBorrower != null) ...[
        const SizedBox(height: 16),
        if (_draft.verified) ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: sage,
              border: Border.all(color: forestEmerald.withValues(alpha: 0.35)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.check_circle, color: forestEmerald),
                const SizedBox(width: 8),
                Expanded(
                  child: Text.rich(
                    TextSpan(
                      style: const TextStyle(
                        color: forestEmerald,
                        fontSize: 12,
                      ),
                      children: [
                        TextSpan(
                          text: _draft.existingBorrower
                              ? 'Borrower verified\n'
                              : 'Applicant verified\n',
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                          ),
                        ),
                        if (_draft.verificationCode != null)
                          TextSpan(
                            text:
                                'Verification code: ${_draft.verificationCode}',
                          ),
                        if (_draft.verifiedAt != null)
                          TextSpan(
                            text:
                                '${_draft.verificationCode != null ? ' • ' : ''}Verified at ${_time(_draft.verifiedAt!)}',
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
        ],
        const LoanFieldLabel(label: 'Surname', showInfo: true),
        const SizedBox(height: 6),
        LoanTextField(
          controller: _surname,
          hint: 'Enter surname',
          icon: Icons.person_outline,
          enabled: !_draft.verified,
          onChanged: (value) {
            _draft.surname = value;
          },
        ),
        const SizedBox(height: 14),
        const LoanFieldLabel(label: 'Given name(s)', showInfo: true),
        const SizedBox(height: 6),
        LoanTextField(
          controller: _givenNames,
          hint: 'Enter given name(s)',
          icon: Icons.person_outline,
          enabled: !_draft.verified,
          onChanged: (value) {
            _draft.givenNames = value;
          },
        ),
        const SizedBox(height: 14),
        const LoanFieldLabel(label: 'Gender'),
        const SizedBox(height: 6),
        LoanSelectField(
          value: _genderLabel(_draft.gender),
          hint: 'Select gender',
          icon: Icons.wc_outlined,
          enabled: !_draft.verified,
          options: const ['Male', 'Female', 'Other'],
          onChanged: (value) {
            setState(() {
              _draft.gender = _genderCode(value);
            });
          },
        ),
        const SizedBox(height: 14),
        const LoanFieldLabel(label: 'Date of birth'),
        const SizedBox(height: 6),
        LoanDateField(
          value: _draft.dateOfBirth,
          hint: 'Select date of birth',
          enabled: !_draft.verified,
          onTap: _pickDateOfBirth,
        ),
        const SizedBox(height: 14),
        const LoanFieldLabel(label: 'Phone number'),
        const SizedBox(height: 6),
        LoanTextField(
          controller: _phone,
          hint: '07xx xxx xxx',
          icon: Icons.phone_outlined,
          keyboardType: TextInputType.phone,
          enabled: !_draft.verified,
          onChanged: (value) {
            _draft.phone = value;
          },
        ),
        const SizedBox(height: 14),
        const LoanFieldLabel(label: 'National ID number', showInfo: true),
        const SizedBox(height: 6),
        LoanTextField(
          controller: _nationalId,
          hint: 'Enter National ID number',
          icon: Icons.badge_outlined,
          enabled: !_draft.verified,
          onChanged: (value) {
            _draft.nationalId = value;
          },
        ),
        if (_draft.verifyError != null) ...[
          const SizedBox(height: 12),
          Text(
            _draft.verifyError!,
            style: const TextStyle(color: Color(0xFFC62828), fontSize: 12),
          ),
        ],
        if (_draft.verified) ...[
          const SizedBox(height: 18),
          const Text(
            'Address',
            style: TextStyle(
              color: midnightNavy,
              fontWeight: FontWeight.w800,
              fontSize: 16,
            ),
          ),
          const SizedBox(height: 12),
          const LoanFieldLabel(label: 'District'),
          const SizedBox(height: 6),
          LoanSelectField(
            value: _draft.district,
            hint: _locationsLoading
                ? 'Loading districts...'
                : 'Select district',
            icon: Icons.location_on_outlined,
            options: _districtOptions(),
            enabled: !_locationsLoading && _districtOptions().isNotEmpty,
            onChanged: (value) {
              setState(() {
                _draft
                  ..district = value
                  ..subCounty = null
                  ..parish = null
                  ..village = null;
              });
            },
          ),
          if (_locationsError != null)
            LoanHint(text: _locationsError!, warning: true),
          const SizedBox(height: 12),
          const LoanFieldLabel(label: 'Sub-county'),
          const SizedBox(height: 6),
          LoanSelectField(
            value: _draft.subCounty,
            hint: _draft.district == null
                ? 'Select district first'
                : 'Select sub-county',
            icon: Icons.location_on_outlined,
            options: _subCountyOptions(),
            enabled:
                !_locationsLoading &&
                _draft.district != null &&
                _subCountyOptions().isNotEmpty,
            onChanged: (value) {
              setState(() {
                _draft
                  ..subCounty = value
                  ..parish = null
                  ..village = null;
              });
            },
          ),
          const SizedBox(height: 12),
          const LoanFieldLabel(label: 'Parish'),
          const SizedBox(height: 6),
          LoanSelectField(
            value: _draft.parish,
            hint: _draft.subCounty == null
                ? 'Select sub-county first'
                : 'Select parish',
            icon: Icons.location_on_outlined,
            options: _parishOptions(),
            enabled:
                !_locationsLoading &&
                _draft.subCounty != null &&
                _parishOptions().isNotEmpty,
            onChanged: (value) {
              setState(() {
                _draft
                  ..parish = value
                  ..village = null;
              });
            },
          ),
          const SizedBox(height: 12),
          const LoanFieldLabel(label: 'Village / LC1 / Zone'),
          const SizedBox(height: 6),
          LoanSelectField(
            value: _draft.village,
            hint: _draft.parish == null
                ? 'Select parish first'
                : 'Select village / LC1 / zone',
            icon: Icons.location_on_outlined,
            options: _villageOptions(),
            enabled:
                !_locationsLoading &&
                _draft.parish != null &&
                _villageOptions().isNotEmpty,
            onChanged: (value) {
              setState(() {
                _draft.village = value;
              });
            },
          ),
        ],
      ],
    ];
  }

  List<Widget> _stepIdentity() {
    return [
      const Text(
        'Applicant & Identity Photos',
        style: TextStyle(
          color: midnightNavy,
          fontWeight: FontWeight.w800,
          fontSize: 22,
        ),
      ),
      const SizedBox(height: 6),
      const Text(
        'An applicant photo is required on every new loan. Capture clear photos — submit is blocked without them.',
        style: TextStyle(color: slateText, fontSize: 13),
      ),
      const SizedBox(height: 16),
      LoanCaptureRow(
        title: 'Applicant Photo',
        subtitle:
            'Passport-style selfie of the applicant — face centered, good light. Required to submit.',
        icon: Icons.person_outline,
        captured: _draft.passportCaptured,
        previewBytes: _draft.mediaPreviews['PASSPORT'],
        onCapture: () {
          // ignore: discarded_futures
          _captureAndUpload('PASSPORT');
        },
      ),
      const SizedBox(height: 10),
      LoanCaptureRow(
        title: 'National ID – Front',
        subtitle: 'Capture the front side of the National ID.',
        icon: Icons.badge_outlined,
        captured: _draft.ninFrontCaptured,
        previewBytes: _draft.mediaPreviews['NIN_FRONT'],
        onCapture: () {
          // ignore: discarded_futures
          _captureAndUpload('NIN_FRONT');
        },
      ),
      const SizedBox(height: 10),
      LoanCaptureRow(
        title: 'National ID – Back',
        subtitle: 'Capture the back side of the National ID.',
        icon: Icons.credit_card,
        captured: _draft.ninBackCaptured,
        previewBytes: _draft.mediaPreviews['NIN_BACK'],
        onCapture: () {
          // ignore: discarded_futures
          _captureAndUpload('NIN_BACK');
        },
      ),
      const SizedBox(height: 14),
      const LoanInfoBanner(
        text:
            'Ensure all photos are clear, well lit and all details are readable.',
      ),
    ];
  }

  List<Widget> _stepLoanDetails() {
    final templateNames = _templates.map((item) => item.name).toList();

    final selected = _selectedTemplate();

    final pricing = _pricingPreview();

    final rangeHint = selected == null
        ? null
        : selected.minLoanAmount == null && selected.maxLoanAmount == null
        ? null
        : 'Allowed: ${selected.minLoanAmount?.toStringAsFixed(0) ?? '—'} – ${selected.maxLoanAmount?.toStringAsFixed(0) ?? '—'}';

    final principal = _currentPrincipalAmount();

    final remainingFloat = _remainingFloatForLoan();

    final collectedRepaymentsAvailable = _collectedRepaymentsAvailableForLoan();

    final amountGivenNow = _currentInitialDisbursementAmount();

    final repaymentsUsed = _currentRepaymentsUsedAmount();

    final remainingToGive = _currentPendingDisbursementAmount();

    final assignedFloatNeeded = amountGivenNow - repaymentsUsed <= 0
        ? 0
        : amountGivenNow - repaymentsUsed;

    final floatMessage = _floatMessageForDisbursement(
      amountGivenNow: amountGivenNow,
      collectedRepaymentsAmount: repaymentsUsed,
    );

    final checkingFloat = remainingFloat == null && _dayStore.loading;

    final needsRepaymentFunding = _needsRepaymentFundingForLoan(amountGivenNow);

    return [
      const Text(
        'Loan Details',
        style: TextStyle(
          color: midnightNavy,
          fontWeight: FontWeight.w800,
          fontSize: 22,
        ),
      ),
      const SizedBox(height: 6),
      const Text(
        'Select the loan type first — terms auto-fill. Then enter the principal.',
        style: TextStyle(color: slateText, fontSize: 13),
      ),
      if (_productsError != null) ...[
        const SizedBox(height: 12),
        LoanInfoBanner(text: _productsError!),
      ],
      const SizedBox(height: 16),
      const LoanFieldLabel(label: 'Loan Type'),
      const SizedBox(height: 6),
      LoanSelectField(
        value: _draft.loanProductTemplateName,
        hint: templateNames.isEmpty
            ? 'No loan types configured'
            : 'Select loan type',
        icon: Icons.category_outlined,
        options: templateNames,
        onChanged: (value) {
          if (value == null) return;

          for (final template in _templates) {
            if (template.name == value) {
              _applyTemplate(template);
              break;
            }
          }
        },
      ),
      if (selected != null) ...[
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: sage,
            border: Border.all(color: line),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Interest: ${selected.interestRatePercent}% ${selected.interestTypeLabel.toLowerCase()}',
                style: const TextStyle(
                  color: midnightNavy,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Term: ${selected.termLabel}',
                style: const TextStyle(color: midnightNavy, fontSize: 13),
              ),
              const SizedBox(height: 4),
              Text(
                'Repayment: ${selected.repaymentLabel}',
                style: const TextStyle(color: midnightNavy, fontSize: 13),
              ),
              const SizedBox(height: 4),
              Text(
                'Processing fee: ${selected.processingFeeLabel}',
                style: const TextStyle(color: midnightNavy, fontSize: 13),
              ),
              const SizedBox(height: 4),
              Text(
                'Penalty: ${selected.penaltyRatePercent}% of principal every ${selected.finePeriodDays} days after maturity',
                style: const TextStyle(color: midnightNavy, fontSize: 12),
              ),
              const SizedBox(height: 4),
              Text(
                'Payment start: ${selected.paymentStartLabel}',
                style: const TextStyle(color: midnightNavy, fontSize: 12),
              ),
            ],
          ),
        ),
      ],
      const SizedBox(height: 14),
      const LoanFieldLabel(label: 'Principal Amount'),
      const SizedBox(height: 6),
      LoanTextField(
        controller: _principal,
        hint: 'Enter loan amount',
        icon: Icons.payments_outlined,
        keyboardType: TextInputType.number,
        errorText: floatMessage,
        onChanged: (_) {
          _recomputeFeeFromTemplate();

          if (!_draft.partialDisbursement) {
            _initialDisbursement.text = _principal.text;
          }

          _syncRepaymentsUsedFromFloat();

          setState(() {});
        },
      ),
      if (rangeHint != null) ...[
        const SizedBox(height: 6),
        Text(rangeHint, style: const TextStyle(color: slateText, fontSize: 12)),
      ],
      const SizedBox(height: 12),
      Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            setState(() {
              _draft.partialDisbursement = !_draft.partialDisbursement;

              if (!_draft.partialDisbursement) {
                _initialDisbursement.text = _principal.text;
              } else if (_initialDisbursement.text.trim().isEmpty) {
                _initialDisbursement.clear();
              }

              _syncRepaymentsUsedFromFloat();
            });
          },
          borderRadius: rembehBorderRadius(rembehRadiusMd),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: _draft.partialDisbursement
                  ? forestEmerald.withValues(alpha: 0.07)
                  : Colors.white,
              border: Border.all(
                color: _draft.partialDisbursement
                    ? forestEmerald.withValues(alpha: 0.35)
                    : line,
              ),
              borderRadius: rembehBorderRadius(rembehRadiusMd),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Checkbox(
                  value: _draft.partialDisbursement,
                  onChanged: (value) {
                    setState(() {
                      _draft.partialDisbursement = value ?? false;

                      if (!_draft.partialDisbursement) {
                        _initialDisbursement.text = _principal.text;
                      }

                      _syncRepaymentsUsedFromFloat();
                    });
                  },
                  activeColor: forestEmerald,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                const SizedBox(width: 8),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Giving only part of this amount now',
                        style: TextStyle(
                          color: midnightNavy,
                          fontWeight: FontWeight.w800,
                          fontSize: 13,
                        ),
                      ),
                      SizedBox(height: 3),
                      Text(
                        'Use this when the client will receive the remaining amount later.',
                        style: TextStyle(
                          color: slateText,
                          fontSize: 12,
                          height: 1.25,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                const Icon(Icons.info_outline, color: forestEmerald, size: 18),
              ],
            ),
          ),
        ),
      ),
      if (_draft.partialDisbursement) ...[
        const SizedBox(height: 12),
        const LoanFieldLabel(label: 'Amount Given Now'),
        const SizedBox(height: 6),
        LoanTextField(
          controller: _initialDisbursement,
          hint: 'Enter amount given now',
          icon: Icons.payments_outlined,
          keyboardType: TextInputType.number,
          onChanged: (_) {
            _syncRepaymentsUsedFromFloat();
            setState(() {});
          },
        ),
        if (principal > 0 && amountGivenNow >= principal) ...[
          const SizedBox(height: 6),
          const Text(
            'For partial disbursement, this must be less than the full loan amount.',
            style: TextStyle(
              color: Color(0xFFC62828),
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
        const SizedBox(height: 10),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          decoration: BoxDecoration(
            color: sage,
            border: Border.all(color: line),
            borderRadius: rembehBorderRadius(rembehRadiusMd),
          ),
          child: Text(
            'Remaining to give: UGX ${formatMoney(remainingToGive)}',
            style: const TextStyle(
              color: forestEmerald,
              fontWeight: FontWeight.w900,
              fontSize: 14,
            ),
          ),
        ),
      ],
      if (needsRepaymentFunding) ...[
        const SizedBox(height: 12),
        const LoanFieldLabel(label: 'Use Collected Repayments', required: true),
        const SizedBox(height: 6),
        LoanTextField(
          controller: _repaymentsUsed,
          hint: 'Amount added from repayments',
          icon: Icons.savings_outlined,
          keyboardType: TextInputType.number,
          onChanged: (_) {
            _repaymentsUsedEdited = true;
            setState(() {});
          },
        ),
        const SizedBox(height: 6),
        Text(
          'Added from repayments: UGX ${formatMoney(repaymentsUsed)}. Assigned float needed: UGX ${formatMoney(assignedFloatNeeded)}. Available repayments: UGX ${formatMoney(collectedRepaymentsAvailable)}.',
          style: const TextStyle(
            color: slateText,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
      if (checkingFloat || remainingFloat != null) ...[
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: checkingFloat
                ? sage
                : floatMessage == null
                ? forestEmerald.withValues(alpha: 0.08)
                : const Color(0xFFC62828).withValues(alpha: 0.08),
            border: Border.all(
              color: checkingFloat
                  ? line
                  : floatMessage == null
                  ? forestEmerald.withValues(alpha: 0.28)
                  : const Color(0xFFC62828).withValues(alpha: 0.28),
            ),
            borderRadius: rembehBorderRadius(rembehRadiusMd),
          ),
          child: Row(
            children: [
              Icon(
                checkingFloat
                    ? Icons.sync_rounded
                    : floatMessage == null
                    ? Icons.account_balance_wallet_outlined
                    : Icons.warning_amber_rounded,
                color: checkingFloat
                    ? slateText
                    : floatMessage == null
                    ? forestEmerald
                    : const Color(0xFFC62828),
                size: 18,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  checkingFloat
                      ? "Checking today's float..."
                      : floatMessage ??
                            'Float left: UGX ${formatMoney(remainingFloat ?? 0)}',
                  style: TextStyle(
                    color: checkingFloat
                        ? slateText
                        : floatMessage == null
                        ? forestEmerald
                        : const Color(0xFFC62828),
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    height: 1.2,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
      const SizedBox(height: 14),
      const LoanFieldLabel(label: 'Loan Processing Fee'),
      const SizedBox(height: 6),
      LoanTextField(
        controller: _processingFee,
        hint: 'Auto-filled from loan type',
        icon: Icons.receipt_long_outlined,
        keyboardType: TextInputType.number,
        onChanged: (_) {
          setState(() {});
        },
      ),
      if (pricing != null) ...[
        const SizedBox(height: 14),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: sage,
            border: Border.all(color: line),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Interest: ${formatMoney(pricing['interest']!)}',
                style: const TextStyle(
                  color: midnightNavy,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Total repayable: ${formatMoney(pricing['total']!)}',
                style: const TextStyle(
                  color: midnightNavy,
                  fontWeight: FontWeight.w800,
                  fontSize: 14,
                ),
              ),
            ],
          ),
        ),
      ],
      const SizedBox(height: 14),
      const LoanFieldLabel(label: 'Collateral Type'),
      const SizedBox(height: 6),
      LoanSelectField(
        value: _draft.collateralType,
        hint: 'Select collateral type',
        icon: Icons.shield_outlined,
        options: const [
          'Motorcycle (Logbook)',
          'Land title',
          'Household assets',
          'Salary guarantee',
          'None',
        ],
        onChanged: (value) {
          setState(() {
            _draft.collateralType = value;
          });
        },
      ),
      const SizedBox(height: 14),
      const LoanInfoBanner(
        text:
            'Loan type terms come from your branch manager. Template edits later do not change this application.',
      ),
    ];
  }

  List<Widget> _stepGuarantor() {
    return [
      const Text(
        'Guarantor Information',
        style: TextStyle(
          color: midnightNavy,
          fontWeight: FontWeight.w800,
          fontSize: 22,
        ),
      ),
      const SizedBox(height: 6),
      const Text(
        'Provide details of the guarantor for this loan.',
        style: TextStyle(color: slateText, fontSize: 13),
      ),
      const SizedBox(height: 16),
      const LoanFieldLabel(label: 'Full Name'),
      const SizedBox(height: 6),
      LoanTextField(
        controller: _guarantorName,
        hint: 'Enter full name',
        icon: Icons.person_outline,
      ),
      const SizedBox(height: 14),
      const LoanFieldLabel(label: 'Phone Number'),
      const SizedBox(height: 6),
      LoanTextField(
        controller: _guarantorPhone,
        hint: 'Enter phone number',
        icon: Icons.phone_outlined,
        keyboardType: TextInputType.phone,
      ),
      const SizedBox(height: 14),
      LoanCaptureRow(
        title: 'National ID – Front',
        subtitle: 'Capture the front side of the National ID.',
        icon: Icons.badge_outlined,
        captured: _draft.guarantorNinFrontCaptured,
        previewBytes: _draft.mediaPreviews['GUARANTOR_NIN_FRONT'],
        onCapture: () {
          // ignore: discarded_futures
          _captureAndUpload('GUARANTOR_NIN_FRONT');
        },
      ),
      const SizedBox(height: 10),
      LoanCaptureRow(
        title: 'National ID – Back',
        subtitle: 'Capture the back side of the National ID.',
        icon: Icons.credit_card,
        captured: _draft.guarantorNinBackCaptured,
        previewBytes: _draft.mediaPreviews['GUARANTOR_NIN_BACK'],
        onCapture: () {
          // ignore: discarded_futures
          _captureAndUpload('GUARANTOR_NIN_BACK');
        },
      ),
      const SizedBox(height: 14),
      const LoanInfoBanner(
        text:
            'Ensure all guarantor information is accurate and documents are clear.',
      ),
    ];
  }

  List<Widget> _stepSecurity() {
    return [
      Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: sage,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.verified_user_outlined,
              color: forestEmerald,
            ),
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Security Documents',
                  style: TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w800,
                    fontSize: 22,
                  ),
                ),
                Text(
                  'Upload the security documents provided for this loan.',
                  style: TextStyle(color: slateText, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      ),
      const SizedBox(height: 18),
      LoanUploadBox(
        label: 'Collateral Document (Optional)',
        uploaded: _draft.collateralDocUploaded,
        fileName: _draft.collateralDocName,
        previewBytes: _draft.mediaPreviews['COLLATERAL_DOC'],
        onUpload: () {
          // ignore: discarded_futures
          _pickAndUploadDoc('COLLATERAL_DOC');
        },
      ),
      const SizedBox(height: 14),
      LoanUploadBox(
        label: 'Additional Supporting Document (Optional)',
        uploaded: _draft.supportingDocUploaded,
        fileName: _draft.supportingDocName,
        previewBytes: _draft.mediaPreviews['SUPPORTING_DOC'],
        onUpload: () {
          // ignore: discarded_futures
          _pickAndUploadDoc('SUPPORTING_DOC');
        },
      ),
      const SizedBox(height: 14),
      LoanUploadBox(
        label: 'Any Other Document (Optional)',
        uploaded: _draft.otherDocUploaded,
        fileName: _draft.otherDocName,
        previewBytes: _draft.mediaPreviews['OTHER_DOC'],
        onUpload: () {
          // ignore: discarded_futures
          _pickAndUploadDoc('OTHER_DOC');
        },
      ),
      const SizedBox(height: 14),
      const LoanInfoBanner(text: 'Ensure all documents are clear and valid.'),
    ];
  }

  List<Widget> _stepSignatures() {
    final officer = widget.session.userName;

    return [
      Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: sage,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.draw_outlined, color: forestEmerald),
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Agreement & Signatures',
                  style: TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w800,
                    fontSize: 22,
                  ),
                ),
                Text(
                  'Review the agreement with the applicant before collecting signatures from all parties.',
                  style: TextStyle(color: slateText, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      ),
      const SizedBox(height: 16),
      LoanSignaturePad(
        title: 'Loan Applicant Signature',
        name: _draft.fullName.isEmpty ? 'Applicant' : _draft.fullName,
        icon: Icons.person_outline,
        signed: _draft.applicantSigned,
        locked: _draft.applicantSigned,
        version: _draft.applicantSignatureVersion,
        onSign: () {
          // ignore: discarded_futures
          _captureSignature(
            signerRole: 'APPLICANT',
            title: 'Loan Applicant Signature',
            signerName: _draft.fullName.isEmpty ? 'Applicant' : _draft.fullName,
          );
        },
      ),
      const SizedBox(height: 10),
      LoanSignaturePad(
        title: 'Guarantor Signature',
        name: _guarantorName.text.trim().isEmpty
            ? 'Guarantor'
            : _guarantorName.text.trim(),
        icon: Icons.groups_outlined,
        signed: _draft.guarantorSigned,
        locked: _draft.guarantorSigned,
        version: _draft.guarantorSignatureVersion,
        onSign: () {
          // ignore: discarded_futures
          _captureSignature(
            signerRole: 'GUARANTOR',
            title: 'Guarantor Signature',
            signerName: _guarantorName.text.trim().isEmpty
                ? 'Guarantor'
                : _guarantorName.text.trim(),
          );
        },
      ),
      const SizedBox(height: 10),
      LoanSignaturePad(
        title: 'Agent Signature',
        name: '$officer (You)',
        icon: Icons.badge_outlined,
        signed: _draft.officerSigned,
        locked: _draft.officerSigned,
        version: _draft.officerSignatureVersion,
        onSign: () {
          // ignore: discarded_futures
          _captureSignature(
            signerRole: 'OFFICER',
            title: 'Agent Signature',
            signerName: officer,
          );
        },
      ),
      const SizedBox(height: 12),
      Material(
        color: sage,
        child: CheckboxListTile(
          value: _draft.termsConfirmed,
          onChanged: (value) {
            setState(() {
              _draft.termsConfirmed = value ?? false;
            });
          },
          activeColor: forestEmerald,
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: const EdgeInsets.symmetric(horizontal: 8),
          title: const Text(
            'I confirm that the borrower and guarantor have understood and accepted the loan terms.',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    ];
  }

  List<Widget> _stepReview() {
    final principal =
        int.tryParse(_draft.principalAmount.replaceAll(',', '')) ?? 0;

    final initialDisbursement =
        int.tryParse(_draft.initialDisbursementAmount.replaceAll(',', '')) ??
        principal;

    final repaymentCashUsed =
        int.tryParse(_draft.collectedRepaymentsAmount.replaceAll(',', '')) ?? 0;

    final remainingDisbursement = principal - initialDisbursement <= 0
        ? 0
        : principal - initialDisbursement;

    final fee = int.tryParse(_draft.processingFee.replaceAll(',', '')) ?? 0;

    return [
      Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: sage,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.fact_check_outlined, color: forestEmerald),
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Review & Submit',
                  style: TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w800,
                    fontSize: 22,
                  ),
                ),
                Text(
                  'Review all information below before submitting the application. Ensure it is accurate and complete.',
                  style: TextStyle(color: slateText, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      ),
      const SizedBox(height: 16),
      _ReviewCard(
        icon: Icons.person_outline,
        title: 'Applicant Information',
        onEdit: () {
          _jumpToStep(1, returnToReview: true);
        },
        rows: [
          (
            'Borrower',
            _draft.existingBorrower ? 'Existing borrower' : 'New borrower',
          ),
          ('Full Name', _draft.fullName),
          ('Phone Number', _draft.phone),
          (
            'Location',
            '${_draft.district ?? '—'} – ${_draft.subCounty ?? '—'}',
          ),
          (
            'Address',
            'LC1: ${_draft.village ?? '—'}, Parish: ${_draft.parish ?? '—'}',
          ),
        ],
      ),
      const SizedBox(height: 10),
      _ReviewCard(
        icon: Icons.work_outline,
        title: 'Loan Details',
        onEdit: () {
          _jumpToStep(3, returnToReview: true);
        },
        rows: [
          ('Loan Amount', formatMoney(principal)),
          if (_draft.partialDisbursement)
            ('Amount Given Now', formatMoney(initialDisbursement)),
          if (_draft.partialDisbursement)
            ('Remaining To Give', formatMoney(remainingDisbursement)),
          if (repaymentCashUsed > 0)
            ('Repayments Used', formatMoney(repaymentCashUsed)),
          ('Interest Rate', _draft.interestRate ?? '—'),
          ('Loan Duration', _draft.loanDurationDays ?? '—'),
          ('Loan Processing Fee', formatMoney(fee)),
          ('Collateral Type', _draft.collateralType ?? '—'),
        ],
      ),
      const SizedBox(height: 10),
      _ReviewCard(
        icon: Icons.verified_user_outlined,
        title: 'Guarantor Information',
        onEdit: () {
          _jumpToStep(4, returnToReview: true);
        },
        rows: [
          ('Full Name', _guarantorName.text.trim()),
          ('Phone Number', _guarantorPhone.text.trim()),
          (
            'National ID',
            _draft.guarantorNinFrontCaptured && _draft.guarantorNinBackCaptured
                ? 'Front & Back uploaded'
                : 'Incomplete',
          ),
          (
            'Photos',
            _draft.existingBorrower
                ? 'Existing borrower record used'
                : _draft.passportCaptured &&
                      _draft.ninFrontCaptured &&
                      _draft.ninBackCaptured
                ? 'Identity photos uploaded'
                : 'Incomplete',
          ),
        ],
      ),
      const SizedBox(height: 10),
      _ReviewCard(
        icon: Icons.description_outlined,
        title: 'Security Documents',
        onEdit: () {
          _jumpToStep(5, returnToReview: true);
        },
        rows: [
          (
            'Collateral Document',
            _draft.collateralDocUploaded
                ? _draft.collateralDocName
                : 'Not uploaded',
          ),
          (
            'Supporting Document',
            _draft.supportingDocUploaded
                ? _draft.supportingDocName
                : 'Not uploaded',
          ),
          (
            'Other Document',
            _draft.otherDocUploaded ? _draft.otherDocName : 'Not uploaded',
          ),
        ],
      ),
    ];
  }

  String _time(DateTime value) {
    final hour = value.hour % 12 == 0 ? 12 : value.hour % 12;

    final minute = value.minute.toString().padLeft(2, '0');

    final period = value.hour >= 12 ? 'PM' : 'AM';

    return '$hour:$minute $period';
  }
}

class _BorrowerModeButton extends StatelessWidget {
  const _BorrowerModeButton({
    required this.selected,
    required this.icon,
    required this.title,
    required this.onTap,
  });

  final bool selected;
  final IconData icon;
  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: rembehBorderRadius(rembehRadiusMd),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          constraints: const BoxConstraints(minHeight: 78),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
          decoration: BoxDecoration(
            color: selected
                ? forestEmerald.withValues(alpha: 0.07)
                : Colors.white,
            border: Border.all(
              color: selected ? forestEmerald.withValues(alpha: 0.45) : line,
            ),
            borderRadius: rembehBorderRadius(rembehRadiusMd),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 20, color: selected ? forestEmerald : slateText),
              const SizedBox(height: 8),
              Text(
                title,
                style: TextStyle(
                  color: selected ? forestEmerald : midnightNavy,
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ExistingBorrowerRow extends StatelessWidget {
  const _ExistingBorrowerRow({required this.borrower, required this.onTap});

  final CustomerLocal borrower;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: sage,
                  shape: BoxShape.circle,
                ),
                child: Text(
                  _initials(borrower.fullName),
                  style: const TextStyle(
                    color: forestEmerald,
                    fontWeight: FontWeight.w900,
                    fontSize: 12,
                  ),
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      borrower.fullName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      borrower.phone,
                      style: const TextStyle(color: slateText, fontSize: 11),
                    ),
                    if (borrower.village?.trim().isNotEmpty == true) ...[
                      const SizedBox(height: 2),
                      Text(
                        borrower.village!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: slateText, fontSize: 11),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(Icons.chevron_right, color: slateText, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({
    required this.icon,
    required this.title,
    required this.rows,
    required this.onEdit,
  });

  final IconData icon;
  final String title;
  final List<(String, String)> rows;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: sage,
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 15, color: forestEmerald),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: onEdit,
                icon: const Icon(Icons.edit_outlined, size: 14),
                label: const Text('Edit'),
                style: TextButton.styleFrom(
                  foregroundColor: forestEmerald,
                  visualDensity: VisualDensity.compact,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...rows.map(
            (row) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      row.$1,
                      style: const TextStyle(color: slateText, fontSize: 12),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      row.$2,
                      textAlign: TextAlign.right,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

(String, String) _splitBorrowerName(String value) {
  final parts = value
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();

  if (parts.isEmpty) {
    return ('Unknown', '');
  }

  if (parts.length == 1) {
    return (parts.first, '');
  }

  return (parts.first, parts.skip(1).join(' '));
}

String? _textValue(Object? value) {
  if (value == null) return null;

  final text = value.toString().trim();

  return text.isEmpty ? null : text;
}

DateTime? _dateValue(Object? value) {
  if (value == null) return null;

  if (value is DateTime) {
    return value;
  }

  return DateTime.tryParse(value.toString());
}

String _initials(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();

  if (parts.isEmpty) {
    return '?';
  }

  if (parts.length == 1) {
    return parts.first.substring(0, 1).toUpperCase();
  }

  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}
