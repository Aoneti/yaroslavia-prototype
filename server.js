const path = require('path');
const express = require('express');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.disable('x-powered-by');

// Serve only public static directories
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/data', express.static(path.join(__dirname, 'data')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get(['/', '/index.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get(['/game', '/game.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'game.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Yaroslavia server listening on http://${HOST}:${PORT}`);
});
