class AppI18n {
  static const supported = ['en', 'ha', 'yo', 'ig', 'pcm'];

  static const Map<String, Map<String, String>> _strings = {
    'app_tagline': {
      'en': 'Your people. Not government.',
      'ha': 'Mutanenka. Ba gwamnati ba.',
      'yo': 'Awon eniyan re. Kii se ijoba.',
      'ig': 'Ndi gi. Obughi gọọmenti.',
      'pcm': 'Na your people, no be government.',
    },
    'citizen_powered': {
      'en': 'Citizen-powered safety',
      'ha': 'Tsaro daga jama\'a',
      'yo': 'Aabo ti awon araalu n dari',
      'ig': 'Nchedo ndi obodo na-anya',
      'pcm': 'Safety wey citizens dey run',
    },
    'get_started': {
      'en': 'Get started',
      'ha': 'Fara',
      'yo': 'Bere',
      'ig': 'Bido',
      'pcm': 'Make we start',
    },
  };

  static String t(String lang, String key) {
    final map = _strings[key];
    if (map == null) return key;
    return map[lang] ?? map['en'] ?? key;
  }
}
