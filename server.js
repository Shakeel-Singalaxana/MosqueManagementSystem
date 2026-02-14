const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const session = require('express-session');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, 'data/mms.sqlite'));

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

// --- AUTH ROUTES ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);

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

// --- SETTINGS (Public info for Live Display) ---
app.get('/api/settings', (req, res) => {
    const settings = db.prepare('SELECT * FROM settings').all();
    const settingsObj = {};
    settings.forEach(s => settingsObj[s.key] = s.value);
    res.json(settingsObj);
});

// --- MEMBERSHIP APIs ---
app.get('/api/members', isAuthenticated(['accountant', 'super_admin']), (req, res) => {
    const members = db.prepare('SELECT * FROM members ORDER BY name ASC').all();
    res.json(members);
});

app.post('/api/members', isAuthenticated(['accountant', 'super_admin']), (req, res) => {
    const { name, address, contact, member_id } = req.body;
    try {
        const stmt = db.prepare('INSERT INTO members (member_id, name, address, contact) VALUES (?, ?, ?, ?)');
        stmt.run(member_id, name, address, contact);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: 'Member ID already exists or invalid data' });
    }
});

app.get('/api/members/:id/statement', isAuthenticated(['accountant', 'super_admin']), (req, res) => {
    const { id } = req.params;
    const history = db.prepare(`
        SELECT * FROM transactions WHERE member_id = ? ORDER BY timestamp DESC
    `).all(id);
    const member = db.prepare('SELECT * FROM members WHERE member_id = ?').get(id);
    res.json({ member, history });
});

app.post('/api/members/import', isAuthenticated(['accountant', 'super_admin']), (req, res) => {
    const { csvData } = req.body; // Expecting raw string data
    const lines = csvData.trim().split('\n');
    const results = { success: 0, failed: 0 };

    const stmt = db.prepare('INSERT OR IGNORE INTO members (member_id, name, address, contact) VALUES (?, ?, ?, ?)');

    // Skip header and process lines
    for (let i = 1; i < lines.length; i++) {
        const [member_id, name, address, contact] = lines[i].split(',').map(s => s?.trim());
        if (member_id && name) {
            const info = stmt.run(member_id, name, address || '', contact || '');
            if (info.changes > 0) results.success++;
            else results.failed++;
        }
    }
    res.json(results);
});

// --- TRANSACTION APIs ---
app.get('/api/transactions', isAuthenticated(['accountant', 'super_admin']), (req, res) => {
    const transactions = db.prepare(`
        SELECT t.*, m.name as member_name 
        FROM transactions t 
        LEFT JOIN members m ON t.member_id = m.member_id 
        ORDER BY timestamp DESC LIMIT 100
    `).all();
    res.json(transactions);
});

app.post('/api/transactions', isAuthenticated(['accountant', 'super_admin']), (req, res) => {
    const { type, category, amount, member_id, description } = req.body;
    const receipt_id = `REC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const verified_hash = Buffer.from(receipt_id + amount).toString('base64').substring(0, 10);

    try {
        console.log('Recording transaction:', { type, category, amount, member_id });
        const stmt = db.prepare(`
            INSERT INTO transactions (receipt_id, type, category, amount, member_id, description, verified_hash) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(receipt_id, type, category, parseFloat(amount), member_id || null, description || '', verified_hash);
        console.log('Transaction recorded successfully:', info);
        res.json({ success: true, receipt_id });
    } catch (err) {
        console.error('Database Error:', err);
        res.status(400).json({ error: 'Failed to record transaction: ' + err.message });
    }
});

// --- DASHBOARD STATS ---
app.get('/api/dashboard/stats', isAuthenticated(['accountant', 'super_admin']), (req, res) => {
    const stats = {
        total_income: db.prepare("SELECT SUM(amount) as sum FROM transactions WHERE type = 'income'").get().sum || 0,
        total_expense: db.prepare("SELECT SUM(amount) as sum FROM transactions WHERE type = 'expense'").get().sum || 0,
        pending_fees: 1500, // Hardcoded placeholder for now
        maintenance_balance: 0
    };
    stats.maintenance_balance = stats.total_income - stats.total_expense;
    res.json(stats);
});

// --- LIVE DISPLAY APIs ---
app.get('/api/prayer-times', async (req, res) => {
    try {
        // Default to a generic location or city from settings
        const response = await fetch('http://api.aladhan.com/v1/timingsByCity?city=London&country=UK&method=2');
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch prayer times' });
    }
});

app.get('/api/live/donors', (req, res) => {
    const donors = db.prepare(`
        SELECT amount, member_id, description FROM transactions 
        WHERE type = 'income' AND category = 'charity' 
        ORDER BY timestamp DESC LIMIT 10
    `).all();
    res.json(donors);
});

app.listen(PORT, () => {
    console.log(`Mosque Management System running at http://localhost:${PORT}`);
});
