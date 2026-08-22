import 'dart:typed_data';

import 'package:uuid/uuid.dart';

import '../../../core/database/models/loan_application_local.dart';
import '../../../core/database/repositories/loan_applications_repository.dart'
    as local_db;
import '../../../core/media/offline_media_service.dart';
import '../../../services/network_status_store.dart';
import '../../../services/session_store.dart';
import '../domain/entities/loan_application.dart';
import '../domain/entities/signature_capture.dart';
import '../domain/failures.dart';
import '../domain/repositories/loan_application_repository.dart';

class OfflineCapableLoanApplicationRepository
    implements LoanApplicationRepository {
  OfflineCapableLoanApplicationRepository({
    required LoanApplicationRepository remote,
    required SessionStore sessionStore,
    local_db.LoanApplicationsRepository? localApplications,
    OfflineMediaService? offlineMedia,
  }) : _remote = remote,
       _sessionStore = sessionStore,
       _localApplications =
           localApplications ?? local_db.LoanApplicationsRepository(),
       _offlineMedia = offlineMedia ?? OfflineMediaService();

  final LoanApplicationRepository _remote;
  final SessionStore _sessionStore;
  final local_db.LoanApplicationsRepository _localApplications;
  final OfflineMediaService _offlineMedia;
  final Map<String, _OfflineLoanDraft> _drafts = {};

  static const _uuid = Uuid();

  @override
  Future<LoanApplication> createDraft() async {
    if (NetworkStatusStore.instance.isOffline) {
      return _createLocalDraft();
    }

    try {
      return await _remote.createDraft();
    } catch (error) {
      if (_looksLikeNetworkError(error)) {
        NetworkStatusStore.instance.markOffline();
        return _createLocalDraft();
      }

      rethrow;
    }
  }

  @override
  Future<LoanApplication> getById(String id) async {
    final draft = _drafts[id];
    if (draft != null) {
      return _toApplication(draft);
    }

    return _remote.getById(id);
  }

  @override
  Future<LoanApplication> updateStep({
    required String id,
    required Map<String, dynamic> payload,
  }) async {
    final draft = _drafts[id];
    if (draft != null) {
      _mergePayload(draft, payload);
      return _toApplication(draft);
    }

    return _remote.updateStep(id: id, payload: payload);
  }

  @override
  Future<LoanApplication> verifyApplicant({
    required String id,
    required String surname,
    required String givenNames,
    required String phone,
    required String nationalId,
    required String gender,
    required String dateOfBirth,
  }) async {
    final draft = _drafts[id];
    if (draft != null) {
      draft
        ..status = 'VERIFIED'
        ..verificationCode = 'OFFLINE-${id.substring(id.length - 6)}'
        ..verifiedAt = DateTime.now();
      draft.data.addAll({
        'surname': surname,
        'givenNames': givenNames,
        'phone': phone,
        'nationalId': nationalId,
        'gender': gender,
        'dateOfBirth': dateOfBirth,
      });
      return _toApplication(draft);
    }

    return _remote.verifyApplicant(
      id: id,
      surname: surname,
      givenNames: givenNames,
      phone: phone,
      nationalId: nationalId,
      gender: gender,
      dateOfBirth: dateOfBirth,
    );
  }

  @override
  Future<LoanApplication> uploadMedia({
    required String id,
    required String mediaType,
    required Uint8List bytes,
    required String mimeType,
    String? fileName,
  }) async {
    final draft = _drafts[id];
    if (draft != null) {
      await _offlineMedia.queueBytes(
        bytes: bytes,
        entityType: 'loan_application',
        entityId: id,
        filename:
            fileName ?? '${mediaType.toLowerCase()}.${_extensionFor(mimeType)}',
        mimeType: mimeType,
        caption: mediaType,
      );

      draft.mediaTypes.add(mediaType);
      return _toApplication(draft);
    }

    return _remote.uploadMedia(
      id: id,
      mediaType: mediaType,
      bytes: bytes,
      mimeType: mimeType,
      fileName: fileName,
    );
  }

  @override
  Future<LoanApplication> uploadSignature({
    required String id,
    required String signerRole,
    required SignatureCaptureResult capture,
    bool createNewVersion = false,
  }) async {
    final draft = _drafts[id];
    if (draft != null) {
      final mediaType = 'SIGNATURE_$signerRole';
      await _offlineMedia.queueBytes(
        bytes: capture.pngBytes,
        entityType: 'loan_application',
        entityId: id,
        filename: '${signerRole.toLowerCase()}_signature.png',
        mimeType: 'image/png',
        caption: mediaType,
      );

      draft.mediaTypes.add(mediaType);
      draft.signatures.removeWhere((item) => item.signerRole == signerRole);
      draft.signatures.add(
        LoanApplicationSignatureSummary(
          signerRole: signerRole,
          version: createNewVersion ? 2 : 1,
          locked: true,
          signerName: capture.metadata['signerName'] as String? ?? '',
        ),
      );
      return _toApplication(draft);
    }

    return _remote.uploadSignature(
      id: id,
      signerRole: signerRole,
      capture: capture,
      createNewVersion: createNewVersion,
    );
  }

  @override
  Future<LoanApplication> submit(String id) async {
    final draft = _drafts[id];
    if (draft == null) {
      return _remote.submit(id);
    }

    await _persistLocalSubmission(draft);
    draft.status = 'SUBMITTED';
    return _toApplication(draft);
  }

  @override
  Future<List<LoanApplicationListItem>> listApplications() {
    return _remote.listApplications();
  }

  LoanApplication _createLocalDraft() {
    final draft = _OfflineLoanDraft(
      id: 'local-loan-${_uuid.v4()}',
      createdAt: DateTime.now(),
    );
    _drafts[draft.id] = draft;
    return _toApplication(draft);
  }

  Future<void> _persistLocalSubmission(_OfflineLoanDraft draft) async {
    final session = await _sessionStore.read();
    final tenantId = session?.tenantId?.trim();
    final branchId = session?.branchId?.trim();
    final agentId = session?.publicId?.trim().isNotEmpty == true
        ? session!.publicId!.trim()
        : session?.userEmail.trim();

    if (tenantId == null || tenantId.isEmpty) {
      throw LoanApplicationFailure('Tenant information is missing.');
    }
    if (branchId == null || branchId.isEmpty) {
      throw LoanApplicationFailure('Branch information is missing.');
    }
    if (agentId == null || agentId.isEmpty) {
      throw LoanApplicationFailure('Agent information is missing.');
    }

    final principal = _double(draft.data['principalAmount']);
    final productId = _string(draft.data['loanProductTemplateId']);
    final phone = _string(draft.data['phone']);
    final givenNames = _string(draft.data['givenNames']);
    final surname = _string(draft.data['surname']);

    if (givenNames == null ||
        surname == null ||
        phone == null ||
        principal == null ||
        principal <= 0 ||
        productId == null) {
      throw LoanApplicationFailure(
        'Complete applicant and loan details before submitting offline.',
      );
    }

    final guarantor = draft.data['guarantor'];
    final guarantorMap = guarantor is Map ? guarantor : const {};

    await _localApplications.insert(
      LoanApplicationLocal(
        localId: draft.id,
        tenantId: tenantId,
        branchId: branchId,
        agentId: agentId,
        status: 'DRAFT',
        applicantNin: _string(draft.data['nationalId']),
        applicantFirstName: givenNames,
        applicantLastName: surname,
        applicantPhone: phone,
        applicantVillage: _string(draft.data['village']),
        requestedAmount: principal,
        loanProductId: productId,
        guarantorName: _string(guarantorMap['fullName']),
        guarantorPhone: _string(guarantorMap['phone']),
        businessDescription: _string(draft.data['collateralType']),
        createdAt: draft.createdAt,
      ),
    );
    await _localApplications.submit(draft.id);
  }

  void _mergePayload(_OfflineLoanDraft draft, Map<String, dynamic> payload) {
    draft.data.addAll(payload);

    final termsConfirmed = payload['termsConfirmed'];
    if (termsConfirmed == true) {
      draft.termsConfirmedAt = DateTime.now();
    }
  }

  LoanApplication _toApplication(_OfflineLoanDraft draft) {
    return LoanApplication(
      id: draft.id,
      status: draft.status,
      synced: false,
      mediaTypes: Set.unmodifiable(draft.mediaTypes),
      signatures: List.unmodifiable(draft.signatures),
      surname: _string(draft.data['surname']),
      givenNames: _string(draft.data['givenNames']),
      phone: _string(draft.data['phone']),
      nationalId: _string(draft.data['nationalId']),
      gender: _string(draft.data['gender']),
      dateOfBirth: _date(draft.data['dateOfBirth']),
      district: _string(draft.data['district']),
      subCounty: _string(draft.data['subCounty']),
      parish: _string(draft.data['parish']),
      village: _string(draft.data['village']),
      principalAmount: _double(draft.data['principalAmount']),
      processingFee: _double(draft.data['processingFee']),
      collateralType: _string(draft.data['collateralType']),
      verificationCode: draft.verificationCode,
      verifiedAt: draft.verifiedAt,
      termsConfirmedAt: draft.termsConfirmedAt,
      guarantorName: _string((draft.data['guarantor'] as Map?)?['fullName']),
      guarantorPhone: _string((draft.data['guarantor'] as Map?)?['phone']),
    );
  }

  bool _looksLikeNetworkError(Object error) {
    final message = error.toString().toLowerCase();
    return message.contains('could not connect') ||
        message.contains('socket') ||
        message.contains('network') ||
        message.contains('connection') ||
        message.contains('timed out') ||
        message.contains('host lookup');
  }
}

class _OfflineLoanDraft {
  _OfflineLoanDraft({required this.id, required this.createdAt});

  final String id;
  final DateTime createdAt;
  final Map<String, dynamic> data = {};
  final Set<String> mediaTypes = {};
  final List<LoanApplicationSignatureSummary> signatures = [];

  String status = 'DRAFT';
  String? verificationCode;
  DateTime? verifiedAt;
  DateTime? termsConfirmedAt;
}

String? _string(Object? value) {
  final text = value?.toString().trim();
  if (text == null || text.isEmpty) {
    return null;
  }
  return text;
}

double? _double(Object? value) {
  if (value is num) {
    return value.toDouble();
  }
  return double.tryParse(value?.toString().replaceAll(',', '').trim() ?? '');
}

DateTime? _date(Object? value) {
  if (value is DateTime) {
    return value;
  }
  return DateTime.tryParse(value?.toString() ?? '');
}

String _extensionFor(String mimeType) {
  return switch (mimeType.toLowerCase()) {
    'image/png' => 'png',
    'image/webp' => 'webp',
    'application/pdf' => 'pdf',
    _ => 'jpg',
  };
}
