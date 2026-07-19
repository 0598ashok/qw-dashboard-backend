const express = require("express");
const bcrypt = require("bcrypt");
const middleware = require("../middlewares/jwtAuth.js");
const exphbs = require("express-handlebars");
const Handlebars = require("handlebars");
const router = express.Router();
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const Payslip = require("../models/Payslips.js");
const pdf = require("html-pdf");
const fs = require("fs");
const path = require("path");
const hbs = exphbs.create({});
const Attendance = require("../models/Attendance");
const { format } = require("date-fns");
const Leave = require("../models/Leaves");
const Holidays = require("../models/Holidays");
const Employees = require("../models/Employees");
const Payslips = require("../models/EmployeesPayslips");
const { sendEmail } = require("../src/mail/emailService");
const Department = require("../models/Department.js");
const LeaveType = require("../models/LeaveType.js");
require("dotenv").config();
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  maxRetries: 5, // Retry the request up to 5 times
  requestTimeout: 300000, //5 min
});

router.post("/punchin", middleware, async (req, res) => {
  const { employeeId, employeeName } = req.body;

  try {
    // Create a new attendance record for the employee
    const latestRecord = await Attendance.findOne({ employeeId }).sort({
      punchOut: -1,
    });

    const newRecord = new Attendance({
      employeeId,
      punchIn: new Date(),
      lastPunchType: "PunchIn",
      employeeName: employeeName,
    });

    // Check if latestRecord exists before calculating breakTime
    if (latestRecord && latestRecord.punchOut) {
      // Check if the punch-in date is the same as the current date
      const isSameDate =
        newRecord.punchIn.toDateString() ===
        latestRecord.punchOut.toDateString();

      // Calculate breakTime only if the punch-in date is the same as the current date
      if (isSameDate) {
        newRecord.breakTime =
          (newRecord.punchIn - latestRecord.punchOut) / 1000;
      } else {
        newRecord.breakTime = 0; // Set a default value or handle it according to your application logic
      }
    } else {
      newRecord.breakTime = 0; // Set a default value or handle it according to your application logic
    }

    await newRecord.save();

    res.json({ message: "Punch in recorded successfully" });
  } catch (error) {
    console.error("Error punching in:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Punch Out
router.post("/punchout", middleware, async (req, res) => {
  const { employeeId, employeeName } = req.body;
  try {
    // Find the latest attendance record for the employee
    const latestRecord = await Attendance.findOne({ employeeId }).sort({
      punchIn: -1,
    });
    console.log(latestRecord);

    if (!latestRecord || latestRecord.punchOut) {
      return res
        .status(400)
        .json({ error: "Employee has not punched in for the day" });
    }

    // Update the attendance record with punch-out time and type
    latestRecord.punchOut = new Date();
    latestRecord.employeeName = employeeName;
    latestRecord.lastPunchedOut = latestRecord.punchOut;
    latestRecord.lastPunchType = "PunchOut";

    // Calculate working time for the latest punch-out
    const diffTime = latestRecord.punchOut - latestRecord.punchIn;
    const workingTime = diffTime / 1000; // in seconds

    if (!isNaN(workingTime) && isFinite(workingTime)) {
      // Calculate total working time by summing up all punch working times
      latestRecord.totalWorkingTime =
        (latestRecord.totalWorkingTime || 0) + workingTime;

      await latestRecord.save();

      res.json({ message: "Punch out recorded successfully" });
    } else {
      res.status(500).json({ error: "Invalid working time calculation" });
    }
  } catch (error) {
    console.error("Error punching out:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Endpoint to get all punches for a specific employee
router.get("/punches/:employeeId", middleware, async (req, res) => {
  const employeeId = req.params.employeeId;
  const { fromDate, month, year } = req.query;

  try {
    // Create a filter object based on the provided parameters
    const filter = { employeeId };
    if (fromDate) {
      // Add a condition to filter by fromDate
      filter.punchIn = {
        $gte: new Date(fromDate),
        $lt: new Date(fromDate + "T23:59:59.999Z"),
      };
    }
    if (month) {
      // Add a condition to filter by month
      filter.punchIn = {
        $gte: new Date(`${year}-${month}-01`),
        $lt: new Date(`${year}-${parseInt(month, 10) + 1}-01`),
      };
    }
    if (year) {
      // Add a condition to filter by year
      filter.punchIn = {
        $gte: new Date(`${year}-01-01`),
        $lt: new Date(`${parseInt(year, 10) + 1}-01-01`),
      };
    }

    // Find all attendance records based on the filter
    const allRecords = await Attendance.find(filter);

    // ... (remaining code)
    // / Filter records for today
    const today = new Date().toLocaleDateString();
    const todayRecords = allRecords.filter(
      (record) => new Date(record.punchIn).toLocaleDateString() === today
    );

    // Calculate total working time for today
    const totalWorkingTime = todayRecords.reduce(
      (acc, record) => acc + (record.totalWorkingTime || 0),
      0
    );

    // Map records to include the lastPunchType
    const formattedRecords = todayRecords.map((record) => ({
      ...record.toObject(),
      lastPunchType: record.lastPunchType,
    }));

    res.json({ punches: formattedRecords, totalWorkingTime });
  } catch (error) {
    console.error("Error fetching punches:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//employee activity based on date punches for employee in admin dashboard
router.get(
  "/admin/employee/date-punches/:employeeId/:date",
  middleware,
  async (req, res) => {
    const { employeeId, date } = req.params;

    try {
      // Create a filter object based on the provided parameters
      const filter = { employeeId };

      if (date) {
        // Add a condition to filter by the provided date
        filter.punchIn = {
          $gte: new Date(`${date}T00:00:00.000Z`),
          $lt: new Date(`${date}T23:59:59.999Z`),
        };
      }

      // Find all attendance records based on the filter
      const allRecords = await Attendance.find(filter);

      // Filter records for the provided date
      const dateRecords = allRecords.filter(
        (record) =>
          new Date(record.punchIn).toLocaleDateString() ===
          new Date(date).toLocaleDateString()
      );

      // Calculate total working time for the provided date
      const totalWorkingTime = dateRecords.reduce(
        (acc, record) => acc + (record.totalWorkingTime || 0),
        0
      );

      // Map records to include the lastPunchType
      const formattedRecords = dateRecords.map((record) => ({
        ...record.toObject(),
        lastPunchType: record.lastPunchType,
      }));

      res.json({ punches: formattedRecords, totalWorkingTime });
    } catch (error) {
      console.error("Error fetching punches:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

// Endpoint to get date-wise attendace data for employee
router.get("/date-wise-data/:employeeId", middleware, async (req, res) => {
  try {
    const employeeId = req.params.employeeId;

    // Parse query parameters
    const { month, year, employeeName } = req.query;

    // Filter based on employeeId
    const matchStage = { $match: { employeeId: employeeId } };

    // // Filter based on month and year
    const filterByMonthYear = [];
    if (month) {
      filterByMonthYear.push({
        $expr: { $eq: [{ $month: "$punchIn" }, parseInt(month)] },
      });
    }
    if (year) {
      filterByMonthYear.push({
        $expr: { $eq: [{ $year: "$punchIn" }, parseInt(year)] },
      });
    }

    // Filter based on employeeName
    let employeeFilterStage = {};
    if (employeeName) {
      const employee = await Employees.findOne({ name: employeeName });
      if (employee) {
        employeeFilterStage = { $match: { employeeId: employee._id } };
      }
    }

    const dateWiseData = await Attendance.aggregate([
      {
        $match: {
          $and: [
            { employeeId: employeeId },
            ...filterByMonthYear,
            employeeFilterStage,
          ],
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%d-%m-%Y", date: "$punchIn" } },
          firstPunchIn: { $min: "$punchIn" },
          lastPunchOut: { $max: "$punchOut" },
          totalWorkingTime: { $sum: "$totalWorkingTime" },
          totalBreakTime: { $sum: "$breakTime" },
        },
      },
    ]);

    // Calculate attendance based on working hours
    const result = dateWiseData.map((entry) => {
      // Check if totalWorkingTime and totalBreakTime properties exist
      if (
        entry.totalWorkingTime !== undefined &&
        entry.totalBreakTime !== undefined
      ) {
        const workingHours = entry.totalWorkingTime - entry.totalBreakTime;

        // Convert workingHours to hours and minutes
        const hours = Math.floor(workingHours / 3600);
        const minutes = Math.floor((workingHours % 3600) / 60);

        // Combine hours and minutes for comparison
        const totalMinutes = hours * 60 + minutes;
        if (totalMinutes >= 7.5 * 60) {
          entry.attendance = "Present";
        } else if (totalMinutes >= 3.5 * 60 && totalMinutes < 7.5 * 60) {
          entry.attendance = "HalfDay";
        } else {
          entry.attendance = "Absent";
        }

        // Add the formatted hours and minutes to the entry
        entry.formattedWorkingHours = `${hours} hours ${minutes} minutes`;
      } else {
        // Handle the case where totalWorkingTime or totalBreakTime is undefined
        entry.attendance = "Data Error"; // or set to a default value
        entry.formattedWorkingHours = "N/A";
      }

      return entry;
    });

    res.json(result);
  } catch (error) {
    console.error("Error fetching date-wise data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//admin attendance
router.get("/admin/attendance", middleware, async (req, res) => {
  try {
    const { employee, month, year } = req.query;

    // Create an object to store match conditions based on query parameters
    const matchConditions = {};

    if (employee) {
      // If employee parameter is provided, add it to the match conditions
      matchConditions.employeeName = { $regex: new RegExp(employee, "i") };
    }

    if (month && year) {
      // If month and year parameters are provided, add them to the match conditions
      const startDate = new Date(year, month - 1, 1); // Month is zero-based in JavaScript Date
      const endDate = new Date(year, month, 0);

      matchConditions.punchIn = { $gte: startDate, $lte: endDate };
    }

    const groupedAttendance = await Attendance.aggregate([
      {
        $match: matchConditions,
      },
      {
        $group: {
          _id: {
            employeeId: "$employeeId",
            employeeName: "$employeeName",
            date: { $dateToString: { format: "%Y-%m-%d", date: "$punchIn" } },
          },
          punches: { $push: "$$ROOT" },
        },
      },
      {
        $group: {
          _id: "$_id.employeeId",
          employeeNameSet: { $addToSet: "$_id.employeeName" },
          attendance: {
            $push: {
              date: "$_id.date",
              punches: "$punches", // Change here to include all punches for the date
            },
          },
        },
      },
      {
        $set: {
          employeeName: { $arrayElemAt: ["$employeeNameSet", 0] },
        },
      },
      {
        $sort: {
          _id: 1, // Sort employee IDs in ascending order
        },
      },
    ]);

    const currentDate = new Date();
    const firstDayOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );

    const formattedAttendance = groupedAttendance.map((employeeAttendance) => {
      const updatedAttendance = employeeAttendance.attendance.map(
        (dailyAttendance) => {
          const { punches } = dailyAttendance;

          const totalWorkingTime = punches.reduce((acc, punch) => {
            return acc + (punch.totalWorkingTime || 0);
          }, 0);

          const hours = totalWorkingTime / 3600;
          const roundedHours = hours.toFixed(2);

          const roundedHoursNumber = parseFloat(roundedHours);

          let attendanceStatus;

          if (roundedHoursNumber >= 7.5) {
            attendanceStatus = "Present";
          } else if (roundedHoursNumber >= 3.5 && roundedHoursNumber <= 7.4) {
            attendanceStatus = "Half Day";
          } else {
            attendanceStatus = "Absent";
          }

          return {
            date: dailyAttendance.date,
            totalWorkingTime,
            totalBreakTime: punches.reduce(
              (acc, punch) => acc + (punch.breakTime || 0),
              0
            ),
            punches,
            attendanceStatus,
          };
        }
      );

      return {
        _id: employeeAttendance._id,
        employeeName: employeeAttendance.employeeName,
        attendance: updatedAttendance,
      };
    });

    res.json(formattedAttendance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//apply leave api for employee
router.post("/apply-leave", middleware, async (req, res) => {
  try {
    const { employeeId, leaveType, from, to, days, reason } = req.body;

    // Check if the same employee has already had a record for the same from date
    const existingLeave = await Leave.findOne({ employeeId, from });

    if (existingLeave) {
      return res.status(400).json({
        message:
          "A leave request for this date already exists. Please select a different date.",
      });
    }

    // Create a new Leave instance with some fields populated and others as empty strings
    const newLeave = new Leave({
      employeeId,
      type: leaveType,
      from,
      to,
      days,
      reason,
      status: "New",
      actionBy: "HR",
      action: "-",
    });

    const savedLeave = await newLeave.save();
    res.json({ message: "Leave Applied Successfully" });
    return new Promise(async (resolve, reject) => {
      const formatDate = (dateString) => {
        const options = { year: "numeric", month: "long", day: "numeric" };
        return new Date(dateString).toLocaleDateString(undefined, options);
      };

      const reportingUserResult = await Employees.findOne({
        employeeId: newLeave.employeeId,
      });

      let user_name =
        reportingUserResult?.firstName + " " + reportingUserResult?.lastName;
      sendEmail({
        to: "hr@quantumworks.in",
        subject: `Leave applied by ${user_name} - ${employeeId}`,
        templateName: "templates/leave-request.hbs",
        context: {
          leave_title: `Leave applied by ${user_name} - ${employeeId}`,
          admin: "Admin ",
          employee_name: user_name,
          // request_date: formatDate(updatedLeave?.applied_date),
          employee_id: employeeId,
          employee_department: reportingUserResult?.department,
          employee_designation: reportingUserResult?.designation,
          from_date: formatDate(newLeave?.from),
          to_date: formatDate(newLeave?.to),
          leave_type: leaveType,
          no_of_days: newLeave?.days,
          request_date: formatDate(new Date()),
          reason: reason,
          company: "Quantum Works Private Limited",
        },
      });
    });
  } catch (error) {
    console.error("apply leave api", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//update leave for admin

router.put("/leave/update-status", middleware, async (req, res) => {
  try {
    const { leaveId, status } = req.body;

    // Update the leave status in the database
    const updatedLeave = await Leave.findByIdAndUpdate(
      leaveId,
      { status },
      { new: true }
    );
    console.log(updatedLeave);
    // Send the updated leave as the response
    res.json({ message: `Leave ${updatedLeave.status}` });
    return new Promise(async (resolve, reject) => {
      const formatDate = (dateString) => {
        const options = { year: "numeric", month: "long", day: "numeric" };
        return new Date(dateString).toLocaleDateString(undefined, options);
      };

      const reportingUserResult = await Employees.findOne({
        employeeId: updatedLeave.employeeId,
      });

      console.log(updatedLeave, "updated record");
      let user_name =
        reportingUserResult?.firstName + " " + reportingUserResult?.lastName;
      sendEmail({
        to: reportingUserResult?.email,
        subject: `Leave ${status}`,
        templateName: "templates/leave-action.hbs",
        context: {
          leave_title: "Leave Request Updated",
          user_name: user_name,
          // request_date: formatDate(updatedLeave?.applied_date),
          leave_type: updatedLeave?.type,
          from_date: formatDate(updatedLeave?.from),
          to_date: formatDate(updatedLeave?.to),
          no_of_days: updatedLeave?.days,
          action_class: `action-${status.toLowerCase()}`,
          action_text: status,
          current_date: formatDate(new Date()),
          company: "Quantum Works Private Limited",
        },
      });
    });
  } catch (error) {
    console.error("Error updating leave status:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//get all leaves for employee
router.get("/get-leaves/:employeeId", middleware, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const leaves = await Leave.find({ employeeId });
    const formattedLeaves = leaves.map((leave) => ({
      _id: leave._id,
      type: leave.type,
      from: format(new Date(leave.from), "dd-MM-yyyy"),
      to: format(new Date(leave.to), "dd-MM-yyyy"),
      days: leave.days,
      reason: leave.reason,
      status: leave.status,
      actionBy: leave.actionBy,
      action: leave.action,
    }));

    res.json(formattedLeaves);
  } catch (error) {
    console.error("indv leaves api", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//get all leaves for admin
router.get("/all-leaves", middleware, async (req, res) => {
  try {
    // Fetch all leaves from the Leave model
    const allLeaves = await Leave.find({}).sort({ _id: -1 });
    // console.log(allLeaves);

    // Format the dates in the desired format (dd-mm-yyyy)
    const formattedLeaves = await Promise.all(
      allLeaves.map(async (leave) => {
        // For each leave, fetch the employee details from the Employees model
        const employeeDetails = await Employees.findOne({
          employeeId: leave.employeeId,
        });

        // Return the formatted leave object with employee name
        return {
          id: leave._id,
          type: leave.type,
          employeeId: leave.employeeId,
          from: format(new Date(leave.from), "dd-MM-yyyy"),
          to: format(new Date(leave.to), "dd-MM-yyyy"),
          days: leave.days,
          reason: leave.reason,
          status: leave.status,
          actionBy: leave.actionBy,
          action: leave.action,
          employeeName: employeeDetails
            ? `${employeeDetails.firstName} ${employeeDetails.lastName}`
            : "",
        };
      })
    );

    res.json(formattedLeaves);
  } catch (error) {
    console.error("Error fetching all leaves:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//update leave for employee
router.put(
  "/update-leave/:employeeId/:leaveId",
  middleware,
  async (req, res) => {
    try {
      const { employeeId, leaveId } = req.params;

      // Find the leave by leaveId and employeeId
      const leaveToUpdate = await Leave.findOne({ _id: leaveId, employeeId });

      if (!leaveToUpdate) {
        return res
          .status(404)
          .json({ error: "Leave not found for the given employee" });
      }

      // Update leave in the database
      await Leave.findByIdAndUpdate(
        leaveId,
        {
          type: req.body.data?.leaveType,
          from: req.body.data?.from,
          to: req.body.data?.to,
          days: req.body.data?.days,
          reason: req.body.data?.reason,
        },
        { new: true }
      );

      res.json({ message: "Leave updated successfully" });
    } catch (error) {
      console.error("Error updating leave:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

//get specifi leave for employee
router.get("/get-leave/:employeeId/:leaveId", middleware, async (req, res) => {
  try {
    const { employeeId, leaveId } = req.params;

    // Find the leave by leaveId and employeeId
    const leaveDetails = await Leave.findOne({ _id: leaveId, employeeId });

    if (!leaveDetails) {
      return res
        .status(404)
        .json({ error: "Leave not found for the given employee" });
    }

    res.json(leaveDetails);
  } catch (error) {
    console.error("Error fetching individual leave details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//delete leave for employee
router.delete(
  "/delete-leave/:employeeId/:leaveId",
  middleware,
  async (req, res) => {
    try {
      const { employeeId, leaveId } = req.params;

      // Find the leave by leaveId and employeeId
      const leaveToDelete = await Leave.findOne({ _id: leaveId, employeeId });

      if (!leaveToDelete) {
        return res
          .status(404)
          .json({ error: "Leave not found for the given employee" });
      }

      // Delete leave from the database
      const deletedLeave = await Leave.findByIdAndDelete(leaveId);

      res.json({ message: "Leave deleted successfully", leave: deletedLeave });
    } catch (error) {
      console.error("Error deleting leave:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

//add leaves api
router.post("/add-holiday", middleware, async (req, res) => {
  try {
    const { title, date, action } = req.body;

    // Extract day from the date
    const day = format(new Date(date), "EEEE"); // This will give you the full day name (e.g., Monday)

    // Check if the date already exists in holidays
    const existingHoliday = await Holidays.findOne({ date });
    if (existingHoliday) {
      return res
        .status(400)
        .json({ error: "Holiday with this date already exists" });
    }

    const newHoliday = new Holidays({
      title,
      date,
      day,
      action: "HR",
    });

    await newHoliday.save();
    res.status(201).json({ message: "Holiday added successfully" });
  } catch (error) {
    console.error("Error adding holiday:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/holidays
router.get("/get-holidays", middleware, async (req, res) => {
  try {
    const holidays = await Holidays.find();
    const formattedHolidays = holidays.map((holiday) => ({
      ...holiday._doc,
      date: format(new Date(holiday.date), "dd-MM-yyyy"),
    }));

    res.json(formattedHolidays);
  } catch (error) {
    console.error("Error fetching holidays:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PUT /api/holidays/:id
router.put("/update-holiday/:id", middleware, async (req, res) => {
  try {
    const { title, date, day } = req.body;
    const { id } = req.params;

    // Add any additional validation logic as needed

    const updatedHoliday = await Holidays.findByIdAndUpdate(
      id,
      { title, date, day },
      { new: true }
    );

    res.json({ message: "Holiday updated successfully" });
  } catch (error) {
    console.error("Error updating holiday:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// DELETE /api/holidays/:id
router.delete("/delete-holiday/:id", middleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Add any additional validation logic as needed

    await Holidays.findByIdAndDelete(id);

    res.json({ message: "Holiday deleted successfully" });
  } catch (error) {
    console.error("Error deleting holiday:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//add employee api
router.post("/add-employee", async (req, res) => {
  try {
    // Check if employeeId or email already exists
    const existingEmployee = await Employees.findOne({
      $or: [{ employeeId: req.body.employeeId }, { email: req.body.email }],
    });

    if (existingEmployee) {
      return res
        .status(400)
        .json({ message: "EmployeeId or Email already exists" });
    }

    // Combine firstName and lastName to create fullName
    req.body.fullName = `${req.body.firstName} ${req.body.lastName}`;

    // Hash the password
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    let password = req.body.password;
    // Replace the original password with the hashed one
    req.body.password = hashedPassword;

    // Create a new employee
    const newEmployee = new Employees(req.body);

    // Save the employee to the database
    const savedEmployee = await newEmployee.save();

    res.status(201).json({ message: "Employee added successfully" });
    return new Promise((resolve, reject) => {
      // if (error) {
      //     reject(error);
      // } else {

      // Send email with the generated password
      sendEmail({
        to: req.body.email,
        subject: "Login credentials",
        templateName: "templates/user-created.hbs",
        context: {
          first_name: req.body.firstName,
          last_name: req.body.lastName,
          office_email: req.body.email,
          generatedPassword: password,
          loginLink: `https://quantumworks.space`,
          // generatedPassword,
          company: "Quantum Works Private Limited",
        },
      });
    });
  } catch (error) {
    console.error("Error adding employee:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// get all employees api
router.get("/all-employees", middleware, async (req, res) => {
  try {
    // Extract filter parameters from the query
    const { employeeId, employeeName, designation } = req.query;

    // Construct the filter object based on the provided parameters
    const filter = {};
    if (employeeId) {
      filter.employeeId = employeeId;
    }
    if (employeeName) {
      // Use a regular expression to perform a case-insensitive search on firstName and lastName
      filter.$or = [
        { firstName: { $regex: new RegExp(employeeName, "i") } },
        { lastName: { $regex: new RegExp(employeeName, "i") } },
      ];
    }
    if (designation) {
      filter.designation = designation;
    }

    // Use the filter object in the find query
    const employees = await Employees.find(filter).select("-password");
    if (employees.length === 0) {
      return res.status(404).json({ message: "No employees found" });
    }
    res.json(employees);
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
// individual employee

router.get("/individualemployee/:employeeId", async (req, res) => {
  try {
    const { employeeId } = req.params;

    // Use the employeeId in the find query
    const employee = await Employees.findOne({ employeeId });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json(employee);
  } catch (error) {
    console.error("Error fetching employee:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//update employee api
// router.put("/update-employee/:employeeId", async (req, res) => {
//   try {
//     console.log("hello");
//     const { employeeId } = req.params;
//     console.log(req.params);
//     console.log(req.body);
//     const updatedEmployee = req.body; // Assuming you send the updated data in the request body

//     const employee = await Employees.findOneAndUpdate(
//       { employeeId },
//       updatedEmployee,
//       { new: true } // Return the updated document
//     );

//     if (!employee) {
//       return res.status(404).json({ error: "Employee not found" });
//     }

//     res.json(employee);
//   } catch (error) {
//     console.error("Error updating employee:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

//delete employee api
router.delete("/delete-employee/:employeeId", middleware, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const employee = await Employees.findOneAndDelete({ employeeId });
    const employeeLeave = await Leave.findOneAndDelete({ employeeId });
    const employeeAttendance = await Attendance.findOneAndDelete({
      employeeId,
    });

    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }
    res.json({ message: "Employee deleted successfully" });
  } catch (error) {
    console.error("Error deleting employee:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/changepassword/:employeeId", middleware, async (req, res) => {
  try {
    // console.log("Request Body:", req.body);
    const { employeeId } = req.params;

    const employee = await Employees.findOne({ employeeId: employeeId });

    if (!employee) {
      return res.status(400).json({ message: "User not found" });
    }

    const { newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New passwords do not match" });
    }

    const hashedPassword = await bcrypt.hash(req.body.newPassword, 10);
    const update = {
      password: hashedPassword,
    };

    const user = await Employees.findOneAndUpdate(
      { employeeId: employeeId },
      update,
      { new: true }
    );

    // console.log("Updated User:", user); // Add this line for debugging

    res.status(200).json("Password updated successfully");
  } catch (error) {
    console.log("/changepassword/:employeeId ", error);
    res.status(500).json({ message: error.message });
  }
});

// upload Paylsips
// router.post('/upload-payslip/' ,async (req, res) => {
//   // const { employeeId, month, year, url } = req.body;
//   try {
//     const { employeeId, month, year, url } = req.body;
//     const existingPayslip = await Payslips.findOne({
//       $or: [{ employeeId: req.body.employeeId }, { month: req.body.month },  { year: req.body.year }],
//     });

//     if (existingPayslip) {
//       return res.status(400).json({ message: 'Payslip for the month already exists' });
//     }
//       const insertPayslip =  Payslips({employeeId, month, year, url});
//       await insertPayslip.save()
//       // res.status(200).json(insertPayslip, "pdf uploaded successfully");
//       res.status(201).json({ message: 'PDF added successfully' });

//   } catch (error) {
//       console.error(error);
//       res.status(500).json({ error: 'Internal server error' });
//   }
// })
router.post("/upload-payslip/", async (req, res) => {
  try {
    const { employeeId, month, year, url } = req.body;

    const existingPayslip = await Payslips.findOne({
      employeeId: req.body.employeeId,
      month: req.body.month,
      year: req.body.year,
    });

    if (existingPayslip) {
      return res
        .status(400)
        .json({ message: "Payslip for the month already exists" });
    }

    const insertPayslip = Payslips({ employeeId, month, year, url });
    await insertPayslip.save();

    res.status(201).json({ message: "PDF added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/delete-employeepayslip/:payslipId", async (req, res) => {
  try {
    const { payslipId } = req.params;
    const existingPayslip = await Payslips.findOne({ _id: payslipId });
    if (!existingPayslip) {
      return res.status(400).json({ message: "Payslip doesnot exists" });
    }
    const deletedLeave = await Payslips.findByIdAndDelete(payslipId);
    res.status(201).json({ message: "Deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

//add employee api
router.post("/add-employee", middleware, async (req, res) => {
  try {
    // Check if employeeId or email already exists
    const existingEmployee = await Employees.findOne({
      $or: [{ employeeId: req.body.employeeId }, { email: req.body.email }],
    });

    if (existingEmployee) {
      return res
        .status(400)
        .json({ message: "EmployeeId or Email already exists" });
    }

    // Combine firstName and lastName to create fullName
    req.body.fullName = `${req.body.firstName} ${req.body.lastName}`;

    // Hash the password
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    let password = req.body.password;
    // Replace the original password with the hashed one
    req.body.password = hashedPassword;

    // Create a new employee
    const newEmployee = new Employees(req.body);

    // Save the employee to the database
    const savedEmployee = await newEmployee.save();

    res.status(201).json({ message: "Employee added successfully" });
    return new Promise((resolve, reject) => {
      // if (error) {
      //     reject(error);
      // } else {
      // Send email with the generated password
      sendEmail({
        to: req.body.email,
        subject: "Login credentials",
        templateName: "templates/user-created.hbs",
        context: {
          first_name: req.body.firstName,
          last_name: req.body.lastName,
          office_email: req.body.email,
          generatedPassword: password,
          loginLink: `https://quantumworks.space`,
          // generatedPassword,
          company: "Quantum Works Private Limited",
        },
      });

      // resolve({ ...newUser, id: results.insertId, password: undefined });

      // }
    });
  } catch (error) {
    console.error("Error adding employee:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//update employee details
router.put("/update-employee/:id", middleware, async (req, res) => {
  try {
    const id = req.params.id;

    // Check if the employee exists
    const existingEmployee = await Employees.findOne({ _id: id });

    if (!existingEmployee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Check if the email is being changed to an existing email
    if (req.body.email && req.body.email !== existingEmployee.email) {
      const emailExists = await Employees.findOne({ email: req.body.email });
      if (emailExists) {
        return res.status(400).json({ message: "Email already exists" });
      }
    }

    // Update the employee details
    existingEmployee.firstName =
      req.body.firstName || existingEmployee.firstName;
    existingEmployee.lastName = req.body.lastName || existingEmployee.lastName;
    existingEmployee.email = req.body.email || existingEmployee.email;
    existingEmployee.employeeId =
      req.body.employeeId || existingEmployee.employeeId;
    existingEmployee.mobile = req.body.mobile || existingEmployee.mobile;
    existingEmployee.dateOfBirth =
      req.body.dateOfBirth || existingEmployee.dateOfBirth;
    existingEmployee.joiningDate =
      req.body.joiningDate || existingEmployee.joiningDate;
    existingEmployee.designation =
      req.body.designation || existingEmployee.designation;
    existingEmployee.gender = req.body.gender || existingEmployee.gender;
    existingEmployee.role = req.body.role || existingEmployee.role;
    existingEmployee.profileImage =
      req.body.profileImage || existingEmployee.profileImage;
    existingEmployee.bankname = req.body.bankname || existingEmployee.bankname;
    existingEmployee.department =
      req.body.department || existingEmployee.department;
    existingEmployee.grade = req.body.grade || existingEmployee.grade;
    existingEmployee.role = req.body.role || existingEmployee.role;
    existingEmployee.report = req.body.report || existingEmployee.report;
    existingEmployee.address = req.body.address || existingEmployee.address;
    existingEmployee.accountnumber =
      req.body.accountnumber || existingEmployee.accountnumber;
    existingEmployee.ifsccode = req.body.ifsccode || existingEmployee.ifsccode;
    existingEmployee.PANno = req.body.PANno || existingEmployee.PANno;
    existingEmployee.UANno = req.body.UANno || existingEmployee.UANno;
    existingEmployee.ESIno = req.body.ESIno || existingEmployee.ESIno;
    existingEmployee.pfNo = req.body.pfNo || existingEmployee.pfNo;
    existingEmployee.fathername =
      req.body.fathername || existingEmployee.fathername;
    // Update the password if provided
    if (req.body.password) {
      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      existingEmployee.password = hashedPassword;
    }

    // Save the updated employee details
    const updatedEmployee = await existingEmployee.save();

    res.status(200).json({ message: "Employee updated successfully" });
  } catch (error) {
    console.error("Error updating employee:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//get all leaves for employee
router.get("/get-leaves/:employeeId", middleware, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const leaves = await Leave.find({ employeeId });
    const formattedLeaves = leaves.map((leave) => ({
      _id: leave._id,
      type: leave.type,
      from: format(new Date(leave.from), "dd-MM-yyyy"),
      to: format(new Date(leave.to), "dd-MM-yyyy"),
      days: leave.days,
      reason: leave.reason,
      status: leave.status,
      actionBy: leave.actionBy,
      action: leave.action,
    }));

    res.json(formattedLeaves);
  } catch (error) {
    console.error("indv leaves api", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// get individual employee  payslips for months

router.get("/employee-payslip/:employeeId", middleware, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const payslips = await Payslips.find({ employeeId });

    res.json(payslips);
  } catch (error) {
    console.error("indv payslip api", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//add department
router.post("/department", async (req, res) => {
  try {
    const { department, designation } = req.body;

    const existingDepartment = await Department.findOne({
      department,
      designation,
    });

    if (existingDepartment) {
      return res
        .status(400)
        .json({ error: "Department with the same details already exists" });
    }
    const newDepartment = new Department({ department, designation });
    await newDepartment.save();

    res.status(201).json({ message: "Department added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// getting departments

router.get("/getDepartment", async (req, res) => {
  try {
    const departments = await Department.find();
    res.status(200).json(departments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Leave Type

router.post("/leaveType", async (req, res) => {
  try {
    const { leaveType } = req.body;

    const existingLeaveType = await LeaveType.findOne({ leaveType });

    if (existingLeaveType) {
      return res
        .status(400)
        .json({ error: "LeaveType with the same details already exists" });
    }
    const newLeaveType = new LeaveType({ leaveType });
    await newLeaveType.save();

    res.status(201).json({ message: "LeaveType added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// get leavetype

router.get("/getLeavetype", async (req, res) => {
  try {
    const leavetypes = await LeaveType.find();
    res.status(200).json(leavetypes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Generate payslip
router.post("/generate-payslip", async (req, res) => {
  try {
    const {
      empId,
      month,
      year,
      basicSalary,
      HRA,
      TA,
      DA,
      conveyanceAllowance,
      total,
      employeesContributionPF,
      ESI,
      employersContributionPF,
      professionalTAX,
      totalDeductions,
      NetSalary,
      paidDays,
      LOPDays,
      arrear,
      others,
    } = req.body;
    function getMonthName(monthNumber) {
      const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      return months[monthNumber - 1];
    }
    function formatDate(dateStr) {
      const date = new Date(dateStr);
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    }

    // Check if a payslip for the same employee, month, and year already exists
    const existingPayslip = await Payslip.findOne({ empId, month, year });
    if (existingPayslip) {
      return res.status(400).json({
        message: `Payslip for Employee ID ${empId} already exists for ${month}-${year}.`,
      });
    }

    const employee = await Employees.findOne({ employeeId: empId });

    // Data to pass to the HBS template
    const payslipData = {
      month: getMonthName(month),
      year,
      employeeCode: empId,
      name: employee.fullName,
      dateOfJoining: formatDate(employee.joiningDate),
      location: employee.address || "Hyderabad",
      department: employee.department,
      designation: employee.designation,
      grade: employee.grade || "NA",
      bankName: employee.bankname || "NA",
      bankAccountNo: employee.accountnumber || "NA",
      pfNo: employee.pfNo || "NA",
      uan: employee.UANno || "NA",
      pan: employee.PANno || "NA",
      esiNo: employee.ESIno || "NA",
      paidDays,
      lopDays: LOPDays,
      arrearDays: 0, // Assuming no arrear days
      daysInMonth: new Date(year, month, 0).getDate(),
      earnings: [
        {
          type: "Basic Pay",
          master: basicSalary,
          paid: basicSalary,
          arrear: 0,
          ytd: basicSalary * 12,
        },
        {
          type: "House Rent Allow",
          master: HRA,
          paid: HRA,
          arrear: 0,
          ytd: HRA * 12,
        },
        {
          type: "Transport Allowance",
          master: TA,
          paid: TA,
          arrear: 0,
          ytd: TA * 12,
        },
        { type: "DA", master: DA, paid: DA, arrear: 0, ytd: DA * 12 },
        {
          type: "Conveyance Allowance",
          master: conveyanceAllowance,
          paid: conveyanceAllowance,
          arrear: arrear,
          ytd: conveyanceAllowance * 12,
        },
      ],
      totalEarnings: {
        master: total,
        paid: total,
        arrear: arrear,
        ytd: total * 12,
      },
      deductions: [
        {
          type: "Provident Fund",
          deduction: employeesContributionPF,
          arrear: 0,
          ytd: employeesContributionPF * 12,
        },
        {
          type: "ESI",
          deduction: ESI,
          arrear: 0,
          ytd: ESI * 12,
        },
        {
          type: "Others",
          deduction: others,
          arrear: 0,
          ytd: others * 12,
        },
        // {
        //   type: "Employer PF",
        //   deduction: employersContributionPF,
        //   arrear: 0,
        //   ytd: employersContributionPF * 12,
        // },
        {
          type: "Professional Tax",
          deduction: professionalTAX,
          arrear: 0,
          ytd: professionalTAX * 12,
        },
      ],
      totalDeductions: {
        deduction: totalDeductions,
        arrear: 0,
        ytd: totalDeductions * 12,
      },
      netPay: NetSalary,
    };
    // Compile the HBS template
    const template = fs.readFileSync(
      path.join(__dirname, "../src/mail/templates/payslip-generation.hbs"),
      "utf-8"
    );
    const compiledTemplate = hbs.handlebars.compile(template);
    const payslipHtml = compiledTemplate(payslipData);

    // Convert HTML to PDF
    pdf.create(payslipHtml).toBuffer(async (err, buffer) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `payslips/${empId}_${year}_${month}.pdf`,
        Body: buffer,
        ContentType: "application/pdf",
      };

      let attempts = 0;
      const maxRetries = 5;
      while (attempts < maxRetries) {
        try {
          const command = new PutObjectCommand(params);
          await s3Client.send(command);
          break; // Exit loop if successful
        } catch (err) {
          attempts++;
          if (attempts >= maxRetries) throw err;
        }
      }

      // Construct the URL manually
      const payslipUrl = `https://${params.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${params.Key}`;

      const newPayslip = new Payslip({ empId, month, year, payslipUrl });
      await newPayslip.save();

      res.status(200).json({
        message: "Payslip generated and saved successfully",
        payslipUrl,
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get all payslips for an employee and filter by month and year if provided
router.get("/payslips", async (req, res) => {
  try {
    const { empId, month, year } = req.query;
    // console.log(empId, month, year)

    const filter = { empId };

    if (month) {
      filter.month = Number(month);
    }

    if (year) {
      filter.year = Number(year);
    }

    const payslips = await Payslip.find(filter);

    res.status(200).json(payslips);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Delete payslip by empId, month, and year
router.delete("/delete-payslip/:payslipId", async (req, res) => {
  try {
    const { payslipId } = req.params;

    const deletedPayslip = await Payslip.findByIdAndDelete({ _id: payslipId });

    if (!deletedPayslip) {
      return res.status(404).json({
        error: `Payslip for Employee not found.`,
      });
    }

    res.status(200).json({
      message: `Payslip for Employee ID ${deletedPayslip.empId} for ${deletedPayslip.month}/${deletedPayslip.year} deleted successfully.`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
