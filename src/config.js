/* Configuración global de la APK */

export const API_BASE = 'https://vidalsa-web.mnsxjk.easypanel.host/api/mobile';

export const STORAGE_KEYS = {
    token:        'vidalsa_token',
    user:         'vidalsa_user',
    lastSyncAt:   'vidalsa_last_sync_at',
    equipos:      'vidalsa_equipos',
    movilizacionesByEquipo: 'vidalsa_movs_by_equipo',
    pdfMeta:      'vidalsa_pdf_meta',
};

/* Sync obligatoria: 6 AM, 12 PM, 4 PM */
export const SYNC_HOURS = [6, 12, 16];

/* Bloqueo si pasaron más de 24h sin sync exitosa */
export const SYNC_MAX_AGE_HOURS = 24;
