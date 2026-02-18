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
        case 'bills':
            renderBills();
            break;
        case 'distributions':
            renderDistributions();
            break;
        case 'receipts':
            renderReceipts();
            break;
        case 'password':
            renderPasswordChange();
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
                    <div class="card-title">PENDING BILLS</div>
                    <div class="stat-value" style="color: var(--danger-color)">Rs. ${stats.pending_bills || 0}</div>
                </div>
                <div class="card stat-card">
                    <div class="card-title">MAINTENANCE FUND</div>
                    <div class="stat-value" style="color: ${stats.maintenance_balance < 200 ? 'var(--danger-color)' : 'var(--success-color)'}">
                        Rs. ${stats.maintenance_balance}
                    </div>
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
                    <button class="btn btn-success" onclick="loadView('finances')">RECORD Transaction</button>
                </div>
            </div>
        `;
    } catch (err) {
        app.innerHTML = `<h1>Error loading dashboard</h1>`;
    }
}

async function renderMembers() {
    try {
        const [membersRes, feesRes] = await Promise.all([
            fetch('/api/members'),
            fetch('/api/pending-fees')
        ]);
        const members = await membersRes.json();
        const feesData = await feesRes.json();

        // Create a map of member payment status
        const paymentMap = {};
        feesData.members.forEach(m => {
            paymentMap[m.member_id] = m.status;
        });

        app.innerHTML = `
            <div class="justify-between flex" style="align-items: center">
                <h1>Member Registry</h1>
                <div style="display: flex; gap: 15px; align-items: center;">
                    <input type="text" id="memberSearch" placeholder="Search by ID or Name..." 
                           style="padding: 12px 20px; font-size: 18px; width: 300px; border: 2px solid var(--accent-color);" 
                           oninput="filterMembers()">
                    <button class="btn btn-success" onclick="showAddMemberModal()">+ ADD MEMBER</button>
                    <button class="btn btn-primary" onclick="showImportModal()">IMPORT</button>
                    <button class="btn btn-primary" onclick="exportMembers()">EXPORT REPORT</button>
                </div>
            </div>
            <div class="card">
                <table id="membersTable">
                    <thead>
                        <tr><th>ID</th><th>Name</th><th>Contact</th><th>Status</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                        ${members.map(m => {
            const status = paymentMap[m.member_id] || 'pending';
            const statusColor = status === 'paid' ? 'var(--success-color)' : 'var(--danger-color)';
            return `
                            <tr data-member-id="${m.member_id}" data-member-name="${m.name.toLowerCase()}">
                                <td>${m.member_id}</td>
                                <td>${m.name}</td>
                                <td>${m.contact}</td>
                                <td><span style="color: ${statusColor}; font-weight: bold;">${status.toUpperCase()}</span></td>
                                <td>
                                    <button class="btn btn-success" style="padding: 5px 15px; font-size: 16px;" onclick="showPaymentModal('${m.member_id}', '${m.name}')">PAY FEE</button>
                                    <button class="btn btn-primary" style="padding: 5px 15px; font-size: 16px;" onclick="printBarcode('${m.member_id}', '${m.name}', '${m.contact}')">BARCODE</button>
                                    <button class="btn" style="padding: 5px 15px; font-size: 16px; background-color: #444;" onclick="openWhatsApp('${m.contact}', '${m.member_id}')">WA</button>
                                    <button class="btn" style="padding: 5px 15px; font-size: 16px; background-color: var(--accent-color); color: #000;" onclick="generateStatement('${m.member_id}')">STMT</button>
                                </td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        app.innerHTML = `<h1>Error loading members</h1>`;
    }
}

async function openWhatsApp(phone, id) {
    const text = `Salaam, this is an automated message from the Mosque. Your Member ID is: ${id}. Thank you for your support.`;
    window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
}

async function generateStatement(memberId) {
    const [statRes, setRes] = await Promise.all([
        fetch(`/api/members/${memberId}/statement`),
        fetch('/api/settings')
    ]);
    const data = await statRes.json();
    const settings = await setRes.json();

    const printWin = window.open('', '', 'width=700,height=900');
    printWin.document.write(`
        <html>
        <head>
            <title>Statement - ${memberId}</title>
            <link rel="stylesheet" href="css/style.css">
            <style>
                body { background: white; color: black; padding: 40px; }
                .statement-header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid var(--accent-color); padding-bottom: 20px; }
                .statement-logo { height: 80px; width: 80px; object-fit: contain; }
                table { width: 100%; border: 1px solid #000; margin-top: 20px; }
                th, td { border: 1px solid #000; padding: 10px; }
            </style>
        </head>
        <body onload="window.print()">
            <div class="statement-header">
                <img src="${settings.logo_data || settings.logo_path || '/assets/img/logo.png'}" class="statement-logo">
                <h2>${settings.mosque_name || 'MOSQUE MANAGEMENT SYSTEM'}</h2>
                <p style="font-size: 14px; color: #666;">${settings.mosque_address || ''} ${settings.mosque_phone ? ' | Tel: ' + settings.mosque_phone : ''}</p>
            </div>
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
            <div class="developer-credits">
                <p>&copy; 2026 ShakBrotech</p>
                <p>System by Shakeel Singalaxana</p>
            </div>
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
                        <label>Category</label>
                        <select id="t_category" required onchange="updateTransactionType()">
                            <optgroup label="Income">
                                <option value="friday_collection">Friday Collection</option>
                                <option value="membership_fee">Membership Fee</option>
                                <option value="charity">General Charity</option>
                                <option value="donation">Donation</option>
                            </optgroup>
                            <optgroup label="Expenses">
                                <option value="salary">Salary Payment</option>
                                <option value="water_bill">Water Bill</option>
                                <option value="electricity_bill">Electricity Bill</option>
                                <option value="maintenance">Maintenance</option>
                                <option value="other_expense">Other Expense</option>
                            </optgroup>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Type (Auto-detected)</label>
                        <input type="text" id="t_type" readonly style="background-color: #222; cursor: not-allowed;" value="income">
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
    const type = document.getElementById('t_type').value;
    const category = document.getElementById('t_category').value;
    const amount = parseFloat(document.getElementById('t_amount').value);
    const member_id = document.getElementById('t_member_id').value;
    const description = '';

    const payload = { type, category, amount, member_id, description };

    // If it's an expense, require camera proof
    if (type === 'expense') {
        openCameraModal(async (imageData) => {
            payload.proof_image = imageData;
            await submitTransaction(payload);
        });
    } else {
        await submitTransaction(payload);
    }
}

async function submitTransaction(payload) {
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


function showImportModal() {
    const modalHtml = `
        <div id="importModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 9999; display: flex; align-items: center; justify-content: center;">
            <div class="card" style="max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto;">
                <h2 style="color: var(--accent-color); margin-bottom: 20px;">Import Members</h2>
                
                <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p style="margin: 0 0 10px 0;">1. Download the Excel template.</p>
                    <button class="btn btn-primary" onclick="window.location.href='/api/members/import-template'">DOWNLOAD TEMPLATE</button>
                    <p style="margin: 15px 0 10px 0;">2. Fill it with member data and upload.</p>
                    <input type="file" id="importFile" accept=".xlsx, .xls, .csv">
                </div>

                <div id="importResults" style="display: none; margin-bottom: 20px;"></div>

                <div class="flex gap-20">
                    <button class="btn btn-success" onclick="processImport()" style="flex: 1;">START IMPORT</button>
                    <button class="btn btn-danger" onclick="document.getElementById('importModal').remove()" style="flex: 1;">CLOSE</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function processImport() {
    const fileInput = document.getElementById('importFile');
    const resultDiv = document.getElementById('importResults');

    if (!fileInput.files[0]) return alert('Please select a file.');

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<p>Processing... please wait.</p>';

    try {
        const res = await fetch('/api/members/import', {
            method: 'POST',
            body: formData
        });
        const result = await res.json();

        if (result.error) {
            resultDiv.innerHTML = `<p style="color: var(--danger-color)">Error: ${result.error}</p>`;
            return;
        }

        let html = `
            <div style="padding: 10px; border: 1px solid var(--success-color); background: rgba(46, 204, 113, 0.1); margin-bottom: 10px;">
                <h3 style="color: var(--success-color); margin: 0;">Success: ${result.success} members added.</h3>
            </div>
        `;

        if (result.failed > 0) {
            html += `
                <div style="padding: 10px; border: 1px solid var(--danger-color); background: rgba(231, 76, 60, 0.1);">
                    <h3 style="color: var(--danger-color); margin: 0;">Failed: ${result.failed} rows</h3>
                    <ul style="max-height: 150px; overflow-y: auto; margin-top: 10px; padding-left: 20px;">
                        ${result.errors.map(e => `<li>Row ${e.row}: ${e.error}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        resultDiv.innerHTML = html;
        if (result.success > 0) renderMembers();

    } catch (err) {
        resultDiv.innerHTML = `<p style="color: var(--danger-color)">Network Error</p>`;
    }
}

async function exportMembers() {
    window.location.href = '/api/members/export';
}

async function showAddMemberModal() {
    let nextId = '';
    try {
        const res = await fetch('/api/members/next-id');
        const data = await res.json();
        nextId = data.nextId;
    } catch (err) {
        console.error('Failed to fetch next ID');
    }

    const modalHtml = `
        <div id="addMemberModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 9999; display: flex; align-items: center; justify-content: center;">
            <div class="card" style="max-width: 500px; width: 90%;">
                <h2 style="color: var(--accent-color); margin-bottom: 25px;">Add New Member</h2>
                <form id="addMemberForm" onsubmit="saveMember(event)">
                    <div class="form-group">
                        <label>Member ID</label>
                        <input type="text" id="new_m_id" required placeholder="e.g. M001" value="${nextId}">
                        <small style="color: #888;">Leave as is or enter a custom ID</small>
                    </div>
                    <div class="form-group">
                        <label>Full Name</label>
                        <input type="text" id="new_m_name" required>
                    </div>
                    <div class="form-group">
                        <label>Address</label>
                        <input type="text" id="new_m_address">
                    </div>
                    <div class="form-group">
                        <label>Contact Number</label>
                        <input type="text" id="new_m_contact" required>
                    </div>
                    <div class="flex gap-20" style="margin-top: 30px;">
                        <button type="submit" class="btn btn-success" style="flex: 1;">SAVE MEMBER</button>
                        <button type="button" class="btn btn-danger" onclick="document.getElementById('addMemberModal').remove()" style="flex: 1;">CANCEL</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function saveMember(e) {
    e.preventDefault();
    const payload = {
        member_id: document.getElementById('new_m_id').value,
        name: document.getElementById('new_m_name').value,
        address: document.getElementById('new_m_address').value,
        contact: document.getElementById('new_m_contact').value
    };

    try {
        const res = await fetch('/api/members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            if (data.autoAssigned) {
                alert(`Duplicate or empty ID detected!\nMember added with auto-assigned ID: ${data.member_id}`);
            } else {
                alert('Member added successfully!');
            }
            document.getElementById('addMemberModal').remove();
            renderMembers();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Failed to connect to server.');
    }
}

// Auto-detect transaction type based on category
function updateTransactionType() {
    const category = document.getElementById('t_category').value;
    const typeField = document.getElementById('t_type');

    const expenseCategories = ['salary', 'water_bill', 'electricity_bill', 'maintenance', 'other_expense'];
    typeField.value = expenseCategories.includes(category) ? 'expense' : 'income';
}

// --- PRINT FUNCTIONS ---
async function printReceipt(id) {
    try {
        const [receiptRes, settingsRes] = await Promise.all([
            fetch(`/api/transactions/${id}`),
            fetch('/api/settings')
        ]);
        const r = await receiptRes.json();
        const settings = await settingsRes.json();
        const logoSrc = settings.logo_data || settings.logo_path || '/assets/logo-placeholder.png';

        const printWindow = window.open('', '', 'width=400,height=600');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Receipt - ${r.receipt_id}</title>
                    <style>
                        body { font-family: 'Courier New', monospace; padding: 20px; text-align: center; }
                        .logo { width: 80px; height: 80px; object-fit: contain; margin-bottom: 10px; }
                        .header { font-weight: bold; font-size: 18px; margin-bottom: 5px; }
                        .sub-header { font-size: 12px; margin-bottom: 20px; }
                        .line { border-top: 1px dashed #000; margin: 10px 0; }
                        .row { display: flex; justify-content: space-between; margin: 5px 0; font-size: 14px; }
                        .total { font-weight: bold; font-size: 16px; margin-top: 10px; }
                        .footer { margin-top: 20px; font-size: 10px; }
                    </style>
                </head>
                <body>
                    <img src="${logoSrc}" class="logo">
                    <div class="header">${settings.mosque_name || 'MOSQUE MANAGEMENT SYSTEM'}</div>
                    <div class="sub-header">${settings.mosque_address || ''}<br>Tel: ${settings.mosque_phone || ''}</div>
                    
                    <div class="line"></div>
                    <div style="font-weight:bold; margin-bottom:10px">OFFICIAL RECEIPT</div>
                    
                    <div class="row"><span>Date:</span><span>${new Date(r.timestamp).toLocaleString()}</span></div>
                    <div class="row"><span>Receipt ID:</span><span>${r.receipt_id}</span></div>
                    <div class="row"><span>Type:</span><span>${r.category.toUpperCase()}</span></div>
                    ${r.member_name ? `<div class="row"><span>Member:</span><span>${r.member_name} (${r.member_id})</span></div>` : ''}
                    
                    <div class="line"></div>
                    
                    <div class="row" style="font-weight:bold">
                        <span>AMOUNT</span>
                        <span>Rs. ${parseFloat(r.amount).toFixed(2)}</span>
                    </div>

                    <div class="line"></div>
                    <div style="text-align:left; font-size:12px; margin-bottom:20px;">
                        <strong>Description:</strong><br>
                        ${r.description || 'No description provided.'}
                    </div>

                    <div class="footer">
                        Generated by MMS | ${r.verified_hash}<br>
                        Jazakallah Khair
                    </div>
                </body>
                <script>
                    window.onload = function() { window.print(); window.close(); }
                </script>
            </html>
        `);
    } catch (e) { alert('Failed to generate receipt'); }
}
// Bills Management View
async function renderBills() {
    try {
        const res = await fetch('/api/bills');
        const bills = await res.json();

        app.innerHTML = `
            <h1>Bills Management</h1>
            <div class="grid-container">
                <div class="card">
                    <div class="card-title">ADD NEW BILL</div>
                    <form id="billForm" onsubmit="saveBill(event)">
                        <div class="form-group">
                            <label>Bill Type</label>
                            <select id="bill_type" required>
                                <option value="water">Water Bill</option>
                                <option value="electricity">Electricity Bill</option>
                                <option value="maintenance">Maintenance</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Description</label>
                            <input type="text" id="bill_desc" required>
                        </div>
                        <div class="form-group">
                            <label>Amount (LKR)</label>
                            <input type="number" id="bill_amount" required step="0.01">
                        </div>
                        <div class="form-group">
                            <label>Due Date</label>
                            <input type="date" id="bill_due_date" required>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%">ADD BILL</button>
                    </form>
                </div>
                <div class="card">
                    <div class="card-title">PENDING BILLS</div>
                    <div id="billsList">Loading...</div>
                </div>
            </div>
        `;
        loadBillsList();
    } catch (err) {
        app.innerHTML = `<h1>Error loading bills</h1>`;
    }
}

async function loadBillsList() {
    try {
        const res = await fetch('/api/bills');
        const bills = await res.json();

        const billsDiv = document.getElementById('billsList');
        if (!billsDiv) return;

        if (!Array.isArray(bills) || bills.length === 0) {
            billsDiv.innerHTML = '<p>No bills found.</p>';
            return;
        }

        const pending = bills.filter(b => b.status === 'pending');
        const paid = bills.filter(b => b.status === 'paid');

        billsDiv.innerHTML = `
            <table>
                <thead>
                    <tr><th>Type</th><th>Description</th><th>Amount</th><th>Due Date</th><th>Action</th></tr>
                </thead>
                <tbody>
                    ${pending.length === 0 ? '<tr><td colspan="5">No pending bills</td></tr>' : pending.map(b => `
                        <tr>
                            <td>${b.bill_type.toUpperCase()}</td>
                            <td>${b.description}</td>
                            <td style="color: var(--danger-color); font-weight: bold;">Rs. ${parseFloat(b.amount).toFixed(2)}</td>
                            <td>${new Date(b.due_date).toLocaleDateString()}</td>
                            <td>
                                <button class="btn btn-success" style="padding: 8px 15px; font-size: 16px;" onclick="payBill(${b.id})">PAY</button>
                                <button class="btn btn-danger" style="padding: 8px 15px; font-size: 16px;" onclick="deleteBill(${b.id})">DELETE</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${paid.length > 0 ? `
                <h3 style="margin-top: 30px; color: var(--success-color);">PAID BILLS</h3>
                <table>
                    <tbody>
                        ${paid.map(b => `
                            <tr style="opacity: 0.6;">
                                <td>${b.bill_type.toUpperCase()}</td>
                                <td>${b.description}</td>
                                <td style="color: var(--success-color);">Rs. ${parseFloat(b.amount).toFixed(2)}</td>
                                <td>Paid: ${new Date(b.paid_date).toLocaleDateString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : ''}
        `;
    } catch (err) {
        console.error(err);
    }
}

async function saveBill(e) {
    e.preventDefault();
    const payload = {
        bill_type: document.getElementById('bill_type').value,
        description: document.getElementById('bill_desc').value,
        amount: parseFloat(document.getElementById('bill_amount').value),
        due_date: document.getElementById('bill_due_date').value
    };

    try {
        const res = await fetch('/api/bills', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            alert('Bill added successfully!');
            renderBills();
        } else {
            alert('Error: ' + (data.error || 'Failed to add bill'));
        }
    } catch (err) {
        alert('Network error: Failed to connect to server');
    }
}

async function payBill(billId) {
    // Open camera modal directly instead of confirm
    openCameraModal(async (imageData) => {
        try {
            const res = await fetch(`/api/bills/${billId}/pay`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ proof_image: imageData })
            });
            const data = await res.json();
            if (data.success) {
                alert('Bill marked as paid!');
                loadBillsList();
            }
        } catch (err) {
            alert('Error marking bill as paid');
        }
    });
}

async function deleteBill(billId) {
    if (!confirm('Delete this bill?')) return;

    try {
        const res = await fetch(`/api/bills/${billId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            alert('Bill deleted!');
            loadBillsList();
        }
    } catch (err) {
        alert('Error deleting bill');
    }
}

// Payment Modal for Member Fees
async function showPaymentModal(memberId, memberName) {
    try {
        const res = await fetch(`/api/member-payments/${memberId}/history`);
        const data = await res.json();

        const modalHtml = `
            <div id="paymentModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 9999; display: flex; align-items: center; justify-content: center;">
                <div class="card" style="max-width: 700px; width: 90%; max-height: 80vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="color: var(--accent-color); margin: 0;">Payment History - ${memberName}</h2>
                        <button class="btn btn-danger" onclick="closePaymentModal()" style="padding: 10px 20px;">CLOSE</button>
                    </div>
                    <p style="font-size: 18px; margin-bottom: 20px;">Monthly Fee: <strong style="color: var(--accent-color);">Rs. ${data.monthlyFee.toFixed(2)}</strong></p>
                    <table>
                        <thead>
                            <tr>
                                <th>Month</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.history.map(h => {
            const monthName = new Date(h.month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            const isPaid = h.status === 'paid';
            const statusColor = isPaid ? 'var(--success-color)' : 'var(--danger-color)';

            return `
                                <tr>
                                    <td>${monthName}</td>
                                    <td style="font-weight: bold;">Rs. ${h.amount.toFixed(2)}</td>
                                    <td><span style="color: ${statusColor}; font-weight: bold;">${h.status.toUpperCase()}</span></td>
                                    <td>
                                        ${isPaid ?
                    `<span style="color: var(--success-color);">✓ Paid on ${new Date(h.paid_date).toLocaleDateString()}</span>` :
                    `<button class="btn btn-success" style="padding: 5px 15px; font-size: 16px; margin-right: 5px;" onclick="markFeePaid('${memberId}', '${h.month}')">MARK PAID</button>
                                             <button class="btn btn-danger" style="padding: 5px 15px; font-size: 16px;" onclick="forgiveFee(${h.id}, '${h.month}', '${memberId}')">FORGIVE</button>`
                }
                                    </td>
                                </tr>
                                `;
        }).join('')}
                        </tbody>
                    </table>
                    <div style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                        <p style="font-size: 18px; margin: 0;">
                            <strong>Total Pending:</strong> 
                            <span style="color: var(--danger-color); font-size: 24px; font-weight: bold;">
                                Rs. ${(data.history.filter(h => h.status === 'pending').length * data.monthlyFee).toFixed(2)}
                            </span>
                        </p>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (err) {
        alert('Error loading payment history');
    }
}

function closePaymentModal() {
    const modal = document.getElementById('paymentModal');
    if (modal) modal.remove();
}

async function markFeePaid(memberId, month) {
    try {
        const res = await fetch('/api/member-payments/mark-paid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_id: memberId, month })
        });
        const data = await res.json();
        if (data.success) {
            // Get member details for receipt
            const memberRes = await fetch('/api/members');
            const members = await memberRes.json();
            const member = members.find(m => m.member_id === memberId);

            // Get payment details
            const historyRes = await fetch(`/api/member-payments/${memberId}/history`);
            const historyData = await historyRes.json();
            const monthlyFee = historyData.monthlyFee;

            // Print receipt
            printMembershipReceipt(member, month, monthlyFee);

            alert('Payment marked as paid! Receipt will open for printing.');
            closePaymentModal();
            renderMembers(); // Refresh the members view
        }
    } catch (err) {
        alert('Error marking payment');
    }
}

async function forgiveFee(paymentId, month, memberId) {
    if (!confirm(`Forgive payment for ${new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}?`)) return;

    try {
        // If paymentId is null, create a pending record first, then delete it
        if (!paymentId) {
            // Create the pending payment record
            const createRes = await fetch('/api/member-payments/mark-paid', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ member_id: memberId, month })
            });
            const createData = await createRes.json();

            if (!createData.success) {
                alert('Error creating payment record for forgiveness');
                return;
            }

            // Get the newly created payment ID
            const historyRes = await fetch(`/api/member-payments/${memberId}/history`);
            const historyData = await historyRes.json();
            const payment = historyData.history.find(h => h.month === month);
            paymentId = payment?.id;
        }

        if (!paymentId) {
            alert('Unable to process forgiveness.');
            return;
        }

        const res = await fetch(`/api/member-payments/${paymentId}/forgive`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
            // Get member details from the modal context
            const modalTitle = document.querySelector('#paymentModal h2').textContent;
            const memberName = modalTitle.replace('Payment History - ', '');

            // Print forgiveness confirmation
            printForgivenessCertificate(memberName, month);

            alert('Payment forgiven! Confirmation will open for printing.');
            closePaymentModal();
            renderMembers();
        }
    } catch (err) {
        console.error(err);
        alert('Error forgiving payment');
    }
}

async function printMembershipReceipt(member, month, amount) {
    const monthName = new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    const receiptId = `MEM-${month}-${member.member_id}`;
    const currentDate = new Date().toLocaleString();

    // Fetch settings for branding
    const settingsRes = await fetch('/api/settings');
    const settings = await settingsRes.json();
    const headerHtml = getBrandedHeader(settings);
    const footerHtml = getBrandedFooter(settings, 'MEMBERSHIP RECEIPT');

    const printWin = window.open('', '', 'width=600,height=800');
    if (!printWin) {
        alert('Popup blocked! Please allow popups for this site to print receipts.');
        return;
    }

    printWin.document.write(`
        <html>
        <head>
            <title>Membership Fee Receipt - ${receiptId}</title>
            <style>
                @page { margin: 0; }
                body { 
                    background: white; 
                    color: black; 
                    padding: 20px; 
                    text-align: center; 
                    font-family: sans-serif; 
                    margin: 0;
                }
                .receipt-box { 
                    border: 4px solid #2ecc71; 
                    padding: 20px; 
                    position: relative; 
                    margin: 0 auto; 
                    max-width: 100%; 
                }
                .watermark { 
                    position: absolute; 
                    top: 50%; 
                    left: 50%; 
                    transform: translate(-50%, -50%) rotate(-45deg);
                    font-size: 60px; 
                    color: rgba(46, 204, 113, 0.08); 
                    z-index: -1; 
                    pointer-events: none;
                }
                .logo-placeholder { 
                    font-size: 30px; 
                    font-weight: bold; 
                    margin-bottom: 10px; 
                    border-bottom: 3px solid #2ecc71; 
                    padding-bottom: 5px; 
                }
                h1 { 
                    margin: 5px 0; 
                    color: #2ecc71; 
                    font-size: 24px;
                }
                p { font-size: 14px; margin: 4px 0; }
                .amount-box { 
                    font-size: 36px; 
                    font-weight: bold; 
                    margin: 15px 0; 
                    padding: 15px; 
                    border: 3px dashed #2ecc71; 
                    color: #2ecc71;
                    background: rgba(46, 204, 113, 0.05);
                }
                .category-label {
                    background: #2ecc71;
                    color: white;
                    padding: 5px 15px;
                    border-radius: 15px;
                    display: inline-block;
                    margin: 5px 0;
                    font-weight: bold;
                    font-size: 12px;
                }
                .info-row {
                    text-align: left;
                    margin: 10px 0;
                    padding: 8px;
                    background: #f9f9f9;
                    border-left: 4px solid #2ecc71;
                }
            </style>
        </head>
        <body>
            <div class="receipt-box">
                <div class="watermark">PAID</div>
                ${headerHtml}
                <h1>MEMBERSHIP FEE RECEIPT</h1>
                <p><strong>Receipt ID:</strong> ${receiptId}</p>
                <p><strong>Date Issued:</strong> ${currentDate}</p>
                
                <div class="amount-box">
                    Rs. ${amount.toFixed(2)}
                </div>
                
                <div class="category-label">MEMBERSHIP FEE - ${monthName.toUpperCase()}</div>
                
                <div class="info-row">
                    <strong>Member ID:</strong> ${member.member_id}
                </div>
                <div class="info-row">
                    <strong>Member Name:</strong> ${member.name}
                </div>
                <div class="info-row">
                    <strong>Contact:</strong> ${member.contact}
                </div>
                <div class="info-row">
                    <strong>Payment Period:</strong> ${monthName}
                </div>
                
                <hr style="margin: 30px 0; border: 1px solid #ddd;">
                <p style="font-size: 14px; color: #666;">This receipt confirms payment of monthly membership fee.</p>
                <p style="margin-top: 30px; font-weight: bold; font-size: 18px;">Jazakallahu Khairan for your contribution!</p>
                <p style="font-size: 12px; color: #999; margin-top: 20px;">Keep this receipt for your records.</p>
                ${footerHtml}
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
}

async function printForgivenessCertificate(memberName, month) {
    const monthName = new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    const certificateId = `FORGIVE-${month}-${Date.now()}`;
    const currentDate = new Date().toLocaleString();

    // Fetch settings for branding
    const settingsRes = await fetch('/api/settings');
    const settings = await settingsRes.json();
    const headerHtml = getBrandedHeader(settings);
    const footerHtml = getBrandedFooter(settings, 'FORGIVENESS CERTIFICATE');

    const printWin = window.open('', '', 'width=600,height=800');
    if (!printWin) {
        alert('Popup blocked! Please allow popups for this site to print certificates.');
        return;
    }

    printWin.document.write(`
        <html>
        <head>
            <title>Payment Forgiveness Certificate - ${certificateId}</title>
            <style>
                @page { margin: 0; }
                body { 
                    background: white; 
                    color: black; 
                    padding: 20px; 
                    text-align: center; 
                    font-family: sans-serif; 
                    margin: 0;
                }
                .certificate-box { 
                    border: 4px solid #f39c12; 
                    padding: 20px; 
                    position: relative; 
                    margin: 0 auto; 
                    max-width: 100%; 
                }
                .watermark { 
                    position: absolute; 
                    top: 50%; 
                    left: 50%; 
                    transform: translate(-50%, -50%) rotate(-45deg);
                    font-size: 60px; 
                    color: rgba(243, 156, 18, 0.08); 
                    z-index: -1; 
                    pointer-events: none;
                }
                .logo-placeholder { 
                    font-size: 30px; 
                    font-weight: bold; 
                    margin-bottom: 10px; 
                    border-bottom: 3px solid #f39c12; 
                    padding-bottom: 5px; 
                }
                h1 { 
                    margin: 5px 0; 
                    color: #f39c12; 
                    font-size: 24px;
                }
                p { font-size: 14px; margin: 8px 0; }
                .info-box { 
                    margin: 15px 0; 
                    padding: 15px; 
                    border: 2px solid #f39c12; 
                    background: rgba(243, 156, 18, 0.05);
                }
                .category-label {
                    background: #f39c12;
                    color: white;
                    padding: 5px 15px;
                    border-radius: 15px;
                    display: inline-block;
                    margin: 5px 0;
                    font-weight: bold;
                    font-size: 12px;
                }
            </style>
        </head>
        <body>
            <div class="certificate-box">
                <div class="watermark">FORGIVEN</div>
                ${headerHtml}
                <h1>PAYMENT FORGIVENESS CERTIFICATE</h1>
                <p><strong>Certificate ID:</strong> ${certificateId}</p>
                <p><strong>Date Issued:</strong> ${currentDate}</p>
                
                <div class="info-box">
                    <p style="font-size: 22px; margin: 15px 0;"><strong>Member:</strong> ${memberName}</p>
                    <p style="font-size: 22px; margin: 15px 0;"><strong>Payment Period:</strong> ${monthName}</p>
                </div>
                
                <div class="category-label">MEMBERSHIP FEE FORGIVEN</div>
                
                <hr style="margin: 30px 0; border: 1px solid #ddd;">
                <p style="font-size: 16px; color: #666; line-height: 1.6;">
                    This certificate confirms that the membership fee for the above period has been forgiven by the mosque administration. 
                    No payment is required for this period.
                </p>
                <p style="margin-top: 30px; font-weight: bold; font-size: 18px;">May Allah accept your service to the community.</p>
                <p style="font-size: 12px; color: #999; margin-top: 20px;">Keep this certificate for your records.</p>
                ${footerHtml}
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
}

// Distribution Management with Sub-tabs
async function renderDistributions() {
    app.innerHTML = `
        <h1>Distribution Management</h1>
        <div class="card" style="margin-bottom: 20px;">
            <div style="display: flex; gap: 15px; border-bottom: 2px solid var(--accent-color); padding-bottom: 10px;">
                <button class="btn btn-primary" id="tab-ramadan" onclick="switchDistributionTab('ramadan', 'Ramadan Dates', '🌙')" style="flex: 1;">🌙 RAMADAN DATES</button>
                <button class="btn" id="tab-kanji" onclick="switchDistributionTab('kanji', 'Kanji', '🍲')" style="flex: 1; background-color: #444;">🍲 KANJI</button>
                <button class="btn" id="tab-kurban" onclick="switchDistributionTab('kurban', 'Kurban', '🐑')" style="flex: 1; background-color: #444;">🐑 KURBAN</button>
            </div>
        </div>
        <div id="distributionContent"></div>
    `;

    // Load Ramadan tab by default
    switchDistributionTab('ramadan', 'Ramadan Dates', '🌙');
}

function switchDistributionTab(type, title, icon) {
    // Update tab button styles
    document.querySelectorAll('[id^="tab-"]').forEach(btn => {
        btn.style.backgroundColor = '#444';
        btn.classList.remove('btn-primary');
    });
    const activeTab = document.getElementById(`tab-${type}`);
    if (activeTab) {
        activeTab.style.backgroundColor = '';
        activeTab.classList.add('btn-primary');
    }

    // Render the distribution content
    renderDistribution(type, title, icon);
}

// Distribution Management (Ramadan, Kanji, Kurban)
async function renderDistribution(type, title, icon) {
    const currentYear = new Date().getFullYear();
    const contentDiv = document.getElementById('distributionContent');
    if (!contentDiv) return;

    contentDiv.innerHTML = `
        <h2>${icon} ${title} Distribution</h2>
        <div class="card">
            <div style="display: flex; gap: 20px; margin-bottom: 20px; align-items: center;">
                <div>
                    <label style="font-weight: bold;">Year:</label>
                    <select id="dist_year" onchange="loadDistributionData('${type}', '${title}', '${icon}')" style="padding: 10px; font-size: 16px; margin-left: 10px;">
                        ${[currentYear, currentYear - 1, currentYear - 2].map(y => `<option value="${y}">${y}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="font-weight: bold;">Min Months Paid:</label>
                    <select id="min_months" onchange="loadDistributionData('${type}', '${title}', '${icon}')" style="padding: 10px; font-size: 16px; margin-left: 10px;">
                        <option value="0">All Members</option>
                        <option value="1">At least 1 month</option>
                        <option value="2">At least 2 months</option>
                        <option value="3">At least 3 months</option>
                        <option value="4">At least 4 months</option>
                        <option value="5">At least 5 months</option>
                        <option value="6">All 6 months</option>
                    </select>
                </div>
                <button class="btn btn-primary" onclick="printDistributionRegister('${type}', '${title}')" style="margin-left: auto;">PRINT REGISTER</button>
            </div>
            <div id="distributionList">Loading...</div>
        </div>
    `;

    loadDistributionData(type, title, icon);
}

async function loadDistributionData(type, title, icon) {
    const year = document.getElementById('dist_year').value;
    const minMonths = document.getElementById('min_months').value;

    try {
        const res = await fetch(`/api/distributions/${type}/${year}/eligible?minMonthsPaid=${minMonths}`);
        const members = await res.json();

        const listDiv = document.getElementById('distributionList');
        if (!listDiv) return;

        if (members.length === 0) {
            listDiv.innerHTML = '<p style="color: var(--danger-color);">No eligible members found.</p>';
            return;
        }

        listDiv.innerHTML = `
            <table id="distributionTable">
                <thead>
                    <tr>
                        <th>✓</th>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Contact</th>
                        <th>Paid Months</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${members.map(m => {
            const statusColor = m.received ? 'var(--success-color)' : 'var(--danger-color)';
            return `
                        <tr>
                            <td>
                                <input type="checkbox" 
                                       ${m.received ? 'checked' : ''} 
                                       onchange="toggleDistribution('${type}', '${year}', '${m.member_id}', this.checked)"
                                       style="width: 20px; height: 20px; cursor: pointer;">
                            </td>
                            <td>${m.member_id}</td>
                            <td>${m.name}</td>
                            <td>${m.contact}</td>
                            <td><span style="color: var(--accent-color); font-weight: bold;">${m.paidCount}/6</span></td>
                            <td><span style="color: ${statusColor}; font-weight: bold;">${m.received ? 'RECEIVED' : 'PENDING'}</span></td>
                        </tr>
                        `;
        }).join('')}
                </tbody>
            </table>
            <div style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                <p style="font-size: 18px; margin: 0;">
                    <strong>Total Eligible:</strong> ${members.length} | 
                    <strong style="color: var(--success-color);">Received:</strong> ${members.filter(m => m.received).length} | 
                    <strong style="color: var(--danger-color);">Pending:</strong> ${members.filter(m => !m.received).length}
                </p>
            </div>
        `;
    } catch (err) {
        console.error(err);
        const listDiv = document.getElementById('distributionList');
        if (listDiv) listDiv.innerHTML = '<p style="color: var(--danger-color);">Error loading distribution data.</p>';
    }
}

async function toggleDistribution(type, year, memberId, isChecked) {
    try {
        if (isChecked) {
            // Mark as received
            const res = await fetch('/api/distributions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ member_id: memberId, distribution_type: type, year: parseInt(year) })
            });
            const data = await res.json();
            if (!data.success) {
                alert('Error recording distribution');
            }
        } else {
            // Remove distribution record
            const distRes = await fetch(`/api/distributions/${type}/${year}`);
            const distributions = await distRes.json();
            const dist = distributions.find(d => d.member_id === memberId);

            if (dist) {
                const res = await fetch(`/api/distributions/${dist.id}`, {
                    method: 'DELETE'
                });
                const data = await res.json();
                if (!data.success) {
                    alert('Error removing distribution');
                }
            }
        }
    } catch (err) {
        console.error(err);
        alert('Error updating distribution');
    }
}

async function printDistributionRegister(type, title) {
    const year = document.getElementById('dist_year').value;
    const table = document.getElementById('distributionTable');
    if (!table) {
        alert('No data to print');
        return;
    }

    // Fetch settings for branding
    const settingsRes = await fetch('/api/settings');
    const settings = await settingsRes.json();
    const headerHtml = getBrandedHeader(settings);
    const footerHtml = getBrandedFooter(settings, title + ' DISTRIBUTION REGISTER');

    const printWin = window.open('', '', 'width=800,height=600');
    if (!printWin) {
        alert('Popup blocked! Please allow popups for this site.');
        return;
    }

    printWin.document.write(`
        <html>
        <head>
            <title>${title} Distribution Register - ${year}</title>
            <style>
                @page { margin: 0; }
                body { 
                    background: white; 
                    color: black; 
                    padding: 15px; 
                    font-family: sans-serif; 
                    margin: 0;
                }
                h1 { 
                    text-align: center; 
                    margin-bottom: 5px; 
                    font-size: 18px;
                }
                h2 { 
                    text-align: center; 
                    margin-bottom: 15px; 
                    color: #666;
                    font-size: 14px;
                }
                table { 
                    width: 100%; 
                    border-collapse: collapse; 
                    font-size: 11px;
                }
                th, td { 
                    border: 1px solid #000; 
                    padding: 4px; 
                    text-align: left; 
                }
                th { 
                    background: #f0f0f0; 
                    font-weight: bold; 
                }
                .signature-section {
                    margin-top: 30px;
                    display: flex;
                    justify-content: space-between;
                }
                .signature-box {
                    width: 45%;
                    border-top: 1px solid #000;
                    padding-top: 5px;
                    text-align: center;
                    font-size: 12px;
                }
            </style>
        </head>
        <body>
            ${headerHtml}
            <h1>${title} Distribution Register</h1>
            <h2>Year: ${year}</h2>
            ${table.outerHTML}
            <div class="signature-section">
                <div class="signature-box">
                    <p><strong>Prepared By</strong></p>
                    <p>Date: _____________</p>
                </div>
                <div class="signature-box">
                    <p><strong>Verified By</strong></p>
                    <p>Date: _____________</p>
                </div>
            </div>
            ${footerHtml}
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
}

// Filter members by search input
function filterMembers() {
    const searchInput = document.getElementById('memberSearch');
    if (!searchInput) return;

    const searchTerm = searchInput.value.toLowerCase();
    const table = document.getElementById('membersTable');
    if (!table) return;

    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const memberId = row.getAttribute('data-member-id') || '';
        const memberName = row.getAttribute('data-member-name') || '';

        if (memberId.toLowerCase().includes(searchTerm) || memberName.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// Helper Functions for Branding
function getBrandedHeader(settings) {
    const logoSrc = settings.logo_data || settings.logo_path || '/assets/logo-placeholder.png';
    return `
        <div class="branded-header" style="border-bottom: 3px solid #f1c40f; padding-bottom: 20px; margin-bottom: 30px; display: flex; align-items: center; justify-content: center; gap: 20px;">
            <img src="${logoSrc}" style="height: 80px; width: 80px; object-fit: contain;">
            <div style="text-align: left;">
                <h1 style="margin: 0; font-size: 24px; color: #f1c40f; text-transform: uppercase;">${settings.mosque_name || 'MOSQUE MANAGEMENT SYSTEM'}</h1>
                <div style="font-size: 12px; color: #666; margin-top: 5px;">
                    ${settings.mosque_address ? settings.mosque_address + ' <br>' : ''}
                    ${settings.mosque_phone ? 'Tel: ' + settings.mosque_phone : ''} 
                    ${settings.mosque_email ? '| ' + settings.mosque_email : ''}
                </div>
            </div>
        </div>
    `;
}

function getBrandedFooter(settings, docTitle) {
    return `
        <div class="branded-footer" style="position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 10px; color: #666; padding: 5px; background: white; border-top: 1px solid #eee;">
            &copy; ShakBrotech | ${docTitle.toUpperCase()} <br> System by Shakeel Singalaxana
        </div>
    `;
}
// Print barcode card for member
async function printBarcode(memberId, memberName, contact) {
    try {
        const settingsRes = await fetch('/api/settings');
        const settings = await settingsRes.json();
        const logoSrc = settings.logo_data || settings.logo_path || '/assets/logo-placeholder.png';

        const printWin = window.open('', '', 'width=600,height=400');
        if (!printWin) {
            alert('Popup blocked! Please allow popups for this site to print barcodes.');
            return;
        }

        const footerHtml = getBrandedFooter(null, 'MEMBER BARCODE');

        printWin.document.write(`
            <html>
            <head>
                <title>Member Barcode - ${memberId}</title>
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
                <style>
                    @page { margin: 0; }
                    body { 
                        background: white; 
                        color: black; 
                        padding: 15px; 
                        text-align: center; 
                        font-family: sans-serif; 
                        margin: 0;
                    }
                    .barcode-card { 
                        border: 3px solid #000; 
                        padding: 15px; 
                        margin: 20px auto; 
                        max-width: 400px;
                        background: white;
                    }
                    h2 { 
                        margin: 10px 0; 
                        font-size: 24px;
                        color: #000;
                    }
                    .logo-header {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 15px;
                        margin-bottom: 10px;
                    }
                    .logo-header img {
                        height: 50px;
                        width: 50px;
                        object-fit: contain;
                    }
                    p { 
                        font-size: 16px; 
                        margin: 8px 0; 
                    }
                    svg {
                        margin: 10px 0;
                    }
                </style>
            </head>
            <body>
                <div class="barcode-card">
                    <div class="logo-header">
                        <img src="${logoSrc}">
                        <h2>${settings.mosque_name || 'MOSQUE'}</h2>
                    </div>
                    <div style="font-size: 14px; font-weight: bold; margin-bottom: 5px;">MEMBER CARD</div>
                    <svg id="barcode"></svg>
                    <p><strong>ID:</strong> ${memberId}</p>
                    <p><strong>Name:</strong> ${memberName}</p>
                    <p><strong>Contact:</strong> ${contact}</p>
                </div>
                <script>
                    JsBarcode("#barcode", "${memberId}", {
                        format: "CODE128",
                        width: 2,
                        height: 60,
                        displayValue: false,
                        fontSize: 18,
                        margin: 10
                    });
                    
                    window.onload = function() {
                        window.print();
                        setTimeout(() => window.close(), 500);
                    };
                </script>
                ${footerHtml}
            </body>
            </html>
        `);
        printWin.document.close();
    } catch (e) {
        console.error(e);
        alert('Failed to load settings for print');
    }
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
}

async function checkDBStatus() {
    const dot = document.getElementById('dbStatusDot');
    const text = document.getElementById('dbStatusText');
    const headerName = document.getElementById('headerMosqueName');
    const headerLogo = document.getElementById('headerLogo');
    const headerDetails = document.getElementById('headerDetails');
    if (!dot || !text) return;

    try {
        // Fetch settings for Mosque Branding
        const setRes = await fetch('/api/settings');
        const settings = await setRes.json();

        if (headerName) headerName.innerText = settings.mosque_name || 'MOSQUE MANAGEMENT SYSTEM';
        if (headerLogo) headerLogo.src = settings.logo_path || '/assets/img/logo.png';
        if (headerDetails) {
            const details = [];
            if (settings.mosque_phone) details.push(`Tel: ${settings.mosque_phone}`);
            if (settings.mosque_address) details.push(settings.mosque_address);
            headerDetails.innerText = details.join(' | ');
        }

        // Fetch Sync Status instead of just DB Status
        const res = await fetch('/api/sync/status');
        if (!res.ok) throw new Error('API Error');
        const sync = await res.json();

        if (!sync.enabled) {
            dot.className = 'status-dot';
            dot.style.background = '#666';
            dot.style.boxShadow = 'none';
            text.innerText = 'Sync Disabled';
        } else if (sync.status === 'syncing') {
            dot.className = 'status-dot';
            dot.style.background = 'var(--accent-color)';
            dot.style.boxShadow = '0 0 10px var(--accent-color)';
            text.innerText = `Syncing... (${sync.pendingCount} pending)`;
        } else if (sync.error) {
            dot.className = 'status-dot connected';
            dot.style.background = '';
            dot.style.boxShadow = '';
            text.innerHTML = `Running on Local DB <small style="color:#888" title="${sync.error}">(Offline)</small>`;
            if (sync.pendingCount > 0) text.innerHTML += ` <span style="font-size:10px">(${sync.pendingCount} pending)</span>`;
        } else {
            dot.className = 'status-dot connected';
            dot.style.background = '';
            dot.style.boxShadow = '';
            text.innerText = sync.pendingCount > 0 ? `Local Active (${sync.pendingCount} pending)` : 'Database Synced';
        }
    } catch (err) {
        dot.className = 'status-dot error';
        text.innerText = 'Server Offline';
    }
}

async function triggerSync() {
    const text = document.getElementById('dbStatusText');
    const oldText = text.innerText;
    text.innerText = 'Triggering Sync...';
    try {
        const res = await fetch('/api/sync/trigger', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            checkDBStatus();
        } else {
            alert('Sync Trigger failed: ' + data.error);
            text.innerText = oldText;
        }
    } catch (err) {
        alert('Connection failed.');
        text.innerText = oldText;
    }
}

// Initial Load
checkDBStatus();
setInterval(checkDBStatus, 10000);
loadView('dashboard');
async function renderPasswordChange() {
    app.innerHTML = `
        <h1>Security Settings</h1>
        <div class="card" style="max-width: 500px;">
            <h3>Change Your Password</h3>
            <p style="color: #888; margin-bottom: 20px;">You are required to enter your current password to set a new one.</p>
            <div class="form-group">
                <label>Current Password</label>
                <input type="password" id="old_pass" required>
            </div>
            <div class="form-group">
                <label>New Password</label>
                <input type="password" id="new_pass" required>
            </div>
            <div class="form-group">
                <label>Confirm New Password</label>
                <input type="password" id="confirm_pass" required>
            </div>
            <button class="btn btn-primary" style="width: 100%; margin-top: 10px;" onclick="changePassword()">UPDATE PASSWORD</button>
        </div>
    `;
}

async function changePassword() {
    const oldPassword = document.getElementById('old_pass').value;
    const newPassword = document.getElementById('new_pass').value;
    const confirmPassword = document.getElementById('confirm_pass').value;

    if (!oldPassword || !newPassword) return alert('Please fill all fields.');
    if (newPassword !== confirmPassword) return alert('New passwords do not match.');
    if (newPassword.length < 6) return alert('Password must be at least 6 characters.');

    try {
        const res = await fetch('/api/user/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPassword, newPassword })
        });
        const data = await res.json();
        if (data.success) {
            alert('Password updated successfully!');
            loadView('dashboard');
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) { alert('Request failed.'); }
}

// --- CAMERA MODAL & CAPTURE LOGIC ---
let videoStream = null;

function openCameraModal(onConfirm) {
    const modalHtml = `
        <div id="cameraModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 10000; display: flex; align-items: center; justify-content: center; flex-direction: column;">
            <div class="card" style="width: 90%; max-width: 600px; text-align: center; padding: 20px;">
                <h2 style="color: var(--accent-color);">Capture Proof of Payment</h2>
                <div style="position: relative; width: 100%; height: 300px; background: #000; margin-bottom: 20px;">
                    <video id="cameraVideo" autoplay playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>
                    <canvas id="cameraCanvas" style="display: none; width: 100%; height: 100%; object-fit: cover;"></canvas>
                    <img id="cameraPreview" style="display: none; width: 100%; height: 100%; object-fit: cover;" />
                </div>
                
                <div id="cameraControls">
                    <button id="captureBtn" class="btn btn-success" style="font-size: 18px; padding: 10px 30px;">CAPTURE IMAGE</button>
                    <button id="cancelBtn" class="btn btn-danger" style="font-size: 18px; padding: 10px 30px;">CANCEL</button>
                </div>

                <div id="previewControls" style="display: none;">
                    <button id="retakeBtn" class="btn btn-primary" style="font-size: 18px; padding: 10px 30px;">RETAKE</button>
                    <button id="confirmBtn" class="btn btn-success" style="font-size: 18px; padding: 10px 30px;">CONFIRM & SAVE</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    const preview = document.getElementById('cameraPreview');
    const captureBtn = document.getElementById('captureBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const retakeBtn = document.getElementById('retakeBtn');
    const confirmBtn = document.getElementById('confirmBtn');
    const cameraControls = document.getElementById('cameraControls');
    const previewControls = document.getElementById('previewControls');

    // Start Camera
    async function startCamera() {
        try {
            videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            video.srcObject = videoStream;
        } catch (err) {
            console.error(err);
            alert('Could not access camera. Please allow camera permissions.');
            closeCameraModal();
        }
    }

    startCamera();

    // Capture Image
    captureBtn.onclick = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);

        preview.src = imageData;
        video.style.display = 'none';
        preview.style.display = 'block';

        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
        }

        cameraControls.style.display = 'none';
        previewControls.style.display = 'block';
    };

    // Retake Image
    retakeBtn.onclick = () => {
        preview.style.display = 'none';
        video.style.display = 'block';
        cameraControls.style.display = 'block';
        previewControls.style.display = 'none';
        startCamera();
    };

    // Confirm Logic
    confirmBtn.onclick = () => {
        const imageData = preview.src;
        closeCameraModal();
        if (onConfirm) onConfirm(imageData);
    };

    // Cancel Logic
    cancelBtn.onclick = closeCameraModal;
}

function closeCameraModal() {
    const modal = document.getElementById('cameraModal');
    if (modal) {
        modal.remove();
    }
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
}
