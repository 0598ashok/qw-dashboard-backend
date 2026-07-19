// holidays.model.js

const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  date: {
    type: Date,
    required: true,
  },
  day: {
    type: String,
    required: true,
    trim: true,
  },
  action: {
    type: String,
    required: true,
    trim: true,
  },
});

const Holidays = mongoose.model('Holiday', holidaySchema);

module.exports = Holidays;
