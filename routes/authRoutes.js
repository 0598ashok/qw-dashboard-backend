const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken")
const Employee = require("../models/Employees");


const router = express.Router();


// login API
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const exist = await Employee.findOne({ email });
    if (!exist) {
      return res.status(400).json({ message: "Invalid Email ID" });
    }
    const isPasswordMatched = await bcrypt.compare(password, exist.password);
    if (isPasswordMatched) {
      const empType = exist.employeeId === "QWIT-1001" ? "Admin" : "Employee";
      const payload = {
        employeeId: exist.employeeId,
      };
      const secret = process.env.JWT_SECRET || "jwtPassword";
      jwt.sign(
        payload,
        secret,
        { expiresIn: "24h" },
        (err, token) => {
          if (err) throw err;
          return res.json({ token, payload, empType, fullName: `${exist.firstName} ${exist.lastName}` });
        }
      );
    } 
    else {
      return res.status(400).json({ message: "Invalid Password" });
    }
  } catch (err) {
    console.log(err.message, "Login Api");
    res.status(500).send({ data: "Server Error" });
  }
});



module.exports = router;




