const mongoose = require('mongoose');

const LeaveSchema = new mongoose.Schema({
  leaveType: {
    type: String,
    required: true,
  }
 
});

const LeaveType = mongoose.model('LeaveType', LeaveSchema);

module.exports = LeaveType;