require("dotenv").config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

// Check required environment variables
if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
    console.error("Missing required environment variables.");
    process.exit(1);
}

// Connect to Neon PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    connectionTimeoutMillis: 10000
});

pool.on("error", (error) => {
    console.error("Database connection error:", error.message);
});

// Trust Render proxy
app.set("trust proxy", 1);

// Security and request settings
app.use(helmet());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({
    extended: false,
    limit: "10kb"
}));

// Limit repeated API requests
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests. Please try again later."
    }
});

app.use("/api", apiLimiter);

// Session configuration
app.use(session({
    store: new PgSession({
        pool: pool,
        createTableIfMissing: true
    }),
    name: "rimidatasub.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Serve website files
app.use(express.static(path.join(__dirname)));

// Home page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Health check: server and database
app.get("/api/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            success: true,
            service: "RIMIDATASUB",
            server: "running",
            database: "connected"
        });
    } catch (error) {
        console.error("Health check error:", error.message);

        res.status(503).json({
            success: false,
            message: "Database connection failed."
        });
    }
});

// API information
app.get("/api", (req, res) => {
    res.json({
        success: true,
        name: "RIMIDATASUB",
        message: "Welcome to RIMIDATASUB API",
        status: "running"
    });
});

// REGISTER ACCOUNT
app.post("/api/register", async (req, res) => {
    const { fullName, email, phone, password } = req.body;

    const name = typeof fullName === "string"
        ? fullName.trim()
        : "";

    const cleanEmail = typeof email === "string"
        ? email.trim().toLowerCase()
        : "";

    const cleanPhone = typeof phone === "string"
        ? phone.trim()
        : "";

    if (name.length < 2 || name.length > 100) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid full name."
        });
    }

    if (!cleanEmail && !cleanPhone) {
        return res.status(400).json({
            success: false,
            message: "Enter your email or phone number."
        });
    }

    if (
        cleanEmail &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid email address."
        });
    }

    if (
        cleanPhone &&
        !/^\+?[0-9]{7,20}$/.test(cleanPhone)
    ) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid phone number."
        });
    }

    if (
        typeof password !== "string" ||
        password.length < 10 ||
        password.length > 72
    ) {
        return res.status(400).json({
            success: false,
            message: "Password must be between 10 and 72 characters."
        });
    }

    let client;

    try {
        const passwordHash = await bcrypt.hash(password, 12);

        client = await pool.connect();

        await client.query("BEGIN");

        const customerResult = await client.query(
            `INSERT INTO customers
                (full_name, email, phone, password_hash)
             VALUES ($1, $2, $3, $4)
             RETURNING id, full_name, email, phone, created_at`,
            [
                name,
                cleanEmail || null,
                cleanPhone || null,
                passwordHash
            ]
        );

        const customer = customerResult.rows[0];

        await client.query(
            `INSERT INTO wallets (customer_id, balance_kobo)
             VALUES ($1, 0)`,
            // Start server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`RIMIDATASUB server running on port ${PORT}`);
});
            [customer.id]
        );

        await client.query("COMMIT");

        req.session.userId = customer.id;

        req.session.save((sessionError) => {
            if (session
