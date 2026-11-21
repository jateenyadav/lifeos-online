import 'dart:math' as math;

/// Merchant normalisation and conservative fuzzy matching.
///
/// Design goal: never silently merge two different merchants. "SHARMA STORE"
/// and "VERMA STORE" share a suffix but are different shops, so the first
/// significant token must match (allowing a 1-char typo on long tokens).
class MerchantNormalizer {
  MerchantNormalizer._();

  static const _noise = {
    'PVT',
    'PRIVATE',
    'LTD',
    'LIMITED',
    'LLP',
    'INC',
    'CO',
    'COMPANY',
    'THE',
    'INDIA',
    'IN',
    'ONLINE',
    'PAYMENTS',
    'PAYMENT',
    'TECHNOLOGIES',
    'TECHNOLOGY',
    'SERVICES',
    'SERVICE',
    'SOLUTIONS',
    'ENTERPRISES',
    'ENTERPRISE',
    'RETAIL',
    'MS',
    'M/S',
    'UPI',
    'VPA',
    'POS',
    'ECOM',
    'WWW',
    'COM',
  };

  static const _synonyms = {
    'STORES': 'STORE',
    'SHOP': 'STORE',
    'SHOPPE': 'STORE',
    'MART': 'MART',
    'GENERAL': 'GENERAL',
    'KIRANA': 'KIRANA',
    'MEDICALS': 'MEDICAL',
    'PHARMACY': 'MEDICAL',
    'CHEMIST': 'MEDICAL',
    'CHEMISTS': 'MEDICAL',
    'RESTAURANTS': 'RESTAURANT',
    'HOTELS': 'HOTEL',
    'TRADERS': 'TRADER',
  };

  /// Canonical key used for exact alias lookups.
  static String normalize(String raw) {
    var s = raw.toUpperCase();
    // UPI IDs: keep the handle's user part only (sharma.store@ybl -> SHARMA STORE)
    final at = s.indexOf('@');
    if (at > 0 && !s.substring(0, at).contains(' ')) {
      s = s.substring(0, at);
    }
    s = s.replaceAll(RegExp(r'[._\-/*#&+,()\[\]:]+'), ' ');
    s = s.replaceAll(RegExp(r'\b\d{4,}\b'), ' '); // terminal ids, phone numbers
    s = s.replaceAll(RegExp(r'[^A-Z0-9 ]'), ' ');
    final tokens = s
        .split(RegExp(r'\s+'))
        .where((t) => t.isNotEmpty && !_noise.contains(t))
        .map((t) => _synonyms[t] ?? t)
        .toList();
    return tokens.join(' ').trim();
  }

  /// Human friendly display name: "SHARMA STORE" -> "Sharma Store".
  static String displayName(String raw) {
    var s = raw.trim();
    final at = s.indexOf('@');
    if (at > 0 && !s.substring(0, at).contains(' ')) {
      s = s.substring(0, at).replaceAll(RegExp(r'[._\-]+'), ' ');
    }
    s = s.replaceAll(RegExp(r'\s+'), ' ');
    return s
        .split(' ')
        .where((w) => w.isNotEmpty)
        .map(
          (w) =>
              w.length <= 3 &&
                  w == w.toUpperCase() &&
                  !RegExp(r'^[A-Z][a-z]').hasMatch(w)
              ? w
              : w[0].toUpperCase() + w.substring(1).toLowerCase(),
        )
        .join(' ');
  }
}

class MerchantCandidate {
  final int merchantId;
  final String normalizedKey;
  final List<String> aliases;
  final String? upiId;
  final int? categoryId;
  const MerchantCandidate({
    required this.merchantId,
    required this.normalizedKey,
    this.aliases = const [],
    this.upiId,
    this.categoryId,
  });
}

class MerchantMatch {
  final MerchantCandidate candidate;
  final int confidence; // 0..100
  final String reason;
  const MerchantMatch(this.candidate, this.confidence, this.reason);

  /// Category may be applied automatically only at high confidence.
  bool get autoApply => confidence >= 85;
}

class MerchantMatcher {
  /// Finds the best matching known merchant for [rawName]/[upiId].
  /// Returns null when nothing is similar enough to even suggest.
  MerchantMatch? match(
    String? rawName,
    String? upiId,
    List<MerchantCandidate> known,
  ) {
    final key = rawName == null ? '' : MerchantNormalizer.normalize(rawName);
    final upi = upiId?.toLowerCase();
    MerchantMatch? best;

    for (final c in known) {
      MerchantMatch? m;
      if (upi != null && c.upiId != null && c.upiId!.toLowerCase() == upi) {
        m = MerchantMatch(c, 98, 'upi id');
      } else if (key.isNotEmpty &&
          (c.normalizedKey == key || c.aliases.contains(key))) {
        m = MerchantMatch(c, 100, 'exact alias');
      } else if (key.isNotEmpty) {
        final keys = [c.normalizedKey, ...c.aliases];
        var bestScore = 0;
        for (final k in keys) {
          final s = similarity(key, k);
          if (s > bestScore) bestScore = s;
        }
        if (bestScore >= 70) m = MerchantMatch(c, bestScore, 'fuzzy');
      }
      if (m != null && (best == null || m.confidence > best.confidence)) {
        best = m;
      }
    }
    return best;
  }

  /// Conservative similarity in 0..100. Different first significant tokens
  /// cap the score below the auto-apply threshold.
  static int similarity(String a, String b) {
    if (a.isEmpty || b.isEmpty) return 0;
    if (a == b) return 100;
    final ta = a.split(' ');
    final tb = b.split(' ');
    final jw = jaroWinkler(a, b);
    final tokenScore = _tokenSetRatio(ta, tb);
    var score = ((jw * 0.5 + tokenScore * 0.5) * 100).round();

    final firstMatches = _tokenEq(ta.first, tb.first);
    if (!firstMatches) {
      score = math.min(score, 60); // e.g. SHARMA STORE vs VERMA STORE
    }
    // One contains the other with the same first token, e.g. "SWIGGY" vs
    // "SWIGGY INSTAMART" -> related: suggest, but never auto-apply.
    if (firstMatches && ta.length != tb.length) {
      final shorter = ta.length < tb.length ? ta : tb;
      final longer = ta.length < tb.length ? tb : ta;
      if (shorter.every((s) => longer.any((l) => _tokenEq(s, l)))) {
        score = math.max(score, 75);
      }
      score = math.min(score, 84);
    }
    return score.clamp(0, 100);
  }

  /// Tokens are equal, or long tokens differ by a single typo.
  static bool _tokenEq(String x, String y) =>
      x == y || (math.min(x.length, y.length) >= 5 && levenshtein(x, y) <= 1);

  /// Jaccard ratio where near-identical long tokens count as the same.
  static double _tokenSetRatio(List<String> a, List<String> b) {
    final sa = a.toSet().toList(), sb = b.toSet().toList();
    final used = <int>{};
    var inter = 0;
    for (final x in sa) {
      for (var j = 0; j < sb.length; j++) {
        if (!used.contains(j) && _tokenEq(x, sb[j])) {
          used.add(j);
          inter++;
          break;
        }
      }
    }
    final union = sa.length + sb.length - inter;
    return union == 0 ? 0 : inter / union;
  }

  static int levenshtein(String s, String t) {
    if (s == t) return 0;
    if (s.isEmpty) return t.length;
    if (t.isEmpty) return s.length;
    var prev = List<int>.generate(t.length + 1, (i) => i);
    var cur = List<int>.filled(t.length + 1, 0);
    for (var i = 1; i <= s.length; i++) {
      cur[0] = i;
      for (var j = 1; j <= t.length; j++) {
        final cost = s[i - 1] == t[j - 1] ? 0 : 1;
        cur[j] = math.min(
          math.min(cur[j - 1] + 1, prev[j] + 1),
          prev[j - 1] + cost,
        );
      }
      final tmp = prev;
      prev = cur;
      cur = tmp;
    }
    return prev[t.length];
  }

  static double jaroWinkler(String s1, String s2) {
    if (s1 == s2) return 1;
    final len1 = s1.length, len2 = s2.length;
    if (len1 == 0 || len2 == 0) return 0;
    final matchDistance = math.max(0, math.max(len1, len2) ~/ 2 - 1);
    final m1 = List<bool>.filled(len1, false);
    final m2 = List<bool>.filled(len2, false);
    var matches = 0;
    for (var i = 0; i < len1; i++) {
      final start = math.max(0, i - matchDistance);
      final end = math.min(i + matchDistance + 1, len2);
      for (var j = start; j < end; j++) {
        if (m2[j] || s1[i] != s2[j]) continue;
        m1[i] = m2[j] = true;
        matches++;
        break;
      }
    }
    if (matches == 0) return 0;
    var t = 0, k = 0;
    for (var i = 0; i < len1; i++) {
      if (!m1[i]) continue;
      while (!m2[k]) {
        k++;
      }
      if (s1[i] != s2[k]) t++;
      k++;
    }
    final jaro =
        (matches / len1 + matches / len2 + (matches - t / 2) / matches) / 3;
    var prefix = 0;
    for (var i = 0; i < math.min(4, math.min(len1, len2)); i++) {
      if (s1[i] == s2[i]) {
        prefix++;
      } else {
        break;
      }
    }
    return jaro + prefix * 0.1 * (1 - jaro);
  }
}
