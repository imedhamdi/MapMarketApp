// Remplacez le middleware auth par:
module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = req.cookies?.token || (authHeader && authHeader.split(' ')[1]);

    if (!token) {
        return res.status(401).json({ 
            success: false,
            message: 'Accès non autorisé. Token manquant.' 
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false,
                message: 'Session expirée. Veuillez vous reconnecter.' 
            });
        }
        res.status(401).json({ 
            success: false,
            message: 'Token invalide.' 
        });
    }
};