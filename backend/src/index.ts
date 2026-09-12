import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth";
import { documentsRouter } from "./routes/documents";
import { uploadRouter } from "./routes/upload";
import { attachUser } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { attachCollabServer } from "./collab/server";

const app = express();
const PORT = process.env.PORT ?? 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(attachUser);

app.get("/health", (_req, res) => res.json({ success: true, data: { status: "ok" } }));

app.use("/auth", authRouter);
app.use("/documents", documentsRouter);
app.use("/documents", uploadRouter);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Not found" });
});

app.use(errorHandler);

const server = http.createServer(app);
attachCollabServer(server);

server.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  console.log(`Collaboration WebSocket available at ws://localhost:${PORT}/collab/:documentId`);
});
