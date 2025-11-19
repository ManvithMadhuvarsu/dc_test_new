CREATE DATABASE IF NOT EXISTS `Exam_DB_Cursor`;
USE `Exam_DB_Cursor`;

CREATE TABLE IF NOT EXISTS `questions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `prompt` TEXT NOT NULL,
  `option_a` VARCHAR(255) NOT NULL,
  `option_b` VARCHAR(255) NOT NULL,
  `option_c` VARCHAR(255) NOT NULL,
  `option_d` VARCHAR(255) NOT NULL,
  `correct_option` ENUM('A', 'B', 'C', 'D') NOT NULL,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `students` (
  `student_identifier` VARCHAR(120) NOT NULL,
  `full_name` VARCHAR(120) NOT NULL,
  `degree` VARCHAR(120),
  `course` VARCHAR(120),
  `has_attempted` TINYINT(1) DEFAULT 0,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`student_identifier`)
);

CREATE TABLE IF NOT EXISTS `sessions` (
  `session_id` CHAR(36) NOT NULL,
  `student_name` VARCHAR(120) NOT NULL,
  `degree` VARCHAR(120),
  `course` VARCHAR(120) NOT NULL,
  `student_identifier` VARCHAR(120) NOT NULL,
  `status` ENUM('ACTIVE', 'COMPLETED', 'TERMINATED') NOT NULL DEFAULT 'ACTIVE',
  `score` INT DEFAULT NULL,
  `started_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  `ended_at` DATETIME DEFAULT NULL,
  `violation_reason` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`session_id`),
  CONSTRAINT `fk_sessions_student`
    FOREIGN KEY (`student_identifier`) REFERENCES `students` (`student_identifier`)
);

CREATE TABLE IF NOT EXISTS `session_questions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `session_id` CHAR(36) NOT NULL,
  `question_id` INT NOT NULL,
  `sequence` INT NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_session_questions_session`
    FOREIGN KEY (`session_id`) REFERENCES `sessions` (`session_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_session_questions_question`
    FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `responses` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `session_id` CHAR(36) NOT NULL,
  `question_id` INT NOT NULL,
  `selected_option` ENUM('A', 'B', 'C', 'D') DEFAULT NULL,
  `is_correct` TINYINT(1) DEFAULT 0,
  `answered_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_responses_session`
    FOREIGN KEY (`session_id`) REFERENCES `sessions` (`session_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_responses_question`
    FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `violations` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `session_id` CHAR(36) NOT NULL,
  `reason` VARCHAR(255) NOT NULL,
  `recorded_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_violations_session`
    FOREIGN KEY (`session_id`) REFERENCES `sessions` (`session_id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `session_id` CHAR(36) NOT NULL,
  `student_identifier` VARCHAR(120) NOT NULL,
  `status` ENUM('CONNECTED', 'STARTED_TEST', 'KICKED_OUT', 'SUBMITTED') NOT NULL,
  `score` INT DEFAULT NULL,
  `violation_reason` VARCHAR(255) DEFAULT NULL,
  `logged_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_student_identifier` (`student_identifier`),
  INDEX `idx_session_id` (`session_id`),
  INDEX `idx_logged_at` (`logged_at`)
);

INSERT INTO `questions` (`prompt`, `option_a`, `option_b`, `option_c`, `option_d`, `correct_option`)
VALUES
  ('HTML stands for?', 'Hyper Trainer Marking Language', 'Hyper Text Markup Language', 'Hyper Text Marketing Language', 'Hyper Text Markup Leveler', 'B'),
  ('Which CSS property controls the text size?', 'font-style', 'text-size', 'font-size', 'text-style', 'C'),
  ('Inside which HTML element do we put JavaScript?', '<javascript>', '<script>', '<js>', '<scripting>', 'B'),
  ('React applications are built using?', 'Templates', 'Components', 'Widgets', 'Handlers', 'B')
ON DUPLICATE KEY UPDATE `prompt` = VALUES(`prompt`);

INSERT INTO `students` (`student_identifier`, `full_name`, `degree`, `course`)
VALUES
  ('AM.SC.P2AML24023', 'Manvith Rao', 'B.Tech', 'Computer Science'),
  ('AM.SC.P2AML24024', 'Saanvi N', 'B.Tech', 'Computer Science'),
  ('AM.SC.P2AML24025', 'Arjun M', 'B.Tech', 'Computer Science'),
  ('AM.SC.P2AML24026', 'Navya S', 'B.Tech', 'Information Technology')
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`);

