# MapMarketAppFirebase

Cette version utilise Firebase pour toutes les fonctionnalités backend.

## Structure
- **public/** : fichiers servis par Firebase Hosting
- **scripts/** : modules JavaScript utilisant le SDK Firebase modulaire
- **functions/** : Cloud Functions (Node.js)
- **firebase.json** et autres fichiers de configuration

## Déploiement
1. Installer la Firebase CLI puis exécuter `firebase init` pour connecter votre projet.
2. Déployer avec `firebase deploy`.
