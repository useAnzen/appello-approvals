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
    var releases = [];
    var allWorkPackages = [];
    var wpDependencies = [];
    var wpDocuments = [];

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
            '<div class="mg-group"><label>Release</label><select id="mg-release" style="width:140px"><option value="">None</option></select></div>' +
            '<div class="mg-sep"></div>' +
            '<div class="mg-group"><label>Planned Start</label><input id="mg-planned-start" type="date" style="width:140px"></div>' +
            '<div class="mg-group"><label>Planned End</label><input id="mg-planned-end" type="date" style="width:140px"></div>' +
            '<div class="mg-group"><label>Priority</label><input id="mg-priority" type="number" min="0" value="0" style="width:60px"></div>' +
            '<button class="btn-secondary" id="mg-save-planning">Save Planning</button>' +
            '<div class="mg-sep"></div>' +
            '<div class="mg-group"><label>Depends On</label><select id="mg-dep-select" style="width:160px"><option value="">Add dependency...</option></select></div>' +
            '<button class="btn-secondary" id="mg-add-dep">Add Dep</button>' +
            '<div class="mg-tickets" id="mg-dep-list"></div>' +
            '<div class="mg-sep"></div>' +
            '<div class="mg-group"><label>Customer</label><input id="mg-customer" placeholder="Customer name" style="width:140px"></div>' +
            '<div class="mg-sep"></div>' +
            '<div class="mg-group"><label>RICE — Reach</label><input id="mg-rice-reach" type="number" min="0" placeholder="# users" style="width:70px"></div>' +
            '<div class="mg-group"><label>Impact</label><select id="mg-rice-impact" style="width:90px"><option value="">—</option><option value="3">Massive (3)</option><option value="2">High (2)</option><option value="1">Medium (1)</option><option value="0.5">Low (0.5)</option><option value="0.25">Minimal (0.25)</option></select></div>' +
            '<div class="mg-group"><label>Confidence</label><select id="mg-rice-confidence" style="width:80px"><option value="">—</option><option value="100">100%</option><option value="80">80%</option><option value="50">50%</option><option value="20">20%</option></select></div>' +
            '<div class="mg-group"><label>Effort</label><input id="mg-rice-effort" type="number" min="0.1" step="0.5" placeholder="person-mo" style="width:80px"></div>' +
            '<span id="mg-rice-score" style="font-size:12px;font-weight:700;color:#e2e8f0;min-width:80px"></span>' +
            '<button class="btn-secondary" id="mg-save-rice">Save RICE</button>' +
            '<div class="mg-sep"></div>' +
            '<button class="btn-secondary" id="mg-add-plan">+ Implementation Plan</button>' +
            '<div class="mg-tickets" id="mg-doc-list"></div>' +
            '<div class="mg-sep"></div>' +
            '<button class="btn-success" id="mg-trigger-sdlc">Trigger SDLC</button>' +
            '<span class="mg-toast" id="mg-toast"></span>';

        var docModal = document.createElement("div");
        docModal.id = "mg-doc-modal";
        docModal.innerHTML = '<style>' +
            '#mg-doc-modal{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:20000;align-items:center;justify-content:center;font-family:"Inter",-apple-system,sans-serif}' +
            '#mg-doc-modal.visible{display:flex}' +
            '#mg-doc-modal .dm-inner{background:#fff;border-radius:16px;padding:32px;width:100%;max-width:640px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.2)}' +
            '#mg-doc-modal h3{font-size:18px;font-weight:700;margin-bottom:20px;color:#1a2332}' +
            '#mg-doc-modal .dm-group{margin-bottom:14px}' +
            '#mg-doc-modal .dm-group label{display:block;font-size:13px;font-weight:600;color:#5a6577;margin-bottom:4px}' +
            '#mg-doc-modal .dm-group input,#mg-doc-modal .dm-group textarea{width:100%;font-family:inherit;font-size:13px;padding:10px 12px;border:1px solid #e2e6ea;border-radius:8px;outline:none;color:#1a2332}' +
            '#mg-doc-modal .dm-group textarea{min-height:300px;font-family:"JetBrains Mono",monospace;font-size:12px;line-height:1.5;resize:vertical}' +
            '#mg-doc-modal .dm-group input:focus,#mg-doc-modal .dm-group textarea:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,0.1)}' +
            '#mg-doc-modal .dm-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:20px}' +
            '#mg-doc-modal .dm-actions button{border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer}' +
            '#mg-doc-modal .dm-btn-cancel{background:#e2e8f0;color:#1a2332}' +
            '#mg-doc-modal .dm-btn-save{background:#2563eb;color:#fff}' +
            '#mg-doc-modal .dm-btn-delete{background:#ef4444;color:#fff;margin-right:auto}' +
            '</style>' +
            '<div class="dm-inner">' +
                '<h3 id="dm-title">Add Plan</h3>' +
                '<div class="dm-group"><label for="dm-doc-title">Title</label><input id="dm-doc-title" type="text" placeholder="Document title"></div>' +
                '<div class="dm-group"><label for="dm-doc-content">Content</label><textarea id="dm-doc-content" placeholder="Paste markdown or HTML content here..."></textarea></div>' +
                '<div class="dm-actions">' +
                    '<button class="dm-btn-delete" id="dm-delete" style="display:none">Delete</button>' +
                    '<button class="dm-btn-cancel" id="dm-cancel">Cancel</button>' +
                    '<button class="dm-btn-save" id="dm-save">Save</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(docModal);

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
        document.getElementById("mg-save-planning").addEventListener("click", savePlanning);
        document.getElementById("mg-add-dep").addEventListener("click", addDependency);
        document.getElementById("mg-save-rice").addEventListener("click", saveRice);
        document.getElementById("mg-trigger-sdlc").addEventListener("click", triggerSdlc);
        document.getElementById("mg-add-plan").addEventListener("click", function () { openDocModal("plan"); });

        ["mg-rice-reach", "mg-rice-impact", "mg-rice-confidence", "mg-rice-effort"].forEach(function (id) {
            document.getElementById(id).addEventListener("input", updateRicePreview);
        });
        document.getElementById("dm-cancel").addEventListener("click", closeDocModal);
        document.getElementById("dm-save").addEventListener("click", saveDocument);
        document.getElementById("dm-delete").addEventListener("click", deleteDocument);
        document.getElementById("mg-doc-modal").addEventListener("click", function (e) {
            if (e.target === this) closeDocModal();
        });

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
                document.getElementById("mg-planned-start").value = wp.planned_start || "";
                document.getElementById("mg-planned-end").value = wp.planned_end || "";
                document.getElementById("mg-priority").value = wp.priority || 0;
                document.getElementById("mg-customer").value = wp.customer_affected || "";
                document.getElementById("mg-rice-reach").value = wp.rice_reach != null ? wp.rice_reach : "";
                document.getElementById("mg-rice-impact").value = wp.rice_impact != null ? wp.rice_impact : "";
                document.getElementById("mg-rice-confidence").value = wp.rice_confidence != null ? wp.rice_confidence : "";
                document.getElementById("mg-rice-effort").value = wp.rice_effort != null ? wp.rice_effort : "";
                updateRicePreview();
                loadTickets();
                loadReleases();
                loadAllWorkPackages();
                loadDependencies();
                loadDocuments();
            })
            .catch(function () { toast("Failed to load work package", false); });
    }

    function loadReleases() {
        fetch(API + "/releases?select=*&order=sort_order.asc,target_date.asc", { headers: headersRead })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                releases = Array.isArray(data) ? data : [];
                var sel = document.getElementById("mg-release");
                sel.innerHTML = '<option value="">None</option>';
                releases.forEach(function (r) {
                    var opt = document.createElement("option");
                    opt.value = r.id;
                    opt.textContent = r.name + (r.target_date ? " (" + r.target_date + ")" : "");
                    sel.appendChild(opt);
                });
                if (wp && wp.release_id) sel.value = wp.release_id;
            });
    }

    function loadAllWorkPackages() {
        fetch(API + "/work_packages?select=id,slug,title&order=title.asc", { headers: headersRead })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                allWorkPackages = Array.isArray(data) ? data : [];
                populateDepSelect();
            });
    }

    function populateDepSelect() {
        var sel = document.getElementById("mg-dep-select");
        sel.innerHTML = '<option value="">Add dependency...</option>';
        allWorkPackages.forEach(function (other) {
            if (wp && other.id === wp.id) return;
            var alreadyDep = wpDependencies.some(function (d) { return d.predecessor_id === other.id; });
            if (alreadyDep) return;
            var opt = document.createElement("option");
            opt.value = other.id;
            opt.textContent = other.title;
            sel.appendChild(opt);
        });
    }

    function loadDependencies() {
        if (!wp) return;
        fetch(API + "/wp_dependencies?successor_id=eq." + wp.id + "&select=*", { headers: headersRead })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                wpDependencies = Array.isArray(data) ? data : [];
                renderDependencies();
                populateDepSelect();
            });
    }

    function renderDependencies() {
        var list = document.getElementById("mg-dep-list");
        if (wpDependencies.length === 0) {
            list.innerHTML = "";
            return;
        }
        list.innerHTML = wpDependencies.map(function (dep) {
            var predWp = allWorkPackages.find(function (w) { return w.id === dep.predecessor_id; });
            var label = predWp ? predWp.title : dep.predecessor_id;
            return '<span class="mg-ticket-pill">' +
                esc(label) +
                '<span class="mg-ticket-x" data-dep-id="' + dep.id + '">&times;</span>' +
                '</span>';
        }).join("");
        list.querySelectorAll(".mg-ticket-x").forEach(function (x) {
            x.addEventListener("click", function () { removeDependency(x.dataset.depId); });
        });
    }

    function savePlanning() {
        if (!wp) return;
        var releaseId = document.getElementById("mg-release").value || null;
        var plannedStart = document.getElementById("mg-planned-start").value || null;
        var plannedEnd = document.getElementById("mg-planned-end").value || null;
        var priority = parseInt(document.getElementById("mg-priority").value) || 0;

        fetch(API + "/work_packages?id=eq." + wp.id, {
            method: "PATCH",
            headers: headers,
            body: JSON.stringify({
                release_id: releaseId,
                planned_start: plannedStart,
                planned_end: plannedEnd,
                priority: priority,
                updated_at: new Date().toISOString()
            })
        })
        .then(function (r) {
            if (!r.ok) throw new Error();
            wp.release_id = releaseId;
            wp.planned_start = plannedStart;
            wp.planned_end = plannedEnd;
            wp.priority = priority;
            toast("Planning saved", true);
        })
        .catch(function () { toast("Failed to save planning", false); });
    }

    function addDependency() {
        if (!wp) return;
        var predecessorId = document.getElementById("mg-dep-select").value;
        if (!predecessorId) { toast("Select a work package", false); return; }

        fetch(API + "/wp_dependencies", {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                predecessor_id: predecessorId,
                successor_id: wp.id,
                dependency_type: "finish_to_start"
            })
        })
        .then(function (r) {
            if (!r.ok) throw new Error();
            toast("Dependency added", true);
            loadDependencies();
        })
        .catch(function () { toast("Failed to add dependency", false); });
    }

    function removeDependency(id) {
        fetch(API + "/wp_dependencies?id=eq." + id, {
            method: "DELETE",
            headers: headers
        })
        .then(function (r) {
            if (!r.ok) throw new Error();
            toast("Dependency removed", true);
            loadDependencies();
        })
        .catch(function () { toast("Failed to remove dependency", false); });
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

    var editingDocId = null;
    var editingDocType = null;

    function loadDocuments() {
        if (!wp) return;
        fetch(API + "/wp_documents?work_package_id=eq." + wp.id + "&order=doc_type.asc,sort_order.asc", { headers: headersRead })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                wpDocuments = Array.isArray(data) ? data : [];
                renderDocuments();
            });
    }

    function renderDocuments() {
        var list = document.getElementById("mg-doc-list");
        if (!list) return;
        if (wpDocuments.length === 0) {
            list.innerHTML = "";
            return;
        }
        list.innerHTML = wpDocuments.map(function (doc) {
            var icon = doc.doc_type === "plan" ? "\uD83D\uDCDD" : "\uD83C\uDFA8";
            return '<span class="mg-ticket-pill" style="cursor:pointer" data-doc-id="' + doc.id + '">' +
                icon + ' ' + esc(doc.title) +
                '<span class="mg-ticket-x" data-doc-del="' + doc.id + '">&times;</span>' +
            '</span>';
        }).join("");

        list.querySelectorAll("[data-doc-id]").forEach(function (pill) {
            pill.addEventListener("click", function (e) {
                if (e.target.classList.contains("mg-ticket-x")) return;
                editDocument(pill.dataset.docId);
            });
        });

        list.querySelectorAll("[data-doc-del]").forEach(function (x) {
            x.addEventListener("click", function (e) {
                e.stopPropagation();
                var docId = x.dataset.docDel;
                if (!confirm("Delete this document?")) return;
                fetch(API + "/wp_documents?id=eq." + docId, { method: "DELETE", headers: headers })
                    .then(function (r) {
                        if (!r.ok) throw new Error();
                        toast("Document deleted", true);
                        loadDocuments();
                    })
                    .catch(function () { toast("Failed to delete document", false); });
            });
        });
    }

    function openDocModal(docType, doc) {
        editingDocType = docType;
        editingDocId = doc ? doc.id : null;
        var title = (doc ? "Edit " : "Add ") + "Implementation Plan";
        document.getElementById("dm-title").textContent = title;
        document.getElementById("dm-doc-title").value = doc ? doc.title : "Implementation Plan";
        document.getElementById("dm-doc-content").value = doc ? doc.content : "";
        document.getElementById("dm-doc-content").placeholder = "Paste markdown content...";
        document.getElementById("dm-delete").style.display = doc ? "" : "none";
        document.getElementById("mg-doc-modal").classList.add("visible");
    }

    function closeDocModal() {
        document.getElementById("mg-doc-modal").classList.remove("visible");
        editingDocId = null;
        editingDocType = null;
    }

    function editDocument(docId) {
        var doc = wpDocuments.find(function (d) { return d.id === docId; });
        if (!doc) return;
        openDocModal(doc.doc_type, doc);
    }

    function saveDocument() {
        if (!wp) return;
        var title = document.getElementById("dm-doc-title").value.trim();
        var content = document.getElementById("dm-doc-content").value;
        if (!title) { toast("Title is required", false); return; }

        var body = {
            title: title,
            content: content,
            updated_at: new Date().toISOString()
        };

        var url, method;
        if (editingDocId) {
            url = API + "/wp_documents?id=eq." + editingDocId;
            method = "PATCH";
        } else {
            url = API + "/wp_documents";
            method = "POST";
            body.work_package_id = wp.id;
            body.doc_type = editingDocType;
            body.sort_order = wpDocuments.filter(function (d) { return d.doc_type === editingDocType; }).length;
        }

        fetch(url, {
            method: method,
            headers: headers,
            body: JSON.stringify(body)
        })
        .then(function (r) {
            if (!r.ok) throw new Error();
            toast(editingDocId ? "Document updated" : "Document created", true);
            closeDocModal();
            loadDocuments();
        })
        .catch(function () { toast("Failed to save document", false); });
    }

    function deleteDocument() {
        if (!editingDocId) return;
        if (!confirm("Delete this document?")) return;
        fetch(API + "/wp_documents?id=eq." + editingDocId, { method: "DELETE", headers: headers })
            .then(function (r) {
                if (!r.ok) throw new Error();
                toast("Document deleted", true);
                closeDocModal();
                loadDocuments();
            })
            .catch(function () { toast("Failed to delete document", false); });
    }

    function updateRicePreview() {
        var reach = parseFloat(document.getElementById("mg-rice-reach").value);
        var impact = parseFloat(document.getElementById("mg-rice-impact").value);
        var confidence = parseFloat(document.getElementById("mg-rice-confidence").value);
        var effort = parseFloat(document.getElementById("mg-rice-effort").value);
        var el = document.getElementById("mg-rice-score");
        if (isNaN(reach) || isNaN(impact) || isNaN(confidence) || isNaN(effort) || effort === 0) {
            el.textContent = "";
            return;
        }
        var score = (reach * impact * (confidence / 100)) / effort;
        var color = score >= 5 ? "#4ade80" : score >= 2 ? "#fbbf24" : "#f87171";
        el.innerHTML = 'Score: <span style="color:' + color + '">' + score.toFixed(1) + '</span>';
    }

    function saveRice() {
        if (!wp) return;
        var reach = document.getElementById("mg-rice-reach").value;
        var impact = document.getElementById("mg-rice-impact").value;
        var confidence = document.getElementById("mg-rice-confidence").value;
        var effort = document.getElementById("mg-rice-effort").value;
        var customer = document.getElementById("mg-customer").value.trim();

        var body = {
            rice_reach: reach ? parseInt(reach) : null,
            rice_impact: impact ? parseFloat(impact) : null,
            rice_confidence: confidence ? parseInt(confidence) : null,
            rice_effort: effort ? parseFloat(effort) : null,
            customer_affected: customer || null,
            updated_at: new Date().toISOString()
        };

        fetch(API + "/work_packages?id=eq." + wp.id, {
            method: "PATCH",
            headers: headers,
            body: JSON.stringify(body)
        })
        .then(function (r) {
            if (!r.ok) throw new Error();
            wp.rice_reach = body.rice_reach;
            wp.rice_impact = body.rice_impact;
            wp.rice_confidence = body.rice_confidence;
            wp.rice_effort = body.rice_effort;
            wp.customer_affected = body.customer_affected;
            toast("RICE & customer saved", true);
        })
        .catch(function () { toast("Failed to save RICE data", false); });
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
        if (!confirm("Trigger the SDLC pipeline for this work package?\n\nThis will dispatch " + tickets.length + " ticket(s) to AgentC2.")) return;

        var docsRes = fetch(API + "/wp_documents?work_package_id=eq." + wp.id, { headers: headersRead });
        docsRes.then(function (r) { return r.json(); }).then(function (docs) {
            var plans = Array.isArray(docs) ? docs.filter(function (d) { return d.doc_type === "plan"; }) : [];
            var dispatched = 0;

            function dispatchNext(idx) {
                if (idx >= tickets.length) {
                    fetch(API + "/work_packages?id=eq." + wp.id, {
                        method: "PATCH",
                        headers: headers,
                        body: JSON.stringify({ status: "in_development", updated_at: new Date().toISOString() })
                    }).then(function () {
                        wp.status = "in_development";
                        document.getElementById("mg-status").value = "in_development";
                        toast("SDLC triggered for " + dispatched + " ticket(s)", true);
                    });
                    return;
                }

                var ticket = tickets[idx];
                var desc = "## Work Package: " + wp.title + "\n\n" + (wp.description || "") + "\n\n";
                desc += "### Design Spec\n" + (wp.spec_url || "N/A") + "\n\n";
                if (plans.length > 0) {
                    desc += "### Implementation Plan\n\n";
                    plans.forEach(function (p) {
                        var preview = p.content.length > 1000 ? p.content.substring(0, 1000) + "..." : p.content;
                        desc += "#### " + p.title + "\n\n" + preview + "\n\n";
                    });
                }

                var payload = {
                    title: ticket.jira_key + " - " + (ticket.jira_summary || wp.title),
                    description: desc,
                    repository: "useAnzen/appello-approvals",
                    sourceTicketId: ticket.jira_key,
                    labels: ["work-package", wp.slug]
                };

                toast("Dispatching " + ticket.jira_key + "...", true);

                fetch(cfg.agentc2WebhookUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Webhook-Secret": cfg.agentc2WebhookSecret
                    },
                    body: JSON.stringify(payload)
                })
                .then(function (r) {
                    if (!r.ok) return r.text().then(function (t) { throw new Error(t); });
                    return r.json();
                })
                .then(function (run) {
                    var runId = run.runId || run.id || run.run_id || "pending";
                    return fetch(API + "/work_package_prs", {
                        method: "POST",
                        headers: headers,
                        body: JSON.stringify({
                            work_package_id: wp.id,
                            ticket_id: ticket.id,
                            pr_number: 0,
                            pr_url: "",
                            pr_title: "SDLC: " + ticket.jira_key,
                            pr_status: "open",
                            agentc2_run_id: runId
                        })
                    }).then(function () {
                        dispatched++;
                        dispatchNext(idx + 1);
                    });
                })
                .catch(function (err) {
                    toast("Failed: " + (err.message || "Unknown error"), false);
                    dispatchNext(idx + 1);
                });
            }

            dispatchNext(0);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", buildBar);
    } else {
        buildBar();
    }
})();
