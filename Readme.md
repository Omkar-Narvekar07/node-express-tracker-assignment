# Node Expense Tracker

An HTTP server for recording and managing personal expenses, built with TypeScript, ES Modules and Node.js's built-in `http` module (no frameworks). Expenses are persisted to a JSON file.

## Features

- Add, view, update and delete expenses
- Filter expenses by category and date range
- Spending summary: overall total and total per category
- Input validation and consistent error responses

## Requirements

- Node.js 22.18 or later (runs `.ts` files natively and supports `process.loadEnvFile`)
- pnpm 12 (see `packageManager` in `package.json`)

## Setup

```bash
git clone <repository-url>
cd node-expense-tracker
pnpm install
```

Create a `.env` file in the project root:

```
PORT=3000
```

If `PORT` is missing or invalid, the server falls back to `5000`.

Make sure the data file exists and contains a JSON array:

```bash
echo "[]" > src/data/expenses.json
```

## Running

Start the server from the project root (the data file path is resolved from the current working directory):

```bash
pnpm dev
```

The server listens on `http://localhost:3000`.

Type-check without running:

```bash
pnpm check
```

## Data model

| Field       | Type   | Set by | Notes                                        |
|-------------|--------|--------|----------------------------------------------|
| `id`        | string | server | UUID from `node:crypto`                      |
| `title`     | string | client | required, non-blank                          |
| `amount`    | number | client | required, must be greater than 0             |
| `category`  | string | client | required, non-blank                          |
| `date`      | string | client | required, format `YYYY-MM-DD`                |
| `createdAt` | string | server | ISO 8601 timestamp, set once on creation     |

`id` and `createdAt` cannot be set or changed by clients. Unknown fields in a request body are ignored and never stored.

## API

| Method | Path             | Description                          |
|--------|------------------|--------------------------------------|
| GET    | `/health`        | Server status                        |
| POST   | `/expenses`      | Add an expense                       |
| GET    | `/expenses`      | List expenses (optional filters)     |
| GET    | `/expenses/:id`  | Get one expense                      |
| PATCH  | `/expenses/:id`  | Update one or more fields            |
| DELETE | `/expenses/:id`  | Delete an expense                    |
| GET    | `/summary`       | Total spending and per-category totals |

### Health check

```bash
curl http://localhost:3000/health
```

```
Server is Healthy
```

### Create an expense

```bash
curl -X POST http://localhost:3000/expenses \
  -H "content-type: application/json" \
  -d '{"title":"Grocery shopping","amount":1840.5,"category":"Food","date":"2026-10-18"}'
```

Response `201 Created`:

```json
{
  "title": "Grocery shopping",
  "amount": 1840.5,
  "category": "Food",
  "date": "2026-10-18",
  "id": "14f1d2ff-7f6f-4f44-a0fa-4bbde2048126",
  "createdAt": "2026-10-26T02:56:10.000Z"
}
```

### List expenses

```bash
curl http://localhost:3000/expenses
```

Filters (all optional, combinable):

| Query parameter | Meaning                                              |
|-----------------|------------------------------------------------------|
| `category`      | Case-insensitive exact match                         |
| `startDate`     | Include expenses on or after this date (`YYYY-MM-DD`) |
| `endDate`       | Include expenses on or before this date (`YYYY-MM-DD`) |

```bash
# by category
curl "http://localhost:3000/expenses?category=food"

# by date range (inclusive)
curl "http://localhost:3000/expenses?startDate=2026-10-18&endDate=2026-10-22"

# combined
curl "http://localhost:3000/expenses?category=Food&startDate=2026-10-18&endDate=2026-10-20"
```

A malformed date, or a `startDate` later than `endDate`, returns `400`.

### Get an expense by ID

```bash
curl http://localhost:3000/expenses/<id>
```

Returns `404` if the expense does not exist.

### Update an expense

Send only the fields to change. At least one valid field is required.

```bash
curl -X PATCH http://localhost:3000/expenses/<id> \
  -H "content-type: application/json" \
  -d '{"amount":1500,"category":"Groceries"}'
```

Response `200 OK` with the full updated expense. Returns `404` if the expense does not exist.

### Delete an expense

```bash
curl -X DELETE http://localhost:3000/expenses/<id>
```

Response `200 OK` with the deleted expense. Returns `404` if the expense does not exist.

### Spending summary

```bash
curl http://localhost:3000/summary
```

```json
{
  "total": 5690.5,
  "count": 3,
  "byCategory": [
    { "category": "Food", "total": 1840.5 },
    { "category": "Transport", "total": 500 },
    { "category": "Utilities", "total": 3350 }
  ]
}
```

## Error responses

| Status | When                                                              |
|--------|-------------------------------------------------------------------|
| 400    | Invalid JSON, missing or invalid fields, invalid filter values    |
| 404    | Unknown route or expense ID                                       |
| 500    | Unexpected server error (details are logged, not returned)        |

## Project structure

```
src/
  index.ts                         server setup and routing
  controllers/
    expense.controller.ts          expense endpoints
    healthCheck.controller.ts      health endpoint
  data/
    expenses.json                  persisted expenses
```

## Notes and limitations

- Data is stored in a single JSON file that is rewritten on every change. Concurrent write requests can overwrite each other, so this is suitable for a single-user or demo setup only.
- The server must be started from the project root.