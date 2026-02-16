const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/mms.sqlite');
const db = new Database(dbPath);

console.log('Running schema updates...');

// Add member_payments table
db.exec(`
    CREATE TABLE IF NOT EXISTS member_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id TEXT NOT NULL,
        month TEXT NOT NULL,
        amount REAL NOT NULL,
        paid_date DATETIME,
        status TEXT CHECK(status IN ('paid', 'pending')) DEFAULT 'pending',
        transaction_id INTEGER,
        FOREIGN KEY (member_id) REFERENCES members(member_id),
        FOREIGN KEY (transaction_id) REFERENCES transactions(id),
        UNIQUE(member_id, month)
    );
`);

console.log('✓ member_payments table created');

// Add bills table
db.exec(`
    CREATE TABLE IF NOT EXISTS bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_type TEXT NOT NULL,
        description TEXT,
        amount REAL NOT NULL,
        due_date DATE,
        paid_date DATETIME,
        status TEXT CHECK(status IN ('paid', 'pending')) DEFAULT 'pending',
        transaction_id INTEGER,
        FOREIGN KEY (transaction_id) REFERENCES transactions(id)
    );
`);

console.log('✓ bills table created');

// Add payment settings
const upsertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
upsertSetting.run('monthly_payment_deadline', '5');
upsertSetting.run('monthly_membership_fee', '500.00');

console.log('✓ Payment settings added');

db.close();
console.log('\nSchema updates completed successfully!');
