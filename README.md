🕌 Mosque Management System (MMS)
A Management software for your mosque. A robust, lightweight, and efficient solution designed for modern mosques. This system streamlines membership tracking, financial transparency, Zakat/Sadqa distribution, and live display management.
🚀 Features
 * 💰 Financial Tracking: Record income, expenses, and generate instant digital receipts.
 * 👥 Membership Management: Maintain a database of members with automated monthly fee tracking.
 * ⚖️ Distribution Module: Manage Zakat and Sadqa eligibility based on membership payment history.
 * 📄 Bills Management: Track utility bills and maintenance costs seamlessly.
 * 📊 Live Dashboard: Real-time stats for total balance, pending fees, and recent donors.
 * 📺 Live Display API: Integration for prayer times and scrolling donor lists on TV displays.
🛠️ Installation & Setup
Prerequisites
 * Node.js (v18.0.0 or higher)
 * npm (comes with Node.js)
Step 1: Clone and Install
# Navigate to the project directory
cd MosqueManagementSystem

# Install dependencies
npm install

Step 2: Initialize the Database
Before running the server, you must generate the SQLite database schema to create the data/mms.sqlite file and setup all necessary tables.
node database/init.js

Step 3: Run the System
# Start the server
npm start

The system will be live at: http://localhost:3000
🔐 Default Credentials
| Role | Username | Password |
|---|---|---|
| Super Admin | admin | admin123 |
| Accountant | accountant | acc123 |
> [!IMPORTANT]
> 🛡️ Master Recovery > For administrative password resets or emergency access:
> Super Password: Shakbrotech@mms#1206
> 
📂 Project Structure
├── /public        # Frontend assets (HTML, CSS, JS)
├── /database      # Initialization scripts and schema definitions
├── /data          # Contains the .sqlite database file (auto-generated)
├── server.js      # Express.js backend and API logic
└── package.json   # Project dependencies and scripts

🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.
📄 License
MIT License
Copyright (c) 2026 Shakbrotech
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
Developed with ❤️ by Shakbrotech.
