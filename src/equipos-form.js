/*
 * Formulario completo de registro/edición de equipos.
 * Acepta foto, PDFs (Propiedad/Póliza/ROTC/RACDA con fechas), catálogo,
 * GPS, anclaje, responsable inicial y documentación legal.
 *
 * Crear  → POST /api/mobile/equipos        (multipart/form-data)
 * Editar → PUT  /api/mobile/equipos/{id}   (campos básicos solamente)
 */

import { api } from './api.js';
import { sync } from './sync.js';
import { escapeHtml } from './util.js';

let _frentes = null;
let _catalogos = null;
let _hosts = null;

async function loadAuxLists() {
    if (_frentes === null)   { try { _frentes   = await api.get('/frentes-asignados'); } catch { _frentes = []; } }
    if (_catalogos === null) { try { _catalogos = await api.get('/catalogos-modelo');  } catch { _catalogos = []; } }
    if (_hosts === null)     { try { _hosts     = await api.get('/equipos-host');      } catch { _hosts = []; } }
}

function fieldSection(title, icon, content) {
    return `
        <div class="eqf-section">
            <div class="eqf-section-title"><i class="material-icons">${icon}</i> ${title}</div>
            <div class="eqf-section-body">${content}</div>
        </div>
    `;
}
function row(label, html, required = false) {
    return `<div class="eqf-group"><label>${escapeHtml(label)}${required ? ' *' : ''}</label>${html}</div>`;
}
function input(id, val = '', opts = {}) {
    const max = opts.max ? `maxlength="${opts.max}"` : '';
    const upper = opts.upper ? 'oninput="this.value = this.value.toUpperCase()"' : '';
    const type = opts.type || 'text';
    return `<input type="${type}" id="${id}" value="${escapeHtml(val ?? '')}" ${max} ${upper} autocomplete="off" />`;
}
function select(id, options, val = '') {
    return `<select id="${id}">
        <option value="">— Selecciona —</option>
        ${options.map(o => `<option value="${escapeHtml(String(o.value))}" ${String(val) === String(o.value) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
    </select>`;
}
function fileInput(id, accept) {
    return `<input type="file" id="${id}" accept="${accept}" />`;
}

function buildFormHTML(d = {}) {
    const isEdit = !!d.ID_EQUIPO;
    return `
        <!-- 1. Información Básica -->
        ${fieldSection('Información Básica', 'inventory_2', `
            ${row('Código Patio',        input('eqf_CODIGO_PATIO',     d.CODIGO_PATIO    || '', { max: 50, upper: true }))}
            ${row('Tipo de Equipo',      input('eqf_TIPO_EQUIPO',      d.TIPO_EQUIPO     || d.TIPO || '', { max: 35, upper: true }), true)}
            ${row('Categoría', select('eqf_CATEGORIA_FLOTA', [{value:'FLOTA LIVIANA',label:'FLOTA LIVIANA'},{value:'FLOTA PESADA',label:'FLOTA PESADA'}], d.CATEGORIA_FLOTA || ''), true)}
            ${row('Marca',               input('eqf_MARCA',            d.MARCA           || '', { max: 50, upper: true }), true)}
            ${row('Modelo',              input('eqf_MODELO',           d.MODELO          || '', { max: 50, upper: true }), true)}
            ${row('Año',                 input('eqf_ANIO',             d.ANIO            || '', { type: 'number' }), true)}
            ${row('Serial Chasis',       input('eqf_SERIAL_CHASIS',    d.SERIAL_CHASIS   || '', { upper: true }), true)}
            ${row('Serial Motor',        input('eqf_SERIAL_DE_MOTOR',  d.SERIAL_MOTOR    || d.SERIAL_DE_MOTOR || '', { upper: true }))}
            ${row('Nº Etiqueta',         input('eqf_NUMERO_ETIQUETA',  d.NUMERO_ETIQUETA || '', { max: 50, upper: true }))}
            ${row('Estado', select('eqf_ESTADO_OPERATIVO', [
                {value:'OPERATIVO',label:'OPERATIVO'},
                {value:'EN MANTENIMIENTO',label:'EN MANTENIMIENTO'},
                {value:'INOPERATIVO',label:'INOPERATIVO'},
                {value:'DESINCORPORADO',label:'DESINCORPORADO'},
            ], d.ESTADO_OPERATIVO || 'OPERATIVO'), true)}
            ${row('Frente', select('eqf_ID_FRENTE_ACTUAL', _frentes.map(f => ({value: f.ID_FRENTE, label: f.NOMBRE_FRENTE})), d.ID_FRENTE_ACTUAL || ''))}
            ${row('Detalle Ubicación', input('eqf_DETALLE_UBICACION_ACTUAL', d.DETALLE_UBICACION || d.DETALLE_UBICACION_ACTUAL || '', { max: 150, upper: true }))}
        `)}

        <!-- 2. Catálogo, GPS y Anclaje -->
        ${fieldSection('Vínculos: Catálogo, GPS, Anclaje', 'link', `
            ${row('Catálogo de Modelo (ficha técnica)', select('eqf_ID_ESPEC', _catalogos.map(c => ({value: c.ID_ESPEC, label: `${c.MODELO} ${c.ANIO_ESPEC || ''} ${c.MOTOR ? '· ' + c.MOTOR : ''}`.trim()})), d.ID_ESPEC || ''))}
            ${row('Link GPS (URL del rastreador)', input('eqf_LINK_GPS', d.LINK_GPS || '', { type: 'url', max: 500 }))}
            ${row('Anclar a equipo host', select('eqf_ID_ANCLAJE', _hosts.filter(h => !isEdit || h.ID_EQUIPO !== d.ID_EQUIPO).map(h => ({value: h.ID_EQUIPO, label: `${h.CODIGO_PATIO || 'S/C'} — ${h.MARCA || ''} ${h.MODELO || ''}`.trim()})), d.ID_ANCLAJE || ''))}
        `)}

        ${isEdit ? '' : `
        <!-- 3. Foto del equipo (solo en registro) -->
        ${fieldSection('Foto del Equipo', 'photo_camera', `
            ${row('Foto (JPG/PNG/WebP, máx 5MB)', fileInput('eqf_foto_equipo', 'image/*'))}
        `)}

        <!-- 4. Documentación Legal y PDFs -->
        ${fieldSection('Documentación Legal', 'description', `
            ${row('Nro. Documento',        input('eqf_NRO_DE_DOCUMENTO',   '', { max: 50, upper: true }))}
            ${row('Titular',               input('eqf_NOMBRE_DEL_TITULAR', '', { max: 120, upper: true }))}
            ${row('Placa Identificadora',  input('eqf_PLACA',              '', { max: 20, upper: true }))}
            <hr style="border: none; border-top: 1px dashed #e2e8f0; margin: 8px 0;" />
            ${row('PDF Propiedad',     fileInput('eqf_doc_propiedad', 'application/pdf'))}
            ${row('PDF Póliza',        fileInput('eqf_poliza_seguro', 'application/pdf'))}
            ${row('Vencim. Póliza',    input('eqf_FECHA_VENC_POLIZA', '', { type: 'date' }))}
            ${row('PDF ROTC',          fileInput('eqf_doc_rotc',      'application/pdf'))}
            ${row('Fecha ROTC',        input('eqf_FECHA_ROTC',        '', { type: 'date' }))}
            ${row('PDF RACDA',         fileInput('eqf_doc_racda',     'application/pdf'))}
            ${row('Fecha RACDA',       input('eqf_FECHA_RACDA',       '', { type: 'date' }))}
        `)}

        <!-- 5. Responsable Inicial -->
        ${fieldSection('Responsable Inicial (opcional)', 'person_pin', `
            ${row('Nombre del responsable', input('eqf_resp_nombre', '', { max: 120, upper: true }))}
            ${row('Cédula del responsable', input('eqf_resp_cedula', '', { max: 30, upper: true }))}
        `)}
        `}
    `;
}

function collectFormData(isEdit) {
    const fd = new FormData();
    const get = id => document.getElementById(id)?.value;

    // Campos básicos
    const fields = [
        'CODIGO_PATIO','TIPO_EQUIPO','CATEGORIA_FLOTA','MARCA','MODELO','ANIO',
        'SERIAL_CHASIS','SERIAL_DE_MOTOR','NUMERO_ETIQUETA','ESTADO_OPERATIVO',
        'ID_FRENTE_ACTUAL','DETALLE_UBICACION_ACTUAL',
        'ID_ESPEC','LINK_GPS','ID_ANCLAJE',
    ];
    fields.forEach(f => {
        const v = get('eqf_' + f);
        if (v !== '' && v !== null && v !== undefined) fd.append(f, v);
    });

    if (!isEdit) {
        // Documentación
        ['NRO_DE_DOCUMENTO','NOMBRE_DEL_TITULAR','PLACA','FECHA_VENC_POLIZA','FECHA_ROTC','FECHA_RACDA','resp_nombre','resp_cedula'].forEach(f => {
            const v = get('eqf_' + f);
            if (v !== '' && v !== null && v !== undefined) fd.append(f, v);
        });
        // Files
        ['foto_equipo','doc_propiedad','poliza_seguro','doc_rotc','doc_racda'].forEach(f => {
            const el = document.getElementById('eqf_' + f);
            if (el && el.files && el.files[0]) fd.append(f, el.files[0]);
        });
    }
    return fd;
}

export const equiposForm = {
    async openCreate() {
        await loadAuxLists();
        const overlay = document.getElementById('eqFormOverlay');
        document.getElementById('eqFormTitle').textContent = 'Registrar Equipo';
        document.getElementById('eqFormSubmit').textContent = 'Registrar';
        document.getElementById('eqFormBody').innerHTML = buildFormHTML();
        overlay.dataset.mode = 'create';
        overlay.dataset.id = '';
        overlay.classList.add('open');
        document.getElementById('eqFormError').style.display = 'none';
    },

    async openEdit(id) {
        await loadAuxLists();
        const equipo = sync.getEquipoLocal(id);
        if (!equipo) { window.showToast?.('Equipo no encontrado en cache.', 'error'); return; }
        const overlay = document.getElementById('eqFormOverlay');
        document.getElementById('eqFormTitle').textContent = `Editar ${equipo.CODIGO_PATIO || equipo.SERIAL_CHASIS}`;
        document.getElementById('eqFormSubmit').textContent = 'Guardar cambios';
        document.getElementById('eqFormBody').innerHTML = buildFormHTML(equipo);
        overlay.dataset.mode = 'edit';
        overlay.dataset.id = id;
        overlay.classList.add('open');
        document.getElementById('eqFormError').style.display = 'none';
    },

    close() { document.getElementById('eqFormOverlay').classList.remove('open'); },

    async submit() {
        const overlay = document.getElementById('eqFormOverlay');
        const mode = overlay.dataset.mode;
        const id = overlay.dataset.id;
        const errorBox = document.getElementById('eqFormError');
        const submit = document.getElementById('eqFormSubmit');

        if (!navigator.onLine) {
            errorBox.textContent = 'Necesitas conexión a Internet para guardar.';
            errorBox.style.display = 'flex';
            return;
        }

        submit.disabled = true;
        submit.textContent = 'Guardando…';
        errorBox.style.display = 'none';

        try {
            if (mode === 'create') {
                const fd = collectFormData(false);
                await api.post('/equipos', fd);
            } else {
                // Edit usa JSON con campos básicos (la subida de docs/foto se hace
                // desde el modal de detalles después).
                const fd = collectFormData(true);
                const body = {};
                fd.forEach((v, k) => { body[k] = v; });
                await api.put(`/equipos/${id}`, body);
            }
            try { await sync.syncMisEquipos(); } catch {}
            this.close();
            if (window._equiposModuleRefresh) window._equiposModuleRefresh();
            window.showToast?.(mode === 'create' ? 'Equipo registrado.' : 'Equipo actualizado.', 'success');
        } catch (err) {
            const msg = err.data?.errors
                ? Object.values(err.data.errors).flat().join('\n')
                : err.message;
            errorBox.textContent = msg;
            errorBox.style.display = 'flex';
        } finally {
            submit.disabled = false;
            submit.textContent = mode === 'create' ? 'Registrar' : 'Guardar cambios';
        }
    },

    bindControls() {
        const closeBtn = document.getElementById('eqFormClose');
        const submitBtn = document.getElementById('eqFormSubmit');
        const overlay = document.getElementById('eqFormOverlay');
        if (closeBtn && !closeBtn.dataset.bound) { closeBtn.dataset.bound = '1'; closeBtn.addEventListener('click', () => this.close()); }
        if (submitBtn && !submitBtn.dataset.bound) { submitBtn.dataset.bound = '1'; submitBtn.addEventListener('click', () => this.submit()); }
        if (overlay && !overlay.dataset.bound) {
            overlay.dataset.bound = '1';
            overlay.addEventListener('click', e => { if (e.target === overlay) this.close(); });
        }
    },
};
