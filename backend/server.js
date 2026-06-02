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

const app = express();
const reactDistPath = path.join(__dirname, "..", "frontend-react", "dist");

app.use(cors());
app.use(express.json());
app.get("/invoices/:fileName", (req, res, next) => {
    if (!req.params.fileName.endsWith(".pdf")) {
        return next();
    }

    res.sendFile(path.join(__dirname, "invoices", path.basename(req.params.fileName)));
});
app.use(express.static(reactDistPath));

app.get("/", (req, res) => {
    res.sendFile(path.join(reactDistPath, "index.html"));
});

app.use(authRoutes);
app.use(customerRoutes);
app.use(carRoutes);
app.use(repairRoutes);
app.use(statsRoutes);
app.use(invoiceRoutes);
app.use(appointmentRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
