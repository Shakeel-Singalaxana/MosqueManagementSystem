const app = document.getElementById('app');

async function loadView(view, navElement) {
    if (navElement) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        navElement.classList.add('active');
    }

    switch (view) {
        case 'dashboard':
            renderDashboard();
            break;
        case 'members':
            renderMembers();
            break;
        case 'finances':
            renderFinances();
            break;
        case 'receipts':
            renderReceipts();
            break;
    }
}

async function renderDashboard() {
    try {
        const res = await fetch('/api/dashboard/stats');
        const stats = await res.json();

        app.innerHTML = `
            <h1>Accountant Dashboard</h1>
            <div class="grid-container">
                <div class="card stat-card">
                    <div class="card-title">PENDING FEES</div>
                    <div class="stat-value" style="color: var(--danger-color)">Rs. ${stats.pending_fees}</div>
                </div>
                <div class="card stat-card">
                    <div class="card-title">MAINTENANCE FUND</div>
                    <div class="stat-value" style="color: ${stats.maintenance_balance < 200 ? 'var(--danger-color)' : 'var(--success-color)'}">
                        Rs. ${stats.maintenance_balance}
                    </div>
                </div>
                <div class="card stat-card">
                    <div class="card-title">UPCOMING BILLS</div>
                    <div class="stat-value" style="color: var(--accent-color)">Rs. 420.00</div>
                </div>
            </div>
            ${stats.maintenance_balance < 200 ? `
                <div class="card" style="border: 4px solid var(--danger-color); background-color: #330000;">
                    <h2 style="color: var(--danger-color); margin: 0;">⚠️ LOW BALANCE ALERT: MAINTENANCE FUND</h2>
                    <p style="font-size: 20px;">The maintenance fund is below critical threshold ($200.00). Please prioritize charity collections.</p>
                </div>
            ` : ''}
            <div class="card" style="margin-top: 40px;">
                <div class="card-title">QUICK ACTIONS</div>
                <div class="flex gap-20">
                    <button class="btn btn-success" onclick="loadView('finances')">+ RECORD INCOME</button>
                    <button class="btn btn-danger" onclick="loadView('finances')">- RECORD EXPENSE</button>
                </div>
            </div>
        `;
    } catch (err) {
        app.innerHTML = `<h1>Error loading dashboard</h1>`;
    }
}

async function renderMembers() {
    const res = await fetch('/api/members');
    const members = await res.json();

    app.innerHTML = `
        <div class="justify-between flex" style="align-items: center">
            <h1>Member Registry</h1>
            <button class="btn btn-primary" onclick="showImportModal()">IMPORT CSV</button>
        </div>
        <div class="card">
            <table>
                <thead>
                    <tr><th>ID</th><th>Name</th><th>Contact</th><th>Actions</th></tr>
                </thead>
                <tbody>
                    ${members.map(m => `
                        <tr>
                            <td>${m.member_id}</td>
                            <td>${m.name}</td>
                            <td>${m.contact}</td>
                            <td>
                                <button class="btn" style="padding: 5px 15px; font-size: 16px; background-color: #444;" onclick="openWhatsApp('${m.contact}', '${m.member_id}')">WA</button>
                                <button class="btn" style="padding: 5px 15px; font-size: 16px; background-color: var(--accent-color); color: #000;" onclick="generateStatement('${m.member_id}')">STMT</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function openWhatsApp(phone, id) {
    const text = `Salaam, this is an automated message from the Mosque. Your Member ID is: ${id}. Thank you for your support.`;
    window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
}

async function generateStatement(memberId) {
    const res = await fetch(`/api/members/${memberId}/statement`);
    const data = await res.json();

    const printWin = window.open('', '', 'width=700,height=900');
    printWin.document.write(`
        <html>
        <head>
            <title>Statement - ${memberId}</title>
            <link rel="stylesheet" href="css/style.css">
            <style>
                body { background: white; color: black; padding: 40px; }
                table { width: 100%; border: 1px solid #000; }
                th, td { border: 1px solid #000; padding: 10px; }
            </style>
        </head>
        <body onload="window.print()">
            <h1>Member Contribution Statement</h1>
            <p><strong>Name:</strong> ${data.member.name}</p>
            <p><strong>ID:</strong> ${data.member.member_id}</p>
            <hr>
            <table>
                <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Type</th></tr></thead>
                <tbody>
                    ${data.history.map(h => `
                        <tr>
                            <td>${new Date(h.timestamp).toLocaleDateString()}</td>
                            <td>${h.category}</td>
                            <td>Rs. ${h.amount}</td>
                            <td>${h.type.toUpperCase()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <p style="margin-top: 30px; text-align: center;">Jazakallahu Khairan for your generosity.</p>
        </body>
        </html>
    `);
    printWin.document.close();
}

function renderFinances() {
    app.innerHTML = `
        <h1>Financial Records</h1>
        <div class="grid-container">
            <div class="card">
                <div class="card-title">NEW TRANSACTION</div>
                <form id="transForm" onsubmit="saveTransaction(event)">
                    <div class="form-group">
                        <label>Type</label>
                        <select id="t_type" required>
                            <option value="income">Income (+)</option>
                            <option value="expense">Expense (-)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Category</label>
                        <select id="t_category" required>
                            <option value="friday_collection">Friday Collection</option>
                            <option value="membership_fee">Membership Fee</option>
                            <option value="charity">General Charity</option>
                            <option value="salary">Salary Payment</option>
                            <option value="maintenance">Maintenance</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Amount (LKR)</label>
                        <input type="number" id="t_amount" required step="0.01">
                    </div>
                    <div class="form-group">
                        <label>Member ID (Optional)</label>
                        <input type="text" id="t_member_id">
                    </div>
                    <button type="submit" class="btn btn-success" style="width: 100%">SAVE TRANSACTION</button>
                </form>
            </div>
            <div class="card">
                <div class="card-title">LATEST HISTORY</div>
                <div id="transHistory">Loading...</div>
            </div>
        </div>
    `;
    loadTransactionHistory();
}

async function loadTransactionHistory() {
    try {
        const res = await fetch('/api/transactions');
        const logs = await res.json();

        const historyDiv = document.getElementById('transHistory');
        if (!historyDiv) return;

        if (!Array.isArray(logs)) {
            historyDiv.innerHTML = `<p style="color: var(--danger-color)">Error: ${logs.error || 'Failed to load history'}</p>`;
            return;
        }

        if (logs.length === 0) {
            historyDiv.innerHTML = '<p>No transactions found.</p>';
            return;
        }

        historyDiv.innerHTML = `
            <table>
                <tbody>
                    ${logs.map(l => `
                        <tr>
                            <td style="color: ${l.type === 'income' ? 'var(--success-color)' : 'var(--danger-color)'}">
                                ${l.type === 'income' ? '+' : '-'}Rs. ${parseFloat(l.amount).toFixed(2)}
                            </td>
                            <td>${l.category.replace('_', ' ').toUpperCase()}</td>
                            <td><button class="btn btn-primary" style="padding: 5px 10px; font-size: 14px;" onclick="printReceipt('${l.receipt_id}')">PRINT</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (err) {
        const historyDiv = document.getElementById('transHistory');
        if (historyDiv) historyDiv.innerHTML = 'Error loading history.';
    }
}

async function renderReceipts() {
    try {
        const res = await fetch('/api/transactions');
        const logs = await res.json();

        if (!Array.isArray(logs)) {
            app.innerHTML = `<h1>Error: ${logs.error || 'Failed to load receipts'}</h1>`;
            return;
        }

        app.innerHTML = `
            <h1>Receipt Management</h1>
            <div class="card">
                <div class="card-title">RECENT TRANSACTIONS</div>
                <table>
                    <thead>
                        <tr><th>Date</th><th>Type</th><th>Amount</th><th>Category</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                        ${logs.length === 0 ? '<tr><td colspan="5">No transactions found.</td></tr>' : logs.map(l => `
                            <tr>
                                <td>${new Date(l.timestamp).toLocaleDateString()}</td>
                                <td>${l.type.toUpperCase()}</td>
                                <td style="color: ${l.type === 'income' ? 'var(--success-color)' : 'var(--danger-color)'}">
                                    Rs. ${parseFloat(l.amount).toFixed(2)}
                                </td>
                                <td>${l.category.replace('_', ' ').toUpperCase()}</td>
                                <td>
                                    <button class="btn btn-primary" style="padding: 10px 20px;" onclick="printReceipt('${l.receipt_id}')">PRINT RECEIPT</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        app.innerHTML = `<h1>Error loading receipts</h1>`;
    }
}

async function saveTransaction(e) {
    e.preventDefault();
    const payload = {
        type: document.getElementById('t_type').value,
        category: document.getElementById('t_category').value,
        amount: parseFloat(document.getElementById('t_amount').value),
        member_id: document.getElementById('t_member_id').value,
        description: ''
    };

    try {
        const res = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            alert('Transaction Saved! Receipt ID: ' + data.receipt_id);
            renderFinances();
        } else {
            alert('Error Saving Transaction: ' + (data.error || 'Unknown error'));
        }
    } catch (err) {
        alert('Network Error: Failed to connect to server.');
    }
}

async function printReceipt(receiptId) {
    try {
        const res = await fetch('/api/transactions');
        const logs = await res.json();
        const l = logs.find(log => log.receipt_id === receiptId);

        if (!l) {
            alert('Receipt not found.');
            return;
        }

        const printWin = window.open('', '', 'width=600,height=800');
        if (!printWin) {
            alert('Popup blocked! Please allow popups for this site to print receipts.');
            return;
        }

        printWin.document.write(`
            <html>
            <head>
                <title>Receipt - ${receiptId}</title>
                <link rel="stylesheet" href="css/style.css">
                <style>
                    body { background: white; color: black; padding: 50px; text-align: center; font-family: sans-serif; }
                    .receipt-box { border: 4px solid #000; padding: 40px; position: relative; margin: 0 auto; max-width: 500px; }
                    .watermark { 
                        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg);
                        font-size: 80px; color: rgba(0,0,0,0.1); z-index: -1; pointer-events: none;
                    }
                    .logo-placeholder { font-size: 40px; font-weight: bold; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
                    h1 { margin: 10px 0; }
                    p { font-size: 20px; margin: 8px 0; }
                    .amount-box { font-size: 48px; font-weight: bold; margin: 30px 0; padding: 20px; border: 2px dashed #000; }
                </style>
            </head>
            <body>
                <div class="receipt-box">
                    <div class="watermark">VERIFIED</div>
                    <div class="logo-placeholder">MOSQUE LOGO</div>
                    <h1>OFFICIAL RECEIPT</h1>
                    <p><strong>Receipt ID:</strong> ${l.receipt_id}</p>
                    <p><strong>Date:</strong> ${new Date(l.timestamp).toLocaleString()}</p>
                    <div class="amount-box">
                        Rs. ${l.amount.toFixed(2)}
                    </div>
                    <p><strong>Category:</strong> ${l.category.replace('_', ' ').toUpperCase()}</p>
                    <p><strong>Member/Desc:</strong> ${l.member_name || l.member_id || 'General Donation'}</p>
                    <hr style="margin: 20px 0;">
                    <p style="font-size: 14px; color: #666;">Verified Hash: ${l.verified_hash}</p>
                    <p style="margin-top: 30px; font-weight: bold;">Jazakallahu Khairan!</p>
                </div>
                <script>
                    window.onload = function() {
                        window.print();
                        setTimeout(() => window.close(), 500);
                    };
                </script>
            </body>
            </html>
        `);
        printWin.document.close();
    } catch (err) {
        console.error(err);
        alert('Error generating receipt.');
    }
}

function showImportModal() {
    const csv = prompt("Paste your CSV data here (Format: ID, Name, Address, Contact)\nInclude header row.");
    if (csv) {
        importCSV(csv);
    }
}

async function importCSV(csvData) {
    const res = await fetch('/api/members/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData })
    });
    const result = await res.json();
    alert(`Import Complete!\nSuccess: ${result.success}\nFailed: ${result.failed}`);
    renderMembers();
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
}

// Initial Load
loadView('dashboard');
