/*
 * Sistema de notificaciones toast — replica window.showToast de la web.
 * 4 tipos: success / error / warning / info (verde/rojo/ámbar/azul).
 * Auto-removal a los 4s con fade-out.
 */

import { escapeHtml } from './util.js';

const ICONS = {
    success: 'check_circle',
    error:   'error',
    warning: 'warning',
    info:    'info',
};

export function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.innerHTML = `
        <i class="material-icons">${ICONS[type] || 'info'}</i>
        <span>${escapeHtml(message)}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
            toast.remove();
            if (!container.children.length) container.remove();
        }, 300);
    }, 4000);
}

// Disponible globalmente para módulos no-importables
window.showToast = showToast;
