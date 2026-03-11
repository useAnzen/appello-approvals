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

-- 4. releases: groups work packages into release milestones
CREATE TABLE IF NOT EXISTS releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    target_date DATE,
    actual_date DATE,
    status TEXT NOT NULL DEFAULT 'planned',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Add planning columns to work_packages
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_packages' AND column_name = 'release_id') THEN
        ALTER TABLE work_packages ADD COLUMN release_id UUID REFERENCES releases(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_packages' AND column_name = 'planned_start') THEN
        ALTER TABLE work_packages ADD COLUMN planned_start DATE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_packages' AND column_name = 'planned_end') THEN
        ALTER TABLE work_packages ADD COLUMN planned_end DATE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_packages' AND column_name = 'priority') THEN
        ALTER TABLE work_packages ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_packages' AND column_name = 'sort_order') THEN
        ALTER TABLE work_packages ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;

-- 6. wp_status_history: tracks status transitions for timeline overlays
CREATE TABLE IF NOT EXISTS wp_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_package_id UUID NOT NULL REFERENCES work_packages(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpsh_work_package ON wp_status_history(work_package_id);

-- 7. wp_dependencies: dependency arrows between work packages
CREATE TABLE IF NOT EXISTS wp_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    predecessor_id UUID NOT NULL REFERENCES work_packages(id) ON DELETE CASCADE,
    successor_id UUID NOT NULL REFERENCES work_packages(id) ON DELETE CASCADE,
    dependency_type TEXT NOT NULL DEFAULT 'finish_to_start',
    UNIQUE(predecessor_id, successor_id)
);

CREATE INDEX IF NOT EXISTS idx_wpd_predecessor ON wp_dependencies(predecessor_id);
CREATE INDEX IF NOT EXISTS idx_wpd_successor ON wp_dependencies(successor_id);

-- RLS for new tables
ALTER TABLE releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_dependencies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'releases' AND policyname = 'anon_select_releases') THEN
        CREATE POLICY "anon_select_releases" ON releases FOR SELECT TO anon USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'releases' AND policyname = 'anon_insert_releases') THEN
        CREATE POLICY "anon_insert_releases" ON releases FOR INSERT TO anon WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'releases' AND policyname = 'anon_update_releases') THEN
        CREATE POLICY "anon_update_releases" ON releases FOR UPDATE TO anon USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'releases' AND policyname = 'anon_delete_releases') THEN
        CREATE POLICY "anon_delete_releases" ON releases FOR DELETE TO anon USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wp_status_history' AND policyname = 'anon_select_wp_status_history') THEN
        CREATE POLICY "anon_select_wp_status_history" ON wp_status_history FOR SELECT TO anon USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wp_status_history' AND policyname = 'anon_insert_wp_status_history') THEN
        CREATE POLICY "anon_insert_wp_status_history" ON wp_status_history FOR INSERT TO anon WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wp_dependencies' AND policyname = 'anon_select_wp_dependencies') THEN
        CREATE POLICY "anon_select_wp_dependencies" ON wp_dependencies FOR SELECT TO anon USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wp_dependencies' AND policyname = 'anon_insert_wp_dependencies') THEN
        CREATE POLICY "anon_insert_wp_dependencies" ON wp_dependencies FOR INSERT TO anon WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wp_dependencies' AND policyname = 'anon_delete_wp_dependencies') THEN
        CREATE POLICY "anon_delete_wp_dependencies" ON wp_dependencies FOR DELETE TO anon USING (true);
    END IF;
END $$;

-- Status change trigger: automatically logs transitions to wp_status_history
CREATE OR REPLACE FUNCTION log_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO wp_status_history (work_package_id, from_status, to_status)
        VALUES (NEW.id, OLD.status, NEW.status);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_status_history ON work_packages;
CREATE TRIGGER trg_status_history
    AFTER UPDATE ON work_packages
    FOR EACH ROW EXECUTE FUNCTION log_status_change();

-- 8. wp_documents: plans (markdown) and canvases (HTML) per work package
CREATE TABLE IF NOT EXISTS wp_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_package_id UUID NOT NULL REFERENCES work_packages(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpd_work_package ON wp_documents(work_package_id);

ALTER TABLE wp_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wp_documents' AND policyname = 'anon_select_wp_documents') THEN
        CREATE POLICY "anon_select_wp_documents" ON wp_documents FOR SELECT TO anon USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wp_documents' AND policyname = 'anon_insert_wp_documents') THEN
        CREATE POLICY "anon_insert_wp_documents" ON wp_documents FOR INSERT TO anon WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wp_documents' AND policyname = 'anon_update_wp_documents') THEN
        CREATE POLICY "anon_update_wp_documents" ON wp_documents FOR UPDATE TO anon USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wp_documents' AND policyname = 'anon_delete_wp_documents') THEN
        CREATE POLICY "anon_delete_wp_documents" ON wp_documents FOR DELETE TO anon USING (true);
    END IF;
END $$;

-- 9. RICE scoring and customer columns on work_packages
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_packages' AND column_name = 'rice_reach') THEN
        ALTER TABLE work_packages ADD COLUMN rice_reach INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_packages' AND column_name = 'rice_impact') THEN
        ALTER TABLE work_packages ADD COLUMN rice_impact NUMERIC(3,1);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_packages' AND column_name = 'rice_confidence') THEN
        ALTER TABLE work_packages ADD COLUMN rice_confidence INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_packages' AND column_name = 'rice_effort') THEN
        ALTER TABLE work_packages ADD COLUMN rice_effort NUMERIC(4,1);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_packages' AND column_name = 'customer_affected') THEN
        ALTER TABLE work_packages ADD COLUMN customer_affected TEXT;
    END IF;
END $$;

-- 10. Add work_package_id to feedback table for work-package-scoped feedback
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS work_package_id UUID REFERENCES work_packages(id) ON DELETE SET NULL;

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
