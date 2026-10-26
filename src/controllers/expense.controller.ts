import http, { IncomingMessage, ServerResponse } from "http"
import fs from "fs/promises"
import path from "path"
import crypto from "node:crypto"

interface Expense {
    id: string;
    title: string;
    amount: number;
    category: string;
    date: string;
    createdAt: string;
}
type filter = {
    categoryFilter: string | null,
    dateFilter: string | null
}

const dataFilePath = path.join(process.cwd(), "/src/data/expenses.json");

const getAllExpenses = async (req: http.IncomingMessage, res: http.ServerResponse, filters: filter) => {
    const rawExpenses = await fs.readFile(dataFilePath, 'utf-8');
    const expenses: Expense[] = JSON.parse(rawExpenses);

    let filteredExpenses: Expense[] = [];
    if (filters.categoryFilter == null && filters.dateFilter == null) {
        filteredExpenses = expenses
    } else if (filters.categoryFilter != null && filters.dateFilter == null) {
        filteredExpenses = expenses.filter((element) => element.category == filters.categoryFilter)
    }
    else if (filters.categoryFilter == null && filters.dateFilter != null) {
        filteredExpenses = expenses.filter((element) => element.date == filters.dateFilter)
    }
    else {

        filteredExpenses = expenses.filter((element) => element.category == filters.categoryFilter && element.date == filters.dateFilter)
    }
    res.writeHead(200, { "content-type": 'application/json;charset=utf-8' })
    res.end(JSON.stringify(filteredExpenses))

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


const postExpenses = (req: IncomingMessage, res: http.ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
    });

    req.on("end", async () => {
        try {
            let parsed: unknown;
            try {
                parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            } catch {
                res.writeHead(400, { "content-type": "text/plain;charset=utf-8" });
                return res.end("Invalid JSON");
            }
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                res.writeHead(400, { "content-type": "text/plain;charset=utf-8" });
                return res.end("Body must be a JSON object");
            }
            const input = parsed as Record<string, unknown>;

            // Copy only known client-settable fields; everything else is dropped.
            const FIELDS = ["title", "amount", "category", "date"] as const;
            const fields: Record<string, unknown> = {};
            for (const key of FIELDS) {
                const value = input[key];
                if (value === undefined) {
                    res.writeHead(400, { "content-type": "text/plain;charset=utf-8" });
                    return res.end(`${key} is required`);
                }
                let valid: boolean;
                switch (key) {
                    case "title":
                    case "category":
                        valid = typeof value === "string" && value.trim() !== "";
                        break;
                    case "amount":
                        valid = typeof value === "number" && Number.isFinite(value) && value >= 0;
                        break;
                    case "date":
                        valid = typeof value === "string" && !Number.isNaN(Date.parse(value));
                        break;
                }
                if (!valid) {
                    res.writeHead(400, { "content-type": "text/plain;charset=utf-8" });
                    return res.end(`${key} is invalid`);
                }
                fields[key] = value;
            }

            const expense = {
                ...fields,
                id: crypto.randomUUID(),
                createdAt: new Date().toISOString(),
            } as Expense;

            const rawExpenses = await fs.readFile(dataFilePath, "utf-8");
            const expenses: Expense[] = JSON.parse(rawExpenses);
            expenses.push(expense);

            const tmp = `${dataFilePath}.tmp`;
            await fs.writeFile(tmp, JSON.stringify(expenses), "utf-8");
            await fs.rename(tmp, dataFilePath);

            res.writeHead(201, { "content-type": "application/json;charset=utf-8" });
            res.end(JSON.stringify(expense));
        } catch (error) {
            console.error("POST expense failed", error);
            res.writeHead(500, { "content-type": "text/plain;charset=utf-8" });
            res.end("post failed");
        }
    });
};

const patchExpenseById = (req: IncomingMessage, res: http.ServerResponse, id: string) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
    });

    req.on("end", async () => {
        try {
            let parsed: unknown;
            try {
                parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            } catch {
                res.writeHead(400, { "content-type": "text/plain;charset=utf-8" });
                return res.end("Invalid JSON");
            }
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                res.writeHead(400, { "content-type": "text/plain;charset=utf-8" });
                return res.end("Body must be a JSON object");
            }
            const input = parsed as Record<string, unknown>;

            // Only known fields are accepted, and only those present are validated.
            const FIELDS = ["title", "amount", "category", "date"] as const;
            const fields: Record<string, unknown> = {};
            for (const key of FIELDS) {
                const value = input[key];
                if (value === undefined) continue;
                let valid: boolean;
                switch (key) {
                    case "title":
                    case "category":
                        valid = typeof value === "string" && value.trim() !== "";
                        break;
                    case "amount":
                        valid = typeof value === "number" && Number.isFinite(value) && value >= 0;
                        break;
                    case "date":
                        valid = typeof value === "string" && !Number.isNaN(Date.parse(value));
                        break;
                }
                if (!valid) {
                    res.writeHead(400, { "content-type": "text/plain;charset=utf-8" });
                    return res.end(`${key} is invalid`);
                }
                fields[key] = value;
            }
            if (Object.keys(fields).length === 0) {
                res.writeHead(400, { "content-type": "text/plain;charset=utf-8" });
                return res.end("No valid fields to update");
            }

            const rawExpenses = await fs.readFile(dataFilePath, "utf-8");
            const expenses: Expense[] = JSON.parse(rawExpenses);
            const expenseIndex = expenses.findIndex((e) => e.id === id);

            if (expenseIndex === -1) {
                res.writeHead(404, { "content-type": "application/json;charset=utf-8" });
                return res.end(JSON.stringify({ error: "Expense not found" }));
            }

            expenses[expenseIndex] = { ...expenses[expenseIndex], ...fields } as Expense;

            const tmp = `${dataFilePath}.tmp`;
            await fs.writeFile(tmp, JSON.stringify(expenses), "utf-8");
            await fs.rename(tmp, dataFilePath);

            res.writeHead(200, { "content-type": "application/json;charset=utf-8" });
            res.end(JSON.stringify(expenses[expenseIndex]));
        } catch (error) {
            console.error("PATCH expense failed", error);
            res.writeHead(500, { "content-type": "text/plain;charset=utf-8" });
            res.end("patch failed");
        }
    });
};

const deleteExpenseById = async(req:IncomingMessage, res:ServerResponse,id:string)=>{
    try {
        const rawExpenses = await fs.readFile(dataFilePath, "utf-8");
        const expenses: Expense[] = JSON.parse(rawExpenses);
        const newExpenses:Expense[] = expenses.filter((expense)=>expense.id !== id)
        
        const tmp = `${dataFilePath}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(expenses), "utf-8");
        await fs.rename(tmp, dataFilePath);
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(newExpenses));
        
    } catch (error) {
        console.error("Delete expense failed", error);
        res.writeHead(500, { "content-type": "text/plain;charset=utf-8" });
        res.end("Delete failed");
    }

}



export { getAllExpenses, getExpenseById, getExpenseSummary, type filter, postExpenses, patchExpenseById, deleteExpenseById}
