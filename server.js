const express = require('express');
const path = require('path');

const app = express();
const root = __dirname;

// Railway Railpack statik sunucusunun CSP'si WebAssembly'i (MediaPipe) engelliyordu.
// Bu sunucu kasıtlı olarak sıkı CSP göndermez — kamera + WASM çalışsın.
app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(self)');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
});

app.get('/favicon.ico', (_req, res) => {
    res.sendFile(path.join(root, 'assets', 'ghost.png'));
});

app.get('/apple-touch-icon.png', (_req, res) => {
    res.sendFile(path.join(root, 'assets', 'ghost.png'));
});

app.get('/apple-touch-icon-precomposed.png', (_req, res) => {
    res.sendFile(path.join(root, 'assets', 'ghost.png'));
});

app.use(express.static(root, {
    index: 'index.html',
    setHeaders(res, filePath) {
        if (filePath.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
        }
    }
}));

app.get('*', (_req, res) => {
    res.sendFile(path.join(root, 'index.html'));
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, '0.0.0.0', () => {
    console.log(`Lazer Kedi Savunması → http://0.0.0.0:${port}`);
});
