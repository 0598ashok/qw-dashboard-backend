// emailService.js
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');
const config = require('./config.js');
const currentDir = __dirname;

require('dotenv').config()

// const transporter = nodemailer.createTransport({
//     service: config.email.service,
//     auth: {
//         user: config.email.user,
//         pass: config.email.pass,
//     },
// });


// const transporter = nodemailer.createTransport({
//     host: "smtp.hostinger.com",
//     port: 465,
//     secure: true, // true for 465, false for other ports
//     auth: {
//         user: "hr@ecoquesttechnologies.com", // generated ethereal user
//         pass: "Ecoquest@123", // generated ethereal password
//     },
//     tls: {
//         rejectUnauthorized: false,
//    },
// });





const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 465,
    secure: true, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD, 
    },
    tls: {
        rejectUnauthorized: false,

      },

      },

);

function sendEmail({ to, subject, templateName, context }) {
    const templatePath = path.join(currentDir, templateName);
    const source = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(source);

    const emailData = {
        // from: config.email.from,
        from : process.env.SMTP_USERNAME,
        to: to,
        subject: subject,
        html: template(context),
    };

    transporter.sendMail(emailData, (error, info) => {
        if (error) {
            console.log('Error sending email: ', error);
        } else {
            console.log('Email sent: ', info.response);
        }
    });
}

module.exports = { sendEmail };
