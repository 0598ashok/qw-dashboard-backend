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

        const secret = process.env.JWT_SECRET || "jwtPassword";
        let compareToken = jwt.verify(token, secret);
        req.employeeId = compareToken.employeeId; // comparing requested user and logged in user
        next();
    } catch (e) {
        console.log(e, "JWT auth failed");
        return res.status(401).json("Unauthorized: Invalid or expired token");
    }
};