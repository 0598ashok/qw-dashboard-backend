const mongoose = require('mongoose');

const payslipsSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    required: true,
  },
  year: {
    type: String,
    required: true,
  },
  month: {
    type: String,
  },
  url: {
    type: String,
  },
  
});

const Payslips = mongoose.model('Payslips', payslipsSchema);

module.exports = Payslips;
