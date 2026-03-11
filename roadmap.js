(function () {
    var cfg = window.FEEDBACK_CONFIG;
    if (!cfg) return;

    var API = cfg.supabaseUrl + "/rest/v1";
    var headers = {
        apikey: cfg.supabaseKey,
        Authorization: "Bearer " + cfg.supabaseKey
    };

    var STATUS_ORDER = ["draft", "pending_review", "needs_changes", "approved", "in_development", "in_review", "deployed"];
    var STATUS_LABELS = {
        draft: "Draft",
        pending_review: "Pending Review",
        needs_changes: "Needs Changes",
        approved: "Approved",
        in_development: "In Development",
        in_review: "In Review",
        deployed: "Deployed"
    };
    var STATUS_COLORS = {
        draft: "#94a3b8",
        pending_review: "#f59e0b",
        needs_changes: "#ef4444",
        approved: "#10b981",
        in_development: "#3b82f6",
        in_review: "#8b5cf6",
        deployed: "#059669"
    };
    var RELEASE_STATUS_LABELS = { planned: "Planned", active: "Active", released: "Released" };

    var DAY_WIDTH = 40;
    var ROW_HEIGHT = 44;

    var allData = {};
    var agentc2Intervals = [];

    function esc(s) {
        var d = document.createElement("div");
        d.textContent = s || "";
        return d.innerHTML;
    }

    function parseDate(s) {
        if (!s) return null;
        var d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }

    function daysBetween(a, b) {
        return Math.round((b - a) / 86400000);
    }

    function formatDate(d) {
        if (!d) return "";
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    function addDays(d, n) {
        var r = new Date(d);
        r.setDate(r.getDate() + n);
        return r;
    }

    function startOfDay(d) {
        var r = new Date(d);
        r.setHours(0, 0, 0, 0);
        return r;
    }

    // ── Data loading ──────────────────────────────────────────

    function loadAll() {
        return Promise.all([
            fetch(API + "/work_packages?select=*&order=sort_order.asc,created_at.asc", { headers: headers }).then(function (r) { return r.json(); }),
            fetch(API + "/releases?select=*&order=sort_order.asc,target_date.asc", { headers: headers }).then(function (r) { return r.json(); }),
            fetch(API + "/wp_status_history?select=*&order=changed_at.asc", { headers: headers }).then(function (r) { return r.json(); }),
            fetch(API + "/wp_dependencies?select=*", { headers: headers }).then(function (r) { return r.json(); }),
            fetch(API + "/work_package_prs?select=*&order=created_at.asc", { headers: headers }).then(function (r) { return r.json(); })
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

    // ── Timeline math ─────────────────────────────────────────

    function computeTimeRange(releases, workPackages, statusHistory) {
        var today = startOfDay(new Date());
        var earliest = new Date(today);
        var latest = new Date(today);

        earliest.setDate(earliest.getDate() - 14);
        latest.setDate(latest.getDate() + 60);

        releases.forEach(function (r) {
            var td = parseDate(r.target_date);
            if (td) {
                if (td < earliest) earliest = new Date(td);
                if (td > latest) latest = new Date(td);
            }
            var ad = parseDate(r.actual_date);
            if (ad) {
                if (ad < earliest) earliest = new Date(ad);
                if (ad > latest) latest = new Date(ad);
            }
        });

        workPackages.forEach(function (wp) {
            var ps = parseDate(wp.planned_start);
            var pe = parseDate(wp.planned_end);
            if (ps && ps < earliest) earliest = new Date(ps);
            if (pe && pe > latest) latest = new Date(pe);
        });

        statusHistory.forEach(function (h) {
            var d = parseDate(h.changed_at);
            if (d && d < earliest) earliest = new Date(d);
        });

        earliest.setDate(earliest.getDate() - 7);
        latest.setDate(latest.getDate() + 14);

        return { start: startOfDay(earliest), end: startOfDay(latest) };
    }

    // ── Build row model ───────────────────────────────────────

    function buildRows(releases, workPackages) {
        var rows = [];
        var wpByRelease = groupBy(workPackages, "release_id");
        var assigned = {};

        releases.forEach(function (rel) {
            rows.push({ type: "release", data: rel });
            var wps = (wpByRelease[rel.id] || []).sort(function (a, b) {
                return (a.sort_order || 0) - (b.sort_order || 0) || (a.priority || 0) - (b.priority || 0);
            });
            wps.forEach(function (wp) {
                rows.push({ type: "wp", data: wp, releaseId: rel.id });
                assigned[wp.id] = true;
            });
        });

        var unassigned = workPackages.filter(function (wp) { return !assigned[wp.id]; });
        if (unassigned.length > 0) {
            rows.push({ type: "release", data: { id: "__unassigned__", name: "Unassigned", status: "planned" } });
            unassigned.forEach(function (wp) {
                rows.push({ type: "wp", data: wp, releaseId: "__unassigned__" });
            });
        }

        return rows;
    }

    // ── Actual timeline from status history ───────────────────

    function computeActualPhases(wpId, historyByWp, today) {
        var history = historyByWp[wpId] || [];
        if (history.length === 0) return [];

        var phases = [];
        for (var i = 0; i < history.length; i++) {
            var h = history[i];
            var start = parseDate(h.changed_at);
            var end;
            if (i + 1 < history.length) {
                end = parseDate(history[i + 1].changed_at);
            } else {
                end = today;
            }
            if (start && end) {
                phases.push({ status: h.to_status, start: startOfDay(start), end: startOfDay(end) });
            }
        }
        return phases;
    }

    // ── Render ─────────────────────────────────────────────────

    function render(packages, releases, statusHistory, dependencies, prs) {
        allData = { packages: packages, releases: releases, statusHistory: statusHistory, dependencies: dependencies, prs: prs };

        var container = document.getElementById("gantt-container");
        var filterRelease = document.getElementById("filter-release");
        var filterStatus = document.getElementById("filter-status");

        if (packages.length === 0) {
            container.innerHTML =
                '<div class="gantt-empty">' +
                '<h3>No work packages yet</h3>' +
                '<p>Create work packages and assign them to releases to see the roadmap.</p>' +
                '</div>';
            return;
        }

        var filteredPackages = packages;
        var fRel = filterRelease ? filterRelease.value : "";
        var fStat = filterStatus ? filterStatus.value : "";

        if (fRel) {
            if (fRel === "__unassigned__") {
                filteredPackages = filteredPackages.filter(function (wp) { return !wp.release_id; });
            } else {
                filteredPackages = filteredPackages.filter(function (wp) { return wp.release_id === fRel; });
            }
        }
        if (fStat) {
            filteredPackages = filteredPackages.filter(function (wp) { return wp.status === fStat; });
        }

        var filteredReleaseIds = {};
        filteredPackages.forEach(function (wp) {
            if (wp.release_id) filteredReleaseIds[wp.release_id] = true;
        });
        var hasUnassigned = filteredPackages.some(function (wp) { return !wp.release_id; });

        var filteredReleases = releases.filter(function (r) { return filteredReleaseIds[r.id]; });
        if (fRel && fRel !== "__unassigned__") {
            var relObj = releases.find(function (r) { return r.id === fRel; });
            if (relObj && !filteredReleaseIds[relObj.id]) {
                filteredReleases.unshift(relObj);
            }
        }

        var rows = buildRows(filteredReleases, filteredPackages);
        if (rows.length === 0) {
            container.innerHTML =
                '<div class="gantt-empty">' +
                '<h3>No matching work packages</h3>' +
                '<p>Try adjusting the filters.</p>' +
                '</div>';
            return;
        }

        var historyByWp = groupBy(statusHistory, "work_package_id");
        var prsByWp = groupBy(prs, "work_package_id");
        var timeRange = computeTimeRange(filteredReleases, filteredPackages, statusHistory);
        var totalDays = daysBetween(timeRange.start, timeRange.end) + 1;
        var today = startOfDay(new Date());
        var todayOffset = daysBetween(timeRange.start, today);

        var html = '<div class="gantt-grid">';

        // Left panel: labels
        html += '<div class="gantt-labels">';
        html += '<div class="gantt-label-header">Work Package</div>';
        rows.forEach(function (row) {
            if (row.type === "release") {
                var rel = row.data;
                var milestoneLabel = rel.name;
                if (rel.target_date) milestoneLabel += " (" + formatDate(parseDate(rel.target_date)) + ")";
                html += '<div class="gantt-label-row release-row" title="' + esc(milestoneLabel) + '">';
                html += '<span class="label-text">' + esc(rel.name) + '</span>';
                html += '</div>';
            } else {
                var wp = row.data;
                var wpPrs = prsByWp[wp.id] || [];
                var hasAgent = wpPrs.some(function (p) { return p.agentc2_run_id; });
                html += '<div class="gantt-label-row wp-row" data-wp-id="' + esc(wp.id) + '">';
                html += '<span class="status-dot" style="background:' + (STATUS_COLORS[wp.status] || STATUS_COLORS.draft) + '"></span>';
                html += '<span class="label-text" title="' + esc(wp.title) + '">' + esc(wp.title) + '</span>';
                if (hasAgent) {
                    html += '<span class="agentc2-badge" title="AgentC2 SDLC active">' +
                        '<svg viewBox="0 0 16 16"><polygon points="8,1 15,8 8,15 1,8"/></svg>' +
                        '</span>';
                }
                html += '</div>';
            }
        });
        html += '</div>';

        // Right panel: timeline
        var timelineWidth = totalDays * DAY_WIDTH;
        html += '<div class="gantt-timeline" style="min-width:' + timelineWidth + 'px">';

        // Time header
        html += '<div class="gantt-time-header" style="width:' + timelineWidth + 'px">';
        var prevMonth = -1;
        for (var d = 0; d < totalDays; d++) {
            var date = addDays(timeRange.start, d);
            var isToday = daysBetween(today, date) === 0;
            var isMonthStart = date.getDate() === 1;
            var showDay = date.getDate() % 7 === 1 || isToday || isMonthStart;
            var cls = "gantt-time-col";
            if (isMonthStart) cls += " month-start";
            if (isToday) cls += " today";
            html += '<div class="' + cls + '" style="width:' + DAY_WIDTH + 'px;position:relative">';
            if (date.getMonth() !== prevMonth) {
                html += '<span class="month-label">' + date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }) + '</span>';
                prevMonth = date.getMonth();
            }
            if (showDay) {
                html += '<span style="margin-top:16px">' + date.getDate() + '</span>';
            }
            html += '</div>';
        }
        html += '</div>';

        // Bars area
        html += '<div class="gantt-bars" style="width:' + timelineWidth + 'px;position:relative">';

        // Today line
        if (todayOffset >= 0 && todayOffset < totalDays) {
            html += '<div class="gantt-today-line" style="left:' + (todayOffset * DAY_WIDTH + DAY_WIDTH / 2) + 'px"></div>';
        }

        rows.forEach(function (row, rowIdx) {
            var rowTop = rowIdx * ROW_HEIGHT;

            if (row.type === "release") {
                html += '<div class="gantt-bar-row release-row" style="height:' + ROW_HEIGHT + 'px">';
                var rel = row.data;
                var td = parseDate(rel.target_date);
                if (td) {
                    var mOffset = daysBetween(timeRange.start, startOfDay(td));
                    var mLeft = mOffset * DAY_WIDTH + DAY_WIDTH / 2;
                    html += '<div class="gantt-milestone" style="left:' + mLeft + 'px" title="' + esc(rel.name) + ' target: ' + formatDate(td) + '"></div>';
                }
                html += '</div>';
            } else {
                var wp = row.data;
                html += '<div class="gantt-bar-row" style="height:' + ROW_HEIGHT + 'px" data-bar-wp="' + esc(wp.id) + '">';

                var ps = parseDate(wp.planned_start);
                var pe = parseDate(wp.planned_end);

                if (ps && pe) {
                    var pStartOff = daysBetween(timeRange.start, startOfDay(ps));
                    var pDuration = daysBetween(startOfDay(ps), startOfDay(pe)) + 1;
                    html += '<div class="gantt-bar-planned" style="left:' + (pStartOff * DAY_WIDTH) + 'px;width:' + (pDuration * DAY_WIDTH) + 'px" title="Planned: ' + formatDate(ps) + ' – ' + formatDate(pe) + '"></div>';
                }

                var phases = computeActualPhases(wp.id, historyByWp, today);
                if (phases.length > 0) {
                    var actualStart = phases[0].start;
                    var actualEnd = phases[phases.length - 1].end;
                    var aStartOff = daysBetween(timeRange.start, actualStart);
                    var aTotalDays = daysBetween(actualStart, actualEnd) + 1;

                    if (ps && pe && actualEnd > pe) {
                        var overshootStart = daysBetween(timeRange.start, startOfDay(pe)) + 1;
                        var overshootDays = daysBetween(startOfDay(pe), startOfDay(actualEnd));
                        if (overshootDays > 0) {
                            html += '<div class="gantt-bar-planned overshoot" style="left:' + (overshootStart * DAY_WIDTH) + 'px;width:' + (overshootDays * DAY_WIDTH) + 'px"></div>';
                        }
                    }

                    html += '<div class="gantt-bar-actual" style="left:' + (aStartOff * DAY_WIDTH) + 'px;width:' + (aTotalDays * DAY_WIDTH) + 'px">';
                    phases.forEach(function (phase) {
                        var segDays = daysBetween(phase.start, phase.end) + 1;
                        var pct = (segDays / aTotalDays * 100).toFixed(2);
                        html += '<div class="phase-segment phase-' + phase.status + '" style="width:' + pct + '%" title="' + esc(STATUS_LABELS[phase.status] || phase.status) + ': ' + formatDate(phase.start) + ' – ' + formatDate(phase.end) + '"></div>';
                    });
                    html += '</div>';
                } else if (!ps && !pe) {
                    var created = parseDate(wp.created_at);
                    if (created) {
                        var cOff = daysBetween(timeRange.start, startOfDay(created));
                        var cDays = daysBetween(startOfDay(created), today) + 1;
                        if (cDays < 1) cDays = 1;
                        html += '<div class="gantt-bar-actual" style="left:' + (cOff * DAY_WIDTH) + 'px;width:' + (cDays * DAY_WIDTH) + 'px">';
                        html += '<div class="phase-segment phase-' + wp.status + '" style="width:100%"></div>';
                        html += '</div>';
                    }
                }

                html += '</div>';
            }
        });

        // Dependency arrows
        if (dependencies.length > 0) {
            var wpRowMap = {};
            rows.forEach(function (row, idx) {
                if (row.type === "wp") wpRowMap[row.data.id] = idx;
            });

            html += '<svg class="gantt-dep-svg" style="width:' + timelineWidth + 'px;height:' + (rows.length * ROW_HEIGHT) + 'px">';
            dependencies.forEach(function (dep) {
                var fromIdx = wpRowMap[dep.predecessor_id];
                var toIdx = wpRowMap[dep.successor_id];
                if (fromIdx === undefined || toIdx === undefined) return;

                var fromWp = rows[fromIdx].data;
                var toWp = rows[toIdx].data;

                var fromEnd = parseDate(fromWp.planned_end) || parseDate(fromWp.created_at) || today;
                var toStart = parseDate(toWp.planned_start) || parseDate(toWp.created_at) || today;

                var x1 = daysBetween(timeRange.start, startOfDay(fromEnd)) * DAY_WIDTH + DAY_WIDTH;
                var y1 = fromIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                var x2 = daysBetween(timeRange.start, startOfDay(toStart)) * DAY_WIDTH;
                var y2 = toIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

                var midX = (x1 + x2) / 2;
                html += '<path d="M' + x1 + ',' + y1 + ' C' + midX + ',' + y1 + ' ' + midX + ',' + y2 + ' ' + x2 + ',' + y2 + '"/>';
                html += '<polygon points="' + x2 + ',' + y2 + ' ' + (x2 - 6) + ',' + (y2 - 4) + ' ' + (x2 - 6) + ',' + (y2 + 4) + '"/>';
            });
            html += '</svg>';
        }

        html += '</div>'; // gantt-bars
        html += '</div>'; // gantt-timeline
        html += '</div>'; // gantt-grid

        // Legend
        html += '<div class="gantt-legend">';
        html += '<div class="gantt-legend-item"><div class="swatch swatch-planned"></div>Planned</div>';
        STATUS_ORDER.forEach(function (s) {
            html += '<div class="gantt-legend-item"><div class="swatch" style="background:' + STATUS_COLORS[s] + '"></div>' + STATUS_LABELS[s] + '</div>';
        });
        html += '<div class="gantt-legend-item"><div class="swatch" style="background:repeating-linear-gradient(-45deg,#fecaca,#fecaca 3px,#fee2e2 3px,#fee2e2 6px)"></div>Overshoot</div>';
        html += '</div>';

        container.innerHTML = html;

        attachTooltips(rows, historyByWp, prsByWp, timeRange);
    }

    // ── Tooltips ──────────────────────────────────────────────

    function attachTooltips(rows, historyByWp, prsByWp, timeRange) {
        var tooltip = document.getElementById("gantt-tooltip");

        document.querySelectorAll("[data-bar-wp]").forEach(function (el) {
            var wpId = el.dataset.barWp;
            var row = rows.find(function (r) { return r.type === "wp" && r.data.id === wpId; });
            if (!row) return;
            var wp = row.data;
            var wpPrs = prsByWp[wpId] || [];
            var hasAgent = wpPrs.some(function (p) { return p.agentc2_run_id; });
            var agentRunId = "";
            wpPrs.forEach(function (p) { if (p.agentc2_run_id) agentRunId = p.agentc2_run_id; });

            el.addEventListener("mouseenter", function (e) {
                var ps = parseDate(wp.planned_start);
                var pe = parseDate(wp.planned_end);
                var dateStr = "";
                if (ps && pe) dateStr = "Planned: " + formatDate(ps) + " – " + formatDate(pe);

                var innerHtml = '<div class="tt-title">' + esc(wp.title) + '</div>';
                if (dateStr) innerHtml += '<div class="tt-dates">' + dateStr + '</div>';
                innerHtml += '<div class="tt-status" style="background:' + STATUS_COLORS[wp.status] + ';color:#fff">' + esc(STATUS_LABELS[wp.status] || wp.status) + '</div>';

                if (hasAgent) {
                    var agentStatus = el.dataset.agentc2Status || "";
                    innerHtml += '<div class="tt-agentc2">';
                    innerHtml += '<svg viewBox="0 0 16 16" style="width:12px;height:12px;fill:currentColor"><polygon points="8,1 15,8 8,15 1,8"/></svg>';
                    innerHtml += agentStatus ? "AgentC2: " + esc(agentStatus) : "AgentC2 SDLC active";
                    innerHtml += '</div>';
                }

                tooltip.innerHTML = innerHtml;
                tooltip.classList.add("visible");
            });

            el.addEventListener("mousemove", function (e) {
                tooltip.style.left = (e.clientX + 12) + "px";
                tooltip.style.top = (e.clientY + 12) + "px";
            });

            el.addEventListener("mouseleave", function () {
                tooltip.classList.remove("visible");
            });
        });

        // Link label rows to spec pages
        document.querySelectorAll("[data-wp-id]").forEach(function (el) {
            var wpId = el.dataset.wpId;
            var wp = allData.packages.find(function (p) { return p.id === wpId; });
            if (wp && wp.spec_url) {
                el.style.cursor = "pointer";
                el.addEventListener("click", function () {
                    window.open(wp.spec_url, "_blank");
                });
            }
        });
    }

    // ── AgentC2 Polling ───────────────────────────────────────

    var AGENTC2_WORKFLOW_SLUG = "sdlc-triage-claude-agentc2-urusj8";

    function startAgentC2Polling(prs) {
        agentc2Intervals.forEach(function (id) { clearInterval(id); });
        agentc2Intervals = [];

        var activePrs = prs.filter(function (p) {
            return p.agentc2_run_id && p.agentc2_run_id !== "unknown";
        });

        if (activePrs.length === 0) return;

        function pollRun(pr) {
            var url = "https://agentc2.ai/agent/api/workflows/" + AGENTC2_WORKFLOW_SLUG + "/runs/" + pr.agentc2_run_id;
            fetch(url, {
                headers: { Accept: "application/json" }
            })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data) return;
                var barEl = document.querySelector('[data-bar-wp="' + pr.work_package_id + '"]');
                if (!barEl) return;

                var statusText = data.status || "";
                if (data.steps && Array.isArray(data.steps)) {
                    var completed = data.steps.filter(function (s) { return s.status === "completed"; }).length;
                    var total = data.steps.length;
                    var current = data.steps.find(function (s) { return s.status === "running" || s.status === "in_progress"; });
                    statusText = "Step " + (completed + 1) + "/" + total;
                    if (current && current.name) statusText += ": " + current.name;
                }

                barEl.dataset.agentc2Status = statusText;

                if (data.status === "completed" || data.status === "failed") {
                    if (data.status === "completed" && pr.pr_number === 0) {
                        updatePrFromRun(pr, data);
                    }
                }
            })
            .catch(function () {});
        }

        activePrs.forEach(function (pr) {
            pollRun(pr);
            var intervalId = setInterval(function () { pollRun(pr); }, 30000);
            agentc2Intervals.push(intervalId);
        });
    }

    function updatePrFromRun(pr, runData) {
        if (!runData.output) return;
        var prNumber = runData.output.pr_number || runData.output.prNumber;
        var prUrl = runData.output.pr_url || runData.output.prUrl;
        if (!prNumber) return;

        fetch(API + "/work_package_prs?id=eq." + pr.id, {
            method: "PATCH",
            headers: {
                apikey: cfg.supabaseKey,
                Authorization: "Bearer " + cfg.supabaseKey,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                pr_number: prNumber,
                pr_url: prUrl || "",
                pr_status: "open",
                updated_at: new Date().toISOString()
            })
        }).catch(function () {});
    }

    // ── Filter setup ──────────────────────────────────────────

    function populateFilters(releases) {
        var filterRelease = document.getElementById("filter-release");
        var filterStatus = document.getElementById("filter-status");

        if (filterRelease) {
            filterRelease.innerHTML = '<option value="">All Releases</option>';
            releases.forEach(function (r) {
                filterRelease.innerHTML += '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>';
            });
            filterRelease.innerHTML += '<option value="__unassigned__">Unassigned</option>';
        }

        if (filterStatus) {
            filterStatus.innerHTML = '<option value="">All Statuses</option>';
            STATUS_ORDER.forEach(function (s) {
                filterStatus.innerHTML += '<option value="' + s + '">' + STATUS_LABELS[s] + '</option>';
            });
        }
    }

    // ── Init ──────────────────────────────────────────────────

    function init() {
        var container = document.getElementById("gantt-container");

        loadAll()
            .then(function (results) {
                var packages = Array.isArray(results[0]) ? results[0] : [];
                var releases = Array.isArray(results[1]) ? results[1] : [];
                var statusHistory = Array.isArray(results[2]) ? results[2] : [];
                var dependencies = Array.isArray(results[3]) ? results[3] : [];
                var prs = Array.isArray(results[4]) ? results[4] : [];

                populateFilters(releases);

                render(packages, releases, statusHistory, dependencies, prs);
                startAgentC2Polling(prs);

                document.getElementById("filter-release").addEventListener("change", function () {
                    render(packages, releases, statusHistory, dependencies, prs);
                });
                document.getElementById("filter-status").addEventListener("change", function () {
                    render(packages, releases, statusHistory, dependencies, prs);
                });
            })
            .catch(function (err) {
                container.innerHTML = '<div class="loading">Failed to load roadmap data. Ensure the schema has been applied.</div>';
            });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
