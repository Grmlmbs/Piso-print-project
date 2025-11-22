const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Poppler = require('pdf-poppler');
const app = express();
const { PDFDocument } = require("pdf-lib");
const fsPromise = require("fs").promises;

let lastUploadedBaseName = null;

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

const uploadsDir = path.join(__dirname, 'uploads');
const cacheDir = path.join(__dirname, 'cache');
const letterCache = path.join(cacheDir, 'letter');
const legalCache = path.join(cacheDir, 'legal');

[letterCache, legalCache].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const clearCache = folder => {
    fs.readdirSync(folder)
        .filter(f => f.endsWith('.png'))
        .forEach(f => fs.unlinkSync(path.join(folder, f)));
};

[uploadsDir, letterCache, legalCache].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

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

        // Create a new page with new paper size
        const newPage = newPdf.addPage([width, height]);

        // Embed the old page at Original size
        const embeddedPage = await newPdf.embedPage(oldPage);

        // Keep the content at top.
        const x = (width - oldW) / 2;
        const y = height - oldH;

        newPage.drawPage(embeddedPage, {
            x,
            y,
            width: oldW,
            height: oldH
        });
    }

    const pdfBytes = await newPdf.save();
    await fsPromise.writeFile(targetPath, pdfBytes);
}

app.post('/upload', async (req, res) => {
    try {
        await uploadFile(req, res);
        if (!req.file) return res.json({ success: false, message: "No file uploaded" });

        const uploadedPath = path.join(uploadsDir, req.file.filename);
        const baseName = path.parse(req.file.filename).name;

        lastUploadedBaseName = baseName;

        // Clear old cached images for this file
        clearCache(letterCache);
        clearCache(legalCache);
        // Get total pages
        const existingBytes = await fsPromise.readFile(uploadedPath);
        const pdfDoc = await PDFDocument.load(existingBytes);
        const totalPages = pdfDoc.getPageCount();

        const firstPage = pdfDoc.getPage(0);
        const { width: origW, height: origH } = firstPage.getSize();

        let originalSize = "";

        if(origW === 612 && origH === 792) {
            originalSize = "letter";
        } else if ( origW === 612 && origH === 1008) {
            originalSize = "legal";
        } else {
            // for non-standard sizes, pick letter(default)
            originalSize = origH > 900 ? "legal" : "letter";
        }
        // Generate short & long versions of the PDF
        const letterPDF = path.join(uploadsDir, baseName + "_letter.pdf");
        const legalPDF = path.join(uploadsDir, baseName + "_legal.pdf");

        await resizePDF(uploadedPath, letterPDF, 612, 792);
        await resizePDF(uploadedPath, legalPDF, 612, 1008);

        //const optsLetter = { format: 'png', out_dir: letterCache, out_prefix: baseName, page: null, dpi: 150 };
        //const optsLegal = { format: 'png', out_dir: legalCache, out_prefix: baseName, page: null, dpi: 150 };

        await Poppler.convert(letterPDF, {
            format: 'png',
            out_dir: letterCache,
            out_prefix: baseName,
            page: null,
            dpi: 150
        });
        await Poppler.convert(legalPDF, {
            format: 'png',
            out_dir: legalCache,
            out_prefix: baseName,
            page: null,
            dpi: 150
        });

        const letterImages = fs.readdirSync(letterCache)
            .filter(f => f.startsWith(baseName) && f.endsWith('.png'))
            .map(f => `/cache/letter/${f}`)
            .sort();
        const legalImages = fs.readdirSync(legalCache)
            .filter(f => f.startsWith(baseName) && f.endsWith('.png'))
            .map(f => `/cache/legal/${f}`)
            .sort();

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

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
