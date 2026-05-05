/* Cambio de contraseña desde la APK. Llama PUT /api/mobile/user/password (Sanctum). */

import { api } from './api.js';
import { escapeHtml } from './util.js';

export const password = {
    open() {
        document.getElementById('pwdOverlay').classList.add('open');
        document.getElementById('pwdError').style.display = 'none';
        document.getElementById('pwdSuccess').style.display = 'none';
        ['pwdCurrent','pwdNew','pwdConfirm'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    },

    close() {
        document.getElementById('pwdOverlay').classList.remove('open');
    },

    async submit() {
        const current = document.getElementById('pwdCurrent').value;
        const next    = document.getElementById('pwdNew').value;
        const confirm = document.getElementById('pwdConfirm').value;
        const err = document.getElementById('pwdError');
        const ok  = document.getElementById('pwdSuccess');
        const btn = document.getElementById('pwdSubmit');

        err.style.display = 'none';
        ok.style.display = 'none';

        if (!current || !next || !confirm) {
            err.textContent = 'Completa los 3 campos.';
            err.style.display = 'flex';
            return;
        }
        if (next.length < 8) {
            err.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.';
            err.style.display = 'flex';
            return;
        }
        if (next !== confirm) {
            err.textContent = 'La nueva contraseña y su confirmación no coinciden.';
            err.style.display = 'flex';
            return;
        }
        if (!navigator.onLine) {
            err.textContent = 'Necesitas conexión a Internet para cambiar la contraseña.';
            err.style.display = 'flex';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Guardando…';
        try {
            await api.put('/user/password', {
                current_password: current,
                new_password: next,
                new_password_confirmation: confirm,
            });
            ok.textContent = 'Contraseña actualizada correctamente.';
            ok.style.display = 'flex';
            setTimeout(() => this.close(), 1500);
        } catch (e) {
            err.innerHTML = `<i class="material-icons" style="font-size:18px;">error_outline</i> <span>${escapeHtml(e.message)}</span>`;
            err.style.display = 'flex';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Cambiar contraseña';
        }
    },

    bindControls() {
        const closeBtn = document.getElementById('pwdClose');
        const submit   = document.getElementById('pwdSubmit');
        const overlay  = document.getElementById('pwdOverlay');
        if (closeBtn && !closeBtn.dataset.bound) {
            closeBtn.dataset.bound = '1';
            closeBtn.addEventListener('click', () => this.close());
        }
        if (submit && !submit.dataset.bound) {
            submit.dataset.bound = '1';
            submit.addEventListener('click', () => this.submit());
        }
        if (overlay && !overlay.dataset.bound) {
            overlay.dataset.bound = '1';
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.close();
            });
        }
    },
};
