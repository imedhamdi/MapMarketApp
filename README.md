# MapMarket Backend

Backend pour l'application de marketplace géolocalisée MapMarket.

## Prérequis

* Node.js (version 16.x ou supérieure recommandée)
* MongoDB (instance locale ou Atlas)
* npm ou yarn

## Installation

1.  Clonez le dépôt :
    ```bash
    git clone <url_du_depot>
    cd mapmarket-backend
    ```

2.  Installez les dépendances :
    ```bash
    npm install
    # ou
    yarn install
    ```

3.  Créez un fichier `.env` à la racine du projet en vous basant sur `.env.example` et remplissez les variables d'environnement nécessaires (URI MongoDB, clé secrète JWT, configurations email, etc.).
    ```bash
    cp .env.example .env
    # Éditez le fichier .env
    ```

## Démarrage

* **Pour le développement (avec rechargement automatique via Nodemon) :**
    ```bash
    npm run dev
    ```

* **Pour la production :**
    ```bash
    npm start
    ```

Par défaut, le serveur démarrera sur le port spécifié dans votre fichier `.env` (ex: `PORT=5001`).

## Structure du Projet

* `/config`: Fichiers de configuration (base de données, logger, etc.).
* `/controllers`: Logique métier pour chaque route.
* `/middlewares`: Middlewares Express (authentification, gestion d'erreurs, upload, etc.).
* `/models`: Modèles de données Mongoose.
* `/routes`: Définition des routes de l'API.
* `/utils`: Fonctions utilitaires.
* `/uploads`: Dossier pour les fichiers uploadés (avatars, images d'annonces, etc.). Ce dossier doit être créé manuellement s'il n'est pas généré par Multer.
* `/logs`: Fichiers de logs générés par Winston/Morgan.
* `server.js`: Point d'entrée principal de l'application.
* `.env`: Variables d'environnement (ne pas versionner).
* `.env.example`: Modèle pour les variables d'environnement.

## Endpoints API Principaux (Exemples)

* **Authentification:** `/api/auth`
    * `POST /api/auth/signup` - Inscription
    * `POST /api/auth/login` - Connexion
    * `POST /api/auth/forgot-password` - Demande de réinitialisation de mot de passe
    * `POST /api/auth/reset-password/:token` - Réinitialisation de mot de passe
    * `GET /api/auth/validate-email/:token` - Validation d'email
    * `GET /api/auth/logout` - Déconnexion (si gérée côté serveur)
* **Utilisateurs:** `/api/users`
    * `GET /api/users/me` - Obtenir le profil de l'utilisateur connecté
    * `PUT /api/users/me` - Mettre à jour le profil
    * `POST /api/users/me/avatar` - Uploader un avatar
    * `DELETE /api/users/me/avatar` - Supprimer l'avatar
    * `DELETE /api/users/me` - Supprimer le compte
    * `POST /api/users/:userId/block` - Bloquer un utilisateur
    * `POST /api/users/:userId/unblock` - Débloquer un utilisateur
* **Annonces:** `/api/ads`
    * `POST /api/ads` - Créer une annonce
    * `GET /api/ads` - Lister toutes les annonces (avec filtres, pagination, tri)
    * `GET /api/ads/my` - Lister les annonces de l'utilisateur connecté
    * `GET /api/ads/:id` - Obtenir une annonce spécifique
    * `PUT /api/ads/:id` - Mettre à jour une annonce
    * `DELETE /api/ads/:id` - Supprimer une annonce
* **Favoris:** `/api/favorites`
    * `POST /api/favorites` - Ajouter une annonce aux favoris
    * `GET /api/favorites` - Lister les favoris de l'utilisateur
    * `DELETE /api/favorites/:adId` - Retirer une annonce des favoris
* **Messagerie:** `/api/messages`
    * `POST /api/messages/threads/initiate` - Démarrer/récupérer un thread
    * `GET /api/messages/threads` - Lister les threads de l'utilisateur
    * `GET /api/messages/threads/:threadId/messages` - Lister les messages d'un thread (pagination)
    * `POST /api/messages/messages` - Envoyer un message texte
    * `POST /api/messages/messages/image` - Envoyer un message image
    * `POST /api/messages/threads/:threadId/read` - Marquer un thread comme lu
* **Alertes:** `/api/alerts`
    * `POST /api/alerts` - Créer une alerte
    * `GET /api/alerts` - Lister les alertes de l'utilisateur
    * `PUT /api/alerts/:id` - Mettre à jour une alerte
    * `DELETE /api/alerts/:id` - Supprimer une alerte
* **Notifications:** `/api/notifications`
    * `GET /api/notifications` - Lister les notifications de l'utilisateur
    * `POST /api/notifications/:id/read` - Marquer une notification comme lue
    * `POST /api/notifications/read-all` - Marquer toutes les notifications comme lues
* **Paramètres Utilisateur:** `/api/settings`
    * `PUT /api/settings` - Mettre à jour les paramètres utilisateur (ex: dark mode, préférences de notification)
    * `POST /api/settings/push-subscription` - Enregistrer/mettre à jour l'abonnement push

*(Cette liste d'endpoints est indicative et sera implémentée dans les modules respectifs.)*

## TODO

* Implémenter les tests unitaires et d'intégration.
* Ajouter une documentation API plus détaillée (Swagger/OpenAPI).
* Optimiser les requêtes de base de données.
* Mettre en place une stratégie de déploiement.

