/*
 * Historial de movilizaciones por equipo.
 * Llama GET /api/mobile/equipos/{id}/movilizaciones (Sanctum).
 */

import { api } from './api.js';
import { sync } from './sync.js';
import { escapeHtml } from './util.js';

function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2,'0');
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${dd} ${meses[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export const historial = {
    /** Renderiza la vista de selección de equipo + lista de movilizaciones. */
    renderEquipoSelector() {
        const sel = document.getElementById('historialEquipoSelect');
        if (!sel) return;
        const equipos = sync.getEquiposLocal();
        sel.innerHTML = '<option value="">— Selecciona un equipo —</option>'
            + equipos.map(e => `<option value="${e.ID_EQUIPO}">${escapeHtml(e.CODIGO_PATIO || 'S/C')} — ${escapeHtml(e.MARCA || '')} ${escapeHtml(e.MODELO || '')}</option>`).join('');

        if (!sel.dataset.bound) {
            sel.dataset.bound = '1';
            sel.addEventListener('change', () => {
                if (sel.value) this.loadByEquipo(sel.value);
                else document.getElementById('historialList').innerHTML = '';
            });
        }
    },

    async loadByEquipo(id) {
        const container = document.getElementById('historialList');
        if (!container) return;
        container.innerHTML = '<div class="loading">Cargando movilizaciones…</div>';

        if (!navigator.onLine) {
            container.innerHTML = '<div class="empty-state"><i class="material-icons">cloud_off</i><p>Necesitas conexión para ver el historial.</p></div>';
            return;
        }

        try {
            const movs = await api.get(`/equipos/${id}/movilizaciones`);
            if (!Array.isArray(movs) || movs.length === 0) {
                container.innerHTML = '<div class="empty-state"><i class="material-icons">history</i><p>Sin movilizaciones registradas.</p></div>';
                return;
            }
            container.innerHTML = movs.map(m => `
                <div class="hist-card">
                    <div class="hist-head">
                        <span class="hist-codigo">${escapeHtml(m.CODIGO_CONTROL || 'R.D.')}</span>
                        <span class="hist-tipo">${escapeHtml(m.TIPO_MOVIMIENTO || '—')}</span>
                    </div>
                    <div class="hist-route">
                        <span><i class="material-icons">place</i> ${escapeHtml(m.NOMBRE_ORIGEN || '—')}</span>
                        <i class="material-icons" style="color:#0067b1;">arrow_forward</i>
                        <span><i class="material-icons">place</i> ${escapeHtml(m.NOMBRE_DESTINO || '—')}</span>
                    </div>
                    <div class="hist-meta">
                        <span><i class="material-icons">schedule</i> ${formatDate(m.FECHA_DESPACHO)}</span>
                        ${m.DETALLE_UBICACION ? `<span><i class="material-icons">explore</i> ${escapeHtml(m.DETALLE_UBICACION)}</span>` : ''}
                    </div>
                    ${m.USUARIO_REGISTRO ? `<div class="hist-user"><i class="material-icons">person</i> ${escapeHtml(m.USUARIO_REGISTRO)}</div>` : ''}
                </div>
            `).join('');
        } catch (err) {
            container.innerHTML = `<div class="empty-state error"><i class="material-icons">error_outline</i><p>${escapeHtml(err.message)}</p></div>`;
        }
    },
};
