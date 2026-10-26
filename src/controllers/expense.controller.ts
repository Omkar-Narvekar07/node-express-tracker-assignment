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
    startDate: string | null,
    endDate: string | null
}


const dataFilePath = path.join(process.cwd(), "/src/data/expenses.json");

const getAllExpenses = async (req: http.IncomingMessage, res: http.ServerResponse, filters: filter) => {
    try {
        const datePattern = /^\d{4}-\d{2}-\d{2}$/;

        for (const [name, value] of [["startDate", filters.startDate], ["endDate", filters.endDate]] as const) {
            if (value !== null && (!datePattern.test(value) || Number.isNaN(Date.parse(value)))) {
                res.writeHead(400, { "content-type": "application/json;charset=utf-8" });
                return res.end(JSON.stringify({ error: `${name} must be a valid date in YYYY-MM-DD format` }));
            }
        }
        if (filters.startDate !== null && filters.endDate !== null && filters.startDate > filters.endDate) {
            res.writeHead(400, { "content-type": "application/json;charset=utf-8" });
            return res.end(JSON.stringify({ error: "startDate must not be after endDate" }));
        }

        const rawExpenses = await fs.readFile(dataFilePath, "utf-8");
        const expenses: Expense[] = JSON.parse(rawExpenses);

        const category = filters.categoryFilter?.trim().toLowerCase() || null;

        // ISO YYYY-MM-DD strings sort lexicographically, so string comparison is a valid range check.
        const filteredExpenses = expenses.filter((e) =>
            (category === null || e.category.toLowerCase() === category) &&
            (filters.startDate === null || e.date >= filters.startDate) &&
            (filters.endDate === null || e.date <= filters.endDate)
        );

        res.writeHead(200, { "content-type": "application/json;charset=utf-8" });
        res.end(JSON.stringify(filteredExpenses));
    } catch (error) {
        console.error("GET expenses failed", error);
        res.writeHead(500, { "content-type": "text/plain;charset=utf-8" });
        res.end("fetch failed");
    }
};



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
    try {
        const rawExpenses = await fs.readFile(dataFilePath, "utf-8");
        const expenses: Expense[] = JSON.parse(rawExpenses);

        const totals = new Map<string, number>();
        let total = 0;

        for (const e of expenses) {
            totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount);
            total += e.amount;
        }

        // Round once at the end so floating-point error does not accumulate per step.
        const byCategory = [...totals].map(([category, amount]) => ({
            category,
            total: Math.round(amount * 100) / 100,
        }));

        res.writeHead(200, { "content-type": "application/json;charset=utf-8" });
        res.end(JSON.stringify({
            total: Math.round(total * 100) / 100,
            count: expenses.length,
            byCategory,
        }));
    } catch (error) {
        console.error("GET summary failed", error);
        res.writeHead(500, { "content-type": "text/plain;charset=utf-8" });
        res.end("summary failed");
    }
};

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
                        valid = typeof value === "number" && Number.isFinite(value) && value > 0;
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

const deleteExpenseById = async (req: IncomingMessage, res: ServerResponse, id: string) => {
    try {
        const rawExpenses = await fs.readFile(dataFilePath, "utf-8");
        const expenses: Expense[] = JSON.parse(rawExpenses);
        const index = expenses.findIndex((e) => e.id === id);

        if (index === -1) {
            res.writeHead(404, { "content-type": "application/json;charset=utf-8" });
            return res.end(JSON.stringify({ error: "Expense not found" }));
        }

        const [deleted] = expenses.splice(index, 1);

        const tmp = `${dataFilePath}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(expenses), "utf-8");
        await fs.rename(tmp, dataFilePath);

        res.writeHead(200, { "content-type": "application/json;charset=utf-8" });
        res.end(JSON.stringify(deleted));
    } catch (error) {
        console.error("DELETE expense failed", error);
        res.writeHead(500, { "content-type": "text/plain;charset=utf-8" });
        res.end("delete failed");
    }
};



export { getAllExpenses, getExpenseById, getExpenseSummary, type filter, postExpenses, patchExpenseById, deleteExpenseById}
