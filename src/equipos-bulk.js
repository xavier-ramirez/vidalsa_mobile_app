/*
 * Selección múltiple de equipos + barra flotante con acciones masivas.
 * Usa API:
 *  POST /equipos/bulk-movilizar   {ids[], id_frente_destino}
 *  POST /equipos/bulk-ubicacion   {ids[], detalle_ubicacion}
 *  POST /equipos/bulk-anchor      {ids[], id_anclaje}
 *  POST /equipos/bulk-unanchor    {ids[]}
 */

import { api } from './api.js';
import { sync } from './sync.js';
import { auth } from './auth.js';
import { escapeHtml } from './util.js';

let _frentesCache = null;
async function loadFrentesIfNeeded() {
    if (_frentesCache !== null) return _frentesCache;
    try { _frentesCache = await api.get('/frentes'); } catch { _frentesCache = []; }
    return _frentesCache;
}

const _selected = new Map(); // id -> { codigo }

function refreshBar() {
    const bar = document.getElementById('eqSelectionBar');
    const count = document.getElementById('eqSelectionCount');
    if (!bar) return;
    const n = _selected.size;
    if (count) count.textContent = String(n);
    bar.classList.toggle('active', n > 0);
}

export const equiposBulk = {
    isSelected(id) { return _selected.has(String(id)); },
    selectedIds() { return [...Array.from(_selected.keys()).map(s => parseInt(s, 10))]; },
    selectedCount() { return _selected.size; },

    toggle(id, codigo) {
        const key = String(id);
        if (_selected.has(key)) _selected.delete(key);
        else _selected.set(key, { codigo: codigo || '#' + id });
        refreshBar();
    },

    clearAll() {
        _selected.clear();
        refreshBar();
        document.querySelectorAll('.equipo-card.is-selected').forEach(c => c.classList.remove('is-selected'));
    },

    /* ── BULK MOVILIZAR ── */
    async openMovilizar() {
        if (_selected.size === 0) return;
        const frentes = await loadFrentesIfNeeded();
        const sel = document.getElementById('bulkMovDestino');
        if (sel) {
            sel.innerHTML = '<option value="">— Selecciona destino —</option>'
                + frentes.map(f => `<option value="${f.ID_FRENTE}">${escapeHtml(f.NOMBRE_FRENTE)}</option>`).join('');
        }
        document.getElementById('bulkMovCount').textContent = `${_selected.size} equipo(s) seleccionado(s)`;
        document.getElementById('bulkMovError').style.display = 'none';
        document.getElementById('bulkMovOverlay').classList.add('open');
    },

    async submitMovilizar() {
        const dest = document.getElementById('bulkMovDestino').value;
        const err = document.getElementById('bulkMovError');
        const btn = document.getElementById('bulkMovSubmit');
        err.style.display = 'none';
        if (!dest) { err.textContent = 'Selecciona el frente destino.'; err.style.display = 'flex'; return; }
        if (!navigator.onLine) { err.textContent = 'Necesitas conexión.'; err.style.display = 'flex'; return; }
        btn.disabled = true; btn.textContent = 'Movilizando…';
        try {
            const data = await api.post('/equipos/bulk-movilizar', { ids: this.selectedIds(), id_frente_destino: dest });
            try { await sync.syncMisEquipos(); } catch {}
            this.clearAll();
            document.getElementById('bulkMovOverlay').classList.remove('open');
            if (window._equiposModuleRefresh) window._equiposModuleRefresh();
            alert(data.message || 'Movilización completada.');
        } catch (e) {
            err.innerHTML = `<i class="material-icons" style="font-size:18px;">error_outline</i> <span>${escapeHtml(e.message)}</span>`;
            err.style.display = 'flex';
        } finally {
            btn.disabled = false; btn.textContent = 'Movilizar';
        }
    },

    /* ── BULK UBICACIÓN ── */
    openUbicacion() {
        if (_selected.size === 0) return;
        document.getElementById('bulkUbicCount').textContent = `${_selected.size} equipo(s) seleccionado(s)`;
        document.getElementById('bulkUbicInput').value = '';
        document.getElementById('bulkUbicError').style.display = 'none';
        document.getElementById('bulkUbicOverlay').classList.add('open');
    },

    async submitUbicacion() {
        const val = document.getElementById('bulkUbicInput').value.trim();
        const err = document.getElementById('bulkUbicError');
        const btn = document.getElementById('bulkUbicSubmit');
        err.style.display = 'none';
        if (!navigator.onLine) { err.textContent = 'Necesitas conexión.'; err.style.display = 'flex'; return; }
        btn.disabled = true; btn.textContent = 'Guardando…';
        try {
            const data = await api.post('/equipos/bulk-ubicacion', { ids: this.selectedIds(), detalle_ubicacion: val || null });
            try { await sync.syncMisEquipos(); } catch {}
            this.clearAll();
            document.getElementById('bulkUbicOverlay').classList.remove('open');
            if (window._equiposModuleRefresh) window._equiposModuleRefresh();
            alert(data.message || 'Ubicación actualizada.');
        } catch (e) {
            err.innerHTML = `<i class="material-icons" style="font-size:18px;">error_outline</i> <span>${escapeHtml(e.message)}</span>`;
            err.style.display = 'flex';
        } finally {
            btn.disabled = false; btn.textContent = 'Aplicar';
        }
    },

    /* ── BULK ANCLAJE ── */
    openAnclaje() {
        if (_selected.size === 0) return;
        const all = sync.getEquiposLocal();
        const sel = document.getElementById('bulkAnchorHost');
        if (sel) {
            // Solo equipos NO seleccionados pueden ser host
            sel.innerHTML = '<option value="">— Selecciona host —</option>'
                + all.filter(e => !_selected.has(String(e.ID_EQUIPO)))
                    .map(e => `<option value="${e.ID_EQUIPO}">${escapeHtml(e.CODIGO_PATIO || 'S/C')} — ${escapeHtml(e.MARCA || '')} ${escapeHtml(e.MODELO || '')}</option>`).join('');
        }
        document.getElementById('bulkAnchorCount').textContent = `${_selected.size} equipo(s) seleccionado(s)`;
        document.getElementById('bulkAnchorError').style.display = 'none';
        document.getElementById('bulkAnchorOverlay').classList.add('open');
    },

    async submitAnclaje(unanchor = false) {
        const hostId = document.getElementById('bulkAnchorHost').value;
        const err = document.getElementById('bulkAnchorError');
        const btn = document.getElementById('bulkAnchorSubmit');
        const btnUn = document.getElementById('bulkAnchorUnanchor');
        err.style.display = 'none';
        if (!unanchor && !hostId) { err.textContent = 'Selecciona un equipo host.'; err.style.display = 'flex'; return; }
        if (!navigator.onLine) { err.textContent = 'Necesitas conexión.'; err.style.display = 'flex'; return; }
        if (btn) btn.disabled = true;
        if (btnUn) btnUn.disabled = true;
        try {
            const url = unanchor ? '/equipos/bulk-unanchor' : '/equipos/bulk-anchor';
            const body = unanchor ? { ids: this.selectedIds() } : { ids: this.selectedIds(), id_anclaje: hostId };
            const data = await api.post(url, body);
            try { await sync.syncMisEquipos(); } catch {}
            this.clearAll();
            document.getElementById('bulkAnchorOverlay').classList.remove('open');
            if (window._equiposModuleRefresh) window._equiposModuleRefresh();
            alert(data.message || 'Operación completada.');
        } catch (e) {
            err.innerHTML = `<i class="material-icons" style="font-size:18px;">error_outline</i> <span>${escapeHtml(e.message)}</span>`;
            err.style.display = 'flex';
        } finally {
            if (btn) btn.disabled = false;
            if (btnUn) btnUn.disabled = false;
        }
    },

    bindControls() {
        const u = auth.getUser() || {};
        const btn = (id, fn) => {
            const el = document.getElementById(id);
            if (el && !el.dataset.bound) { el.dataset.bound = '1'; el.addEventListener('click', fn); }
        };
        btn('btnBulkMovilizar', () => this.openMovilizar());
        btn('btnBulkUbicacion', () => this.openUbicacion());
        btn('btnBulkAnclaje',   () => this.openAnclaje());
        btn('btnBulkClear',     () => this.clearAll());
        btn('bulkMovClose',     () => document.getElementById('bulkMovOverlay').classList.remove('open'));
        btn('bulkMovSubmit',    () => this.submitMovilizar());
        btn('bulkUbicClose',    () => document.getElementById('bulkUbicOverlay').classList.remove('open'));
        btn('bulkUbicSubmit',   () => this.submitUbicacion());
        btn('bulkAnchorClose',  () => document.getElementById('bulkAnchorOverlay').classList.remove('open'));
        btn('bulkAnchorSubmit', () => this.submitAnclaje(false));
        btn('bulkAnchorUnanchor', () => this.submitAnclaje(true));

        // Cerrar overlays clickeando el fondo
        ['bulkMovOverlay','bulkUbicOverlay','bulkAnchorOverlay'].forEach(id => {
            const o = document.getElementById(id);
            if (o && !o.dataset.bound) {
                o.dataset.bound = '1';
                o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
            }
        });

        // Ocultar botones según permisos
        const movBtn = document.getElementById('btnBulkMovilizar');
        if (movBtn && !u.puede_movilizar) movBtn.style.display = 'none';
        const ubicBtn = document.getElementById('btnBulkUbicacion');
        if (ubicBtn && !u.puede_estado) ubicBtn.style.display = 'none';
        const ancBtn = document.getElementById('btnBulkAnclaje');
        if (ancBtn && !u.puede_estado) ancBtn.style.display = 'none';
    },
};
