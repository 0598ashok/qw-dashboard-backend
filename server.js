const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dbConfig = require('./utils/dbConfig')
const dns = require("dns");



const dotenv = require('dotenv');
require('dotenv').config();

dns.setDefaultResultOrder("ipv4first");

const app = express();
const port = 4444 || process.env.PORT


app.use(cors());
app.use(express.json());
require('dotenv').config()

// mongoose.connect(dbConfig)
//     .then(() => console.log('DB Connected'))
//     .catch((error) => console.log(error));

mongoose.connect(dbConfig, {
    family: 4,                // 👈 FORCE IPv4
    serverSelectionTimeoutMS: 5000
})
    .then(() => console.log('DB Connected'))
    .catch((error) => console.log(error));



app.use("/auth", require("./routes/authRoutes"));
app.use("/api", (require("./routes/apiRoutes")));

app.listen(port, () => console.log(`Server Running at ${port}`));