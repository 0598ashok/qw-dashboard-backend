require("dotenv").config();

const mode = (process.env.NODE_ENV || "prod").toLowerCase();
let mongo_uri;

if (mode === "prod" || mode === "production") {
  mongo_uri = process.env.MONGO_URL_prod;
} else if (mode === "dev" || mode === "development") {
  mongo_uri = process.env.MONGO_URL_dev;
} else if (mode === "local") {
  mongo_uri = process.env.MONGO_URL_local;
}

if (!mongo_uri) {
  mongo_uri = process.env.MONGO_URL_prod || process.env.MONGO_URL || process.env.MONGO_URI;
}

module.exports = mongo_uri;
