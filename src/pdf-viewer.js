/*
 * Visor PDF embebido con pdf.js (sin salir de la APK).
 * El PDF se descarga con auth Sanctum como Blob y se renderiza página por página
 * en un <canvas>. Funciona offline si el blob ya se cacheó (próxima fase).
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api } from './api.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

let _doc = null;
let _currentPage = 1;
let _scale = 1.2;
let _onCloseCallback = null;

export const pdfViewer = {
    /**
     * Abre un PDF descargándolo como blob desde el endpoint protegido.
     * @param {string} title Texto del header (ej: "Póliza – AMB-001").
     * @param {string} url Path relativo (ej: "/equipos/15/pdf/poliza").
     * @param {function} onClose callback al cerrar.
     */
    async openFromApi(title, url, onClose = null) {
        _onCloseCallback = onClose;
        const overlay = document.getElementById('pdfViewerOverlay');
        const titleEl = document.getElementById('pdfViewerTitle');
        const status = document.getElementById('pdfViewerStatus');
        const canvas = document.getElementById('pdfCanvas');
        const ctx = canvas.getContext('2d');

        titleEl.textContent = title || 'Documento';
        status.textContent = 'Descargando…';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        overlay.classList.add('open');

        try {
            const blob = await api.getBlob(url);
            const arrayBuffer = await blob.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            _doc = await loadingTask.promise;
            _currentPage = 1;
            status.textContent = '';
            await this.renderCurrent();
            this.updateNav();
        } catch (err) {
            status.textContent = 'Error: ' + err.message;
        }
    },

    async renderCurrent() {
        if (!_doc) return;
        const page = await _doc.getPage(_currentPage);
        const viewport = page.getViewport({ scale: _scale });
        const canvas = document.getElementById('pdfCanvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
    },

    updateNav() {
        const counter = document.getElementById('pdfPageCounter');
        if (counter) counter.textContent = `${_currentPage} / ${_doc?.numPages || 0}`;
        document.getElementById('pdfPrevBtn').disabled = (_currentPage <= 1);
        document.getElementById('pdfNextBtn').disabled = (_currentPage >= (_doc?.numPages || 1));
    },

    async next() {
        if (!_doc || _currentPage >= _doc.numPages) return;
        _currentPage++;
        await this.renderCurrent();
        this.updateNav();
    },

    async prev() {
        if (!_doc || _currentPage <= 1) return;
        _currentPage--;
        await this.renderCurrent();
        this.updateNav();
    },

    async zoomIn() {
        _scale = Math.min(_scale + 0.25, 3);
        await this.renderCurrent();
    },

    async zoomOut() {
        _scale = Math.max(_scale - 0.25, 0.5);
        await this.renderCurrent();
    },

    close() {
        const overlay = document.getElementById('pdfViewerOverlay');
        overlay.classList.remove('open');
        _doc = null;
        _currentPage = 1;
        _scale = 1.2;
        if (_onCloseCallback) { _onCloseCallback(); _onCloseCallback = null; }
    },

    bindControls() {
        const map = [
            ['pdfPrevBtn',  () => this.prev()],
            ['pdfNextBtn',  () => this.next()],
            ['pdfZoomIn',   () => this.zoomIn()],
            ['pdfZoomOut',  () => this.zoomOut()],
            ['pdfCloseBtn', () => this.close()],
        ];
        for (const [id, fn] of map) {
            const el = document.getElementById(id);
            if (el && !el.dataset.bound) {
                el.dataset.bound = '1';
                el.addEventListener('click', fn);
            }
        }
        const overlay = document.getElementById('pdfViewerOverlay');
        if (overlay && !overlay.dataset.bound) {
            overlay.dataset.bound = '1';
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.close();
            });
        }
    },
};
