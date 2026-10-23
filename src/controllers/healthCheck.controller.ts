import http from "http"

const healthCheck = (req:http.IncomingMessage, res:http.ServerResponse) => {
    if (req.method == 'GET' && req.url == "/health") {
        res.writeHead(200, { "content-type": 'text/plain' });
        res.end("Server is Healthy");
    } else {
        res.writeHead(404, { "content-type": 'text/plain' })
        res.end("Content not found");
    }
}

export {healthCheck}