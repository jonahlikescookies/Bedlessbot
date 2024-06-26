import { join } from "path";
import { FetchPage } from "./api";
import { fileURLToPath } from "bun";

const __dirname = fileURLToPath(new URL(".", import.meta.url).toString());

const indexLocation = "index.html";
const scriptLocation = "script.ts";

// build script
const script = await (
    await Bun.build({
        entrypoints: [join(__dirname, scriptLocation)],
        minify: true
    })
).outputs[0].text();

const requestCounts = new Map<string, number>();

const server = Bun.serve({
    async fetch(req) {
        const path = new URL(req.url).pathname;
        const ip = server.requestIP(req);

        if (!ip) {
            return new Response("Invalid IP", { status: 400 });
        }

        if (!requestCounts.has(ip.address)) {
            requestCounts.set(ip.address, 0);
        }

        const currentCount = requestCounts.get(ip.address) as number;
        if (currentCount > 30) {
            return new Response("Rate limit exceeded", {
                status: 429
            });
        }

        requestCounts.set(ip.address, currentCount + 1);
        setTimeout(() => {
            const newCount = (requestCounts.get(ip.address) ?? 1) - 1;
            requestCounts.set(ip.address, newCount);
        }, 30 * 1000); // Remove one after half a minute

        const allowedPaths = ["/", "/script.js", "/style.css", "/favicon.ico", "/icon.gif", "/Noto_Sans_Caucasian_Albanian/NotoSansCaucasianAlbanian-Regular.ttf", "/page"];

        if (!allowedPaths.includes(path)) {
            return new Response("Not found", {
                status: 404
            });
        }

        if (path === "/") {
            return new Response(Bun.file(join(__dirname, indexLocation)));
        }

        if (path === "/script.js") {
            return new Response(script, {
                headers: { "Content-Type": "application/javascript" }
            });
        }

        if (path === "/page") {
            // get the page number from the query string
            const urlObj = new URL(req.url);
            const pageNum = urlObj.searchParams.has("page") ? parseInt(urlObj.searchParams.get("page") as string) : 1;

            // fetch the page
            const page = await FetchPage(pageNum);
            if (!page) {
                return new Response("Invalid page number", { status: 400 });
            }

            return new Response(JSON.stringify(page), {
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response(Bun.file(join(__dirname, path)));
    },

    port: 8146
});

console.log(`Server started at ${server.url}`);
