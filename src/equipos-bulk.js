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
        const all = sync.getEquiposLocal();
        const seleccionados = all.filter(e => _selected.has(String(e.ID_EQUIPO)));
        const frentes = await loadFrentesIfNeeded();

        // 1. Lista de equipos a movilizar (mini cards numeradas)
        const list = document.getElementById('bulkMovEquiposList');
        if (list) {
            list.innerHTML = seleccionados.map((eq, i) => `
                <div class="bulk-mov-equipo-item">
                    <div class="bulk-mov-equipo-num">${i + 1}</div>
                    <div style="flex:1; min-width:0;">
                        <div class="bulk-mov-equipo-codigo">${escapeHtml(eq.CODIGO_PATIO || 'S/C')}</div>
                        <div class="bulk-mov-equipo-tipo">${escapeHtml((eq.TIPO || '').toUpperCase())}</div>
                    </div>
                </div>
            `).join('');
        }

        const count = document.getElementById('bulkMovCount');
        if (count) count.textContent = `${seleccionados.length} equipo${seleccionados.length === 1 ? '' : 's'}`;

        // 2. Lista de frentes destino (con buscador)
        const renderDestList = (filterText = '') => {
            const filter = filterText.trim().toUpperCase();
            const visibles = frentes.filter(f => !filter || (f.NOMBRE_FRENTE || '').toUpperCase().includes(filter));
            const destList = document.getElementById('bulkMovDestList');
            const hidden = document.getElementById('bulkMovDestino');
            const selected = hidden?.value || '';
            destList.innerHTML = visibles.map(f => `
                <div class="bulk-mov-dest-item${String(f.ID_FRENTE) === selected ? ' selected' : ''}" data-id="${f.ID_FRENTE}">
                    <i class="material-icons">place</i>
                    <span>${escapeHtml(f.NOMBRE_FRENTE)}</span>
                </div>
            `).join('') || '<div style="padding:12px; text-align:center; color:#94a3b8; font-size:13px;">Sin coincidencias</div>';
            destList.querySelectorAll('.bulk-mov-dest-item').forEach(item => {
                item.addEventListener('click', () => {
                    document.getElementById('bulkMovDestino').value = item.getAttribute('data-id');
                    destList.querySelectorAll('.bulk-mov-dest-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                });
            });
        };
        renderDestList('');
        const search = document.getElementById('bulkMovSearch');
        if (search) {
            search.value = '';
            search.oninput = () => renderDestList(search.value);
        }
        document.getElementById('bulkMovDestino').value = '';
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
            window.showToast?.(data.message || 'Movilización completada.', 'success');
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
            window.showToast?.(data.message || 'Ubicación actualizada.', 'success');
        } catch (e) {
            err.innerHTML = `<i class="material-icons" style="font-size:18px;">error_outline</i> <span>${escapeHtml(e.message)}</span>`;
            err.style.display = 'flex';
        } finally {
            btn.disabled = false; btn.textContent = 'Aplicar';
        }
    },

    /* ── BULK DELETE ── */
    async confirmBulkDelete() {
        if (_selected.size === 0) return;
        if (!navigator.onLine) {
            window.showToast?.('Necesitas conexión.', 'error');
            return;
        }
        const n = _selected.size;
        if (!confirm(`¿Eliminar ${n} equipo(s) seleccionado(s)? Esta acción puede revertirse desde la papelera.`)) return;
        try {
            const data = await api.post('/equipos/bulk-delete', { ids: this.selectedIds() });
            try { await sync.syncMisEquipos(); } catch {}
            this.clearAll();
            if (window._equiposModuleRefresh) window._equiposModuleRefresh();
            window.showToast?.(data.message || 'Equipos eliminados.', 'success');
        } catch (e) {
            window.showToast?.(e.message, 'error');
        }
    },

    /* ── BULK ANCLAR ── (botón verde abre modal con select host) */
    openAnclar() {
        if (_selected.size === 0) return;
        const all = sync.getEquiposLocal();
        const sel = document.getElementById('bulkAnchorHost');
        if (sel) {
            sel.innerHTML = '<option value="">— Selecciona host —</option>'
                + all.filter(e => !_selected.has(String(e.ID_EQUIPO)))
                    .map(e => `<option value="${e.ID_EQUIPO}">${escapeHtml(e.CODIGO_PATIO || 'S/C')} — ${escapeHtml(e.MARCA || '')} ${escapeHtml(e.MODELO || '')}</option>`).join('');
        }
        document.getElementById('bulkAnchorCount').textContent = `${_selected.size} equipo(s) seleccionado(s)`;
        document.getElementById('bulkAnchorError').style.display = 'none';
        document.getElementById('bulkAnchorOverlay').classList.add('open');
    },

    /* ── BULK DESANCLAR ── (botón rojo, confirma y ejecuta directamente) */
    async desanclar() {
        if (_selected.size === 0) return;
        if (!navigator.onLine) { window.showToast?.('Necesitas conexión.', 'error'); return; }
        if (!confirm(`¿Desanclar ${_selected.size} equipo(s) seleccionado(s)?`)) return;
        try {
            const data = await api.post('/equipos/bulk-unanchor', { ids: this.selectedIds() });
            try { await sync.syncMisEquipos(); } catch {}
            this.clearAll();
            if (window._equiposModuleRefresh) window._equiposModuleRefresh();
            window.showToast?.(data.message || 'Equipos desanclados.', 'success');
        } catch (e) {
            window.showToast?.(e.message, 'error');
        }
    },

    async submitAnclar() {
        const hostId = document.getElementById('bulkAnchorHost').value;
        const err = document.getElementById('bulkAnchorError');
        const btn = document.getElementById('bulkAnchorSubmit');
        err.style.display = 'none';
        if (!hostId) { err.textContent = 'Selecciona un equipo host.'; err.style.display = 'flex'; return; }
        if (!navigator.onLine) { err.textContent = 'Necesitas conexión.'; err.style.display = 'flex'; return; }
        btn.disabled = true;
        try {
            const data = await api.post('/equipos/bulk-anchor', { ids: this.selectedIds(), id_anclaje: hostId });
            try { await sync.syncMisEquipos(); } catch {}
            this.clearAll();
            document.getElementById('bulkAnchorOverlay').classList.remove('open');
            if (window._equiposModuleRefresh) window._equiposModuleRefresh();
            window.showToast?.(data.message || 'Equipos anclados.', 'success');
        } catch (e) {
            err.innerHTML = `<i class="material-icons" style="font-size:18px;">error_outline</i> <span>${escapeHtml(e.message)}</span>`;
            err.style.display = 'flex';
        } finally {
            btn.disabled = false;
        }
    },

    bindControls() {
        const u = auth.getUser() || {};
        const btn = (id, fn) => {
            const el = document.getElementById(id);
            if (el && !el.dataset.bound) { el.dataset.bound = '1'; el.addEventListener('click', fn); }
        };
        btn('btnBulkMovilizar',  () => this.openMovilizar());
        btn('btnBulkUbicacion',  () => this.openUbicacion());
        btn('btnBulkAnclar',     () => this.openAnclar());
        btn('btnBulkDesanclar',  () => this.desanclar());
        btn('btnBulkClear',      () => this.clearAll());
        btn('bulkMovClose',      () => document.getElementById('bulkMovOverlay').classList.remove('open'));
        btn('bulkMovSubmit',     () => this.submitMovilizar());
        btn('bulkUbicClose',     () => document.getElementById('bulkUbicOverlay').classList.remove('open'));
        btn('bulkUbicSubmit',    () => this.submitUbicacion());
        btn('bulkAnchorClose',   () => document.getElementById('bulkAnchorOverlay').classList.remove('open'));
        btn('bulkAnchorSubmit',  () => this.submitAnclar());

        // Cerrar overlays clickeando el fondo
        ['bulkMovOverlay','bulkUbicOverlay','bulkAnchorOverlay'].forEach(id => {
            const o = document.getElementById(id);
            if (o && !o.dataset.bound) {
                o.dataset.bound = '1';
                o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
            }
        });

        // Ocultar botones según permisos (mismo patrón que la web)
        const movBtn  = document.getElementById('btnBulkMovilizar');
        if (movBtn && !u.puede_movilizar) movBtn.style.display = 'none';
        const ubicBtn = document.getElementById('btnBulkUbicacion');
        if (ubicBtn && !u.puede_estado) ubicBtn.style.display = 'none';
        const anclar    = document.getElementById('btnBulkAnclar');
        const desanclar = document.getElementById('btnBulkDesanclar');
        if (anclar && !u.puede_estado)    anclar.style.display = 'none';
        if (desanclar && !u.puede_estado) desanclar.style.display = 'none';
        // Por defecto Desanclar oculto, se muestra solo si seleccionas equipos anclados
        // (placeholder: lógica de detección automática puede agregarse en próxima fase).
    },

    /** Para que el menú "Acciones" llame al delete. */
    bulkDelete() { this.confirmBulkDelete(); },
};
