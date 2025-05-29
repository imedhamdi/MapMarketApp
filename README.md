# MapMarketApp
# MapMarket Backend

Backend pour l'application de marketplace géolocalisée MapMarket.

## Fonctionnalités

* Authentification complète (JWT, bcrypt)
* Gestion des utilisateurs (profils, avatars)
* CRUD pour les annonces et les alertes de recherche
* Gestion des favoris
* Messagerie instantanée en temps réel (Socket.IO)
* Filtres avancés pour la recherche d'articles
* Upload d'images (Multer)
* Envoi d'emails (SendGrid)
* Sécurité (Helmet, CORS, rate limiting, validation des entrées)
* Logs avancés (Winston, Morgan)

## Prérequis

* Node.js (version 18.x ou plus recommandée)
* MongoDB (instance locale ou Atlas)
* Compte SendGrid (pour l'envoi d'emails)

## Installation

1.  **Clonez le dépôt :**
    ```bash
    git clone <url_du_depot>
    cd mapmarket-backend
    ```

2.  **Installez les dépendances :**
    ```bash
    npm install
    # ou
    yarn install
    ```

3.  **Configurez les variables d'environnement :**
    Créez un fichier `.env` à la racine du projet en vous basant sur le fichier `.env.example`. Remplissez les valeurs requises :
    ```env
    PORT=3000
    NODE_ENV=development
    MONGODB_URI=mongodb://localhost:27017/mapmarket_db_dev # Adaptez si nécessaire
    JWT_SECRET=VOTRE_SUPER_SECRET_JWT_TRES_LONG_ET_COMPLEXE
    JWT_EXPIRES_IN=7d
    JWT_COOKIE_EXPIRES_IN=7

    SENDGRID_API_KEY=VOTRE_CLE_API_SENDGRID
    SENDGRID_FROM_EMAIL=noreply@votredomaine.com
    SENDGRID_FROM_NAME="MapMarket"

    CLIENT_URL=http://localhost:8000 # URL de votre frontend

    UPLOADS_FOLDER=uploads
    MAX_FILE_UPLOAD_SIZE=5242880

    RATE_LIMIT_WINDOW_MS=900000
    RATE_LIMIT_MAX_REQUESTS=100

    CORS_ORIGIN=http://localhost:8000
    LOG_LEVEL=info
    LOG_DIR=logs

    SOCKET_CORS_ORIGIN=http://localhost:8000
    ```

4.  **Créez les dossiers nécessaires (s'ils ne sont pas créés automatiquement) :**
    ```bash
    mkdir uploads
    mkdir logs
    ```

## Lancement de l'application

* **Mode Développement (avec Nodemon pour le rechargement automatique) :**
    ```bash
    npm run dev
    ```

* **Mode Production :**
    ```bash
    npm start
    ```

L'application devrait maintenant tourner sur `http://localhost:PORT` (par défaut `http://localhost:3000`).

## Structure du Projet (MVC)

* `/config`: Configuration de la base de données, du logger, etc.
* `/controllers`: Logique métier pour chaque route.
* `/middlewares`: Fonctions intermédiaires (authentification, gestion des erreurs, upload, validation).
* `/models`: Schémas Mongoose pour la base de données.
* `/routes`: Définition des routes de l'API.
* `/socket`: Gestionnaire des événements WebSocket.
* `/utils`: Fonctions utilitaires (envoi d'email, classes d'erreur personnalisées).
* `/uploads`: Dossier pour le stockage des images uploadées (doit être créé).
* `/logs`: Dossier pour les fichiers de logs (créé par Winston).
* `server.js`: Point d'entrée principal de l'application.

## Endpoints API

Consultez le code des fichiers dans le dossier `/routes` pour une liste détaillée des endpoints. Les principaux endpoints sont conformes à ceux attendus par le frontend `index.html` fourni.

## Sécurité

* Mots de passe hashés avec bcrypt.
* Authentification JWT (tokens stockés en cookies HttpOnly pour une meilleure sécurité contre XSS).
* Protection contre les attaques XSS et la pollution des paramètres HTTP.
* Headers HTTP sécurisés avec Helmet.
* Validation et sanitization des entrées utilisateur.
* Rate limiting pour prévenir les abus.
* CORS configuré pour restreindre les accès.

## Logs

* Logs d'accès HTTP (Morgan) dans la console en mode développement.
* Logs d'application (Winston) dans `/logs/app.log`.
* Logs d'erreurs (Winston) dans `/logs/error.log`.
    Chaque log inclut un horodatage, le niveau de log, et le message. Les actions utilisateur importantes et les erreurs sont tracées.

---

This README provides a basic setup guide. You might need to adjust database connection strings, API keys, and other configurations based on your specific environment.

