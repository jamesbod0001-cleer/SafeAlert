/// SafeAlert NG API + app constants
class AppConfig {
  static const apiBase = String.fromEnvironment(
    'SAFEALERT_API',
    defaultValue: 'https://qrhtc5kg79.us-east-1.awsapprunner.com/v1',
  );
  static const appName = 'SafeAlert NG';
  static const tagline = 'Your people. Not government.';
  static const ussdDefault = '*384*911#';
}

const typeIcons = {
  'kidnapping': '👤',
  'armed_robbery': '🔫',
  'banditry': '⚠️',
  'terror': '💥',
  'roadblock': '🚧',
  'suspicious': '👁️',
  'one_chance': '🚐',
  'checkpoint': '🛑',
};

const responderSkills = [
  'first_aid',
  'escort',
  'mechanic',
  'legal',
  'security',
  'counselling',
];
