const {URL} = require("url");
const fetch = require("node-fetch");

const {stringify} = JSON;
const pturl = new URL("https://www.pivotaltracker.com/services/v5/");

class PivotalTracker {
    /**
     * @param {string} token
     */
    constructor(token) {
        this.token = token;
        Object.freeze(this);
    }

    /**
     * @param {string} method
     * @param {URL|string} uri
     * @param {object} data
     * @returns {Response}
     */
    async request(method, uri, data) {
        const {token} = this;
        const url = new URL(uri, pturl);
        const body = data ? stringify(data) : null;
        const type = "application/json"
        const headers = {"X-TrackerToken": token, "Content-Type": type};
        const res = await fetch(url, {method, body, headers});

        if (res.status < 200 || res.status >= 300) {
            throw new Error(`unexpected response from PT: ${res.status} [${uri}]`);
        }

        return res;
    }

    /**
     * @param {URL|string} uri
     * @yields {*}
     */
    async *requestList(uri) {
        let res = await this.request("GET", uri);

        do {
            const {offset, returned, total} = readPagination(res);
            const data = await res.json();

            // fetch next page if there are more results
            if (offset + returned < total) {
                res = this.request("GET", `${uri}?offset=${offset + returned}`);
            } else {
                res = null;
            }

            for (const item of data) {
                yield item;
            }

            res = await res;
        } while (res);
    }

    /**
     * @param {number} project
     * @param {string} name
     * @param {string} description
     * @returns {object}
     */
    async createChore(project, name, description) {
        const uri = `projects/${project}/stories`;
        const story_type = "chore";
        const data = {name, description, story_type};
        const res = await this.request("POST", uri, data);
        return res.json();
    }

    /**
     * @yields {object}
     */
    async *projects() {
        yield* this.requestList("projects");
    }

    /**
     * @param {number} project
     * @yields {object}
     */
    async *stories(project) {
        yield* this.requestList(`projects/${project}/stories`);
    }
}

class PivotalTrackerProject {
    /**
     * @param {PivotalTracker|string} agent
     * @param {number} project
     */
    constructor(agent, project) {
        if (!agent) agent = "";
        if (typeof agent === "string") agent = new PivotalTracker(agent);

        this.pt = agent;
        this.project = project;

        Object.freeze(this);
    }

    /**
     * @param {string} name
     * @param {string} description
     */
    async createChore(name, description) {
        return this.pt.createChore(this.project, name, description);
    }

    /**
     * @yields {object}
     */
    async *stories() {
        yield* this.pt.stories(this.project);
    }
}

module.exports = {PivotalTracker, PivotalTrackerProject};

/**
 * @param {Response} res
 * @returns {object}
 */
function readPagination(res) {
    const {headers} = res;
    const offset = Number(headers.get("X-Tracker-Pagination-Offset"));
    const total = Number(headers.get("X-Tracker-Pagination-Total"));
    const returned = Number(headers.get("X-Tracker-Pagination-Returned"));
    return {offset, total, returned};
}
