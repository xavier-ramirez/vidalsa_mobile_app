/*
 * Vidalsa Mobile — APK Capacitor (orquestador).
 */

import { auth } from './auth.js';
import { sync } from './sync.js';
import { equipos } from './equipos.js';
import { equiposForm } from './equipos-form.js';
import { pdfViewer } from './pdf-viewer.js';
import { historial } from './historial.js';
import { movilizacionForm } from './movilizacion-form.js';
import { equipoAcciones } from './equipo-acciones.js';
import { password } from './password.js';

const app = {
    init() {
        if (auth.isLoggedIn()) this.showApp();
        else this.showLogin();
        this.bindNetworkStatus();
        this.updateOnlineStatus();
    },

    showLogin() {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app-screen').style.display = 'none';
        this.bindLoginForm();
    },

    async showApp() {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';
        this.bindMenu();
        this.renderUserHeader();
        equipos.bindSearch();
        equipos.bindModalClose();
        equiposForm.bindControls();
        pdfViewer.bindControls();
        password.bindControls();
        movilizacionForm.bindControls();
        equipoAcciones.bindControls();
        historial.bindControls();
        this.bindSyncButtons();
        this.bindCreateButton();
        this.bindMenuGroups();
        this.bindPasswordButton();
        this.bindMovilizacionButton();
        // Hook para refrescar el historial tras crear movilización
        window._historialModuleRefresh = () => historial.loadList({ append: false });

        // Hook para que el form de equipos pueda refrescar la lista
        window._equiposModuleRefresh = () => {
            equipos.renderList(document.getElementById('equiposSearch')?.value || '');
        };

        if (sync.isSyncRequired() && navigator.onLine) {
            await this.runSync({ silent: true });
        }
        equipos.populateFilterSelects();
        equipos.renderList('');
        this.renderSyncStatus();
    },

    bindLoginForm() {
        const form = document.getElementById('loginForm');
        if (!form || form.dataset.bound) return;
        form.dataset.bound = '1';

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const correo = document.getElementById('login_correo').value.trim();
            const password = document.getElementById('login_password').value;
            const alertBox = document.getElementById('loginAlert');
            const submitBtn = form.querySelector('button[type=submit]');
            alertBox.style.display = 'none';
            alertBox.textContent = '';

            if (!correo || !password) {
                alertBox.textContent = 'Ingresa tu correo y contraseña.';
                alertBox.style.display = 'flex';
                return;
            }
            submitBtn.disabled = true;
            submitBtn.textContent = 'Validando...';
            try {
                await auth.login(correo, password);
                await this.showApp();
            } catch (err) {
                alertBox.innerHTML = `<i class="material-icons" style="font-size:18px;">error_outline</i> <span>${err.message}</span>`;
                alertBox.style.display = 'flex';
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Iniciar sesión';
            }
        });

        const toggleBtn = document.getElementById('passwordToggle');
        if (toggleBtn && !toggleBtn.dataset.bound) {
            toggleBtn.dataset.bound = '1';
            toggleBtn.addEventListener('click', () => {
                const input = document.getElementById('login_password');
                input.type = input.type === 'password' ? 'text' : 'password';
            });
        }
    },

    bindMenu() {
        const menuBtn = document.getElementById('mobileMenuBtn');
        const menu = document.getElementById('mobileMenu');
        if (!menuBtn || menuBtn.dataset.bound) return;
        menuBtn.dataset.bound = '1';

        menuBtn.addEventListener('click', () => menu.classList.toggle('active'));

        document.querySelectorAll('.mobile-nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.mobile-nav-link').forEach(l => l.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const targetId = e.currentTarget.getAttribute('data-target');
                if (!targetId) return;
                document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
                const target = document.getElementById(targetId);
                if (target) target.classList.add('active');
                menu.classList.remove('active');
                if (targetId === 'view-equipos')    { equipos.populateFilterSelects(); equipos.renderList(document.getElementById('equiposSearch')?.value || ''); }
                if (targetId === 'view-auxiliares') equipos.renderList(document.getElementById('equiposSearch')?.value || ''); // placeholder
                if (targetId === 'view-sync')       this.renderSyncStatus();
                if (targetId === 'view-historial')  historial.initView();
            });
        });

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn && !logoutBtn.dataset.bound) {
            logoutBtn.dataset.bound = '1';
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                if (!confirm('¿Cerrar sesión?')) return;
                await auth.logout();
                this.showLogin();
            });
        }
    },

    bindSyncButtons() {
        const btn = document.getElementById('btnSyncNow');
        if (btn && !btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', async () => {
                await this.runSync({ silent: false });
                equipos.renderList(document.getElementById('equiposSearch')?.value || '');
            });
        }
    },

    bindCreateButton() {
        const btn = document.getElementById('btnRegistrarEquipo');
        if (btn && !btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => equiposForm.openCreate());
        }
    },

    bindMenuGroups() {
        // El CSS web (/css/menu.css) usa .mobile-nav-group.active para expandir.
        document.querySelectorAll('.mobile-nav-group-title').forEach(t => {
            if (t.dataset.bound) return;
            t.dataset.bound = '1';
            t.addEventListener('click', () => t.parentElement.classList.toggle('active'));
        });
    },

    bindMovilizacionButton() {
        const btn = document.getElementById('btnNuevaMovilizacion');
        if (btn && !btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => movilizacionForm.open());
        }
    },

    bindPasswordButton() {
        const btn = document.getElementById('btnChangePassword');
        if (btn && !btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('mobileMenu')?.classList.remove('active');
                password.open();
            });
        }
    },

    async runSync({ silent = false } = {}) {
        const btn = document.getElementById('btnSyncNow');
        const status = document.getElementById('syncStatusMsg');
        if (btn) { btn.disabled = true; btn.textContent = 'Sincronizando…'; }
        if (status) status.textContent = 'Descargando equipos…';

        try {
            const list = await sync.syncMisEquipos();
            if (status) status.textContent = `${list.length} equipos sincronizados.`;
            this.renderSyncStatus();
            if (!silent) alert(`Sincronización exitosa: ${list.length} equipos.`);
        } catch (err) {
            if (status) status.textContent = `Error: ${err.message}`;
            if (!silent) alert(`Error al sincronizar: ${err.message}`);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Sincronizar ahora'; }
        }
    },

    renderSyncStatus() {
        const lastEl = document.getElementById('lastSyncLabel');
        const countEl = document.getElementById('equiposCountLabel');
        if (lastEl) lastEl.textContent = sync.formatLastSync();
        if (countEl) countEl.textContent = String(sync.getEquiposLocal().length);
    },

    renderUserHeader() {
        const u = auth.getUser();
        if (!u) return;
        const name = u.nombre || u.correo || 'Usuario';
        const role = (u.nivel === 1 || u.nivel === '1') ? 'Acceso Global' : 'Acceso Local';
        const initial = (name.trim()[0] || 'U').toUpperCase();
        const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setText('userBadge', name);
        setText('userRole',  role);
        setText('userAvatar', initial);
    },

    bindNetworkStatus() {
        window.addEventListener('online',  () => this.updateOnlineStatus());
        window.addEventListener('offline', () => this.updateOnlineStatus());
    },

    updateOnlineStatus() {
        const ind = document.getElementById('offlineIndicator');
        if (!ind) return;
        if (navigator.onLine) {
            ind.classList.remove('disconnect');
            ind.classList.add('active');
            ind.innerHTML = '<i class="material-icons" style="font-size:14px;">wifi</i> Conectado';
            setTimeout(() => { ind.style.display = 'none'; }, 2500);
        } else {
            ind.style.display = 'flex';
            ind.classList.remove('active');
            ind.classList.add('disconnect');
            ind.innerHTML = '<i class="material-icons" style="font-size:14px;">signal_wifi_off</i> Sin conexión';
        }
    },
};

document.addEventListener('DOMContentLoaded', () => app.init());
