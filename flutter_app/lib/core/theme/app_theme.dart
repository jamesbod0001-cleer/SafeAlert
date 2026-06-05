import 'package:flutter/material.dart';

class AppColors {
  static const bg = Color(0xFF0A0E1A);
  static const surface = Color(0xFF111827);
  static const surface2 = Color(0xFF1C2333);
  static const green = Color(0xFF12B76A);
  static const red = Color(0xFFF03E3E);
  static const amber = Color(0xFFF79009);
  static const text = Color(0xFFF9FAFB);
  static const text2 = Color(0xFF9CA3AF);
  static const text3 = Color(0xFF6B7280);
  static const border = Color(0x12FFFFFF);

  static Color severity(String s) => switch (s) {
        'critical' => red,
        'high' => amber,
        'medium' => const Color(0xFFFFB300),
        _ => green,
      };
}

ThemeData buildAppTheme() {
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: AppColors.bg,
    colorScheme: const ColorScheme.dark(
      primary: AppColors.green,
      secondary: AppColors.red,
      surface: AppColors.surface,
      onSurface: AppColors.text,
    ),
    appBarTheme: const AppBarTheme(backgroundColor: AppColors.bg, elevation: 0),
    cardTheme: CardThemeData(
      color: AppColors.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surface2,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      labelStyle: const TextStyle(color: AppColors.text2),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      backgroundColor: AppColors.surface,
      indicatorColor: Color(0x3312B76A),
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      height: 72,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.green,
        foregroundColor: const Color(0xFF041208),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 18),
      ),
    ),
  );
}
