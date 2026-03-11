#!/usr/bin/env node
/**
 * Trigger the AgentC2 SDLC Triage workflow for an approved work package.
 *
 * Usage:
 *   AGENTC2_API_KEY="<key>" node trigger-sdlc.js <work-package-slug>
 *
 * What it does:
 *   1. Loads the work package from Supabase by slug
 *   2. Loads all linked Jira tickets
 *   3. For each ticket, calls the AgentC2 SDLC Triage (Claude Code) workflow
 *   4. Updates the work package status to "in_development"
 *   5. Stores the AgentC2 run IDs in work_package_prs
 */

const SUPABASE_URL = "https://xqyixujilhaozfvepbbd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxeWl4dWppbGhhb3pmdmVwYmJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzk5MzUsImV4cCI6MjA4ODgxNTkzNX0.nJM6eWClufeoxP58nszpuCHQTnwthFQJoyCGXgwsbTI";
const AGENTC2_API_KEY = process.env.AGENTC2_API_KEY;
const AGENTC2_WORKFLOW_SLUG = "sdlc-triage-claude-agentc2-urusj8";
const TARGET_REPO = "useAnzen/application-mono-repo";

const slug = process.argv[2];

if (!slug) {
    console.error("Usage: AGENTC2_API_KEY=<key> node trigger-sdlc.js <work-package-slug>");
    process.exit(1);
}

if (!AGENTC2_API_KEY) {
    console.error("Set AGENTC2_API_KEY environment variable.");
    process.exit(1);
}

const supaHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
};

async function main() {
    // 1. Load work package
    const wpRes = await fetch(`${SUPABASE_URL}/rest/v1/work_packages?slug=eq.${slug}&limit=1`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    const wps = await wpRes.json();
    if (!wps.length) {
        console.error(`Work package "${slug}" not found.`);
        process.exit(1);
    }
    const wp = wps[0];
    console.log(`Work package: ${wp.title} [${wp.status}]`);

    if (wp.status !== "approved") {
        console.error(`Work package must be "approved" to trigger SDLC. Current status: ${wp.status}`);
        process.exit(1);
    }

    // 2. Load linked tickets
    const ticketRes = await fetch(
        `${SUPABASE_URL}/rest/v1/work_package_tickets?work_package_id=eq.${wp.id}&order=created_at.asc`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const tickets = await ticketRes.json();
    if (!tickets.length) {
        console.error("No Jira tickets linked. Add tickets before triggering SDLC.");
        process.exit(1);
    }
    console.log(`Found ${tickets.length} linked ticket(s).`);

    // 3. For each ticket, trigger the AgentC2 SDLC Triage workflow
    for (const ticket of tickets) {
        console.log(`\nDispatching ${ticket.jira_key}...`);
        try {
            const runRes = await fetch(`https://agentc2.ai/api/v1/workflows/${AGENTC2_WORKFLOW_SLUG}/execute`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${AGENTC2_API_KEY}`
                },
                body: JSON.stringify({
                    input: {
                        title: `${ticket.jira_key} - ${ticket.jira_summary || wp.title}`,
                        description: wp.description + (wp.implementation_plan_url ? `\n\nImplementation Plan: ${wp.implementation_plan_url}` : ""),
                        repository: TARGET_REPO,
                        sourceTicketId: ticket.jira_key
                    }
                })
            });

            if (!runRes.ok) {
                const errText = await runRes.text();
                console.error(`  Failed: ${runRes.status} ${errText}`);
                continue;
            }

            const run = await runRes.json();
            const runId = run.id || run.runId || "unknown";
            console.log(`  Workflow run started: ${runId}`);

            // Store a placeholder PR record with the AgentC2 run ID
            await fetch(`${SUPABASE_URL}/rest/v1/work_package_prs`, {
                method: "POST",
                headers: supaHeaders,
                body: JSON.stringify({
                    work_package_id: wp.id,
                    ticket_id: ticket.id,
                    pr_number: 0,
                    pr_url: "",
                    pr_title: `SDLC: ${ticket.jira_key}`,
                    pr_status: "open",
                    agentc2_run_id: runId
                })
            });
        } catch (err) {
            console.error(`  Error: ${err.message}`);
        }
    }

    // 4. Update work package status
    await fetch(`${SUPABASE_URL}/rest/v1/work_packages?id=eq.${wp.id}`, {
        method: "PATCH",
        headers: supaHeaders,
        body: JSON.stringify({
            status: "in_development",
            updated_at: new Date().toISOString()
        })
    });
    console.log("\nWork package status updated to: in_development");
    console.log("Done.");
}

main().catch(function (err) {
    console.error("Fatal:", err);
    process.exit(1);
});
