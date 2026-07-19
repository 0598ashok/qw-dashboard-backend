const mongoose = require("mongoose");

const leaveSchema = new mongoose.Schema({
    employeeId: String,
    type: String,
    from: Date,
    to: Date,
    days: Number,
    reason: String,
    status: String,
    actionBy: String,
    action: String,
  });
  
  const Leave = mongoose.model('Leave', leaveSchema);

  module.exports = Leave; 
  