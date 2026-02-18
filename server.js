const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const session = require('express-session');
const dotenv = require('dotenv');
const crypto = require('crypto');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const sqliteDb = new Database(path.join(__dirname, 'data/mms.sqlite'));
const mysql = require('mysql2/promise');

let activeDb = null;
let dbMode = 'sqlite'; // fallback
let mosqueName = 'MOSQUE MANAGEMENT SYSTEM';

// Database Abstraction Layer (Now Local-First)
const dbManager = {
    async query(sql, params = []) {
        // ALWAYS read from local SQLite
        return sqliteDb.prepare(sql).all(params);
    },
    async get(sql, params = []) {
        // ALWAYS read from local SQLite
        return sqliteDb.prepare(sql).get(params);
    },
    async run(sql, params = []) {
        // ALWAYS write to local SQLite
        const info = sqliteDb.prepare(sql).run(params);
        return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
    },
    async transaction(callback) {
        // ALWAYS local transaction
        const tx = sqliteDb.transaction(callback);
        return tx();
    }
};

const syncStatus = {
    lastSync: null,
    status: 'idle', // idle, syncing, error
    error: null,
    pendingCount: 0,
    interval: 5000,
    timer: null,
    enabled: true
};

// Background Sync Service
const SyncService = {
    async initialize() {
        const intervalSetting = sqliteDb.prepare("SELECT value FROM settings WHERE key = 'sync_interval'").get();
        if (intervalSetting) {
            syncStatus.interval = parseInt(intervalSetting.value) * 1000;
        }
        const enabledSetting = sqliteDb.prepare("SELECT value FROM settings WHERE key = 'sync_enabled'").get();
        syncStatus.enabled = enabledSetting ? enabledSetting.value === '1' : true;

        if (syncStatus.enabled) this.startTimer();
    },

    startTimer() {
        if (syncStatus.timer) clearInterval(syncStatus.timer);
        syncStatus.timer = setInterval(() => this.sync(), syncStatus.interval);
    },

    async sync() {
        if (!syncStatus.enabled) return;
        if (syncStatus.status === 'syncing') return;

        const configEntry = sqliteDb.prepare("SELECT value FROM settings WHERE key = 'mysql_config'").get();
        if (!configEntry || !configEntry.value) {
            syncStatus.status = 'idle';
            syncStatus.error = "Remote DB not configured";
            return;
        }

        syncStatus.status = 'syncing';
        syncStatus.error = null;

        let remoteConn = null;
        try {
            const config = JSON.parse(configEntry.value);
            remoteConn = await mysql.createConnection({ ...config, connectTimeout: 5000 });

            // Ensure schema exists on remote
            await this.ensureRemoteSchema(remoteConn);

            const tables = ['users', 'members', 'transactions', 'distributions', 'member_payments', 'bills', 'settings'];
            let totalPending = 0;

            for (const table of tables) {
                const pendingRows = sqliteDb.prepare(`SELECT * FROM ${table} WHERE synced = 0`).all();
                totalPending += pendingRows.length;

                for (const row of pendingRows) {
                    await this.upsertToRemote(remoteConn, table, row);
                    sqliteDb.prepare(`UPDATE ${table} SET synced = 1 WHERE ${this.getPK(table)} = ?`).run(row[this.getPK(table)]);
                }
            }

            syncStatus.pendingCount = totalPending;
            syncStatus.lastSync = new Date().toISOString();
            syncStatus.status = 'idle';

        } catch (err) {
            console.error('Sync Error:', err.message);
            syncStatus.status = 'error';
            syncStatus.error = err.message;
        } finally {
            if (remoteConn) await remoteConn.end();
            this.updatePendingCount();
        }
    },

    updatePendingCount() {
        const tables = ['users', 'members', 'transactions', 'distributions', 'member_payments', 'bills', 'settings'];
        let count = 0;
        tables.forEach(t => {
            const res = sqliteDb.prepare(`SELECT COUNT(*) as count FROM ${t} WHERE synced = 0`).get();
            count += res.count;
        });
        syncStatus.pendingCount = count;
    },

    getPK(table) {
        if (table === 'settings') return 'key';
        if (table === 'members') return 'member_id';
        if (table === 'transactions') return 'receipt_id';
        if (table === 'distributions') return 'distribution_id';
        return 'id';
    },

    async upsertToRemote(conn, table, row) {
        const keys = Object.keys(row).filter(k => k !== 'synced');
        const values = keys.map(k => row[k]);
        const placeholders = keys.map(() => '?').join(', ');
        const updates = keys.map(k => `${k} = VALUES(${k})`).join(', ');

        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
        await conn.execute(sql, values);
    },

    async ensureRemoteSchema(conn) {
        // Create tables on MySQL if they don't exist
        await conn.execute(`CREATE TABLE IF NOT EXISTS settings ( \`key\` VARCHAR(255) PRIMARY KEY, value TEXT )`);
        await conn.execute(`CREATE TABLE IF NOT EXISTS users ( id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(255) UNIQUE, password TEXT, role VARCHAR(50), full_name TEXT )`);
        await conn.execute(`CREATE TABLE IF NOT EXISTS members ( id INT AUTO_INCREMENT PRIMARY KEY, member_id VARCHAR(50) UNIQUE, name TEXT, address TEXT, contact TEXT, registration_date DATETIME )`);
        await conn.execute(`CREATE TABLE IF NOT EXISTS transactions ( id INT AUTO_INCREMENT PRIMARY KEY, receipt_id VARCHAR(100) UNIQUE, type VARCHAR(20), category VARCHAR(100), amount DECIMAL(15,2), member_id VARCHAR(50), description TEXT, timestamp DATETIME, verified_hash TEXT, proof_image LONGTEXT )`);
        await conn.execute(`CREATE TABLE IF NOT EXISTS distributions ( id INT AUTO_INCREMENT PRIMARY KEY, distribution_id VARCHAR(100) UNIQUE, member_id VARCHAR(50), amount DECIMAL(15,2), distribution_type VARCHAR(50), year INT, notes TEXT, received_date DATETIME )`);
        await conn.execute(`CREATE TABLE IF NOT EXISTS member_payments ( id INT AUTO_INCREMENT PRIMARY KEY, member_id VARCHAR(50), amount DECIMAL(15,2), month VARCHAR(20), status VARCHAR(20), paid_date DATETIME, transaction_id VARCHAR(100) )`);
        await conn.execute(`CREATE TABLE IF NOT EXISTS bills ( id INT AUTO_INCREMENT PRIMARY KEY, bill_type VARCHAR(100), description TEXT, amount DECIMAL(15,2), due_date VARCHAR(50), status VARCHAR(20), paid_date DATETIME, transaction_id VARCHAR(100) )`);
    }
};

async function initDatabase() {
    try {
        // Ensure proof_image column exists in transactions
        try {
            sqliteDb.prepare("ALTER TABLE transactions ADD COLUMN proof_image TEXT").run();
            console.log("✅ Added proof_image column to transactions table.");
        } catch (err) {
            // Column likely exists
        }

        const nameRow = sqliteDb.prepare("SELECT value FROM settings WHERE key = 'mosque_name'").get();
        if (nameRow) mosqueName = nameRow.value;

        console.log(`✅ Local SQLite Initialized (${mosqueName}). Starting Sync Service...`);
        SyncService.initialize();
    } catch (err) {
        console.error("❌ DB Init Failed:", err.message);
    }
}

initDatabase();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'mosque-secret-key-123',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Middleware to check authentication
const isAuthenticated = (roles) => {
    return (req, res, next) => {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (roles && !roles.includes(req.session.user.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    };
};

// --- CORE LOGIC HELPERS ---

/**
 * Centrally manages transaction recording and security.
 * @returns {string} The receipt ID
 */
async function recordTransaction(type, category, amount, member_id = null, description = '', proof_image = null) {
    const timestamp = new Date().toISOString();
    const receipt_id = `REC-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    // Enhanced Hash Generation (SHA-256)
    const salt = 'mosque-mms-2026-audit-secret';
    const hashPayload = `${receipt_id}|${amount}|${timestamp}|${member_id}|${salt}`;
    const verified_hash = crypto.createHash('sha256').update(hashPayload).digest('hex').substring(0, 16);

    const sql = `
        INSERT INTO transactions (receipt_id, type, category, amount, member_id, description, verified_hash, timestamp, proof_image, synced) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `;

    const info = await dbManager.run(sql, [receipt_id, type, category, parseFloat(amount), member_id || null, description, verified_hash, timestamp, proof_image]);
    console.log(`Transaction logged [${type.toUpperCase()}]: ${receipt_id} - Rs. ${amount}`);
    return { receipt_id, transaction_id: info.lastInsertRowid };
}

/**
 * Calculates months to check, ensuring current month is included.
 * Returns [currentMonth, lastMonth, ...] reversed to be chronological.
 */
function getPaymentMonths(limit = 6) {
    const months = [];
    const currentDate = new Date();
    // Ensure we start from the current month
    currentDate.setDate(1);

    for (let i = 0; i < limit; i++) {
        const date = new Date(currentDate);
        date.setMonth(currentDate.getMonth() - i);
        months.push(date.toISOString().substring(0, 7));
    }
    return months.reverse();
}

/**
 * Calculates the next available numeric member ID.
 */
async function getNextMemberId() {
    const sql = "SELECT member_id FROM members WHERE member_id REGEXP '^[0-9]+$' ORDER BY CAST(member_id AS UNSIGNED) DESC LIMIT 1";
    // better-sqlite3 uses GLOB, MySQL uses REGEXP. I'll normalize if needed or just use a simple one for now.
    // Actually GLOB is sqlite only.
    const query = dbMode === 'mysql'
        ? "SELECT member_id FROM members WHERE member_id REGEXP '^[0-9]+$' ORDER BY CAST(member_id AS UNSIGNED) DESC LIMIT 1"
        : "SELECT member_id FROM members WHERE member_id GLOB '[0-9]*' ORDER BY CAST(member_id AS INTEGER) DESC LIMIT 1";

    const lastMember = await dbManager.get(query);
    if (!lastMember) return '1001'; // Start from 1001 if no numeric IDs exist
    const nextId = parseInt(lastMember.member_id) + 1;
    return nextId.toString();
}

// --- AUTH ROUTES ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await dbManager.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);

    if (user) {
        req.session.user = { id: user.id, username: user.username, role: user.role, name: user.full_name };
        res.json({ success: true, user: req.session.user });
    } else {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/me', (req, res) => {
    if (req.session.user) {
        res.json(req.session.user);
    } else {
        res.status(401).json({ error: 'Not logged in' });
    }
});

// Change Password (Authenticated)
app.post('/api/user/change-password', isAuthenticated(['super_admin', 'accountant']), async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.session.user.id;

    try {
        const user = await dbManager.get('SELECT * FROM users WHERE id = ? AND password = ?', [userId, oldPassword]);
        if (!user) {
            return res.status(401).json({ success: false, error: 'Incorrect current password' });
        }

        await dbManager.run('UPDATE users SET password = ?, synced = 0 WHERE id = ?', [newPassword, userId]);
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to change password' });
    }
});

// Super Password Reset (Public)
app.post('/api/user/reset-password-super', async (req, res) => {
    const { username, superPassword, newPassword } = req.body;

    if (superPassword !== 'Shakbrotech@mms#1206') {
        return res.status(403).json({ success: false, error: 'Invalid Super Password' });
    }

    try {
        const user = await dbManager.get('SELECT * FROM users WHERE username = ?', [username]);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        await dbManager.run('UPDATE users SET password = ?, synced = 0 WHERE username = ?', [newPassword, username]);
        res.json({ success: true, message: 'Password reset successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to reset password' });
    }
});

// --- DISTRIBUTION MANAGEMENT APIs ---
app.get('/api/distributions/:type/:year', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    const { type, year } = req.params;

    try {
        const sql = `
            SELECT d.*, m.name, m.contact 
            FROM distributions d
            JOIN members m ON d.member_id = m.member_id
            WHERE d.distribution_type = ? AND d.year = ?
            ORDER BY d.received_date DESC
        `;
        const distributions = await dbManager.query(sql, [type, parseInt(year)]);

        res.json(distributions);
    } catch (err) {
        console.error('Get distributions error:', err);
        res.status(500).json({ error: 'Failed to get distributions' });
    }
});

app.get('/api/distributions/:type/:year/eligible', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    const { type, year } = req.params;
    const { minMonthsPaid } = req.query; // Filter: minimum months paid

    try {
        // Get all members
        const members = await dbManager.query('SELECT * FROM members ORDER BY name ASC');

        // Get distribution records for this type/year
        const receivedSql = `SELECT member_id FROM distributions WHERE distribution_type = ? AND year = ?`;
        const distributions = await dbManager.query(receivedSql, [type, parseInt(year)]);
        const receivedSet = new Set(distributions.map(d => d.member_id));

        // Get payment counts for the last 6 months (as per original logic)
        const monthsToCheck = getPaymentMonths(6);
        const placeholders = monthsToCheck.map(() => '?').join(',');
        const paymentsSql = `
            SELECT member_id, COUNT(*) as count 
            FROM member_payments 
            WHERE status = 'paid' AND month IN (${placeholders})
            GROUP BY member_id
        `;
        const payments = await dbManager.query(paymentsSql, monthsToCheck);
        const paymentCounts = {};
        payments.forEach(p => paymentCounts[p.member_id] = p.count);

        const eligibleMembers = members.map(m => {
            const paidCount = paymentCounts[m.member_id] || 0;
            return {
                ...m,
                paidCount,
                received: receivedSet.has(m.member_id)
            };
        });

        // Filter by minimum months paid if specified
        const filtered = minMonthsPaid
            ? eligibleMembers.filter(m => m.paidCount >= parseInt(minMonthsPaid))
            : eligibleMembers;

        res.json(filtered);
    } catch (err) {
        console.error('Get eligible members error:', err);
        res.status(500).json({ error: 'Failed to get eligible members' });
    }
});

app.post('/api/distributions', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    const { member_id, distribution_type, year, notes } = req.body;

    try {
        const sql = `
            INSERT OR REPLACE INTO distributions (member_id, distribution_type, year, notes, synced)
            VALUES (?, ?, ?, ?, 0)
        `;
        const info = await dbManager.run(sql, [member_id, distribution_type, parseInt(year), notes || '']);

        // FINANCIAL MISHAP FIX: Distributions are expenses
        await recordTransaction('expense', `distribution_${distribution_type.toLowerCase()}`, 0, member_id, `Distribution Received: ${distribution_type} ${year}`);

        res.json({ success: true, id: info.lastInsertRowid });
    } catch (err) {
        console.error('Record distribution error:', err);
        res.status(400).json({ error: 'Failed to record distribution' });
    }
});

app.delete('/api/distributions/:id', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    const { id } = req.params;

    try {
        await dbManager.run('DELETE FROM distributions WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete distribution error:', err);
        res.status(400).json({ error: 'Failed to delete distribution' });
    }
});

// --- SETTINGS ---
app.get('/api/settings', async (req, res) => {
    const settings = await dbManager.query('SELECT * FROM settings');
    const settingsObj = {};
    settings.forEach(s => settingsObj[s.key] = s.value);
    res.json(settingsObj);
});

// Logo Upload Configuration
const logoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'public/assets/logos');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `mosque-logo-${Date.now()}${ext}`);
    }
});
const uploadLogo = multer({ storage: multer.memoryStorage() }); // Store in memory to convert to base64

app.post('/api/settings/logo', isAuthenticated(['super_admin']), uploadLogo.single('logo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Convert buffer to base64
        const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

        // Save to DB
        await dbManager.run("INSERT OR REPLACE INTO settings (key, value, synced) VALUES (?, ?, 0)", ['logo_data', base64Image]);

        // Also update path for backward compatibility if needed, but we prefer data URI now
        // await dbManager.run("INSERT OR REPLACE INTO settings (key, value, synced) VALUES (?, ?, 0)", ['logo_path', base64Image]);

        res.json({ success: true, logo_data: base64Image });
    } catch (err) {
        console.error('Logo upload error:', err);
        res.status(500).json({ error: 'Failed to upload logo' });
    }
});


// --- MEMBERSHIP APIs ---
app.get('/api/members', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    const members = await dbManager.query('SELECT * FROM members ORDER BY name ASC');
    res.json(members);
});

app.get('/api/members/next-id', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    try {
        res.json({ nextId: await getNextMemberId() });
    } catch (err) {
        res.status(500).json({ error: 'Failed to calculate next ID' });
    }
});

app.post('/api/members', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    let { name, address, contact, member_id } = req.body;
    let autoAssigned = false;

    try {
        // If ID provided, check for duplication
        if (member_id) {
            const existing = await dbManager.get('SELECT 1 FROM members WHERE member_id = ?', [member_id]);
            if (existing) {
                // Duplicate found! Assign next available ID
                member_id = await getNextMemberId();
                autoAssigned = true;
            }
        } else {
            // No ID provided, assign next available
            member_id = await getNextMemberId();
            autoAssigned = true;
        }

        const sql = 'INSERT INTO members (member_id, name, address, contact, synced) VALUES (?, ?, ?, ?, 0)';
        await dbManager.run(sql, [member_id, name, address, contact]);
        res.json({ success: true, member_id, autoAssigned });
    } catch (err) {
        console.error('Add member error:', err);
        res.status(400).json({ error: 'Failed to add member' });
    }
});

app.get('/api/members/:id/statement', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    const { id } = req.params;
    // Hide reversals from statements for everyone (cleaner statement)
    const historySql = `
        SELECT * FROM transactions 
        WHERE member_id = ? 
        AND category != 'reversal' 
        AND description NOT LIKE '%(REVERTED)%'
        ORDER BY timestamp DESC
    `;
    const history = await dbManager.query(historySql, [id]);
    const member = await dbManager.get('SELECT * FROM members WHERE member_id = ?', [id]);
    res.json({ member, history });
});

app.post('/api/members/import', isAuthenticated(['accountant', 'super_admin']), multer({ dest: 'uploads/' }).single('file'), async (req, res) => {
    try {
        let data = [];
        let source = '';

        // 1. Parse File or Raw Data
        if (req.file) {
            source = req.file.originalname;
            const workbook = xlsx.readFile(req.file.path);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            data = xlsx.utils.sheet_to_json(sheet);
            fs.unlinkSync(req.file.path); // Cleanup
        } else if (req.body.csvData) {
            source = 'Paste Data';
            const lines = req.body.csvData.trim().split('\n');
            const headers = lines[0].split(',').map(h => h.trim());
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(s => s?.trim());
                if (values.length === headers.length) {
                    const row = {};
                    headers.forEach((h, idx) => row[h] = values[idx]);
                    data.push(row);
                }
            }
        } else {
            return res.status(400).json({ error: 'No file or data provided' });
        }

        // 2. Normalize Headers Helper
        const normalize = (row) => {
            const keys = Object.keys(row);
            const norm = {};

            // Heuristics for mapping
            const findKey = (patterns) => keys.find(k => patterns.some(p => k.toLowerCase().includes(p)));

            norm.id = row[findKey(['id', 'member_id', 'no'])]?.toString();
            norm.name = row[findKey(['name', 'full name', 'member name'])];
            norm.address = row[findKey(['address', 'location', 'residence'])] || '';
            norm.contact = row[findKey(['contact', 'phone', 'mobile', 'tel'])] || '';

            return norm;
        };

        // 3. Process Rows
        let success = 0;
        let errors = [];

        // RE-IMPLEMENTING LOOP WITHOUT HUGE TRANSACTION TO ALLOW PARTIAL SUCCESS
        for (let i = 0; i < data.length; i++) {
            const rawRow = data[i];
            const row = normalize(rawRow);
            const rowNum = i + 2;

            if (!row.name) {
                errors.push({ row: rowNum, error: 'Missing Name', data: rawRow });
                continue;
            }
            if (!row.id) {
                errors.push({ row: rowNum, error: 'Missing Member ID', data: rawRow });
                continue;
            }

            try {
                // Check duplicate first to give nice error
                const exists = await dbManager.get('SELECT 1 FROM members WHERE member_id = ?', [row.id]);
                if (exists) {
                    errors.push({ row: rowNum, error: `ID ${row.id} already exists`, data: rawRow });
                    continue;
                }

                await dbManager.run(
                    'INSERT INTO members (member_id, name, address, contact, synced) VALUES (?, ?, ?, ?, 0)',
                    [row.id, row.name, row.address, row.contact]
                );
                success++;
            } catch (err) {
                errors.push({ row: rowNum, error: 'Database Error', data: rawRow });
            }
        }

        res.json({ success, failed: errors.length, errors });

    } catch (err) {
        console.error('Import Error:', err);
        res.status(500).json({ error: 'Import process failed: ' + err.message });
    }
});

// Template Download Route
app.get('/api/members/import-template', (req, res) => {
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet([
        ['Member ID', 'Full Name', 'Address', 'Contact Number'],
        ['1001', 'John Doe', '123 Main St', '0771234567'],
        ['1002', 'Jane Smith', '456 Mosque Rd', '0719876543']
    ]);
    xlsx.utils.book_append_sheet(wb, ws, "Template");
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Member_Import_Template.xlsx');
    res.send(buffer);
});

app.get('/api/members/export', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    try {
        const members = await dbManager.query('SELECT * FROM members ORDER BY member_id ASC');
        const months = getPaymentMonths(12);
        const feeSetting = await dbManager.get("SELECT value FROM settings WHERE key = 'monthly_membership_fee'");
        const monthlyFee = parseFloat(feeSetting?.value || 500);

        const headerRows = [
            [mosqueName.toUpperCase()],
            ['MEMBERSHIP PAYMENT AUDIT REPORT'],
            [`Exported on: ${new Date().toLocaleString()}`],
            [''],
            ['ID', 'Name', 'Address', 'Contact', 'Status', 'Total Paid (Rs.)', ...months]
        ];

        const dataRows = [];
        for (const m of members) {
            let totalPaidForMember = 0;
            const monthStatuses = [];
            for (const month of months) {
                const payment = await dbManager.get(`
                    SELECT status FROM member_payments 
                    WHERE member_id = ? AND month = ? AND status = 'paid'
                `, [m.member_id, month]);

                if (payment) {
                    const isReverted = await dbManager.get(`
                        SELECT 1 FROM transactions 
                        WHERE member_id = ? AND category = 'membership_fee' 
                        AND description LIKE ? AND description LIKE '%(REVERTED)%'
                    `, [m.member_id, `%${month}%`]);

                    if (!isReverted) {
                        totalPaidForMember += monthlyFee;
                        monthStatuses.push('PAID');
                    } else {
                        monthStatuses.push('PENDING');
                    }
                } else {
                    monthStatuses.push('PENDING');
                }
            }

            dataRows.push([
                m.member_id, m.name, m.address, m.contact, 'ACTIVE',
                totalPaidForMember.toFixed(2), ...monthStatuses
            ]);
        }

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.aoa_to_sheet([...headerRows, ...dataRows]);
        xlsx.utils.book_append_sheet(wb, ws, "Members Report");
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Members_Payment_Audit.xlsx');
        res.send(buffer);
    } catch (err) {
        console.error('Export Error:', err);
        res.status(500).json({ error: 'Export failed' });
    }
});

// --- TRANSACTION APIs ---
app.get('/api/transactions', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    const isSuperAdmin = req.session.user.role === 'super_admin';
    let query = `
        SELECT t.*, m.name as member_name 
        FROM transactions t 
        LEFT JOIN members m ON t.member_id = m.member_id 
    `;

    // If accountant, hide reversals and original reverted records
    if (!isSuperAdmin) {
        query += ` WHERE t.category != 'reversal' AND t.description NOT LIKE '%(REVERTED)%' `;
    }

    query += ` ORDER BY timestamp DESC LIMIT 100 `;

    const transactions = await dbManager.query(query);
    res.json(transactions);
});

app.get('/api/transactions/export', isAuthenticated(['super_admin']), async (req, res) => {
    try {
        const sql = `
            SELECT t.*, m.name as member_name 
            FROM transactions t 
            LEFT JOIN members m ON t.member_id = m.member_id 
            ORDER BY timestamp DESC
        `;
        const transactions = await dbManager.query(sql);

        // 1. Prepare Header Section
        const header = [
            [mosqueName.toUpperCase()],
            ['FULL FINANCIAL AUDIT LOG'],
            [`Exported on: ${new Date().toLocaleString()}`],
            [''], // Spacer
            ['Date', 'Receipt ID', 'Type', 'Category', 'Amount (Rs.)', 'Member', 'Description', 'Verified Hash', 'Has Proof']
        ];

        // 2. Prepare Data Rows
        const dataRows = transactions.map(t => [
            new Date(t.timestamp).toLocaleString(),
            t.receipt_id,
            t.type.toUpperCase(),
            t.category.replace('_', ' ').toUpperCase(),
            t.amount.toFixed(2),
            t.member_name || t.member_id || 'N/A',
            t.description,
            t.verified_hash,
            t.proof_image ? 'YES' : 'NO'
        ]);

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.aoa_to_sheet([...header, ...dataRows]);

        // 3. Set Column Widths for better formatting
        ws['!cols'] = [
            { wch: 20 }, // Date
            { wch: 25 }, // Receipt ID
            { wch: 10 }, // Type
            { wch: 20 }, // Category
            { wch: 15 }, // Amount
            { wch: 20 }, // Member
            { wch: 40 }, // Description
            { wch: 18 }, // Hash
            { wch: 10 }  // Has Proof
        ];

        // 4. Add some merging for the header
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, // Mosque Name
            { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }, // Title
            { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } }  // Exported on
        ];
        xlsx.utils.book_append_sheet(wb, ws, "Audit Log");

        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Mosque_Audit_Report.xlsx');
        res.send(buffer);
    } catch (err) {
        console.error('Audit Export Error:', err);
        res.status(500).json({ error: 'Export failed' });
    }
});

app.get('/api/transactions/export-visual', isAuthenticated(['super_admin']), async (req, res) => {
    try {
        const sql = `
            SELECT t.*, m.name as member_name 
            FROM transactions t 
            LEFT JOIN members m ON t.member_id = m.member_id 
            ORDER BY timestamp DESC
        `;
        const transactions = await dbManager.query(sql);
        const settings = await dbManager.query('SELECT * FROM settings');
        const settingsObj = {};
        settings.forEach(s => settingsObj[s.key] = s.value);

        const logoSrc = settingsObj.logo_data || settingsObj.logo_path || '/assets/img/logo.png';
        const mosqueName = settingsObj.mosque_name || 'MOSQUE MANAGEMENT SYSTEM';

        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Visual Audit Report</title>
                <style>
                    body { font-family: sans-serif; padding: 20px; color: #000; }
                    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 20px; }
                    .logo { height: 80px; width: 80px; object-fit: contain; }
                    h1 { margin: 10px 0; }
                    .transaction { page-break-inside: avoid; border: 1px solid #ccc; padding: 15px; margin-bottom: 20px; display: flex; gap: 20px; }
                    .details { flex: 1; }
                    .proof { width: 300px; text-align: center; border-left: 1px solid #eee; padding-left: 20px; display: flex; flex-direction: column; justify-content: center; }
                    .proof img { max-width: 100%; max-height: 200px; object-fit: contain; border: 1px solid #ddd; }
                    .label { font-weight: bold; color: #666; font-size: 12px; }
                    .value { font-size: 16px; margin-bottom: 8px; }
                    .amount { font-size: 20px; font-weight: bold; color: #333; }
                    .income { color: green; }
                    .expense { color: red; }
                    @media print {
                        .no-print { display: none; }
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="no-print" style="position: fixed; top: 10px; right: 10px; background: white; padding: 10px; border: 1px solid #ccc; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
                    <button onclick="window.print()" style="font-size: 16px; padding: 5px 15px; cursor: pointer;">🖨️ PRINT / SAVE AS PDF</button>
                </div>
                <div class="header">
                    <img src="${logoSrc}" class="logo">
                    <h1>${mosqueName}</h1>
                    <h2>VISUAL FINANCIAL AUDIT REPORT</h2>
                    <p>Generated on: ${new Date().toLocaleString()}</p>
                </div>
        `;

        if (transactions.length === 0) {
            html += '<p style="text-align: center; font-style: italic;">No transactions found.</p>';
        } else {
            transactions.forEach(t => {
                const typeClass = t.type === 'income' ? 'income' : 'expense';
                html += `
                    <div class="transaction">
                        <div class="details">
                            <div class="label">RECEIPT ID</div>
                            <div class="value">${t.receipt_id}</div>
                            
                            <div class="label">DATE</div>
                            <div class="value">${new Date(t.timestamp).toLocaleString()}</div>
                            
                            <div class="label">TYPE / CATEGORY</div>
                            <div class="value" style="text-transform: uppercase;">
                                <strong class="${typeClass}">${t.type}</strong> - ${t.category.replace('_', ' ')}
                            </div>
                            
                            <div class="label">MEMBER / PARTY</div>
                            <div class="value">${t.member_name || t.member_id || (t.type === 'income' ? 'Anonymous' : 'External Party')}</div>
                            
                            <div class="label">DESCRIPTION</div>
                            <div class="value">${t.description}</div>
                            
                            <div class="label">AMOUNT</div>
                            <div class="value amount ${typeClass}">Rs. ${parseFloat(t.amount).toFixed(2)}</div>

                            <div class="label" style="margin-top: 10px;">VERIFIED HASH</div>
                            <div class="value" style="font-family: monospace; font-size: 12px; color: #888;">${t.verified_hash}</div>
                        </div>
                        <div class="proof">
                            ${t.proof_image
                        ? `<img src="${t.proof_image}"><p style="margin-top: 5px; font-size: 12px; color: #666;">Proof of Transaction</p>`
                        : `<div style="padding: 20px; background: #f9f9f9; color: #aaa; font-style: italic;">No Digital Proof</div>`
                    }
                        </div>
                    </div>
                `;
            });
        }

        html += `
                <div style="margin-top: 40px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ccc; padding-top: 10px;">
                    &copy; 2026 ShakBrotech | System by Shakeel Singalaxana
                </div>
            </body>
            </html>
        `;

        res.send(html);
    } catch (err) {
        console.error('Visual Export Error:', err);
        res.status(500).send('Failed to generate report');
    }
});

app.get('/api/transactions/:id', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    try {
        const transaction = await dbManager.get(
            `SELECT t.*, m.name as member_name 
             FROM transactions t 
             LEFT JOIN members m ON t.member_id = m.member_id 
             WHERE t.receipt_id = ?`,
            [req.params.id]
        );
        if (transaction) {
            res.json(transaction);
        } else {
            res.status(404).json({ error: 'Transaction not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch transaction' });
    }
});

app.post('/api/transactions', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    const { type, category, amount, member_id, description, proof_image } = req.body;

    try {
        const { receipt_id } = await recordTransaction(type, category, amount, member_id, description, proof_image);
        res.json({ success: true, receipt_id });
    } catch (err) {
        console.error('Database Error:', err);
        res.status(400).json({ error: 'Failed to record transaction: ' + err.message });
    }
});

// --- DASHBOARD STATS ---
app.get('/api/dashboard/stats', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    try {
        const incomeSql = "SELECT SUM(amount) as sum FROM transactions WHERE type = 'income' AND category != 'reversal' AND description NOT LIKE '%(REVERTED)%'";
        const expenseSql = "SELECT SUM(amount) as sum FROM transactions WHERE type = 'expense' AND category != 'reversal' AND description NOT LIKE '%(REVERTED)%'";

        const incomeRow = await dbManager.get(incomeSql);
        const expenseRow = await dbManager.get(expenseSql);

        const stats = {
            total_income: incomeRow.sum || 0,
            total_expense: expenseRow.sum || 0,
            pending_fees: 0,
            pending_bills: 0,
            maintenance_balance: 0
        };

        // Calculate pending member fees across ALL months (last 6 months)
        const feeSetting = await dbManager.get("SELECT value FROM settings WHERE key = 'monthly_membership_fee'");
        const monthlyFee = parseFloat(feeSetting?.value || 500);

        const countRow = await dbManager.get("SELECT COUNT(*) as count FROM members");
        const totalMembers = countRow.count;

        const monthsToCheck = getPaymentMonths(6);

        // Count total unpaid fees across all months
        let totalPendingCount = 0;
        for (const month of monthsToCheck) {
            const paidCountRow = await dbManager.get("SELECT COUNT(*) as count FROM member_payments WHERE month = ? AND status = 'paid'", [month]);
            totalPendingCount += Math.max(0, totalMembers - paidCountRow.count);
        }

        stats.pending_fees = totalPendingCount * monthlyFee;

        // Calculate pending bills
        const billsRow = await dbManager.get("SELECT SUM(amount) as sum FROM bills WHERE status = 'pending'");
        stats.pending_bills = billsRow.sum || 0;

        stats.maintenance_balance = stats.total_income - stats.total_expense;
        res.json(stats);
    } catch (err) {
        console.error('Dashboard stats error:', err);
        res.status(500).json({ error: 'Failed to calculate stats' });
    }
});



// --- MEMBER PAYMENTS APIs ---
app.get('/api/member-payments', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    const { month } = req.query;
    let query = `
        SELECT mp.*, m.name as member_name 
        FROM member_payments mp
        LEFT JOIN members m ON mp.member_id = m.member_id
    `;

    if (month) {
        query += ` WHERE mp.month = ?`;
        const payments = await dbManager.query(query + ' ORDER BY mp.status DESC, m.name ASC', [month]);
        res.json(payments);
    } else {
        const payments = await dbManager.query(query + ' ORDER BY mp.month DESC, mp.status DESC');
        res.json(payments);
    }
});

app.get('/api/pending-fees', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    try {
        const currentMonth = new Date().toISOString().substring(0, 7);
        const feeSetting = await dbManager.get("SELECT value FROM settings WHERE key = 'monthly_membership_fee'");
        const monthlyFee = parseFloat(feeSetting?.value || 500);

        // Get all members and their payment status for current month
        const sql = `
            SELECT 
                m.member_id, 
                m.name, 
                m.contact,
                COALESCE(mp.status, 'pending') as status,
                COALESCE(mp.paid_date, NULL) as paid_date
            FROM members m
            LEFT JOIN member_payments mp ON m.member_id = mp.member_id AND mp.month = ?
            ORDER BY status DESC, m.name ASC
        `;
        const members = await dbManager.query(sql, [currentMonth]);

        res.json({ members, monthlyFee, currentMonth });
    } catch (err) {
        console.error('Pending fees error:', err);
        res.status(500).json({ error: 'Failed to calculate pending fees' });
    }
});

app.get('/api/member-payments/:member_id/history', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    try {
        const { member_id } = req.params;
        const feeSetting = await dbManager.get("SELECT value FROM settings WHERE key = 'monthly_membership_fee'");
        const monthlyFee = parseFloat(feeSetting?.value || 500);

        // Get all payment records for this member
        const payments = await dbManager.query('SELECT * FROM member_payments WHERE member_id = ? ORDER BY month DESC', [member_id]);

        // Generate list of months from member join date to current month
        const member = await dbManager.get('SELECT * FROM members WHERE member_id = ?', [member_id]);
        if (!member) {
            return res.status(404).json({ error: 'Member not found' });
        }

        const monthsToCheck = getPaymentMonths(6);

        // Build payment status for each month
        const paymentMap = {};
        payments.forEach(p => {
            paymentMap[p.month] = p;
        });

        const history = monthsToCheck.map(month => ({
            month,
            status: paymentMap[month]?.status || 'pending',
            amount: monthlyFee,
            paid_date: paymentMap[month]?.paid_date || null,
            id: paymentMap[month]?.id || null
        }));

        res.json({ history, monthlyFee, member });
    } catch (err) {
        console.error('Payment history error:', err);
        res.status(500).json({ error: 'Failed to get payment history' });
    }
});

app.post('/api/member-payments/mark-paid', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    const { member_id, month } = req.body;
    const feeSetting = await dbManager.get("SELECT value FROM settings WHERE key = 'monthly_membership_fee'");
    const monthlyFee = parseFloat(feeSetting?.value || 500);

    try {
        // FINANCIAL MISHAP FIX: Create transaction first
        const { receipt_id } = await recordTransaction('income', 'membership_fee', monthlyFee, member_id, `Monthly Fee: ${month}`);

        const query = 'INSERT OR REPLACE INTO member_payments (member_id, month, amount, paid_date, status, transaction_id, synced) VALUES (?, ?, ?, CURRENT_TIMESTAMP, \'paid\', ?, 0)';

        await dbManager.run(query, [member_id, month, monthlyFee, receipt_id]);
        res.json({ success: true, receipt_id });
    } catch (err) {
        console.error('Mark paid error:', err);
        res.status(400).json({ error: 'Failed to mark payment' });
    }
});

app.delete('/api/member-payments/:id/forgive', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    const { id } = req.params;

    try {
        await dbManager.run('DELETE FROM member_payments WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Forgive payment error:', err);
        res.status(400).json({ error: 'Failed to forgive payment' });
    }
});

// --- BILLS MANAGEMENT APIs ---
app.get('/api/bills', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    const bills = await dbManager.query('SELECT * FROM bills ORDER BY status ASC, due_date ASC');
    res.json(bills);
});

app.post('/api/bills', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    const { bill_type, description, amount, due_date } = req.body;

    try {
        const sql = `
            INSERT INTO bills (bill_type, description, amount, due_date, status, synced)
            VALUES (?, ?, ?, ?, 'pending', 0)
        `;
        const info = await dbManager.run(sql, [bill_type, description, parseFloat(amount), due_date]);
        res.json({ success: true, id: info.lastInsertRowid });
    } catch (err) {
        console.error('Create bill error:', err);
        res.status(400).json({ error: 'Failed to create bill' });
    }
});

app.put('/api/bills/:id/pay', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    const { id } = req.params;
    const { proof_image } = req.body; // Expect base64 image

    try {
        const bill = await dbManager.get('SELECT * FROM bills WHERE id = ?', [id]);
        if (!bill) return res.status(404).json({ error: 'Bill not found' });

        // FINANCIAL MISHAP FIX: Create transaction for bill payment
        const { receipt_id } = await recordTransaction('expense', `bill_${bill.bill_type.toLowerCase()}`, bill.amount, null, `Paid Bill: ${bill.description}`, proof_image);

        const sql = `
            UPDATE bills 
            SET status = 'paid', paid_date = CURRENT_TIMESTAMP, transaction_id = ?, synced = 0
            WHERE id = ?
        `;
        await dbManager.run(sql, [receipt_id, id]);
        res.json({ success: true, receipt_id });
    } catch (err) {
        console.error('Pay bill error:', err);
        res.status(400).json({ error: 'Failed to pay bill' });
    }
});

app.delete('/api/bills/:id', isAuthenticated(['accountant', 'super_admin']), async (req, res) => {
    const { id } = req.params;

    try {
        await dbManager.run('DELETE FROM bills WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete bill error:', err);
        res.status(400).json({ error: 'Failed to delete bill' });
    }
});

// --- LIVE DISPLAY APIs ---
app.get('/api/prayer-times', async (req, res) => {
    try {
        // Updated to Colombo, Sri Lanka
        const response = await fetch('http://api.aladhan.com/v1/timingsByCity?city=Colombo&country=Sri%20Lanka&method=2');
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch prayer times' });
    }
});

app.get('/api/live/donors', async (req, res) => {
    try {
        // Last 5 individual donors (excluding Friday Collection, REVERTED, and Anonymous)
        const donorsSql = `
            SELECT t.amount, COALESCE(m.name, t.member_id) as donor_name 
            FROM transactions t
            LEFT JOIN members m ON t.member_id = m.member_id
            WHERE t.type = 'income' AND t.category != 'membership_fee' 
            AND t.description NOT LIKE '%Friday%'
            AND t.category != 'reversal' AND t.description NOT LIKE '%(REVERTED)%'
            AND t.member_id IS NOT NULL
            ORDER BY t.timestamp DESC LIMIT 5
        `;
        const donors = await dbManager.query(donorsSql);

        // Latest Friday Collection
        const fridaySql = `
            SELECT amount, timestamp FROM transactions 
            WHERE (description LIKE '%Friday%' OR category = 'friday_collection')
            AND category != 'reversal' AND description NOT LIKE '%(REVERTED)%'
            ORDER BY timestamp DESC LIMIT 1
        `;
        const fridayCollection = await dbManager.get(fridaySql);

        res.json({ donors, fridayCollection });
    } catch (err) {
        console.error('Live donors error:', err);
        res.status(500).json({ error: 'Failed to fetch donor data' });
    }
});

app.get('/api/audit/integrity-check', isAuthenticated(['super_admin']), async (req, res) => {
    try {
        const transactions = await dbManager.query("SELECT * FROM transactions");
        const salt = 'mosque-mms-2026-audit-secret';
        const issues = [];

        transactions.forEach(t => {
            const hashPayload = `${t.receipt_id}|${t.amount}|${t.timestamp}|${t.member_id}|${salt}`;
            const expectedHash = crypto.createHash('sha256').update(hashPayload).digest('hex').substring(0, 16);

            if (t.verified_hash !== expectedHash) {
                issues.push({
                    receipt_id: t.receipt_id,
                    stored: t.verified_hash,
                    expected: expectedHash,
                    date: t.timestamp
                });
            }
        });

        res.json({
            success: true,
            total_verified: transactions.length,
            mismatch_count: issues.length,
            issues
        });
    } catch (err) {
        console.error('Integrity check error:', err);
        res.status(500).json({ error: 'Failed to run integrity check' });
    }
});

// Setup upload storage for database merges
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'data/uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `merge_${Date.now()}.sqlite`);
    }
});
const uploadMerge = multer({ storage });

app.post('/api/database/merge', isAuthenticated(['super_admin']), uploadMerge.single('backup'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const backupPath = req.file.path;
    let backupDb;
    try {
        backupDb = new Database(backupPath);

        // 1. Members
        const members = backupDb.prepare('SELECT * FROM members').all();
        for (const m of members) {
            await dbManager.run(`
                INSERT OR IGNORE INTO members (member_id, name, address, contact, registration_date, synced)
                VALUES (?, ?, ?, ?, ?, 0)
            `, [m.member_id, m.name, m.address, m.contact, m.registration_date]);
        }

        // 2. Transactions
        const transactions = backupDb.prepare('SELECT * FROM transactions').all();
        for (const t of transactions) {
            await dbManager.run(`
                INSERT OR IGNORE INTO transactions (receipt_id, type, category, amount, member_id, description, timestamp, verified_hash, proof_image, synced)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            `, [t.receipt_id, t.type, t.category, t.amount, t.member_id, t.description, t.timestamp, t.verified_hash, t.proof_image]);
        }

        // 3. Member Payments
        const payments = backupDb.prepare('SELECT * FROM member_payments').all();
        for (const p of payments) {
            const checkSql = `SELECT 1 FROM member_payments WHERE member_id = ? AND month = ? AND (transaction_id = ? OR (transaction_id IS NULL AND ? IS NULL))`;
            const exists = await dbManager.get(checkSql, [p.member_id, p.month, p.transaction_id, p.transaction_id]);
            if (!exists) {
                await dbManager.run(`
                    INSERT INTO member_payments (member_id, amount, month, status, paid_date, transaction_id, synced)
                    VALUES (?, ?, ?, ?, ?, ?, 0)
                `, [p.member_id, p.amount, p.month, p.status, p.paid_date, p.transaction_id]);
            }
        }

        // 4. Bills
        const bills = backupDb.prepare('SELECT * FROM bills').all();
        for (const b of bills) {
            const checkSql = `SELECT 1 FROM bills WHERE bill_type = ? AND description = ? AND (transaction_id = ? OR (transaction_id IS NULL AND ? IS NULL))`;
            const exists = await dbManager.get(checkSql, [b.bill_type, b.description, b.transaction_id, b.transaction_id]);
            if (!exists) {
                await dbManager.run(`
                    INSERT INTO bills (bill_type, description, amount, due_date, status, paid_date, transaction_id, synced)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                `, [b.bill_type, b.description, b.amount, b.due_date, b.status, b.paid_date, b.transaction_id]);
            }
        }

        // 5. Distributions
        const distributions = backupDb.prepare('SELECT * FROM distributions').all();
        for (const d of distributions) {
            await dbManager.run(`
                INSERT OR IGNORE INTO distributions (distribution_id, member_id, amount, distribution_type, year, notes, received_date, synced)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0)
            `, [d.distribution_id, d.member_id, d.amount, d.distribution_type, d.year, d.notes, d.received_date]);
        }

        backupDb.close();
        fs.unlinkSync(backupPath);
        res.json({ success: true, message: 'Data merged successfully!' });

    } catch (err) {
        console.error('Merge Error:', err);
        if (backupDb) backupDb.close();
        if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
        res.status(500).json({ error: 'Merge failed: ' + err.message });
    }
});

app.get('/api/database/backup', isAuthenticated(['super_admin']), (req, res) => {
    const dbPath = path.join(__dirname, 'data/mms.sqlite');
    res.download(dbPath, 'mms_backup.sqlite');
});

app.get('/api/database/status', async (req, res) => {
    try {
        // SQLITE is always connected if server is running
        sqliteDb.prepare("SELECT 1").get();

        const mysqlConfigEntry = await dbManager.get("SELECT value FROM settings WHERE key = 'mysql_config'");
        let mysqlStatus = 'not_configured';
        let mysqlError = null;

        if (mysqlConfigEntry && mysqlConfigEntry.value) {
            try {
                const config = JSON.parse(mysqlConfigEntry.value);
                // Quick timeout for ping using mysql2/promise
                const tempConn = await mysql.createConnection({
                    ...config,
                    connectTimeout: 5000
                });
                await tempConn.ping();
                await tempConn.end();
                mysqlStatus = 'connected';
            } catch (err) {
                mysqlStatus = 'error';
                mysqlError = err.code || err.message;
            }
        }

        res.json({
            sqlite: 'connected',
            mysql: mysqlStatus,
            mode: dbMode,
            error: mysqlStatus === 'error' ? mysqlError : null
        });
    } catch (err) {
        res.status(500).json({ sqlite: 'error', error: err.message });
    }
});

app.get('/api/sync/status', isAuthenticated(['super_admin']), (req, res) => {
    res.json(syncStatus);
});

app.post('/api/sync/trigger', isAuthenticated(['super_admin']), async (req, res) => {
    try {
        await SyncService.sync();
        res.json({ success: true, status: syncStatus });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings', isAuthenticated(['super_admin']), async (req, res) => {
    const settings = req.body;
    try {
        const query = "INSERT OR REPLACE INTO settings (key, value, synced) VALUES (?, ?, 0)";

        for (const [key, value] of Object.entries(settings)) {
            await dbManager.run(query, [key, value ? value.toString() : '']);
        }

        // Update global mosqueName for exports
        if (settings.mosque_name) {
            mosqueName = settings.mosque_name;
        }

        // Handle sync interval/enabled change
        if (settings.sync_interval) {
            syncStatus.interval = parseInt(settings.sync_interval) * 1000;
            if (syncStatus.enabled) SyncService.startTimer();
        }
        if (settings.hasOwnProperty('sync_enabled')) {
            syncStatus.enabled = settings.sync_enabled === '1' || settings.sync_enabled === 1 || settings.sync_enabled === true;
            if (syncStatus.enabled) SyncService.startTimer();
            else if (syncStatus.timer) clearInterval(syncStatus.timer);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Save settings error:', err);
        res.status(400).json({ error: 'Failed to save settings' });
    }
});

app.post('/api/database/mysql-config', isAuthenticated(['super_admin']), async (req, res) => {
    const { host, user, password, database, port } = req.body;
    const config = JSON.stringify({ host, user, password, database, port: parseInt(port) || 3306 });

    try {
        // ALWAYS write to local settings, SyncService will push it if DB is connected
        await dbManager.run("INSERT OR REPLACE INTO settings (key, value, synced) VALUES ('mysql_config', ?, 0)", [config]);

        // Trigger an immediate sync attempt to test connection
        SyncService.sync();

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/transactions/:id/revert', isAuthenticated(['super_admin']), async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    try {
        const transaction = await dbManager.get("SELECT * FROM transactions WHERE receipt_id = ?", [id]);
        if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

        // Record a counter-transaction (reversal)
        const type = transaction.type === 'income' ? 'expense' : 'income';
        const category = 'reversal';
        const description = `REVERSAL of ${transaction.receipt_id}: ${reason}`;

        const { receipt_id } = await recordTransaction(type, category, transaction.amount, transaction.member_id, description);

        // Update the original transaction description to reflect reversal
        const updateSql = "UPDATE transactions SET description = description || ' (REVERTED)', synced = 0 WHERE receipt_id = ?";

        await dbManager.run(updateSql, [id]);

        // If it was a membership fee, update member_payments table to set back to pending
        if (transaction.category === 'membership_fee') {
            await dbManager.run("UPDATE member_payments SET status = 'pending', synced = 0 WHERE transaction_id = ?", [id]);
        }

        res.json({ success: true, reversal_receipt: receipt_id });
    } catch (err) {
        console.error('Reversal error:', err);
        res.status(500).json({ error: 'Failed to revert transaction' });
    }
});

app.listen(PORT, () => {
    console.log(`Mosque Management System running at http://localhost:${PORT}`);
});
