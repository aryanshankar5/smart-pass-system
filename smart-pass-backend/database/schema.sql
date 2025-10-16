-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    photo_url TEXT,
    address TEXT,
    student_id VARCHAR(50),
    branch VARCHAR(100),
    year VARCHAR(20),
    hostel VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- QR Activities table  
CREATE TABLE qr_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    qr_id VARCHAR(255) NOT NULL,
    meal_slot VARCHAR(100) NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    expires_at TIMESTAMP,
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP,
    verified_by UUID REFERENCES users(id)
);

-- Insert sample student data
INSERT INTO users (email, name, photo_url, student_id, branch, year, hostel, address) VALUES 
('aryan.btech2024@bitmesra.ac.in', 'Aryan Shankar', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?crop=entropy&cs=tinysrgb&fit=crop&h=150&w=150', 'BTECH/10090/24', 'Computer Science', '2nd Year', 'Vivekananda Hostel', 'BIT Mesra Campus'),
('priya.btech2024@bitmesra.ac.in', 'Priya Sharma', 'https://images.unsplash.com/photo-1494790108755-2616b612b1e5?crop=entropy&cs=tinysrgb&fit=crop&h=150&w=150', 'BTECH/10091/24', 'Electronics', '2nd Year', 'Saraswati Hostel', 'BIT Mesra Campus');
