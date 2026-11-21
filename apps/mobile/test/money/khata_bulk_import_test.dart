import 'package:flutter_test/flutter_test.dart';
import 'package:lifeos_mobile/money/khata/bulk_import.dart';
import 'package:lifeos_mobile/money/ocr/screenshot_parser.dart';

/// The user's real notes (pasted in chat, 2026-11-18), unchanged.
const userNotes =
    r'''dadaji Pending= 1 34250  + 227000  (34250 variable) - 24000 suresh kumar - 41000(shri ganesh traders 25 may) -I win 10000 bet - 20000 chachiji - 5000 bori - 2600 bori - 15000 - (harish)- 5000(bori) - 1290 ramesh  - 50000(geeta aunty) - 5100(canteen 3sep) - 50000(neha 5 oct) {minus from dada ji} (10k recived on 6 nov but got cancelled out for crakers(4850 and sweets 4500 ) -11300 (maruti 12 nov)
 
Maa - 68000 + 17000( maa) -20000(rakesh mama) - 5000 varun -50000 geeta aunty - 500 varun -4500 - 5000 varun 7 oct

Rohan ( pune) - 101260 +61904 + 71000= 50000sent(amex card 10 march) + 40000 sent ( axis card 13 march) + 40000 (axis card 31 may) + 40000 (axis card  6 july) + 40000(axis card 6 aug) + 38000 (sbi card 8 sept through sbi DB card)  +  36032 ( sbi card 29 sep payzap) - 50000 3 oct +40000 29 oct axis card + 50k sbi debit  card  + 1lac recived  29 oct + 50k sbi dept card send 30 oct + 1 nov 100000−(47826+40000) - 38172 +3526 sbi (9 nov) +70k recieved 
 
pending 

dada ji  - 100000 - 11300 = 88700  (+34250 variable)

maa - 0

rohan  -  + 0
''';

void main() {
  final now = DateTime(2026, 11, 20);

  test("user's notes: three people, their own totals attached", () {
    final people = KhataBulkImport.parse(userNotes, now: now);
    expect(people.map((p) => p.name), ['Dadaji', 'Maa', 'Rohan']);
    expect(people[2].tag, 'pune');

    final dadaji = people[0];
    expect(dadaji.lines, hasLength(15));
    expect(dadaji.lines.first.amountPaise, 13425000);
    expect(dadaji.linesPaise, 12096000);
    expect(
      dadaji.statedPaise,
      8870000,
    ); // "dada ji" in the pending list = "dadaji"
    expect(dadaji.matches, isFalse);
    expect(dadaji.choice, BulkChoice.linesAndFix);
    expect(dadaji.fixPaise, 8870000 - 12096000);
    expect(dadaji.finalPaise, 8870000);

    final maa = people[1];
    expect(maa.lines, hasLength(8));
    expect(maa.linesPaise, 0);
    expect(maa.statedPaise, 0);
    expect(maa.matches, isTrue);
    expect(maa.choice, BulkChoice.lines);

    final rohan = people[2];
    expect(rohan.lines, hasLength(20));
    expect(rohan.statedPaise, 0);
    expect(rohan.choice, BulkChoice.linesAndFix);
    expect(rohan.finalPaise, 0);
  });

  test('people on back-to-back lines, colon style, no pending section', () {
    final people = KhataBulkImport.parse(
      'Ramesh: 5000 + 200 (tea 3 oct)\nSita - 1000 - 400\nAmit 2500',
      now: now,
    );
    expect(people.map((p) => '${p.name}=${p.linesPaise ~/ 100}'), [
      'Ramesh=5200',
      'Sita=600',
      'Amit=2500',
    ]);
    expect(
      people.every(
        (p) => p.statedPaise == null && p.choice == BulkChoice.lines,
      ),
      isTrue,
    );
    expect(people[0].lines[1].date, DateTime(2026, 10, 3));
  });

  test('a line starting with + or a number continues the person above', () {
    final people = KhataBulkImport.parse(
      'Raju - 5000\n+ 2000 (petrol)\n- 1000\n\nGeeta - 300',
      now: now,
    );
    expect(people.map((p) => '${p.name}=${p.linesPaise ~/ 100}'), [
      'Raju=6000',
      'Geeta=300',
    ]);
    expect(people[0].lines, hasLength(3));
  });

  test('someone only in the pending list gets just that total', () {
    final people = KhataBulkImport.parse(
      'Raju - 5000\n\ntotal\nRaju - 5000\nChotu - 750',
      now: now,
    );
    expect(people.map((p) => p.name), ['Raju', 'Chotu']);
    expect(people[0].matches, isTrue);
    expect(people[1].lines, isEmpty);
    expect(people[1].statedPaise, 75000);
    expect(people[1].choice, BulkChoice.totalOnly);
  });

  test(
    'owedToMe follows the "+ means" choice; name keys ignore case and spaces',
    () {
      final p = KhataBulkImport.parse('Dada ji - 1000', now: now).single;
      // Default: "+" = I owe them (the user's notebook: "Dadaji pending = ..." is Dadaji's money with me).
      expect(p.plusTheyOwe, isFalse);
      expect(p.owedToMe(100000), -100000);
      p.plusTheyOwe = true;
      expect(p.owedToMe(100000), 100000);
      expect(
        KhataBulkImport.nameKey('Dada ji'),
        KhataBulkImport.nameKey('DADAJI'),
      );
    },
  );

  test(
    "screenshot of the notes: wrapped lines stay with Dadaji (no Suresh / Bori / Geeta aunty people)",
    () {
      final ocr = wrapAsScreenshot(userNotes);
      expect(ocr.length, greaterThan(20), reason: 'notes really are wrapped');
      // A wrapped line that starts with a name, like the user saw.
      expect(
        ocr.any(
          (l) =>
              RegExp(
                r'^[a-z]+ ?[a-z]* ?-',
                caseSensitive: false,
              ).hasMatch(l.text) &&
              !l.text.startsWith('Maa'),
        ),
        isTrue,
      );
      final text = KhataBulkImport.textFromOcr(ocr);
      final people = KhataBulkImport.parse(text, now: now);
      expect(people.map((p) => p.name), ['Dadaji', 'Maa', 'Rohan']);
      final pasted = KhataBulkImport.parse(userNotes, now: now);
      for (var i = 0; i < 3; i++) {
        expect(
          people[i].lines.length,
          pasted[i].lines.length,
          reason: people[i].name,
        );
        expect(
          people[i].linesPaise,
          pasted[i].linesPaise,
          reason: people[i].name,
        );
        expect(
          people[i].statedPaise,
          pasted[i].statedPaise,
          reason: people[i].name,
        );
      }
    },
  );

  test('wrapped lines with no pending section still stay with their person', () {
    const notes =
        'Dadaji - 50000 - 24000 suresh kumar - 5000 bori - 2600 bori - 1290 ramesh\n\nMaa - 300 + 200';
    final people = KhataBulkImport.parse(
      KhataBulkImport.textFromOcr(wrapAsScreenshot(notes, width: 22)),
      now: now,
    );
    expect(people.map((p) => '${p.name}=${p.linesPaise ~/ 100}'), [
      'Dadaji=17110',
      'Maa=500',
    ]);
  });

  test('textFromOcr puts a blank line only at real gaps', () {
    final t = KhataBulkImport.textFromOcr(const [
      OcrLine(
        'a - 1 + 4 + 5 + 6 + 7 + 8',
        top: 0,
        bottom: 40,
        right: 1000,
      ), // runs to the edge: wraps
      OcrLine(
        '+ 2',
        top: 50,
        bottom: 90,
        right: 200,
      ), // short: a real line break follows
      OcrLine('9 tea', top: 100, bottom: 140, right: 300),
      OcrLine('b - 3', top: 230, bottom: 270, right: 300),
    ]);
    expect(t, 'a - 1 + 4 + 5 + 6 + 7 + 8 + 2\n9 tea\n\nb - 3');
  });

  test('nothing useful gives nobody', () {
    expect(KhataBulkImport.parse('', now: now), isEmpty);
    expect(KhataBulkImport.parse('hello\n\n', now: now), isEmpty);
  });
}

/// The notes as a phone screenshot of them would come out of OCR: every
/// paragraph wrapped at ~[width] characters, with bigger gaps between paragraphs.
List<OcrLine> wrapAsScreenshot(String text, {int width = 44}) {
  final out = <OcrLine>[];
  var y = 100.0;
  for (final para in text.split(RegExp(r'\n\s*\n'))) {
    final words = para
        .replaceAll('\n', ' ')
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty);
    var line = '';
    void emit() {
      if (line.isEmpty) return;
      out.add(OcrLine(line, left: 40, top: y, right: 1000, bottom: y + 40));
      y += 52;
      line = '';
    }

    for (final w in words) {
      if (line.isNotEmpty && line.length + 1 + w.length > width) emit();
      line = line.isEmpty ? w : '$line $w';
    }
    emit();
    y += 70; // blank line between paragraphs
  }
  return out;
}
