// middlewares/uploadMiddleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { AppError } = require('./errorHandler');
const { logger } = require('../config/winston');

// Créer les dossiers d'upload s'ils n'existent pas
const ensureUploadsDirExists = (dirPath) => {
    const fullPath = path.join(__dirname, '..', dirPath); // Remonter d'un niveau pour aller à la racine
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        logger.info(`Dossier d'upload créé : ${fullPath}`);
    }
    return fullPath;
};

const avatarUploadPath = ensureUploadsDirExists('uploads/avatars');
const adImagesUploadPath = ensureUploadsDirExists('uploads/ads');
const messageImagesUploadPath = ensureUploadsDirExists('uploads/messages');

// Configuration du stockage pour Multer (stockage local)
const storageConfig = (destinationPath) => multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, destinationPath);
    },
    filename: (req, file, cb) => {
        // Générer un nom de fichier unique : fieldname-timestamp.extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Filtre pour les types de fichiers image
const imageFileFilter = (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new AppError('Type de fichier non supporté. Uniquement les images (jpeg, png, gif, webp) sont autorisées.', 400), false);
    }
};

// Limites de taille de fichier (exemple, à ajuster dans les variables d'env)
const avatarSizeLimit = parseInt(process.env.AVATAR_SIZE_LIMIT_MB || '2', 10) * 1024 * 1024; // 2MB par défaut
const adImageSizeLimit = parseInt(process.env.AD_IMAGE_SIZE_LIMIT_MB || '2', 10) * 1024 * 1024; // 2MB par défaut
const messageImageSizeLimit = parseInt(process.env.MESSAGE_IMAGE_SIZE_LIMIT_MB || '2', 10) * 1024 * 1024; // 2MB par défaut

// Configuration de Multer pour l'upload d'avatar (un seul fichier)
const uploadAvatar = multer({
    storage: storageConfig(avatarUploadPath),
    fileFilter: imageFileFilter,
    limits: { fileSize: avatarSizeLimit }
}).single('avatar'); // 'avatar' doit correspondre au nom du champ dans le formulaire FormData

// Configuration de Multer pour l'upload d'images d'annonce (plusieurs fichiers)
const uploadAdImages = multer({
    storage: storageConfig(adImagesUploadPath),
    fileFilter: imageFileFilter,
    limits: { fileSize: adImageSizeLimit }
}).array('images', parseInt(process.env.MAX_AD_IMAGES_COUNT || '5', 10)); // 'images' et maxCount

// Configuration de Multer pour l'upload d'image de message (un seul fichier)
const uploadMessageImage = multer({
    storage: storageConfig(messageImagesUploadPath),
    fileFilter: imageFileFilter,
    limits: { fileSize: messageImageSizeLimit }
}).single('image'); // 'image' doit correspondre au nom du champ

// Middleware pour gérer les erreurs Multer et le nettoyage
const handleMulterUpload = (multerUploadFunction) => (req, res, next) => {
    multerUploadFunction(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            // Erreur Multer spécifique (ex: fichier trop gros, trop de fichiers)
            if (err.code === 'LIMIT_FILE_SIZE') {
                return next(new AppError(`Fichier trop volumineux. Taille maximale autorisée: ${err.field === 'avatar' ? avatarSizeLimit / (1024*1024) : (err.field === 'images' ? adImageSizeLimit / (1024*1024) : messageImageSizeLimit / (1024*1024))}MB.`, 400));
            }
            if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                 return next(new AppError('Trop de fichiers ou nom de champ incorrect.', 400));
            }
            return next(new AppError(`Erreur d'upload Multer: ${err.message}`, 400));
        } else if (err) {
            // Autre erreur (ex: type de fichier non supporté par notre filtre)
            // Si c'est une AppError de notre filtre, elle aura déjà un statusCode.
            return next(err);
        }
        // Si tout va bien, ou si aucun fichier n'a été uploadé (ce qui peut être normal pour des champs optionnels)
        next();
    });
};

// Middleware pour supprimer les fichiers uploadés en cas d'échec ultérieur dans la route
// (après que Multer ait fini mais avant que la réponse ne soit envoyée)
const cleanupUploadedFilesOnError = (req, res, next) => {
    const originalJson = res.json;
    res.json = function(body) {
        // Si la réponse est une erreur et que des fichiers ont été uploadés dans cette requête, les supprimer.
        if (res.statusCode >= 400 && req.files) { // Pour .array()
            logger.warn(`Nettoyage des fichiers (req.files) suite à une erreur ${res.statusCode}: ${JSON.stringify(req.files.map(f => f.path))}`);
            req.files.forEach(file => {
                fs.unlink(file.path, (unlinkErr) => {
                    if (unlinkErr) logger.error(`Échec de la suppression du fichier temporaire ${file.path}:`, unlinkErr);
                });
            });
        } else if (res.statusCode >= 400 && req.file) { // Pour .single()
            logger.warn(`Nettoyage du fichier (req.file) suite à une erreur ${res.statusCode}: ${req.file.path}`);
            fs.unlink(req.file.path, (unlinkErr) => {
                if (unlinkErr) logger.error(`Échec de la suppression du fichier temporaire ${req.file.path}:`, unlinkErr);
            });
        }
        return originalJson.call(this, body);
    };
    next();
};

// Optimisation des images après l'upload
const optimizeUploadedImages = async (req, res, next) => {
    const processFile = async (file) => {
        try {
            const data = await sharp(file.path)
                .resize({ width: 800 })
                .jpeg({ quality: 80 })
                .toBuffer();
            await fs.promises.writeFile(file.path, data);
        } catch (err) {
            logger.error('Erreur optimisation image:', err);
        }
    };

    try {
        if (req.file) await processFile(req.file);
        if (Array.isArray(req.files)) {
            for (const f of req.files) {
                await processFile(f);
            }
        }
    } catch (e) {
        logger.error('Erreur lors de la compression des images:', e);
    }
    next();
};


module.exports = {
    handleMulterUpload,
    uploadAvatar,
    uploadAdImages,
    uploadMessageImage,
    cleanupUploadedFilesOnError,
    optimizeUploadedImages
};
