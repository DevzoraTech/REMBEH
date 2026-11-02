BigInt? _parseFixed(String value, int decimals, int maxWhole) {
  final parts = value.trim().split('.');
  if (parts.length > 2 ||
      parts.first.isEmpty ||
      parts.first.length > maxWhole ||
      !RegExp(r'^\d+$').hasMatch(parts.first))
    return null;
  if (parts.length == 2 &&
      (parts[1].isEmpty ||
          parts[1].length > decimals ||
          !RegExp(r'^\d+$').hasMatch(parts[1])))
    return null;
  final fraction = parts.length == 2
      ? parts[1].padRight(decimals, '0')
      : '0' * decimals;
  return BigInt.tryParse('${parts.first}$fraction');
}

/// Calculates a flat-interest repayment in minor units, without floating point.
String? flatLoanRepayable(String principal, String percent) {
  final amount = _parseFixed(principal, 2, 16);
  final rate = _parseFixed(percent, 4, 4);
  if (amount == null ||
      amount <= BigInt.zero ||
      rate == null ||
      rate > BigInt.from(10000000))
    return null;
  final scale = BigInt.from(1000000);
  final total = amount + (amount * rate + scale ~/ BigInt.two) ~/ scale;
  final whole = total ~/ BigInt.from(100);
  final cents = total % BigInt.from(100);
  return cents == BigInt.zero
      ? '$whole'
      : '$whole.${cents.toString().padLeft(2, '0')}';
}

/// Derives principal from the recorded total using the server's rounding rule.
String? flatLoanPrincipal(String repayable, String percent) {
  final total = _parseFixed(repayable, 2, 16);
  final rate = _parseFixed(percent, 4, 4);
  if (total == null ||
      total <= BigInt.zero ||
      rate == null ||
      rate > BigInt.from(10000000))
    return null;
  final scale = BigInt.from(1000000);
  final divisor = scale + rate;
  final cents = (total * scale + divisor ~/ BigInt.two) ~/ divisor;
  if (cents <= BigInt.zero) return null;
  final whole = cents ~/ BigInt.from(100);
  final fraction = cents % BigInt.from(100);
  return fraction == BigInt.zero
      ? '$whole'
      : '$whole.${fraction.toString().padLeft(2, '0')}';
}

/// Matches the server's one-cent tolerance when deriving principal from total.
bool flatLoanMatchesRepayable(
  String principal,
  String percent,
  String repayable,
) {
  final amount = _parseFixed(principal, 2, 16);
  final rate = _parseFixed(percent, 4, 4);
  final total = _parseFixed(repayable, 2, 16);
  if (amount == null ||
      rate == null ||
      total == null ||
      flatLoanRepayable(principal, percent) == null)
    return false;
  final scale = BigInt.from(1000000);
  final divisor = scale + rate;
  final derived = (total * scale + divisor ~/ BigInt.two) ~/ divisor;
  return (derived - amount).abs() <= BigInt.one;
}
