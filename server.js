require("dotenv").config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const PgSession = connectPgSimple(session);

// Check required environment variables
if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
    console.error("Required environment variables are missing.");
    process.exit(1);
}

// Neon PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    connectionTimeoutMillis: 10000
});

pool.on("error", (error) => {
    console.error("Database error:", error.message);
});

// Render proxy configuration
app.set("trust proxy", 1);

// Security middleware
app.use(helmet());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({
    extended: false,
    limit: "10kb"
}));

// Rate limit API requests
app.use("/api", rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-7",
    legacyHeaders: false
}));

// Session storage in PostgreSQL
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

// Serve frontend files
app.use(express.static(path.join(__dirname)));

// Home page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Health check
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
        console.error("Health check failed:", error.message);

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
        message: "Welcome to RIMIDATASUB API"
    });
});

// Register a new customer
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
            message: "Enter an email address or phone number."
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
            message: "Password must contain 10 to 72 characters."
        });
    }

    let client;

    try {
        const passwordHash = await bcrypt.hash(password, 12);

        client = await pool.connect();

        await client.query("BEGIN");

        const result = await client.query(
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

        const customer = result.rows[0];

        await client.query(
            `INSERT INTO wallets (customer_id, balance_kobo)
             VALUES ($1, 0)`,
            [customer.id]
        );

        await client.query("COMMIT");

        req.session.userId = customer.id;

        req.session.save((error) => {
            if (error) {
                console.error("Session save error:", error.message);

                return res.status(201).json({
                    success: true,
                    message: "Account created. Please log in.",
                    user: customer
                });
            }

            return res.status(201).json({
                success: true,
                message: "Account created successfully.",
                user: customer
            });
        });
    } catch (error) {
        if (client) {
            await client.query("ROLLBACK").catch(() => {});
        }

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "Email or phone number is already registered."
            });
        }

        console.error("Registration error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Registration failed. Please try again."
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// Login
app.post("/api/login", async (req, res) => {
    const { identifier, password } = req.body;

    if (
        typeof identifier !== "string" ||
        typeof password !== "string" ||
        !identifier.trim() ||
        !password ||
        password.length > 72
    ) {
        return res.status(400).json({
            success: false,
            message: "Enter your email or phone number and password."
        });
    }

    try {
        const value = identifier.trim();
        const isEmail = value.includes("@");

        const query = isEmail
            ? `SELECT id, full_name, email, phone, password_hash
               FROM customers
               WHERE LOWER(email) = LOWER($1)
               LIMIT 1`
            : `SELECT id, full_name, email, phone, password_hash
               FROM customers
               WHERE phone = $1
               LIMIT 1`;

        const result = await pool.query(query, [value]);
        const customer = result.rows[0];

        if (
            !customer ||
            !(await bcrypt.compare(password, customer.password_hash))
        ) {
            return res.status(401).json({
                success: false,
                message: "Incorrect email, phone number or password."
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

// Get logged-in user and wallet
app.get("/api/me", async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: "Please log in first."
        });
    }

    try {
        const result = await pool.query(
            `SELECT
                c.id,
                c.full_name,
                c.email,
                c.phone,
                c.created_at,
                w.balance_kobo
             FROM customers c
             JOIN wallets w ON w.customer_id = c.id
             WHERE c.id = $1
             LIMIT 1`,
            [req.session.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Account not found."
            });
        }

        const row = result.rows[0];

        res.json({
            success: true,
            user: {
                id: row.id,
                full_name: row.full_name,
                email: row.email,
                phone: row.phone,
                created_at: row.created_at
            },
            wallet: {
                balance_kobo: row.balance_kobo,
                balance_naira: Number(row.balance_kobo) / 100
            }
        });
    } catch (error) {
        console.error("Account lookup error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not load your account."
        });
    }
});

// Logout
app.post("/api/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("Logout error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Could not log out."
            });
        }

        res.clearCookie("rimidatasub.sid", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax"
        });

        res.json({
            success: true,
            message: "Logged out successfully."
        });
    });
});

// Unknown API routes
app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint not found."
    });
});

// Error handler
app.use((error, req, res, next) => {
    console.error("Server error:", error.message);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        success: false,
        message: "An unexpected error occurred."
    });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
    console.log("RIMIDATASUB server running on port " + PORT);
});
