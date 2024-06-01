import express from "express";
import logger from "morgan";
import { Server } from "socket.io";
import { createServer } from "node:http";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

dotenv.config();

const port = process.env.PORT ?? 3000;

const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {},
});

// Configurar la conexión a la base de datos
const db = createClient({
  url: "libsql://chat-kjoab-hub.turso.io",
  authToken: process.env.DB_TOKEN,
});

await db.execute(
  "CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, )"
);

// Configurar el servidor de sockets
io.on("connection", async (socket) => {
  console.log("Usuario conectado");

  socket.on("disconnect", () => {
    console.log("Usuario desconectado");
  });

  socket.on("chat message", async (msg) => {
    let result;
    try {
      result = await db.execute({
        sql: "Insert into messages (content) values(:msg)",
        args: { msg },
      });
    } catch (e) {
      console.error(e);
      return;
    }

    io.emit("chat message", msg, result.lastInsertRowid.toString());
  });

  if (!socket.recovered) {
    try {
      const results = await db.execute({
        sql: "SELECT id, content FROM messages WHERE id >?",
        args: [socket.handshake.auth.serverOffSet ?? 0],
      });

      results.forEach((row) => {
        socket.emit("chat message", row.content, row.id.toString());
      });
    } catch (e) {
      console.error(e);
      return;
    }
  }
});

app.use(logger("dev"));

app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/client/index.html");
});

server.listen(port, () => {
  console.log(`Servidor corriendo en :${port}`);
});
