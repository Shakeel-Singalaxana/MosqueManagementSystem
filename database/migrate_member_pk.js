const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/mms.sqlite');
const db = new Database(dbPath);

console.log('Running Member ID Primary Key Migration...');

try {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.transaction(() => {
        // 1. Create a temporary table for members with member_id as PK
        db.exec(`
            CREATE TABLE members_new (
                member_id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                address TEXT,
                contact TEXT,
                registration_date DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Transfer data to new members table
        db.exec(`
            INSERT INTO members_new (member_id, name, address, contact, registration_date)
            SELECT member_id, name, address, contact, registration_date FROM members;
        `);

        // 3. Drop old members table and rename new one
        db.exec("DROP TABLE members;");
        db.exec("ALTER TABLE members_new RENAME TO members;");

        console.log('✓ Members table updated: member_id is now Primary Key');
    })();
    db.exec('PRAGMA foreign_keys = ON;');
    console.log('\nMigration completed successfully!');
} catch (err) {
    console.error('Migration failed:', err);
} finally {
    db.close();
}
