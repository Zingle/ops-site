const {join} = require("path");
const tlsopt = require("tlsopt");
const express = require("express");

// importing this lib patches global Server objects with systemd support
require("systemd");

const {LISTEN_PORT, LISTEN_PID, PUBLIC_DIRS} = process.env;
const dirs = PUBLIC_DIRS ? PUBLIC_DIRS.split(":") : [];
const site = express();
const server = tlsopt.createServerSync(site);
const listen = LISTEN_PID ? "systemd" : (LISTEN_PORT || (server.tls ? 443 : 80));

site.set("view engine", "pug");
site.set("views", join(__dirname, "views"));

for (let dir of dirs) {
    console.info(`publishing directory: ${dir}`);
    site.use("/public", express.static(dir));
}

site.get("/", (req, res) => {
    res.render("home");
});

site.get("/request", (req, res) => {
    res.redirect("https://form.asana.com?hash=06a855c20452383f2832abd6e0fee58f1216a70234dea5db17687361e1164619&id=1167193786252771")
});

if (listen === "systemd") {
    console.info("listening on systemd socket");
    server.listen(listen);
} else {
    server.listen(listen, () => {
        const {address, port} = server.address();
        console.info(`listening on [${address}]:${port}`);
    });
}
