-- Create mailgun config table
CREATE TABLE IF NOT EXISTS mailgun_config (
  id SERIAL PRIMARY KEY,
  mailgun_domain VARCHAR(255) NOT NULL,
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create email history table
CREATE TABLE IF NOT EXISTS email_history (
  id SERIAL PRIMARY KEY,
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  image_url VARCHAR(2048),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  mailgun_message_id VARCHAR(255),
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_email_history_status ON email_history(status);
CREATE INDEX IF NOT EXISTS idx_email_history_created_at ON email_history(created_at);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
