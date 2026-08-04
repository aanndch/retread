/**
 * Retread Global Application Constants
 */

// Routing URL Hashes
export const HASH_HOME = '#/';
export const HASH_BACKUP = '#/backup';
export const HASH_EDIT = '#/edit';
export const HASH_RIDE_PREFIX = '#/ride/';
export const HASH_LEG_PREFIX = '#/leg/';

// OSRM Map Snapping API Settings
export const OSRM_DRIVING_BASE_URL = 'https://router.project-osrm.org/route/v1/driving/';

// Snap Distance / Detour Thresholds (in kilometers)
export const SNAP_THRESHOLD_KM = 0.05; // 50m proximity limit to snap onto a road
export const DETOUR_RATIO_LONG = 10.0;  // OSRM route is allowed to stretch up to 10x the direct distance (for displacements > 1km)
export const DETOUR_FLAT_SHORT_KM = 15.0; // Allowed OSRM distance flat threshold for short switchbacks (<= 1km)
export const DIRECT_DIST_LIMIT_KM = 1.0;

// Image Attachment Compression Defaults
export const MAX_IMAGE_EDGE = 1600; // Max edge length for compressed images
export const IMAGE_COMPRESSION_QUALITY = 0.8; // Quality level for compressed JPEGs

// Google Drive Backup Settings
export const GDRIVE_CLIENT_ID = import.meta.env.VITE_GDRIVE_CLIENT_ID || '';
export const GDRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.file';
export const GDRIVE_APP_PROPERTY_KEY = 'isRetreadBackup';
export const GDRIVE_APP_PROPERTY_VALUE = 'true';
export const GDRIVE_AUTOSYNC_FILENAME = 'retread-autosync.json.gz';
export const GDRIVE_AUTOSYNC_DELAY_MS = 5000;
export const GDRIVE_LOCAL_STORAGE_KEY_LAST_SYNC = 'retread-gdrive-last-sync';
export const GDRIVE_LOCAL_STORAGE_KEY_AUTOSYNC = 'retread-gdrive-autosync';
