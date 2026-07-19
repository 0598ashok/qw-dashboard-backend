// models/Employee.js
const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  employeeId: {
    type: String,
    required: true,
    unique: true,
  },
  mobile: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  dateOfBirth: {
    type: Date,
    required: true,
  },
  joiningDate: {
    type: Date,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  profileImage: {
    type: String,
    require: true,
  },
  department: String,
  designation: String,
  gender:String,
  grade: String,
  role: String,
  report: String,
  address: String,
  bankname:String,
  accountnumber:String,
  ifsccode:String,
  PANno:String,
  UANno:String,
  ESIno:String,
  pfNo:String,
  fathername:String,
  Others:String,
});

// Add a virtual property 'fullName' that combines 'firstName' and 'lastName'
employeeSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

const Employee = mongoose.model("Employee", employeeSchema);

module.exports = Employee;
