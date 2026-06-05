class AppI18n {
  static const supported = ['en', 'ha', 'yo', 'ig', 'pcm'];

  static const Map<String, Map<String, String>> _strings = {
    // ── Brand / onboarding ──
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
    'onboarding_welcome': {
      'en': 'Welcome to SafeAlert',
      'ha': 'Barka da zuwa SafeAlert',
      'yo': 'Kaabo si SafeAlert',
      'ig': 'Nnọọ na SafeAlert',
      'pcm': 'Welcome to SafeAlert',
    },
    'onboarding_state_title': {
      'en': 'Your state',
      'ha': 'Jihar ku',
      'yo': 'Ipinlẹ rẹ',
      'ig': 'Steeti gị',
      'pcm': 'Your state',
    },
    'onboarding_state_hint': {
      'en': 'Select your state to download a safety map for offline use.',
      'ha': 'Zaɓi jihar ku don sauke taswirar tsaro don amfani ba tare da intanet ba.',
      'yo': 'Yan ipinlẹ rẹ lati ṣe igbasilẹ maapu aabo fun lilo lai ni intanẹẹti.',
      'ig': 'Họrọ steeti gị ka ibudata maapụ nchekwa maka ojiji na-enweghị ịntanetị.',
      'pcm': 'Pick your state make you fit download safety map for offline.',
    },
    'onboarding_state_detected': {
      'en': 'We detected you\'re in {state}. Pick another state below if that\'s wrong.',
      'ha': 'Mun gano cewa kuna cikin {state}. Zaɓi wata jihar a ƙasa idan ba daidai ba ne.',
      'yo': 'A ri i pe o wa ni {state}. Yan ipinlẹ miiran isalẹ ti ko tọ.',
      'ig': 'Anyị chọpụtara na ị nọ na {state}. Họrọ steeti ọzọ n\'okpuru ma ọ bụrụ na ezighi ezi.',
      'pcm': 'We detect say you dey {state}. Change am below if e no correct.',
    },
    'onboarding_download_pack': {
      'en': 'Download {state} offline pack',
      'ha': 'Sauke fakitin {state} ba tare da intanet ba',
      'yo': 'Ṣe igbasilẹ {state} lai ni intanẹẹti',
      'ig': 'Budata {state} n\'enweghị ịntanetị',
      'pcm': 'Download {state} offline pack',
    },
    'onboarding_continue': {
      'en': 'Continue',
      'ha': 'Ci gaba',
      'yo': 'Tẹsiwaju',
      'ig': 'Gaa n\'ihu',
      'pcm': 'Continue',
    },
    'onboarding_skip': {
      'en': 'Skip for now',
      'ha': 'Tsallake yanzu',
      'yo': 'Fò lọ fún báyìí',
      'ig': 'Hapụ ugbu a',
      'pcm': 'Skip for now',
    },
    'onboarding_pack_saved': {
      'en': 'Offline map saved: {state}',
      'ha': 'An adana taswirar {state}',
      'yo': 'Ti fi pamọ maapu {state}',
      'ig': 'E chekwara maapụ {state}',
      'pcm': 'Don save offline map: {state}',
    },

    // ── Nav tabs ──
    'home': {
      'en': 'Home',
      'ha': 'Gida',
      'yo': 'Ilé',
      'ig': 'Ụlọ',
      'pcm': 'Home',
    },
    'map': {
      'en': 'Map',
      'ha': 'Taswira',
      'yo': 'Maapu',
      'ig': 'Maapụ',
      'pcm': 'Map',
    },
    'insights_tab': {
      'en': 'Insights',
      'ha': 'Bayani',
      'yo': 'Ìmọ̀',
      'ig': 'Nghọta',
      'pcm': 'Insights',
    },
    'routes_tab': {
      'en': 'Routes',
      'ha': 'Hanyoyi',
      'yo': 'Ọ̀nà',
      'ig': 'Ụzọ',
      'pcm': 'Routes',
    },
    'circle_tab': {
      'en': 'Circle',
      'ha': 'Daular',
      'yo': 'Ẹgbẹ́',
      'ig': 'Otu',
      'pcm': 'Circle',
    },
    'report_tab': {
      'en': 'Report',
      'ha': 'Rahoto',
      'yo': 'Ìròyìn',
      'ig': 'Kọọ',
      'pcm': 'Report',
    },
    'trust_tab': {
      'en': 'Trust',
      'ha': 'Aminci',
      'yo': 'Ìgbẹ́kẹ̀lé',
      'ig': 'Nkwenye',
      'pcm': 'Trust',
    },

    // ── Panic / SOS ──
    'sos': {
      'en': 'Citizen SOS',
      'ha': 'SOS na jama\'a',
      'yo': 'SOS araalu',
      'ig': 'SOS obodo',
      'pcm': 'Citizen SOS',
    },
    'panic_hold': {
      'en': 'Hold 3 seconds to activate',
      'ha': 'Riƙe daƙiƙa 3 don kunna',
      'yo': 'Dimu fun aaya 3 lati mu',
      'ig': 'Jide sekọnd 3 iji gbanye',
      'pcm': 'Hold 3 seconds make e activate',
    },
    'help_nearby': {
      'en': 'Alert me when someone nearby needs help',
      'ha': 'Sanar da ni idan wani kusa yana buƙatar taimako',
      'yo': 'Fi mi leti nigbati eniyan nitosi nilo iranlọwọ',
      'ig': 'Mara m ka onye nọ nso chọrọ enyemaka',
      'pcm': 'Alert me if person near need help',
    },
    'im_safe': {
      'en': "I'm Safe Now",
      'ha': 'Na samu lafiya',
      'yo': 'Mo salai',
      'ig': 'Adị m mma',
      'pcm': 'I dey safe',
    },
    'on_my_way': {
      'en': "I'm on my way",
      'ha': 'Ina zuwa',
      'yo': 'Mo n bọ',
      'ig': 'Abịa m',
      'pcm': 'I dey come',
    },
    'active': {
      'en': 'ACTIVE',
      'ha': 'Aiki',
      'yo': 'Lọwọ',
      'ig': 'Na-arụ ọrụ',
      'pcm': 'ACTIVE',
    },
    'need_help': {
      'en': 'Need help',
      'ha': 'Bukatar taimako',
      'yo': 'Nilo iranlọwọ',
      'ig': 'Chọrọ enyemaka',
      'pcm': 'Need help',
    },
    'start_journey': {
      'en': 'Start journey',
      'ha': 'Fara tafiya',
      'yo': 'Bẹrẹ irin ajo',
      'ig': 'Malite njem',
      'pcm': 'Start journey',
    },
    'arrived_safely': {
      'en': 'Arrived safely',
      'ha': 'An iso lafiya',
      'yo': 'O de salai',
      'ig': 'E ruola nchekwa',
      'pcm': 'Don arrive safe',
    },

    // ── Auth ──
    'sign_in': {
      'en': 'Sign in',
      'ha': 'Shiga',
      'yo': 'Wọlé',
      'ig': 'Banye',
      'pcm': 'Sign in',
    },

    // ── Home / stats ──
    'hot_zones_lbl': {
      'en': 'Danger areas',
      'ha': 'Yankunan haɗari',
      'yo': 'Awọn agbègbè ewu',
      'ig': 'Ebe ịdọ aka ná ntị',
      'pcm': 'Danger areas',
    },
    'stat_safe_routes': {
      'en': 'Safe routes',
      'ha': 'Hanyoyi masu aminci',
      'yo': 'Ọ̀nà ààbò',
      'ig': 'Ụzọ dị mma',
      'pcm': 'Safe road',
    },
    'stat_my_circle': {
      'en': 'My circle',
      'ha': 'Daular na',
      'yo': 'Ẹgbẹ́ mi',
      'ig': 'Otu m',
      'pcm': 'My circle',
    },
    'view_insights': {
      'en': 'Safety insights →',
      'ha': 'Duba bayanan tsaro →',
      'yo': 'Wo ìmọ̀ ààbò →',
      'ig': 'Lee nghọta nchekwa →',
      'pcm': 'See safety insights →',
    },
    'view_all_map': {
      'en': 'View all on map',
      'ha': 'Duba duk a taswira',
      'yo': 'Wo gbogbo lori maapu',
      'ig': 'Lee niile na maapụ',
      'pcm': 'See all for map',
    },
    'ussd_title': {
      'en': 'No smartphone? No data?',
      'ha': 'Babu wayar hannu? Babu data?',
      'yo': 'Ko si foonu? Ko si data?',
      'ig': 'Enweghị ekwentị? Enweghị data?',
      'pcm': 'No data?',
    },
    'checkin': {
      'en': 'Safe Check-in',
      'ha': 'Tabbatar da lafiya',
      'yo': 'Check-in ailewu',
      'ig': 'Nchekwa nchekwa',
      'pcm': 'Safe check-in',
    },

    // ── Insights ──
    'insights_title': {
      'en': 'Safety Insights',
      'ha': 'Bayanan Tsaro',
      'yo': 'Ìmọ̀ Ààbò',
      'ig': 'Nghọta Nchekwa',
      'pcm': 'Safety Insights',
    },
    'insights_sub': {
      'en': 'Live summary of community alerts, severity, and hotspots across Nigeria',
      'ha': 'Taƙaitaccen bayanin faɗakarwa da yankunan haɗari a Najeriya',
      'yo': 'Àkójọpọ̀ ìkìlọ̀ àti àwọn ibi ewu ní Nàìjíríà',
      'ig': 'Nchịkọta ozi ịdọ aka ná ntị na ebe ịdọ aka ná ntị na Naịjirịa',
      'pcm': 'Summary of alerts and hot zones for Nigeria',
    },
    'severity_breakdown': {
      'en': 'Severity breakdown',
      'ha': 'Matakan haɗari',
      'yo': 'Ìpele ewu',
      'ig': 'Ọkwa ihe egwu',
      'pcm': 'How serious',
    },
    'incident_types': {
      'en': 'Incident types',
      'ha': 'Nau\'ikan abubuwa',
      'yo': 'Irú iṣẹlẹ',
      'ig': 'Ụdị ihe omume',
      'pcm': 'Wetin dey happen',
    },
    'hot_states': {
      'en': 'States with most alerts',
      'ha': 'Jihohi masu faɗakarwa',
      'yo': 'Àwọn ìpínlẹ̀ tó pọ̀',
      'ig': 'Steeti kachasị',
      'pcm': 'States wey get plenty alert',
    },
    'refresh_data': {
      'en': 'Refresh data',
      'ha': 'Sabunta bayanai',
      'yo': 'Ṣe àtúnṣe',
      'ig': 'Megharịa data',
      'pcm': 'Refresh data',
    },
    'near_you': {
      'en': 'Near you',
      'ha': 'Kusa da ku',
      'yo': 'Nítòsi rẹ',
      'ig': 'Nso gị',
      'pcm': 'Near you',
    },

    // ── Trust ──
    'trust_title': {
      'en': 'Community & trust',
      'ha': 'Al\'umma da aminci',
      'yo': 'Àgbààgbà & ìgbẹ́kẹ̀lé',
      'ig': 'Obodo & nkwenye',
      'pcm': 'Community & trust',
    },
    'trust_sub': {
      'en': 'Leaders, agents, offline maps, schools, and support — no government pipe',
      'ha': 'Shugabanni, wakilai, taswirori, makarantu — ba gwamnati ba',
      'yo': 'Awọn olori, awọn aṣoju, maapu, ile-iwe — kii ṣe ijoba',
      'ig': 'Ndị isi, ndị nnọchi anya, maapụ, ụlọ akwụkwọ — ọ bụghị gọọmentị',
      'pcm': 'Leaders, agents, offline maps, schools — no be government',
    },
    'trust_home_hint': {
      'en': 'Leaders, offline maps, schools, wellbeing — built for trust',
      'ha': 'Shugabanni, taswirori, makarantu — an gina don aminci',
      'yo': 'Awọn olori, maapu, ile-iwe — a ṣe fun igbẹkẹle',
      'ig': 'Ndị isi, maapụ, ụlọ akwụkwọ — e jirirị nkwenye mee ya',
      'pcm': 'Leaders, offline maps, schools — built for trust',
    },
    'trust_offline': {
      'en': 'Offline state maps',
      'ha': 'Taswirorin jihar ba tare da intanet ba',
      'yo': 'Maapu ipinlẹ lai ni intanẹẹti',
      'ig': 'Maapụ steeti na-enweghị ịntanetị',
      'pcm': 'Offline state maps',
    },
    'trust_offline_hint': {
      'en': 'Download on Wi‑Fi before travelling — warnings work with no signal.',
      'ha': 'Sauke akan Wi‑Fi kafin tafiya — faɗakarwa suna aiki ba tare da sigina ba.',
      'yo': 'Ṣe igbasilẹ lori Wi‑Fi ṣaaju irin ajo — awọn ikilọ ṣiṣẹ lai ni sigina.',
      'ig': 'Budata na Wi‑Fi tupu njem — ịdọ aka ná ntị na-arụ ọrụ na-enweghị sigina.',
      'pcm': 'Download on Wi‑Fi before you travel — e go work even if signal no dey.',
    },

    // ── Report / share ──
    'submit_report': {
      'en': 'Submit community alert',
      'ha': 'Aika rahoton al\'umma',
      'yo': 'Fi ìkìlọ̀ àgbààgbà ránṣẹ́',
      'ig': 'Zipu ịdọ aka ná ntị obodo',
      'pcm': 'Submit community alert',
    },
    'share_app': {
      'en': 'Share app',
      'ha': 'Raba manhaja',
      'yo': 'Pin app',
      'ig': 'Kekọrịta ngwa',
      'pcm': 'Share app',
    },
    'back': {
      'en': 'Back',
      'ha': 'Koma',
      'yo': 'Padà',
      'ig': 'Laghachi',
      'pcm': 'Back',
    },
    'legend_title': {
      'en': 'What alerts mean',
      'ha': 'Ma\'anar sanarwa',
      'yo': 'Itumọ awọn itaniji',
      'ig': 'Ihe kọrọ alerts',
      'pcm': 'Wetin alerts mean',
    },
    'enable_location': {
      'en': 'Turn on location',
      'ha': 'Kunna wuri',
      'yo': 'Tan ipo',
      'ig': 'Gbanye ebe',
      'pcm': 'Turn on location',
    },
    'enable_location_hint': {
      'en': 'Allow GPS so we can show danger alerts near you and your state.',
      'ha': 'Bada izinin GPS don nuna faɗakarwar haɗari kusa da ku.',
      'yo': 'Gba GPS laaye ki a le fi awọn ikilọ ewu nitosi han.',
      'ig': 'Kwe ka GPS ka anyị gosi ịdọ aka ná ntị nso gị.',
      'pcm': 'Allow GPS make we fit show danger near you.',
    },
  };

  static String t(String lang, String key, {Map<String, String>? vars}) {
    final map = _strings[key];
    if (map == null) return key;
    var text = map[lang] ?? map['en'] ?? key;
    if (vars != null) {
      for (final e in vars.entries) {
        text = text.replaceAll('{${e.key}}', e.value);
      }
    }
    return text;
  }
}
