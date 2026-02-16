-- Mosque Management System - MySQL Initialization Script
-- Use this script to manually set up your remote database.

CREATE DATABASE IF NOT EXISTS mosque_db;
USE mosque_db;

-- 1. Settings Table
CREATE TABLE IF NOT EXISTS settings (
    `key` VARCHAR(255) PRIMARY KEY,
    value TEXT
);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE,
    password TEXT,
    role VARCHAR(50),
    full_name TEXT
);

-- 3. Members Table
CREATE TABLE IF NOT EXISTS members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id VARCHAR(50) UNIQUE,
    name TEXT,
    address TEXT,
    contact TEXT,
    registration_date DATETIME
);

-- 4. Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    receipt_id VARCHAR(100) UNIQUE,
    type VARCHAR(20),
    category VARCHAR(100),
    amount DECIMAL(15,2),
    member_id VARCHAR(50),
    description TEXT,
    timestamp DATETIME,
    verified_hash TEXT
);

-- 5. Distributions Table
CREATE TABLE IF NOT EXISTS distributions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    distribution_id VARCHAR(100) UNIQUE,
    member_id VARCHAR(50),
    amount DECIMAL(15,2),
    distribution_type VARCHAR(50),
    year INT,
    notes TEXT,
    received_date DATETIME
);

-- 6. Member Payments Table
CREATE TABLE IF NOT EXISTS member_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id VARCHAR(50),
    amount DECIMAL(15,2),
    month VARCHAR(20),
    status VARCHAR(20),
    paid_date DATETIME,
    transaction_id VARCHAR(100)
);

-- 7. Bills Table
CREATE TABLE IF NOT EXISTS bills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bill_type VARCHAR(100),
    description TEXT,
    amount DECIMAL(15,2),
    due_date VARCHAR(50),
    status VARCHAR(20),
    paid_date DATETIME,
    transaction_id VARCHAR(100)
);

-- Initial Setup (Optional)
-- INSERT INTO settings (`key`, value) VALUES ('mosque_name', 'MMS Central');
