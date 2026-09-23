// emailService.js
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');
const currentDir = __dirname;

require('dotenv').config();

const smtpPort = parseInt(process.env.SMTP_PORT, 10) || 465;

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.hostinger.com",
    port: smtpPort,
    secure: smtpPort === 465, // true for 465, false for 587/other ports
    auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
    },
    tls: {
        rejectUnauthorized: false,
    },
});

async function sendEmail({ to, subject, templateName, context }) {
    try {
        const templatePath = path.join(currentDir, templateName);
        if (!fs.existsSync(templatePath)) {
            console.error(`Email template not found: ${templatePath}`);
            return { success: false, error: `Template file not found at ${templatePath}` };
        }
        const source = fs.readFileSync(templatePath, 'utf8');
        const template = handlebars.compile(source);

        const emailData = {
            from: process.env.SMTP_FROM || process.env.SMTP_USERNAME,
            to: to,
            subject: subject,
            html: template(context),
        };

        const info = await transporter.sendMail(emailData);
        console.log('Email sent successfully: ', info.response);
        return { success: true, info };
    } catch (error) {
        console.error('Error sending email (SMTP): ', error.message || error);
        return { success: false, error: error.message || error };
    }
}

module.exports = { sendEmail };
