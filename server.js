require("dotenv").config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

// Basic security headers
app.use(helmet());

// Parse JSON requests
app.use(express.json({ limit: "10kb" }));

// Limit repeated requests
const generalLimiter = rateLimit({
windowMs: 15 * 60 * 1000,
limit: 100,
standardHeaders: "draft-7",
legacyHeaders: false,
message: {
success: false,
message: "Too many requests. Please try again later."
}
});

app.use("/api", generalLimiter);

// Serve website files
app.use(express.static(path.join(__dirname)));

// Home page
app.get("/", (req, res) => {
res.sendFile(path.join(__dirname, "index.html"));
});

// Health check
app.get("/api/health", (req, res) => {
res.json({
success: true,
service: "RIMIDATASUB",
status: "running"
});
});

// Basic API information
app.get("/api", (req, res) => {
res.json({
success: true,
name: "RIMIDATASUB",
message: "Welcome to the RIMIDATASUB API",
status: "development"
});
});

// Handle unknown API routes
app.use("/api", (req, res) => {
res.status(404).json({
success: false,
message: "API endpoint not found."
});
});

// General error handler
app.use((err, req, res, next) => {
console.error("Server error:", err.message);

res.status(500).json({  
    success: false,  
    message: "An unexpected error occurred."  
});

});

// Start server
app.listen(PORT, "0.0.0.0", () => {
console.log(RIMIDATASUB server is running on port ${PORT});
});
