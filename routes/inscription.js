const express = require('express');
const fs = require('fs');
const path = require('path');
const { body, validationResult } = require('express-validator');
const { google } = require('googleapis');

const router = express.Router();

const CSV_PATH = path.join(__dirname, '..', 'data', 'inscriptions.csv');
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '19v_SYfOZF19NrxOoLZQbC5e8tDy5TN10v6jZGj0YJ98';
const CREDENTIALS_PATH = fs.existsSync('/etc/secrets/credentials.json')
    ? '/etc/secrets/credentials.json'
    : path.join(__dirname, '..', 'credentials.json');


function sanitizeCsv(value) {
    if (!value) return '';
    const str = String(value).trim();
    if (['=', '+', '-', '@', '\t', '\r'].some(c => str.startsWith(c))) return `\t${str}`;
    return str.replace(/"/g, '""');
}

async function sendToSheets(data, source) {
    if (!fs.existsSync(CREDENTIALS_PATH)) return;
    try {
        const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
        const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
        const sheets = google.sheets({ version: 'v4', auth });
        const date = new Date().toLocaleString('fr-FR');
        if (source === 'formation') {
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: 'formation!A:D',
                valueInputOption: 'RAW',
                resource: { values: [[data.nom, data.telephone, data.filiere, date]] },
            });
        } else {
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: 'inscription!A:G',
                valueInputOption: 'RAW',
                resource: { values: [[data.nom, data.dateNaissance || '', data.telephone, data.email || '', data.niveauScolaire || '', data.filiere, date]] },
            });
        }
    } catch (err) {
        console.error('[Sheets] inscription error:', err.message);
    }
}

const validateInscription = [
    body('nom').trim().notEmpty().isLength({ max: 100 }).escape(),
    body('telephone').trim().notEmpty().matches(/^[0-9+\s\-()]{7,20}$/),
    body('filiere').trim().notEmpty().isLength({ max: 100 }).escape(),
    body('dateNaissance').optional().isISO8601().toDate(),
    body('email').optional().isEmail().normalizeEmail(),
    body('niveauScolaire').optional().trim().isLength({ max: 100 }).escape(),
    body('source').optional().trim().isIn(['formation', 'full']),
];

router.post('/', validateInscription, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    const { source, nom, dateNaissance, telephone, email, niveauScolaire, filiere } = req.body;
    const date = new Date().toLocaleString('fr-FR');
    const row = `"${sanitizeCsv(nom)}","${sanitizeCsv(dateNaissance)}","${sanitizeCsv(telephone)}","${sanitizeCsv(email)}","${sanitizeCsv(niveauScolaire)}","${sanitizeCsv(filiere)}","${date}"\n`;
    try {
        if (!fs.existsSync(CSV_PATH)) {
            fs.writeFileSync(CSV_PATH, 'Nom-Complet,Date-de-Naissance,Telephone,Email,Niveau-Scolaire,Filiere,Date-Candidature\n', 'utf8');
        }
        fs.appendFileSync(CSV_PATH, row, 'utf8');
    } catch (err) {
        console.error('[CSV] Write error:', err.message);
    }
    await sendToSheets({ nom, dateNaissance, telephone, email, niveauScolaire, filiere }, source);
    res.json({ success: true });
});

module.exports = router;
