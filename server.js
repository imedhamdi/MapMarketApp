const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Configuration de base
app.use(express.static(path.join(__dirname, 'public')));

// Route de fallback - doit être la dernière
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Démarrer le serveur
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});