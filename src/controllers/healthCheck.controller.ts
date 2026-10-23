import http from "node:http";

const healthCheck = (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("Server is Healthy");
};

export { healthCheck };