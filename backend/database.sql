-- Daily Impact Devotional - MySQL Schema
-- Compatible with cPanel MySQL

CREATE TABLE IF NOT EXISTS `settings` (
    `setting_key` VARCHAR(100) PRIMARY KEY,
    `setting_value` TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `devotionals` (
    `id` VARCHAR(36) PRIMARY KEY,
    `date` VARCHAR(50) NOT NULL COMMENT 'e.g. July 20',
    `year` INT NOT NULL,
    `title` TEXT NOT NULL,
    `scripture_ref` TEXT,
    `scripture_text` TEXT,
    `paragraphs` LONGTEXT COMMENT 'JSON array of paragraphs',
    `additional_scripture` TEXT,
    `prayer_confession` TEXT,
    `bible_reading` TEXT,
    `author` VARCHAR(255) DEFAULT 'Dr. Andy Osakwe',
    `image_url` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_date_year` (`date`, `year`),
    INDEX `idx_year` (`year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `header_mappings` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `date_key` VARCHAR(100) NOT NULL COMMENT 'e.g. July 20',
    `file_name` VARCHAR(255) NOT NULL,
    `data_url` LONGTEXT COMMENT 'Base64 data URL (for backward compat)',
    `file_path` VARCHAR(500) COMMENT 'Path to saved file on disk',
    `month` VARCHAR(50),
    `day` INT,
    `year` INT,
    `month_folder` VARCHAR(100) COMMENT 'e.g. july_2025',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_date_key` (`date_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `foreword_posts` (
    `id` VARCHAR(36) PRIMARY KEY,
    `title` VARCHAR(255) NOT NULL,
    `content` LONGTEXT COMMENT 'HTML content from rich text editor',
    `author` VARCHAR(255) DEFAULT 'Dr. Andy Osakwe',
    `published_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `donations` (
    `id` VARCHAR(36) PRIMARY KEY,
    `reference` VARCHAR(255),
    `amount` DECIMAL(12, 2) DEFAULT 0.00,
    `currency` VARCHAR(10) DEFAULT 'NGN',
    `email` VARCHAR(255),
    `name` VARCHAR(255),
    `phone` VARCHAR(40) DEFAULT '' COMMENT 'Donor phone (blank for anonymous)',
    `is_anonymous` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = anonymous donor (no personal details)',
    `provider` VARCHAR(50) DEFAULT 'paystack',
    `status` ENUM('success', 'pending', 'failed') DEFAULT 'pending',
    `donated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_reference` (`reference`),
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `login_logs` (
    `id` VARCHAR(36) PRIMARY KEY,
    `email` VARCHAR(255) NOT NULL,
    `ip_address` VARCHAR(45),
    `user_agent` TEXT,
    `location` VARCHAR(255),
    `success` TINYINT(1) DEFAULT 0,
    `logged_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_email` (`email`),
    INDEX `idx_logged_at` (`logged_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `admin_users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `email` VARCHAR(255) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255),
    `bio` TEXT NULL COMMENT 'Staff profile bio (per user — NOT the public author bio)',
    `role` VARCHAR(50) NOT NULL DEFAULT 'admin',
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `totp_secret` VARCHAR(255) NOT NULL DEFAULT '',
    `totp_enabled` TINYINT(1) NOT NULL DEFAULT 0,
    `email_otp_enabled` TINYINT(1) NOT NULL DEFAULT 0,
    `backup_codes` TEXT NULL,
    `session_version` INT NOT NULL DEFAULT 0 COMMENT 'Bump to force-log-out all sessions for this user',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `telegram_log` (
    `id` VARCHAR(36) PRIMARY KEY,
    `devotional_id` VARCHAR(36),
    `devotional_title` TEXT,
    `scheduled_date` VARCHAR(50),
    `scheduled_year` INT,
    `post_time` VARCHAR(20),
    `status` ENUM('scheduled', 'sent', 'failed', 'skipped') DEFAULT 'scheduled',
    `sent_at` TIMESTAMP NULL,
    `telegram_message_id` INT,
    `error` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_devotional` (`devotional_id`),
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mail_queue` (
    `id` VARCHAR(36) PRIMARY KEY,
    `to_email` VARCHAR(255) NOT NULL,
    `subject` VARCHAR(500),
    `body` LONGTEXT,
    `html` MEDIUMTEXT NULL COMMENT 'Branded HTML body (rendered from email templates)',
    `sent` TINYINT(1) DEFAULT 0,
    `sent_at` TIMESTAMP NULL,
    `error` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_sent` (`sent`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ip_bans` (
    `id` VARCHAR(36) PRIMARY KEY,
    `ip_address` VARCHAR(45) NOT NULL,
    `ip_version` TINYINT(1) NOT NULL DEFAULT 4,
    `cidr` VARCHAR(80) NOT NULL,
    `ban_start` VARCHAR(80) NOT NULL,
    `ban_end` VARCHAR(80) NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `source` VARCHAR(50) DEFAULT 'admin-login',
    `email` VARCHAR(255) DEFAULT '',
    `failed_attempts` INT DEFAULT 0,
    `active` TINYINT(1) DEFAULT 1,
    `whitelisted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = admin-whitelisted; never auto-banned, skips ban checks',
    `unbanned_at` TIMESTAMP NULL,
    `unbanned_by` VARCHAR(255) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_cidr` (`cidr`),
    INDEX `idx_active` (`active`),
    INDEX `idx_ip_address` (`ip_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `uploaded_files` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `original_name` VARCHAR(255) NOT NULL,
    `saved_name` VARCHAR(255) NOT NULL,
    `file_path` VARCHAR(500) NOT NULL,
    `file_type` VARCHAR(50) COMMENT 'header, devotional_docx, homepage_hero',
    `file_size` INT,
    `mime_type` VARCHAR(100),
    `month` VARCHAR(50),
    `year` INT,
    `month_folder` VARCHAR(100),
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_file_type` (`file_type`),
    INDEX `idx_month_folder` (`month_folder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Real-time administrative activity feed (populated by logActivity() in
-- config/db.php from the admin/devotionals/headers/telegram endpoints).
-- Payment-webhook flood guard (throttles rogue clients; gateways retry safely).
CREATE TABLE IF NOT EXISTS `webhook_events` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `ip_address` VARCHAR(45) NOT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_wh_ip_time` (`ip_address`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `activity_log` (
    `id` VARCHAR(36) PRIMARY KEY,
    `action` VARCHAR(50) NOT NULL,
    `message` TEXT NOT NULL,
    `entity_type` VARCHAR(50) DEFAULT '',
    `entity_id` VARCHAR(255) DEFAULT '',
    `actor` VARCHAR(255) DEFAULT '',
    `ip_address` VARCHAR(45) DEFAULT '',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- First-party website analytics (populated by analytics.php from the public
-- site's visit tracker — one row per visitor session).
CREATE TABLE IF NOT EXISTS `analytics_visits` (
    `id` VARCHAR(36) PRIMARY KEY,
    `session_id` VARCHAR(64) NOT NULL,
    `page` VARCHAR(255) DEFAULT '',
    `referrer` VARCHAR(500) DEFAULT '',
    `locale` VARCHAR(50) DEFAULT '',
    `country` VARCHAR(100) DEFAULT '',
    `region` VARCHAR(100) DEFAULT '',
    `city` VARCHAR(100) DEFAULT '',
    `device` VARCHAR(20) DEFAULT 'desktop',
    `user_agent` VARCHAR(500) DEFAULT '',
    `is_new` TINYINT(1) DEFAULT 1,
    `visited_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `last_active_at` TIMESTAMP NULL,
    `duration_seconds` INT DEFAULT 0,
    INDEX `idx_session` (`session_id`),
    INDEX `idx_visited` (`visited_at`),
    INDEX `idx_page` (`page`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Real visitor reaction votes (one vote per devotional + emoji + IP). Counts
-- are derived by GROUP BY — no fake seeded numbers anywhere.
CREATE TABLE IF NOT EXISTS `devotional_reaction_votes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `devotional_id` VARCHAR(36) NOT NULL,
    `emoji` VARCHAR(32) NOT NULL,
    `ip_hash` CHAR(64) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_vote` (`devotional_id`, `emoji`, `ip_hash`),
    INDEX `idx_devotional` (`devotional_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert default settings
INSERT IGNORE INTO `settings` (`setting_key`, `setting_value`) VALUES
('admin_timezone', 'Africa/Lagos'),
('telegram_enabled', 'false'),
('telegram_post_time', '06:00'),
('telegram_schedule_mode', 'scheduled'),
('admin_password_hash', ''),
('notify_email', ''),
('smtp_host', ''),
('smtp_user', ''),
('smtp_pass', ''),
('smtp_port', '587'),
('smtp_secure', 'tls'),
('mail_method', 'resend'),
('resend_api_key', ''),
('resend_from_email', ''),
('resend_from_name', 'Daily Impact Devotional'),
('resend_reply_to', ''),
('resend_enabled', 'true'),
('homepage_hero_image', ''),
('paystack_public_key', ''),
('paystack_secret_key', ''),
('paystack_enabled', 'false'),
('flutterwave_public_key', ''),
('flutterwave_secret_key', ''),
('flutterwave_encryption_key', ''),
('flutterwave_enabled', 'false'),
('webhook_url', ''),
('webhook_secret', ''),
('default_currency', 'NGN'),
('donation_message', 'Thank you for supporting Daily Impact Devotional.'),
-- Which payment gateway processes each currency in the Donate modal (JSON)
('gateway_currency_map', '{"NGN":"paystack","USD":"flutterwave","GBP":"flutterwave"}'),
('bank_transfer_enabled', 'true'),
('bank_account_name', 'Daily Impact Devotional Ministries'),
('bank_account_number', ''),
('bank_name', ''),
-- Multiple bank accounts, one JSON entry per account (currency + international details)
('bank_accounts', '[]'),
('bank_currency', 'NGN'),
('security_lockout_threshold', '3'),
-- Bans are PERMANENT until an administrator unbans the IP from the dashboard.
-- (security_ban_minutes is kept for backward compatibility but no longer expires bans.)
('security_ban_minutes', '0'),
('security_subnet_v4', '24'),
('security_subnet_v6', '64'),
('security_notify_emails', '');

-- No default admin is seeded — install.php creates the real admin account
-- (with the name/email/password entered during installation) and removes any
-- placeholder row, so a known-credential test account can never exist.
