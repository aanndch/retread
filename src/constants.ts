/**
 * Retread Global Application Constants
 */

// Routing URL Hashes
export const HASH_HOME = '#/';
export const HASH_BACKUP = '#/backup';
export const HASH_SETTINGS = '#/settings';
export const HASH_EDIT = '#/edit';
export const HASH_TODO = '#/todo';
export const HASH_PHOTOS = '#/photos';
export const HASH_SEARCH = '#/search';
export const HASH_RIDE_PREFIX = '#/ride/';
export const HASH_LEG_PREFIX = '#/leg/';

// Image Attachment Compression Defaults
export const MAX_IMAGE_EDGE = 1600; // Max edge length for compressed images
export const IMAGE_COMPRESSION_QUALITY = 0.8; // Quality level for compressed JPEGs

// Google Drive Backup Settings
// OAuth client IDs for web apps are public by design (they ship in the JS bundle),
// so the ID is embedded as a fallback. VITE_GDRIVE_CLIENT_ID overrides it for forks.
export const GDRIVE_CLIENT_ID =
  import.meta.env.VITE_GDRIVE_CLIENT_ID ||
  '57414145364-eaieajpbfk0t6vjvfpav0fv4ocre84kq.apps.googleusercontent.com';
export const GDRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.file';
export const GDRIVE_APP_PROPERTY_KEY = 'isRetreadBackup';
export const GDRIVE_APP_PROPERTY_VALUE = 'true';
export const GDRIVE_AUTOSYNC_FILENAME = 'retread-autosync.json.gz';
export const GDRIVE_AUTOSYNC_DELAY_MS = 5000;
export const GDRIVE_LOCAL_STORAGE_KEY_LAST_SYNC = 'retread-gdrive-last-sync';
export const GDRIVE_LOCAL_STORAGE_KEY_AUTOSYNC = 'retread-gdrive-autosync';
