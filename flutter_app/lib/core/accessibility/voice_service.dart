import 'package:flutter_tts/flutter_tts.dart';

/// Spoken prompts for low-literacy users — mirrors web `voice-ui.js`.
class VoiceService {
  VoiceService._();
  static final VoiceService instance = VoiceService._();

  final FlutterTts _tts = FlutterTts();
  bool _ready = false;

  Future<void> init(String lang) async {
    await _tts.setVolume(1);
    await _tts.setSpeechRate(0.45);
    await _tts.awaitSpeakCompletion(false);
    final code = _langCode(lang);
    await _tts.setLanguage(code);
    _ready = true;
  }

  String _langCode(String lang) {
    switch (lang) {
      case 'ha':
        return 'ha-NG';
      case 'yo':
        return 'yo-NG';
      case 'ig':
        return 'ig-NG';
      default:
        return 'en-NG';
    }
  }

  Future<void> speak(String text, {required bool enabled}) async {
    if (!enabled || text.trim().isEmpty) return;
    if (!_ready) await init('en');
    await _tts.stop();
    await _tts.speak(text);
  }

  Future<void> stop() => _tts.stop();
}
