/**
 * Yoo-Server.js
 * Written by The Yule
 * 
 * An expressjs middleware allowing the handling of multiple domains with separate pages.
 * 
 * GitHub: https://github.com/Yoo-Babobo/Yoo-Server.js
 * License: https://github.com/Yoo-Babobo/Yoo-Server.js/blob/main/LICENSE
 */

const fs = require("fs");
const encoding = "utf8";

const statics = {};
const uses = {};
const gets = {};
const posts = {};
const puts = {};
const deletes = {};
const alls = {};
const errors = {};

function www(hostname) {
    return typeof hostname === "string" && hostname.startsWith("www.")
}

function formatHostname(hostname) {
    hostname = www(hostname) ? hostname.slice(4) : hostname;
    return hostname;
}

function pageCallback(id, host, method) {
    let callback = null;

    if (method === "POST") callback = posts[host] ? posts[host][id] : null;
    else if (method === "PUT") callback = puts[host] ? puts[host][id] : null;
    else if (method === "DELETE") callback = deletes[host] ? deletes[host][id] : null;
    else callback = gets[host] ? gets[host][id] : null;

    if (!(callback instanceof Function)) callback = alls[host] ? alls[host][id] : null;

    return callback;
}

/**
 * The server middleware allowing for multiple domains with separate pages.
 * @param {import("express").Request} request The express request
 * @param {import("express").Response} response The express response
 */
function server(request, response) {
    const { headers, protocol, hostname, originalUrl, method } = request;
    const origin = headers.origin || null;
    const url = protocol + "://" + hostname + originalUrl;
    const host = formatHostname(hostname);
    const path = originalUrl.split("?")[0];

    const notFound = () => server.triggerError(404, request, response);
    const notEnabled = () => server.triggerError(503, request, response);

    server.config().then(config => {
        if (typeof config.enabled === "boolean" && !config.enabled) return notEnabled();

        const website = config.websites.filter(website => website.id === host)[0] || {};
        const allowedOrigins = website.allowedOrigins || [];
        const static = website.static || [];
        const pages = website.pages || [];
        const errorPages = website.errorPages || [];
        let found = false;

        if (typeof website.www === "boolean") {
            if (website.www && !www(hostname)) return response.redirect(protocol + "://" + "www." + hostname + originalUrl);
            else if (!website.www && www(hostname)) return response.redirect(protocol + "://" + host + originalUrl);
        }

        errorPages.map(error => {
            const page = pages.filter(page => page.id === error.page)[0] || false;

            if (page) server.error(error.code, host, (request, response) => {
                const { id, redirect, file } = page;
                const callback = pageCallback(id, host, method);
                const use = uses[host];
                const data = { page, website };

                if (typeof redirect === "string") response.redirect(redirect);
                else if (typeof file === "string" && fs.existsSync(file)) response.sendFile(__dirname + "/" + file);
                else if (callback instanceof Function) callback(data, request, response);
                else if (use instanceof Function) use(data, request, response);
            });
        });

        if (typeof website.enabled === "boolean" && !website.enabled) return notEnabled();
        if (typeof website.favicon === "string" && path === "/favicon.ico" && fs.existsSync(website.favicon)) return response.sendFile(__dirname + "/" + website.favicon);

        for (const stat of static) {
            if (found) break;
            if (typeof stat[0] !== "string" || typeof stat[1] !== "string") continue;

            const regex = new RegExp("^" + stat[1] + (stat[1] === "/" ? "" : "/") + "(.+)");
            const match = regex.test(path);

            if (match) {
                const file = stat[0] + "/" + path.match(regex)[1];

                if (fs.existsSync(file)) {
                    found = true;
                    
                    const filename = file.split("/").pop();
                    const extention = filename.split(".")[1] || null;
                    const callback = statics[host] ? statics[host][extention] : null;

                    if (allowedOrigins.includes("*")) response.setHeader("Access-Control-Allow-Origin", "*");
                    else if (allowedOrigins.includes(origin)) response.setHeader("Access-Control-Allow-Origin", origin);

                    if (callback instanceof Function) {
                        response.contentType(filename);

                        server.getFile(file).then(content => {
                            const newContent = callback({ website, filename, content, request, response });
                            
                            if (typeof newContent === "string") response.send(newContent);
                            else response.send(content);
                        });
                    } else response.sendFile(__dirname + "/" + file);
                }
            }
        }

        if (found) return;

        if (!pages.length) return notFound();
        
        let count = 0;

        for (const page of pages) {
            if (found) break;

            count++;

            const { id, redirect, file } = page;
            let p = page.path;

            p = p.replace(/\*/g, "([^\\/]+)");

            const regex = new RegExp("^" + p + "$");
            const match = regex.test(path);

            if (match) {
                found = true;

                const params = path.match(regex).slice(1);
                const params_object = {};

                params.map((param, index) => params_object[index.toString()] = param);

                request.params = params_object;
                
                const callback = pageCallback(id, host, method);
                const use = uses[host];
                const data = { page, website };
                
                if (typeof redirect === "string") response.redirect(redirect);
                else if (typeof file === "string" && fs.existsSync(file)) response.sendFile(__dirname + "/" + file);
                else if (callback instanceof Function) callback(data, request, response);
                else if (use instanceof Function) use(data, request, response);
                else response.send("<title>Oops. There's nothing here.</title><h1>Oops.</h1><p>There's nothing here.</p>");
            }

            if (count === pages.length && !found) notFound();
        }
    }).catch(notFound);
}

/**
 * 
 * @param {String} path The path to the file.
 * @returns The file's content.
 */
server.getFile = path => new Promise((resolve, reject) => fs.readFile(path, { encoding }, (error, content) => error ? reject(error) : resolve(content)));

/**
 * Get the configuration of the server.
 * @returns The configuration of the server as a JavaScript object.
 */
server.config = () => new Promise((resolve, reject) => server.getFile("server.json").then(config => resolve(JSON.parse(config))).catch(reject));

/**
 * Get the currently running websites on the server.
 * @returns An array of all the websites currently running on the server.
 */
server.websites = () => new Promise(resolve => server.config().then(config => {
    const websites = config.websites || [];
    resolve(websites);
}).catch(() => resolve([])));

/**
 * Trigger a callback whenever a file of the specified extention(s) on the specified host is requested.
 * @param {String|Array<String>} extentions The extention(s) to listen for.
 * @param {String} host The host to listen on.
 * @param {Function|null} callback The callback if a file is found.
 * @returns The server
 */
server.static = (extentions, host, callback = null) => {
    statics[host] ||= {};
    if (extentions instanceof Array) extentions.map(extention => statics[host][extention] = callback);
    else statics[host][extentions] = callback;
    return server;
};

/**
 * Trigger a callback whenever one of the specified host(s) are requested.
 * @param {String|Array<String>} hosts The host(s) to listen for.
 * @param {Function|null} callback The callback if the host is requested.
 * @returns The server
 */
server.use = (hosts, callback = null) => {
    if (hosts instanceof Array) hosts.map(host => uses[host] = callback);
    else uses[hosts] = callback;
    return server;
};

/**
 * Trigger a callback whenever the specified page is requested with the GET method.
 * @param {String} id The id of the page.
 * @param {String} host The host of the page.
 * @param {Function|null} callback The callback if the page is requested.
 * @returns The server
 */
server.get = (id, host, callback = null) => {
    gets[host] ||= {};
    gets[host][id] = callback;
    return server;
};

/**
 * Trigger a callback whenever the specified page is requested with the POST method.
 * @param {String} id The id of the page.
 * @param {String} host The host of the page.
 * @param {Function|null} callback The callback if the page is requested.
 * @returns The server
 */
server.post = (id, host, callback = null) => {
    posts[host] ||= {};
    posts[host][id] = callback;
    return server;
};

/**
 * Trigger a callback whenever the specified page is requested with the PUT method.
 * @param {String} id The id of the page.
 * @param {String} host The host of the page.
 * @param {Function|null} callback The callback if the page is requested.
 * @returns The server
 */
server.put = (id, host, callback = null) => {
    puts[host] ||= {};
    puts[host][id] = callback;
    return server;
};

/**
 * Trigger a callback whenever the specified page is requested with the DELETE method.
 * @param {String} id The id of the page.
 * @param {String} host The host of the page.
 * @param {Function|null} callback The callback if the page is requested.
 * @returns The server
 */
server.delete = (id, host, callback = null) => {
    deletes[host] ||= {};
    deletes[host][id] = callback;
    return server;
};

/**
 * Trigger a callback whenever the specified page is requested with any method.
 * @param {String} id The id of the page.
 * @param {String} host The host of the page.
 * @param {Function|null} callback The callback if the page is requested.
 * @returns The server
 */
server.all = (id, host, callback = null) => {
    alls[host] ||= {};
    alls[host][id] = callback;
    return server;
};

/**
 * Trigger a callback whenever the specified error is triggered on the specified host.
 * @param {Number} code The code of the error.
 * @param {String} host The host the error must take place on.
 * @param {Function|null} callback The callback if the error occurs.
 * @returns The server
 */
server.error = (code, host, callback = null) => {
    errors[host] ||= {};
    errors[host][code] = callback;
    return server;
};

/**
 * Trigger an error on the server with the specified code
 * @param {Number} code The error code
 * @param {import("express").Request} request The express request
 * @param {import("express").Response} response The express response
 * @returns The server
 */
server.triggerError = (code, request, response) => {
    const { hostname, originalUrl } = request;
    const host = formatHostname(hostname);
    const path = originalUrl.split("?")[0];
    const callback = errors[host] ? errors[host][code] : null;

    request.params = {};
    response.status(code);

    if (callback instanceof Function) callback(request, response);
    else response.send("<title>" + code + "</title><h1>" + code + "</h1><p>An error occurred while accessing <u>" + path + "</u>.</p>");

    return server;
};

/**
 * Loop through each website on the server.
 * @param {Function|null} callback The callback triggered for each website.
 * @returns The server
 */
server.each = (callback = null) => {
    if (callback instanceof Function) server.websites().then(websites => websites.map(website => callback(website)));
    return server;
};

/**
 * Allows you to use functions requiring a host. This removes the host parameter from the functions as the host specified will be used.
 * @param {String} host The host for the functions.
 * @returns An object of functions for the specified host.
 */
server.host = host => {
    const object = {
        /**
         * Trigger a callback whenever a file of the specified extention(s) is requested.
         * @param {String|Array<String>} extentions The extention(s) to listen for.
         * @param {Function|null} callback The callback if a file is found.
         * @returns An object of functions for the specified host.
         */
        static: (extentions, callback = null) => {
            server.static(extentions, host, callback);
            return object;
        },
        /**
         * Trigger a callback when the host requested.
         * @param {Function|null} callback The callback if the host is requested.
         * @returns An object of functions for the specified host.
         */
        use: (callback = null) => {
            server.use(host, callback);
            return object;
        },
        /**
         * Trigger a callback whenever the specified page is requested with the GET method.
         * @param {String} id The id of the page.
         * @param {Function|null} callback The callback if the page is requested.
         * @returns An object of functions for the specified host.
         */
        get: (id, callback = null) => {
            server.get(id, host, callback);
            return object;
        },
        /**
         * Trigger a callback whenever the specified page is requested with the POST method.
         * @param {String} id The id of the page.
         * @param {Function|null} callback The callback if the page is requested.
         * @returns An object of functions for the specified host.
         */
        post: (id, callback = null) => {
            server.post(id, host, callback);
            return object;
        },
        /**
         * Trigger a callback whenever the specified page is requested with the PUT method.
         * @param {String} id The id of the page.
         * @param {Function|null} callback The callback if the page is requested.
         * @returns An object of functions for the specified host.
         */
        put: (id, callback = null) => {
            server.put(id, host, callback);
            return object;
        },
        /**
         * Trigger a callback whenever the specified page is requested with the DELETE method.
         * @param {String} id The id of the page.
         * @param {Function|null} callback The callback if the page is requested.
         * @returns An object of functions for the specified host.
         */
        delete: (id, callback = null) => {
            server.delete(id, host, callback);
            return object;
        },
        /**
         * Trigger a callback whenever the specified page is requested with any method.
         * @param {String} id The id of the page.
         * @param {Function|null} callback The callback if the page is requested.
         * @returns An object of functions for the specified host.
         */
        all: (id, callback = null) => {
            server.all(id, host, callback);
            return object;
        },
        /**
         * Trigger a callback whenever the specified error is triggered.
         * @param {Number} code The code of the error.
         * @param {Function|null} callback The callback if the error occurs.
         * @returns An object of functions for the specified host.
         */
        error: (code, callback = null) => {
            server.error(code, host, callback);
            return object;
        }
    };

    return object;
};

module.exports = server;
