// /utils/apiFeatures.js

/**
 * Classe pour construire et exécuter des requêtes API avancées avec Mongoose.
 * Permet le filtrage, le tri, la limitation des champs et la pagination.
 */
class APIFeatures {
  /**
   * Crée une instance de APIFeatures.
   * @param {mongoose.Query} query - La requête Mongoose initiale (ex: Model.find()).
   * @param {object} queryString - L'objet query string de la requête Express (req.query).
   */
  constructor(query, queryString) {
    this.query = query; // La requête Mongoose (ex: Item.find())
    this.queryString = queryString; // Les paramètres de l'URL (req.query)
  }

  /**
   * Filtre les résultats en fonction des paramètres de la query string.
   * Exclut les champs spéciaux comme 'page', 'sort', 'limit', 'fields'.
   * Permet les opérateurs de comparaison (gte, gt, lte, lt).
   * @returns {APIFeatures} L'instance actuelle de APIFeatures pour le chaînage.
   */
  filter() {
    // 1A) Filtrage de base
    const queryObj = { ...this.queryString };
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach(el => delete queryObj[el]);

    // 1B) Filtrage avancé (pour les opérateurs gte, gt, lte, lt)
    let queryStr = JSON.stringify(queryObj);
    // Remplace gte, gt, lte, lt par $gte, $gt, $lte, $lt (format MongoDB)
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);
    
    this.query = this.query.find(JSON.parse(queryStr));
    
    return this; // Permet de chaîner les méthodes
  }

  /**
   * Trie les résultats.
   * Par défaut, trie par `createdAt` en ordre décroissant.
   * Permet le tri sur plusieurs champs (ex: sort=price,-ratingsAverage).
   * @returns {APIFeatures} L'instance actuelle de APIFeatures.
   */
  sort() {
    if (this.queryString.sort) {
      // Remplace les virgules par des espaces pour le format de Mongoose
      const sortBy = this.queryString.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      // Tri par défaut si aucun paramètre de tri n'est fourni
      this.query = this.query.sort('-createdAt'); // Plus récent d'abord
    }
    return this;
  }

  /**
   * Limite les champs retournés dans les résultats (projection).
   * Permet de sélectionner uniquement certains champs (ex: fields=name,price,category).
   * Exclut par défaut le champ `__v` de Mongoose.
   * @returns {APIFeatures} L'instance actuelle de APIFeatures.
   */
  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(',').join(' ');
      this.query = this.query.select(fields);
    } else {
      // Exclure le champ __v par défaut
      this.query = this.query.select('-__v');
    }
    return this;
  }

  /**
   * Gère la pagination des résultats.
   * Utilise les paramètres `page` et `limit` de la query string.
   * `page` est le numéro de la page (défaut: 1).
   * `limit` est le nombre de résultats par page (défaut: 100).
   * @returns {APIFeatures} L'instance actuelle de APIFeatures.
   */
  paginate() {
    const page = parseInt(this.queryString.page, 10) || 1;
    const limit = parseInt(this.queryString.limit, 10) || 100; // Limite par défaut
    const skip = (page - 1) * limit; // Nombre de documents à sauter

    this.query = this.query.skip(skip).limit(limit);
    
    // Optionnel: vérifier si la page demandée existe (nécessite un countDocuments)
    // if (this.queryString.page) {
    //   const numDocuments = await this.query.model.countDocuments(); // Attention: exécute une requête
    //   if (skip >= numDocuments) throw new Error('Cette page n\'existe pas');
    // }
    return this;
  }
}

export default APIFeatures;
