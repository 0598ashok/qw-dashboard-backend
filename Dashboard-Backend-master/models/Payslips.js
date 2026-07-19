const mongoose = require('mongoose');

const PayslipSchema = new mongoose.Schema({
  empId: { type: String, required: true },
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  payslipUrl: { type: String, required: true }
});

module.exports = mongoose.model('Payslip', PayslipSchema);
