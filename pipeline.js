(function () {
    var cfg = window.FEEDBACK_CONFIG;
    if (!cfg) return;

    var API = cfg.supabaseUrl + "/rest/v1";
    var headers = {
        apikey: cfg.supabaseKey,
        Authorization: "Bearer " + cfg.supabaseKey
    };

    var COLUMNS = [
        { id: "draft", label: "Draft", dot: "dot-draft" },
        { id: "pending_review", label: "Pending Review", dot: "dot-pending" },
        { id: "needs_changes", label: "Needs Changes", dot: "dot-changes" },
        { id: "approved", label: "Approved", dot: "dot-approved" },
        { id: "in_development", label: "In Development", dot: "dot-dev" },
        { id: "in_review", label: "In Review", dot: "dot-review" },
        { id: "deployed", label: "Deployed", dot: "dot-deployed" }
    ];

    var PR_STATUS_TAGS = {
        open: "tag-pr-open",
        merged: "tag-pr-merged",
        closed: "tag-pr-closed"
    };

    function esc(s) {
        var d = document.createElement("div");
        d.textContent = s || "";
        return d.innerHTML;
    }

    function loadAll() {
        return Promise.all([
            fetch(API + "/work_packages?select=*&order=created_at.desc", { headers: headers }).then(function (r) { return r.json(); }),
            fetch(API + "/work_package_tickets?select=*&order=created_at.asc", { headers: headers }).then(function (r) { return r.json(); }),
            fetch(API + "/work_package_prs?select=*&order=created_at.asc", { headers: headers }).then(function (r) { return r.json(); }),
            fetch(API + "/feedback?select=*&order=created_at.desc", { headers: headers }).then(function (r) { return r.json(); })
        ]);
    }

    function groupBy(arr, key) {
        var map = {};
        (arr || []).forEach(function (item) {
            var k = item[key];
            if (!map[k]) map[k] = [];
            map[k].push(item);
        });
        return map;
    }

    function renderBoard(packages, tickets, prs, feedback) {
        var board = document.getElementById("board");
        var ticketsByWp = groupBy(tickets, "work_package_id");
        var prsByWp = groupBy(prs, "work_package_id");
        var feedbackBySlug = groupBy(feedback, "document_slug");
        var packagesByStatus = groupBy(packages, "status");

        board.innerHTML = COLUMNS.map(function (col) {
            var items = packagesByStatus[col.id] || [];
            return '<div class="column">' +
                '<div class="column-header">' +
                    '<div class="column-dot ' + col.dot + '"></div>' +
                    '<div class="column-title">' + esc(col.label) + '</div>' +
                    '<div class="column-count">' + items.length + '</div>' +
                '</div>' +
                (items.length === 0
                    ? ''
                    : items.map(function (wp) {
                        return renderCard(wp, ticketsByWp[wp.id] || [], prsByWp[wp.id] || [], feedbackBySlug[wp.slug] || []);
                    }).join("")
                ) +
            '</div>';
        }).join("");

        board.querySelectorAll(".card").forEach(function (card) {
            card.addEventListener("click", function () {
                card.classList.toggle("open");
            });
        });
    }

    function renderCard(wp, tickets, prs, fb) {
        var pendingFb = fb.filter(function (f) { return !f.is_addressed; });
        var prOpen = prs.filter(function (p) { return p.pr_status === "open"; }).length;
        var prMerged = prs.filter(function (p) { return p.pr_status === "merged"; }).length;

        var tags = "";
        if (tickets.length > 0) {
            tags += '<span class="card-tag tag-ticket">' + tickets.length + ' ticket' + (tickets.length > 1 ? 's' : '') + '</span>';
        }
        if (prOpen > 0) {
            tags += '<span class="card-tag tag-pr-open">' + prOpen + ' PR open</span>';
        }
        if (prMerged > 0) {
            tags += '<span class="card-tag tag-pr-merged">' + prMerged + ' merged</span>';
        }
        if (pendingFb.length > 0) {
            tags += '<span class="card-tag tag-feedback">' + pendingFb.length + ' feedback</span>';
        }

        var links = '<a class="card-link" href="' + esc(wp.spec_url) + '" target="_blank" onclick="event.stopPropagation()">Spec</a>';
        if (wp.implementation_plan_url) {
            links += '<a class="card-link" href="' + esc(wp.implementation_plan_url) + '" target="_blank" onclick="event.stopPropagation()">Plan</a>';
        }
        if (wp.canvas_url) {
            links += '<a class="card-link" href="' + esc(wp.canvas_url) + '" target="_blank" onclick="event.stopPropagation()">Canvas</a>';
        }

        var expanded = '';
        if (tickets.length > 0) {
            expanded += '<div class="detail-section"><div class="detail-label">Jira Tickets</div>';
            expanded += tickets.map(function (t) {
                return '<div class="detail-item">' +
                    '<a href="' + esc(t.jira_url) + '" target="_blank" onclick="event.stopPropagation()">' + esc(t.jira_key) + '</a>' +
                    '<span>' + esc(t.jira_summary) + '</span>' +
                    (t.jira_status ? '<span class="detail-badge" style="background:#f1f5f9;color:#475569">' + esc(t.jira_status) + '</span>' : '') +
                '</div>';
            }).join("");
            expanded += '</div>';
        }

        if (prs.length > 0) {
            expanded += '<div class="detail-section"><div class="detail-label">Pull Requests</div>';
            expanded += prs.map(function (p) {
                var cls = PR_STATUS_TAGS[p.pr_status] || "tag-pr-open";
                return '<div class="detail-item">' +
                    '<a href="' + esc(p.pr_url) + '" target="_blank" onclick="event.stopPropagation()">#' + p.pr_number + '</a>' +
                    '<span>' + esc(p.pr_title) + '</span>' +
                    '<span class="detail-badge ' + cls + '">' + esc(p.pr_status) + '</span>' +
                '</div>';
            }).join("");
            expanded += '</div>';
        }

        if (fb.length > 0) {
            var approved = fb.filter(function (f) { return f.status === "approved"; }).length;
            var changes = fb.filter(function (f) { return f.status === "needs_changes" && !f.is_addressed; }).length;
            var rejected = fb.filter(function (f) { return f.status === "rejected" && !f.is_addressed; }).length;
            expanded += '<div class="detail-section"><div class="detail-label">Feedback Summary</div>';
            expanded += '<div class="detail-item">';
            if (approved > 0) expanded += '<span class="detail-badge" style="background:#d1fae5;color:#065f46">' + approved + ' approved</span>';
            if (changes > 0) expanded += '<span class="detail-badge" style="background:#fef3c7;color:#92400e">' + changes + ' needs changes</span>';
            if (rejected > 0) expanded += '<span class="detail-badge" style="background:#fee2e2;color:#991b1b">' + rejected + ' rejected</span>';
            expanded += '</div></div>';
        }

        return '<div class="card" data-id="' + esc(wp.id) + '">' +
            '<div class="card-title">' + esc(wp.title) + '</div>' +
            '<div class="card-desc">' + esc(wp.description) + '</div>' +
            (tags ? '<div class="card-tags">' + tags + '</div>' : '') +
            '<div class="card-links">' + links + '</div>' +
            (expanded ? '<div class="card-expanded">' + expanded + '</div>' : '') +
        '</div>';
    }

    function syncPrStatuses(prs) {
        var toSync = prs.filter(function (p) {
            return p.pr_number > 0 && p.pr_status === "open";
        });
        if (toSync.length === 0) return;

        var REPO = "useAnzen/application-mono-repo";
        toSync.forEach(function (pr) {
            fetch("https://api.github.com/repos/" + REPO + "/pulls/" + pr.pr_number, {
                headers: { Accept: "application/vnd.github.v3+json" }
            })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data) return;
                var newStatus = data.merged ? "merged" : (data.state === "closed" ? "closed" : "open");
                if (newStatus !== pr.pr_status) {
                    fetch(API + "/work_package_prs?id=eq." + pr.id, {
                        method: "PATCH",
                        headers: {
                            apikey: cfg.supabaseKey,
                            Authorization: "Bearer " + cfg.supabaseKey,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            pr_status: newStatus,
                            pr_title: data.title || pr.pr_title,
                            updated_at: new Date().toISOString()
                        })
                    });
                }
            })
            .catch(function () {});
        });
    }

    loadAll()
        .then(function (results) {
            var packages = Array.isArray(results[0]) ? results[0] : [];
            var tickets = Array.isArray(results[1]) ? results[1] : [];
            var prs = Array.isArray(results[2]) ? results[2] : [];
            var feedback = Array.isArray(results[3]) ? results[3] : [];

            if (packages.length === 0) {
                document.getElementById("board").innerHTML =
                    '<div class="loading">No work packages found. Apply the schema first (see supabase/schema.sql).</div>';
                return;
            }

            renderBoard(packages, tickets, prs, feedback);
            syncPrStatuses(prs);
        })
        .catch(function (err) {
            document.getElementById("board").innerHTML =
                '<div class="loading">Failed to load pipeline data. Ensure the Supabase schema has been applied.</div>';
        });
})();
