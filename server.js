//server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const app = express();

//Set storage location and filename format
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'uploads'));
    },
    filename:(req, file, cb) => {
        const uniqueName = Date.now() + path.extname(file.originalname);
        cb(null, uniqueName)
    }
});

// Allow only PDF files
const upload = multer ({ storage: storage, fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
}});

//Serve frontend files
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

//Upload route
app.post('/upload', (req, res) => {
    upload.single('pdfFile')(req, res, (err) => {
        //No file error handler.
        if (err) {
            // if erro occurs, show alert on frontend and refresh
            return res.json({ success: false, message: err.message });
        }

        //If no file is selected
        if (!req.file) {
        return res.json({ success: false, message: "Please select a PDF file before uploading." }); 
        }

        console.log('Upload file:', req.file.filename);
        const fileUrl = `/uploads/${req.file.filename}`;
        res.json({ success: true, fileUrl:fileUrl });
    });
});
//start server
app.listen(3000, () => console.log('Server running on http://localhost:3000'));