(function () {
    var cfg = window.FEEDBACK_CONFIG;
    if (!cfg) return;

    var slug = location.pathname.split("/").pop().replace(".html", "");
    var API = cfg.supabaseUrl + "/rest/v1/feedback";
    var headers = {
        apikey: cfg.supabaseKey,
        Authorization: "Bearer " + cfg.supabaseKey,
        "Content-Type": "application/json",
        Prefer: "return=representation"
    };

    var STATUS_META = {
        approved: { label: "Approved", bg: "#d1fae5", color: "#065f46", icon: "\u2713" },
        needs_changes: { label: "Needs Changes", bg: "#fef3c7", color: "#92400e", icon: "\u270E" },
        rejected: { label: "Rejected", bg: "#fee2e2", color: "#991b1b", icon: "\u2717" }
    };

    function timeAgo(d) {
        var m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
        if (m < 1) return "just now";
        if (m < 60) return m + "m ago";
        var h = Math.floor(m / 60);
        if (h < 24) return h + "h ago";
        var dy = Math.floor(h / 24);
        if (dy < 30) return dy + "d ago";
        return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

    function build() {
        var el = document.createElement("div");
        el.id = "fbp";
        el.innerHTML = '<style>' +
            '#fbp{position:fixed;top:0;right:0;height:100vh;z-index:9999;font-family:"Inter","DM Sans",-apple-system,sans-serif;display:flex;align-items:stretch;pointer-events:none}' +
            '#fbp *{box-sizing:border-box}' +
            '#fbp-toggle{pointer-events:all;align-self:center;width:40px;background:#2563eb;color:#fff;border:none;border-radius:8px 0 0 8px;padding:12px 0;cursor:pointer;font-size:0.7rem;font-weight:700;font-family:inherit;letter-spacing:0.04em;writing-mode:vertical-rl;text-orientation:mixed;box-shadow:-2px 0 12px rgba(0,0,0,0.12);transition:background 0.15s;display:flex;align-items:center;gap:6px;justify-content:center}' +
            '#fbp-toggle:hover{background:#1d4ed8}' +
            '#fbp-toggle .fbp-badge{background:#fff;color:#2563eb;border-radius:10px;padding:1px 6px;font-size:0.65rem;writing-mode:horizontal-tb}' +
            '#fbp-panel{pointer-events:all;width:380px;background:#fff;border-left:1px solid #e2e6ea;box-shadow:-4px 0 24px rgba(0,0,0,0.08);display:flex;flex-direction:column;transform:translateX(100%);transition:transform 0.25s cubic-bezier(0.4,0,0.2,1);overflow:hidden}' +
            '#fbp-panel.open{transform:translateX(0)}' +
            '.fbp-header{padding:16px 20px;border-bottom:1px solid #e2e6ea;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}' +
            '.fbp-header h3{font-size:0.95rem;font-weight:700;color:#1a2332;margin:0}' +
            '.fbp-close{background:none;border:none;font-size:1.2rem;color:#94a3b8;cursor:pointer;padding:4px 8px;border-radius:6px;font-family:inherit}' +
            '.fbp-close:hover{background:#f1f5f9;color:#1a2332}' +
            '.fbp-tabs{display:flex;border-bottom:1px solid #e2e6ea;flex-shrink:0}' +
            '.fbp-tab{flex:1;padding:10px;font-size:0.78rem;font-weight:600;text-align:center;cursor:pointer;border:none;background:none;color:#94a3b8;border-bottom:2px solid transparent;font-family:inherit;transition:all 0.15s}' +
            '.fbp-tab.active{color:#2563eb;border-bottom-color:#2563eb}' +
            '.fbp-tab:hover{color:#1a2332}' +
            '.fbp-body{flex:1;overflow-y:auto;padding:0}' +
            '.fbp-section{padding:16px 20px;display:none}' +
            '.fbp-section.active{display:block}' +

            '.fbp-identity{background:#f8fafc;border-bottom:1px solid #e2e6ea;padding:12px 20px;flex-shrink:0;display:flex;gap:10px;align-items:center}' +
            '.fbp-identity input{flex:1;border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:0.78rem;font-family:inherit;color:#1a2332;outline:none}' +
            '.fbp-identity input:focus{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,0.1)}' +

            '.fbp-compose{padding:16px 20px;border-top:1px solid #e2e6ea;flex-shrink:0}' +
            '.fbp-status-row{display:flex;gap:4px;margin-bottom:10px}' +
            '.fbp-sbtn{flex:1;padding:7px 4px;border:1.5px solid #e2e6ea;border-radius:6px;background:#fff;font-size:0.68rem;font-weight:600;font-family:inherit;cursor:pointer;text-align:center;transition:all 0.12s;color:#94a3b8}' +
            '.fbp-sbtn:hover{border-color:#94a3b8;color:#5a6577}' +
            '.fbp-sbtn[data-on="1"][data-s="approved"]{border-color:#10b981;background:#d1fae5;color:#065f46}' +
            '.fbp-sbtn[data-on="1"][data-s="needs_changes"]{border-color:#f59e0b;background:#fef3c7;color:#92400e}' +
            '.fbp-sbtn[data-on="1"][data-s="rejected"]{border-color:#ef4444;background:#fee2e2;color:#991b1b}' +
            '.fbp-tbox{width:100%;border:1px solid #d1d5db;border-radius:8px;padding:10px 12px;font-size:0.82rem;font-family:inherit;color:#1a2332;outline:none;resize:none;min-height:80px;margin-bottom:8px;transition:border-color 0.15s}' +
            '.fbp-tbox:focus{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,0.1)}' +
            '.fbp-send{width:100%;padding:10px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-size:0.82rem;font-weight:600;font-family:inherit;cursor:pointer;transition:background 0.15s}' +
            '.fbp-send:hover{background:#1d4ed8}' +
            '.fbp-send:disabled{background:#94a3b8;cursor:not-allowed}' +
            '.fbp-toast{padding:8px 12px;border-radius:6px;font-size:0.78rem;font-weight:500;text-align:center;margin-bottom:8px;display:none}' +
            '.fbp-toast.ok{background:#d1fae5;color:#065f46;display:block}' +
            '.fbp-toast.err{background:#fee2e2;color:#991b1b;display:block}' +

            '.fbp-feed{display:flex;flex-direction:column;gap:0}' +
            '.fbp-item{padding:14px 20px;border-bottom:1px solid #f1f5f9}' +
            '.fbp-item:hover{background:#f8fafc}' +
            '.fbp-item-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px}' +
            '.fbp-item-name{font-weight:600;font-size:0.82rem;color:#1a2332}' +
            '.fbp-item-co{font-size:0.72rem;color:#94a3b8}' +
            '.fbp-item-badge{display:inline-flex;align-items:center;gap:3px;font-size:0.62rem;font-weight:600;padding:2px 7px;border-radius:4px}' +
            '.fbp-item-time{font-size:0.65rem;color:#cbd5e1;margin-left:auto}' +
            '.fbp-item-text{font-size:0.8rem;color:#334155;line-height:1.55;white-space:pre-wrap}' +
            '.fbp-empty{text-align:center;padding:3rem 1.5rem;color:#cbd5e1;font-size:0.85rem}' +
            '.fbp-empty-icon{font-size:2rem;margin-bottom:8px;opacity:0.5}' +

            '@media(max-width:500px){#fbp-panel{width:100vw}.fbp-sbtn{font-size:0.62rem;padding:6px 2px}}' +
            '</style>' +

            '<button id="fbp-toggle"><span>FEEDBACK</span><span class="fbp-badge" id="fbp-badge-count">0</span></button>' +
            '<div id="fbp-panel">' +
                '<div class="fbp-header"><h3>Document Feedback</h3><button class="fbp-close" id="fbp-close">\u2715</button></div>' +
                '<div class="fbp-tabs">' +
                    '<button class="fbp-tab active" data-tab="compose">Leave Feedback</button>' +
                    '<button class="fbp-tab" data-tab="history">History <span id="fbp-hist-count"></span></button>' +
                '</div>' +
                '<div class="fbp-identity">' +
                    '<input type="text" id="fbp-name" placeholder="Your name">' +
                    '<input type="text" id="fbp-company" placeholder="Company (optional)">' +
                '</div>' +
                '<div class="fbp-body">' +
                    '<div class="fbp-section active" data-section="compose">' +
                        '<div style="padding:16px 20px 0">' +
                            '<div style="font-size:0.72rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:12px">Your feedback is visible to the entire review team.</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="fbp-section" data-section="history">' +
                        '<div class="fbp-feed" id="fbp-feed"></div>' +
                    '</div>' +
                '</div>' +
                '<div class="fbp-compose">' +
                    '<div class="fbp-toast" id="fbp-toast"></div>' +
                    '<div class="fbp-status-row">' +
                        '<button class="fbp-sbtn" data-s="approved" data-on="0">\u2713 Approve</button>' +
                        '<button class="fbp-sbtn" data-s="needs_changes" data-on="0">\u270E Changes</button>' +
                        '<button class="fbp-sbtn" data-s="rejected" data-on="0">\u2717 Reject</button>' +
                    '</div>' +
                    '<textarea class="fbp-tbox" id="fbp-text" placeholder="Add a comment\u2026"></textarea>' +
                    '<button class="fbp-send" id="fbp-send">Send Feedback</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(el);
        init();
    }

    function init() {
        var panel = document.getElementById("fbp-panel");
        var toggle = document.getElementById("fbp-toggle");
        var close = document.getElementById("fbp-close");
        var selectedStatus = null;
        var nameEl = document.getElementById("fbp-name");
        var companyEl = document.getElementById("fbp-company");

        var savedName = localStorage.getItem("fbp-name") || "";
        var savedCompany = localStorage.getItem("fbp-company") || "";
        nameEl.value = savedName;
        companyEl.value = savedCompany;

        toggle.addEventListener("click", function () { panel.classList.toggle("open"); });
        close.addEventListener("click", function () { panel.classList.remove("open"); });

        document.querySelectorAll(".fbp-tab").forEach(function (tab) {
            tab.addEventListener("click", function () {
                document.querySelectorAll(".fbp-tab").forEach(function (t) { t.classList.remove("active"); });
                document.querySelectorAll(".fbp-section").forEach(function (s) { s.classList.remove("active"); });
                tab.classList.add("active");
                document.querySelector('.fbp-section[data-section="' + tab.dataset.tab + '"]').classList.add("active");
            });
        });

        document.querySelectorAll(".fbp-sbtn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                document.querySelectorAll(".fbp-sbtn").forEach(function (b) { b.dataset.on = "0"; });
                btn.dataset.on = "1";
                selectedStatus = btn.dataset.s;
            });
        });

        nameEl.addEventListener("input", function () { localStorage.setItem("fbp-name", nameEl.value); });
        companyEl.addEventListener("input", function () { localStorage.setItem("fbp-company", companyEl.value); });

        document.getElementById("fbp-send").addEventListener("click", function () {
            var name = nameEl.value.trim();
            var company = companyEl.value.trim();
            var comment = document.getElementById("fbp-text").value.trim();
            var toast = document.getElementById("fbp-toast");
            toast.className = "fbp-toast";

            if (!name) { toast.textContent = "Please enter your name."; toast.className = "fbp-toast err"; return; }
            if (!selectedStatus) { toast.textContent = "Please select a decision."; toast.className = "fbp-toast err"; return; }
            if (!comment) { toast.textContent = "Please add a comment."; toast.className = "fbp-toast err"; return; }

            var btn = document.getElementById("fbp-send");
            btn.disabled = true;
            btn.textContent = "Sending\u2026";

            fetch(API, {
                method: "POST",
                headers: headers,
                body: JSON.stringify({
                    document_slug: slug,
                    reviewer_name: name,
                    reviewer_company: company || null,
                    status: selectedStatus,
                    comment: comment
                })
            })
            .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
            .then(function () {
                toast.textContent = "Feedback sent!";
                toast.className = "fbp-toast ok";
                document.getElementById("fbp-text").value = "";
                document.querySelectorAll(".fbp-sbtn").forEach(function (b) { b.dataset.on = "0"; });
                selectedStatus = null;
                btn.disabled = false;
                btn.textContent = "Send Feedback";
                loadFeed();
                setTimeout(function () { toast.className = "fbp-toast"; }, 3000);
            })
            .catch(function () {
                toast.textContent = "Something went wrong. Try again.";
                toast.className = "fbp-toast err";
                btn.disabled = false;
                btn.textContent = "Send Feedback";
            });
        });

        loadFeed();
    }

    function loadFeed() {
        fetch(API + "?document_slug=eq." + slug + "&order=created_at.desc", {
            headers: { apikey: cfg.supabaseKey, Authorization: "Bearer " + cfg.supabaseKey }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var feed = document.getElementById("fbp-feed");
            var badge = document.getElementById("fbp-badge-count");
            var histCount = document.getElementById("fbp-hist-count");
            badge.textContent = data.length;
            histCount.textContent = data.length > 0 ? "(" + data.length + ")" : "";

            if (!data.length) {
                feed.innerHTML = '<div class="fbp-empty"><div class="fbp-empty-icon">\uD83D\uDCAC</div>No feedback yet.<br>Be the first to review.</div>';
                return;
            }

            feed.innerHTML = data.map(function (item) {
                var m = STATUS_META[item.status];
                return '<div class="fbp-item">' +
                    '<div class="fbp-item-top">' +
                        '<span class="fbp-item-name">' + esc(item.reviewer_name) + '</span>' +
                        (item.reviewer_company ? '<span class="fbp-item-co">' + esc(item.reviewer_company) + '</span>' : '') +
                        '<span class="fbp-item-badge" style="background:' + m.bg + ';color:' + m.color + '">' + m.icon + ' ' + m.label + '</span>' +
                        '<span class="fbp-item-time">' + timeAgo(item.created_at) + '</span>' +
                    '</div>' +
                    '<div class="fbp-item-text">' + esc(item.comment) + '</div>' +
                '</div>';
            }).join("");
        })
        .catch(function () {});
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", build);
    } else {
        build();
    }
})();
