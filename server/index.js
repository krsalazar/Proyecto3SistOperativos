import express from "express";
import logger from "morgan";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";
import { Server } from "socket.io";
import { createServer } from "node:http";

// Se carga el archivo .env que contiene las variables de entorno a utilizar
dotenv.config();

// Se obtiene el puerto del sistema operativo o se asigna el puerto 3000
const port = process.env.PORT ?? 3000;

// Se crea una instancia de express y se le asigna la carpeta client como carpeta raíz
const app = express();
// Se establece la carpeta client como carpeta raíz
app.use(express.static("client"));
// Se crea una instancia de servidor HTTP y se le asigna la instancia de express
const server = createServer(app);
// Se crea una instancia de socket.io y se le asigna el servidor creado anteriormente
const io = new Server(server, {
  connectionStateRecovery: {},
});

// Se crea una instancia de la base de datos con la URL y el token de autenticación
const db = createClient({
  url: "libsql://chat-kjoab-hub.turso.io",
  authToken: process.env.DB_TOKEN,
});

// Función para inicializar la base de datos
const initializeDatabase = async () => {
  try {
    // Se ejecuta una consulta para crear la tabla messages si no existe
    await db.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT,
        user TEXT
      )
    `);
  } catch (error) {
    console.error("Database initialization failed:", error);
  }
};

// Se ejecuta la función de inicialización de la base de datos
initializeDatabase();

// Se establece un evento de conexión para socket.io
io.on("connection", async (socket) => {
  console.log("usuario conectado!");

  // Se obtiene el nombre de usuario del cliente o se asigna "Usuario Anónimo"
  const username = socket.handshake.auth.username || "Usuario Anónimo";

  // Se asigna el nombre de usuario al socket
  socket.auth = { username };

  // Se emite un mensaje de bienvenida a todos los clientes conectados
  io.emit("chat message", `${username} se ha conectado`, "", "Servidor");

  // Se establece un evento de desconexión para socket.io
  socket.on("disconnect", () => {
    console.log("an user has disconnected");
    // Se emite un mensaje de despedida a todos los clientes conectados
    io.emit(
      "chat message",
      // Se emite un mensaje de despedida a todos los clientes conectados
      `${socket.auth.username} se ha desconectado`,
      "",
      "Servidor"
    );
  });

  // Se establece un evento de mensaje para socket.io
  socket.on("chat message", async (msg) => {
    // Se declara una variable para almacenar el resultado de la consulta
    let result;
    const { message, username } = msg;

    // Se inserta el mensaje en la base de datos
    try {
      result = await db.execute({
        // Se hace uso de la función execute  para insertar un mensaje en la base de datos
        sql: "INSERT INTO messages (content, user) VALUES (?, ?)",
        args: [message, username],
      });
    } catch (e) {
      console.error(e);
      return;
    }

    // Se emite el mensaje a todos los clientes conectados
    io.emit(
      "chat message",
      // Se emite el mensaje a todos los clientes conectados
      message,
      result.lastInsertRowid.toString(),
      username
    );
  });

  // Se establece un evento de recuperación de mensajes para socket.io
  if (!socket.recovered) {
    // Se obtienen los mensajes de la base de datos
    try {
      const results = await db.execute({
        sql: "SELECT id, content, user FROM messages WHERE id > ?",
        args: [socket.handshake.auth.serverOffset ?? 0],
      });

      // Se emiten los mensajes a todos los clientes conectados
      results.rows.forEach((row) => {
        // Se emite el mensaje a todos los clientes conectados
        socket.emit("chat message", row.content, row.id.toString(), row.user);
      });
    } catch (e) {
      console.error(e);
    }
  }
});

// Se establece un middleware para el registro de peticiones HTTP
app.use(logger("dev"));

// Se establece una ruta para el archivo index.html
app.get("/", (req, res) => {
  //
  res.sendFile(process.cwd() + "/client/index.html");
});

// Se inicia el servidor en el puerto especificado
server.listen(port, () => {
  // Se imprime un mensaje en la consola
  console.log(`Server running on port ${port}`);
});
