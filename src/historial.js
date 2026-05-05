/*
 * Historial de movilizaciones — vista global con filtros + scroll infinito.
 * Endpoint GET /api/mobile/movilizaciones (Sanctum) con filtros opcionales.
 */

import { api } from './api.js';
import { sync } from './sync.js';
import { escapeHtml } from './util.js';

let _frentesCache = null;
let _state = { offset: 0, hasMore: false, loading: false };

function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2,'0');
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${dd} ${meses[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

async function loadFrentesIfNeeded() {
    if (_frentesCache !== null) return _frentesCache;
    try { _frentesCache = await api.get('/frentes'); }
    catch { _frentesCache = []; }
    return _frentesCache;
}

function buildFilterParams() {
    const get = id => (document.getElementById(id)?.value || '').trim();
    const params = new URLSearchParams();
    const id_equipo         = get('histFiltroEquipo');
    const id_frente_origen  = get('histFiltroOrigen');
    const id_frente_destino = get('histFiltroDestino');
    const tipo_movimiento   = get('histFiltroTipo');
    const codigo            = get('histFiltroCodigo');
    const fecha_desde       = get('histFiltroDesde');
    const fecha_hasta       = get('histFiltroHasta');
    if (id_equipo)         params.set('id_equipo', id_equipo);
    if (id_frente_origen)  params.set('id_frente_origen', id_frente_origen);
    if (id_frente_destino) params.set('id_frente_destino', id_frente_destino);
    if (tipo_movimiento)   params.set('tipo_movimiento', tipo_movimiento);
    if (codigo)            params.set('codigo', codigo);
    if (fecha_desde)       params.set('fecha_desde', fecha_desde);
    if (fecha_hasta)       params.set('fecha_hasta', fecha_hasta);
    return params;
}

function renderCard(m) {
    const tipoClass = (m.TIPO_MOVIMIENTO || '').toUpperCase().includes('RECEPCION') ? 'tipo-recepcion' : 'tipo-despacho';
    return `
        <div class="hist-card">
            <div class="hist-head">
                <span class="hist-codigo">${escapeHtml(m.CODIGO_CONTROL || 'R.D.')}</span>
                <span class="hist-tipo ${tipoClass}">${escapeHtml(m.TIPO_MOVIMIENTO || '—')}</span>
            </div>
            ${m.equipo ? `
                <div class="hist-equipo">
                    <i class="material-icons">agriculture</i>
                    <strong>${escapeHtml(m.equipo.CODIGO_PATIO || 'S/C')}</strong>
                    <span style="color:#64748b;">${escapeHtml(m.equipo.MARCA || '')} ${escapeHtml(m.equipo.MODELO || '')}</span>
                </div>` : ''}
            <div class="hist-route">
                <span><i class="material-icons">place</i> ${escapeHtml(m.frente_origen?.NOMBRE_FRENTE || '—')}</span>
                <i class="material-icons" style="color:#0067b1;">arrow_forward</i>
                <span><i class="material-icons">place</i> ${escapeHtml(m.frente_destino?.NOMBRE_FRENTE || '—')}</span>
            </div>
            <div class="hist-meta">
                <span><i class="material-icons">schedule</i> ${formatDate(m.FECHA_DESPACHO)}</span>
                ${m.DETALLE_UBICACION ? `<span><i class="material-icons">explore</i> ${escapeHtml(m.DETALLE_UBICACION)}</span>` : ''}
            </div>
            ${m.USUARIO_REGISTRO ? `<div class="hist-user"><i class="material-icons">person</i> ${escapeHtml(m.USUARIO_REGISTRO)}</div>` : ''}
        </div>
    `;
}

export const historial = {
    async initView() {
        await this.populateFrentesSelects();
        await this.populateEquiposSelect();
        await this.loadList({ append: false });
    },

    async populateFrentesSelects() {
        const frentes = await loadFrentesIfNeeded();
        const opts = '<option value="">— Todos —</option>'
            + frentes.map(f => `<option value="${f.ID_FRENTE}">${escapeHtml(f.NOMBRE_FRENTE)}</option>`).join('');
        ['histFiltroOrigen', 'histFiltroDestino'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = opts;
        });
    },

    async populateEquiposSelect() {
        const equipos = sync.getEquiposLocal();
        const sel = document.getElementById('histFiltroEquipo');
        if (!sel) return;
        sel.innerHTML = '<option value="">— Todos los equipos —</option>'
            + equipos.map(e => `<option value="${e.ID_EQUIPO}">${escapeHtml(e.CODIGO_PATIO || 'S/C')} — ${escapeHtml(e.MARCA || '')} ${escapeHtml(e.MODELO || '')}</option>`).join('');
    },

    async loadList({ append = false } = {}) {
        const container = document.getElementById('historialList');
        if (!container) return;
        if (!navigator.onLine) {
            container.innerHTML = '<div class="empty-state"><i class="material-icons">cloud_off</i><p>Necesitas conexión para ver el historial.</p></div>';
            return;
        }

        if (append) {
            if (_state.loading || !_state.hasMore) return;
        } else {
            _state = { offset: 0, hasMore: false, loading: false };
            container.innerHTML = '<div class="loading">Cargando movilizaciones…</div>';
        }
        _state.loading = true;

        const params = buildFilterParams();
        if (append) params.set('offset', String(_state.offset));

        try {
            const data = await api.get('/movilizaciones?' + params.toString());
            const items = Array.isArray(data?.items) ? data.items : [];

            if (!append) {
                if (items.length === 0) {
                    container.innerHTML = '<div class="empty-state"><i class="material-icons">history</i><p>Sin movilizaciones para los filtros seleccionados.</p></div>';
                    _state.hasMore = false;
                    return;
                }
                container.innerHTML = items.map(renderCard).join('');
            } else {
                container.insertAdjacentHTML('beforeend', items.map(renderCard).join(''));
            }

            _state.offset = data.nextOffset || 0;
            _state.hasMore = !!data.hasMore;

            // Contador
            const counter = document.getElementById('historialCounter');
            if (counter && !append) counter.textContent = `${data.totalFound || items.length} resultado(s)`;
        } catch (err) {
            if (!append) {
                container.innerHTML = `<div class="empty-state error"><i class="material-icons">error_outline</i><p>${escapeHtml(err.message)}</p></div>`;
            }
        } finally {
            _state.loading = false;
        }
    },

    bindControls() {
        const apply = document.getElementById('histAplicarFiltros');
        if (apply && !apply.dataset.bound) {
            apply.dataset.bound = '1';
            apply.addEventListener('click', () => this.loadList({ append: false }));
        }
        const clear = document.getElementById('histLimpiarFiltros');
        if (clear && !clear.dataset.bound) {
            clear.dataset.bound = '1';
            clear.addEventListener('click', () => {
                ['histFiltroEquipo','histFiltroOrigen','histFiltroDestino','histFiltroTipo','histFiltroCodigo','histFiltroDesde','histFiltroHasta'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                this.loadList({ append: false });
            });
        }
        const toggle = document.getElementById('histToggleFiltros');
        if (toggle && !toggle.dataset.bound) {
            toggle.dataset.bound = '1';
            toggle.addEventListener('click', () => {
                document.getElementById('histFiltrosPanel')?.classList.toggle('open');
            });
        }
        // Scroll infinito
        const sentinel = document.getElementById('histScrollSentinel');
        if (sentinel && !sentinel.dataset.bound && typeof IntersectionObserver !== 'undefined') {
            sentinel.dataset.bound = '1';
            const obs = new IntersectionObserver((entries) => {
                for (const e of entries) {
                    if (e.isIntersecting && _state.hasMore && !_state.loading) {
                        this.loadList({ append: true });
                    }
                }
            }, { rootMargin: '300px 0px' });
            obs.observe(sentinel);
        }
    },
};
