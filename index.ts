import sqlite3 from 'sqlite3'
import fs from 'fs';
import { Request, Response, NextFunction, Router } from 'express';

let db: sqlite3.Database;

function init(DBpath: string) {
    initDb(DBpath);
    console.log("Log module initialized");
    const router = Router();
    router.use(expressLog);
    router.get("/logData", getLogData);
    return router;
}

interface LogEntry {
    method: string;
    url: string;
    ip: string;
    referer: string;
    status: number;
    time: string;
    duration: number;
}
const regex = /\/log/;

function expressLog(req: Request, res: Response, next: NextFunction) {
    if (regex.test(req.url)) {
        next();
    }
    else {
        let requestTime = getTimezoneTime();
        res.on('finish', function () {
            db.all("INSERT INTO log (method, url, ip, referer, status, time, duration) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [req.method,
                req.url,
                req.ip,
                req.get("Referer"),
                res.statusCode,
                requestTime.toISOString().replace("T", " ").slice(0, 19),
                getTimezoneTime().getTime() - requestTime.getTime()],
                (err: Error | null) => {
                    if (err) {
                        console.error(err.message);
                    }
                });
        });
        next();
    }
}

function initDb(path: string) {
    sqlite3.verbose();
    try {
        mkDir(path);
        db = new sqlite3.Database(path.replace("/", "") + '/log.db');
        console.log('Connected to the log database.');

        db.serialize(() => {
            db.run("CREATE TABLE IF NOT EXISTS log (method TEXT, url TEXT, ip TEXT, referer TEXT, status INTEGER, time TEXT, duration INTEGER)");
            console.log("Table created");
        });
        console.log("Database initialized");
    } catch (err) {
        console.error('Database initialization error:', err instanceof Error ? err.message : err);
        throw err;
    }
}

function getLogData(req: Request, res: Response) {
    const query = req.query;
    try {
        db.serialize(() => {
            let validQueries: Partial<Record<keyof LogEntry, any>> = {};
            const limit = Number(query.limit) || 13;
            const page = Number(query.page) || 0;
            if (query) {
                validQueries = getRealQuery(query);
            }
            if (Object.keys(validQueries).length > 0) {
                db.all(`SELECT * FROM log 
                    WHERE ${Object.keys(validQueries).map((key) => `${key} = ?`).join(' AND ')}
                    ORDER BY time DESC
                    LIMIT ${limit} OFFSET ${page * limit}`,
                    Object.values(validQueries),
                    (err, result) => generateHtml(err, result as LogEntry[], res, Object.keys(query).length == 0 ? true : false));

            } else {
                db.all(`SELECT * FROM log 
                    ORDER BY time DESC
                    LIMIT ${limit} OFFSET ${page * limit}`,
                    [],
                    (err, result) => generateHtml(err, result as LogEntry[], res, Object.keys(query).length == 0 ? true : false));
            }
        });
    } catch (error) {
        console.error('Error generating HTML:', error instanceof Error ? error.message : error);
    }
}

function generateHtml(err: Error | null, result: LogEntry[], res: Response, firth: boolean) {
    if (err) {
        console.error(err.message);
        return;
    }
    if (!firth) {
        res.send({
            rows: result
        })
        return;
    }
    let rows: LogEntry[] = [];
    rows.push(...result);
    const styles = fs.readFileSync('./utils/logData.css', 'utf8');
    const js = fs.readFileSync('./utils/logData.js', 'utf8');
    let html = `
        <!DOCTYPE html>
        <html lang="en">

        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>api-log</title>
        </head>
        <style>
            ${styles}
        </style>
        <body>
            <div class="logs-controls">
                <form id="searchForm" class="logs-search" onsubmit="event.preventDefault(); searchLogs();">
                    <div class="search-grid">
                        <input type="text" name="method" placeholder="Method (GET/POST/...)" class="search-input"
                            data-filter="method">
                        <input type="text" name="url" placeholder="URL" class="search-input" data-filter="url">
                        <input type="number" name="status" placeholder="状态码" class="search-input" data-filter="status">
                        <input type="text" name="ip" placeholder="IP地址" class="search-input" data-filter="ip">
                        <input type="text" name="referer" placeholder="来源页" class="search-input" data-filter="referer">
                        <button class="search-btn">
                            🔍 搜索
                        </button>
                        <button type="reset" class="reset-btn" onclick="location.reload();">
                            🧹 重置
                        </button>
                    </div>
                </form>
                <div class="table-container">
                    <table class="stunning-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>URL</th>
                                <th>IP</th>
                                <th>Referer</th>
                                <th>Status</th>
                                <th>Time</th>
                                <th>Duration</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map((rows: LogEntry) => `<tr>
                                    <td class="method-cell" data-method="${rows.method}">${rows.method}</td>
                                    <td>${rows.url}</td>
                                    <td>${rows.ip}</td>
                                    <td>${rows.referer}</td>
                                    <td class="status-cell" data-status="${rows.status}">${rows.status}</td>
                                    <td>${rows.time}</td>
                                    <td>${rows.duration + "ms"}</td>
                                </tr>
                                `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="pagination">
                    <button id="prevPage" class="page-btn">← 上一页</button>
                    <span id="currentPage" class="page-info">第1页</span>
                    <button id="nextPage" class="page-btn">下一页 →</button>
                </div>
            </div>
        </body>
        <script>
            ${js}
        </script>
        </html>`;

    res.send(html);
}

function getRealQuery(query: any): any {
    const logEntryTypes: Record<keyof LogEntry, string> = {
        method: 'string',
        url: 'string',
        ip: 'string',
        referer: 'string',
        status: 'number',
        time: 'string',
        duration: 'number'
    };

    const validQueries: Partial<Record<keyof LogEntry, any>> = {};

    for (const [key, value] of Object.entries(query)) {
        if (key in logEntryTypes) {
            const typedKey = key as keyof LogEntry;
            if (logEntryTypes[typedKey] === 'number') {
                const numValue = Number(value);
                if (!isNaN(numValue)) {
                    validQueries[typedKey] = numValue;
                }
            } else {
                validQueries[typedKey] = value;
            }
        }
    }

    return validQueries;
}

function getTimezoneTime(): Date {
    return new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60 * 1000);
}

function mkDir(path: string) {
    if (!fs.existsSync(path.replace("/", "") + '/')) {
        fs.mkdirSync(path.replace("/", "") + '/', { recursive: true });
    }
}

export default init;