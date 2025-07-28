class APIFilters {
	constructor(query, queryStr) {
		// 'query' is the initial Mongoose query object (e.g., Job.find())
		this.query = query;

		// 'queryStr' contains the query parameters from the URL (e.g., req.query)
		this.queryStr = queryStr;
	}

	// Applies filtering to the query based on the query string
	filter() {
		const queryCopy = { ...this.queryStr };

		// Removing fields from query
		const removeFields = ["sort", "fields", "q", "limit", "page"];
		removeFields.forEach((field) => delete queryCopy[field]);

		// Recursive function to replace operators like lt → $lt inside nested objects
		const convertOperators = (obj) => {
			const operatorMap = ["gt", "gte", "lt", "lte", "in"];
			for (let key in obj) {
				if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
					obj[key] = convertOperators(obj[key]);
				}
				if (operatorMap.includes(key)) {
					obj[`$${key}`] = obj[key];
					delete obj[key];
				}
			}
			return obj;
		};

		const mongoQuery = convertOperators(queryCopy);

		this.query = this.query.find(mongoQuery);

		// Return the current object to allow method chaining (e.g., .filter().sort().paginate())
		return this;
	}

	sort() {
		if (this.queryStr.sort) {
			const sortBy = this.queryStr.sort.split(",").join(" ");
			this.query = this.query.sort(sortBy);
		} else {
			// If nothing is given to sort according to, then it sorts according to posting date
			this.query = this.query.sort("-postingDate");
		}

		return this;
	}

	limitFields() {
		if (this.queryStr.fields) {
			const fields = this.queryStr.fields.split(",").join(" ");
			this.query = this.query.select(fields);
		} else {
			// Removes version key (It gives info about number of updates the document has been through)
			this.query = this.query.select("-__v");
		}
		return this;
	}

	searchByQuery() {
		if (this.queryStr.q) {
			const qu = this.queryStr.q.split("-").join(" ");
			this.query = this.query.find({ $text: { $search: '"' + qu + '"' } });
		}

		return this;
	}

	pagination() {
		const page = parseInt(this.queryStr.page, 10) || 1;
		const limit = parseInt(this.queryStr.limit, 10) || 10;
		const skipResults = (page - 1) * limit;
		this.query = this.query.skip(skipResults).limit(limit);

		return this;
	}
}

module.exports = APIFilters;
