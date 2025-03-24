"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var sqlite3_1 = require("sqlite3");
var fs_1 = require("fs");
var path_1 = require("path");
var express_1 = require("express");
var db;
function init(DBpath) {
    initDb(DBpath);
    console.log("Log module initialized");
    var router = (0, express_1.Router)();
    router.use(expressLog);
    router.get("/logData", getLogData);
    return router;
}
var regex = /\/log/;
function expressLog(req, res, next) {
    if (regex.test(req.url)) {
        next();
    }
    else {
        var requestTime_1 = getTimezoneTime();
        res.on('finish', function () {
            db.all("INSERT INTO log (method, url, ip, referer, status, time, duration) VALUES (?, ?, ?, ?, ?, ?, ?)", [req.method,
            req.url,
            req.ip,
            req.get("Referer"),
            res.statusCode,
            requestTime_1.toISOString().replace("T", " ").slice(0, 19),
            getTimezoneTime().getTime() - requestTime_1.getTime()], function (err) {
                if (err) {
                    console.error(err.message);
                }
            });
        });
        next();
    }
}
function initDb(path) {
    sqlite3_1.verbose();
    try {
        mkDir(path);
        db = new sqlite3_1.Database(path.replace("/", "") + '/log.db');
        console.log('Connected to the log database.');
        db.serialize(function () {
            db.run("CREATE TABLE IF NOT EXISTS log (method TEXT, url TEXT, ip TEXT, referer TEXT, status INTEGER, time TEXT, duration INTEGER)");
            console.log("Table created");
        });
        console.log("Database initialized");
    }
    catch (err) {
        console.error('Database initialization error:', err instanceof Error ? err.message : err);
        throw err;
    }
}
function getLogData(req, res) {
    var query = req.query;
    try {
        db.serialize(function () {
            var validQueries = {};
            var limit = Number(query.limit) || 13;
            var page = Number(query.page) || 0;
            if (query) {
                validQueries = getRealQuery(query);
            }
            if (Object.keys(validQueries).length > 0) {
                db.all("SELECT * FROM log \n                    WHERE ".concat(Object.keys(validQueries).map(function (key) { return "".concat(key, " = ?"); }).join(' AND '), "\n                    ORDER BY time DESC\n                    LIMIT ").concat(limit, " OFFSET ").concat(page * limit), Object.values(validQueries), function (err, result) { return generateHtml(err, result, res, Object.keys(query).length == 0 ? true : false); });
            }
            else {
                db.all("SELECT * FROM log \n                    ORDER BY time DESC\n                    LIMIT ".concat(limit, " OFFSET ").concat(page * limit), [], function (err, result) { return generateHtml(err, result, res, Object.keys(query).length == 0 ? true : false); });
            }
        });
    }
    catch (error) {
        console.error('Error generating HTML:', error instanceof Error ? error.message : error);
    }
}
function generateHtml(err, result, res, firth) {
    if (err) {
        console.error(err.message);
        return;
    }
    if (!firth) {
        res.send({
            rows: result
        });
        return;
    }
    var rows = [];
    rows.push.apply(rows, result);
    var styles = fs_1.readFileSync(path_1.join(__dirname, './utils/logData.css'), 'utf8');
    var js = fs_1.readFileSync(path_1.join(__dirname, './utils/logData.js'), 'utf8');
    var html = "\n        <!DOCTYPE html>\n        <html lang=\"en\">\n\n        <head>\n            <meta charset=\"UTF-8\">\n            <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n            <title>api-log</title>\n        </head>\n        <style>\n            ".concat(styles, "\n        </style>\n        <body>\n            <div class=\"logs-controls\">\n                <form id=\"searchForm\" class=\"logs-search\" onsubmit=\"event.preventDefault(); searchLogs();\">\n                    <div class=\"search-grid\">\n                        <input type=\"text\" name=\"method\" placeholder=\"Method (GET/POST/...)\" class=\"search-input\"\n                            data-filter=\"method\">\n                        <input type=\"text\" name=\"url\" placeholder=\"URL\" class=\"search-input\" data-filter=\"url\">\n                        <input type=\"number\" name=\"status\" placeholder=\"\u72B6\u6001\u7801\" class=\"search-input\" data-filter=\"status\">\n                        <input type=\"text\" name=\"ip\" placeholder=\"IP\u5730\u5740\" class=\"search-input\" data-filter=\"ip\">\n                        <input type=\"text\" name=\"referer\" placeholder=\"\u6765\u6E90\u9875\" class=\"search-input\" data-filter=\"referer\">\n                        <button class=\"search-btn\">\n                            \uD83D\uDD0D \u641C\u7D22\n                        </button>\n                        <button type=\"reset\" class=\"reset-btn\" onclick=\"location.reload();\">\n                            \uD83E\uDDF9 \u91CD\u7F6E\n                        </button>\n                    </div>\n                </form>\n                <div class=\"table-container\">\n                    <table class=\"stunning-table\">\n                        <thead>\n                            <tr>\n                                <th>Method</th>\n                                <th>URL</th>\n                                <th>IP</th>\n                                <th>Referer</th>\n                                <th>Status</th>\n                                <th>Time</th>\n                                <th>Duration</th>\n                            </tr>\n                        </thead>\n                        <tbody>\n                            ").concat(rows.map(function (rows) { return "<tr>\n                                    <td class=\"method-cell\" data-method=\"".concat(rows.method, "\">").concat(rows.method, "</td>\n                                    <td>").concat(rows.url, "</td>\n                                    <td>").concat(rows.ip, "</td>\n                                    <td>").concat(rows.referer, "</td>\n                                    <td class=\"status-cell\" data-status=\"").concat(rows.status, "\">").concat(rows.status, "</td>\n                                    <td>").concat(rows.time, "</td>\n                                    <td>").concat(rows.duration + "ms", "</td>\n                                </tr>\n                                "); }).join(''), "\n                        </tbody>\n                    </table>\n                </div>\n                <div class=\"pagination\">\n                    <button id=\"prevPage\" class=\"page-btn\">\u2190 \u4E0A\u4E00\u9875</button>\n                    <span id=\"currentPage\" class=\"page-info\">\u7B2C1\u9875</span>\n                    <button id=\"nextPage\" class=\"page-btn\">\u4E0B\u4E00\u9875 \u2192</button>\n                </div>\n            </div>\n        </body>\n        <script>\n            ").concat(js, "\n        </script>\n        </html>");
    res.send(html);
}
function getRealQuery(query) {
    var logEntryTypes = {
        method: 'string',
        url: 'string',
        ip: 'string',
        referer: 'string',
        status: 'number',
        time: 'string',
        duration: 'number'
    };
    var validQueries = {};
    for (var _i = 0, _a = Object.entries(query); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], value = _b[1];
        if (key in logEntryTypes) {
            var typedKey = key;
            if (logEntryTypes[typedKey] === 'number') {
                var numValue = Number(value);
                if (!isNaN(numValue)) {
                    validQueries[typedKey] = numValue;
                }
            }
            else {
                validQueries[typedKey] = value;
            }
        }
    }
    return validQueries;
}
function getTimezoneTime() {
    return new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60 * 1000);
}
function mkDir(path) {
    if (!fs_1.existsSync(path.replace("/", "") + '/')) {
        fs_1.mkdirSync(path.replace("/", "") + '/', { recursive: true });
    }
}
module.exports = init;
