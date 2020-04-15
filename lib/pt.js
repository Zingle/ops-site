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
     */
    async request(method, uri, data) {
        const {token} = this;
        const url = new URL(uri, pturl);
        const body = data ? stringify(data) : null;
        const type = "application/json"
        const headers = {"X-TrackerToken": token, "Content-Type": type};
        const res = await fetch(url, {method, body, headers});

        if (res.status < 200 || res.status >= 300) {
            throw new Error(`unexpected response from PT: ${res.status}`);
        }

        return res.json();
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
        return this.request("POST", uri, {name, description, story_type});
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
}

module.exports = {PivotalTracker, PivotalTrackerProject};
