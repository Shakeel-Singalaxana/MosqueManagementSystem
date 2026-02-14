# Mosque Management System (MMS) Implementation Plan

## 1. Tech Stack & Portability
To ensure the system is portable and easy to run locally (via XAMPP or `npm start`):
- **Frontend:** React.js or Vue.js (for a fast, single-page experience).
- **Styling:** Tailwind CSS (specifically using high-contrast, large-font components for readability).
- **Backend/DB:** - *Option A:* Node.js with SQLite (a single file database—no complex SQL installation needed).
    - *Option B:* PHP with MariaDB (standard XAMPP setup).
- **Printing:** `react-to-print` or standard browser CSS Print Media queries.

## 2. User Roles & Access Control
| Role | Permissions | Primary View |
| :--- | :--- | :--- |
| **Super Admin** | Full CRUD on all tables, system logs, user management. | Database Management Console |
| **Accountant** | Membership fees, charity tracking, expense logging, receipt generation. | Financial Dashboard |
| **General/Live** | Prayer times, charity scroll, public notices. | Live TV/Kiosk Display |

## 3. Key Modules
### A. Membership Management
- **Registration:** Form capturing Name, Contact, Address, and unique Member ID.
- **Legacy Import:** A specialized "Bulk Upload" tool to migrate data from manual ledger books (CSV/Excel import).
- **Fee Tracker:** A 12-month grid view showing paid/pending status for each member.

### B. Financial Engine
- **Income:** Categorized by Friday Collection, Membership Fees, and General Charity (Sadaqah/Zakat).
- **Expenses:** Staff Salaries (Imams/Muezzins), Maintenance, and Outreach.
- **Verification:** Every transaction generates a unique Hash/QR code on the receipt for authenticity.

### C. The "Live" Dashboard
- **Prayer Times:** Integration with `Aladhan API` for automatic location-based sync.
- **Donor Scroll:** A marquee feature displaying recent charity givers (optional "Anonymous" toggle).

## 4. UI/UX for the Senior Accountant
- **Large Action Buttons:** High-contrast colors (Green for Income, Red for Expense).
- **No Hidden Menus:** All primary functions visible in a sidebar.
- **Confirmation Dialogs:** To prevent accidental deletions.

## 5. Communication
- **Automated Alerts:** Generate a text string or PDF slip that can be sent via WhatsApp to members regarding their Member ID and fee status.