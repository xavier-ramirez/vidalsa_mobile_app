/* Cliente HTTP minimalista contra /api/mobile (Laravel + Sanctum) */

import { API_BASE, STORAGE_KEYS } from './config.js';

function getToken() {
    return localStorage.getItem(STORAGE_KEYS.token);
}

async function request(method, path, body = null) {
    const headers = {
        'Accept': 'application/json',
    };
    const token = getToken();
    if (token && token !== 'offline_token') {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const opts = { method, headers };
    if (body !== null) {
        if (body instanceof FormData) {
            opts.body = body; // multipart, no Content-Type manual
        } else {
            headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
    }

    let res;
    try {
        res = await fetch(`${API_BASE}${path}`, opts);
    } catch (networkErr) {
        const e = new Error('No se pudo conectar al servidor.');
        e.cause = networkErr;
        e.kind = 'network';
        throw e;
    }

    let data = null;
    const text = await res.text();
    if (text) {
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
    }

    if (!res.ok) {
        let msg = (data && (data.error || data.message)) || `Error HTTP ${res.status}`;
        // 403 = sin permiso. La web muestra un toast bonito; replicamos.
        if (res.status === 403) {
            msg = 'No tienes permiso para realizar esta operación.';
            if (window.showToast) window.showToast(msg, 'error');
        }
        const err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

export const api = {
    get:   (path)        => request('GET',  path),
    post:  (path, body)  => request('POST', path, body),
    put:   (path, body)  => request('PUT',  path, body),
    patch: (path, body)  => request('PATCH', path, body),
    del:   (path)        => request('DELETE', path),
    /** Descarga binario (PDF). Devuelve Blob. */
    async getBlob(path) {
        const headers = { 'Accept': 'application/pdf' };
        const token = getToken();
        if (token && token !== 'offline_token') headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}${path}`, { headers });
        if (!res.ok) throw new Error(`Error descargando PDF (HTTP ${res.status})`);
        return await res.blob();
    },
};
