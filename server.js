const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Poppler = require('pdf-poppler');
const app = express();
const { PDFDocument } = require("pdf-lib");
const fsPromise = require("fs").promises;
const db = require("./db");
const sharp = require('sharp');

app.use(express.json());

db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 3000');

let lastUploadedBaseName = null;

const uploadsDir = path.join(__dirname, 'uploads');
const cacheDir = path.join(__dirname, 'cache');
const letterCache = path.join(cacheDir, 'letter');
const legalCache = path.join(cacheDir, 'legal');

[uploadsDir, letterCache, legalCache].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const clearCache = folder => {
    fs.readdirSync(folder)
        .filter(f => f.endsWith('.png'))
        .forEach(f => fs.unlinkSync(path.join(folder, f)));
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
}});

app.use(express.static('public'));
app.use('/uploads', express.static(uploadsDir));
app.use('/cache', express.static(cacheDir));

function uploadFile(req, res) {
    return new Promise((resolve, reject) => {
        upload.single('pdfFile')(req, res, err => err ? reject(err) : resolve());
    });
}

async function resizePDF(originalPath, targetPath, width, height) {
    const existingBytes = await fsPromise.readFile(originalPath);
    const oldPdf = await PDFDocument.load(existingBytes);
    const newPdf = await PDFDocument.create();

    const oldPages = oldPdf.getPages();

    for (const oldPage of oldPages) {
        const {width: oldW, height: oldH } = oldPage.getSize();

        const newPage = newPdf.addPage([width, height]);
        const embeddedPage = await newPdf.embedPage(oldPage);

        const x = (width - oldW) / 2;
        const y = height - oldH;

        newPage.drawPage(embeddedPage, { x, y, width: oldW, height: oldH });
    }

    const pdfBytes = await newPdf.save();
    await fsPromise.writeFile(targetPath, pdfBytes);
}

app.delete('/delete-last/:baseName', (req, res) => {
    const baseName = req.params.baseName;
    try {
        [letterCache, legalCache].forEach(folder => {
            fs.readdirSync(folder)
                .filter(f => f.startsWith(baseName))
                .forEach(f => fs.unlinkSync(path.join(folder, f)));
        });
        [path.join(uploadsDir, baseName + '_letter.pdf'), path.join(uploadsDir, baseName + '_legal.pdf')]
            .forEach(file => {
                if(fs.existsSync(file)) fs.unlinkSync(file);
            });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: err.message });
    }
});

async function convertToBWIfNeeded(filePath, userColorChoice) {
    if (userColorChoice !== "bw") return;

    const tempPath = filePath + ".tmp";
    await sharp(filePath)
        .greyscale()
        .toFile(tempPath);
    fs.renameSync(tempPath, filePath);
}

async function scanUsedSections(filePath) {
    const img = sharp(filePath);
    const { width, height } = await img.metadata();
    const rawBuffer = await img.raw().toBuffer();

    const sectionHeight = Math.floor(height / 12);
    let totalUsedSections = 0;

    for (let i = 0; i < 12; i++) {
        let used = false;
        for (let y = i * sectionHeight; y < (i + 1) * sectionHeight; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 3; // RGB
                const r = rawBuffer[idx];
                const g = rawBuffer[idx + 1];
                const b = rawBuffer[idx + 2];

                if (!(r === g && g === b)) {
                    used = true;
                    break;
                }
            }
            if (used) break;
        }
        if (used) totalUsedSections++;
    }

    return totalUsedSections;
}

app.post('/upload', async (req, res) => {
    try {
        await uploadFile(req, res);
        if (!req.file) return res.json({ success: false, message: "No file uploaded" });

        const uploadedPath = path.join(uploadsDir, req.file.filename);
        const baseName = path.parse(req.file.filename).name;

        lastUploadedBaseName = baseName;

        clearCache(letterCache);
        clearCache(legalCache);

        const existingBytes = await fsPromise.readFile(uploadedPath);
        const pdfDoc = await PDFDocument.load(existingBytes);
        const totalPages = pdfDoc.getPageCount();

        const firstPage = pdfDoc.getPage(0);
        const { width: origW, height: origH } = firstPage.getSize();

        let originalSize = (origW === 612 && origH === 792) ? "letter" :
                           (origW === 612 && origH === 1008) ? "legal" :
                           (origH > 900 ? "legal" : "letter");

        const letterPDF = path.join(uploadsDir, baseName + "_letter.pdf");
        const legalPDF = path.join(uploadsDir, baseName + "_legal.pdf");

        await resizePDF(uploadedPath, letterPDF, 612, 792);
        await resizePDF(uploadedPath, legalPDF, 612, 1008);

        await Poppler.convert(letterPDF, { format: 'png', out_dir: letterCache, out_prefix: baseName, page: null, dpi: 150 });
        await Poppler.convert(legalPDF, { format: 'png', out_dir: legalCache, out_prefix: baseName, page: null, dpi: 150 });

        const letterImages = fs.readdirSync(letterCache)
            .filter(f => f.startsWith(baseName) && f.endsWith('.png'))
            .map(f => `/cache/letter/${f}`).sort();
        const legalImages = fs.readdirSync(legalCache)
            .filter(f => f.startsWith(baseName) && f.endsWith('.png'))
            .map(f => `/cache/legal/${f}`).sort();

        fs.unlinkSync(uploadedPath);

        res.json({ 
            success: true, 
            images: { letter: letterImages, legal: legalImages }, 
            totalPages,
            originalSize,
            baseName
        });

    } catch(err) {
        console.error(err);
        res.json({ success: false, message: err.message || 'Conversion failed' });
    }
});

app.post("/calculate-cost", async (req, res) => {
    try {
        const { paper, baseName, color, pages, copies } = req.body;
        const selectedPages = pages.split(",").map(p => Number(p.trim())).filter(n => !isNaN(n));
        const dir = path.join(cacheDir, paper);

        const files = fs.readdirSync(dir)
            .filter(f => selectedPages.includes(Number(f.replace(`${baseName}-`, "").replace(".png",""))))
            .sort();

        if (files.length === 0) return res.json({ success: false, message: "No cached images found." });

        let totalUsedSections = 0;

        for (const file of files) {
            const fullPath = path.join(dir, file);
            await convertToBWIfNeeded(fullPath, color);
            totalUsedSections += await scanUsedSections(fullPath);
        }

        const baseCost = color === "color" ? 10 : 5;
        const totalPages = selectedPages.length;
        const totalCost = Math.round((baseCost * totalPages + totalUsedSections * .50) * Number(copies));

        res.json({ success: true, totalCost, usedSections: totalUsedSections, totalPages });

    } catch (err) {
        console.error(err);
        res.json({ success: false, message: err.message });
    }
});

// Transaction routes (unchanged)
app.post('/transaction/create', (req, res) => {
    try {
        let { Date: dateString, Amount, Color, Pages, Copies, Paper_Size, File_Path, File_Size, Status } = req.body;

        if (!dateString || isNaN(new Date(dateString))) return res.json({ success: false, message: "Invalid date." });
        Amount = Number(Amount); Copies = Number(Copies);
        if (isNaN(Amount) || Amount < 0) Amount = 0;
        if (isNaN(Copies) || Copies < 1) return res.json({ success: false, message: "Invalid number of copies." });

        const allowedColors = ["bw", "color"];
        if (!allowedColors.includes(Color)) return res.json({ success: false, message: "Invalid color selection." });

        if (typeof Pages !== "string" || !Pages.match(/^[0-9,\-\s]+$/)) return res.json({ success: false, message: "Invalid page selection." });
        const allowedSizes = ["letter", "legal"];
        if (!allowedSizes.includes(Paper_Size)) return res.json({ success: false, message: "Invalid paper size." });
        if (typeof File_Path !== "string" || File_Path.length > 200) return res.json({ success: false, message: "Invalid file path." });

        const allowedStatuses = ["pending", "printing", "completed", "cancelled"];
        if (!allowedStatuses.includes(Status)) Status = "pending";

        const createTx = db.transaction(() => {
            const stmt = db.prepare(`
                INSERT INTO Transactions
                (Date, Amount, Color, Pages, Copies, Paper_Size, File_Path, File_Size, Status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            return stmt.run(dateString, Amount, Color, Pages, Copies, Paper_Size, File_Path, File_Size, Status);
        });

        const result = createTx();

        res.json({ success: true, id: result.lastInsertRowid });

    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message });
    }
});
app.post("/transaction/update", (req, res) => {
    try {
        // Extract values from client
        const { id, Amount, Status } = req.body;

        // Validate Status
        const allowedStatuses = ["pending", "printing", "completed", "cancelled"];
        const safeStatus = allowedStatuses.includes(Status)
            ? Status
            : "pending";

        // Validate Amount
        const safeAmount = isNaN(Number(Amount)) ? 0 : Number(Amount);

        // Database update
        const updateTx = db.transaction(() => {
            const stmt = db.prepare(`
                UPDATE Transactions
                SET Amount = ?, Status = ?
                WHERE Transaction_Id = ?
            `);
            return stmt.run(safeAmount, safeStatus, id);
        });

        updateTx();

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.json({
            success: false,
            message: err.message
        });
    }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
