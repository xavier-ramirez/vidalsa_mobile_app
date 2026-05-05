/*
 * Formulario para registrar una movilización (despacho) desde la APK.
 * POST /api/mobile/movilizaciones (Sanctum).
 */

import { api } from './api.js';
import { sync } from './sync.js';
import { escapeHtml } from './util.js';

let _frentesCache = null;

async function loadFrentesIfNeeded() {
    if (_frentesCache !== null) return _frentesCache;
    try { _frentesCache = await api.get('/frentes'); }
    catch { _frentesCache = []; }
    return _frentesCache;
}

export const movilizacionForm = {
    async open() {
        const overlay = document.getElementById('movFormOverlay');
        const err = document.getElementById('movFormError');
        const ok  = document.getElementById('movFormSuccess');
        err.style.display = 'none';
        ok.style.display = 'none';

        // Poblar selects
        const equipos = sync.getEquiposLocal();
        const eqSel = document.getElementById('movEquipo');
        if (eqSel) {
            eqSel.innerHTML = '<option value="">— Selecciona el equipo —</option>'
                + equipos.map(e => `<option value="${e.ID_EQUIPO}">${escapeHtml(e.CODIGO_PATIO || 'S/C')} — ${escapeHtml(e.MARCA || '')} ${escapeHtml(e.MODELO || '')}</option>`).join('');
        }

        const frentes = await loadFrentesIfNeeded();
        const destinoSel = document.getElementById('movDestino');
        if (destinoSel) {
            destinoSel.innerHTML = '<option value="">— Selecciona destino —</option>'
                + frentes.map(f => `<option value="${f.ID_FRENTE}">${escapeHtml(f.NOMBRE_FRENTE)}</option>`).join('');
        }

        document.getElementById('movEquipo').value = '';
        document.getElementById('movDestino').value = '';
        overlay.classList.add('open');
    },

    close() {
        document.getElementById('movFormOverlay').classList.remove('open');
    },

    async submit() {
        const eq = document.getElementById('movEquipo').value;
        const dest = document.getElementById('movDestino').value;
        const err = document.getElementById('movFormError');
        const ok  = document.getElementById('movFormSuccess');
        const btn = document.getElementById('movFormSubmit');
        err.style.display = 'none';
        ok.style.display = 'none';

        if (!eq || !dest) {
            err.textContent = 'Selecciona el equipo y el frente destino.';
            err.style.display = 'flex';
            return;
        }
        if (!navigator.onLine) {
            err.textContent = 'Necesitas conexión para registrar la movilización.';
            err.style.display = 'flex';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Registrando…';
        try {
            await api.post('/movilizaciones', {
                tipo: 'despacho',
                ID_EQUIPO: eq,
                ID_FRENTE_DESTINO: dest,
            });
            ok.textContent = 'Movilización registrada correctamente.';
            ok.style.display = 'flex';
            // Refresca lista de equipos (cambió ID_FRENTE_ACTUAL del equipo)
            try { await sync.syncMisEquipos(); } catch {}
            setTimeout(() => {
                this.close();
                if (window._historialModuleRefresh) window._historialModuleRefresh();
            }, 1200);
        } catch (e) {
            err.innerHTML = `<i class="material-icons" style="font-size:18px;">error_outline</i> <span>${escapeHtml(e.message)}</span>`;
            err.style.display = 'flex';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Registrar movilización';
        }
    },

    bindControls() {
        const closeBtn = document.getElementById('movFormClose');
        const submit = document.getElementById('movFormSubmit');
        const overlay = document.getElementById('movFormOverlay');
        if (closeBtn && !closeBtn.dataset.bound) {
            closeBtn.dataset.bound = '1';
            closeBtn.addEventListener('click', () => this.close());
        }
        if (submit && !submit.dataset.bound) {
            submit.dataset.bound = '1';
            submit.addEventListener('click', () => this.submit());
        }
        if (overlay && !overlay.dataset.bound) {
            overlay.dataset.bound = '1';
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.close();
            });
        }
    },
};
