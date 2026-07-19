import 'package:flutter/material.dart';

/// REMBEH mobile palette (sampled from product screenshots / brand guide)
const forestEmerald = Color(0xFF065B24); // tabs, amounts, active nav, CTAs
const midnightNavy = Color(0xFF14213D);
const warmGold = Color(0xFFD6A84F);
const sage = Color(0xFFEEF4F0); // avatar / soft success tint
const softIvory = Color(0xFFF7F9F8);
const slateText = Color(0xFF27303F);
const line = Color(0xFFD5DDD8);

/// Modern radii — soft, not pill-shaped.
const rembehRadiusSm = 8.0;
const rembehRadiusMd = 12.0;
const rembehRadiusLg = 16.0;
const rembehRadiusXl = 20.0;

BorderRadius rembehBorderRadius([double radius = rembehRadiusMd]) =>
    BorderRadius.circular(radius);

BorderRadius rembehSheetRadius({double radius = rembehRadiusXl}) =>
    BorderRadius.vertical(top: Radius.circular(radius));

ThemeData buildRembehTheme() {
  final inputBorder = OutlineInputBorder(
    borderRadius: rembehBorderRadius(rembehRadiusMd),
  );

  return ThemeData(
    useMaterial3: true,
    scaffoldBackgroundColor: softIvory,
    colorScheme: const ColorScheme.light(
      primary: forestEmerald,
      secondary: midnightNavy,
      tertiary: warmGold,
      surface: Colors.white,
      onPrimary: Colors.white,
      onSecondary: Colors.white,
      onSurface: slateText,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: midnightNavy,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: false,
      shape: Border(bottom: BorderSide(color: Color(0xFF0D1830))),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: rembehBorderRadius(rembehRadiusLg),
        side: const BorderSide(color: line),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
      showDragHandle: false,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: inputBorder.copyWith(borderSide: const BorderSide(color: line)),
      enabledBorder: inputBorder.copyWith(
        borderSide: const BorderSide(color: line),
      ),
      focusedBorder: inputBorder.copyWith(
        borderSide: const BorderSide(color: forestEmerald, width: 1.4),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: forestEmerald,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(
          borderRadius: rembehBorderRadius(rembehRadiusMd),
        ),
        elevation: 0,
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: midnightNavy,
        minimumSize: const Size.fromHeight(48),
        side: const BorderSide(color: line),
        shape: RoundedRectangleBorder(
          borderRadius: rembehBorderRadius(rembehRadiusMd),
        ),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: forestEmerald,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(
          borderRadius: rembehBorderRadius(rembehRadiusMd),
        ),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: forestEmerald.withValues(alpha: 0.12),
      indicatorShape: RoundedRectangleBorder(
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: selected ? forestEmerald : slateText,
        );
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(
          color: selected ? forestEmerald : slateText,
        );
      }),
    ),
  );
}
