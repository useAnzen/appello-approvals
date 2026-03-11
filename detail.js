(function () {
    var cfg = window.FEEDBACK_CONFIG;
    if (!cfg) return;

    var slug = location.pathname.split("/").pop().replace(".html", "");
    var API = cfg.supabaseUrl + "/rest/v1";
    var headers = {
        apikey: cfg.supabaseKey,
        Authorization: "Bearer " + cfg.supabaseKey
    };

    var STATUS_META = {
        draft: { label: "Draft", cls: "badge-draft" },
        pending_review: { label: "Pending Review", cls: "badge-pending_review" },
        needs_changes: { label: "Needs Changes", cls: "badge-needs_changes" },
        approved: { label: "Approved", cls: "badge-approved" },
        in_development: { label: "In Development", cls: "badge-in_development" },
        in_review: { label: "In Review", cls: "badge-in_review" },
        deployed: { label: "Deployed", cls: "badge-deployed" }
    };

    var wp = null;
    var documents = [];
    var tickets = [];
    var prs = [];
    var feedbackItems = [];

    function esc(s) {
        var d = document.createElement("div");
        d.textContent = s || "";
        return d.innerHTML;
    }

    function loadData() {
        fetch(API + "/work_packages?slug=eq." + slug + "&limit=1", { headers: headers })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!Array.isArray(data) || data.length === 0) {
                    renderSidebar(null);
                    return;
                }
                wp = data[0];

                return Promise.all([
                    fetch(API + "/wp_documents?work_package_id=eq." + wp.id + "&order=doc_type.asc,sort_order.asc", { headers: headers }).then(function (r) { return r.json(); }),
                    fetch(API + "/work_package_tickets?work_package_id=eq." + wp.id + "&order=created_at.asc", { headers: headers }).then(function (r) { return r.json(); }),
                    fetch(API + "/work_package_prs?work_package_id=eq." + wp.id + "&order=created_at.asc", { headers: headers }).then(function (r) { return r.json(); }),
                    fetch(API + "/feedback?document_slug=eq." + slug + "&order=created_at.desc", { headers: headers }).then(function (r) { return r.json(); })
                ]).then(function (results) {
                    documents = Array.isArray(results[0]) ? results[0] : [];
                    tickets = Array.isArray(results[1]) ? results[1] : [];
                    prs = Array.isArray(results[2]) ? results[2] : [];
                    feedbackItems = Array.isArray(results[3]) ? results[3] : [];
                    renderSidebar(wp);

                    window.DETAIL_WP = wp;
                    window.DETAIL_DOCS = documents;
                });
            })
            .catch(function () {
                renderSidebar(null);
            });
    }

    function renderSidebar(wp) {
        var sidebar = document.getElementById("detail-sidebar");
        if (!sidebar) return;

        if (!wp) {
            sidebar.innerHTML =
                '<div class="sb-back"><a href="../">&larr; Work Packages</a></div>' +
                '<div class="sb-section"><p class="sb-empty">Work package not found.</p></div>';
            return;
        }

        var meta = STATUS_META[wp.status] || STATUS_META.draft;
        var html = '';

        html += '<div class="sb-back"><a href="../">&larr; Work Packages</a></div>';
        html += '<div class="sb-header">';
        html += '<h3>' + esc(wp.title) + '</h3>';
        html += '<span class="badge ' + meta.cls + '">' + esc(meta.label) + '</span>';
        html += '</div>';

        html += '<div class="sb-section">';
        html += '<div class="sb-label">Documents</div>';
        html += '<a href="#" class="sb-link active" data-view="spec">Design Spec</a>';
        var plans = documents.filter(function (d) { return d.doc_type === "plan"; });
        plans.forEach(function (doc) {
            html += '<a href="#" class="sb-link" data-view="plan" data-doc-id="' + doc.id + '">Implementation Plan</a>';
        });
        html += '</div>';

        if (tickets.length > 0) {
            html += '<div class="sb-section">';
            html += '<div class="sb-label">Jira Tickets</div>';
            tickets.forEach(function (t) {
                html += '<a href="' + esc(t.jira_url) + '" target="_blank" class="sb-ext-link">' +
                    esc(t.jira_key) +
                    (t.jira_status ? '<span class="sb-badge">' + esc(t.jira_status) + '</span>' : '') +
                '</a>';
            });
            html += '</div>';
        }

        if (prs.length > 0) {
            html += '<div class="sb-section">';
            html += '<div class="sb-label">Pull Requests</div>';
            prs.forEach(function (p) {
                var prLabel = p.pr_number > 0 ? "#" + p.pr_number : p.pr_title;
                var statusCls = p.pr_status === "merged" ? "sb-badge-success" : (p.pr_status === "closed" ? "sb-badge-danger" : "sb-badge-warning");
                html += '<a href="' + esc(p.pr_url || "#") + '" target="_blank" class="sb-ext-link">' +
                    esc(prLabel) +
                    '<span class="sb-badge ' + statusCls + '">' + esc(p.pr_status) + '</span>' +
                '</a>';
            });
            html += '</div>';
        }

        var pendingFb = feedbackItems.filter(function (f) { return !f.is_addressed; });
        html += '<div class="sb-section">';
        html += '<div class="sb-label">Feedback' + (feedbackItems.length > 0 ? ' (' + pendingFb.length + ' pending)' : '') + '</div>';
        if (feedbackItems.length === 0) {
            html += '<p class="sb-empty">No feedback yet</p>';
        } else {
            var approved = feedbackItems.filter(function (f) { return f.status === "approved"; }).length;
            var changes = feedbackItems.filter(function (f) { return f.status === "needs_changes" && !f.is_addressed; }).length;
            var rejected = feedbackItems.filter(function (f) { return f.status === "rejected" && !f.is_addressed; }).length;
            if (approved > 0) html += '<span class="sb-fb-badge badge-approved">' + approved + ' approved</span>';
            if (changes > 0) html += '<span class="sb-fb-badge badge-needs_changes">' + changes + ' needs changes</span>';
            if (rejected > 0) html += '<span class="sb-fb-badge badge-needs_changes" style="background:#fee2e2;color:#991b1b">' + rejected + ' rejected</span>';
        }
        html += '</div>';

        var sdlcRuns = prs.filter(function (p) { return p.agentc2_run_id && p.agentc2_run_id !== "pending"; });
        if (sdlcRuns.length > 0 || wp.status === "in_development" || wp.status === "in_review") {
            html += '<div class="sb-section" id="sdlc-pipeline-section">';
            html += '<div class="sb-label">SDLC Pipeline</div>';
            if (sdlcRuns.length === 0) {
                html += '<p class="sb-empty">Waiting for pipeline data...</p>';
            } else {
                sdlcRuns.forEach(function (run) {
                    var label = run.pr_title || "Run " + run.agentc2_run_id.substring(0, 8);
                    html += '<div class="sdlc-run" data-run-id="' + esc(run.agentc2_run_id) + '">';
                    html += '<div class="sdlc-run-header">' + esc(label) + '</div>';
                    html += '<div class="sdlc-run-status">Loading...</div>';
                    html += '<div class="sdlc-run-steps"></div>';
                    html += '</div>';
                });
            }
            html += '</div>';
        }

        if (location.search.indexOf("manage=true") === -1) {
            html += '<div class="sb-section sb-manage">';
            html += '<a href="?' + 'manage=true" class="sb-link sb-manage-link">Manage</a>';
            html += '</div>';
        }

        sidebar.innerHTML = html;

        if (sdlcRuns.length > 0) {
            startSdlcPolling(sdlcRuns);
        }

        sidebar.querySelectorAll(".sb-link[data-view]").forEach(function (link) {
            link.addEventListener("click", function (e) {
                e.preventDefault();
                sidebar.querySelectorAll(".sb-link").forEach(function (l) { l.classList.remove("active"); });
                link.classList.add("active");
                switchView(link.dataset.view, link.dataset.docId);
            });
        });
    }

    function switchView(view, docId) {
        var specContent = document.getElementById("spec-content");
        var dynamicContent = document.getElementById("dynamic-content");

        if (view === "spec") {
            if (specContent) specContent.style.display = "";
            if (dynamicContent) dynamicContent.innerHTML = "";
            return;
        }

        if (specContent) specContent.style.display = "none";

        if (view === "plan") {
            var doc = documents.find(function (d) { return d.id === docId; });
            if (!doc) return;
            if (typeof marked !== "undefined") {
                dynamicContent.innerHTML = '<div class="plan-content">' + marked.parse(doc.content) + '</div>';
            } else {
                dynamicContent.innerHTML = '<pre class="plan-content" style="white-space:pre-wrap;font-size:14px;line-height:1.7">' + esc(doc.content) + '</pre>';
            }
        }

    }

    var pollInterval = null;

    function startSdlcPolling(runs) {
        var apiKey = localStorage.getItem("agentc2_api_key");
        if (!apiKey) {
            apiKey = prompt("Enter your AgentC2 API key to view pipeline status:");
            if (apiKey) localStorage.setItem("agentc2_api_key", apiKey);
        }
        if (!apiKey) return;

        var apiBase = cfg.agentc2ApiBase || "https://agentc2.ai/api/v1";
        var workflowSlug = cfg.agentc2WorkflowSlug || "sdlc-triage-claude-agentc2-urusj8";

        function poll() {
            runs.forEach(function (run) {
                var el = document.querySelector('.sdlc-run[data-run-id="' + run.agentc2_run_id + '"]');
                if (!el) return;

                fetch(apiBase + "/workflows/" + workflowSlug + "/runs/" + run.agentc2_run_id, {
                    headers: { Authorization: "Bearer " + apiKey }
                })
                .then(function (r) {
                    if (!r.ok) throw new Error("API " + r.status);
                    return r.json();
                })
                .then(function (data) {
                    renderRunStatus(el, data, run.agentc2_run_id, apiKey, apiBase, workflowSlug);
                })
                .catch(function (err) {
                    el.querySelector(".sdlc-run-status").textContent = "Error: " + err.message;
                });
            });
        }

        poll();
        pollInterval = setInterval(poll, 15000);
    }

    var STEP_STATUS_ICONS = {
        completed: "\u2705",
        running: "\u23F3",
        pending: "\u23F8",
        failed: "\u274C",
        suspended: "\u270B",
        skipped: "\u23ED"
    };

    function renderRunStatus(el, data, runId, apiKey, apiBase, workflowSlug) {
        var run = data.run || data;
        var status = run.status || "unknown";
        var statusEl = el.querySelector(".sdlc-run-status");
        var stepsEl = el.querySelector(".sdlc-run-steps");

        var statusIcon = STEP_STATUS_ICONS[status] || "\u2753";
        statusEl.innerHTML = statusIcon + " <strong>" + esc(status.toUpperCase()) + "</strong>";
        if (status === "completed" || status === "failed") {
            statusEl.style.color = status === "completed" ? "var(--success-text)" : "var(--danger-text)";
        }

        var steps = run.steps || [];
        if (steps.length === 0) {
            stepsEl.innerHTML = '<p class="sb-empty">No steps yet</p>';
            return;
        }

        var html = '<div class="sdlc-steps-list">';
        steps.forEach(function (step) {
            var icon = STEP_STATUS_ICONS[step.status] || "\u2B55";
            var name = step.name || step.id || "Step";
            html += '<div class="sdlc-step">';
            html += '<span class="sdlc-step-icon">' + icon + '</span>';
            html += '<span class="sdlc-step-name">' + esc(name) + '</span>';

            if (step.status === "suspended") {
                html += '<div class="sdlc-gate">';
                html += '<button class="sdlc-gate-btn approve" data-action="approve" data-step="' + esc(step.id) + '">Approve</button>';
                html += '<button class="sdlc-gate-btn reject" data-action="reject" data-step="' + esc(step.id) + '">Reject</button>';
                html += '</div>';
            }

            if (step.output) {
                var issueUrl = step.output.issueUrl || step.output.issue_url;
                var prUrl = step.output.prUrl || step.output.pr_url || step.output.pullRequestUrl;
                if (issueUrl) {
                    html += '<a href="' + esc(issueUrl) + '" target="_blank" class="sdlc-step-link">View Issue</a>';
                }
                if (prUrl) {
                    html += '<a href="' + esc(prUrl) + '" target="_blank" class="sdlc-step-link">View PR</a>';
                }
            }

            html += '</div>';
        });
        html += '</div>';
        stepsEl.innerHTML = html;

        stepsEl.querySelectorAll(".sdlc-gate-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var action = btn.dataset.action;
                var approved = action === "approve";
                btn.disabled = true;
                btn.textContent = approved ? "Approving..." : "Rejecting...";

                fetch(apiBase + "/workflows/" + workflowSlug + "/runs/" + runId + "/resume", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: "Bearer " + apiKey
                    },
                    body: JSON.stringify({
                        resumeData: { approved: approved, decision: action, reviewer: "appello-ui" }
                    })
                })
                .then(function (r) {
                    if (!r.ok) throw new Error("Resume failed: " + r.status);
                    btn.textContent = approved ? "Approved" : "Rejected";
                })
                .catch(function (err) {
                    btn.textContent = "Error";
                    alert("Failed to " + action + ": " + err.message);
                });
            });
        });

        if (status === "completed" || status === "failed") {
            if (pollInterval) {
                clearInterval(pollInterval);
                pollInterval = null;
            }
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", loadData);
    } else {
        loadData();
    }
})();
