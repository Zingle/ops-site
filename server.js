const {STATUS_CODES} = require("http");
const {join} = require("path");
const tlsopt = require("tlsopt");
const express = require("express");
const {json, urlencoded} = require("body-parser");
const {PivotalTrackerProject} = require("./lib/pt");

// disable debug log unless debugging is enabled
if (!process.env.DEBUG) console.debug = () => {};

// importing this lib patches global Server objects with systemd support
require("systemd");

const {LISTEN_PORT, LISTEN_PID, PUBLIC_DIRS, DOMAINS} = process.env;
const {PT_TOKEN, PT_PROJECT_ID} = process.env;
const dirs = PUBLIC_DIRS ? PUBLIC_DIRS.split(":") : [];
const domains = DOMAINS ? DOMAINS.split(",") : [];
const site = express();
const server = tlsopt.createServerSync(site);
const listen = LISTEN_PID ? "systemd" : (LISTEN_PORT || (server.tls ? 443 : 80));
const pt = PT_TOKEN && PT_PROJECT_ID
    ? new PivotalTrackerProject(PT_TOKEN, PT_PROJECT_ID)
    : undefined;

site.set("view engine", "pug");
site.set("views", join(__dirname, "views"));

for (let dir of [...dirs, join(__dirname, "pub")]) {
    console.info(`publishing directory: ${dir}`);
    site.use("/public", express.static(dir));
}

site.use(json());
site.use(urlencoded({extended: false}));

site.get("/", (req, res) => {
    res.render("home");
});

site.get("/download", (req, res) => {
    res.render("download");
});

site.get("/request", (req, res) => {
    res.render("request");
});

site.post("/request", async (req, res, next) => {
    if (!pt) return res.status(502);

    const {body: {email, title, description}} = req;
    const errors = [];

    try {
        if (description && !title) title = `request from ${email}`;
        if (!email) errors.push("email: required");
        if (email && !validateEmail(email)) errors.push("email: invalid email address");
        if (!title && !description) errors.push("title: required");
        if (errors.length) return badRequest(res, errors);

        const body = description
            ? `${email} requested:\n\n${description}`
            : `requested by ${email}`;

        console.debug(`creating chore: ${title.replace(/\s+/g, " ")}`);
        await pt.createChore(title, body);

        res.redirect("/");
    } catch (err) {
        next(err);
    }
});

// send appropriate 405 responses
site.all(["/", "/download"], allow(["GET"]));
site.all("/request", allow(["GET", "POST"]));

// send status description in body or generate 404
site.all("*", (req, res) => sendStatus(res));

// handle errors or thrown error statuses
site.use((err, req, res, next) => {
    if (typeof err === "number") {
        res.status(err);
    } else {
        console.error(`error: ${err.message}`);
        res.status(500);
    }

    sendStatus(res);
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

/**
 * Create 405 Method Not Allowed middleware.
 * @param {string[]} methods
 * @param {IncomingRequest} req
 * @param {ServerResponse} res
 * @param {function} next
 */
function allow(methods) {
    return (req, res, next) => {
        res.set("Allow", methods.join(","));
        res.status(405);
        next();
    };
}

/**
 * Send 400 Bad Request response.
 * @param {ServerResponse} res
 * @param {array} errors
 */
function badRequest(res, errors) {
    res.status(400);
    res.set("Content-Type", "application/json");
    res.json({errors});
}

/**
 * Send response body based on the response status.
 * @param {ServerResponse} res
 */
function sendStatus(res) {
    switch (res.statusCode) {
        case 202:
            res.send();
            break;
        case 200:
            res.status(404);
            // fallthrough
        default:
            res.send(STATUS_CODES[res.statusCode]);
    }
}

/**
 * Validate email address.
 * @param {string} email
 * @returns {boolean}
 */
function validateEmail(email) {
    const [name, domain, ...extra] = email.split("@");

    if (extra.length) {
        console.debug(`email address malformed or not supported: ${email}`);
        return false;
    } else if (!domains.includes(domain)) {
        console.debug(`email address not allowed from: ${email}`);
        return false;
    } else {
        return true;
    }
}
