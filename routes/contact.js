const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { body, validationResult } = require('express-validator');
const { google } = require('googleapis');

const router = express.Router();

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '19v_SYfOZF19NrxOoLZQbC5e8tDy5TN10v6jZGj0YJ98';

function getCredentials() {
    if (process.env.GOOGLE_CREDENTIALS) {
        return JSON.parse(process.env.GOOGLE_CREDENTIALS);
    }
    const localPath = path.join(__dirname, '..', 'credentials.json');
    if (fs.existsSync(localPath)) {
        return JSON.parse(fs.readFileSync(localPath, 'utf8'));
    }
    return null;
}

// Escape HTML to prevent XSS in emails
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function sendToSheets(data) {
    const credentials = getCredentials();
    if (!credentials) return;
    try {
        const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
        const sheets = google.sheets({ version: 'v4', auth });
        const date = new Date().toLocaleString('fr-FR');
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'contact!A:F',
            valueInputOption: 'RAW',
            resource: { values: [[data.name, data.email, data.phone || '', data.subject || '', data.message, date]] },
        });
    } catch (err) {
        console.error('[Sheets] contact error:', err.message);
    }
}

// Validation rules
const validateContact = [
    body('name').trim().notEmpty().isLength({ max: 100 }).escape(),
    body('email').trim().notEmpty().isEmail().normalizeEmail(),
    body('message').trim().notEmpty().isLength({ min: 10, max: 2000 }),
    body('phone').optional().trim().matches(/^[0-9+\s\-()]{7,20}$/),
    body('subject').optional().trim().isLength({ max: 200 }).escape(),
];

router.post('/', validateContact, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, phone, subject, message } = req.body;

    await sendToSheets({ name, email, phone, subject, message });

    // Send email if credentials are configured
    const emailConfigured =
        process.env.EMAIL_USER &&
        process.env.EMAIL_PASS &&
        process.env.EMAIL_PASS !== 'your_email_password' &&
        !process.env.EMAIL_USER.includes('example.com');

    if (emailConfigured) {
        try {
            const transporter = nodemailer.createTransporter({
                service: 'gmail',
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
            });

            // All user input is escaped before inserting into HTML
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: process.env.EMAIL_TO,
                subject: `[IPPPR Contact] ${escapeHtml(subject) || 'Nouveau message'} - ${escapeHtml(name)}`,
                html: `
                    <h2>Nouveau message de contact</h2>
                    <p><strong>Nom:</strong> ${escapeHtml(name)}</p>
                    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
                    <p><strong>Téléphone:</strong> ${escapeHtml(phone) || 'N/A'}</p>
                    <p><strong>Sujet:</strong> ${escapeHtml(subject) || 'N/A'}</p>
                    <p><strong>Message:</strong></p>
                    <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
                `,
            });
        } catch (err) {
            console.error('[Email] Send error:', err.message);
        }
    }

    res.json({ success: true });
});

module.exports = router;
