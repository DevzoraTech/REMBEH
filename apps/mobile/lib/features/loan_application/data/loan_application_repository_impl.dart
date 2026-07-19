import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

import '../domain/entities/loan_application.dart';
import '../domain/entities/signature_capture.dart';
import '../domain/failures.dart';
import '../domain/repositories/loan_application_repository.dart';
import 'loan_application_api_datasource.dart';

class LoanApplicationRepositoryImpl implements LoanApplicationRepository {
  LoanApplicationRepositoryImpl(this._api);

  final LoanApplicationApiDatasource _api;

  @override
  Future<LoanApplication> createDraft() async {
    try {
      final body = await _api.createDraft();
      return _mapApplication(body['application'] as Map<String, dynamic>);
    } catch (error) {
      throw LoanApplicationFailure(error.toString());
    }
  }

  @override
  Future<LoanApplication> getById(String id) async {
    try {
      final body = await _api.getById(id);
      return _mapApplication(body['application'] as Map<String, dynamic>);
    } catch (error) {
      throw LoanApplicationFailure(error.toString());
    }
  }

  @override
  Future<LoanApplication> updateStep({
    required String id,
    required Map<String, dynamic> payload,
  }) async {
    try {
      final body = await _api.update(id, payload);
      return _mapApplication(body['application'] as Map<String, dynamic>);
    } catch (error) {
      throw LoanApplicationFailure(error.toString());
    }
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
    try {
      final body = await _api.verifyApplicant(id, {
        'surname': surname,
        'givenNames': givenNames,
        'phone': phone,
        'nationalId': nationalId,
        'gender': gender,
        'dateOfBirth': dateOfBirth,
        'country': 'UG',
      });
      return _mapApplication(body['application'] as Map<String, dynamic>);
    } catch (error) {
      throw LoanApplicationFailure(error.toString());
    }
  }

  @override
  Future<LoanApplication> uploadMedia({
    required String id,
    required String mediaType,
    required Uint8List bytes,
    required String mimeType,
    String? fileName,
  }) async {
    try {
      final extension = fileName?.contains('.') == true
          ? fileName!.split('.').last
          : _extensionForMime(mimeType);

      final presign = await _api.presignMedia(id, {
        'mediaType': mediaType,
        'mimeType': mimeType,
        if (fileName != null) 'fileName': fileName,
        if (extension != null) 'extension': extension,
      });

      final uploadUrl = presign['uploadUrl'] as String;
      final storageKey = presign['storageKey'] as String;

      await _api.uploadToPresignedUrl(
        uploadUrl: uploadUrl,
        bytes: bytes,
        mimeType: mimeType,
      );

      final confirmed = await _api.confirmMedia(id, {
        'mediaType': mediaType,
        'storageKey': storageKey,
        'mimeType': mimeType,
        'byteSize': bytes.length,
        if (fileName != null) 'fileName': fileName,
      });

      return _mapApplication(confirmed['application'] as Map<String, dynamic>);
    } catch (error) {
      throw LoanApplicationFailure(error.toString());
    }
  }

  @override
  Future<LoanApplication> uploadSignature({
    required String id,
    required String signerRole,
    required SignatureCaptureResult capture,
    bool createNewVersion = false,
  }) async {
    try {
      final presign = await _api.presignSignature(id, {
        'signerRole': signerRole,
        if (createNewVersion) 'createNewVersion': true,
      });

      final signature = presign['signature'] as Map<String, dynamic>;
      final strokes = presign['strokes'] as Map<String, dynamic>;
      final metadata = presign['metadata'] as Map<String, dynamic>;

      final strokesJson = utf8.encode(jsonEncode(capture.strokesPayload()));
      final metadataJson = utf8.encode(jsonEncode(capture.metadataPayload()));
      final pngBytes = capture.pngBytes;

      await Future.wait([
        _api.uploadToPresignedUrl(
          uploadUrl: signature['uploadUrl'] as String,
          bytes: pngBytes,
          mimeType: signature['mimeType'] as String? ?? 'image/png',
        ),
        _api.uploadToPresignedUrl(
          uploadUrl: strokes['uploadUrl'] as String,
          bytes: Uint8List.fromList(strokesJson),
          mimeType: strokes['mimeType'] as String? ?? 'application/json',
        ),
        _api.uploadToPresignedUrl(
          uploadUrl: metadata['uploadUrl'] as String,
          bytes: Uint8List.fromList(metadataJson),
          mimeType: metadata['mimeType'] as String? ?? 'application/json',
        ),
      ]);

      final confirmed = await _api.confirmSignature(id, {
        'signerRole': signerRole,
        'signatureStorageKey': signature['storageKey'],
        'strokesStorageKey': strokes['storageKey'],
        'metadataStorageKey': metadata['storageKey'],
        'signatureByteSize': pngBytes.length,
        'strokesByteSize': strokesJson.length,
        'metadataByteSize': metadataJson.length,
        'pngContentHash': sha256.convert(pngBytes).toString(),
        'strokesContentHash': sha256.convert(strokesJson).toString(),
        'signerName': capture.metadata['signerName'] as String? ?? '',
        'signedAt':
            capture.metadata['timestamp'] as String? ??
            DateTime.now().toUtc().toIso8601String(),
        'metadata': capture.metadataPayload(),
        if (createNewVersion) 'createNewVersion': true,
      });

      return _mapApplication(confirmed['application'] as Map<String, dynamic>);
    } catch (error) {
      throw LoanApplicationFailure(error.toString());
    }
  }

  @override
  Future<LoanApplication> submit(String id) async {
    try {
      final body = await _api.submit(id);
      return _mapApplication(body['application'] as Map<String, dynamic>);
    } catch (error) {
      throw LoanApplicationFailure(error.toString());
    }
  }

  @override
  Future<List<LoanApplicationListItem>> listApplications() async {
    try {
      final body = await _api.list();
      final items = body['applications'] as List<dynamic>? ?? const [];
      return items
          .cast<Map<String, dynamic>>()
          .map(_mapListItem)
          .toList(growable: false);
    } catch (error) {
      throw LoanApplicationFailure(error.toString());
    }
  }

  LoanApplication _mapApplication(Map<String, dynamic> json) {
    final media = (json['media'] as List<dynamic>? ?? const [])
        .cast<Map<String, dynamic>>();
    final signatures = (json['signatures'] as List<dynamic>? ?? const [])
        .cast<Map<String, dynamic>>();
    final guarantor = json['guarantor'] as Map<String, dynamic>?;

    return LoanApplication(
      id: json['id'] as String,
      status: json['status'] as String? ?? 'DRAFT',
      synced: json['synced'] as bool? ?? false,
      mediaTypes: media.map((item) => item['type'] as String).toSet(),
      signatures: signatures
          .map(
            (item) => LoanApplicationSignatureSummary(
              signerRole: item['signerRole'] as String? ?? '',
              version: (item['version'] as num?)?.toInt() ?? 1,
              locked: item['locked'] as bool? ?? false,
              signerName: item['signerName'] as String? ?? '',
            ),
          )
          .toList(growable: false),
      surname: json['surname'] as String?,
      givenNames: json['givenNames'] as String?,
      phone: json['phone'] as String?,
      nationalId: json['nationalId'] as String?,
      gender: json['gender'] as String?,
      dateOfBirth: json['dateOfBirth'] != null
          ? DateTime.tryParse(json['dateOfBirth'] as String)
          : null,
      district: json['district'] as String?,
      subCounty: json['subCounty'] as String?,
      parish: json['parish'] as String?,
      village: json['village'] as String?,
      principalAmount: (json['principalAmount'] as num?)?.toDouble(),
      interestRatePercent: (json['interestRatePercent'] as num?)?.toDouble(),
      durationDays: json['durationDays'] as int?,
      processingFee: (json['processingFee'] as num?)?.toDouble(),
      collateralType: json['collateralType'] as String?,
      verificationCode: json['verificationCode'] as String?,
      verifiedAt: json['verifiedAt'] != null
          ? DateTime.tryParse(json['verifiedAt'] as String)
          : null,
      termsConfirmedAt: json['termsConfirmedAt'] != null
          ? DateTime.tryParse(json['termsConfirmedAt'] as String)
          : null,
      guarantorName: guarantor?['fullName'] as String?,
      guarantorPhone: guarantor?['phone'] as String?,
    );
  }

  LoanApplicationListItem _mapListItem(Map<String, dynamic> json) {
    return LoanApplicationListItem(
      id: json['id'] as String,
      clientName: json['clientName'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      amountRequested: ((json['amountRequested'] as num?) ?? 0).round(),
      interestRatePercent:
          ((json['interestRatePercent'] as num?) ?? 0).round(),
      registeredAt: DateTime.tryParse(json['registeredAt'] as String? ?? '') ??
          DateTime.now(),
      synced: json['synced'] as bool? ?? false,
      status: json['status'] as String? ?? 'DRAFT',
    );
  }

  String? _extensionForMime(String mimeType) {
    switch (mimeType.toLowerCase()) {
      case 'image/jpeg':
      case 'image/jpg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'application/pdf':
        return 'pdf';
      default:
        return null;
    }
  }
}
