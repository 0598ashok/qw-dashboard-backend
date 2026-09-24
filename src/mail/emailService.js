// emailService.js - Migrated to Resend API
const { Resend } = require('resend');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');
const currentDir = __dirname;

require('dotenv').config();

// Initialize Resend SDK using environment variable
const resend = new Resend(process.env.RESEND_API_KEY);

console.log('RESEND API KEY EXISTS:', !!process.env.RESEND_API_KEY);
console.log('MAIL_FROM:', process.env.MAIL_FROM || 'hr@quantumworks.in');

async function sendEmail({ to, subject, templateName, context }) {
    try {
        const templatePath = path.join(currentDir, templateName);
        if (!fs.existsSync(templatePath)) {
            console.error(`Email template not found: ${templatePath}`);
            return { success: false, error: `Template file not found at ${templatePath}` };
        }
        const source = fs.readFileSync(templatePath, 'utf8');
        const template = handlebars.compile(source);
        const htmlContent = template(context);

        const fromAddress = process.env.MAIL_FROM || process.env.SMTP_FROM || 'hr@quantumworks.in';

        const { data, error } = await resend.emails.send({
            from: fromAddress,
            to: Array.isArray(to) ? to : [to],
            subject: subject,
            html: htmlContent,
        });

        if (error) {
            console.error('Error sending email (Resend API):', error);
            return { success: false, error: error.message || error };
        }

        console.log('Email sent successfully via Resend API:', data);
        return { success: true, info: data };
    } catch (error) {
        console.error('Exception sending email (Resend API):', error.message || error);
        return { success: false, error: error.message || error };
    }
}

module.exports = { sendEmail };
