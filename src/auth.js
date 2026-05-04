/*
 * Flujo de autenticación.
 * - 1ra vez: requiere internet → POST /login → guarda token + user (con frentes).
 * - Siguientes veces: si hay token + user en localStorage → entra offline.
 */

import { api } from './api.js';
import { STORAGE_KEYS } from './config.js';

export const auth = {
    isLoggedIn() {
        return !!localStorage.getItem(STORAGE_KEYS.token)
            && !!localStorage.getItem(STORAGE_KEYS.user);
    },

    getUser() {
        const raw = localStorage.getItem(STORAGE_KEYS.user);
        try { return raw ? JSON.parse(raw) : null; } catch { return null; }
    },

    getToken() {
        return localStorage.getItem(STORAGE_KEYS.token);
    },

    /** Frentes asignados al usuario (array). */
    getFrentes() {
        const u = this.getUser();
        return Array.isArray(u?.frentes) ? u.frentes : [];
    },

    async login(correo, password) {
        if (!navigator.onLine) {
            throw new Error('Necesitas conexión a Internet para iniciar sesión por primera vez.');
        }
        const data = await api.post('/login', { correo, password });
        if (!data?.token || !data?.user) {
            throw new Error('Respuesta inesperada del servidor.');
        }
        localStorage.setItem(STORAGE_KEYS.token, data.token);
        localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(data.user));
        return data.user;
    },

    async logout() {
        if (navigator.onLine) {
            try { await api.post('/logout', {}); } catch { /* sin red, no bloqueamos logout local */ }
        }
        localStorage.removeItem(STORAGE_KEYS.token);
        localStorage.removeItem(STORAGE_KEYS.user);
    },
};
