/*
 * Formulario para registrar y editar equipos desde la APK.
 * Campos básicos (sin documentos ni fotos).
 */

import { api } from './api.js';
import { sync } from './sync.js';

const FIELDS = [
    { name: 'CODIGO_PATIO',             label: 'Código Patio',     type: 'text',   maxlength: 50,  upper: true },
    { name: 'TIPO_EQUIPO',              label: 'Tipo de Equipo',   type: 'text',   maxlength: 35,  upper: true, required: true },
    { name: 'CATEGORIA_FLOTA',          label: 'Categoría',        type: 'select', required: true, options: ['FLOTA LIVIANA','FLOTA PESADA'] },
    { name: 'MARCA',                    label: 'Marca',            type: 'text',   maxlength: 50,  upper: true, required: true },
    { name: 'MODELO',                   label: 'Modelo',           type: 'text',   maxlength: 50,  upper: true, required: true },
    { name: 'ANIO',                     label: 'Año',              type: 'number', required: true },
    { name: 'SERIAL_CHASIS',            label: 'Serial Chasis',    type: 'text',   upper: true, required: true },
    { name: 'SERIAL_DE_MOTOR',          label: 'Serial Motor',     type: 'text',   upper: true },
    { name: 'NUMERO_ETIQUETA',          label: 'Nº Etiqueta',      type: 'text',   maxlength: 50, upper: true },
    { name: 'ESTADO_OPERATIVO',         label: 'Estado',           type: 'select', required: true, options: ['OPERATIVO','EN MANTENIMIENTO','INOPERATIVO'] },
    { name: 'ID_FRENTE_ACTUAL',         label: 'Frente',           type: 'frente-select' },
    { name: 'DETALLE_UBICACION_ACTUAL', label: 'Detalle Ubicación', type: 'text', maxlength: 150, upper: true },
];

let _frentes = null; // cache

async function loadFrentesIfNeeded() {
    if (_frentes !== null) return _frentes;
    try {
        _frentes = await api.get('/frentes-asignados');
    } catch {
        _frentes = [];
    }
    return _frentes;
}

function renderField(field, value = '') {
    const id = `eqf_${field.name}`;
    const required = field.required ? 'required' : '';

    if (field.type === 'select') {
        const opts = field.options.map(o =>
            `<option value="${o}" ${value === o ? 'selected' : ''}>${o}</option>`
        ).join('');
        return `
            <div class="eqf-group">
                <label for="${id}">${field.label}${field.required ? ' *' : ''}</label>
                <select id="${id}" name="${field.name}" ${required}>
                    <option value="">— Selecciona —</option>
                    ${opts}
                </select>
            </div>
        `;
    }

    if (field.type === 'frente-select') {
        const opts = (_frentes || []).map(f =>
            `<option value="${f.ID_FRENTE}" ${String(value) === String(f.ID_FRENTE) ? 'selected' : ''}>${f.NOMBRE_FRENTE}</option>`
        ).join('');
        return `
            <div class="eqf-group">
                <label for="${id}">${field.label}</label>
                <select id="${id}" name="${field.name}">
                    <option value="">— Sin asignar —</option>
                    ${opts}
                </select>
            </div>
        `;
    }

    const maxAttr = field.maxlength ? `maxlength="${field.maxlength}"` : '';
    const upperAttr = field.upper ? 'oninput="this.value = this.value.toUpperCase()"' : '';
    return `
        <div class="eqf-group">
            <label for="${id}">${field.label}${field.required ? ' *' : ''}</label>
            <input type="${field.type}" id="${id}" name="${field.name}" value="${value ?? ''}" ${maxAttr} ${upperAttr} ${required} autocomplete="off">
        </div>
    `;
}

export const equiposForm = {
    async openCreate() {
        await loadFrentesIfNeeded();
        const overlay = document.getElementById('eqFormOverlay');
        const title = document.getElementById('eqFormTitle');
        const body = document.getElementById('eqFormBody');
        const submit = document.getElementById('eqFormSubmit');
        title.textContent = 'Registrar Equipo';
        submit.textContent = 'Registrar';
        body.innerHTML = FIELDS.map(f => renderField(f)).join('');
        overlay.dataset.mode = 'create';
        overlay.dataset.id = '';
        overlay.classList.add('open');
        document.getElementById('eqFormError').style.display = 'none';
    },

    async openEdit(id) {
        await loadFrentesIfNeeded();
        const equipo = sync.getEquipoLocal(id);
        if (!equipo) { alert('Equipo no encontrado en cache local.'); return; }
        const overlay = document.getElementById('eqFormOverlay');
        const title = document.getElementById('eqFormTitle');
        const body = document.getElementById('eqFormBody');
        const submit = document.getElementById('eqFormSubmit');
        title.textContent = `Editar ${equipo.CODIGO_PATIO || equipo.SERIAL_CHASIS}`;
        submit.textContent = 'Guardar cambios';
        // Mapeo de keys (mis-equipos usa SERIAL_MOTOR, BD usa SERIAL_DE_MOTOR)
        const mapped = { ...equipo, SERIAL_DE_MOTOR: equipo.SERIAL_MOTOR };
        body.innerHTML = FIELDS.map(f => renderField(f, mapped[f.name])).join('');
        overlay.dataset.mode = 'edit';
        overlay.dataset.id = id;
        overlay.classList.add('open');
        document.getElementById('eqFormError').style.display = 'none';
    },

    close() {
        document.getElementById('eqFormOverlay').classList.remove('open');
    },

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

        const data = {};
        FIELDS.forEach(f => {
            const el = document.getElementById(`eqf_${f.name}`);
            if (!el) return;
            const v = el.value;
            if (v !== '') data[f.name] = v;
        });

        submit.disabled = true;
        submit.textContent = 'Guardando…';
        errorBox.style.display = 'none';

        try {
            if (mode === 'create') {
                await api.post('/equipos', data);
            } else {
                await api.put(`/equipos/${id}`, data);
            }
            // Re-sync para refrescar la lista
            try { await sync.syncMisEquipos(); } catch { /* ignorable */ }
            this.close();
            if (window._equiposModuleRefresh) window._equiposModuleRefresh();
            alert(mode === 'create' ? 'Equipo registrado.' : 'Equipo actualizado.');
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
        if (closeBtn && !closeBtn.dataset.bound) {
            closeBtn.dataset.bound = '1';
            closeBtn.addEventListener('click', () => this.close());
        }
        if (submitBtn && !submitBtn.dataset.bound) {
            submitBtn.dataset.bound = '1';
            submitBtn.addEventListener('click', () => this.submit());
        }
        if (overlay && !overlay.dataset.bound) {
            overlay.dataset.bound = '1';
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.close();
            });
        }
    },
};
