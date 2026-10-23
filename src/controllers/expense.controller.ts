import http from "http"
import fs from "fs/promises"
import path from "path"

interface Expense {
    id: string;
    title: string;
    amount: number;
    category: string;
    date: string;
    createdAt: string;
}

const dataFilePath = path.join(process.cwd(),"/src/data/expenses.json");

const getAllExpenses = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const rawExpenses = await fs.readFile(dataFilePath, 'utf-8');
    const expenses = JSON.parse(rawExpenses);
    res.writeHead(200, { "content-type": 'application/json;charset=utf-8' })
    res.end(JSON.stringify(expenses))

}


const getExpenseById = async (req: http.IncomingMessage, res: http.ServerResponse, id: string) => {
    const rawExpenses = await fs.readFile(dataFilePath, "utf-8");
    const expenses: Expense[] = JSON.parse(rawExpenses);
    const expense = expenses.find((e) => e.id === id);

    if (!expense) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Expense not found" }));
        return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(expense));
};

const getExpenseSummary = async (req: http.IncomingMessage, res: http.ServerResponse) => {


    const rawExpenses = await fs.readFile(dataFilePath, 'utf-8');
    const expenses = JSON.parse(rawExpenses) as Expense[]

    const summary: { category: string, expense: number }[] = [];

    expenses.forEach((ele) => {
        const cat = ele.category
        const exp = ele.amount
        const existing = summary.find((s) => s.category === cat)
        if (existing) {
            existing.expense = Math.round((existing.expense + exp) * 100) / 100
        } else {
            summary.push({ category: cat, expense: exp })
        }
    })

    res.writeHead(200, { "content-type": 'application/json;charset=utf-8' })
    res.end(JSON.stringify(summary))


}



export { getAllExpenses, getExpenseById, getExpenseSummary }

