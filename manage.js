(function () {
    if (location.search.indexOf("manage=true") === -1) return;

    var cfg = window.FEEDBACK_CONFIG;
    if (!cfg) return;

    var slug = location.pathname.split("/").pop().replace(".html", "");
    var API = cfg.supabaseUrl + "/rest/v1";
    var headers = {
        apikey: cfg.supabaseKey,
        Authorization: "Bearer " + cfg.supabaseKey,
        "Content-Type": "application/json",
        Prefer: "return=representation"
    };
    var headersRead = {
        apikey: cfg.supabaseKey,
        Authorization: "Bearer " + cfg.supabaseKey
    };

    var STATUS_OPTIONS = [
        { value: "draft", label: "Draft" },
        { value: "pending_review", label: "Pending Review" },
        { value: "needs_changes", label: "Needs Changes" },
        { value: "approved", label: "Approved" },
        { value: "in_development", label: "In Development" },
        { value: "in_review", label: "In Review" },
        { value: "deployed", label: "Deployed" }
    ];

    var wp = null;
    var tickets = [];

    function esc(s) {
        var d = document.createElement("div");
        d.textContent = s || "";
        return d.innerHTML;
    }

    function buildBar() {
        var bar = document.createElement("div");
        bar.id = "mgmt-bar";
        bar.innerHTML = '<style>' +
            '#mgmt-bar{position:fixed;top:0;left:0;right:0;z-index:10000;background:#1e293b;color:#e2e8f0;font-family:"Inter",-apple-system,sans-serif;font-size:13px;padding:10px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;box-shadow:0 2px 8px rgba(0,0,0,0.2)}' +
            '#mgmt-bar label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8}' +
            '#mgmt-bar .mg-group{display:flex;flex-direction:column;gap:3px}' +
            '#mgmt-bar select,#mgmt-bar input{background:#334155;border:1px solid #475569;color:#e2e8f0;border-radius:5px;padding:5px 8px;font-size:12px;font-family:inherit;outline:none}' +
            '#mgmt-bar select:focus,#mgmt-bar input:focus{border-color:#60a5fa}' +
            '#mgmt-bar button{border:none;border-radius:5px;padding:6px 14px;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;transition:background 0.15s}' +
            '#mgmt-bar .btn-primary{background:#2563eb;color:#fff}' +
            '#mgmt-bar .btn-primary:hover{background:#1d4ed8}' +
            '#mgmt-bar .btn-danger{background:#dc2626;color:#fff}' +
            '#mgmt-bar .btn-danger:hover{background:#b91c1c}' +
            '#mgmt-bar .btn-secondary{background:#475569;color:#e2e8f0}' +
            '#mgmt-bar .btn-secondary:hover{background:#64748b}' +
            '#mgmt-bar .btn-success{background:#059669;color:#fff}' +
            '#mgmt-bar .btn-success:hover{background:#047857}' +
            '#mgmt-bar .mg-sep{width:1px;height:30px;background:#475569;flex-shrink:0}' +
            '#mgmt-bar .mg-toast{font-size:11px;font-weight:600;padding:4px 10px;border-radius:4px;display:none}' +
            '#mgmt-bar .mg-toast.ok{display:inline;background:#d1fae5;color:#065f46}' +
            '#mgmt-bar .mg-toast.err{display:inline;background:#fee2e2;color:#991b1b}' +
            '#mgmt-bar .mg-tickets{display:flex;gap:4px;flex-wrap:wrap;align-items:center}' +
            '#mgmt-bar .mg-ticket-pill{background:#334155;border:1px solid #475569;border-radius:4px;padding:2px 8px;font-size:11px;display:inline-flex;align-items:center;gap:4px}' +
            '#mgmt-bar .mg-ticket-x{cursor:pointer;color:#94a3b8;font-weight:700}' +
            '#mgmt-bar .mg-ticket-x:hover{color:#ef4444}' +
            'body{padding-top:90px}' +
            '</style>' +
            '<div class="mg-group"><label>Status</label><select id="mg-status"></select></div>' +
            '<button class="btn-primary" id="mg-save-status">Save</button>' +
            '<div class="mg-sep"></div>' +
            '<div class="mg-group"><label>Jira Ticket</label><input id="mg-jira-key" placeholder="Q21030-12345" style="width:130px"></div>' +
            '<button class="btn-secondary" id="mg-add-ticket">Add Ticket</button>' +
            '<div class="mg-tickets" id="mg-ticket-list"></div>' +
            '<div class="mg-sep"></div>' +
            '<div class="mg-group"><label>Plan URL</label><input id="mg-plan-url" placeholder="https://..." style="width:200px"></div>' +
            '<div class="mg-group"><label>Canvas URL</label><input id="mg-canvas-url" placeholder="https://..." style="width:200px"></div>' +
            '<button class="btn-secondary" id="mg-save-urls">Save URLs</button>' +
            '<div class="mg-sep"></div>' +
            '<button class="btn-success" id="mg-trigger-sdlc">Trigger SDLC</button>' +
            '<span class="mg-toast" id="mg-toast"></span>';

        document.body.prepend(bar);

        var select = document.getElementById("mg-status");
        STATUS_OPTIONS.forEach(function (opt) {
            var o = document.createElement("option");
            o.value = opt.value;
            o.textContent = opt.label;
            select.appendChild(o);
        });

        document.getElementById("mg-save-status").addEventListener("click", saveStatus);
        document.getElementById("mg-add-ticket").addEventListener("click", addTicket);
        document.getElementById("mg-save-urls").addEventListener("click", saveUrls);
        document.getElementById("mg-trigger-sdlc").addEventListener("click", triggerSdlc);

        loadData();
    }

    function toast(msg, ok) {
        var el = document.getElementById("mg-toast");
        el.textContent = msg;
        el.className = "mg-toast " + (ok ? "ok" : "err");
        setTimeout(function () { el.className = "mg-toast"; }, 3000);
    }

    function loadData() {
        fetch(API + "/work_packages?slug=eq." + slug + "&limit=1", { headers: headersRead })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!Array.isArray(data) || data.length === 0) {
                    toast("Work package not found in DB", false);
                    return;
                }
                wp = data[0];
                document.getElementById("mg-status").value = wp.status;
                document.getElementById("mg-plan-url").value = wp.implementation_plan_url || "";
                document.getElementById("mg-canvas-url").value = wp.canvas_url || "";
                loadTickets();
            })
            .catch(function () { toast("Failed to load work package", false); });
    }

    function loadTickets() {
        if (!wp) return;
        fetch(API + "/work_package_tickets?work_package_id=eq." + wp.id + "&order=created_at.asc", { headers: headersRead })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                tickets = Array.isArray(data) ? data : [];
                renderTickets();
            });
    }

    function renderTickets() {
        var list = document.getElementById("mg-ticket-list");
        list.innerHTML = tickets.map(function (t) {
            return '<span class="mg-ticket-pill">' +
                esc(t.jira_key) +
                '<span class="mg-ticket-x" data-id="' + t.id + '">&times;</span>' +
            '</span>';
        }).join("");
        list.querySelectorAll(".mg-ticket-x").forEach(function (x) {
            x.addEventListener("click", function () { removeTicket(x.dataset.id); });
        });
    }

    function saveStatus() {
        if (!wp) return;
        var status = document.getElementById("mg-status").value;
        var body = { status: status, updated_at: new Date().toISOString() };
        if (status === "approved" && !wp.approved_at) {
            body.approved_at = new Date().toISOString();
        }
        fetch(API + "/work_packages?id=eq." + wp.id, {
            method: "PATCH",
            headers: headers,
            body: JSON.stringify(body)
        })
        .then(function (r) {
            if (!r.ok) throw new Error();
            wp.status = status;
            toast("Status updated", true);
        })
        .catch(function () { toast("Failed to update status", false); });
    }

    function addTicket() {
        if (!wp) return;
        var key = document.getElementById("mg-jira-key").value.trim();
        if (!key) { toast("Enter a Jira key", false); return; }
        var jiraUrl = "https://useanzen.atlassian.net/browse/" + key;
        fetch(API + "/work_package_tickets", {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                work_package_id: wp.id,
                jira_key: key,
                jira_url: jiraUrl,
                jira_summary: "",
                jira_status: ""
            })
        })
        .then(function (r) {
            if (!r.ok) throw new Error();
            document.getElementById("mg-jira-key").value = "";
            toast("Ticket added", true);
            loadTickets();
        })
        .catch(function () { toast("Failed to add ticket", false); });
    }

    function removeTicket(id) {
        fetch(API + "/work_package_tickets?id=eq." + id, {
            method: "DELETE",
            headers: headers
        })
        .then(function (r) {
            if (!r.ok) throw new Error();
            toast("Ticket removed", true);
            loadTickets();
        })
        .catch(function () { toast("Failed to remove ticket", false); });
    }

    function saveUrls() {
        if (!wp) return;
        var planUrl = document.getElementById("mg-plan-url").value.trim();
        var canvasUrl = document.getElementById("mg-canvas-url").value.trim();
        fetch(API + "/work_packages?id=eq." + wp.id, {
            method: "PATCH",
            headers: headers,
            body: JSON.stringify({
                implementation_plan_url: planUrl || null,
                canvas_url: canvasUrl || null,
                updated_at: new Date().toISOString()
            })
        })
        .then(function (r) {
            if (!r.ok) throw new Error();
            wp.implementation_plan_url = planUrl || null;
            wp.canvas_url = canvasUrl || null;
            toast("URLs saved", true);
        })
        .catch(function () { toast("Failed to save URLs", false); });
    }

    function triggerSdlc() {
        if (!wp) return;
        if (tickets.length === 0) {
            toast("Link at least one Jira ticket first", false);
            return;
        }
        if (wp.status !== "approved") {
            toast("Work package must be approved first", false);
            return;
        }
        var cmd = 'AGENTC2_API_KEY="<key>" node trigger-sdlc.js ' + slug;
        window.prompt("Run this command to trigger the SDLC pipeline:", cmd);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", buildBar);
    } else {
        buildBar();
    }
})();
