import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_config.dart';
import '../../core/theme/app_theme.dart';
import '../app/app_controller.dart';
import '../../shared/widgets/common_widgets.dart';
import '../home/home_screen.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final _mapController = MapController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<AppController>().refreshAll(silent: true));
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppController>();
    final center = app.position != null
        ? LatLng(app.position!.latitude, app.position!.longitude)
        : const LatLng(9.082, 8.6753);

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
          left: 12,
          right: 12,
          child: SaCard(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Text(
              app.locationDenied
                  ? 'Location off — showing Nigeria overview'
                  : '${app.activeZones.length} active alerts · ${app.nearbyPanics.length} SOS nearby',
              style: const TextStyle(fontSize: 12),
            ),
          ),
        ),
        Positioned(
          bottom: 16,
          right: 16,
          child: FloatingActionButton(
            backgroundColor: AppColors.green,
            onPressed: () {
              if (app.position != null) {
                _mapController.move(LatLng(app.position!.latitude, app.position!.longitude), 12);
              }
              app.refreshAll();
            },
            child: const Icon(Icons.my_location),
          ),
        ),
      ],
    );
  }
}
