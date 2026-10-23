import http from "http"
import fs from "fs/promises"

const getAllExpenses = async (req:http.IncomingMessage,res:http.ServerResponse) =>{
if(req.method=='GET' && req.url=='/expenses'){
    try {
        const rawExpenses = await fs.readFile('src/data/expenses.json','utf-8');
        const expenses = JSON.parse(rawExpenses);
        res.writeHead(200, { "content-type":'application/json;charset=utf-8'})
        res.end(JSON.stringify(expenses))
    } catch (error) {
              console.log("Something went wrong in getting expenses"+error)
              res.writeHead(500, { "content-type": 'text/plain', "content-encoding": "utf-8" })
              res.end("Something went wrong in getting expenses");
    }

}

}

export {getAllExpenses}

