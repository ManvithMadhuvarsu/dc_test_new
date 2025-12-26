-- ===============================
-- QUESTIONS
-- ===============================
CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  prompt TEXT NOT NULL,
  option_a VARCHAR(255),  -- NULL allowed for header questions (is_group_header = TRUE)
  option_b VARCHAR(255),  -- NULL allowed for header questions
  option_c VARCHAR(255),  -- NULL allowed for header questions
  option_d VARCHAR(255),  -- NULL allowed for header questions
  correct_option VARCHAR(20) CHECK (correct_option IS NULL OR correct_option ~ '^[A-D](,[A-D])*$'),  -- Single letter (A-D) or comma-separated (A,C,D) for multi-select. NULL for header questions
  allows_multiple BOOLEAN DEFAULT FALSE,  -- If TRUE, question allows multiple selections (checkboxes). If FALSE, single selection (radio buttons)
  image_url TEXT,  -- Optional: URL to question image (diagrams, charts, screenshots, etc.)
  question_group_id INT,  -- Optional: Groups questions together (e.g., questions sharing same image)
  is_group_header BOOLEAN DEFAULT FALSE,  -- If TRUE, this question shows instruction + image for the group
  group_order INT,  -- Optional: Order within the group (1, 2, 3, etc.) - maintains question order within group
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Constraint: Header questions don't need options, regular questions do
  CONSTRAINT check_header_options CHECK (
    (is_group_header = TRUE AND option_a IS NULL) OR
    (is_group_header = FALSE AND option_a IS NOT NULL AND option_b IS NOT NULL AND option_c IS NOT NULL AND option_d IS NOT NULL AND correct_option IS NOT NULL)
  )
);

-- ===============================
-- STUDENTS
-- ===============================
CREATE TABLE IF NOT EXISTS students (
  student_identifier VARCHAR(120) PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  degree VARCHAR(120),
  course VARCHAR(120),
  has_attempted BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===============================
-- SESSIONS
-- ===============================
CREATE TABLE IF NOT EXISTS sessions (
  session_id UUID PRIMARY KEY,
  student_name VARCHAR(120) NOT NULL,
  degree VARCHAR(120),
  course VARCHAR(120) NOT NULL,
  student_identifier VARCHAR(120) NOT NULL,
  status VARCHAR(20) CHECK (status IN ('ACTIVE','COMPLETED','TERMINATED')) DEFAULT 'ACTIVE',
  score NUMERIC(5,2),  -- Changed from INT to NUMERIC to support decimal scores (e.g., 8.17)
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  violation_reason VARCHAR(255),
  CONSTRAINT fk_sessions_student
    FOREIGN KEY (student_identifier)
    REFERENCES students(student_identifier)
);

-- ===============================
-- SESSION QUESTIONS
-- ===============================
CREATE TABLE IF NOT EXISTS session_questions (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL,
  question_id INT NOT NULL,
  sequence INT,  -- NULL allowed for header questions (instructions/images only)
  CONSTRAINT fk_sq_session
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
  CONSTRAINT fk_sq_question
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- ===============================
-- RESPONSES
-- ===============================
CREATE TABLE IF NOT EXISTS responses (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL,
  question_id INT NOT NULL,
  selected_option TEXT CHECK (selected_option IS NULL OR selected_option ~ '^[A-D](,[A-D])*$'),  -- Single letter or comma-separated for multi-select
  is_correct BOOLEAN DEFAULT FALSE,
  partial_score DECIMAL(5,2),  -- Partial marks for multi-select questions (0.0 to 1.0). NULL for single-select
  answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_resp_session
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
  CONSTRAINT fk_resp_question
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- ===============================
-- VIOLATIONS
-- ===============================
CREATE TABLE IF NOT EXISTS violations (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL,
  reason VARCHAR(255) NOT NULL,
  recorded_at TIMESTAMP NOT NULL,
  CONSTRAINT fk_violations_session
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

-- ===============================
-- AUDIT LOGS
-- ===============================
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL,
  student_identifier VARCHAR(120) NOT NULL,
  status VARCHAR(30) CHECK (status IN ('CONNECTED','STARTED_TEST','KICKED_OUT','SUBMITTED')),
  score NUMERIC(5,2),
  violation_reason VARCHAR(255),
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_student ON audit_logs(student_identifier);
CREATE INDEX idx_audit_session ON audit_logs(session_id);
CREATE INDEX idx_audit_logged_at ON audit_logs(logged_at);


INSERT INTO questions (prompt, option_a, option_b, option_c, option_d, correct_option)
VALUES
 ('HTML stands for?', 'Hyper Trainer Marking Language', 'Hyper Text Markup Language', 'Hyper Text Marketing Language', 'Hyper Text Markup Leveler', 'B'),
 ('Which CSS property controls the text size?', 'font-style', 'text-size', 'font-size', 'text-style', 'C'),
 ('Inside which HTML element do we put JavaScript?', '<javascript>', '<script>', '<js>', '<scripting>', 'B'),
 ('React applications are built using?', 'Templates', 'Components', 'Widgets', 'Handlers', 'B')
ON CONFLICT DO NOTHING;


INSERT INTO students (student_identifier, full_name, degree, course)
VALUES
 ('DC@001', 'Manvith', 'B.Tech', 'Computer Science'),
 ('DC@002', 'Aravindh', 'B.Tech', 'VLSI'),
 ('DC@003', 'Amitha', 'B.Tech', 'Computer Science'),
 ('DC@004', 'Giri', 'B.Tech', 'Information Technology')
ON CONFLICT (student_identifier) DO NOTHING;
