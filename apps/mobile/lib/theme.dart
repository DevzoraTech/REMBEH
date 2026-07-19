import 'package:flutter/material.dart';

/// REMBEH mobile palette (sampled from product screenshots)
const forestEmerald = Color(0xFF065B24); // tabs, amounts, active nav, CTAs
const midnightNavy = Color(0xFF14213D);
const warmGold = Color(0xFFD6A84F);
const sage = Color(0xFFEEF4F0); // avatar / soft success tint
const softIvory = Color(0xFFF7F9F8);
const slateText = Color(0xFF27303F);
const line = Color(0xFFD5DDD8);

ThemeData buildRembehTheme() {
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
    inputDecorationTheme: const InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.zero),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.zero,
        borderSide: BorderSide(color: line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.zero,
        borderSide: BorderSide(color: forestEmerald, width: 1.4),
      ),
      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 14),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: forestEmerald,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(48),
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
        elevation: 0,
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: midnightNavy,
        minimumSize: const Size.fromHeight(48),
        side: const BorderSide(color: line),
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: forestEmerald.withValues(alpha: 0.12),
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
