const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    required: true,
  },
  punchIn: {
    type: Date,
    required: true,
  },
  punchOut: {
    type: Date,
  },
  breakTime: {
    type: Number,
    default: 0,
  },
  totalWorkingTime: {
    type: Number,
    default: 0,
  },
  lastPunchedIn: {
    type: Date,
  },
  lastPunchedOut: {
    type: Date,
  },
  lastPunchType: {
    type: String,
    enum: ['PunchIn', 'PunchOut'],
  },
  employeeName:String,
});

const Attendance = mongoose.model('Attendance', attendanceSchema);

module.exports = Attendance;
