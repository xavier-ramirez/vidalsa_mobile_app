/*
 * Sincronización con el servidor.
 * - syncMisEquipos(): descarga equipos del frente del usuario y los cachea.
 * - getEquiposLocal(): lee de cache.
 * - getLastSyncAt(): timestamp de última sync exitosa.
 * - isSyncRequired(): true si nunca se sincronizó o pasaron >24h.
 */

import { api } from './api.js';
import { STORAGE_KEYS, SYNC_MAX_AGE_HOURS } from './config.js';

export const sync = {
    async syncMisEquipos() {
        if (!navigator.onLine) {
            throw new Error('No hay conexión a Internet.');
        }
        const equipos = await api.get('/mis-equipos');
        if (!Array.isArray(equipos)) {
            throw new Error('Respuesta inválida del servidor.');
        }
        localStorage.setItem(STORAGE_KEYS.equipos, JSON.stringify(equipos));
        localStorage.setItem(STORAGE_KEYS.lastSyncAt, new Date().toISOString());
        return equipos;
    },

    getEquiposLocal() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.equipos);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    },

    getEquipoLocal(id) {
        return this.getEquiposLocal().find(e => String(e.ID_EQUIPO) === String(id)) || null;
    },

    getLastSyncAt() {
        return localStorage.getItem(STORAGE_KEYS.lastSyncAt) || null;
    },

    isSyncRequired() {
        const last = this.getLastSyncAt();
        if (!last) return true;
        const lastMs = new Date(last).getTime();
        const ageHours = (Date.now() - lastMs) / (1000 * 60 * 60);
        return ageHours > SYNC_MAX_AGE_HOURS;
    },

    /** Muestra fecha legible: "hoy 14:32", "ayer 09:15", "12 may 14:32", o "Nunca". */
    formatLastSync() {
        const last = this.getLastSyncAt();
        if (!last) return 'Nunca';
        const d = new Date(last);
        const now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
        const isYesterday = d.toDateString() === yesterday.toDateString();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        if (sameDay)    return `hoy ${hh}:${mm}`;
        if (isYesterday) return `ayer ${hh}:${mm}`;
        const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        return `${d.getDate()} ${meses[d.getMonth()]} ${hh}:${mm}`;
    },
};
