/*
 * Módulo Equipos: lista filtrable + modal de detalles tipo CASILLERO.
 * El diseño imita el de la web (header azul oscuro + acordeones + botones PDF).
 */

import { api } from './api.js';
import { sync } from './sync.js';
import { equiposForm } from './equipos-form.js';
import { pdfViewer } from './pdf-viewer.js';
import { escapeHtml } from './util.js';

export const equipos = {
    /** Renderiza la lista de equipos (cards) en el contenedor #equiposListContainer. */
    renderList(filterText = '') {
        const container = document.getElementById('equiposListContainer');
        if (!container) return;

        const all = sync.getEquiposLocal();
        const filter = filterText.trim().toUpperCase();
        const list = filter
            ? all.filter(e => {
                const haystack = [e.CODIGO_PATIO, e.MARCA, e.MODELO, e.SERIAL_CHASIS, e.PLACA, e.FRENTE_ACTUAL]
                    .filter(Boolean).join(' ').toUpperCase();
                return haystack.includes(filter);
            })
            : all;

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
                </div>
            `;
        }).join('');

        // Bind clicks
        container.querySelectorAll('.equipo-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.getAttribute('data-id');
                this.openDetailModal(id);
            });
        });
    },

    bindSearch() {
        const input = document.getElementById('equiposSearch');
        if (!input || input.dataset.bound) return;
        input.dataset.bound = '1';
        input.addEventListener('input', () => this.renderList(input.value));
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

            // Bind botón editar
            const editBtn = body.querySelector('#btnEditEquipoFromModal');
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    this.closeDetailModal();
                    equiposForm.openEdit(editBtn.getAttribute('data-equipo-id'));
                });
            }

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
                <button type="button" class="modal-action-btn" id="btnEditEquipoFromModal" data-equipo-id="${d.ID_EQUIPO}">
                    <i class="material-icons">edit</i> Editar datos
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
