import '../api/api_exception.dart';

String friendlyError(Object? err) {
  if (err is ApiException) {
    if (err.statusCode == 401 || err.statusCode == 403) {
      return 'Sign in to use this feature';
    }
    if (err.statusCode == 429) return 'Too many requests — wait a moment';
    if (err.statusCode == 409) return err.message;
    if (err.message.toLowerCase().contains('network')) {
      return 'No connection — check data or Wi‑Fi';
    }
    return err.message.length > 120 ? 'Something went wrong — try again' : err.message;
  }
  final msg = err?.toString() ?? 'Something went wrong';
  if (msg.contains('SocketException') || msg.contains('Failed host lookup')) {
    return 'No connection — check data or Wi‑Fi';
  }
  return msg.length > 120 ? 'Something went wrong — try again' : msg;
}
