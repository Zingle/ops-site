const {STATUS_CODES} = require("http");
const {randomBytes} = require("crypto");
const {join} = require("path");
const tlsopt = require("tlsopt");
const express = require("express");
const session = require("express-session");
const {json, urlencoded} = require("body-parser");
const passport = require("passport");
const {Strategy: OAuthStrategy} = require("passport-google-oauth2");
const {PivotalTrackerProject} = require("./lib/pt");

// disable debug log unless debugging is enabled
if (!process.env.DEBUG) console.debug = () => {};

// importing this lib patches global Server objects with systemd support
require("systemd");

// read environment
const {LISTEN_PORT, LISTEN_PID, PUBLIC_DIRS, DOMAINS} = process.env;
const {PT_TOKEN, PT_PROJECT_ID, GOOGLE_IDENT, GOOGLE_SECRET} = process.env;

const site = express();
const server = tlsopt.createServerSync(site);
const secret = randomBytes(48).toString("base64");
const dirs = PUBLIC_DIRS ? PUBLIC_DIRS.split(":") : [];
const domains = DOMAINS ? DOMAINS.split(",") : [];
const listen = LISTEN_PID ? "systemd" : (LISTEN_PORT || (server.tls ? 443 : 80));
const pt = PT_TOKEN && PT_PROJECT_ID
    ? new PivotalTrackerProject(PT_TOKEN, PT_PROJECT_ID)
    : undefined;

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((object, done) => done(null, object));

passport.use(new OAuthStrategy({
    clientID: GOOGLE_IDENT,
    clientSecret: GOOGLE_SECRET,
    callbackURL: "https://ops.zingle.me/auth/google"
}, (access, refresh, profile, done) => {
    done(null, profile);
}));

site.set("view engine", "pug");
site.set("views", join(__dirname, "views"));

for (let dir of dirs) {
    console.info(`publishing directory: ${dir}`);
    site.use("/public", express.static(dir));
}

site.use(express.static(join(__dirname, "pub")));
site.use(json());
site.use(urlencoded({extended: false}));
site.use(session({secret, resave: false, saveUninitialized: false}));
site.use(passport.initialize());
site.use(passport.session());

site.get("/", (req, res) => {
    res.render("home");
});

site.get("/login", (req, res) => {
    res.redirect("/login/google");
});

site.get("/logout", (req, res) => {
    req.logout();
    res.redirect("/");
});

site.get("/login/google", passport.authenticate("google", {
    scope: ["profile", "email"]
}));

site.get("/auth/google", passport.authenticate("google", {
    failureRedirect: "/login",
    session: true
}), (req, res) => {
    res.redirect("/");
});

site.get("/me", authed(), (req, res) => {
    res.send(req.user);
});

site.get("/download", (req, res) => {
    res.render("download");
});

site.get("/request", authed(), (req, res) => {
    res.render("request");
});

site.post("/request", authed(), async (req, res, next) => {
    if (!pt) return res.status(502);

    const {user: {email}} = req;
    const {body: {title, description}} = req;
    const errors = [];

    if (!validateEmail(email)) {
        res.status(403);
        return next();
    }

    try {
        if (description && !title) title = `request from ${email}`;
        if (!email) errors.push("email: required");
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
        console.debug(err.stack);
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
        if (res.status === 200) {
            res.set("Allow", methods.join(","));
            res.status(405);
        }

        next();
    };
}

/**
 * Create authorization middleware.
 */
function authed() {
    return (req, res, next) => {
       if (!req.user) {
           res.status(401);
           res.set("WWW-Authenticate", "Bearer");
           next("route");
       } else {
           next();
       }
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
        case 401:
            res.render("login");
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
    return domains.some(domain => {
        return email.slice(-(domain.length+1)) === `@${domain}`;
    })
}
