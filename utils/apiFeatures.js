// utils/apiFeatures.js
class APIFeatures {
    constructor(query, queryString) {
      this.query = query; // Requête Mongoose (ex: Model.find())
      this.queryString = queryString; // req.query
      this.filterQuery = {}; // Pour stocker le filtre final utilisé
    }
  
  filter() {
      const allowedFilters = ['category', 'price', 'condition', 'title'];
      const filteredQuery = {};
      Object.keys(this.queryString).forEach(el => {
        if (allowedFilters.includes(el)) {
          filteredQuery[el] = this.queryString[el];
        }
      });

      const filter = {};

      if (this.queryString.keywords) {
        filter.$text = { $search: this.queryString.keywords };
      }

      if (this.queryString.lat && this.queryString.lng && this.queryString.distance) {
        const lat = parseFloat(this.queryString.lat);
        const lng = parseFloat(this.queryString.lng);
        const dist = parseFloat(this.queryString.distance);
        if (!isNaN(lat) && !isNaN(lng) && !isNaN(dist)) {
          filter.location = {
            $nearSphere: {
              $geometry: { type: 'Point', coordinates: [lng, lat] },
              $maxDistance: dist * 1000
            }
          };
        }
      }

      let queryStr = JSON.stringify(filteredQuery);
      queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);

      Object.assign(filter, JSON.parse(queryStr));

      this.filterQuery = filter;
      this.query = this.query.find(filter);

      return this;
    }
  
    sort() {
      if (this.queryString.sort) {
        const sortBy = this.queryString.sort.split(',').join(' ');
        this.query = this.query.sort(sortBy);
      } else {
        this.query = this.query.sort('-createdAt'); // Tri par défaut
      }
      return this;
    }
  
    limitFields() {
      if (this.queryString.fields) {
        const fields = this.queryString.fields.split(',').join(' ');
        this.query = this.query.select(fields);
      } else {
        this.query = this.query.select('-__v'); // Exclure __v par défaut
      }
      return this;
    }
  
    paginate() {
      this.page = parseInt(this.queryString.page, 10) || 1;
      this.limit = parseInt(this.queryString.limit, 10) || 20; // 20 résultats par page par défaut
      const skip = (this.page - 1) * this.limit;
  
      this.query = this.query.skip(skip).limit(this.limit);
      return this;
    }

    getFilterQuery() {
        return this.filterQuery;
    }
}
  
module.exports = APIFeatures;
