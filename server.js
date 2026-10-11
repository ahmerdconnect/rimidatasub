require("dotenv").config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
    console.error("DATABASE_URL and SESSION_SECRET must be configured.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-7",
    legacyHeaders: false
});

app.use("/api", apiLimiter);

app.use(session({
    store: new PgSession({
        pool,
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

app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");
        res.json({
            success: true,
            service: "RIMIDATASUB",
            database: "connected"
        });
    } catch (error) {
        console.error("Health check failed:", error.message);
        res.status(503).json({
            success: false,
            message: "Database connection failed."
        });
    }
});

app.post("/api/register", async (req, res) => {
    try {
        const { fullName, email, phone, password } = req.body;

        if (
            typeof fullName !== "string" ||
            fullName.trim().length < 2 ||
            fullName.trim().length > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid full name."
            });
        }

        const cleanEmail = typeof email === "string"
            ? email.trim().toLowerCase()
            : "";

        const cleanPhone = typeof phone === "string"
            ? phone.trim()
            : "";

        if (!cleanEmail && !cleanPhone) {
            return res.status(400).json({
                success: false,
                message: "Enter an email address or phone number."
            });
        }

        if (
            cleanEmail &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
        ) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address."
            });
        }

        if (cleanPhone && !/^\+?[0-9]{7,20}$/.test(cleanPhone)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid phone number."
            });
        }

        if (
            typeof password !== "string" ||
            password.length < 10 ||
            password.length > 72
        ) {
            return res.status(400).json({
                success: false,
                message: "Password must be 10–72 characters long."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            const result = await client.query(
                `INSERT INTO customers
                    (full_name, email, phone, password_hash)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, full_name, email, phone, created_at`,
                [
                    fullName.trim(),
                    cleanEmail || null,
                    cleanPhone || null,
                    passwordHash
                ]
            );

            const customer = result.rows[0];

            await client.query(
                `INSERT INTO wallets (customer_id, balance_kobo)
                 VALUES ($1, 0)`,
                [customer.id]
            );

            await client.query("COMMIT");

            req.session.userId = customer.id;

            return res.status(201).json({
                success: true,
                message: "Registration successful.",
                user: customer
            });
        } catch (error) {
            await client.query("ROLLBACK");

            if (error.code === "23505") {
                return res.status(409).json({
                    success: false,
                    message: "That email or phone number is already registered."
                });
            }

            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Registration error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Registration failed. Please try again."
        });
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const { identifier, password } = req.body;

        if (
            typeof identifier !== "string" ||
            typeof password !== "string" ||
            !identifier.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter your email or phone number and password."
            });
        }

        const value = identifier.trim();
        const isEmail = value.includes("@");

        const result = await pool.query(
            `SELECT id, full_name, email, phone, password_hash
             FROM customers
             WHERE ${
                 isEmail
                     ? "LOWER(email) = LOWER($1)"
                     : "phone = $1"
             }
             LIMIT 1`,
            [value]
        );

        const customer = result.rows[0];

        if (
            !customer ||
            !(await bcrypt.compare(password, customer.password_hash))
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid login details."
            });
        }

        req.session.regenerate((error) => {
            if (error) {
                console.error("Session error:", error.message);
                return res.status(500).json({
                    success: false,
                    message: "Could not start your session."
                });
            }

            req.session.userId = customer.id;

            req.session.save((saveError) => {
                if (saveError) {
                    console.error("Session save error:", saveError.message);
                    return res.status(500).json({
                        success: false,
                        message: "Could not save your session."
                    });
                }

                return res.json({
                    success: true,
                    message: "Login successful.",
                    user: {
                        id: customer.id,
                        full_name: customer.full_name,
                        email: customer.email,
                        phone: customer.phone
                    }
                });
            });
        });
    } catch (error) {
        console.error("Login error:", error.message);
        res.status(500).json({
            success: false,
            message: "Login failed. Please try again."
        });
    }
});

app.get("/api/me", async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: "Please log in."
        });
    }

    try {
        const result = await pool.query(
            `SELECT c.id, c.full_name, c.email, c.phone,
                    w.balance_kobo
             FROM customers c
             JOIN wallets w ON w.customer_id = c.id
             WHERE c.id = $1`,
            [req.session.userId]
        );

        if (!result.rows.length) {
            return res.status(401).json({
               
