const express = require("express");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const db = require("../db");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

const fontsDir = path.join(__dirname, "..", "fonts");
const regularFont = path.join(fontsDir, "Roboto_Condensed-Regular.ttf");
const boldFont = path.join(fontsDir, "Roboto_Condensed-Bold.ttf");
const invoicesDir = path.join(__dirname, "..", "invoices");
const pdfLogoPath = path.join(__dirname, "..", "..", "frontend", "assets", "autoservice.png");
const serviceName = "nmmotorsport";
const serviceAddress = "\u0421\u043e\u0444\u0438\u044f";
const servicePhone = "0885871616";
const serviceEmail = "service@nmmotorsport.bg";

const labels = {
    invoiceNo: "\u0424\u0430\u043a\u0442\u0443\u0440\u0430 \u2116",
    date: "\u0414\u0430\u0442\u0430",
    client: "\u041a\u043b\u0438\u0435\u043d\u0442",
    name: "\u0418\u043c\u0435",
    phone: "\u0422\u0435\u043b\u0435\u0444\u043e\u043d",
    vehicleInfo: "\u0418\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044f \u0437\u0430 \u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b",
    car: "\u041a\u043e\u043b\u0430",
    registration: "\u0420\u0435\u0433. \u043d\u043e\u043c\u0435\u0440",
    repairDescription: "\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435 \u043d\u0430 \u0440\u0435\u043c\u043e\u043d\u0442\u0430",
    mechanic: "\u041c\u0435\u0445\u0430\u043d\u0438\u043a",
    part: "\u0427\u0430\u0441\u0442",
    brand: "\u041c\u0430\u0440\u043a\u0430",
    quantity: "\u0411\u0440.",
    unitPrice: "\u0415\u0434. \u0446\u0435\u043d\u0430",
    total: "\u041e\u0431\u0449\u043e",
    noParts: "\u041d\u044f\u043c\u0430 \u0434\u043e\u0431\u0430\u0432\u0435\u043d\u0438 \u0447\u0430\u0441\u0442\u0438",
    laborHours: "\u0427\u0430\u0441\u043e\u0432\u0435 \u0442\u0440\u0443\u0434",
    hourlyPrice: "\u0426\u0435\u043d\u0430 \u043d\u0430 \u0447\u0430\u0441",
    labor: "\u0422\u0440\u0443\u0434",
    parts: "\u0427\u0430\u0441\u0442\u0438",
    finalTotal: "\u041a\u0420\u0410\u0419\u041d\u0410 \u0421\u0423\u041c\u0410",
    repairInvoice: "\u0424\u0430\u043a\u0442\u0443\u0440\u0430 \u0437\u0430 \u0440\u0435\u043c\u043e\u043d\u0442",
    thanks: "\u0411\u043b\u0430\u0433\u043e\u0434\u0430\u0440\u0438\u043c \u0412\u0438, \u0447\u0435 \u0438\u0437\u0431\u0440\u0430\u0445\u0442\u0435"
};

function money(value) {
    return `${Number(value || 0).toFixed(2)} EUR`;
}

function roundMoney(value) {
    return Math.round(Number(value || 0) * 100) / 100;
}

function ensureSpace(doc, y) {
    if (y <= 700) return y;

    doc.addPage();
    return 50;
}

function createInvoiceNumber(repairId) {
    const stamp = new Date()
        .toISOString()
        .replace(/[-:TZ.]/g, "")
        .slice(0, 17);

    return `INV-${repairId}-${stamp}`;
}

router.get("/invoices", verifyToken, (req, res) => {
    const sql = `
        SELECT
            invoices.*,
            repairs.repair_date,
            repairs.mechanic_name,
            customers.full_name AS customer_name,
            cars.brand,
            cars.model,
            cars.registration_number
        FROM invoices
        JOIN repairs ON invoices.repair_id = repairs.id
        JOIN cars ON repairs.car_id = cars.id
        JOIN customers ON cars.customer_id = customers.id
        ORDER BY invoices.id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });

        res.json(results);
    });
});

router.get("/invoices/:id", verifyToken, (req, res) => {
    const sql = `
        SELECT
            invoices.*,
            repairs.repair_date,
            repairs.mechanic_name,
            repairs.description,
            customers.full_name AS customer_name,
            customers.phone AS customer_phone,
            cars.brand,
            cars.model,
            cars.registration_number,
            cars.vin
        FROM invoices
        JOIN repairs ON invoices.repair_id = repairs.id
        JOIN cars ON repairs.car_id = cars.id
        JOIN customers ON cars.customer_id = customers.id
        WHERE invoices.id = ?
    `;

    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (results.length === 0) return res.status(404).json({ error: "Invoice not found" });

        res.json(results[0]);
    });
});

router.delete("/invoices/:id", verifyToken, (req, res) => {
    db.query("SELECT pdf_path FROM invoices WHERE id = ?", [req.params.id], (selectErr, invoices) => {
        if (selectErr) return res.status(500).json({ error: "Database error" });
        if (invoices.length === 0) return res.status(404).json({ error: "Invoice not found" });

        const pdfPath = invoices[0].pdf_path;

        db.query("DELETE FROM invoices WHERE id = ?", [req.params.id], (deleteErr) => {
            if (deleteErr) return res.status(500).json({ error: "Database error" });

            if (pdfPath) {
                const filePath = path.join(invoicesDir, path.basename(pdfPath));

                fs.unlink(filePath, (fileErr) => {
                    if (fileErr && fileErr.code !== "ENOENT") {
                        return res.json({ message: "Invoice deleted, but PDF file was not removed" });
                    }

                    res.json({ message: "Invoice deleted successfully!" });
                });

                return;
            }

            res.json({ message: "Invoice deleted successfully!" });
        });
    });
});

router.get("/invoice/:repairId", verifyToken, (req, res) => {
    const repairId = req.params.repairId;

    const sql = `
        SELECT
            repairs.id AS repair_id,
            repairs.repair_date,
            repairs.mechanic_name,
            repairs.description,
            repairs.labor_price,
            repairs.total_price,
            repairs.hours_worked,
            repairs.price_per_hour,
            customers.full_name,
            customers.phone,
            cars.brand,
            cars.model,
            cars.registration_number,
            cars.vin,
            repair_parts.part_name,
            repair_parts.brand AS part_brand,
            repair_parts.quantity,
            repair_parts.unit_price,
            repair_parts.total_price AS part_total
        FROM repairs
        JOIN cars ON repairs.car_id = cars.id
        JOIN customers ON cars.customer_id = customers.id
        LEFT JOIN repair_parts ON repairs.id = repair_parts.repair_id
        WHERE repairs.id = ?
    `;

    db.query(sql, [repairId], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (results.length === 0) return res.status(404).json({ error: "Repair not found" });

        fs.mkdirSync(invoicesDir, { recursive: true });

        const data = results[0];
        const invoiceNumber = createInvoiceNumber(repairId);
        const fileName = `invoice_${invoiceNumber}.pdf`;
        const pdfPath = `invoices/${fileName}`;
        const filePath = path.join(invoicesDir, fileName);
        const partsTotal = results.reduce((sum, part) => sum + Number(part.part_total || 0), 0);
        const invoiceTotal = roundMoney(Number(data.labor_price || 0) + partsTotal);
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(filePath);

        stream.on("finish", () => {
            const invoiceSql = `
                INSERT INTO invoices (repair_id, invoice_number, issue_date, total_amount, pdf_path)
                VALUES (?, ?, CURDATE(), ?, ?)
            `;

            db.query(invoiceSql, [repairId, invoiceNumber, invoiceTotal, pdfPath], (invoiceErr, invoiceResult) => {
                if (invoiceErr) {
                    return res.status(500).json({ error: "Invoice PDF generated, but database save failed" });
                }

                res.json({
                    message: "Invoice generated successfully!",
                    invoice_id: invoiceResult.insertId,
                    invoice_number: invoiceNumber,
                    file: pdfPath
                });
            });
        });

        stream.on("error", () => {
            if (!res.headersSent) {
                res.status(500).json({ error: "Error writing invoice PDF" });
            }
        });

        doc.pipe(stream);

        doc.rect(0, 0, 612, 90).fill("#1f2937");

        doc.fillColor("white")
            .font(boldFont)
            .fontSize(22)
            .text(serviceName.toUpperCase(), 50, 25);

        doc.font(regularFont)
            .fontSize(10)
            .text(labels.repairInvoice, 50, 54)
            .text(`${serviceAddress} | ${servicePhone} | ${serviceEmail}`, 50, 70);

        if (fs.existsSync(pdfLogoPath)) {
            doc.image(pdfLogoPath, 470, -6, {
                width: 150
            });
        }

        doc.fillColor("black")
            .font(regularFont)
            .fontSize(10)
            .text(`${labels.invoiceNo}: ${invoiceNumber}`, 400, 120)
            .text(`${labels.date}: ${new Date().toLocaleDateString("bg-BG")}`, 400, 140);

        doc.roundedRect(50, 115, 250, 100, 8).stroke();

        doc.font(boldFont)
            .fontSize(12)
            .text(labels.client, 65, 130);

        doc.font(regularFont)
            .fontSize(10)
            .text(`${labels.name}: ${data.full_name}`, 65, 155)
            .text(`${labels.phone}: ${data.phone || "-"}`, 65, 175);

        doc.roundedRect(50, 240, 500, 100, 8).stroke();

        doc.font(boldFont)
            .fontSize(12)
            .text(labels.vehicleInfo, 65, 255);

        doc.font(regularFont)
            .fontSize(10)
            .text(`${labels.car}: ${data.brand} ${data.model}`, 65, 280)
            .text(`${labels.registration}: ${data.registration_number || "-"}`, 65, 300)
            .text(`VIN: ${data.vin || "-"}`, 300, 300);

        doc.font(boldFont)
            .fontSize(12)
            .text(labels.repairDescription, 50, 370);

        doc.font(regularFont)
            .fontSize(10)
            .text(`${labels.mechanic}: ${data.mechanic_name || "-"}`, 50, 395)
            .text(data.description || "-", 50, 415, { width: 500 });

        let y = 455;

        doc.rect(50, y, 500, 25).fill("#e5e7eb");

        doc.fillColor("black")
            .font(boldFont)
            .fontSize(10);

        doc.text(labels.part, 60, y + 8);
        doc.text(labels.brand, 220, y + 8);
        doc.text(labels.quantity, 330, y + 8);
        doc.text(labels.unitPrice, 380, y + 8);
        doc.text(labels.total, 470, y + 8);

        y += 30;

        doc.font(regularFont);

        const parts = results.filter((part) => part.part_name);

        if (parts.length === 0) {
            doc.text(labels.noParts, 60, y);
            y += 25;
        }

        parts.forEach((part) => {
            y = ensureSpace(doc, y);

            doc.text(part.part_name, 60, y, { width: 150 });
            doc.text(part.part_brand || "-", 220, y, { width: 90 });
            doc.text(part.quantity || 0, 330, y);
            doc.text(money(part.unit_price), 380, y);
            doc.text(money(part.part_total), 470, y);

            y += 25;
        });

        y = ensureSpace(doc, y + 20);

        doc.moveTo(350, y).lineTo(550, y).stroke();

        doc.font(regularFont)
            .fontSize(11)
            .text(`${labels.laborHours}: ${data.hours_worked || 0}`, 380, y + 5)
            .text(`${labels.hourlyPrice}: ${money(data.price_per_hour)}`, 380, y + 20)
            .text(`${labels.labor}: ${money(data.labor_price)}`, 380, y + 35)
            .text(`${labels.parts}: ${money(partsTotal)}`, 380, y + 50);

        doc.font(boldFont)
            .fontSize(13)
            .text(`${labels.finalTotal}: ${money(invoiceTotal)}`, 380, y + 75);

        doc.font(regularFont)
            .fontSize(10)
            .fillColor("gray")
            .text(`${labels.thanks} ${serviceName}.`, 50, y + 120, {
                align: "center",
                width: 500
            });

        doc.end();
    });
});

module.exports = router;
