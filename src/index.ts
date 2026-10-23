import { createServer } from "http";
import process from "node:process";

import { healthCheck } from "./controllers/healthCheck.controller.ts";
import { getAllExpenses } from "./controllers/expense.controller.ts";

try{
    // load env variables, can also use dotenv but avoided that to get bare experience of node
    process.loadEnvFile('.env');
}
catch(err){
    console.log("ENV file failed to load: For detailed error check error stack " +err);
}

const server = createServer()

server.on('request',healthCheck);
server.on('request',getAllExpenses);

const serverPort = Number(process.env['PORT']) || 5000
const host = "localhost"


server.listen(serverPort, host, () => {
    console.log(`Server is running at http://${host}:${serverPort}/`);
})