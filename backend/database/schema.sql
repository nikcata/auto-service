CREATE DATABASE IF NOT EXISTS auto_service_db;
USE auto_service_db;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'mechanic',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(30),
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cars (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT,
    brand VARCHAR(50),
    model VARCHAR(50),
    year INT,
    registration_number VARCHAR(20),
    vin VARCHAR(17),
    engine VARCHAR(50),
    mileage INT,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE repairs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    appointment_id INT UNIQUE,
    car_id INT,
    repair_date DATE,
    mechanic_name VARCHAR(100),
    description TEXT,
    hours_worked DECIMAL(5,2),
    price_per_hour DECIMAL(10,2),
    labor_price DECIMAL(10,2),
    total_price DECIMAL(10,2),
    status VARCHAR(50),
    completed_at TIMESTAMP NULL DEFAULT NULL,
    archived_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (car_id) REFERENCES cars(id)
);

CREATE TABLE repair_parts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    repair_id INT,
    part_name VARCHAR(100) NOT NULL,
    brand VARCHAR(100),
    quantity INT DEFAULT 1,
    unit_price DECIMAL(10,2),
    total_price DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repair_id) REFERENCES repairs(id)
);

CREATE TABLE appointments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT,
    car_id INT,
    appointment_date DATETIME NOT NULL,
    reason TEXT,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (car_id) REFERENCES cars(id)
);

CREATE TABLE invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    repair_id INT,
    invoice_number VARCHAR(50) NOT NULL,
    issue_date DATE,
    total_amount DECIMAL(10,2),
    pdf_path VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'issued',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repair_id) REFERENCES repairs(id)
);
