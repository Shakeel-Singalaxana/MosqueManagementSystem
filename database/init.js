const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../data/mms.sqlite');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, '../data'))) {
    fs.mkdirSync(path.join(__dirname, '../data'));
}

const db = new Database(dbPath);

// Create Tables
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT CHECK(role IN ('super_admin', 'accountant')) NOT NULL,
        full_name TEXT,
        synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        address TEXT,
        contact TEXT,
        registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_id TEXT UNIQUE NOT NULL,
        type TEXT CHECK(type IN ('income', 'expense')) NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        member_id TEXT,
        description TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        verified_hash TEXT,
        synced INTEGER DEFAULT 0,
        FOREIGN KEY (member_id) REFERENCES members(member_id)
    );

    CREATE TABLE IF NOT EXISTS distributions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        distribution_id TEXT UNIQUE,
        member_id TEXT NOT NULL,
        amount REAL,
        distribution_type TEXT NOT NULL,
        year INTEGER NOT NULL,
        notes TEXT,
        received_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER DEFAULT 0,
        FOREIGN KEY (member_id) REFERENCES members(member_id)
    );

    CREATE TABLE IF NOT EXISTS member_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id TEXT NOT NULL,
        amount REAL NOT NULL,
        month TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        paid_date DATETIME,
        transaction_id TEXT,
        synced INTEGER DEFAULT 0,
        FOREIGN KEY (member_id) REFERENCES members(member_id)
    );

    CREATE TABLE IF NOT EXISTS bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_type TEXT NOT NULL,
        description TEXT,
        amount REAL NOT NULL,
        due_date TEXT,
        status TEXT DEFAULT 'pending',
        paid_date DATETIME,
        transaction_id TEXT,
        synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        synced INTEGER DEFAULT 0
    );
`);

// Insert essential settings required by server.js (Only if they don't exist)
const upsertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
upsertSetting.run('mosque_name', 'Central Mosque');
upsertSetting.run('sync_interval', '5'); // Default 5 seconds
upsertSetting.run('sync_enabled', '1'); // Default enabled
upsertSetting.run('monthly_membership_fee', '500.00'); // CRITICAL: Dashboard needs this
upsertSetting.run('maintenance_threshold', '500.00');
upsertSetting.run('logo_path', '/assets/img/logo.png');
upsertSetting.run('mosque_address', '');
upsertSetting.run('mosque_phone', '');
upsertSetting.run('mosque_email', '');
upsertSetting.run('mysql_config', '');

// Insert default users (In a real app, passwords should be hashed)
const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)');
insertUser.run('admin', 'admin123', 'super_admin', 'Super Admin');
insertUser.run('accountant', 'acc123', 'accountant', 'Senior Accountant');

console.log('Database initialized successfully at:', dbPath);
db.close();
