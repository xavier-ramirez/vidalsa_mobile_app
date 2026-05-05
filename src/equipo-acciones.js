/*
 * Acciones desde el modal CASILLERO:
 *  - Cambiar estado operativo
 *  - Reportar falla
 *  (Movilizar reusa movilizacion-form.js con equipo prellenado)
 */

import { api } from './api.js';
import { sync } from './sync.js';
import { escapeHtml } from './util.js';

let _equipoCtx = null; // {ID_EQUIPO, CODIGO_PATIO}

export const equipoAcciones = {
    setContext(equipo) { _equipoCtx = equipo; },

    /* ── Cambiar estado ── */
    openChangeEstado() {
        if (!_equipoCtx) return;
        document.getElementById('estadoEquipoLabel').textContent = _equipoCtx.CODIGO_PATIO || ('#' + _equipoCtx.ID_EQUIPO);
        document.getElementById('estadoSelect').value = '';
        document.getElementById('estadoError').style.display = 'none';
        document.getElementById('estadoOverlay').classList.add('open');
    },

    closeChangeEstado() {
        document.getElementById('estadoOverlay').classList.remove('open');
    },

    async submitChangeEstado() {
        const val = document.getElementById('estadoSelect').value;
        const err = document.getElementById('estadoError');
        const btn = document.getElementById('estadoSubmit');
        err.style.display = 'none';
        if (!val) { err.textContent = 'Selecciona un estado.'; err.style.display = 'flex'; return; }
        if (!navigator.onLine) { err.textContent = 'Necesitas conexión.'; err.style.display = 'flex'; return; }
        btn.disabled = true; btn.textContent = 'Guardando…';
        try {
            await api.patch(`/equipos/${_equipoCtx.ID_EQUIPO}/estado`, { estado: val });
            try { await sync.syncMisEquipos(); } catch {}
            this.closeChangeEstado();
            if (window._equiposModuleRefresh) window._equiposModuleRefresh();
            alert('Estado actualizado.');
        } catch (e) {
            err.innerHTML = `<i class="material-icons" style="font-size:18px;">error_outline</i> <span>${escapeHtml(e.message)}</span>`;
            err.style.display = 'flex';
        } finally {
            btn.disabled = false; btn.textContent = 'Cambiar estado';
        }
    },

    /* ── Reportar falla ── */
    openReportarFalla() {
        if (!_equipoCtx) return;
        document.getElementById('fallaEquipoLabel').textContent = _equipoCtx.CODIGO_PATIO || ('#' + _equipoCtx.ID_EQUIPO);
        ['fallaDescripcion','fallaSistema','fallaPrioridad','fallaTipoInterv'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = id === 'fallaPrioridad' ? 'MEDIA' : (id === 'fallaTipoInterv' ? 'CORRECTIVA' : '');
        });
        document.getElementById('fallaError').style.display = 'none';
        document.getElementById('fallaOverlay').classList.add('open');
    },

    closeReportarFalla() {
        document.getElementById('fallaOverlay').classList.remove('open');
    },

    async submitReportarFalla() {
        const desc = document.getElementById('fallaDescripcion').value.trim();
        const sis  = document.getElementById('fallaSistema').value.trim();
        const pri  = document.getElementById('fallaPrioridad').value;
        const tipo = document.getElementById('fallaTipoInterv').value;
        const err  = document.getElementById('fallaError');
        const btn  = document.getElementById('fallaSubmit');
        err.style.display = 'none';

        if (!desc || desc.length < 5) { err.textContent = 'Describe la falla (mín. 5 caracteres).'; err.style.display = 'flex'; return; }
        if (!navigator.onLine) { err.textContent = 'Necesitas conexión.'; err.style.display = 'flex'; return; }

        btn.disabled = true; btn.textContent = 'Reportando…';
        try {
            const data = await api.post(`/equipos/${_equipoCtx.ID_EQUIPO}/falla`, {
                descripcion: desc,
                sistema_afectado: sis || null,
                prioridad: pri || 'MEDIA',
                tipo_intervencion: tipo || 'CORRECTIVA',
            });
            this.closeReportarFalla();
            alert(`Falla reportada: ${data.CODIGO_REPORTE || 'OK'}.`);
        } catch (e) {
            err.innerHTML = `<i class="material-icons" style="font-size:18px;">error_outline</i> <span>${escapeHtml(e.message)}</span>`;
            err.style.display = 'flex';
        } finally {
            btn.disabled = false; btn.textContent = 'Reportar falla';
        }
    },

    /* ── Lista de responsables ── */
    async loadResponsables(equipoId) {
        const container = document.getElementById('respList');
        if (!container) return;
        if (!navigator.onLine) {
            container.innerHTML = '<div class="resp-empty">Sin conexión — no se pueden cargar responsables.</div>';
            return;
        }
        container.innerHTML = '<div class="resp-empty">Cargando…</div>';
        try {
            const list = await api.get(`/equipos/${equipoId}/responsables`);
            if (!Array.isArray(list) || list.length === 0) {
                container.innerHTML = '<div class="resp-empty">Sin responsables asignados.</div>';
                return;
            }
            container.innerHTML = list.map(r => {
                const fecha = r.FECHA_ASIGNACION ? new Date(r.FECHA_ASIGNACION).toLocaleDateString('es-ES') : '—';
                return `
                    <div class="resp-item">
                        <i class="material-icons">person</i>
                        <div class="resp-info">
                            <strong>${escapeHtml(r.PERSONA_ASIGNADA || 'Sin nombre')}</strong>
                            <span>CI: ${escapeHtml(r.CEDULA_RESPONSABLE || '—')} · ${escapeHtml(fecha)}</span>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            container.innerHTML = `<div class="resp-empty error">Error: ${escapeHtml(e.message)}</div>`;
        }
    },

    bindControls() {
        // Estado modal
        const estadoClose = document.getElementById('estadoClose');
        const estadoSubmit = document.getElementById('estadoSubmit');
        const estadoOverlay = document.getElementById('estadoOverlay');
        if (estadoClose && !estadoClose.dataset.bound)   { estadoClose.dataset.bound = '1';  estadoClose.addEventListener('click', () => this.closeChangeEstado()); }
        if (estadoSubmit && !estadoSubmit.dataset.bound) { estadoSubmit.dataset.bound = '1'; estadoSubmit.addEventListener('click', () => this.submitChangeEstado()); }
        if (estadoOverlay && !estadoOverlay.dataset.bound) {
            estadoOverlay.dataset.bound = '1';
            estadoOverlay.addEventListener('click', e => { if (e.target === estadoOverlay) this.closeChangeEstado(); });
        }
        // Falla modal
        const fallaClose = document.getElementById('fallaClose');
        const fallaSubmit = document.getElementById('fallaSubmit');
        const fallaOverlay = document.getElementById('fallaOverlay');
        if (fallaClose && !fallaClose.dataset.bound)   { fallaClose.dataset.bound = '1';  fallaClose.addEventListener('click', () => this.closeReportarFalla()); }
        if (fallaSubmit && !fallaSubmit.dataset.bound) { fallaSubmit.dataset.bound = '1'; fallaSubmit.addEventListener('click', () => this.submitReportarFalla()); }
        if (fallaOverlay && !fallaOverlay.dataset.bound) {
            fallaOverlay.dataset.bound = '1';
            fallaOverlay.addEventListener('click', e => { if (e.target === fallaOverlay) this.closeReportarFalla(); });
        }
    },
};
