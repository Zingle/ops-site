const keygen = require("./keygen");
const iterators = new Map();
const expiry = 5 * 60 * 1000;   // 5 minutes
const max = 10;

/**
 * @param {function} asyncGenerator
 */
function paginator(asyncGenerator) {
    return async (req, res) => {
        const {query: {resume}} = req;
        const url = new URL(req.originalUrl, "http://example.com");
        const results = [];
        const iterator = resume ? iterators.get(resume) : asyncGenerator();
        let i = 0, value, done;

        if (!iterator) {
            return res.status(410);
        }

        iterators.delete(resume);

        do {
            ({value, done} = await iterator.next());
            done || results.push(value);
        } while (!done && ++i < max);

        url.searchParams.delete("resume");
        res.append("Link", `<${url.pathname + url.search}>; rel="first"`);

        if (!done) {
            const key = keygen(16);
            iterators.set(key, iterator);

            url.searchParams.set("resume", key);
            res.append("Link", `<${url.pathname + url.search}>; rel="next"`);

            setTimeout(() => iterators.delete(key), expiry);
        }

        res.json(results);
    };
}

module.exports = paginator;
