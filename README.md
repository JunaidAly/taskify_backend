Backend (Express + MongoDB)

Setup
- Copy `.env.example` to `.env` and set values for `MONGO_URI` and `JWT_SECRET`.
- Install dependencies: `npm install`
- Run dev server: `npm run dev`

API Endpoints
- `POST /api/auth/register` { name, email, password }
- `POST /api/auth/login` { email, password }
- `GET /api/auth/me` (JWT)
- `GET /api/tasks?status=&dueFrom=&dueTo=` (JWT)
- `POST /api/tasks` { title, description?, dueDate?, status? } (JWT)
- `POST /api/tasks/import` multipart/form-data: `file` (PDF/DOC/DOCX/TXT), `status?` — each non-empty line becomes a task (JWT)
- `PUT /api/tasks/:id` { title?, description?, dueDate?, status? } (JWT)
- `PATCH /api/tasks/:id/complete` (JWT)
- `DELETE /api/tasks/:id` (JWT)
- `PATCH /api/tasks/reorder` { updates: [{ id, status, order }] } (JWT)