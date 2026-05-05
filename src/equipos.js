/*
 * Módulo Equipos: lista filtrable + modal de detalles tipo CASILLERO.
 * El diseño imita el de la web (header azul oscuro + acordeones + botones PDF).
 */

import { api } from './api.js';
import { auth } from './auth.js';
import { sync } from './sync.js';
import { equiposForm } from './equipos-form.js';
import { pdfViewer } from './pdf-viewer.js';
import { equipoAcciones } from './equipo-acciones.js';
import { movilizacionForm } from './movilizacion-form.js';
import { escapeHtml } from './util.js';

const FILTER_IDS = ['filtroFrente','filtroTipo','filtroEstado','filtroCategoria','filtroAnio','filtroDocPropiedad','filtroDocPoliza','filtroDocRotc','filtroDocRacda'];

function getActiveFilters() {
    const get = id => (document.getElementById(id)?.value || '').trim();
    return {
        frente:    get('filtroFrente'),
        tipo:      get('filtroTipo'),
        estado:    get('filtroEstado'),
        categoria: get('filtroCategoria'),
        anio:      get('filtroAnio'),
        docPropiedad: get('filtroDocPropiedad'),
        docPoliza:    get('filtroDocPoliza'),
        docRotc:      get('filtroDocRotc'),
        docRacda:     get('filtroDocRacda'),
    };
}

function applyFilters(list, filters, searchText) {
    const search = (searchText || '').trim().toUpperCase();
    return list.filter(e => {
        if (filters.frente    && String(e.ID_FRENTE_ACTUAL || '') !== filters.frente) return false;
        if (filters.tipo      && (e.TIPO || '') !== filters.tipo) return false;
        if (filters.estado    && (e.ESTADO_OPERATIVO || '') !== filters.estado) return false;
        if (filters.categoria && (e.CATEGORIA_FLOTA  || '') !== filters.categoria) return false;
        if (filters.anio      && String(e.ANIO || '') !== filters.anio) return false;
        if (filters.docPropiedad === '1' && !e.docs?.propiedad?.has_file) return false;
        if (filters.docPropiedad === '0' &&  e.docs?.propiedad?.has_file) return false;
        if (filters.docPoliza    === '1' && !e.docs?.poliza?.has_file)    return false;
        if (filters.docPoliza    === '0' &&  e.docs?.poliza?.has_file)    return false;
        if (filters.docRotc      === '1' && !e.docs?.rotc?.has_file)      return false;
        if (filters.docRotc      === '0' &&  e.docs?.rotc?.has_file)      return false;
        if (filters.docRacda     === '1' && !e.docs?.racda?.has_file)     return false;
        if (filters.docRacda     === '0' &&  e.docs?.racda?.has_file)     return false;
        if (search) {
            const haystack = [e.CODIGO_PATIO, e.MARCA, e.MODELO, e.SERIAL_CHASIS, e.PLACA, e.FRENTE_ACTUAL]
                .filter(Boolean).join(' ').toUpperCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });
}

export const equipos = {
    /** Pobla los selects de filtros con valores únicos del cache local. */
    populateFilterSelects() {
        const all = sync.getEquiposLocal();
        const uniqVals = (key) => [...new Set(all.map(e => e[key]).filter(v => v !== null && v !== undefined && v !== ''))].sort();
        const setOpts = (id, vals, label) => {
            const el = document.getElementById(id);
            if (!el) return;
            const current = el.value;
            el.innerHTML = `<option value="">— ${label} —</option>` +
                vals.map(v => `<option value="${escapeHtml(String(v))}">${escapeHtml(String(v))}</option>`).join('');
            if (current && vals.map(String).includes(current)) el.value = current;
        };
        // Frentes: usa pares ID/Nombre
        const frentesMap = {};
        all.forEach(e => {
            if (e.ID_FRENTE_ACTUAL) frentesMap[e.ID_FRENTE_ACTUAL] = e.FRENTE_ACTUAL || ('#' + e.ID_FRENTE_ACTUAL);
        });
        const frenteSel = document.getElementById('filtroFrente');
        if (frenteSel) {
            const cur = frenteSel.value;
            frenteSel.innerHTML = '<option value="">— Todos los frentes —</option>'
                + Object.entries(frentesMap).sort((a,b) => a[1].localeCompare(b[1]))
                    .map(([id, nom]) => `<option value="${id}">${escapeHtml(nom)}</option>`).join('');
            if (cur) frenteSel.value = cur;
        }
        setOpts('filtroTipo',      uniqVals('TIPO'),            'Todos los tipos');
        setOpts('filtroEstado',    uniqVals('ESTADO_OPERATIVO'),'Todos los estados');
        setOpts('filtroCategoria', uniqVals('CATEGORIA_FLOTA'), 'Todas las categorías');
        setOpts('filtroAnio',      uniqVals('ANIO').reverse(),  'Todos los años');
    },

    /** Renderiza KPIs (Total / Operativos / Inoperativos / Mantenimiento / Desincorporados). */
    renderKPIs(visibleList = null) {
        const list = visibleList || sync.getEquiposLocal();
        const counts = { total: list.length, op: 0, ino: 0, mant: 0, des: 0 };
        list.forEach(e => {
            const s = (e.ESTADO_OPERATIVO || '').toUpperCase();
            if (s === 'OPERATIVO')        counts.op++;
            else if (s === 'INOPERATIVO') counts.ino++;
            else if (s.includes('MANTEN')) counts.mant++;
            else if (s === 'DESINCORPORADO') counts.des++;
        });
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
        set('kpiTotal', counts.total);
        set('kpiOperativos', counts.op);
        set('kpiInoperativos', counts.ino);
        set('kpiMantenimiento', counts.mant);
        set('kpiDesincorporados', counts.des);
    },

    /** Renderiza la lista de equipos (cards) en el contenedor #equiposListContainer. */
    renderList(filterText = '') {
        const container = document.getElementById('equiposListContainer');
        if (!container) return;
        const all = sync.getEquiposLocal();
        const filters = getActiveFilters();
        const list = applyFilters(all, filters, filterText);
        this.renderKPIs(list);

        if (all.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="material-icons">cloud_off</i>
                    <p>No hay equipos descargados.<br>Ve a <strong>Sincronización</strong> y descarga la flota.</p>
                </div>
            `;
            return;
        }

        if (list.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="material-icons">search_off</i>
                    <p>Sin coincidencias para "<strong>${escapeHtml(filterText)}</strong>".</p>
                </div>
            `;
            return;
        }

        container.innerHTML = list.map(eq => {
            const estado = (eq.ESTADO_OPERATIVO || '').toUpperCase();
            const badgeClass = estado === 'OPERATIVO' ? 'badge-ok'
                : estado === 'INOPERATIVO' ? 'badge-bad' : 'badge-warn';
            return `
                <div class="equipo-card" data-id="${eq.ID_EQUIPO}">
                    <div class="equipo-card-head">
                        <span class="equipo-codigo">${escapeHtml(eq.CODIGO_PATIO || 'S/C')}</span>
                        <span class="badge-status ${badgeClass}">${escapeHtml(estado || '—')}</span>
                    </div>
                    <div class="equipo-card-body">
                        <div class="equipo-modelo">${escapeHtml(eq.MARCA || '')} ${escapeHtml(eq.MODELO || '')}</div>
                        <div class="equipo-meta">
                            <span><i class="material-icons">badge</i> ${escapeHtml(eq.PLACA || 'S/P')}</span>
                            <span><i class="material-icons">place</i> ${escapeHtml(eq.FRENTE_ACTUAL || 'Sin frente')}</span>
                        </div>
                    </div>
                    <button type="button" class="equipo-card-eye" data-eye-id="${eq.ID_EQUIPO}" title="Ver detalles" aria-label="Ver detalles">
                        <i class="material-icons">visibility</i>
                    </button>
                </div>
            `;
        }).join('');

        // Bind: solo el ícono de OJO abre el modal (mismo patrón que la web).
        container.querySelectorAll('.equipo-card-eye').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openDetailModal(btn.getAttribute('data-eye-id'));
            });
        });
    },

    bindSearch() {
        const input = document.getElementById('equiposSearch');
        if (input && !input.dataset.bound) {
            input.dataset.bound = '1';
            input.addEventListener('input', () => this.renderList(input.value));
        }
        // Toggle del panel de filtros
        const toggleBtn = document.getElementById('equiposFiltrosToggle');
        if (toggleBtn && !toggleBtn.dataset.bound) {
            toggleBtn.dataset.bound = '1';
            toggleBtn.addEventListener('click', () => {
                document.getElementById('equiposFiltrosPanel')?.classList.toggle('open');
            });
        }
        // Cualquier change en filtros → re-render
        FILTER_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.dataset.bound) {
                el.dataset.bound = '1';
                el.addEventListener('change', () => this.renderList(input?.value || ''));
            }
        });
        // Botón "Limpiar filtros"
        const clearBtn = document.getElementById('equiposFiltrosClear');
        if (clearBtn && !clearBtn.dataset.bound) {
            clearBtn.dataset.bound = '1';
            clearBtn.addEventListener('click', () => {
                FILTER_IDS.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
                if (input) input.value = '';
                this.renderList('');
            });
        }
    },

    async openDetailModal(id) {
        const overlay = document.getElementById('equipoModal');
        const body = document.getElementById('equipoModalBody');
        const titleSub = document.getElementById('equipoModalSub');
        if (!overlay || !body) return;

        // Datos básicos desde cache local (instantáneo)
        const local = sync.getEquipoLocal(id);
        if (local) {
            titleSub.textContent = `Placa: ${local.PLACA || 'S/P'} · Serial: ${local.SERIAL_CHASIS || 'S/S'}`;
        }

        body.innerHTML = '<div class="loading">Cargando detalles…</div>';
        overlay.classList.add('open');

        try {
            // Trae detalle completo (incluye DOC_PROPIEDAD/DOC_POLIZA/DOC_ROTC/DOC_RACDA)
            const detail = navigator.onLine
                ? await api.get(`/equipos/${id}`)
                : null;
            const data = detail || local;

            if (!data) {
                body.innerHTML = '<div class="loading">No se pudo cargar el detalle.</div>';
                return;
            }

            titleSub.textContent = `Placa: ${data.PLACA || 'S/P'} · Serial: ${data.SERIAL_CHASIS || 'S/S'}`;
            body.innerHTML = this.renderDetailHTML(data);

            // Bind acordeones
            body.querySelectorAll('.accordion-header').forEach(h => {
                h.addEventListener('click', () => h.parentElement.classList.toggle('open'));
            });

            // Set context para las acciones (movilizar/estado/falla)
            equipoAcciones.setContext({ ID_EQUIPO: data.ID_EQUIPO, CODIGO_PATIO: data.CODIGO_PATIO, ID_FRENTE_ACTUAL: data.ID_FRENTE_ACTUAL });

            // Bind botones de acción del modal
            const editBtn = body.querySelector('#btnEditEquipoFromModal');
            if (editBtn) editBtn.addEventListener('click', () => {
                this.closeDetailModal();
                equiposForm.openEdit(editBtn.getAttribute('data-equipo-id'));
            });
            const movBtn = body.querySelector('#btnMovilizarFromModal');
            if (movBtn) movBtn.addEventListener('click', () => {
                this.closeDetailModal();
                movilizacionForm.open();
                // Pre-seleccionar el equipo en el form
                setTimeout(() => {
                    const sel = document.getElementById('movEquipo');
                    if (sel) sel.value = String(data.ID_EQUIPO);
                }, 50);
            });
            const estBtn = body.querySelector('#btnCambiarEstadoFromModal');
            if (estBtn) estBtn.addEventListener('click', () => equipoAcciones.openChangeEstado());
            const failBtn = body.querySelector('#btnReportarFallaFromModal');
            if (failBtn) failBtn.addEventListener('click', () => equipoAcciones.openReportarFalla());

            // Cargar lista de responsables (async, llena acordeón)
            equipoAcciones.loadResponsables(data.ID_EQUIPO);

            // Bind botones PDF (visor embebido)
            body.querySelectorAll('.pdf-btn[data-pdf-tipo]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const tipo = btn.getAttribute('data-pdf-tipo');
                    const label = btn.getAttribute('data-pdf-label') || 'Documento';
                    const codigo = data.CODIGO_PATIO || data.PLACA || data.ID_EQUIPO;
                    pdfViewer.openFromApi(`${label} – ${codigo}`, `/equipos/${data.ID_EQUIPO}/pdf/${tipo}`);
                });
            });
        } catch (err) {
            body.innerHTML = `<div class="loading error">Error: ${escapeHtml(err.message)}</div>`;
        }
    },

    closeDetailModal() {
        const overlay = document.getElementById('equipoModal');
        if (overlay) overlay.classList.remove('open');
    },

    renderDetailHTML(d) {
        const u = auth.getUser() || {};
        const docRow = (label, valor, hasFile, tipo) => `
            <div class="detalle-row">
                <span class="detalle-label">${escapeHtml(label)}</span>
                <span class="detalle-valor">
                    <span>${escapeHtml(valor || '—')}</span>
                    ${hasFile ? `<button type="button" class="pdf-btn" data-pdf-tipo="${tipo}" data-pdf-label="${escapeHtml(label)}" title="Ver PDF"><i class="material-icons">picture_as_pdf</i></button>` : ''}
                </span>
            </div>
        `;

        const infoRow = (label, valor) => `
            <div class="detalle-row">
                <span class="detalle-label">${escapeHtml(label)}</span>
                <span class="detalle-valor">${escapeHtml(valor || '—')}</span>
            </div>
        `;

        return `
            <div class="accordion-section open">
                <div class="accordion-header">
                    <span><i class="material-icons">description</i> Documentación Legal y Soportes</span>
                    <i class="material-icons accordion-chev">expand_more</i>
                </div>
                <div class="accordion-body">
                    ${infoRow('Titular del Registro', d.PROPIETARIO)}
                    ${infoRow('Placa Identificadora', d.PLACA)}
                    ${docRow('Nro. Documento',  d.NRO_DOCUMENTO, !!d.DOC_PROPIEDAD, 'propiedad')}
                    ${docRow('Póliza de Seguro', d.DOC_POLIZA ? 'Cargado' : 'N/A', !!d.DOC_POLIZA, 'poliza')}
                    ${docRow('Registro ROTC',    d.DOC_ROTC   ? 'Cargado' : 'N/A', !!d.DOC_ROTC,   'rotc')}
                    ${docRow('Registro RACDA',   d.DOC_RACDA  ? 'Cargado' : 'N/A', !!d.DOC_RACDA,  'racda')}
                </div>
            </div>

            <div class="modal-actions">
                ${u.puede_editar ? `
                    <button type="button" class="modal-action-btn" id="btnEditEquipoFromModal" data-equipo-id="${d.ID_EQUIPO}" title="Editar datos">
                        <i class="material-icons">edit</i> Editar
                    </button>` : ''}
                ${u.puede_movilizar ? `
                    <button type="button" class="modal-action-btn" id="btnMovilizarFromModal" title="Movilizar">
                        <i class="material-icons">local_shipping</i> Movilizar
                    </button>` : ''}
                ${u.puede_estado ? `
                    <button type="button" class="modal-action-btn modal-action-warn" id="btnCambiarEstadoFromModal" title="Cambiar estado">
                        <i class="material-icons">swap_horiz</i> Estado
                    </button>` : ''}
                <button type="button" class="modal-action-btn modal-action-danger" id="btnReportarFallaFromModal" title="Reportar falla">
                    <i class="material-icons">report_problem</i> Falla
                </button>
            </div>

            <div class="accordion-section">
                <div class="accordion-header">
                    <span><i class="material-icons">info</i> Información General</span>
                    <i class="material-icons accordion-chev">expand_more</i>
                </div>
                <div class="accordion-body">
                    ${infoRow('Tipo',            d.TIPO)}
                    ${infoRow('Marca',           d.MARCA)}
                    ${infoRow('Modelo',          d.MODELO)}
                    ${infoRow('Año',             d.ANIO)}
                    ${infoRow('Categoría Flota', d.CATEGORIA_FLOTA)}
                    ${infoRow('Frente Actual',   d.FRENTE_ACTUAL || 'Sin asignar')}
                    ${infoRow('Detalle Ubic.',   d.DETALLE_UBICACION)}
                    ${infoRow('Código',          d.CODIGO_PATIO)}
                    ${infoRow('Serial Chasis',   d.SERIAL_CHASIS)}
                    ${infoRow('Serial Motor',    d.SERIAL_MOTOR)}
                    ${infoRow('Nº Etiqueta',     d.NUMERO_ETIQUETA)}
                    ${infoRow('Estado',          d.ESTADO_OPERATIVO)}
                </div>
            </div>

            <div class="accordion-section">
                <div class="accordion-header">
                    <span><i class="material-icons">people</i> Responsables</span>
                    <i class="material-icons accordion-chev">expand_more</i>
                </div>
                <div class="accordion-body">
                    <div id="respList" class="resp-list"><div class="resp-empty">Cargando…</div></div>
                </div>
            </div>
        `;
    },

    bindModalClose() {
        const overlay = document.getElementById('equipoModal');
        const btn = document.getElementById('equipoModalClose');
        if (btn && !btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => this.closeDetailModal());
        }
        if (overlay && !overlay.dataset.bound) {
            overlay.dataset.bound = '1';
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.closeDetailModal();
            });
        }
    },
};
