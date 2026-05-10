const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const contactRouter = require('./routes/contact');
const inscriptionRouter = require('./routes/inscription');

const app = express();
const PORT = process.env.PORT || 5000;

// Security headers
app.use(helmet());

// CORS — allow configured origins or localhost in dev
// CORS — always allow Netlify domain + any extra origins from env
const allowedOrigins = [
    'https://ipppr.netlify.app',
    'http://localhost:5173',
    'http://localhost:3000',
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : []),
];

app.use(cors({
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));


app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Global rate limiter — 100 requests per 15 min per IP
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(globalLimiter);

// Stricter limiter for form submissions — 10 per hour per IP
const formLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { error: 'Too many submissions, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Routes
app.use('/api/contact', formLimiter, contactRouter);
app.use('/api/inscription', formLimiter, inscriptionRouter);

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
});

// 404
app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, _req, res, _next) => {
    console.error(err.message);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`IPPPR API running on port ${PORT}`);
});
