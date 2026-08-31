/// Local customer model for offline storage
class CustomerLocal {
  final String id;
  final String tenantId;
  final String branchId;
  final String? nin;
  final String firstName;
  final String lastName;
  final String phone;
  final String? email;
  final String? village;
  final String? subCounty;
  final String? district;
  final String? parish;
  final DateTime? dateOfBirth;
  final String? gender;
  final DateTime createdAt;
  final DateTime updatedAt;

  CustomerLocal({
    required this.id,
    required this.tenantId,
    required this.branchId,
    this.nin,
    required this.firstName,
    required this.lastName,
    required this.phone,
    this.email,
    this.village,
    this.subCounty,
    this.district,
    this.parish,
    this.dateOfBirth,
    this.gender,
    required this.createdAt,
    required this.updatedAt,
  });

  String get fullName {
    return [firstName.trim(), lastName.trim()]
        .where((part) => part.isNotEmpty)
        .join(' ');
  }

  factory CustomerLocal.fromMap(Map<String, dynamic> map) {
    return CustomerLocal(
      id: map['id'] as String,
      tenantId: map['tenant_id'] as String,
      branchId: map['branch_id'] as String,
      nin: map['nin'] as String?,
      firstName: map['first_name'] as String,
      lastName: map['last_name'] as String,
      phone: map['phone'] as String,
      email: map['email'] as String?,
      village: map['village'] as String?,
      subCounty: map['sub_county'] as String?,
      district: map['district'] as String?,
      parish: map['parish'] as String?,
      dateOfBirth: map['date_of_birth'] != null
          ? DateTime.fromMillisecondsSinceEpoch(map['date_of_birth'] as int)
          : null,
      gender: map['gender'] as String?,
      createdAt: DateTime.fromMillisecondsSinceEpoch(map['created_at'] as int),
      updatedAt: DateTime.fromMillisecondsSinceEpoch(map['updated_at'] as int),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'tenant_id': tenantId,
      'branch_id': branchId,
      'nin': nin,
      'first_name': firstName,
      'last_name': lastName,
      'phone': phone,
      'email': email,
      'village': village,
      'sub_county': subCounty,
      'district': district,
      'parish': parish,
      'date_of_birth': dateOfBirth?.millisecondsSinceEpoch,
      'gender': gender,
      'created_at': createdAt.millisecondsSinceEpoch,
      'updated_at': updatedAt.millisecondsSinceEpoch,
    };
  }

  factory CustomerLocal.fromJson(Map<String, dynamic> json) {
    final fullName = _text(json['fullName']);
    final names = _splitName(fullName);

    return CustomerLocal(
      id: json['id'] as String,
      tenantId: json['tenantId'] as String,
      branchId: json['branchId'] as String,
      nin: _text(json['nin']) ?? _text(json['nationalId']),
      firstName: _text(json['firstName']) ?? names.$1,
      lastName: _text(json['lastName']) ?? names.$2,
      phone: _text(json['phone']) ?? '',
      email: _text(json['email']),
      village: _text(json['village']),
      subCounty: _text(json['subCounty']),
      district: _text(json['district']),
      parish: _text(json['parish']),
      dateOfBirth: json['dateOfBirth'] != null
          ? DateTime.tryParse(json['dateOfBirth'].toString())
          : null,
      gender: _text(json['gender']),
      createdAt:
          DateTime.tryParse(json['createdAt']?.toString() ?? '') ??
          DateTime.now(),
      updatedAt:
          DateTime.tryParse(json['updatedAt']?.toString() ?? '') ??
          DateTime.now(),
    );
  }
}

(String, String) _splitName(String? fullName) {
  final parts = (fullName ?? '')
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();

  if (parts.isEmpty) return ('Unknown', '');
  if (parts.length == 1) return (parts.first, '');

  return (parts.first, parts.skip(1).join(' '));
}

String? _text(Object? value) {
  if (value == null) return null;

  final text = value.toString().trim();
  return text.isEmpty ? null : text;
}
