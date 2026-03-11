-- Appello Approvals SDLC Pipeline Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- 1. work_packages: one row per design spec / work package
CREATE TABLE IF NOT EXISTS work_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    spec_url TEXT NOT NULL DEFAULT '',
    implementation_plan_url TEXT,
    canvas_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at TIMESTAMPTZ,
    approved_by TEXT
);

-- 2. work_package_tickets: links work packages to Jira tickets
CREATE TABLE IF NOT EXISTS work_package_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_package_id UUID NOT NULL REFERENCES work_packages(id) ON DELETE CASCADE,
    jira_key TEXT NOT NULL,
    jira_url TEXT NOT NULL DEFAULT '',
    jira_summary TEXT NOT NULL DEFAULT '',
    jira_status TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. work_package_prs: links work packages to GitHub PRs
CREATE TABLE IF NOT EXISTS work_package_prs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_package_id UUID NOT NULL REFERENCES work_packages(id) ON DELETE CASCADE,
    ticket_id UUID REFERENCES work_package_tickets(id) ON DELETE SET NULL,
    pr_number INTEGER NOT NULL,
    pr_url TEXT NOT NULL DEFAULT '',
    pr_title TEXT NOT NULL DEFAULT '',
    pr_status TEXT NOT NULL DEFAULT 'open',
    branch_name TEXT,
    agentc2_run_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wpt_work_package ON work_package_tickets(work_package_id);
CREATE INDEX IF NOT EXISTS idx_wpp_work_package ON work_package_prs(work_package_id);
CREATE INDEX IF NOT EXISTS idx_wpp_ticket ON work_package_prs(ticket_id);

-- RLS policies (match existing feedback table pattern: anon can read and insert)
ALTER TABLE work_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_package_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_package_prs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_work_packages" ON work_packages FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_work_packages" ON work_packages FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_work_packages" ON work_packages FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_work_package_tickets" ON work_package_tickets FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_work_package_tickets" ON work_package_tickets FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_work_package_tickets" ON work_package_tickets FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_work_package_tickets" ON work_package_tickets FOR DELETE TO anon USING (true);

CREATE POLICY "anon_select_work_package_prs" ON work_package_prs FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_work_package_prs" ON work_package_prs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_work_package_prs" ON work_package_prs FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_work_package_prs" ON work_package_prs FOR DELETE TO anon USING (true);

-- Seed the 2 existing work packages
INSERT INTO work_packages (slug, title, description, status, spec_url)
VALUES
    ('safety-incident-management',
     'Safety & Incident Management',
     'Comprehensive safety incident tracking, OSHA compliance, investigation workflows, and corrective actions',
     'pending_review',
     'https://useanzen.github.io/appello-approvals/docs/safety-incident-management.html'),
    ('personnel-qr-codes',
     'Personnel QR Codes',
     'Scannable QR stickers for personnel showing certifications, emergency contacts, and compliance status',
     'pending_review',
     'https://useanzen.github.io/appello-approvals/docs/personnel-qr-codes.html')
ON CONFLICT (slug) DO NOTHING;
