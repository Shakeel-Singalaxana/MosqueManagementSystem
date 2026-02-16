const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'mosque.db');
const db = new Database(dbPath);

console.log('Running distribution schema migration...');

try {
    // Create distributions table
    db.exec(`
        CREATE TABLE IF NOT EXISTS distributions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id TEXT NOT NULL,
            distribution_type TEXT NOT NULL CHECK(distribution_type IN ('ramadan', 'kanji', 'kurban')),
            year INTEGER NOT NULL,
            received_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            notes TEXT,
            FOREIGN KEY (member_id) REFERENCES members(member_id),
            UNIQUE(member_id, distribution_type, year)
        );
    `);

    console.log('✓ Distributions table created successfully');

    db.close();
    console.log('Migration completed successfully!');
} catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
}
