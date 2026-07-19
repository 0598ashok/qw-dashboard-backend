require("dotenv").config();

mode = "prod";
let mongo_uri;

if (mode === "prod") {
  mongo_uri = process.env.MONGO_URL_prod;
} else if (mode === "dev") {
  mongo_uri = process.env.MONGO_URL_dev;
} else if (mode === "local") {
  mongo_uri = process.env.MONGO_URL_local;
}

module.exports = mongo_uri;
