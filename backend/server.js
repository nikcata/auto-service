require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const customerRoutes = require("./routes/customerRoutes");
const carRoutes = require("./routes/carRoutes");
const repairRoutes = require("./routes/repairRoutes");
const statsRoutes = require("./routes/statsRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const searchRoutes = require("./routes/searchRoutes");
const { verifyToken } = require("./middleware/authMiddleware");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/invoices", express.static(path.join(__dirname, "invoices")));
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

app.get("/dashboard", verifyToken, (req, res) => {
    res.json({
        message: "Welcome to dashboard!",
        user: req.user
    });
});

app.use(authRoutes);
app.use(customerRoutes);
app.use(carRoutes);
app.use(repairRoutes);
app.use(statsRoutes);
app.use(invoiceRoutes);
app.use(appointmentRoutes);
app.use(searchRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
