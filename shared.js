(function () {
    var NAV_ITEMS = [
        { label: "Work Packages", href: "./" },
        { label: "Pipeline", href: "./pipeline.html" },
        { label: "Roadmap", href: "./roadmap.html" },
        { label: "Releases", href: "./releases.html" }
    ];

    var placeholder = document.getElementById("app-header");
    if (!placeholder) return;

    var path = window.location.pathname;
    var page = path.split("/").pop() || "index.html";
    if (page === "" || page === "appello-approvals") page = "index.html";

    var isDocPage = path.indexOf("/docs/") !== -1;

    var navHtml = NAV_ITEMS.map(function (item) {
        var itemPage = item.href.replace("./", "");
        if (itemPage === "") itemPage = "index.html";
        var href = isDocPage ? "../" + itemPage : item.href;
        var isActive = false;
        if (itemPage === "index.html" && (page === "index.html" || page === "" || isDocPage)) {
            isActive = !isDocPage || item.label === "Work Packages";
        } else if (page === itemPage) {
            isActive = true;
        }
        return '<a href="' + href + '"' + (isActive ? ' class="active"' : '') + '>' + item.label + '</a>';
    }).join("");

    placeholder.className = "app-header";
    placeholder.innerHTML =
        '<div class="app-header-inner">' +
            '<a href="' + (isDocPage ? "../" : "./") + '" class="app-brand">' +
                '<div class="app-brand-icon">A</div>' +
                '<span class="app-brand-text">Appello</span>' +
            '</a>' +
            '<nav class="app-nav">' + navHtml + '</nav>' +
        '</div>';
})();
