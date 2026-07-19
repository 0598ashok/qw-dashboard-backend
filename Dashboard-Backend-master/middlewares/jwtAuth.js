const jwt = require("jsonwebtoken");

module.exports = function(req, res, next) {
    try {
        // Get the token from the Authorization header
        let authHeader = req.header("Authorization");
        
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(400).json("Bearer token not found");
        }

        // Extract the token from the Authorization header
        let token = authHeader.split(" ")[1];

        if (!token) {
            return res.status(400).json("JWT token not found");
        }

        let compareToken = jwt.verify(token, "jwtPassword");
        req.employeeId = compareToken.employeeId; // comparing requested user and logged in user
        next();
    } catch (e) {
        console.log(e, "JWT auth failed");
        return res.status(500).json("Internal server error");
    }
};