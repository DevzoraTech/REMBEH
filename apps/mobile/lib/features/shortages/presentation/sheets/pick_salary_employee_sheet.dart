import 'package:flutter/material.dart';

import '../../../../theme.dart';
import '../../../salaries/domain/models/salary_models.dart';
import '../../../salaries/presentation/utils/salary_formatters.dart';
import '../utils/shortage_formatters.dart';

class PickSalaryEmployeeSheet extends StatefulWidget {
  const PickSalaryEmployeeSheet({
    super.key,
    required this.employees,
    this.title = 'Select employee',
    this.subtitle = 'Choose who this shortage belongs to.',
  });

  final List<SalaryEmployee> employees;
  final String title;
  final String subtitle;

  @override
  State<PickSalaryEmployeeSheet> createState() =>
      _PickSalaryEmployeeSheetState();
}

class _PickSalaryEmployeeSheetState extends State<PickSalaryEmployeeSheet> {
  final TextEditingController _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<SalaryEmployee> get _visibleEmployees {
    final needle = _query.trim().toLowerCase();
    final rows = widget.employees.where((employee) {
      if (needle.isEmpty) {
        return true;
      }

      return employee.fullName.toLowerCase().contains(needle) ||
          (employee.roleName ?? '').toLowerCase().contains(needle) ||
          (employee.phone ?? '').toLowerCase().contains(needle);
    }).toList();

    rows.sort(
      (left, right) =>
          left.fullName.toLowerCase().compareTo(right.fullName.toLowerCase()),
    );
    return rows;
  }

  @override
  Widget build(BuildContext context) {
    final employees = _visibleEmployees;
    final maxHeight = MediaQuery.sizeOf(context).height * 0.72;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Container(
        height: maxHeight,
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 18),
        child: SafeArea(
          top: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 38,
                  height: 4,
                  decoration: BoxDecoration(
                    color: line,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                widget.title,
                style: const TextStyle(
                  color: midnightNavy,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                widget.subtitle,
                style: const TextStyle(
                  color: slateText,
                  fontSize: 12,
                  height: 1.35,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _searchController,
                onChanged: (value) {
                  setState(() {
                    _query = value;
                  });
                },
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search_rounded),
                  hintText: 'Search employee',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 10),
              Expanded(
                child: employees.isEmpty
                    ? const Center(
                        child: Text(
                          'No matching employees.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: slateText,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      )
                    : ListView.separated(
                        itemCount: employees.length,
                        separatorBuilder: (_, _) => const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final employee = employees[index];
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(
                              employee.fullName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: midnightNavy,
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            subtitle: Text(
                              [
                                salaryRoleLabel(employee.roleName),
                                if (employee.hasShortage)
                                  'owes ${shortageMoney(employee.shortageOutstanding)}',
                              ].join(' · '),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: employee.hasShortage
                                    ? const Color(0xFFC05A00)
                                    : slateText,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            trailing: const Icon(
                              Icons.chevron_right_rounded,
                              color: slateText,
                            ),
                            onTap: () => Navigator.of(context).pop(employee),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
