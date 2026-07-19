import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../core/di/loan_application_locator.dart';
import '../../core/network/phone_normalize.dart';
import '../../features/loan_application/domain/failures.dart';
import '../../services/session_store.dart';
import '../../shared/camera_capture/camera_capture.dart';
import '../../shared/permissions/rembeh_permission_gate.dart';
import '../../features/loan_application/domain/entities/loan_application.dart';
import '../../shared/signature_pad/electronic_signature_screen.dart';
import '../../theme.dart';
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
  final _draft = LoanApplicationDraft();
  final _surname = TextEditingController();
  final _givenNames = TextEditingController();
  final _phone = TextEditingController();
  final _nationalId = TextEditingController();
  final _principal = TextEditingController();
  final _processingFee = TextEditingController();
  final _guarantorName = TextEditingController();
  final _guarantorPhone = TextEditingController();

  String? _applicationId;
  int _step = 1;
  bool _verifying = false;
  bool _busy = false;
  bool _bootstrapping = true;
  String? _bootError;
  List<LoanRateOption> _rateOptions = const [];
  List<LoanPeriodOption> _periodOptions = const [];
  String? _productsError;

  @override
  void initState() {
    super.initState();
    _bootstrapDraft();
    _loadLoanProducts();
  }

  Future<void> _loadLoanProducts() async {
    try {
      final catalog = await _locator.loadLoanProducts();
      if (!mounted) return;
      setState(() {
        _rateOptions = catalog.rates;
        _periodOptions = catalog.periods;
        _productsError = catalog.rates.isEmpty || catalog.periods.isEmpty
            ? 'Ask your branch manager to configure loan rates and periods.'
            : null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _productsError = 'Could not load loan products.';
      });
    }
  }

  Future<void> _bootstrapDraft() async {
    try {
      final application = await _locator.createDraft();
      if (!mounted) return;
      setState(() {
        _applicationId = application.id;
        _bootstrapping = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _bootstrapping = false;
        _bootError = error.toString();
      });
    }
  }

  @override
  void dispose() {
    _surname.dispose();
    _givenNames.dispose();
    _phone.dispose();
    _nationalId.dispose();
    _principal.dispose();
    _processingFee.dispose();
    _guarantorName.dispose();
    _guarantorPhone.dispose();
    super.dispose();
  }

  Future<bool> _confirmDiscard() async {
    if (!_draft.hasProgress && _step == 1) return true;

    final result = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: Colors.white,
          shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
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
                  onPressed: () => Navigator.of(context).pop(false),
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
                  onPressed: () => Navigator.of(context).pop(true),
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

  Future<void> _verifyApplicant() async {
    final surname = _surname.text.trim();
    final given = _givenNames.text.trim();
    final phone = normalizePhoneForApi(_phone.text);
    final nin = _nationalId.text.trim();
    final id = _applicationId;

    if (id == null) {
      setState(() => _draft.verifyError = 'Application draft is not ready.');
      return;
    }

    if (surname.isEmpty || given.isEmpty || phone.isEmpty || nin.isEmpty) {
      setState(() => _draft.verifyError = 'Fill all required fields to verify.');
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
      );
      if (!mounted) return;
      setState(() {
        _verifying = false;
        _draft
          ..surname = surname
          ..givenNames = given
          ..phone = phone
          ..nationalId = nin
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
            : error.toString();
      });
    }
  }

  Future<void> _persistCurrentStep() async {
    final id = _applicationId;
    if (id == null) return;

    if (_step == 1) {
      await _locator.saveStep(
        id: id,
        payload: {
          'district': _draft.district,
          'subCounty': _draft.subCounty,
          'parish': _draft.parish,
          'village': _draft.village,
        },
      );
      return;
    }

    if (_step == 3) {
      final interest = _selectedRatePercent();
      final duration = _selectedDurationDays();
      if (interest == null || duration == null) {
        _showSnack('Select a configured interest rate and loan period.');
        return;
      }
      await _locator.saveStep(
        id: id,
        payload: {
          'principalAmount':
              double.tryParse(_principal.text.replaceAll(',', '')) ?? 0,
          'interestRatePercent': interest,
          'durationDays': duration,
          'processingFee':
              double.tryParse(_processingFee.text.replaceAll(',', '')) ?? 0,
          'collateralType': _draft.collateralType,
        },
      );
      _draft
        ..principalAmount = _principal.text.trim()
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

  double? _selectedRatePercent() {
    final label = _draft.interestRate;
    if (label == null) return null;
    for (final option in _rateOptions) {
      if (option.label == label) return option.interestRatePercent;
    }
    return null;
  }

  int? _selectedDurationDays() {
    final label = _draft.loanDurationDays;
    if (label == null) return null;
    for (final option in _periodOptions) {
      if (option.label == label) return option.durationDays;
    }
    return null;
  }

  Map<String, double>? _pricingPreview() {
    final principal =
        double.tryParse(_principal.text.replaceAll(',', '')) ?? 0;
    final rate = _selectedRatePercent();
    final days = _selectedDurationDays();
    final fee =
        double.tryParse(_processingFee.text.replaceAll(',', '')) ?? 0;
    if (rate == null || days == null || principal <= 0) return null;
    final interest =
        (principal * (rate / 100) * (days / 365) * 100).round() / 100;
    final total = ((principal + interest + fee) * 100).round() / 100;
    return {
      'interest': interest,
      'total': total,
    };
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  Future<void> _captureAndUpload(String mediaType) async {
    final id = _applicationId;
    if (id == null) return;

    setState(() => _busy = true);
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
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

    setState(() => _busy = true);
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png'],
        withData: true,
      );
      if (result == null || result.files.isEmpty) return;
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
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

    setState(() => _busy = true);
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
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
        return _principal.text.trim().isNotEmpty &&
            _draft.interestRate != null &&
            _draft.loanDurationDays != null &&
            _rateOptions.isNotEmpty &&
            _periodOptions.isNotEmpty &&
            _processingFee.text.trim().isNotEmpty &&
            _draft.collateralType != null;
      case 4:
        return _guarantorName.text.trim().isNotEmpty &&
            _guarantorPhone.text.trim().isNotEmpty &&
            _draft.guarantorNinFrontCaptured &&
            _draft.guarantorNinBackCaptured;
      case 5:
        return true; // optional docs
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
    if (_step == 1 && !_draft.verified) {
      await _verifyApplicant();
      return;
    }

    if (!_canContinue()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Complete the required fields to continue.')),
      );
      return;
    }

    if (_step == 3) {
      _draft
        ..principalAmount = _principal.text.trim()
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

    setState(() => _busy = true);
    try {
      await _persistCurrentStep();
      if (!mounted) return;
      setState(() => _step += 1);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _goBack() {
    if (_step <= 1) {
      _handleClose();
      return;
    }
    setState(() => _step -= 1);
  }

  Future<void> _submit() async {
    final id = _applicationId;
    if (id == null) return;

    setState(() => _busy = true);
    try {
      await _persistCurrentStep();
      await _locator.submit(id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Loan application submitted.')),
      );
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _jumpToStep(int step) {
    setState(() => _step = step);
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
            onPressed: () => Navigator.of(context).pop(),
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
            IconButton(
              onPressed: _handleClose,
              icon: const Icon(Icons.close),
            ),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(40),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: Column(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.zero,
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
                children: [
                  ..._buildStepBody(),
                ],
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
                        onPressed: (_verifying || _busy) ? null : _goNext,
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
                                  if (_step == 1 && !_draft.verified)
                                    const Text('Verify Applicant')
                                  else if (_step == _totalSteps) ...[
                                    const Icon(Icons.send_outlined, size: 18),
                                    const SizedBox(width: 8),
                                    const Text('Submit Application'),
                                  ] else ...[
                                    const Text('Continue'),
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
    return [
      const Text(
        'Basic Information',
        style: TextStyle(
          color: midnightNavy,
          fontWeight: FontWeight.w800,
          fontSize: 22,
        ),
      ),
      const SizedBox(height: 14),
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
                    style: const TextStyle(color: forestEmerald, fontSize: 12),
                    children: [
                      const TextSpan(
                        text: 'Applicant verified\n',
                        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
                      ),
                      TextSpan(
                        text:
                            'Verification code: ${_draft.verificationCode} • Verified at ${_time(_draft.verifiedAt!)}',
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
        onChanged: (value) => _draft.surname = value,
      ),
      const LoanHint(
        text: 'Enter the name as it appears on the National ID.',
        warning: true,
      ),
      const SizedBox(height: 14),
      const LoanFieldLabel(label: 'Given name(s)', showInfo: true),
      const SizedBox(height: 6),
      LoanTextField(
        controller: _givenNames,
        hint: 'Enter given name(s)',
        icon: Icons.person_outline,
        enabled: !_draft.verified,
        onChanged: (value) => _draft.givenNames = value,
      ),
      const LoanHint(
        text: 'Enter the name as it appears on the National ID.',
        warning: true,
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
        onChanged: (value) => _draft.phone = value,
      ),
      const LoanHint(text: "Enter the client's active phone number."),
      const SizedBox(height: 14),
      const LoanFieldLabel(label: 'National ID number', showInfo: true),
      const SizedBox(height: 6),
      LoanTextField(
        controller: _nationalId,
        hint: 'Enter National ID number',
        icon: Icons.badge_outlined,
        enabled: !_draft.verified,
        onChanged: (value) => _draft.nationalId = value,
      ),
      const LoanHint(
        text: 'Incorrect NIN will cause failure to process the loan.',
        warning: true,
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
          hint: 'Select district',
          icon: Icons.location_on_outlined,
          options: const ['Kampala', 'Wakiso', 'Mukono', 'Jinja'],
          onChanged: (value) => setState(() => _draft.district = value),
        ),
        const SizedBox(height: 12),
        const LoanFieldLabel(label: 'Sub-county'),
        const SizedBox(height: 6),
        LoanSelectField(
          value: _draft.subCounty,
          hint: 'Select sub-county',
          icon: Icons.location_on_outlined,
          options: const [
            'Kawempe Division',
            'Nakawa Division',
            'Makindye Division',
            'Central Division',
          ],
          onChanged: (value) => setState(() => _draft.subCounty = value),
        ),
        const SizedBox(height: 12),
        const LoanFieldLabel(label: 'Parish'),
        const SizedBox(height: 6),
        LoanSelectField(
          value: _draft.parish,
          hint: 'Select parish',
          icon: Icons.location_on_outlined,
          options: const ['Bwaise Parish', 'Nakawa', 'Ntinda', 'Kisaasi'],
          onChanged: (value) => setState(() => _draft.parish = value),
        ),
        const SizedBox(height: 12),
        const LoanFieldLabel(label: 'Village / LC1 / Zone'),
        const SizedBox(height: 6),
        LoanSelectField(
          value: _draft.village,
          hint: 'Select village / LC1 / zone',
          icon: Icons.location_on_outlined,
          options: const ['Bwaise I / LC1', 'Zone 3', 'LC1 Central', 'Zone A'],
          onChanged: (value) => setState(() => _draft.village = value),
        ),
      ],
    ];
  }

  List<Widget> _stepIdentity() {
    return [
      const Text(
        'Identity Photos',
        style: TextStyle(
          color: midnightNavy,
          fontWeight: FontWeight.w800,
          fontSize: 22,
        ),
      ),
      const SizedBox(height: 6),
      const Text(
        'Capture clear identity photos for this applicant.',
        style: TextStyle(color: slateText, fontSize: 13),
      ),
      const SizedBox(height: 16),
      LoanCaptureRow(
        title: 'Passport Photo',
        subtitle: 'Capture a clear passport size photo.',
        icon: Icons.person_outline,
        captured: _draft.passportCaptured,
        previewBytes: _draft.mediaPreviews['PASSPORT'],
        onCapture: () => _captureAndUpload('PASSPORT'),
      ),
      const SizedBox(height: 10),
      LoanCaptureRow(
        title: 'National ID – Front',
        subtitle: 'Capture the front side of the National ID.',
        icon: Icons.badge_outlined,
        captured: _draft.ninFrontCaptured,
        previewBytes: _draft.mediaPreviews['NIN_FRONT'],
        onCapture: () => _captureAndUpload('NIN_FRONT'),
      ),
      const SizedBox(height: 10),
      LoanCaptureRow(
        title: 'National ID – Back',
        subtitle: 'Capture the back side of the National ID.',
        icon: Icons.credit_card,
        captured: _draft.ninBackCaptured,
        previewBytes: _draft.mediaPreviews['NIN_BACK'],
        onCapture: () => _captureAndUpload('NIN_BACK'),
      ),
      const SizedBox(height: 14),
      const LoanInfoBanner(
        text: 'Ensure all photos are clear, well lit and all details are readable.',
      ),
    ];
  }

  List<Widget> _stepLoanDetails() {
    final rateLabels = _rateOptions.map((item) => item.label).toList();
    final periodLabels = _periodOptions.map((item) => item.label).toList();
    final pricing = _pricingPreview();

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
        'Provide loan information as agreed with the client.',
        style: TextStyle(color: slateText, fontSize: 13),
      ),
      if (_productsError != null) ...[
        const SizedBox(height: 12),
        LoanInfoBanner(text: _productsError!),
      ],
      const SizedBox(height: 16),
      const LoanFieldLabel(label: 'Principal Amount'),
      const SizedBox(height: 6),
      LoanTextField(
        controller: _principal,
        hint: 'Enter loan amount',
        icon: Icons.payments_outlined,
        keyboardType: TextInputType.number,
        onChanged: (_) => setState(() {}),
      ),
      const SizedBox(height: 14),
      const LoanFieldLabel(label: 'Interest Rate (%)'),
      const SizedBox(height: 6),
      LoanSelectField(
        value: _draft.interestRate,
        hint: rateLabels.isEmpty
            ? 'No rates configured'
            : 'Select interest rate',
        icon: Icons.percent,
        options: rateLabels,
        onChanged: (value) => setState(() => _draft.interestRate = value),
      ),
      const SizedBox(height: 14),
      const LoanFieldLabel(label: 'Loan Duration (Days)'),
      const SizedBox(height: 6),
      LoanSelectField(
        value: _draft.loanDurationDays,
        hint: periodLabels.isEmpty
            ? 'No periods configured'
            : 'Select duration',
        icon: Icons.calendar_today_outlined,
        options: periodLabels,
        onChanged: (value) => setState(() => _draft.loanDurationDays = value),
      ),
      const SizedBox(height: 14),
      const LoanFieldLabel(label: 'Loan Processing Fee'),
      const SizedBox(height: 6),
      LoanTextField(
        controller: _processingFee,
        hint: 'Enter processing fee',
        icon: Icons.receipt_long_outlined,
        keyboardType: TextInputType.number,
        onChanged: (_) => setState(() {}),
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
                'Interest (simple annual): ${formatMoney(pricing['interest']!)}',
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
        onChanged: (value) => setState(() => _draft.collateralType = value),
      ),
      const SizedBox(height: 14),
      const LoanInfoBanner(
        text: 'Rates and periods come from your branch manager configuration.',
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
        onCapture: () => _captureAndUpload('GUARANTOR_NIN_FRONT'),
      ),
      const SizedBox(height: 10),
      LoanCaptureRow(
        title: 'National ID – Back',
        subtitle: 'Capture the back side of the National ID.',
        icon: Icons.credit_card,
        captured: _draft.guarantorNinBackCaptured,
        previewBytes: _draft.mediaPreviews['GUARANTOR_NIN_BACK'],
        onCapture: () => _captureAndUpload('GUARANTOR_NIN_BACK'),
      ),
      const SizedBox(height: 14),
      const LoanInfoBanner(
        text: 'Ensure all guarantor information is accurate and documents are clear.',
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
            decoration: const BoxDecoration(color: sage, shape: BoxShape.circle),
            child: const Icon(Icons.verified_user_outlined, color: forestEmerald),
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
        onUpload: () => _pickAndUploadDoc('COLLATERAL_DOC'),
      ),
      const SizedBox(height: 14),
      LoanUploadBox(
        label: 'Additional Supporting Document (Optional)',
        uploaded: _draft.supportingDocUploaded,
        fileName: _draft.supportingDocName,
        previewBytes: _draft.mediaPreviews['SUPPORTING_DOC'],
        onUpload: () => _pickAndUploadDoc('SUPPORTING_DOC'),
      ),
      const SizedBox(height: 14),
      LoanUploadBox(
        label: 'Any Other Document (Optional)',
        uploaded: _draft.otherDocUploaded,
        fileName: _draft.otherDocName,
        previewBytes: _draft.mediaPreviews['OTHER_DOC'],
        onUpload: () => _pickAndUploadDoc('OTHER_DOC'),
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
            decoration: const BoxDecoration(color: sage, shape: BoxShape.circle),
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
        onSign: () => _captureSignature(
          signerRole: 'APPLICANT',
          title: 'Loan Applicant Signature',
          signerName: _draft.fullName.isEmpty ? 'Applicant' : _draft.fullName,
        ),
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
        onSign: () => _captureSignature(
          signerRole: 'GUARANTOR',
          title: 'Guarantor Signature',
          signerName: _guarantorName.text.trim().isEmpty
              ? 'Guarantor'
              : _guarantorName.text.trim(),
        ),
      ),
      const SizedBox(height: 10),
      LoanSignaturePad(
        title: 'Loan Officer Signature',
        name: '$officer (You)',
        icon: Icons.badge_outlined,
        signed: _draft.officerSigned,
        locked: _draft.officerSigned,
        version: _draft.officerSignatureVersion,
        onSign: () => _captureSignature(
          signerRole: 'OFFICER',
          title: 'Loan Officer Signature',
          signerName: officer,
        ),
      ),
      const SizedBox(height: 12),
      Material(
        color: sage,
        child: CheckboxListTile(
          value: _draft.termsConfirmed,
          onChanged: (value) =>
              setState(() => _draft.termsConfirmed = value ?? false),
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
    final principal = int.tryParse(
          _draft.principalAmount.replaceAll(',', ''),
        ) ??
        0;
    final fee = int.tryParse(
          _draft.processingFee.replaceAll(',', ''),
        ) ??
        0;

    return [
      Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: const BoxDecoration(color: sage, shape: BoxShape.circle),
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
        onEdit: () => _jumpToStep(1),
        rows: [
          ('Full Name', _draft.fullName),
          ('Phone Number', _draft.phone),
          (
            'Location',
            '${_draft.district ?? '—'} – ${_draft.subCounty ?? '—'}'
          ),
          (
            'Address',
            'LC1: ${_draft.village ?? '—'}, Parish: ${_draft.parish ?? '—'}'
          ),
        ],
      ),
      const SizedBox(height: 10),
      _ReviewCard(
        icon: Icons.work_outline,
        title: 'Loan Details',
        onEdit: () => _jumpToStep(3),
        rows: [
          ('Loan Amount', formatMoney(principal)),
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
        onEdit: () => _jumpToStep(4),
        rows: [
          ('Full Name', _guarantorName.text.trim()),
          ('Phone Number', _guarantorPhone.text.trim()),
          (
            'National ID',
            (_draft.guarantorNinFrontCaptured && _draft.guarantorNinBackCaptured)
                ? 'Front & Back uploaded'
                : 'Incomplete'
          ),
          (
            'Photos',
            (_draft.passportCaptured &&
                    _draft.ninFrontCaptured &&
                    _draft.ninBackCaptured)
                ? 'Identity photos uploaded'
                : 'Incomplete'
          ),
        ],
      ),
      const SizedBox(height: 10),
      _ReviewCard(
        icon: Icons.description_outlined,
        title: 'Security Documents',
        onEdit: () => _jumpToStep(5),
        rows: [
          (
            'Collateral Document',
            _draft.collateralDocUploaded
                ? _draft.collateralDocName
                : 'Not uploaded'
          ),
          (
            'Supporting Document',
            _draft.supportingDocUploaded
                ? _draft.supportingDocName
                : 'Not uploaded'
          ),
          (
            'Other Document',
            _draft.otherDocUploaded ? _draft.otherDocName : 'Not uploaded'
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
