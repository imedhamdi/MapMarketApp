// /middlewares/uploadMiddleware.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import AppError from '../utils/appError.js';
import { logger } from '../config/logger.js';
import { fileURLToPath } from 'url';

// Configuration initiale pour __dirname avec ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Déterminer le chemin du dossier d'uploads à partir de la racine du projet
const uploadsDirectory = path.join(path.dirname(__dirname), process.env.UPLOADS_FOLDER || 'uploads');

// S'assurer que le répertoire des uploads existe
if (!fs.existsSync(uploadsDirectory)) {
  fs.mkdirSync(uploadsDirectory, { recursive: true });
  logger.info(`Dossier d'uploads créé à: ${uploadsDirectory}`);
}


// Configuration du stockage Multer pour les fichiers locaux
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Le dossier de destination pour les fichiers uploadés
    cb(null, uploadsDirectory);
  },
  filename: (req, file, cb) => {
    // Générer un nom de fichier unique pour éviter les conflits
    // Format: user-<userId>-<timestamp>.<extension> ou item-<itemId>-<timestamp>.<extension>
    // Pour l'instant, un nom plus simple basé sur le timestamp et le nom original
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname); // Obtenir l'extension du fichier original
    cb(null, `mapmarket-${file.fieldname}-${uniqueSuffix}${extension}`);
  }
});

// Filtre pour n'accepter que certains types de fichiers (images)
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true); // Accepter le fichier
  } else {
    logger.warn(`Tentative d'upload d'un fichier non image: ${file.mimetype} par l'utilisateur ID: ${req.user?._id || 'Inconnu'}`);
    cb(new AppError('Seuls les fichiers image sont autorisés ! (jpeg, png, gif, etc.)', 400), false); // Rejeter le fichier
  }
};

// Configuration de l'instance Multer
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_UPLOAD_SIZE) || 5 * 1024 * 1024 // Limite de taille de fichier (ex: 5MB)
  }
});

// Middleware pour uploader une seule image (ex: avatar)
// 'avatar' est le nom du champ dans le formulaire FormData
export const uploadUserAvatar = upload.single('avatar');

// Middleware pour uploader plusieurs images pour une annonce (ex: max 3 images)
// 'images' est le nom du champ dans le formulaire FormData
export const uploadItemImages = upload.array('images', 3); // Accepte jusqu'à 3 fichiers pour le champ 'images'


// Si vous utilisiez Cloudinary (alternative au stockage local) :
/*
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const cloudinaryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: (req, file) => `mapmarket/${req.user.id}/items`, // Organiser par utilisateur et type
    format: async (req, file) => 'jpeg', // ou 'png', 'jpg'
    public_id: (req, file) => `item-${Date.now()}-${file.originalname.split('.')[0]}`,
    transformation: [{ width: 1200, height: 1200, crop: 'limit' }] // Redimensionner à la volée
  }
});

export const uploadCloudinary = multer({
  storage: cloudinaryStorage,
  fileFilter: multerFilter,
  limits: { fileSize: parseInt(process.env.MAX_FILE_UPLOAD_SIZE) || 5 * 1024 * 1024 }
});

// export const uploadItemImagesCloud = uploadCloudinary.array('images', 3);
// export const uploadUserAvatarCloud = uploadCloudinary.single('avatar');
*/
