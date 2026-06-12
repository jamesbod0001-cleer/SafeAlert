import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_config.dart';
import '../../core/i18n/app_i18n.dart';
import '../../core/theme/app_theme.dart';
import '../app/app_controller.dart';
import '../home/home_screen.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final _mapController = MapController();
  bool _mapLoaded = false;

  @override
  void initState() {
    super.initState();
    final app = context.read<AppController>();
    _mapLoaded = !app.dataSaver;
    if (_mapLoaded) {
      WidgetsBinding.instance.addPostFrameCallback((_) => app.refreshAll(silent: true));
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppController>();
    final center = app.position != null
        ? LatLng(app.position!.latitude, app.position!.longitude)
        : const LatLng(9.082, 8.6753);

    if (!_mapLoaded && app.dataSaver) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.map_outlined, size: 48, color: AppColors.text3),
              const SizedBox(height: 16),
              Text(AppI18n.t(app.lang, 'map_load_tap'), textAlign: TextAlign.center, style: const TextStyle(color: AppColors.text2)),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () {
                  setState(() => _mapLoaded = true);
                  app.refreshAll(silent: true);
                },
                child: const Text('Load map'),
              ),
            ],
          ),
        ),
      );
    }

    return Stack(
      children: [
        FlutterMap(
          mapController: _mapController,
          options: MapOptions(initialCenter: center, initialZoom: app.position != null ? 11 : 6),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: AppConfig.appName,
            ),
            if (app.position != null)
              MarkerLayer(
                markers: [
                  Marker(
                    point: LatLng(app.position!.latitude, app.position!.longitude),
                    width: 40,
                    height: 40,
                    child: const Icon(Icons.my_location, color: AppColors.green, size: 32),
                  ),
                ],
              ),
            MarkerLayer(
              markers: [
                for (final z in app.activeZones)
                  Marker(
                    point: LatLng(z.lat, z.lng),
                    width: 36,
                    height: 36,
                    child: GestureDetector(
                      onTap: () => ZoneDetailSheet.show(context, z),
                      child: Container(
                        decoration: BoxDecoration(
                          color: AppColors.severity(z.severity).withValues(alpha: 0.85),
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                        alignment: Alignment.center,
                        child: Text(typeIcons[z.type] ?? '⚠', style: const TextStyle(fontSize: 16)),
                      ),
                    ),
                  ),
                for (final p in app.nearbyPanics)
                  Marker(
                    point: LatLng(p.lat, p.lng),
                    width: 44,
                    height: 44,
                    child: const Icon(Icons.sos, color: AppColors.red, size: 36),
                  ),
              ],
            ),
          ],
        ),
        Positioned(
          top: 12,
          right: 12,
          child: FloatingActionButton.small(
            heroTag: 'map-recenter',
            onPressed: () {
              if (app.position != null) {
                _mapController.move(LatLng(app.position!.latitude, app.position!.longitude), 12);
              }
            },
            child: const Icon(Icons.my_location),
          ),
        ),
      ],
    );
  }
}
