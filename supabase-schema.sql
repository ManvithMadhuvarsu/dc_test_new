-- Supabase (Postgres) schema + seed data
-- Run this inside the Supabase SQL editor before deploying the backend.

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

create table if not exists questions (
  id serial primary key,
  prompt text not null,
  option_a varchar(255) not null,
  option_b varchar(255) not null,
  option_c varchar(255) not null,
  option_d varchar(255) not null,
  correct_option text not null check (correct_option in ('A','B','C','D')),
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists students (
  student_identifier varchar(120) primary key,
  full_name varchar(120) not null,
  degree varchar(120),
  course varchar(120),
  has_attempted boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists sessions (
  session_id uuid primary key default gen_random_uuid(),
  student_name varchar(120) not null,
  degree varchar(120),
  course varchar(120) not null,
  student_identifier varchar(120) not null references students(student_identifier),
  status text not null check (status in ('ACTIVE','COMPLETED','TERMINATED')) default 'ACTIVE',
  score integer,
  started_at timestamptz default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  violation_reason varchar(255)
);

create table if not exists session_questions (
  id bigserial primary key,
  session_id uuid not null references sessions(session_id) on delete cascade,
  question_id integer not null references questions(id) on delete cascade,
  sequence integer not null
);

create table if not exists responses (
  id bigserial primary key,
  session_id uuid not null references sessions(session_id) on delete cascade,
  question_id integer not null references questions(id) on delete cascade,
  selected_option text check (selected_option in ('A','B','C','D')),
  is_correct boolean default false,
  answered_at timestamptz default now()
);

create table if not exists violations (
  id bigserial primary key,
  session_id uuid not null references sessions(session_id) on delete cascade,
  reason varchar(255) not null,
  recorded_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigserial primary key,
  session_id uuid not null,
  student_identifier varchar(120) not null,
  status text not null check (status in ('CONNECTED','STARTED_TEST','KICKED_OUT','SUBMITTED')),
  score integer,
  violation_reason varchar(255),
  logged_at timestamptz not null default now(),
  index_student_identifier varchar(120),
  index_session uuid,
  index_logged_at timestamptz
);

create index if not exists idx_audit_logs_student on audit_logs(student_identifier);
create index if not exists idx_audit_logs_session on audit_logs(session_id);
create index if not exists idx_audit_logs_logged_at on audit_logs(logged_at);

insert into questions (prompt, option_a, option_b, option_c, option_d, correct_option)
values
  ('HTML stands for?', 'Hyper Trainer Marking Language', 'Hyper Text Markup Language', 'Hyper Text Marketing Language', 'Hyper Text Markup Leveler', 'B'),
  ('Which CSS property controls the text size?', 'font-style', 'text-size', 'font-size', 'text-style', 'C'),
  ('Inside which HTML element do we put JavaScript?', '<javascript>', '<script>', '<js>', '<scripting>', 'B'),
  ('React applications are built using?', 'Templates', 'Components', 'Widgets', 'Handlers', 'B')
on conflict (id) do nothing;

insert into students (student_identifier, full_name, degree, course)
values
  ('AM.SC.P2AML24023', 'Manvith Rao', 'B.Tech', 'Computer Science'),
  ('AM.SC.P2AML24024', 'Saanvi N', 'B.Tech', 'Computer Science'),
  ('AM.SC.P2AML24025', 'Arjun M', 'B.Tech', 'Computer Science'),
  ('AM.SC.P2AML24026', 'Navya S', 'B.Tech', 'Information Technology')
on conflict (student_identifier) do update set full_name = excluded.full_name,
                                             degree = excluded.degree,
                                             course = excluded.course;

