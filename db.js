const path = require("path");
const Database = require("better-sqlite3");

// Store the .db file inside a consistent folder
const dbPath = path.join(__dirname, "db", "PisoPrintDB.db");

// open DB
const db = new Database(dbPath);

try {
    db.pragma('journal_mode = WAL');
} catch (err) {
    console.error("Failed to set WAL mode:", err);
}

// expose db
module.exports = db;