import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../services/session_store.dart';
import '../../theme.dart';
import '../../utils/money.dart';
import '../../widgets/client_details_sheet.dart';
import '../register_customer_screen.dart';

class CustomersTab extends StatefulWidget {
  const CustomersTab({
    super.key,
    required this.session,
    required this.autofocus,
    required this.focusToken,
  });

  final RembehSession session;
  final bool autofocus;
  final int focusToken;

  @override
  State<CustomersTab> createState() => _CustomersTabState();
}

class _CustomersTabState extends State<CustomersTab> {
  final _api = ApiClient(SessionStore());
  final _search = TextEditingController();
  final _focusNode = FocusNode();
  var _customers = <_CustomerRow>[];
  var _loading = true;
  String? _error;
  int _lastFocusToken = -1;

  @override
  void initState() {
    super.initState();
    _load();
    if (widget.autofocus) {
      _lastFocusToken = widget.focusToken;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _focusNode.requestFocus();
      });
    }
  }

  @override
  void didUpdateWidget(covariant CustomersTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.autofocus && widget.focusToken != _lastFocusToken) {
      _lastFocusToken = widget.focusToken;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _focusNode.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    _search.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await _api.listCustomers(widget.session);
      if (!mounted) return;
      setState(() {
        _customers = rows.map(_CustomerRow.fromApi).toList()
          ..sort((a, b) => a.fullName.compareTo(b.fullName));
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
        _loading = false;
      });
    }
  }

  Future<void> _createCustomer() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => RegisterCustomerScreen(session: widget.session),
      ),
    );
    if (created == true && mounted) {
      await _load();
    }
  }

  Future<void> _openCustomer(_CustomerRow customer) async {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) =>
          const Center(child: CircularProgressIndicator(color: forestEmerald)),
    );
    try {
      final payload = await _api.getCustomer(
        session: widget.session,
        customerId: customer.id,
      );
      if (!mounted) return;
      Navigator.of(context).pop();
      final detail = _CustomerDetail.fromApi(
        payload['customer'] as Map<String, dynamic>? ?? const {},
      );
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
        builder: (_) => _CustomerDetailSheet(detail: detail),
      );
    } catch (error) {
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  List<_CustomerRow> get _filtered {
    final query = _search.text.trim().toLowerCase();
    if (query.isEmpty) return _customers;
    return _customers.where((customer) {
      return customer.fullName.toLowerCase().contains(query) ||
          customer.phone.toLowerCase().contains(query) ||
          (customer.nationalId ?? '').toLowerCase().contains(query) ||
          (customer.city ?? '').toLowerCase().contains(query);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    final verified = _customers.where((row) => row.verified).length;
    final withLoans = _customers.where((row) => row.loanCount > 0).length;

    return SafeArea(
      child: RefreshIndicator(
        color: forestEmerald,
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Customers',
                    style: TextStyle(
                      color: midnightNavy,
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.4,
                    ),
                  ),
                ),
                FilledButton.icon(
                  onPressed: _createCustomer,
                  icon: const Icon(Icons.person_add_alt_1, size: 18),
                  label: const Text('New'),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(0, 40),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _search,
              focusNode: _focusNode,
              onChanged: (_) => setState(() {}),
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Search by name, phone, NIN or city',
                prefixIcon: const Icon(Icons.search, color: forestEmerald),
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
                        onPressed: () {
                          _search.clear();
                          setState(() {});
                        },
                        icon: const Icon(Icons.cancel, color: slateText),
                      ),
                filled: true,
                fillColor: Colors.white,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _CustomerStat(
                    label: 'Total',
                    value: '${_customers.length}',
                    icon: Icons.groups_outlined,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _CustomerStat(
                    label: 'Verified',
                    value: '$verified',
                    icon: Icons.verified_user_outlined,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _CustomerStat(
                    label: 'With loans',
                    value: '$withLoans',
                    icon: Icons.account_balance_wallet_outlined,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (_loading && _customers.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 80),
                child: Center(
                  child: CircularProgressIndicator(color: forestEmerald),
                ),
              )
            else if (_error != null && _customers.isEmpty)
              _ErrorState(message: _error!, onRetry: _load)
            else if (filtered.isEmpty)
              const _EmptyState(
                title: 'No customers found',
                message: 'Try another search or add a new customer.',
              )
            else
              _CustomerList(customers: filtered, onTap: _openCustomer),
          ],
        ),
      ),
    );
  }
}

class _CustomerRow {
  const _CustomerRow({
    required this.id,
    required this.fullName,
    required this.phone,
    required this.loanCount,
    required this.verified,
    this.nationalId,
    this.city,
    this.businessName,
    this.collateralType,
  });

  final String id;
  final String fullName;
  final String phone;
  final String? nationalId;
  final String? city;
  final String? businessName;
  final String? collateralType;
  final int loanCount;
  final bool verified;

  String get initials => _initials(fullName);

  factory _CustomerRow.fromApi(Map<String, dynamic> json) {
    return _CustomerRow(
      id: json['id'] as String? ?? '',
      fullName: json['fullName'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      nationalId: json['nationalId'] as String?,
      city: json['city'] as String?,
      businessName: json['businessName'] as String?,
      collateralType: json['collateralType'] as String?,
      loanCount: ((json['loanCount'] as num?) ?? 0).round(),
      verified: json['verifiedAt'] != null,
    );
  }
}

class _CustomerDetail {
  const _CustomerDetail({
    required this.row,
    required this.loans,
    required this.documents,
    required this.payments,
    this.email,
  });

  final _CustomerRow row;
  final String? email;
  final List<_CustomerLoan> loans;
  final List<_CustomerDocument> documents;
  final List<_CustomerPayment> payments;

  factory _CustomerDetail.fromApi(Map<String, dynamic> json) {
    return _CustomerDetail(
      row: _CustomerRow.fromApi(json),
      email: json['email'] as String?,
      loans: ((json['loans'] as List?) ?? const [])
          .whereType<Map>()
          .map((row) => _CustomerLoan.fromApi(Map<String, dynamic>.from(row)))
          .toList(),
      documents: ((json['documents'] as List?) ?? const [])
          .whereType<Map>()
          .map(
            (row) => _CustomerDocument.fromApi(Map<String, dynamic>.from(row)),
          )
          .toList(),
      payments: ((json['recentPayments'] as List?) ?? const [])
          .whereType<Map>()
          .map(
            (row) => _CustomerPayment.fromApi(Map<String, dynamic>.from(row)),
          )
          .toList(),
    );
  }
}

class _CustomerLoan {
  const _CustomerLoan({
    required this.id,
    required this.status,
    required this.principal,
    required this.balance,
    required this.paidAmount,
    this.loanTypeName,
  });

  final String id;
  final String status;
  final int principal;
  final int balance;
  final int paidAmount;
  final String? loanTypeName;

  factory _CustomerLoan.fromApi(Map<String, dynamic> json) {
    return _CustomerLoan(
      id: json['id'] as String? ?? '',
      status: json['status'] as String? ?? '',
      principal: ((json['principal'] as num?) ?? 0).round(),
      balance: ((json['balance'] as num?) ?? 0).round(),
      paidAmount: ((json['paidAmount'] as num?) ?? 0).round(),
      loanTypeName: json['loanTypeName'] as String?,
    );
  }
}

class _CustomerDocument {
  const _CustomerDocument({
    required this.type,
    required this.mimeType,
    required this.byteSize,
    this.downloadUrl,
  });

  final String type;
  final String mimeType;
  final int byteSize;
  final String? downloadUrl;

  bool get isImage => mimeType.toLowerCase().startsWith('image/');

  factory _CustomerDocument.fromApi(Map<String, dynamic> json) {
    return _CustomerDocument(
      type: _titleCase(
        (json['type'] as String? ?? 'Document').replaceAll('_', ' '),
      ),
      mimeType: json['mimeType'] as String? ?? '',
      byteSize: ((json['byteSize'] as num?) ?? 0).round(),
      downloadUrl: json['downloadUrl'] as String?,
    );
  }
}

class _CustomerPayment {
  const _CustomerPayment({
    required this.amount,
    required this.method,
    required this.paidAt,
  });

  final int amount;
  final String method;
  final DateTime paidAt;

  factory _CustomerPayment.fromApi(Map<String, dynamic> json) {
    return _CustomerPayment(
      amount: ((json['amount'] as num?) ?? 0).round(),
      method: (json['method'] as String? ?? 'CASH').replaceAll('_', ' '),
      paidAt:
          DateTime.tryParse(json['paidAt'] as String? ?? '') ?? DateTime.now(),
    );
  }
}

class _CustomerStat extends StatelessWidget {
  const _CustomerStat({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: forestEmerald, size: 18),
          const SizedBox(height: 8),
          Text(
            value,
            style: const TextStyle(
              color: midnightNavy,
              fontWeight: FontWeight.w900,
              fontSize: 17,
            ),
          ),
          Text(label, style: const TextStyle(color: slateText, fontSize: 11)),
        ],
      ),
    );
  }
}

class _CustomerList extends StatelessWidget {
  const _CustomerList({required this.customers, required this.onTap});

  final List<_CustomerRow> customers;
  final ValueChanged<_CustomerRow> onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var i = 0; i < customers.length; i++) ...[
            Material(
              color: Colors.white,
              child: InkWell(
                onTap: () => onTap(customers[i]),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      _InitialsAvatar(initials: customers[i].initials),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              customers[i].fullName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: midnightNavy,
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              [
                                customers[i].phone,
                                customers[i].city,
                              ].whereType<String>().join(' · '),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: slateText,
                                fontSize: 12,
                              ),
                            ),
                            if ((customers[i].collateralType ?? '').isNotEmpty)
                              Text(
                                customers[i].collateralType!,
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
                      const SizedBox(width: 8),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            '${customers[i].loanCount} loan${customers[i].loanCount == 1 ? '' : 's'}',
                            style: const TextStyle(
                              color: midnightNavy,
                              fontWeight: FontWeight.w800,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            customers[i].verified ? 'Verified' : 'Unverified',
                            style: TextStyle(
                              color: customers[i].verified
                                  ? forestEmerald
                                  : slateText,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(width: 4),
                      const Icon(Icons.chevron_right, color: slateText),
                    ],
                  ),
                ),
              ),
            ),
            if (i < customers.length - 1) const Divider(height: 1, color: line),
          ],
        ],
      ),
    );
  }
}

class _CustomerDetailSheet extends StatelessWidget {
  const _CustomerDetailSheet({required this.detail});

  final _CustomerDetail detail;

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.82,
      minChildSize: 0.5,
      maxChildSize: 0.94,
      builder: (context, controller) {
        return ListView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
          children: [
            Center(
              child: Container(
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: line,
                  borderRadius: rembehBorderRadius(20),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                _InitialsAvatar(initials: detail.row.initials, size: 52),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        detail.row.fullName,
                        style: const TextStyle(
                          color: midnightNavy,
                          fontWeight: FontWeight.w900,
                          fontSize: 19,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        detail.row.phone,
                        style: const TextStyle(color: slateText, fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _InfoPanel(
              title: 'Profile',
              rows: [
                _InfoLine('National ID', detail.row.nationalId ?? '-'),
                _InfoLine('City', detail.row.city ?? '-'),
                _InfoLine('Email', detail.email ?? '-'),
                _InfoLine('Collateral', detail.row.collateralType ?? '-'),
                _InfoLine('Business', detail.row.businessName ?? '-'),
              ],
            ),
            const SizedBox(height: 12),
            _SectionHeader(title: 'Loans', count: detail.loans.length),
            if (detail.loans.isEmpty)
              const _EmptyBox(message: 'No loans yet.')
            else
              ...detail.loans.map((loan) => _LoanTile(loan: loan)),
            const SizedBox(height: 12),
            _SectionHeader(title: 'Documents', count: detail.documents.length),
            if (detail.documents.isEmpty)
              const _EmptyBox(message: 'No documents uploaded.')
            else
              ...detail.documents.map(
                (document) => _DocumentTile(document: document),
              ),
            const SizedBox(height: 12),
            _SectionHeader(
              title: 'Recent payments',
              count: detail.payments.length,
            ),
            if (detail.payments.isEmpty)
              const _EmptyBox(message: 'No recent payments.')
            else
              ...detail.payments.map(
                (payment) => _PaymentTile(payment: payment),
              ),
          ],
        );
      },
    );
  }
}

class _LoanTile extends StatelessWidget {
  const _LoanTile({required this.loan});

  final _CustomerLoan loan;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: Colors.white,
        child: InkWell(
          onTap: loan.id.isEmpty
              ? null
              : () => showClientDetailsSheet(context, id: loan.id),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              border: Border.all(color: line),
              borderRadius: rembehBorderRadius(rembehRadiusMd),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.account_balance_wallet_outlined,
                  color: forestEmerald,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        loan.loanTypeName ?? 'Loan',
                        style: const TextStyle(
                          color: midnightNavy,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        loan.status.toLowerCase().replaceAll('_', ' '),
                        style: const TextStyle(color: slateText, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      formatMoney(loan.balance),
                      style: const TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const Text(
                      'Balance',
                      style: TextStyle(color: slateText, fontSize: 11),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DocumentTile extends StatelessWidget {
  const _DocumentTile({required this.document});

  final _CustomerDocument document;

  @override
  Widget build(BuildContext context) {
    final previewUrl = document.downloadUrl ?? '';
    final canPreview = document.isImage && previewUrl.isNotEmpty;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (canPreview)
            AspectRatio(
              aspectRatio: 16 / 9,
              child: Image.network(
                previewUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => const _DocumentPreviewFallback(),
              ),
            )
          else
            const _DocumentPreviewFallback(),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Icon(
                  document.isImage
                      ? Icons.image_outlined
                      : Icons.description_outlined,
                  color: forestEmerald,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        document.type,
                        style: const TextStyle(
                          color: midnightNavy,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text(
                        '${document.isImage ? 'Image' : 'Document'} · ${_formatFileSize(document.byteSize)}',
                        style: const TextStyle(color: slateText, fontSize: 12),
                      ),
                    ],
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

class _DocumentPreviewFallback extends StatelessWidget {
  const _DocumentPreviewFallback();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 120,
      color: softIvory,
      alignment: Alignment.center,
      child: const Icon(
        Icons.description_outlined,
        color: forestEmerald,
        size: 30,
      ),
    );
  }
}

class _PaymentTile extends StatelessWidget {
  const _PaymentTile({required this.payment});

  final _CustomerPayment payment;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    return _PlainTile(
      icon: Icons.payments_outlined,
      title: formatMoney(payment.amount),
      subtitle:
          '${_titleCase(payment.method.toLowerCase())} · ${formatActivityTime(payment.paidAt, now)}',
    );
  }
}

class _PlainTile extends StatelessWidget {
  const _PlainTile({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Row(
        children: [
          Icon(icon, color: forestEmerald),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  subtitle,
                  style: const TextStyle(color: slateText, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoPanel extends StatelessWidget {
  const _InfoPanel({required this.title, required this.rows});

  final String title;
  final List<_InfoLine> rows;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: midnightNavy,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          ...rows.map(
            (row) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      row.label,
                      style: const TextStyle(color: slateText, fontSize: 12),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      row.value,
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

class _InfoLine {
  const _InfoLine(this.label, this.value);
  final String label;
  final String value;
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.count});

  final String title;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                color: midnightNavy,
                fontWeight: FontWeight.w900,
                fontSize: 15,
              ),
            ),
          ),
          Text(
            '$count',
            style: const TextStyle(
              color: slateText,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _InitialsAvatar extends StatelessWidget {
  const _InitialsAvatar({required this.initials, this.size = 42});

  final String initials;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: const BoxDecoration(color: sage, shape: BoxShape.circle),
      child: Text(
        initials,
        style: const TextStyle(
          color: forestEmerald,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 80),
      child: Column(
        children: [
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Color(0xFFC62828), fontSize: 13),
          ),
          const SizedBox(height: 12),
          ElevatedButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 24),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: Column(
        children: [
          const Icon(Icons.person_search, color: forestEmerald, size: 28),
          const SizedBox(height: 8),
          Text(
            title,
            style: const TextStyle(
              color: midnightNavy,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: slateText, fontSize: 13),
          ),
        ],
      ),
    );
  }
}

class _EmptyBox extends StatelessWidget {
  const _EmptyBox({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: softIvory,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Text(
        message,
        style: const TextStyle(color: slateText, fontSize: 13),
      ),
    );
  }
}

String _initials(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();
  if (parts.isEmpty) return 'CL';
  if (parts.length == 1) {
    return parts.first
        .substring(0, parts.first.length.clamp(0, 2))
        .toUpperCase();
  }
  return ('${parts.first[0]}${parts.last[0]}').toUpperCase();
}

String _formatFileSize(int bytes) {
  if (bytes <= 0) return 'Uploaded';
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).round()} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}

String _titleCase(String value) {
  return value
      .trim()
      .split(RegExp(r'\s+'))
      .where((word) => word.isNotEmpty)
      .map(
        (word) => '${word[0].toUpperCase()}${word.substring(1).toLowerCase()}',
      )
      .join(' ');
}
