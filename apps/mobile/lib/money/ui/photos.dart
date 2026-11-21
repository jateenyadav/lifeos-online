import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';
import 'money_store.dart';

const maxPhotoSide = 1600;

/// Re-encodes any picked image as a JPEG whose longest side is ≤ 1600 px.
Uint8List downscaleToJpeg(Uint8List bytes, {int maxSide = maxPhotoSide}) {
  final decoded = img.decodeImage(bytes);
  if (decoded == null) throw const FormatException('Not an image');
  final oriented = img.bakeOrientation(decoded);
  final longest = oriented.width > oriented.height
      ? oriented.width
      : oriented.height;
  final resized = longest <= maxSide
      ? oriented
      : oriented.width >= oriented.height
      ? img.copyResize(oriented, width: maxSide)
      : img.copyResize(oriented, height: maxSide);
  return Uint8List.fromList(img.encodeJpg(resized, quality: 82));
}

/// Picks a photo (camera or gallery). Swappable in tests.
abstract class PhotoSource {
  Future<Uint8List?> pick({required bool camera});
  Future<List<String>> pickPaths();
}

class DevicePhotoSource implements PhotoSource {
  final _picker = ImagePicker();
  @override
  Future<Uint8List?> pick({required bool camera}) async {
    final file = await _picker.pickImage(
      source: camera ? ImageSource.camera : ImageSource.gallery,
      maxWidth: maxPhotoSide.toDouble(),
      maxHeight: maxPhotoSide.toDouble(),
      imageQuality: 85,
    );
    if (file == null) return null;
    final raw = await file.readAsBytes();
    return compute(downscaleToJpeg, raw);
  }

  /// Full-size originals for on-device OCR (never uploaded as-is).
  @override
  Future<List<String>> pickPaths() async {
    final files = await _picker.pickMultiImage();
    return [for (final file in files) file.path];
  }
}

PhotoSource photoSource = DevicePhotoSource();

Future<bool?> askCamera(BuildContext context) => showModalBottomSheet<bool>(
  context: context,
  builder: (context) => SafeArea(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ListTile(
          leading: const Icon(Icons.photo_camera_outlined),
          title: const Text('Take a photo'),
          onTap: () => Navigator.pop(context, true),
        ),
        ListTile(
          leading: const Icon(Icons.photo_library_outlined),
          title: const Text('Choose from gallery'),
          onTap: () => Navigator.pop(context, false),
        ),
      ],
    ),
  ),
);

/// Thumbnail that loads the photo bytes from the API (cached).
class PhotoThumb extends StatelessWidget {
  const PhotoThumb({
    super.key,
    required this.store,
    required this.id,
    this.size = 84,
    this.onTap,
  });
  final MoneyStore store;
  final String id;
  final double size;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => InkWell(
    borderRadius: BorderRadius.circular(14),
    onTap: onTap,
    child: ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(
        width: size,
        height: size,
        child: FutureBuilder<Uint8List>(
          future: store.photo(id),
          builder: (context, snapshot) => snapshot.hasData
              ? Image.memory(snapshot.data!, fit: BoxFit.cover)
              : ColoredBox(
                  color: Theme.of(context).colorScheme.surfaceContainerHigh,
                  child: Icon(
                    snapshot.hasError
                        ? Icons.broken_image_outlined
                        : Icons.image_outlined,
                  ),
                ),
        ),
      ),
    ),
  );
}

/// Full-screen viewer with pinch zoom, swiping between photos.
class PhotoViewer extends StatelessWidget {
  const PhotoViewer({
    super.key,
    required this.store,
    required this.ids,
    this.initial = 0,
  });
  final MoneyStore store;
  final List<String> ids;
  final int initial;

  static Future<void> open(
    BuildContext context,
    MoneyStore store,
    List<String> ids,
    int initial,
  ) => Navigator.of(context).push(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => PhotoViewer(store: store, ids: ids, initial: initial),
    ),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.black,
    appBar: AppBar(
      backgroundColor: Colors.black,
      foregroundColor: Colors.white,
      title: const Text('Photo'),
    ),
    body: PageView(
      controller: PageController(initialPage: initial),
      children: [
        for (final id in ids)
          InteractiveViewer(
            key: Key('photo_zoom_$id'),
            minScale: 1,
            maxScale: 6,
            child: Center(
              child: FutureBuilder<Uint8List>(
                future: store.photo(id),
                builder: (context, snapshot) => snapshot.hasData
                    ? Image.memory(snapshot.data!)
                    : const CircularProgressIndicator(),
              ),
            ),
          ),
      ],
    ),
  );
}
