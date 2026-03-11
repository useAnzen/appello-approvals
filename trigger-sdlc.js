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
const TARGET_REPO = process.env.TARGET_REPO || "useAnzen/application-mono-repo";

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

    // 3. Load wp_documents for plans and canvases
    const docsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/wp_documents?work_package_id=eq.${wp.id}&order=doc_type.asc,sort_order.asc`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const wpDocs = await docsRes.json();
    const plans = Array.isArray(wpDocs) ? wpDocs.filter(d => d.doc_type === "plan") : [];
    const canvases = Array.isArray(wpDocs) ? wpDocs.filter(d => d.doc_type === "canvas") : [];
    console.log(`Found ${plans.length} plan(s) and ${canvases.length} canvas(es).`);

    // 4. Build rich description with all linked context
    function buildDescription(ticket) {
        let desc = `## Work Package: ${wp.title}\n\n`;
        desc += `${wp.description}\n\n`;
        desc += `### Linked Artifacts\n\n`;
        desc += `- **Design Spec:** ${wp.spec_url}\n`;
        desc += `- **Pipeline Board:** https://useanzen.github.io/appello-approvals/pipeline.html\n\n`;

        if (plans.length > 0) {
            desc += `### Implementation Plans\n\n`;
            plans.forEach(p => {
                const preview = p.content.length > 500 ? p.content.substring(0, 500) + "..." : p.content;
                desc += `#### ${p.title}\n\n${preview}\n\n`;
            });
        }

        if (canvases.length > 0) {
            desc += `### Canvases\n\n`;
            canvases.forEach(c => {
                desc += `- **${c.title}** (HTML canvas, ${c.content.length} chars)\n`;
            });
            desc += `\n`;
        }

        desc += `### Jira Tickets in this Work Package\n\n`;
        tickets.forEach(t => {
            const current = t.jira_key === ticket.jira_key ? " \u2190 (this ticket)" : "";
            desc += `- [${t.jira_key}](${t.jira_url}) ${t.jira_summary || ""}${current}\n`;
        });
        if (wp.approved_at) desc += `\n### Approved: ${new Date(wp.approved_at).toLocaleDateString()}\n`;
        desc += `\n---\n_Dispatched from Appello Work Packages_`;
        return desc;
    }

    // 5. For each ticket, trigger the AgentC2 SDLC Triage workflow
    for (const ticket of tickets) {
        console.log(`\nDispatching ${ticket.jira_key}...`);
        try {
            const richDescription = buildDescription(ticket);
            const runRes = await fetch(`https://agentc2.ai/api/v1/workflows/${AGENTC2_WORKFLOW_SLUG}/execute`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${AGENTC2_API_KEY}`
                },
                body: JSON.stringify({
                    input: {
                        title: `${ticket.jira_key} - ${ticket.jira_summary || wp.title}`,
                        description: richDescription,
                        repository: TARGET_REPO,
                        sourceTicketId: ticket.jira_key,
                        labels: ["work-package", wp.slug]
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

    // 6. Update work package status
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
