import { createServer } from "http";
import process from "node:process";

import { healthCheck } from "./controllers/healthCheck.controller.ts";
import { getAllExpenses, getExpenseById ,getExpenseSummary, postExpenses, type filter ,patchExpenseById, deleteExpenseById} from "./controllers/expense.controller.ts";

try{
    // load env variables, can also use dotenv but avoided that to get bare experience of node
    process.loadEnvFile('.env');
}
catch(err){
    console.log("ENV file failed to load: For detailed error check error stack " +err);
}

const server = createServer(async (req, res) => {
    try {
        
        const url = new URL(req.url ?? "/", "http://localhost");
        const path = url.pathname;   

        if (req.method === "GET" && path === "/health") {
            return healthCheck(req, res);
        }
        if (req.method === "GET" && path === "/expenses") {
            const categoryFilter = url.searchParams.get('category');
            const dateFilter = url.searchParams.get('date');
            let filters:filter = {
                categoryFilter:categoryFilter,
                dateFilter:dateFilter
            }
            return await getAllExpenses(req, res,filters);
        }

        if(req.method ==="POST" && path==="/expenses"){
            return postExpenses(req,res);
        }    
        if (req.method === "GET" && path === "/summary") {
            return await getExpenseSummary(req, res);
        }

        const match = path.match(/^\/expenses\/([^/]+)$/);
        if (req.method === "GET" && match) {
            return await getExpenseById(req, res, match[1] as string);
        }
        if (req.method === "PATCH" && match) {
            return await patchExpenseById(req, res, match[1] as string);
        }
        if (req.method === "DELETE" && match) {
            return await deleteExpenseById(req, res, match[1] as string);
        }

        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not Found");
    } catch (error) {
        console.error("Request failed:", error);
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end("Internal Server Error");
    }
});

const serverPort = Number(process.env['PORT']) || 5000
const host = "localhost"


server.listen(serverPort, host, () => {
    console.log(`Server is running at http://${host}:${serverPort}/`);
})