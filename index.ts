import { createServer } from "node:http";
import process from "node:process";

try{
    // load env variables, can also use dotenv but avoided that to get bare experience of node
    process.loadEnvFile('.env');
}
catch(err){
    console.log("ENV file failed to load: For detailed error check error stack " +err);
}

const server = createServer((req, res) => {
    if (req.method=='GET' && req.url == "/health") {
        res.writeHead(200,{"content-type":'text/plain'});
        res.end("Server is Healthy");
    }else{
        res.writeHead(404,{"content-type":'text/plain'})
        res.end("Content not found");
    }
})

const serverPort = Number(process.env['PORT']) || 5000
const host = "localhost"


server.listen(serverPort, host, () => {
    console.log(`Server is running at http://${host}:${serverPort}/`);
})