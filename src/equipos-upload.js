/*
 * Subir PDFs (Propiedad / Póliza / ROTC / RACDA) desde el modal CASILLERO.
 * Reusa POST /api/mobile/equipos/{id}/upload-doc (= EquipoController::uploadDoc),
 * que ya valida can('user.edit') y sube el archivo a Drive con tracking.
 */

import { api } from './api.js';
import { sync } from './sync.js';
import { escapeHtml } from './util.js';

const TIPO_LABEL = {
    propiedad: 'Documento de Propiedad',
    poliza:    'Póliza de Seguro',
    rotc:      'Registro ROTC',
    racda:     'Registro RACDA',
};
const NEEDS_DATE = { propiedad: false, poliza: true, rotc: true, racda: true };

let _ctx = null; // {ID_EQUIPO, CODIGO_PATIO, tipo}

export const equiposUpload = {
    open(equipoId, codigo, tipo) {
        _ctx = { ID_EQUIPO: equipoId, CODIGO_PATIO: codigo, tipo };
        document.getElementById('uploadDocLabel').textContent = `${TIPO_LABEL[tipo] || tipo} — ${codigo || '#' + equipoId}`;
        document.getElementById('uploadDocFile').value = '';
        document.getElementById('uploadDocFecha').value = '';
        document.getElementById('uploadDocFechaWrap').style.display = NEEDS_DATE[tipo] ? '' : 'none';
        document.getElementById('uploadDocError').style.display = 'none';
        document.getElementById('uploadDocOverlay').classList.add('open');
    },

    close() {
        document.getElementById('uploadDocOverlay').classList.remove('open');
        _ctx = null;
    },

    async submit() {
        const fileInput = document.getElementById('uploadDocFile');
        const fecha = document.getElementById('uploadDocFecha').value;
        const err = document.getElementById('uploadDocError');
        const btn = document.getElementById('uploadDocSubmit');
        err.style.display = 'none';

        if (!_ctx) return;
        if (!fileInput.files || !fileInput.files[0]) {
            err.textContent = 'Selecciona un archivo PDF.';
            err.style.display = 'flex';
            return;
        }
        const file = fileInput.files[0];
        if (file.type !== 'application/pdf') {
            err.textContent = 'Solo se aceptan archivos PDF.';
            err.style.display = 'flex';
            return;
        }
        if (file.size > 50 * 1024 * 1024) {
            err.textContent = 'El archivo no puede superar 50 MB.';
            err.style.display = 'flex';
            return;
        }
        if (NEEDS_DATE[_ctx.tipo] && !fecha) {
            err.textContent = 'La fecha de vencimiento es obligatoria para este documento.';
            err.style.display = 'flex';
            return;
        }
        if (!navigator.onLine) {
            err.textContent = 'Necesitas conexión para subir el archivo.';
            err.style.display = 'flex';
            return;
        }

        const fd = new FormData();
        fd.append('file', file);
        fd.append('doc_type', _ctx.tipo);
        if (fecha) fd.append('expiration_date', fecha);

        btn.disabled = true; btn.textContent = 'Subiendo…';
        try {
            const data = await api.post(`/equipos/${_ctx.ID_EQUIPO}/upload-doc`, fd);
            try { await sync.syncMisEquipos(); } catch {}
            this.close();
            window.showToast?.(data?.message || 'Documento cargado.', 'success');
            // Reabre el modal para mostrar el PDF actualizado
            if (window._equiposReopenDetail) window._equiposReopenDetail(_ctx?.ID_EQUIPO);
        } catch (e) {
            err.innerHTML = `<i class="material-icons" style="font-size:18px;">error_outline</i> <span>${escapeHtml(e.message)}</span>`;
            err.style.display = 'flex';
        } finally {
            btn.disabled = false; btn.textContent = 'Subir documento';
        }
    },

    bindControls() {
        const close = document.getElementById('uploadDocClose');
        const submit = document.getElementById('uploadDocSubmit');
        const overlay = document.getElementById('uploadDocOverlay');
        if (close && !close.dataset.bound) { close.dataset.bound = '1'; close.addEventListener('click', () => this.close()); }
        if (submit && !submit.dataset.bound) { submit.dataset.bound = '1'; submit.addEventListener('click', () => this.submit()); }
        if (overlay && !overlay.dataset.bound) {
            overlay.dataset.bound = '1';
            overlay.addEventListener('click', e => { if (e.target === overlay) this.close(); });
        }
    },
};
